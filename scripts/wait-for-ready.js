#!/usr/bin/env node

/**
 * Wait for Server Readiness Utility
 * 
 * Ensures the Vercel dev server is fully ready before starting E2E tests.
 * Can be used standalone or integrated into test pipelines.
 */

import http from 'http';
import { setTimeout } from 'timers/promises';

// Configuration
const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT = 60000; // 60 seconds
const CHECK_INTERVAL = 1000; // 1 second
const HEALTH_ENDPOINTS = ['/api/health/ping', '/api/health/check'];

/**
 * Check if server responds on a specific endpoint
 */
function checkEndpoint(port, path, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
      timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          healthy: res.statusCode >= 200 && res.statusCode < 300,
          data: res.statusCode === 200 ? data : null
        });
      });
    });
    
    req.on('error', () => resolve({ healthy: false, error: 'Connection failed' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Timeout' });
    });
    
    req.end();
  });
}

/**
 * Comprehensive health check
 */
async function performHealthCheck(port) {
  const results = {};
  
  for (const endpoint of HEALTH_ENDPOINTS) {
    const result = await checkEndpoint(port, endpoint, 3000);
    results[endpoint] = result;
  }
  
  // Server is healthy if at least one endpoint responds
  const isHealthy = Object.values(results).some(r => r.healthy);
  
  return {
    healthy: isHealthy,
    endpoints: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Wait for server to be ready
 */
async function waitForReady(options = {}) {
  const port = options.port || DEFAULT_PORT;
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const verbose = options.verbose !== false;
  
  const startTime = Date.now();
  let lastStatus = null;
  
  if (verbose) {
    console.log(`🔍 Waiting for server readiness on port ${port}...`);
    console.log(`⏱️  Timeout: ${timeout / 1000}s`);
  }
  
  while (Date.now() - startTime < timeout) {
    const healthCheck = await performHealthCheck(port);
    
    if (healthCheck.healthy) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (verbose) {
        console.log(`✅ Server ready in ${elapsed}s!`);
        console.log(`🏥 Health endpoints:`);
        
        Object.entries(healthCheck.endpoints).forEach(([endpoint, result]) => {
          const status = result.healthy ? '✅' : '❌';
          console.log(`   ${status} ${endpoint} (${result.status || 'ERROR'})`);
        });
      }
      
      return {
        ready: true,
        elapsed: parseFloat(elapsed),
        health: healthCheck
      };
    }
    
    // Show progress periodically
    if (verbose) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0 && elapsed !== lastStatus && elapsed > 0) {
        console.log(`⏳ Still waiting... ${elapsed}s elapsed`);
        lastStatus = elapsed;
      }
    }
    
    await setTimeout(CHECK_INTERVAL);
  }
  
  // Timeout reached
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  if (verbose) {
    console.log(`❌ Timeout after ${elapsed}s - server not ready`);
    console.log(`🔧 Try these commands:`);
    console.log(`   npm run dev:doctor        # Check for issues`);
    console.log(`   npm run start:clean       # Clear cache and restart`);
    console.log(`   curl http://localhost:${port}/api/health/ping  # Test manually`);
  }
  
  return {
    ready: false,
    elapsed: parseFloat(elapsed),
    timeout: true
  };
}

/**
 * CLI usage
 */
async function main() {
  const args = process.argv.slice(2);
  const port = parseInt(args.find(arg => arg.startsWith('--port='))?.split('=')[1]) || DEFAULT_PORT;
  const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1]) || DEFAULT_TIMEOUT;
  const quiet = args.includes('--quiet');
  const json = args.includes('--json');
  
  if (args.includes('--help')) {
    console.log(`
Usage: node wait-for-ready.js [options]

Options:
  --port=<port>       Server port (default: 3000)
  --timeout=<ms>      Timeout in milliseconds (default: 60000)
  --quiet            Suppress progress output
  --json             Output result as JSON
  --help             Show this help

Examples:
  node wait-for-ready.js                    # Wait for localhost:3000
  node wait-for-ready.js --port=8000        # Wait for localhost:8000
  node wait-for-ready.js --timeout=30000    # 30 second timeout
  node wait-for-ready.js --quiet --json     # JSON output only
    `);
    process.exit(0);
  }
  
  try {
    const result = await waitForReady({
      port,
      timeout,
      verbose: !quiet
    });
    
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    }
    
    process.exit(result.ready ? 0 : 1);
  } catch (error) {
    if (json) {
      console.log(JSON.stringify({ ready: false, error: error.message }, null, 2));
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

// Export for programmatic use
export { waitForReady, performHealthCheck };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}