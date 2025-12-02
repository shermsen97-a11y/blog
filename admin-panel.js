(function(){
  'use strict';
  // ====== State ======
  function normalizeBase(url) {
    if (!url) return window.location.origin;
    let base = url.trim().replace(/\/+$/, '').replace(/\/?api$/, '');
    return base;
  }
  let API_URL = normalizeBase(localStorage.getItem('apiUrl') || window.location.origin);
  let adminToken = sessionStorage.getItem('adminToken');
  let createMDE = null; let editMDE = null;
  const slugCache = new Map();
  let slugTimer = null;

  // ====== Helpers ======
  function authHeaders(extra={}) {
    const h = { 'Authorization': `Bearer ${adminToken}` };
    return { ...h, ...extra };
  }
  async function api(path, options={}) {
    const url = `${API_URL}${path.startsWith('/')?path:`/${path}`}`;
    const opts = { ...options };
    opts.headers = { ...(options.headers||{}), ...(opts.auth !== false ? authHeaders() : {}) };
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json().catch(()=>({}));
  }
  function showMessage(text, type) {
    const messageEl = document.getElementById('message') || document.getElementById('loginMessage');
    if (!messageEl) { alert(text); return; }
    messageEl.className = `alert alert-${type}`;
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    setTimeout(()=>{ messageEl.style.display='none'; }, 3500);
  }
  function slugify(str) {
    return (str||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
      .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
  }
  function toLocalISOString(dtStr) { // convert local datetime-local value to UTC iso
    const dt = new Date(dtStr); return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString();
  }

  // ====== Auth ======
  async function login() {
    const secret = document.getElementById('adminSecret').value.trim();
    if (!secret) { showMessage('Voer je admin secret in', 'error'); return; }
    try {
      const res = await fetch(`${API_URL}/api/admin/stats`, { headers:{ 'Authorization': `Bearer ${secret}` } });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.success) {
        sessionStorage.setItem('adminToken', secret); adminToken = secret;
        document.getElementById('adminSecret').value='';
        showAdminPanel(); loadDashboard(); showMessage('✅ Succesvol ingelogd','success');
      } else showMessage('❌ Ongeldig admin secret','error');
    } catch(e){ showMessage(`❌ Error: ${e.message}`,'error'); }
  }
  function logout(){ sessionStorage.removeItem('adminToken'); adminToken=null; document.getElementById('loginSection').style.display='flex'; document.getElementById('adminSection').style.display='none'; }
  function showAdminPanel(){ document.getElementById('loginSection').style.display='none'; document.getElementById('adminSection').style.display='flex'; }

  // ====== Tabs ======
  function showTab(tabName, ev){
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
    const tab = document.getElementById(tabName); if (tab) tab.classList.add('active');
    if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
    switch(tabName){
      case 'posts': loadPosts(); loadCategoriesAdminOptions(); break;
      case 'settings': loadSettings(); break;
      case 'upcoming': loadUpcomingAdmin(); break;
      case 'new-post': loadCategoriesAdminOptions(); break;
      case 'categories': loadCategoriesAdmin(); break;
      default: break;
    }
  }

  // ====== Dashboard ======
  async function loadDashboard(){
    try {
      const { stats } = await api('/api/admin/stats');
      const html = `<div class="stat-card"><div class="stat-label">📝 Total Posts</div><div class="stat-value">${stats?.totalPosts||0}</div></div>
      <div class="stat-card"><div class="stat-label">✅ Published</div><div class="stat-value">${stats?.publishedPosts||0}</div></div>
      <div class="stat-card"><div class="stat-label">📋 Drafts</div><div class="stat-value">${stats?.draftPosts||0}</div></div>`;
      document.getElementById('statsContainer').innerHTML = html;
    } catch(e){ console.warn('Stats error', e.message); }
  }

  // ====== Posts ======
  async function loadPosts(){
    try {
      const { posts=[] } = await api('/api/admin/posts');
      if (!posts.length){ document.getElementById('postsContainer').innerHTML='<p>Geen posts gevonden</p>'; return; }
      const rows = posts.map(p=>`<tr><td><strong>${p.title}</strong>${p.featured?'<span title="Featured" style="margin-left:6px;color:#f59e0b;">★</span>':''}</td>
        <td><span style="background:${p.status==='published'?'#dcfce7':'#fef3c7'};padding:4px 8px;border-radius:4px;">${p.status}</span></td>
        <td>${p.category||''}</td>
        <td>${new Date(p.createdAt||p.publishedDate||Date.now()).toLocaleDateString('nl-NL')}</td>
        <td>${p.status!=='published'?`<button class='btn btn-small btn-primary' onclick="publishPost('${p.id}')">Publish</button>`:`<button class='btn btn-small btn-secondary' onclick="unpublishPost('${p.id}')">Unpublish</button>`}
        <button class='btn btn-small btn-secondary' onclick="editPost('${p.id}')">Edit</button>
        <button class='btn btn-small' onclick="openSchedule('${p.id}')">Schedule</button>
        <button class='btn btn-small btn-danger' onclick="deletePost('${p.id}', '${(p.title||'').replace(/"/g,'&quot;')}')">Delete</button></td></tr>`).join('');
      document.getElementById('postsContainer').innerHTML = `<table><thead><tr><th>Title</th><th>Status</th><th>Category</th><th>Date</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch(e){ document.getElementById('postsContainer').innerHTML='<p>Fout bij laden posts</p>'; }
  }
  async function publishPost(id){ try { await api(`/api/admin/posts/${id}/publish`, { method:'PATCH' }); showMessage('✅ Post published','success'); loadPosts(); } catch(e){ showMessage('❌ Publish mislukt','error'); } }
  async function unpublishPost(id){ try { await api(`/api/admin/posts/${id}/unpublish`, { method:'PATCH' }); showMessage('✅ Post unpublished','success'); loadPosts(); } catch(e){ showMessage('❌ Unpublish mislukt','error'); } }
  async function openSchedule(id){ const when = prompt('Geplande publicatietijd (YYYY-MM-DDTHH:MM)'); if(!when) return; try { await api(`/api/admin/posts/${id}/schedule`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ scheduledPublishDate: when }) }); showMessage('✅ Publicatie gepland','success'); loadPosts(); } catch(e){ showMessage('❌ Planning mislukt','error'); } }
  async function deletePost(id, title){ if(!confirm(`Post "${title}" verwijderen?`)) return; try { await api(`/api/admin/posts/${id}`, { method:'DELETE' }); showMessage('✅ Post verwijderd','success'); loadPosts(); } catch(e){ showMessage('❌ Verwijderen mislukt','error'); } }

  async function createPost(ev){ ev.preventDefault(); const statusValue = (document.querySelector('input[name="postStatus"]:checked')||{}).value || 'draft'; const scheduledAt = document.getElementById('postSchedule').value; const post={ title:val('postTitle'), slug: val('postSlug')||slugify(val('postTitle')), excerpt:val('postExcerpt'), content:createMDE?createMDE.value():val('postContent'), category:val('postCategory'), image:val('postImage'), featured: document.getElementById('postFeatured').checked, status: statusValue==='published'?'published':'draft', scheduledPublishDate: (statusValue==='scheduled'&&scheduledAt)?toLocalISOString(scheduledAt):undefined };
    try { await api('/api/admin/posts',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(post) }); showMessage('✅ Post created','success'); ev.target.reset(); setTimeout(()=>showTab('posts'), 800); } catch(e){ showMessage(`❌ Fout: ${e.message}`,'error'); }
  }
  function val(id){ return (document.getElementById(id)?.value||'').trim(); }

  // ====== Slug validation (debounced) ======
  async function validateSlugUnique(slug, excludeId){ slug = slugify(slug); if(slugCache.get(slug) !== undefined) return slugCache.get(slug); try { const { posts=[] } = await api('/api/admin/posts'); const exists = posts.some(p=>p.slug===slug && p.id!==excludeId); slugCache.set(slug,!exists); const help=document.getElementById(excludeId? 'editSlugHelp':'slugHelp'); if(help){ if(exists){ help.textContent='❌ Slug bestaat al'; help.style.color='#991b1b'; } else { help.textContent='✅ Slug is uniek'; help.style.color='#166534'; } } return !exists; } catch { return true; } }
  function debounceValidate(slug, exclude){ clearTimeout(slugTimer); slugTimer=setTimeout(()=>validateSlugUnique(slug, exclude), 300); }

  // ====== Edit Modal ======
  async function editPost(id){ try { const { post } = await api(`/api/admin/posts/${id}`); fillEdit(post); document.getElementById('editModal').style.display='flex'; } catch(e){ showMessage(`❌ Error: ${e.message}`,'error'); } }
  function fillEdit(post){ setVal('editId',post.id); setVal('editTitle',post.title||''); setVal('editSlug',post.slug||''); setVal('editCategory',post.category||'Algemeen'); setVal('editImage',post.image||''); setVal('editExcerpt',post.excerpt||''); document.getElementById('editFeatured').checked=!!post.featured; const status = post.status==='published'?'published': (post.scheduledPublishDate?'scheduled':'draft'); document.querySelectorAll('input[name="editStatus"]').forEach(r=>r.checked = r.value===status);
    prepareDate('editSchedule', post.scheduledPublishDate); prepareDate('editPublishedDate', post.publishedDate); toggleEditSchedule(); if(editMDE){ editMDE.toTextArea(); editMDE=null; } editMDE = new window.SimpleMDE({ element: document.getElementById('editContent'), spellChecker:false, status:false }); editMDE.value(post.content||''); const editSlug=document.getElementById('editSlug'); editSlug.onblur=()=>{ editSlug.value=slugify(editSlug.value); debounceValidate(editSlug.value, post.id); } }
  function setVal(id,v){ const el=document.getElementById(id); if(el) el.value=v; }
  function prepareDate(id, iso){ const el=document.getElementById(id); if(!el) return; if(iso){ const dt=new Date(iso); el.value=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16); } else el.value=''; }
  function closeEditModal(){ document.getElementById('editModal').style.display='none'; }
  function toggleEditSchedule(){ const scheduleRadio=document.querySelector('input[name="editStatus"][value="scheduled"]'); const input=document.getElementById('editSchedule'); if(scheduleRadio?.checked){ input.style.display='inline-block'; } else { input.style.display='none'; } }
  async function saveEdit(ev){ ev.preventDefault(); const id=val('editId'); const title=val('editTitle'); const slug=slugify(val('editSlug')); const category=val('editCategory'); const image=val('editImage'); const excerpt=val('editExcerpt'); const featured=document.getElementById('editFeatured').checked; const status=(document.querySelector('input[name="editStatus"]:checked')||{}).value||'draft'; const scheduleLocal=val('editSchedule'); const publishedLocal=val('editPublishedDate'); const content= editMDE?editMDE.value():val('editContent'); if(!title||!content){ showMessage('❌ Titel en inhoud zijn verplicht','error'); return; } if(status==='scheduled' && !scheduleLocal){ showMessage('❌ Kies een geplande datum','error'); return; } const unique = await validateSlugUnique(slug, id); if(!unique){ showMessage('❌ Slug bestaat al','error'); return; }
    const payload={ title, slug, category, image, excerpt, content, featured }; if(status==='published'){ payload.status='published'; payload.publishedDate= publishedLocal? toLocalISOString(publishedLocal): new Date().toISOString(); payload.scheduledPublishDate= undefined; } else if(status==='scheduled'){ payload.status='draft'; payload.scheduledPublishDate = toLocalISOString(scheduleLocal); } else { payload.status='draft'; payload.scheduledPublishDate= undefined; payload.publishedDate= undefined; }
    try { await api(`/api/admin/posts/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); showMessage('✅ Post opgeslagen','success'); closeEditModal(); loadPosts(); } catch(e){ showMessage(`❌ Opslaan mislukt: ${e.message}`,'error'); }
  }

  // ====== Settings / Upcoming ======
  function saveSettings(){ const url = document.getElementById('apiUrl').value; const normalized = normalizeBase(url); localStorage.setItem('apiUrl', normalized); API_URL = normalized; showMessage('✅ Settings saved','success'); }
  function loadSettings(){ /* only local for now */ }
  async function loadUpcomingAdmin(){ try { const s = await api('/api/admin/settings'); const el=document.getElementById('upcomingText'); if(el) el.value = (s.settings?.upcomingText)||''; const { posts=[] } = await api('/api/admin/posts'); const drafts = posts.filter(p=>p.status!=='published').slice(0,20); const container=document.getElementById('draftSuggestions'); if(container){ container.innerHTML = drafts.map(d=>`<span style="display:inline-block;padding:6px 10px;border:1px solid #e2e8f0;border-radius:999px;cursor:pointer;background:#f8fafc;" onclick="appendUpcoming('${(d.title||'').replace(/'/g, "\\'")}')">${(d.title||'').replace(/</g,'&lt;')}</span>`).join(''); } } catch(e){ console.warn('Upcoming load error', e.message); } }
  async function saveUpcoming(){ const upcoming=(document.getElementById('upcomingText')?.value)||''; try { await api('/api/admin/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ upcomingText: upcoming }) }); showMessage('✅ Binnenkort opgeslagen','success'); } catch(e){ showMessage(`❌ Opslaan mislukt: ${e.message}`,'error'); } }
  function appendUpcoming(title){ const el=document.getElementById('upcomingText'); if(!el) return; el.value = (el.value? el.value.replace(/\s*$/,'')+'\n':'') + `${title} - `; el.focus(); }

  // ====== Connection Test ======
  async function testConnection(){ const base=(document.getElementById('apiUrl')?.value||API_URL).replace(/\/$/,''); const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),6000); try { const healthRes= await fetch(`${base}/api/health`, { signal: controller.signal }); if(!healthRes.ok){ showMessage(`❌ API onbereikbaar (${healthRes.status}) op ${base}`,'error'); clearTimeout(timeout); return; } let msg=`✅ API bereikbaar op ${base}`; if(adminToken){ const adminRes = await fetch(`${base}/api/admin/stats`, { headers:{'Authorization':`Bearer ${adminToken}`}, signal: controller.signal }); if(adminRes.ok){ const data= await adminRes.json().catch(()=>({})); msg += data.success? ' • ✅ Admin auth OK':' • ⚠️ Admin auth onbekend'; showMessage(msg, data.success? 'success':'info'); } else if([401,403].includes(adminRes.status)){ msg+=' • ❌ Admin auth ongeldig'; showMessage(msg,'error'); } else { msg+=` • ⚠️ Admin check fout (${adminRes.status})`; showMessage(msg,'info'); } } else { msg+=' • ℹ️ Geen admin token'; showMessage(msg,'info'); } } catch(err){ const reason = err.name==='AbortError'? 'timeout': err.message; showMessage(`❌ Verbindingsfout (${reason}) naar ${base}`,'error'); } finally { clearTimeout(timeout); } }

  // ====== Categories ======
  async function loadCategoriesAdmin(){ const container=document.getElementById('categoriesList'); if(container) container.innerHTML='<div class="loading"><div class="spinner"></div></div>'; try { const { categories=[] } = await api('/api/admin/categories/manage'); const rows = categories.sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<div style='display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #e2e8f0;'><div style='flex:1;font-weight:600;color:#0f172a;'>${c.name}</div><div style='width:100px;color:#64748b;text-align:right;'>${c.count} posts</div><button class='btn btn-small btn-secondary' onclick="promptRenameCategory('${c.name}')">Hernoem</button><button class='btn btn-small btn-danger' onclick="promptDeleteCategory('${c.name}')">Verwijder</button></div>`).join(''); if(container) container.innerHTML = rows || '<p style="color:#64748b;">Geen categorieën</p>'; await loadCategoriesAdminOptions(); } catch(e){ if(container) container.innerHTML = `<p style='color:#991b1b;'>Fout bij laden categorieën: ${e.message}</p>`; showMessage(`❌ Fout bij laden categorieën: ${e.message}`,'error'); } }
  async function loadCategoriesAdminOptions(){ const fallback=['Tips & Tricks','Case Studies','Horeca','Team Building','Onderwijs','Product Updates','Algemeen']; try { const { categories=[] } = await api('/api/admin/categories'); let names = categories.filter(c=>c!=='Nieuw...'); if(!names.length) names=fallback; populateCategorySelect('postCategory', names); populateCategorySelect('editCategory', names); } catch{ populateCategorySelect('postCategory', fallback); populateCategorySelect('editCategory', fallback); } }
  function populateCategorySelect(id,names){ const el=document.getElementById(id); if(!el) return; const current=el.value; el.innerHTML = names.map(n=>`<option value='${n}'>${n}</option>`).join(''); if(!current && names.length) el.value=names[0]; if(current && !names.includes(current)){ const opt=document.createElement('option'); opt.value=current; opt.textContent=current; el.appendChild(opt); el.value=current; } }
  async function addCategory(){ const name=(document.getElementById('newCategoryName')?.value||'').trim(); if(!name) return; try { await api('/api/admin/categories', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) }); document.getElementById('newCategoryName').value=''; await loadCategoriesAdmin(); showMessage('✅ Categorie toegevoegd','success'); } catch(e){ showMessage(`❌ Fout: ${e.message}`,'error'); } }
  function promptRenameCategory(oldName){ const newName = prompt(`Nieuwe naam voor "${oldName}"`, oldName); if(!newName || newName===oldName) return; renameCategory(oldName, newName); }
  async function renameCategory(oldName,newName){ try { await api(`/api/admin/categories/${encodeURIComponent(oldName)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ newName }) }); await loadCategoriesAdmin(); showMessage('✅ Categorie hernoemd','success'); } catch(e){ showMessage(`❌ Fout: ${e.message}`,'error'); } }
  function promptDeleteCategory(name){ const reassign = prompt(`Verwijder "${name}". Herschrijf posts naar categorie:`, 'Algemeen'); if(!reassign) return; deleteCategory(name, reassign); }
  async function deleteCategory(name,reassign){ try { await api(`/api/admin/categories/${encodeURIComponent(name)}?reassign=${encodeURIComponent(reassign)}`, { method:'DELETE' }); await loadCategoriesAdmin(); showMessage('✅ Categorie verwijderd','success'); } catch(e){ showMessage(`❌ Fout: ${e.message}`,'error'); } }

  // ====== Events / Init ======
  document.addEventListener('DOMContentLoaded', ()=>{
    if(adminToken){ showAdminPanel(); loadDashboard(); loadCategoriesAdminOptions(); }
    // slug events create
    const titleEl=document.getElementById('postTitle'); const slugEl=document.getElementById('postSlug');
    if(titleEl && slugEl){ titleEl.addEventListener('input',()=>{ if(!slugEl.value){ slugEl.value=slugify(titleEl.value); debounceValidate(slugEl.value); } }); slugEl.addEventListener('blur',()=>{ slugEl.value=slugify(slugEl.value); debounceValidate(slugEl.value); }); }
    // schedule toggle create
    const scheduleRadio=document.querySelector('input[name="postStatus"][value="scheduled"]'); const scheduleInput=document.getElementById('postSchedule');
    function toggleSchedule(){ if(scheduleRadio?.checked){ scheduleInput.style.display='inline-block'; } else { scheduleInput.style.display='none'; scheduleInput.value=''; } }
    document.querySelectorAll('input[name="postStatus"]').forEach(r=> r.addEventListener('change', toggleSchedule)); toggleSchedule();
    // SimpleMDE init create
    if(window.SimpleMDE){ const el=document.getElementById('postContent'); if(el){ createMDE = new window.SimpleMDE({ element: el, spellChecker:false, status:false }); } }
    document.addEventListener('change',(e)=>{ if(e.target?.name==='editStatus') toggleEditSchedule(); });
    // Note: Forms use inline onsubmit handlers in HTML, no need to bind here
  });

  // ====== Expose to window for inline handlers ======
  Object.assign(window, { login, logout, showTab, publishPost, unpublishPost, openSchedule, deletePost, createPost, editPost, closeEditModal, saveEdit, saveSettings, testConnection, loadUpcomingAdmin, saveUpcoming, appendUpcoming, loadCategoriesAdmin, addCategory, promptRenameCategory, renameCategory, promptDeleteCategory, deleteCategory });
})();