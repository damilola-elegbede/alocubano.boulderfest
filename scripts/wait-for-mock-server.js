#!/usr/bin/env node

/**
 * Wait for Mock Server - Helper script to wait for mock server readiness
 * 
 * This script can be used by other scripts to ensure the mock server is ready
 * before running tests or other operations that depend on it.
 * 
 * Usage:
 *   node scripts/wait-for-mock-server.js [options]
 * 
 * Options:
 *   --port <port>        Mock server port (default: 3000)
 *   --timeout <seconds>  Timeout in seconds (default: 30)
 *   --interval <ms>      Check interval in milliseconds (default: 500)
 *   --quiet              Suppress output except errors
 *   --health-endpoint    Use detailed health endpoint instead of ready check
 * 
 * Exit codes:
 *   0 - Server is ready
 *   1 - Timeout or connection error
 *   2 - Invalid arguments
 */

import http from 'http';

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  port: parseInt(process.env.CI_PORT || process.env.PORT || '3000'),
  timeout: 30,
  interval: 500,
  quiet: false,
  healthEndpoint: false
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--port':
      config.port = parseInt(args[++i]);
      if (isNaN(config.port)) {
        console.error('❌ Invalid port number');
        process.exit(2);
      }
      break;
    case '--timeout':
      config.timeout = parseInt(args[++i]);
      if (isNaN(config.timeout) || config.timeout <= 0) {
        console.error('❌ Invalid timeout value');
        process.exit(2);
      }
      break;
    case '--interval':
      config.interval = parseInt(args[++i]);
      if (isNaN(config.interval) || config.interval <= 0) {
        console.error('❌ Invalid interval value');
        process.exit(2);
      }
      break;
    case '--quiet':
      config.quiet = true;
      break;
    case '--health-endpoint':
      config.healthEndpoint = true;
      break;
    case '--help':
      console.log(`
Wait for Mock Server - Helper script to wait for mock server readiness

Usage:
  node scripts/wait-for-mock-server.js [options]

Options:
  --port <port>        Mock server port (default: ${config.port})
  --timeout <seconds>  Timeout in seconds (default: ${config.timeout})
  --interval <ms>      Check interval in milliseconds (default: ${config.interval})
  --quiet              Suppress output except errors
  --health-endpoint    Use detailed health endpoint instead of ready check
  --help               Show this help message

Exit codes:
  0 - Server is ready
  1 - Timeout or connection error
  2 - Invalid arguments

Examples:
  node scripts/wait-for-mock-server.js
  node scripts/wait-for-mock-server.js --port 3001 --timeout 60
  node scripts/wait-for-mock-server.js --quiet --health-endpoint
      `);
      process.exit(0);
    default:
      console.error(`❌ Unknown argument: ${args[i]}`);
      process.exit(2);
  }
}

/**
 * Make HTTP request to check server status
 */
function checkServer() {
  return new Promise((resolve, reject) => {
    const endpoint = config.healthEndpoint ? '/api/health/mock-server' : '/ready';
    const options = {
      hostname: 'localhost',
      port: config.port,
      path: endpoint,
      method: 'GET',
      timeout: config.interval - 100 // Leave some margin
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          if (config.healthEndpoint) {
            try {
              const health = JSON.parse(data);
              resolve({
                ready: health.status === 'healthy',
                details: health
              });
            } catch (error) {
              reject(new Error(`Invalid health response: ${data}`));
            }
          } else {
            resolve({
              ready: data.trim() === 'Ready',
              details: { response: data.trim() }
            });
          }
        } else {
          reject(new Error(`Server returned status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Wait for server with retries
 */
async function waitForServer() {
  const startTime = Date.now();
  const timeoutMs = config.timeout * 1000;
  
  if (!config.quiet) {
    console.log(`🔍 Waiting for mock server on port ${config.port}...`);
    if (config.healthEndpoint) {
      console.log(`📊 Using health endpoint: /api/health/mock-server`);
    } else {
      console.log(`🏥 Using ready endpoint: /ready`);
    }
  }

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await checkServer();
      
      if (result.ready) {
        if (!config.quiet) {
          console.log('✅ Mock server is ready!');
          if (config.healthEndpoint && result.details) {
            console.log(`📊 Server uptime: ${result.details.uptime}s`);
            console.log(`📋 Available endpoints: ${result.details.endpoints?.total || 'unknown'}`);
            console.log(`🚀 Startup time: ${result.details.startupDuration || 'unknown'}ms`);
          }
        }
        return true;
      } else {
        if (!config.quiet) {
          console.log(`⏳ Server not ready yet, retrying...`);
        }
      }
    } catch (error) {
      if (!config.quiet) {
        // Only show first connection error to avoid spam
        if (Date.now() - startTime < config.interval * 2) {
          console.log(`🔄 Connecting to server... (${error.message})`);
        }
      }
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, config.interval));
  }
  
  return false;
}

/**
 * Main execution
 */
async function main() {
  try {
    const ready = await waitForServer();
    
    if (ready) {
      if (!config.quiet) {
        console.log(`🎉 Mock server is ready and accepting connections on port ${config.port}`);
      }
      process.exit(0);
    } else {
      console.error(`❌ Timeout waiting for mock server after ${config.timeout} seconds`);
      console.error(`🔧 Check if the server is running on port ${config.port}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error waiting for mock server: ${error.message}`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  if (!config.quiet) {
    console.log('\n🛑 Wait cancelled by user');
  }
  process.exit(1);
});

process.on('SIGTERM', () => {
  if (!config.quiet) {
    console.log('\n🛑 Wait terminated');
  }
  process.exit(1);
});

// Run the script
main();