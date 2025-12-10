#!/usr/bin/env node

/**
 * Custom Development Server with Vercel Rewrite Support + Vite HMR
 *
 * Solves Vercel CLI 48+ bug where vercel.json rewrites don't work in local dev.
 *
 * Features:
 * - Auto-pulls environment variables from Vercel
 * - Applies rewrites from vercel.json
 * - Applies redirects and headers from vercel.json
 * - Proxies /api routes to Vercel dev (for serverless functions)
 * - Serves static files
 * - **NEW**: Vite HMR for React pages (pages with react-root)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { execSync, spawn } from 'child_process';
import http from 'http';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const DEV_PORT = 3000;
const VERCEL_DEV_PORT = 3001;

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

// Step 1: Pull environment variables from Vercel
log('📦', 'Pulling environment variables from Vercel...', colors.cyan);
try {
  const token = process.env.VERCEL_TOKEN;
  if (token) {
    execSync(
      './node_modules/.bin/vercel env pull .env.local --yes',
      {
        cwd: rootDir,
        stdio: 'pipe',
        env: { ...process.env, VERCEL_TOKEN: token }
      }
    );
    log('✅', 'Environment variables pulled successfully', colors.green);
  } else {
    log('⚠️', 'VERCEL_TOKEN not found in environment, skipping env pull', colors.yellow);
    log('💡', 'Tip: Export VERCEL_TOKEN from ~/.zshrc', colors.blue);
  }
} catch (error) {
  log('⚠️', `Failed to pull env vars: ${error.message}`, colors.yellow);
  log('💡', 'Continuing with existing .env.local if available', colors.blue);
}

// Step 2: Load .env.local
if (existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local') });
  log('✅', 'Loaded .env.local', colors.green);
} else {
  log('⚠️', 'No .env.local found', colors.yellow);
}

// Step 3: Load vercel.json configuration
let vercelConfig;
try {
  const configPath = path.join(rootDir, 'vercel.json');
  if (!existsSync(configPath)) {
    log('❌', 'vercel.json not found', colors.red);
    process.exit(1);
  }
  vercelConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  log('✅', 'Loaded vercel.json configuration', colors.green);
} catch (error) {
  log('❌', `Failed to load vercel.json: ${error.message}`, colors.red);
  process.exit(1);
}

// Step 4: Create Vite dev server for HMR
let vite;
try {
  vite = await createViteServer({
    root: rootDir,
    server: {
      middlewareMode: true,
      hmr: {
        port: 5174 // Use different port for HMR websocket
      }
    },
    appType: 'custom',
    // Override base for dev mode (no /dist/ prefix needed)
    base: '/'
  });
  log('✅', 'Vite dev server created (HMR enabled)', colors.green);
} catch (error) {
  log('❌', `Failed to create Vite dev server: ${error.message}`, colors.red);
  log('💡', 'React pages will not have HMR support', colors.yellow);
  vite = null;
}

// Step 5: Create Express app
const app = express();

// Middleware: Parse JSON bodies for POST requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware: Apply headers from vercel.json
app.use((req, res, next) => {
  const headers = vercelConfig.headers || [];
  for (const rule of headers) {
    try {
      // Convert Vercel source pattern to regex
      const pattern = rule.source
        .replace(/\*/g, '.*')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
      const regex = new RegExp(`^${pattern}$`);

      if (regex.test(req.path)) {
        for (const header of rule.headers) {
          res.setHeader(header.key, header.value);
        }
      }
    } catch (error) {
      // Skip invalid patterns
    }
  }
  next();
});

// Middleware: Use Vite middleware for HMR assets (/@vite, /src, etc.)
if (vite) {
  app.use(vite.middlewares);
  log('✅', 'Vite middleware attached for HMR', colors.green);
}

// Apply redirects from vercel.json
const redirects = vercelConfig.redirects || [];
redirects.forEach(redirect => {
  app.get(redirect.source, (req, res) => {
    const statusCode = redirect.permanent ? 301 : 302;
    res.redirect(statusCode, redirect.destination);
  });
});

log('✅', `Applied ${redirects.length} redirects from vercel.json`, colors.green);

// Apply rewrites from vercel.json (excluding API routes)
const rewrites = vercelConfig.rewrites || [];
let rewriteCount = 0;

/**
 * Transform HTML for React pages by injecting Vite HMR client
 * Replaces build-time asset injection with dev-time Vite client
 */
async function transformHtmlForVite(html, url) {
  if (!vite) return html;

  // Check if this page has a react-root (needs Vite HMR)
  if (!html.includes('id="react-root"')) {
    return html;
  }

  // Remove any existing injected Vite assets (from build)
  html = html.replace(
    /<!-- INJECTED VITE ASSETS -->[\s\S]*?<!-- END INJECTED VITE ASSETS -->/g,
    '<!-- VITE DEV MODE - Assets injected by Vite HMR -->'
  );

  // Use Vite's transformIndexHtml to inject HMR client and module preloads
  try {
    html = await vite.transformIndexHtml(url, html);

    // Vite's transform doesn't add our main.jsx entry, so add it manually
    // Insert before </head>
    const entryScript = '<script type="module" src="/src/main.jsx"></script>';
    if (!html.includes('/src/main.jsx')) {
      html = html.replace('</head>', `  ${entryScript}\n  </head>`);
    }
  } catch (error) {
    log('⚠️', `Vite transform failed for ${url}: ${error.message}`, colors.yellow);
  }

  return html;
}

rewrites.forEach(rewrite => {
  // Skip identity rewrites for /api and static assets
  if (rewrite.source === rewrite.destination) {
    return;
  }

  // Skip if destination is /api/* (will be proxied)
  if (rewrite.destination.startsWith('/api')) {
    return;
  }

  // Convert Vercel regex pattern to Express regex
  // E.g., "/(about|tickets)" -> /^\/(about|tickets)$/
  const sourcePattern = new RegExp('^' + rewrite.source + '$');

  app.get(sourcePattern, async (req, res) => {
    // Replace capture groups in destination ($1, $2, etc.)
    let destination = rewrite.destination;
    const matches = req.path.match(sourcePattern);

    if (matches) {
      // Replace $1, $2, etc. with captured groups
      for (let i = 1; i < matches.length; i++) {
        destination = destination.replace(`$${i}`, matches[i]);
      }
    }

    // Serve the destination file
    let filePath = path.join(rootDir, destination);

    // Prevent path traversal
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(rootDir)) {
      log('⚠️', `Blocked path traversal attempt: ${destination}`, colors.yellow);
      res.status(403).send('Forbidden');
      return;
    }

    // Add .html extension if not present
    if (!filePath.endsWith('.html') && !existsSync(resolvedPath)) {
      filePath += '.html';
      const newResolvedPath = path.resolve(filePath);
      if (!newResolvedPath.startsWith(rootDir)) {
        log('⚠️', `Blocked path traversal attempt: ${destination}`, colors.yellow);
        res.status(403).send('Forbidden');
        return;
      }
    }

    const finalPath = path.resolve(filePath);
    if (existsSync(finalPath)) {
      // Read HTML and transform for Vite HMR if it's a React page
      if (finalPath.endsWith('.html') && vite) {
        try {
          let html = readFileSync(finalPath, 'utf-8');
          html = await transformHtmlForVite(html, req.originalUrl);
          res.setHeader('Content-Type', 'text/html');
          res.send(html);
        } catch (error) {
          log('⚠️', `Error transforming ${path.basename(finalPath)}: ${error.message}`, colors.yellow);
          res.sendFile(finalPath);
        }
      } else {
        res.sendFile(finalPath);
      }
    } else {
      res.status(404).send('Not Found');
    }
  });

  rewriteCount++;
});

log('✅', `Applied ${rewriteCount} page rewrites from vercel.json`, colors.green);

// Proxy /api routes to Vercel dev
function proxyToVercelDev(req, res) {
  const options = {
    hostname: 'localhost',
    port: VERCEL_DEV_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (error) => {
    console.error('Proxy error:', error.message);
    res.status(502).send('Bad Gateway: Vercel dev not available');
  });

  req.pipe(proxyReq, { end: true });
}

app.use('/api', proxyToVercelDev);
log('✅', 'Configured API proxy to Vercel dev', colors.green);

// Serve static files
app.use(express.static(rootDir));

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(rootDir, 'pages/404.html'));
});

// Step 5: Start Vercel dev for API routes
log('🔧', `Starting Vercel dev on port ${VERCEL_DEV_PORT} (using vercel.dev.json)...`, colors.cyan);

const token = process.env.VERCEL_TOKEN;
const vercelArgs = [
  'dev',
  '--listen', String(VERCEL_DEV_PORT),
  '--yes',
  '--local-config', 'vercel.dev.json'
];

const vercelDev = spawn('./node_modules/.bin/vercel', vercelArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  detached: true,
  env: {
    ...process.env,
    VERCEL_TOKEN: token || process.env.VERCEL_TOKEN
  }
});

vercelDev.on('error', (error) => {
  log('❌', `Failed to start Vercel dev: ${error.message}`, colors.red);
  process.exit(1);
});

vercelDev.on('exit', (code) => {
  if (code && code !== 0) {
    log('⚠️', `Vercel dev exited unexpectedly (code ${code})`, colors.yellow);
    log('💡', 'Express server will continue running for static files', colors.blue);
    log('💡', 'API routes will not be available until Vercel dev is restarted', colors.blue);
    // Don't exit the process - let Express continue serving static files
  }
});

// Wait for Vercel dev to be ready (with timeout)
function waitForVercelDev(callback) {
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds timeout

  const checkHealth = () => {
    if (attempts >= maxAttempts) {
      log('⚠️', 'Vercel dev taking longer than expected, starting Express anyway...', colors.yellow);
      log('💡', 'API routes will work once Vercel dev finishes building', colors.blue);
      callback();
      return;
    }

    attempts++;

    http.get(`http://localhost:${VERCEL_DEV_PORT}/api/health/check`, (res) => {
      if (res.statusCode === 200) {
        log('✅', 'Vercel dev is ready!', colors.green);
        callback();
      } else {
        setTimeout(checkHealth, 1000);
      }
    }).on('error', () => {
      setTimeout(checkHealth, 1000);
    });
  };

  setTimeout(checkHealth, 5000); // Initial 5s delay for build to start
}

// Step 6: Start Express server immediately
app.listen(DEV_PORT, () => {
  console.log('');
  log('🚀', '═══════════════════════════════════════════════', colors.bright);
  log('✨', `Dev Server Ready!`, colors.green + colors.bright);
  log('🌐', `Local:            http://localhost:${DEV_PORT}`, colors.cyan);
  log('🔧', `Vercel Functions: http://localhost:${VERCEL_DEV_PORT} (building...)`, colors.blue);
  log('🚀', '═══════════════════════════════════════════════', colors.bright);
  console.log('');
  log('📋', 'Features enabled:', colors.bright);
  log('  ✅', 'Rewrites from vercel.json', colors.green);
  log('  ✅', 'Redirects from vercel.json', colors.green);
  log('  ✅', 'Headers from vercel.json', colors.green);
  log('  ⏳', 'API proxy (Vercel dev building in background...)', colors.yellow);
  log('  ✅', 'Environment variables from Vercel', colors.green);
  if (vite) {
    log('  ✅', 'Vite HMR for React pages (hot reloading enabled)', colors.green);
  } else {
    log('  ⚠️', 'Vite HMR unavailable (React pages need build)', colors.yellow);
  }
  console.log('');
  log('💡', 'Press Ctrl+C to stop', colors.yellow);
  console.log('');

  // Check for Vercel dev readiness in background
  waitForVercelDev(() => {
    console.log('');
    log('✅', 'Vercel dev is ready! API routes now available.', colors.green);
    console.log('');
  });
});

// Cleanup on exit
async function cleanup() {
  console.log('');
  log('🛑', 'Shutting down...', colors.yellow);

  // Close Vite server
  if (vite) {
    try {
      await vite.close();
      log('  ✓', 'Vite server closed', colors.green);
    } catch (error) {
      // Ignore errors on cleanup
    }
  }

  // Kill the entire process group
  try {
    process.kill(-vercelDev.pid);
  } catch (error) {
    // Fallback to regular kill if process group kill fails
    try {
      vercelDev.kill();
    } catch {
      // Ignore if already dead
    }
  }

  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
