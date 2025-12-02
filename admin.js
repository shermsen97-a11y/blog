/**
 * Admin Routes for PubQuiz Blog Backend
 * 
 * Provides endpoints for managing blog posts:
 * - Create, Read, Update, Delete posts
 * - Manage categories
 * - Moderate comments
 * - Manage settings
 * 
 * All endpoints require authentication via admin token
 */

const express = require('express');

// Middleware to verify admin token (no secret logging)
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.replace('Bearer ', '') : null;
  const envSecret = process.env.ADMIN_SECRET;
  const defaultSecret = 'your-super-secret-admin-key-here';
  const adminSecret = envSecret || defaultSecret;

  if (process.env.NODE_ENV === 'development') {
    console.log(`[ADMIN AUTH] attempt: ${token ? 'token provided' : 'missing token'} (source: ${envSecret ? '.env' : 'default'})`);
  }

  if (!token || token !== adminSecret) {
    return res.status(401).json({
      success: false,
      message: '❌ Unauthorized. Admin token required.',
      error: 'Invalid or missing authentication token'
    });
  }
  next();
}

// ============================================
// ADMIN ROUTES FACTORY
// ============================================
module.exports = function(database) {
  const router = express.Router();
  
  // GET all posts (admin view - including drafts)
  router.get('/posts', authenticateAdmin, async (req, res) => {
    try {
      // Get all posts including drafts (no filter)
      const allPosts = await database.getPosts({});
      
      // Also get drafts explicitly by querying without status filter
      // For PostgreSQL we need to query directly
      let posts = [];
      if (database.pool) {
        // PostgreSQL - get all posts regardless of status
        const result = await database.pool.query('SELECT * FROM posts ORDER BY updated_at DESC');
        posts = result.rows.map(database.mapPostFromDb.bind(database));
      } else {
        // In-memory - access directly
        posts = database.posts || [];
        posts = posts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      }

      res.json({
        success: true,
        count: posts.length,
        posts: posts
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET single post (admin view)
  router.get('/posts/:id', authenticateAdmin, async (req, res) => {
    try {
      const post = await database.getPostById(req.params.id);
      
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: 'Post not found' 
        });
      }

      res.json({ success: true, post });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // CREATE new post
  router.post('/posts', authenticateAdmin, async (req, res) => {
    try {
      const { title, slug, excerpt, content, category, tags, image, author, status, featured, scheduledPublishDate } = req.body;

      if (!title || !content) {
        return res.status(400).json({
          success: false,
          message: 'Title and content are required'
        });
      }

      const hasSchedule = scheduledPublishDate && !isNaN(Date.parse(scheduledPublishDate));
      const initialStatus = status === 'published' && !hasSchedule ? 'published' : 'draft';

      const post = await database.createPost({
        title,
        slug: slug || title.toLowerCase().replace(/\s+/g, '-'),
        excerpt: excerpt || content.substring(0, 160),
        content,
        category: category || 'Algemeen',
        tags: tags || [],
        image: image || '',
        author: author || 'Admin',
        status: initialStatus,
        featured: !!featured,
        publishedDate: initialStatus === 'published' ? new Date().toISOString() : undefined,
        scheduledPublishDate: hasSchedule ? new Date(scheduledPublishDate).toISOString() : undefined
      });

      res.status(201).json({
        success: true,
        message: '✅ Post created',
        post
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // UPDATE post
  router.put('/posts/:id', authenticateAdmin, async (req, res) => {
    try {
      const { title, slug, excerpt, content, category, tags, image, author, status, featured } = req.body;

      const updated = await database.updatePost(req.params.id, {
        title,
        slug,
        excerpt,
        content,
        category,
        tags,
        image,
        author,
        status,
        featured
      });

      res.json({
        success: true,
        message: '✅ Post updated',
        post: updated
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUBLISH post (change status to published)
  router.patch('/posts/:id/publish', authenticateAdmin, async (req, res) => {
    try {
      const updated = await database.updatePost(req.params.id, {
        status: 'published',
        publishedDate: new Date().toISOString()
      });

      res.json({
        success: true,
        message: '✅ Post published',
        post: updated
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // UNPUBLISH post (change status back to draft)
  router.patch('/posts/:id/unpublish', authenticateAdmin, async (req, res) => {
    try {
      const updated = await database.updatePost(req.params.id, {
        status: 'draft',
        publishedDate: undefined
      });

      res.json({
        success: true,
        message: '✅ Post unpublished',
        post: updated
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // SCHEDULE publish (set a scheduledPublishDate)
  router.patch('/posts/:id/schedule', authenticateAdmin, async (req, res) => {
    try {
      const { scheduledPublishDate } = req.body;
      if (!scheduledPublishDate || isNaN(Date.parse(scheduledPublishDate))) {
        return res.status(400).json({ success: false, message: 'Invalid scheduledPublishDate' });
      }

      const updated = await database.updatePost(req.params.id, {
        status: 'draft',
        scheduledPublishDate: new Date(scheduledPublishDate).toISOString()
      });

      res.json({
        success: true,
        message: '✅ Publish scheduled',
        post: updated
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE post
  router.delete('/posts/:id', authenticateAdmin, async (req, res) => {
    try {
      const deleted = await database.deletePost(req.params.id);

      res.json({
        success: true,
        message: '✅ Post deleted',
        post: deleted
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET categories (for admin dropdown)
  router.get('/categories', authenticateAdmin, async (req, res) => {
    try {
      const categories = await database.getCategories();
      res.json({ success: true, categories: [...categories, 'Nieuw...'] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // CATEGORY MANAGEMENT
  router.get('/categories/manage', authenticateAdmin, async (req, res) => {
    try {
      const stats = await database.getCategoryStats();
      res.json({ success: true, categories: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/categories', authenticateAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      const list = await database.addCategory(name);
      res.status(201).json({ success: true, categories: list });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  router.patch('/categories/:name', authenticateAdmin, async (req, res) => {
    try {
      const { newName } = req.body;
      const list = await database.renameCategory(req.params.name, newName);
      res.json({ success: true, categories: list });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  router.delete('/categories/:name', authenticateAdmin, async (req, res) => {
    try {
      const reassign = req.query.reassign || 'Algemeen';
      const list = await database.deleteCategory(req.params.name, reassign);
      res.json({ success: true, categories: list });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // GET comments pending approval
  router.get('/comments/pending', authenticateAdmin, async (req, res) => {
    try {
      const pendingComments = (database.comments || [])
        .filter(c => !c.approved)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.json({
        success: true,
        count: pendingComments.length,
        comments: pendingComments
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // APPROVE comment
  router.patch('/comments/:id/approve', authenticateAdmin, async (req, res) => {
    try {
      const approved = await database.approveComment(req.params.id);

      res.json({
        success: true,
        message: '✅ Comment approved',
        comment: approved
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE comment (with admin auth)
  router.delete('/comments/:id', authenticateAdmin, async (req, res) => {
    try {
      const deleted = await database.deleteComment(req.params.id);

      res.json({
        success: true,
        message: '✅ Comment deleted',
        comment: deleted
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET dashboard stats
  router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
      // Get all posts (including drafts)
      const allPosts = database.posts || [];
      const published = allPosts.filter(p => p.status === 'published').length;
      const drafts = allPosts.filter(p => p.status === 'draft').length;
      
      // Comments removed from UI; keep counts for compatibility
      const totalComments = 0;
      const pendingComments = 0;

      res.json({
        success: true,
        stats: {
          totalPosts: allPosts.length,
          publishedPosts: published,
          draftPosts: drafts,
          totalComments,
          pendingComments,
          totalViews: 0, // TODO: Implement view tracking
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // SETTINGS: get
  router.get('/settings', authenticateAdmin, async (req, res) => {
    try {
      const settings = await database.getSettings();
      res.json({ success: true, settings });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // SETTINGS: update
  router.put('/settings', authenticateAdmin, async (req, res) => {
    try {
      const allowed = { upcomingText: typeof req.body.upcomingText === 'string' ? req.body.upcomingText : undefined };
      const settings = await database.updateSettings(allowed);
      res.json({ success: true, settings });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
