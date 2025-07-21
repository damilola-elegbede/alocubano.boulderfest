#!/usr/bin/env node

// Local Vercel simulation for testing routing behavior
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const app = express();
const PORT = 3001;

// Parse JSON bodies
app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`\n=== LOCAL VERCEL SIMULATION ===`);
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query:', req.query);
  console.log('Timestamp:', new Date().toISOString());
  next();
});

// Load vercel.json configuration
const vercelConfigPath = path.join(projectRoot, 'vercel.json');
let vercelConfig = {};
if (fs.existsSync(vercelConfigPath)) {
  vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
  console.log('Loaded vercel.json config:', JSON.stringify(vercelConfig, null, 2));
} else {
  console.error('vercel.json not found!');
}

// Serve static files from project root
app.use(express.static(projectRoot, {
  dotfiles: 'allow',
  index: 'index.html'
}));

// Handle API routes (simulate Vercel Functions)
app.use('/api', (req, res, next) => {
  const apiPath = req.path.substring(1); // Remove leading slash
  const apiFilePath = path.join(projectRoot, 'api', `${apiPath}.js`);
  
  console.log(`\n--- API Route Handler ---`);
  console.log('API Path:', apiPath);
  console.log('API File Path:', apiFilePath);
  console.log('File exists:', fs.existsSync(apiFilePath));
  
  if (fs.existsSync(apiFilePath)) {
    // Dynamically import and execute the API function
    import(apiFilePath)
      .then(module => {
        console.log('API module loaded successfully');
        const handler = module.default;
        if (typeof handler === 'function') {
          // Create a mock Vercel request/response environment
          const mockReq = {
            ...req,
            query: req.query,
            body: req.body,
            headers: req.headers,
            method: req.method,
            url: req.url
          };
          
          const mockRes = {
            ...res,
            status: (code) => {
              res.status(code);
              return mockRes;
            },
            json: (data) => {
              console.log('API Response:', JSON.stringify(data, null, 2));
              res.json(data);
              return mockRes;
            },
            setHeader: (key, value) => {
              console.log(`Setting header: ${key} = ${value}`);
              res.setHeader(key, value);
              return mockRes;
            },
            end: (data) => {
              if (data) console.log('API End with data:', data);
              res.end(data);
              return mockRes;
            }
          };
          
          console.log('Executing API handler...');
          handler(mockReq, mockRes);
        } else {
          console.error('API handler is not a function');
          res.status(500).json({ error: 'Invalid API handler' });
        }
      })
      .catch(error => {
        console.error('Failed to load API module:', error);
        res.status(500).json({ error: 'API module failed to load', details: error.message });
      });
  } else {
    console.log('API file not found, passing to next middleware');
    next();
  }
});

// Apply Vercel rewrites from configuration
if (vercelConfig.rewrites && Array.isArray(vercelConfig.rewrites)) {
  console.log('\nApplying Vercel rewrites...');
  vercelConfig.rewrites.forEach((rewrite, index) => {
    console.log(`Rewrite ${index + 1}:`, rewrite);
    
    // Convert Vercel rewrite pattern to Express route pattern
    // For patterns like /(about|artists|...), we need to create individual routes
    if (rewrite.source.includes('|')) {
      // Extract options from pattern like /(about|artists|donations|...)
      const match = rewrite.source.match(/\/\(([^)]+)\)/);
      if (match) {
        const options = match[1].split('|');
        console.log(`Creating individual routes for options:`, options);
        
        options.forEach(option => {
          const routePath = `/${option}`;
          console.log(`Route: ${routePath} -> ${rewrite.destination}`);
          
          app.get(routePath, (req, res) => {
            console.log(`\n--- Rewrite Rule Matched ---`);
            console.log('Original source:', rewrite.source);
            console.log('Matched route:', routePath);
            console.log('Destination template:', rewrite.destination);
            
            // Replace $1 with the matched option
            const destination = rewrite.destination.replace('$1', option);
            console.log('Final destination:', destination);
            
            // Check if destination file exists
            const filePath = path.join(projectRoot, destination);
            console.log('File path:', filePath);
            console.log('File exists:', fs.existsSync(filePath));
            
            if (fs.existsSync(filePath)) {
              console.log('Serving file:', filePath);
              res.sendFile(filePath);
            } else {
              console.log('File not found, sending 404');
              const notFoundPath = path.join(projectRoot, '404.html');
              if (fs.existsSync(notFoundPath)) {
                res.status(404).sendFile(notFoundPath);
              } else {
                res.status(404).json({
                  error: 'File not found',
                  route: routePath,
                  destination: destination,
                  absolutePath: filePath,
                  available: fs.existsSync(path.dirname(filePath)) ? 
                    fs.readdirSync(path.dirname(filePath)) : []
                });
              }
            }
          });
        });
        return; // Skip the general pattern matching below
      }
    }
    
    // Fallback for other patterns
    const sourcePattern = rewrite.source
      .replace(/\(([^)]+)\)/g, ':$1') // Convert (.*) to :param
      .replace(/\.\*/, '*'); // Convert .* to *
    
    console.log(`Express pattern: ${sourcePattern} -> ${rewrite.destination}`);
    
    app.get(sourcePattern, (req, res) => {
      console.log(`\n--- Rewrite Rule Matched ---`);
      console.log('Source pattern:', rewrite.source);
      console.log('Destination:', rewrite.destination);
      console.log('Request params:', req.params);
      console.log('Request path:', req.path);
      
      // Process destination with parameter substitution
      let destination = rewrite.destination;
      Object.keys(req.params).forEach((key, index) => {
        const param = req.params[key];
        destination = destination.replace(`$${index + 1}`, param);
      });
      
      console.log('Final destination:', destination);
      
      // Check if destination file exists
      const filePath = path.join(projectRoot, destination);
      console.log('File path:', filePath);
      console.log('File exists:', fs.existsSync(filePath));
      
      if (fs.existsSync(filePath)) {
        console.log('Serving file:', filePath);
        res.sendFile(filePath);
      } else {
        console.log('File not found, sending 404');
        const notFoundPath = path.join(projectRoot, '404.html');
        if (fs.existsSync(notFoundPath)) {
          res.status(404).sendFile(notFoundPath);
        } else {
          res.status(404).json({
            error: 'File not found',
            path: destination,
            absolutePath: filePath,
            available: fs.existsSync(path.dirname(filePath)) ? 
              fs.readdirSync(path.dirname(filePath)) : []
          });
        }
      }
    });
  });
}

// Fallback 404 handler
app.use((req, res) => {
  console.log(`\n--- 404 Handler ---`);
  console.log('No route matched for:', req.url);
  console.log('Method:', req.method);
  
  const notFoundPath = path.join(projectRoot, '404.html');
  if (fs.existsSync(notFoundPath)) {
    console.log('Serving 404.html');
    res.status(404).sendFile(notFoundPath);
  } else {
    console.log('404.html not found, sending JSON response');
    res.status(404).json({
      error: 'Not Found',
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
      availableRoutes: vercelConfig.rewrites || [],
      projectStructure: {
        hasIndexHtml: fs.existsSync(path.join(projectRoot, 'index.html')),
        hasPagesDir: fs.existsSync(path.join(projectRoot, 'pages')),
        hasApiDir: fs.existsSync(path.join(projectRoot, 'api')),
        has404Html: fs.existsSync(path.join(projectRoot, '404.html'))
      }
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Local Vercel Simulation Server running on http://localhost:${PORT}`);
  console.log(`📁 Project root: ${projectRoot}`);
  console.log(`⚙️  Configuration loaded: ${JSON.stringify(vercelConfig, null, 2)}`);
  console.log(`\n🧪 Test URLs:`);
  console.log(`   http://localhost:${PORT}/              (index.html)`);
  console.log(`   http://localhost:${PORT}/              (serves index.html directly)`);
  console.log(`   http://localhost:${PORT}/about         (should rewrite to /pages/about.html)`);
  console.log(`   http://localhost:${PORT}/api/debug     (API endpoint)`);
  console.log(`   http://localhost:${PORT}/nonexistent   (should show 404)`);
  console.log(`\nPress Ctrl+C to stop the server\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Local Vercel Simulation Server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Local Vercel Simulation Server...');
  process.exit(0);
});