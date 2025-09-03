#!/usr/bin/env node

/**
 * DEPRECATED: Start Development Server with ngrok Tunnel
 * 
 * This script is DEPRECATED for E2E testing but PRESERVED for local development.
 * 
 * CURRENT STATUS:
 * - ✅ Still used for local development with external access (npm start)
 * - ❌ No longer used for E2E testing (switched to Vercel Preview Deployments)
 * 
 * LOCAL DEVELOPMENT USE:
 * Still useful for local development when external access is needed,
 * such as testing on mobile devices or sharing development URLs.
 * 
 * WARNING: This script is for LOCAL DEVELOPMENT ONLY.
 * DO NOT use ngrok in production or CI environments as it exposes
 * your local server to the public internet without proper security controls.
 * 
 * Security considerations:
 * - ngrok tunnels are publicly accessible
 * - No authentication is enforced by default
 * - Use only for local development and testing
 * 
 * @deprecated For E2E testing - use Vercel Preview Deployments instead  
 * @preserved For local development with external access
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

// Configuration
const NGROK_DOMAIN = process.env.NGROK_DOMAIN || 'alocubanoboulderfest.ngrok.io';
const BASE_PORT = 3000;
const MAX_PORT_ATTEMPTS = 10;

/**
 * Find an available port starting from the base port
 */
async function findAvailablePort(startPort = BASE_PORT) {
  for (let port = startPort; port < startPort + MAX_PORT_ATTEMPTS; port++) {
    try {
      // Check if port is in use
      await execAsync(`lsof -ti:${port}`);
      // If command succeeds, port is in use, continue
    } catch {
      // If command fails, port is available
      console.log(`✅ Found available port: ${port}`);
      return port;
    }
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + MAX_PORT_ATTEMPTS}`);
}

/**
 * Start the development server on the specified port
 */
function startServer(port) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Starting server on port ${port}...`);
    
    const env = { ...process.env, PORT: port.toString() };
    const serverProcess = spawn('npm', ['run', 'start:local'], {
      env,
      stdio: 'inherit',
      shell: true
    });

    serverProcess.on('error', reject);

    // Wait for server to be ready
    let attempts = 0;
    const maxAttempts = 30;
    
    const checkServer = setInterval(async () => {
      attempts++;
      
      try {
        const response = await fetch(`http://localhost:${port}/api/health/check`);
        if (response.ok) {
          clearInterval(checkServer);
          console.log(`✅ Server is ready on port ${port}`);
          resolve(serverProcess);
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          clearInterval(checkServer);
          serverProcess.kill();
          reject(new Error('Server failed to start within timeout'));
        }
      }
    }, 2000);
  });
}

/**
 * Start ngrok tunnel to the server
 */
async function startNgrok(port) {
  console.log(`🌐 Starting ngrok tunnel to port ${port}...`);
  
  // Check if ngrok is installed
  try {
    await execAsync('which ngrok');
  } catch {
    console.error('❌ ngrok is not installed. Please install it first:');
    console.error('   brew install ngrok/ngrok/ngrok  (macOS)');
    console.error('   or visit: https://ngrok.com/download');
    return null;
  }

  // Check for auth token
  const authToken = process.env.NGROK_AUTHTOKEN;
  if (!authToken) {
    console.warn('⚠️  NGROK_AUTHTOKEN not set. Using free tier (limited features).');
    console.warn('   Set your token: export NGROK_AUTHTOKEN=your_token_here');
  }

  // Start ngrok
  const ngrokCommand = authToken && NGROK_DOMAIN !== 'alocubanoboulderfest.ngrok.io'
    ? `ngrok http ${port} --domain=${NGROK_DOMAIN}`
    : `ngrok http ${port}`;
    
  const ngrokProcess = spawn(ngrokCommand, {
    shell: true,
    stdio: 'pipe'
  });

  // Wait for ngrok to be ready and capture URL
  return new Promise((resolve) => {
    let ngrokUrl = null;
    
    ngrokProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Look for the URL in ngrok output
      const urlMatch = output.match(/https:\/\/[^\s]+\.ngrok[^\s]+/);
      if (urlMatch && !ngrokUrl) {
        ngrokUrl = urlMatch[0];
        console.log(`✅ ngrok tunnel established:`);
        console.log(`   Local: http://localhost:${port}`);
        console.log(`   Public: ${ngrokUrl}`);
        resolve({ process: ngrokProcess, url: ngrokUrl });
      }
    });

    ngrokProcess.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.includes('ERR_NGROK')) {
        console.error('❌ ngrok error:', error);
      }
    });

    // Timeout fallback
    setTimeout(() => {
      if (!ngrokUrl) {
        console.warn('⚠️  Could not detect ngrok URL, but tunnel may still be running');
        console.warn('   Check ngrok dashboard: http://localhost:4040');
        resolve({ process: ngrokProcess, url: null });
      }
    }, 10000);
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('🎵 A Lo Cubano Boulder Fest - Development Server with ngrok');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let serverProcess = null;
  let ngrokProcess = null;
  
  try {
    // Find available port
    const port = await findAvailablePort();
    
    // Start server
    serverProcess = await startServer(port);
    
    // Start ngrok
    const ngrokResult = await startNgrok(port);
    if (ngrokResult) {
      ngrokProcess = ngrokResult.process;
      
      if (ngrokResult.url) {
        console.log('\n📱 Access your site at:');
        console.log(`   Local:  http://localhost:${port}`);
        console.log(`   Public: ${ngrokResult.url}`);
        console.log('\n📊 ngrok Inspector: http://localhost:4040');
      }
    }
    
    console.log('\n✨ Server is running! Press Ctrl+C to stop.\n');
    
  } catch (error) {
    console.error('❌ Failed to start:', error.message);
    process.exit(1);
  }
  
  // Handle shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    
    if (ngrokProcess) {
      console.log('   Stopping ngrok...');
      ngrokProcess.kill();
    }
    
    if (serverProcess) {
      console.log('   Stopping server...');
      serverProcess.kill();
    }
    
    console.log('👋 Goodbye!');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { findAvailablePort, startServer, startNgrok };