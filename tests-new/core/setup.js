/**
 * Global Setup for Integration Tests
 * Coordinates server lifecycle and global test state
 */
import { serverManager } from './server.js';
import { databaseHelper } from './database.js';

let globalSetupComplete = false;
let serverStarted = false;

/**
 * Global setup - runs once before all tests
 */
export async function setup() {
  if (globalSetupComplete) {
    return;
  }

  console.log('🚀 Starting integration test environment...');
  
  // Detect environment and mode
  const isCI = process.env.CI === 'true';
  const hasVercelToken = Boolean(process.env.VERCEL_TOKEN);
  const useMockServer = isCI && !hasVercelToken;
  
  if (isCI) {
    console.log('📍 Running in CI environment');
    if (useMockServer) {
      console.log('🎭 Using mock server (no Vercel token available)');
      console.log('   To use real server in CI, add VERCEL_TOKEN to GitHub secrets');
    } else {
      console.log('🔧 Using real Vercel server (token available)');
    }
  } else {
    console.log('💻 Running in local development environment');
  }
  
  try {
    // Check if we need to start the server (only for HTTP/API tests)
    const needsServer = process.env.INTEGRATION_NEEDS_SERVER === 'true' || 
                       process.argv.some(arg => arg.includes('api-health') || 
                                              arg.includes('http-server') ||
                                              arg.includes('payments') ||
                                              arg.includes('email') ||
                                              arg.includes('stripe-webhooks'));
    
    // Explicitly exclude tests that don't need server
    const skipServer = process.argv.some(arg => arg.includes('simple-connectivity') ||
                                              arg.includes('database-operations') ||
                                              arg.includes('database-transactions') ||
                                              arg.includes('admin-auth'));
    
    if (needsServer && !skipServer && !serverStarted) {
      console.log('🔧 Starting test server for HTTP/API tests...');
      const serverUrl = await serverManager.start();
      
      // Verify server is healthy
      const healthCheck = await serverManager.healthCheck();
      if (!healthCheck.healthy) {
        throw new Error(`Server health check failed: ${healthCheck.error || 'Unknown error'}`);
      }
      
      console.log(`✅ Test server started and healthy at ${serverUrl}`);
      serverStarted = true;
    } else if (!needsServer || skipServer) {
      console.log('⏭️ Skipping server startup (not needed for this test)');
    } else {
      console.log('ℹ️ Server already started');
    }
    
    // Initialize database for tests
    try {
      await databaseHelper.initialize();
      console.log('✅ Database initialized for testing');
    } catch (error) {
      console.warn('⚠️ Database initialization failed:', error.message);
      // Don't fail setup for database issues if server tests don't need it
      if (needsServer) {
        throw error;
      }
    }
    
    globalSetupComplete = true;
    console.log('✅ Integration test environment ready');
  } catch (error) {
    console.error('❌ Failed to setup integration test environment:', error);
    
    // Clean up on failure
    try {
      await teardown();
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * Global teardown - runs once after all tests
 */
export async function teardown() {
  if (!globalSetupComplete && !serverStarted) {
    return;
  }

  console.log('🧹 Cleaning up integration test environment...');
  
  const cleanupTasks = [];
  
  // Stop the test server if it was started
  if (serverStarted && serverManager.isServerRunning()) {
    cleanupTasks.push(
      serverManager.stop().then(() => {
        console.log('✅ Test server stopped');
        serverStarted = false;
      }).catch(error => {
        console.error('❌ Error stopping server:', error);
      })
    );
  }
  
  // Cleanup database
  cleanupTasks.push(
    databaseHelper.cleanup().then(() => {
      console.log('✅ Database cleaned up');
    }).catch(error => {
      console.error('❌ Error cleaning up database:', error);
    })
  );
  
  // Wait for all cleanup tasks to complete
  try {
    await Promise.allSettled(cleanupTasks);
    globalSetupComplete = false;
    console.log('✅ Integration test environment cleaned up');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    // Don't throw during cleanup to avoid masking test failures
  }
}

/**
 * Get server URL if available
 */
export function getServerUrl() {
  if (serverStarted && serverManager.isServerRunning()) {
    return serverManager.getUrl();
  }
  return null;
}

/**
 * Check if server is available
 */
export function isServerAvailable() {
  return serverStarted && serverManager.isServerRunning();
}

// Auto-setup when module is imported
await setup();