/**
 * PubQuiz.pro Blog Backend API v2.0
 * 
 * Production-ready backend with:
 * - Database abstraction (Memory/MongoDB/PostgreSQL)
 * - Admin panel endpoints
 * - Comments system with moderation
 * - Comprehensive error handling
 * - Security headers
 * 
 * Usage:
 * npm install
 * npm start
 * 
 * API runs on http://localhost:3001
 */

// ============================================
// IMPORTS & SETUP
// ============================================
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initializeDatabase, getDatabase } = require('./database');
const createAdminRoutes = require('./admin');
// const createCommentRoutes = require('./comments'); // comments disabled for this blog

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// MIDDLEWARE
// ============================================
// Disable helmet's strict CSP to allow admin.html inline scripts
app.use(helmet({ contentSecurityPolicy: false }));

// Basic global rate limiter (protects public endpoints)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);
app.use(cors({
  origin: [
    process.env.CORS_ORIGIN || 'http://localhost:3000',
    'http://localhost:3001',  // Admin panel
    'http://127.0.0.1:3001',
    'http://localhost:5173',  // Vite dev
    'http://127.0.0.1:5173',
    'https://pubquiz.pro',
    'https://www.pubquiz.pro'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Serve static files (admin.html, etc.)
app.use(express.static(__dirname));

// Request logging (development)
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// PUBLIC API ROUTES
// ============================================

// Root route - serve API documentation
app.get('/', (req, res) => {
  res.json({
    message: '🚀 PubQuiz Blog API v2.0',
    version: '2.0.0',
    description: 'Professional blog backend with admin panel',
    endpoints: {
      public: [
        'GET /api/health - Health check',
        'GET /api/posts - List all posts',
        'GET /api/posts/:id - Get post by ID',
        'GET /api/posts/slug/:slug - Get post by slug',
        'GET /api/categories - List categories',
        'GET /api/search?q=term - Search posts',
        // Comments removed
      ],
      admin: [
        'All endpoints under /api/admin/* (require ADMIN_SECRET token)',
        'GET /api/admin/stats - Dashboard statistics',
        'POST /api/admin/posts - Create post',
        'PUT /api/admin/posts/:id - Update post',
        'DELETE /api/admin/posts/:id - Delete post',
        'PATCH /api/admin/posts/:id/publish - Publish post',
        // Comments moderation removed
      ],
      admin_panel: '/admin.html'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(),
    database: process.env.DATABASE_TYPE || 'memory'
  });
});

// GET all posts
app.get('/api/posts', async (req, res) => {
  try {
    const db = getDatabase();
    const { category, featured, limit = 10, offset = 0 } = req.query;
    
    let filters = {};
    if (category) filters.category = category;
    if (featured !== undefined) filters.featured = featured === 'true';

    const posts = await db.getPosts(filters);
    const paginated = posts.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      posts: paginated,
      total: posts.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET single post by ID
app.get('/api/posts/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const post = await db.getPostById(req.params.id);

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

// GET post by slug
app.get('/api/posts/slug/:slug', async (req, res) => {
  try {
    const db = getDatabase();
    const post = await db.getPostBySlug(req.params.slug);

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

// GET all categories
app.get('/api/categories', async (req, res) => {
  try {
    const db = getDatabase();
    const categories = await db.getCategories();

    res.json({
      success: true,
      categories: categories
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SEARCH posts
app.get('/api/search', async (req, res) => {
  try {
    const db = getDatabase();
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const results = await db.searchPosts(q);
    const paginated = results.slice(0, parseInt(limit));

    res.json({
      success: true,
      query: q,
      results: paginated,
      total: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Routes and error handlers will be registered after database initialization

// ============================================
// FALLBACK: ERROR HANDLING MIDDLEWARE
// ============================================
// This is a fallback - actual handlers will be set up in startServer()

// ============================================
// SERVER STARTUP
// ============================================
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();

    // Admin specific limiter (stricter)
    const adminLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 min
      max: 100,
      standardHeaders: true,
      legacyHeaders: false
    });
    // Register routes after database is initialized
    app.use('/api/admin', adminLimiter, createAdminRoutes(getDatabase()));

    // Public settings endpoint (read-only)
    app.get('/api/settings', async (req, res) => {
      try {
        const db = getDatabase();
        const settings = await db.getSettings();
        res.json({ success: true, settings: { upcomingText: settings.upcomingText || '' } });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Register 404 and error handlers AFTER all other routes
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: '404 Not Found',
        path: req.path
      });
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('❌ Error:', err);
      res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: NODE_ENV === 'development' ? err.message : undefined
      });
    });

    // Start server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('🚀 PubQuiz Blog API v2.0 Running');
      console.log('='.repeat(50));
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🌍 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
      console.log(`📊 Database: ${process.env.DATABASE_TYPE || 'memory'}`);
      console.log(`🔧 Environment: ${NODE_ENV}`);
      if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET === 'your-super-secret-admin-key-here') {
        console.warn('⚠️  SECURITY WARNING: Default ADMIN_SECRET in use. Set ADMIN_SECRET in .env to a long random string.');
      }
      console.log(`\n📚 API Documentation:`);
      console.log(`   GET  /api/health                    - Health check`);
      console.log(`   GET  /api/posts                     - List all posts`);
      console.log(`   GET  /api/posts/:id                 - Get post by ID`);
      console.log(`   GET  /api/posts/slug/:slug          - Get post by slug`);
      console.log(`   GET  /api/categories                - List categories`);
      console.log(`   GET  /api/search?q=term             - Search posts`);
      // Comments endpoints removed
      console.log(`\n🔐 Admin Endpoints (require ADMIN_SECRET):`);
      console.log(`   GET    /api/admin/posts             - All posts (including drafts)`);
      console.log(`   POST   /api/admin/posts             - Create post`);
      console.log(`   PUT    /api/admin/posts/:id         - Update post`);
      console.log(`   PATCH  /api/admin/posts/:id/publish - Publish post`);
      console.log(`   DELETE /api/admin/posts/:id         - Delete post`);
      // Comments moderation endpoints removed
      console.log(`   GET    /api/admin/stats             - Dashboard stats`);
      console.log('='.repeat(50) + '\n');
    });

    // Simple scheduler to auto-publish scheduled posts
    const db = getDatabase();
    setInterval(async () => {
      try {
        const now = new Date();
        const posts = db.posts || [];
        for (const p of posts) {
          if (p.status !== 'published' && p.scheduledPublishDate) {
            const when = new Date(p.scheduledPublishDate);
            if (!isNaN(when.getTime()) && when <= now) {
              await db.updatePost(p.id, {
                status: 'published',
                publishedDate: new Date().toISOString(),
                scheduledPublishDate: undefined
              });
              console.log(`[Scheduler] Published post ${p.id} (${p.slug}) at ${new Date().toISOString()}`);
            }
          }
        }
      } catch (e) {
        console.error('[Scheduler] Error:', e.message);
      }
    }, 60 * 1000);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// ============================================
// EXPORT FOR TESTING
// ============================================
module.exports = app;
