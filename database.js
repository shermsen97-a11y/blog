/**
 * Database Abstraction Layer for PubQuiz Blog
 * 
 * Supports multiple database backends:
 * - In-Memory (default, development)
 * - MongoDB (Atlas recommended)
 * - PostgreSQL (self-hosted or managed)
 * 
 * Usage:
 * const db = require('./database');
 * const posts = await db.getPosts();
 */

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

// ============================================
// DATABASE CONFIGURATION
// ============================================
const DB_TYPE = process.env.DATABASE_TYPE || 'memory'; // 'memory', 'mongodb', 'postgresql'
const DB_URL = process.env.DATABASE_URL || '';

// ============================================
// IN-MEMORY DATABASE (Default)
// ============================================
class InMemoryDatabase {
  constructor() {
    this.dataFile = path.join(__dirname, 'blog-data.json');
    this.posts = [];
    this.comments = [];
    this.users = [];
    this.categories = [
      'Tips & Tricks',
      'Case Studies',
      'Horeca',
      'Team Building',
      'Onderwijs',
      'Product Updates',
      'Algemeen'
    ];
    this.settings = {
      upcomingText: [
        '🎮 Top 5 Themaquizzen voor Winter 2025 - Ideale thema\'s voor je volgende quiz avond.',
        '💡 3 Onderwijs Success Stories - Hoe docenten PubQuiz.pro gebruiken om lessen spannender te maken.',
        '📊 Product Update: Nieuw Analytics Dashboard - Eerste look op onze gloednieuwe analytics tools.'
      ].join('\n')
    };
  }

  async init() {
    await this.loadFromFile();
    return this;
  }

  async loadFromFile() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      const parsed = JSON.parse(data);
      
      this.posts = (parsed.posts || []).map(p => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt)
      }));
      this.comments = (parsed.comments || []).map(c => ({
        ...c,
        createdAt: new Date(c.createdAt)
      }));
      this.users = (parsed.users || []).map(u => ({
        ...u,
        createdAt: new Date(u.createdAt)
      }));
      this.categories = parsed.categories || this.categories;
      this.settings = parsed.settings || this.settings;
      
      console.log(`📂 Loaded ${this.posts.length} posts from ${this.dataFile}`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('📝 No existing data file, loading sample data');
        this.loadSampleData();
        await this.saveToFile();
      } else {
        console.error('❌ Error loading data file:', err.message);
        this.loadSampleData();
      }
    }
  }

  async saveToFile() {
    try {
      const data = {
        posts: this.posts,
        comments: this.comments,
        users: this.users,
        categories: this.categories,
        settings: this.settings,
        lastSaved: new Date().toISOString()
      };
      await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('❌ Error saving data file:', err.message);
    }
  }

  loadSampleData() {
    this.posts = [
      {
        id: "1",
        title: "Hoe organiseer je de perfecte pubquiz?",
        slug: "perfecte-pubquiz-organiseren",
        excerpt: "Een stap-voor-stap gids met 10 gouden tips voor het organiseren van een pubquiz.",
        content: "# Hoe organiseer je de perfecte pubquiz?\n\nOrganiseren van een pubquiz...",
        author: "PubQuiz Team",
        category: "Tips & Tricks",
        tags: ["pubquiz", "tips", "organiseren"],
        image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
        publishedDate: "2025-11-12",
        readTime: "5 min",
        featured: true,
        status: "published",
        createdAt: new Date("2025-11-12"),
        updatedAt: new Date("2025-11-12"),
        commentCount: 0
      },
      {
        id: "2",
        title: "Team Building Door Quiz: Case Study TechCorp",
        slug: "team-building-case-study",
        excerpt: "Lees hoe TechCorp hun team building transformeerde met PubQuiz.pro.",
        content: "# Team Building Door Quiz\n\nTeam building...",
        author: "Sarah Jansen",
        category: "Case Studies",
        tags: ["team-building", "case-study"],
        image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
        publishedDate: "2025-11-08",
        readTime: "6 min",
        featured: true,
        status: "published",
        createdAt: new Date("2025-11-08"),
        updatedAt: new Date("2025-11-08"),
        commentCount: 0
      },
      {
        id: "3",
        title: "Horeca Quiz Avonden: Meer Gasten, Meer Inkomsten",
        slug: "horeca-quiz-meer-bezoekers",
        excerpt: "Hoe horecaondernemers quiz avonden gebruiken om meer gasten te trekken.",
        content: "# Horeca Quiz Avonden\n\nQuiz avonden zijn...",
        author: "Mark van Dijk",
        category: "Horeca",
        tags: ["horeca", "marketing"],
        image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
        publishedDate: "2025-11-03",
        readTime: "7 min",
        featured: false,
        status: "published",
        createdAt: new Date("2025-11-03"),
        updatedAt: new Date("2025-11-03"),
        commentCount: 0
      }
    ];

    this.users = [
      {
        id: "admin1",
        username: "admin",
        email: "admin@pubquiz.pro",
        passwordHash: "hashed_password_here", // In production, use bcrypt
        role: "admin",
        createdAt: new Date()
      }
    ];
  }

  // Posts operations
  async getPosts(filters = {}) {
    let posts = this.posts.filter(p => p.status === 'published');
    
    if (filters.category) {
      posts = posts.filter(p => p.category === filters.category);
    }
    
    if (filters.featured !== undefined) {
      posts = posts.filter(p => p.featured === filters.featured);
    }
    
    return posts.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
  }

  async getPostById(id) {
    return this.posts.find(p => p.id === id);
  }

  async getPostBySlug(slug) {
    return this.posts.find(p => p.slug === slug);
  }

  async createPost(post) {
    const id = Date.now().toString();
    const status = post.status === 'published' ? 'published' : 'draft';
    const newPost = {
      id,
      ...post,
      status,
      featured: !!post.featured,
      publishedDate: status === 'published' ? (post.publishedDate || new Date().toISOString()) : post.publishedDate,
      createdAt: new Date(),
      updatedAt: new Date(),
      commentCount: 0
    };
    this.posts.push(newPost);
    await this.saveToFile();
    return newPost;
  }

  async updatePost(id, updates) {
    const index = this.posts.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Post not found');
    
    this.posts[index] = {
      ...this.posts[index],
      ...updates,
      updatedAt: new Date()
    };
    await this.saveToFile();
    return this.posts[index];
  }

  async deletePost(id) {
    const index = this.posts.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Post not found');
    
    const deleted = this.posts[index];
    this.posts.splice(index, 1);
    await this.saveToFile();
    return deleted;
  }

  async getCategories() {
    const fromPosts = [...new Set(this.posts.map(p => p.category).filter(Boolean))];
    const combined = new Set([...(this.categories || []), ...fromPosts, 'Algemeen']);
    return [...combined];
  }

  async getCategoryStats() {
    const names = await this.getCategories();
    return names.map(name => ({
      name,
      count: this.posts.filter(p => p.category === name).length
    }));
  }

  async addCategory(name) {
    const n = (name || '').trim();
    if (!n) throw new Error('Category name required');
    const exists = (this.categories || []).some(c => c.toLowerCase() === n.toLowerCase());
    if (!exists) {
      this.categories.push(n);
      await this.saveToFile();
    }
    return this.getCategories();
  }

  async renameCategory(oldName, newName) {
    const o = (oldName || '').trim();
    const n = (newName || '').trim();
    if (!o || !n) throw new Error('Old and new names required');
    if (o === n) return this.getCategories();
    this.categories = (this.categories || []).map(c => c === o ? n : c);
    this.posts = this.posts.map(p => ({ ...p, category: p.category === o ? n : p.category }));
    await this.saveToFile();
    return this.getCategories();
  }

  async deleteCategory(name, reassignTo = 'Algemeen') {
    const n = (name || '').trim();
    if (!n) throw new Error('Category name required');
    this.categories = (this.categories || []).filter(c => c !== n);
    this.posts = this.posts.map(p => ({ ...p, category: p.category === n ? reassignTo : p.category }));
    await this.saveToFile();
    return this.getCategories();
  }

  async searchPosts(query) {
    const q = query.toLowerCase();
    return this.posts.filter(p => 
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.tags.some(tag => tag.includes(q))
    );
  }

  // Comments operations
  async getPostComments(postId) {
    return this.comments.filter(c => c.postId === postId && c.approved);
  }

  async addComment(postId, comment) {
    const newComment = {
      id: Date.now().toString(),
      postId,
      ...comment,
      approved: false,
      createdAt: new Date()
    };
    this.comments.push(newComment);
    
    // Update comment count
    const post = this.posts.find(p => p.id === postId);
    if (post) post.commentCount = (post.commentCount || 0) + 1;
    
    await this.saveToFile();
    return newComment;
  }

  async approveComment(commentId) {
    const comment = this.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comment not found');
    
    comment.approved = true;
    await this.saveToFile();
    return comment;
  }

  async deleteComment(commentId) {
    const index = this.comments.findIndex(c => c.id === commentId);
    if (index === -1) throw new Error('Comment not found');
    
    const deleted = this.comments[index];
    this.comments.splice(index, 1);
    
    // Update comment count
    const post = this.posts.find(p => p.id === deleted.postId);
    if (post && post.commentCount > 0) post.commentCount--;
    
    await this.saveToFile();
    return deleted;
  }

  // Settings operations
  async getSettings() {
    return this.settings || { upcomingText: '' };
  }

  async updateSettings(updates) {
    this.settings = { ...(this.settings || {}), ...updates };
    await this.saveToFile();
    return this.settings;
  }
}

// ============================================
// MONGODB DATABASE
// ============================================
class MongoDBDatabase {
  constructor(mongooseInstance) {
    this.mongoose = mongooseInstance;
    // Schema definitions would go here
    // For now, this is a template for future implementation
  }

  async getPosts(filters = {}) {
    // Implementation with MongoDB
    throw new Error('MongoDB implementation coming soon. Use .env DATABASE_TYPE=memory for now');
  }
}

// ============================================
// POSTGRESQL DATABASE
// ============================================
class PostgreSQLDatabase {
  constructor(poolInstance) {
    this.pool = poolInstance;
  }

  async init() {
    await this.createTables();
    await this.loadSampleDataIfEmpty();
    return this;
  }

  async createTables() {
    const client = await this.pool.connect();
    try {
      // Posts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id VARCHAR(255) PRIMARY KEY,
          title TEXT NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          excerpt TEXT,
          content TEXT,
          author VARCHAR(255),
          category VARCHAR(255),
          tags JSONB DEFAULT '[]'::jsonb,
          image TEXT,
          published_date TIMESTAMP,
          read_time VARCHAR(50),
          featured BOOLEAN DEFAULT false,
          status VARCHAR(50) DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          comment_count INTEGER DEFAULT 0
        )
      `);

      // Comments table
      await client.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id VARCHAR(255) PRIMARY KEY,
          post_id VARCHAR(255) REFERENCES posts(id) ON DELETE CASCADE,
          author_name VARCHAR(255) NOT NULL,
          author_email VARCHAR(255),
          content TEXT NOT NULL,
          approved BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Categories table
      await client.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL
        )
      `);

      // Settings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT
        )
      `);

      // Users table (for admin)
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      console.log('✅ PostgreSQL tables created successfully');
    } finally {
      client.release();
    }
  }

  async loadSampleDataIfEmpty() {
    const result = await this.pool.query('SELECT COUNT(*) as count FROM posts');
    if (parseInt(result.rows[0].count) === 0) {
      console.log('📝 Loading sample data into PostgreSQL...');
      
      const samplePosts = [
        {
          id: "1",
          title: "Hoe organiseer je de perfecte pubquiz?",
          slug: "perfecte-pubquiz-organiseren",
          excerpt: "Een stap-voor-stap gids met 10 gouden tips voor het organiseren van een pubquiz.",
          content: "# Hoe organiseer je de perfecte pubquiz?\n\nOrganiseren van een pubquiz...",
          author: "PubQuiz Team",
          category: "Tips & Tricks",
          tags: ["pubquiz", "tips", "organiseren"],
          image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
          publishedDate: "2025-11-12",
          readTime: "5 min",
          featured: true,
          status: "published"
        },
        {
          id: "2",
          title: "Team Building Door Quiz: Case Study TechCorp",
          slug: "team-building-case-study",
          excerpt: "Lees hoe TechCorp hun team building transformeerde met PubQuiz.pro.",
          content: "# Team Building Door Quiz\n\nTeam building...",
          author: "Sarah Jansen",
          category: "Case Studies",
          tags: ["team-building", "case-study"],
          image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
          publishedDate: "2025-11-08",
          readTime: "6 min",
          featured: true,
          status: "published"
        },
        {
          id: "3",
          title: "Horeca Quiz Avonden: Meer Gasten, Meer Inkomsten",
          slug: "horeca-quiz-meer-bezoekers",
          excerpt: "Hoe horecaondernemers quiz avonden gebruiken om meer gasten te trekken.",
          content: "# Horeca Quiz Avonden\n\nQuiz avonden zijn...",
          author: "Mark van Dijk",
          category: "Horeca",
          tags: ["horeca", "marketing"],
          image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
          publishedDate: "2025-11-03",
          readTime: "7 min",
          featured: false,
          status: "published"
        }
      ];

      for (const post of samplePosts) {
        await this.createPost(post);
      }

      // Add default categories
      const defaultCategories = ['Tips & Tricks', 'Case Studies', 'Horeca', 'Team Building', 'Onderwijs', 'Product Updates', 'Algemeen'];
      for (const cat of defaultCategories) {
        await this.addCategory(cat);
      }

      // Add default settings
      await this.pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        ['upcomingText', '🎮 Top 5 Themaquizzen voor Winter 2025 - Ideale thema\'s voor je volgende quiz avond.\n💡 3 Onderwijs Success Stories - Hoe docenten PubQuiz.pro gebruiken om lessen spannender te maken.\n📊 Product Update: Nieuw Analytics Dashboard - Eerste look op onze gloednieuwe analytics tools.']
      );

      console.log('✅ Sample data loaded');
    }
  }

  // Posts operations
  async getPosts(filters = {}) {
    let query = 'SELECT * FROM posts WHERE status = $1';
    const params = ['published'];
    let paramIndex = 2;

    if (filters.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters.featured !== undefined) {
      query += ` AND featured = $${paramIndex}`;
      params.push(filters.featured);
      paramIndex++;
    }

    query += ' ORDER BY published_date DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapPostFromDb);
  }

  async getPostById(id) {
    const result = await this.pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    return result.rows[0] ? this.mapPostFromDb(result.rows[0]) : null;
  }

  async getPostBySlug(slug) {
    const result = await this.pool.query('SELECT * FROM posts WHERE slug = $1', [slug]);
    return result.rows[0] ? this.mapPostFromDb(result.rows[0]) : null;
  }

  async createPost(post) {
    const id = post.id || Date.now().toString();
    const status = post.status === 'published' ? 'published' : 'draft';
    const publishedDate = status === 'published' ? (post.publishedDate || new Date().toISOString()) : post.publishedDate;

    await this.pool.query(
      `INSERT INTO posts (id, title, slug, excerpt, content, author, category, tags, image, published_date, read_time, featured, status, comment_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        post.title,
        post.slug,
        post.excerpt || '',
        post.content || '',
        post.author || '',
        post.category || '',
        JSON.stringify(post.tags || []),
        post.image || '',
        publishedDate,
        post.readTime || '',
        !!post.featured,
        status,
        0
      ]
    );

    return await this.getPostById(id);
  }

  async updatePost(id, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['title', 'slug', 'excerpt', 'content', 'author', 'category', 'tags', 'image', 'published_date', 'read_time', 'featured', 'status'];
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(dbKey)) {
        fields.push(`${dbKey} = $${paramIndex}`);
        values.push(dbKey === 'tags' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return await this.getPostById(id);
    }

    fields.push(`updated_at = $${paramIndex}`);
    values.push(new Date());
    paramIndex++;

    values.push(id);

    await this.pool.query(
      `UPDATE posts SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return await this.getPostById(id);
  }

  async deletePost(id) {
    const post = await this.getPostById(id);
    if (!post) throw new Error('Post not found');
    
    await this.pool.query('DELETE FROM posts WHERE id = $1', [id]);
    return post;
  }

  async getCategories() {
    const result = await this.pool.query('SELECT name FROM categories ORDER BY name');
    const categories = result.rows.map(r => r.name);
    
    // Always include "Algemeen"
    if (!categories.includes('Algemeen')) {
      categories.push('Algemeen');
    }
    
    return categories;
  }

  async getCategoryStats() {
    const result = await this.pool.query(`
      SELECT c.name, COUNT(p.id) as count
      FROM categories c
      LEFT JOIN posts p ON c.name = p.category
      GROUP BY c.name
      ORDER BY c.name
    `);
    return result.rows.map(r => ({ name: r.name, count: parseInt(r.count) }));
  }

  async addCategory(name) {
    const n = (name || '').trim();
    if (!n) throw new Error('Category name required');
    
    await this.pool.query(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [n]
    );
    
    return await this.getCategories();
  }

  async renameCategory(oldName, newName) {
    const o = (oldName || '').trim();
    const n = (newName || '').trim();
    if (!o || !n) throw new Error('Old and new names required');
    if (o === n) return await this.getCategories();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE categories SET name = $1 WHERE name = $2', [n, o]);
      await client.query('UPDATE posts SET category = $1 WHERE category = $2', [n, o]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return await this.getCategories();
  }

  async deleteCategory(name, reassignTo = 'Algemeen') {
    const n = (name || '').trim();
    if (!n) throw new Error('Category name required');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE posts SET category = $1 WHERE category = $2', [reassignTo, n]);
      await client.query('DELETE FROM categories WHERE name = $1', [n]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return await this.getCategories();
  }

  async searchPosts(query) {
    const q = `%${query.toLowerCase()}%`;
    const result = await this.pool.query(
      `SELECT * FROM posts 
       WHERE LOWER(title) LIKE $1 
       OR LOWER(content) LIKE $1 
       OR tags::text LIKE $1
       ORDER BY published_date DESC`,
      [q]
    );
    return result.rows.map(this.mapPostFromDb);
  }

  // Comments operations
  async getPostComments(postId) {
    const result = await this.pool.query(
      'SELECT * FROM comments WHERE post_id = $1 AND approved = true ORDER BY created_at DESC',
      [postId]
    );
    return result.rows.map(this.mapCommentFromDb);
  }

  async addComment(postId, comment) {
    const id = Date.now().toString();
    
    await this.pool.query(
      `INSERT INTO comments (id, post_id, author_name, author_email, content, approved)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, postId, comment.authorName, comment.authorEmail || '', comment.content, false]
    );

    // Update comment count
    await this.pool.query(
      'UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1',
      [postId]
    );

    const result = await this.pool.query('SELECT * FROM comments WHERE id = $1', [id]);
    return this.mapCommentFromDb(result.rows[0]);
  }

  async approveComment(commentId) {
    await this.pool.query('UPDATE comments SET approved = true WHERE id = $1', [commentId]);
    const result = await this.pool.query('SELECT * FROM comments WHERE id = $1', [commentId]);
    return result.rows[0] ? this.mapCommentFromDb(result.rows[0]) : null;
  }

  async deleteComment(commentId) {
    const result = await this.pool.query('SELECT * FROM comments WHERE id = $1', [commentId]);
    if (result.rows.length === 0) throw new Error('Comment not found');
    
    const comment = this.mapCommentFromDb(result.rows[0]);
    
    await this.pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
    
    // Update comment count
    await this.pool.query(
      'UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1',
      [comment.postId]
    );

    return comment;
  }

  // Settings operations
  async getSettings() {
    const result = await this.pool.query('SELECT * FROM settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    return settings;
  }

  async updateSettings(updates) {
    for (const [key, value] of Object.entries(updates)) {
      await this.pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value]
      );
    }
    return await this.getSettings();
  }

  // Helper methods to map database rows to JS objects
  mapPostFromDb(row) {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      content: row.content,
      author: row.author,
      category: row.category,
      tags: row.tags || [],
      image: row.image,
      publishedDate: row.published_date,
      readTime: row.read_time,
      featured: row.featured,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      commentCount: row.comment_count || 0
    };
  }

  mapCommentFromDb(row) {
    return {
      id: row.id,
      postId: row.post_id,
      authorName: row.author_name,
      authorEmail: row.author_email,
      content: row.content,
      approved: row.approved,
      createdAt: row.created_at
    };
  }
}

// ============================================
// DATABASE FACTORY
// ============================================
let database = null;

async function initializeDatabase() {
  console.log(`\n📊 Database Type: ${DB_TYPE.toUpperCase()}`);

  switch (DB_TYPE) {
    case 'mongodb':
      if (!DB_URL) throw new Error('DATABASE_URL required for MongoDB');
      console.log('🔗 Connecting to MongoDB Atlas...');
      // TODO: Implement MongoDB connection
      throw new Error('MongoDB implementation coming soon');

    case 'postgresql':
      if (!DB_URL) throw new Error('DATABASE_URL required for PostgreSQL');
      console.log('🔗 Connecting to PostgreSQL (CockroachDB)...');
      try {
        const pool = new Pool({
          connectionString: DB_URL,
          ssl: {
            rejectUnauthorized: false // CockroachDB Cloud requires SSL
          }
        });
        
        // Test connection
        const client = await pool.connect();
        console.log('✅ Connected to PostgreSQL database');
        client.release();
        
        database = new PostgreSQLDatabase(pool);
        await database.init();
      } catch (err) {
        console.error('❌ PostgreSQL connection failed:', err.message);
        throw err;
      }
      break;

    case 'memory':
    default:
      console.log('💾 Using In-Memory Database with File Persistence');
      database = new InMemoryDatabase();
      await database.init();
      break;
  }

  console.log('✅ Database initialized\n');
  return database;
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  initializeDatabase,
  getDatabase: () => database,
  InMemoryDatabase,
  MongoDBDatabase,
  PostgreSQLDatabase
};
