#!/usr/bin/env node

/**
 * CI Development Server
 * 
 * Simple Express server for CI environments that mimics Vercel development server
 * without requiring Vercel authentication. Serves static files and API routes.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Set CI-specific environment variables
if (process.env.CI || process.env.NODE_ENV === 'ci') {
  // Set minimal environment for CI
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  
  // Mock environment variables if not set
  if (!process.env.TURSO_DATABASE_URL) {
    process.env.TURSO_DATABASE_URL = 'file:./data/test.db';
  }
  if (!process.env.TURSO_AUTH_TOKEN) {
    process.env.TURSO_AUTH_TOKEN = 'test-token';
  }
  
  console.log('🔧 Running in CI mode with test configurations');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'ci-server',
    port: PORT
  });
});

// API route handler - dynamically load serverless functions
app.all(/^\/api\/(.*)/, async (req, res) => {
  const apiPath = req.path.replace('/api/', '');
  const segments = apiPath.split('/').filter(Boolean);
  
  // Try different possible file locations
  let apiFile = null;
  let paramValues = {};
  
  // 1. Direct file match (api/health/check.js)
  const directFile = path.join(rootDir, 'api', apiPath + '.js');
  if (fs.existsSync(directFile)) {
    apiFile = directFile;
  }
  
  // 2. Index file in directory (api/tickets/index.js)
  if (!apiFile) {
    const indexFile = path.join(rootDir, 'api', apiPath, 'index.js');
    if (fs.existsSync(indexFile)) {
      apiFile = indexFile;
    }
  }
  
  // 3. Parameterized routes (api/tickets/[ticketId].js)
  if (!apiFile && segments.length >= 2) {
    const basePath = segments.slice(0, -1).join('/');
    const paramValue = segments[segments.length - 1];
    const paramName = segments[segments.length - 2] || 'id';
    
    const paramFile = path.join(rootDir, 'api', basePath, `[${paramName}].js`);
    if (fs.existsSync(paramFile)) {
      apiFile = paramFile;
      paramValues[paramName] = paramValue;
    }
  }
  
  // 4. Try different parameter patterns
  if (!apiFile && segments.length >= 2) {
    const basePath = segments.slice(0, -1).join('/');
    const paramValue = segments[segments.length - 1];
    
    // Common parameter names
    const paramNames = ['id', 'ticketId', 'userId', 'fileId'];
    for (const paramName of paramNames) {
      const paramFile = path.join(rootDir, 'api', basePath, `[${paramName}].js`);
      if (fs.existsSync(paramFile)) {
        apiFile = paramFile;
        paramValues[paramName] = paramValue;
        break;
      }
    }
  }
  
  if (!apiFile) {
    console.warn(`API endpoint not found: ${apiPath}`);
    return res.status(404).json({ 
      error: 'API endpoint not found', 
      path: apiPath,
      requestedPath: req.path
    });
  }
  
  try {
    // Clear module cache to ensure fresh imports in development
    const moduleUrl = `file://${apiFile}?t=${Date.now()}`;
    
    // Import the serverless function
    let module, handler;
    
    try {
      module = await import(moduleUrl);
      handler = module.default;
    } catch (importError) {
      console.error(`Failed to import ${apiFile}:`, importError.message);
      
      // Check if it's a missing dependency issue
      if (importError.message.includes('Cannot resolve module') || 
          importError.message.includes('MODULE_NOT_FOUND')) {
        
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Required dependencies not available in CI environment',
          path: apiPath,
          details: importError.message
        });
      }
      
      throw importError;
    }
    
    if (typeof handler !== 'function') {
      console.error(`Invalid handler in ${apiFile}:`, typeof handler);
      return res.status(500).json({ 
        error: 'Invalid serverless function',
        expected: 'function',
        received: typeof handler,
        path: apiPath
      });
    }
    
    // Merge parameter values with query parameters
    const mergedQuery = { ...req.query, ...paramValues };
    
    // Create Vercel-like req/res objects
    const vercelReq = {
      ...req,
      body: req.body,
      query: mergedQuery,
      headers: req.headers,
      method: req.method,
      url: req.url,
      params: paramValues // Add params like Express
    };
    
    const vercelRes = {
      status: (code) => {
        if (!res.headersSent) {
          res.status(code);
        }
        return vercelRes;
      },
      json: (data) => {
        if (!res.headersSent) {
          res.json(data);
        }
        return vercelRes;
      },
      send: (data) => {
        if (!res.headersSent) {
          res.send(data);
        }
        return vercelRes;
      },
      setHeader: (name, value) => {
        if (!res.headersSent) {
          res.setHeader(name, value);
        }
        return vercelRes;
      },
      end: (data) => {
        if (!res.headersSent) {
          res.end(data);
        }
        return vercelRes;
      },
      redirect: (url) => {
        if (!res.headersSent) {
          res.redirect(url);
        }
        return vercelRes;
      }
    };
    
    // Call the handler with timeout
    const handlerTimeout = 30000; // 30 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Handler timeout')), handlerTimeout);
    });
    
    await Promise.race([
      handler(vercelReq, vercelRes),
      timeoutPromise
    ]);
    
  } catch (error) {
    console.error(`Error in API handler ${apiPath}:`, error);
    
    // Log more details for debugging
    if (process.env.CI) {
      console.error('API file:', apiFile);
      console.error('Stack trace:', error.stack);
    }
    
    if (!res.headersSent) {
      // Provide different error messages based on error type
      let statusCode = 500;
      let errorMessage = 'Internal server error';
      
      if (error.message.includes('timeout')) {
        statusCode = 504;
        errorMessage = 'Gateway timeout';
      } else if (error.message.includes('ECONNREFUSED') || 
                 error.message.includes('database')) {
        statusCode = 503;
        errorMessage = 'Service temporarily unavailable';
      }
      
      res.status(statusCode).json({ 
        error: errorMessage,
        message: process.env.CI ? error.message : 'Something went wrong',
        path: apiPath,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Static file serving - serve pages directory first, then root
app.use(express.static(path.join(rootDir, 'pages'), {
  index: ['index.html', 'index.htm'],
  extensions: ['html', 'htm']
}));

// Also serve root directory for other static assets (css, js, images)
app.use(express.static(rootDir, {
  index: false, // Don't serve index files from root, pages takes precedence
  extensions: ['html', 'htm']
}));

// Handle SPA routing - serve index.html for non-API routes
app.get(/^\/(?!api\/).*/, (req, res) => {
  // Don't serve index.html for API routes that failed
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Try to find the requested file in pages directory
  const pagePath = path.join(rootDir, 'pages', req.path.slice(1) + '.html');
  if (fs.existsSync(pagePath)) {
    return res.sendFile(pagePath);
  }
  
  // Check for index.html in pages directory (like Vercel config)
  let indexPath = path.join(rootDir, 'pages', 'index.html');
  if (!fs.existsSync(indexPath)) {
    // Fallback to root index.html
    indexPath = path.join(rootDir, 'index.html');
  }
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Page not found');
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log(`🚀 CI Development Server running at http://localhost:${PORT}`);
  console.log(`📁 Serving from: ${rootDir}`);
  console.log(`🔄 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⚡ Server type: Express (CI-compatible)`);
  console.log(`🌐 CI Mode: ${process.env.CI ? 'Enabled' : 'Disabled'}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /health                    - Health check');
  console.log('  ALL  /api/*                     - API functions');
  console.log('  GET  /*                         - Static files');
  console.log('');
  
  // List available API endpoints for debugging
  console.log('🔍 Scanning API directory...');
  const apiDir = path.join(rootDir, 'api');
  if (fs.existsSync(apiDir)) {
    const scanDir = (dir, basePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      items.forEach(item => {
        if (item.isDirectory()) {
          scanDir(path.join(dir, item.name), `${basePath}/${item.name}`);
        } else if (item.name.endsWith('.js')) {
          const endpoint = `${basePath}/${item.name.replace('.js', '')}`;
          console.log(`  📄 /api${endpoint === '/index' ? '' : endpoint}`);
        }
      });
    };
    scanDir(apiDir);
  }
  console.log('');
});

// Handle server errors (like port already in use)
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    console.error('Another server instance may still be running.');
    console.error('Trying to find and kill the process...');
    
    // In CI, exit with error
    if (process.env.CI) {
      process.exit(1);
    }
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down CI server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;