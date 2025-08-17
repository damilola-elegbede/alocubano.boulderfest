/**
 * Global Setup for Integration Tests
 * Coordinates server lifecycle and global test state
 */
import { serverManager } from './server.js';
import { databaseHelper } from './database.js';

// DOM Polyfills for Virtual Scrolling Tests
if (typeof global !== 'undefined') {
  // Request Animation Frame polyfill
  global.requestAnimationFrame = global.requestAnimationFrame || function(callback) {
    return setTimeout(callback, 16);
  };
  
  global.cancelAnimationFrame = global.cancelAnimationFrame || function(id) {
    clearTimeout(id);
  };
  
  // IntersectionObserver polyfill
  global.IntersectionObserver = global.IntersectionObserver || class {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.options = options;
      this.observedElements = new Set();
    }
    
    observe(element) {
      this.observedElements.add(element);
      // Simulate intersection immediately for testing
      setTimeout(() => {
        this.callback([{
          target: element,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: element.getBoundingClientRect(),
          intersectionRect: element.getBoundingClientRect(),
          rootBounds: null,
          time: performance.now()
        }]);
      }, 10);
    }
    
    unobserve(element) {
      this.observedElements.delete(element);
    }
    
    disconnect() {
      this.observedElements.clear();
    }
  };
  
  // ResizeObserver polyfill
  global.ResizeObserver = global.ResizeObserver || class {
    constructor(callback) {
      this.callback = callback;
      this.observedElements = new Set();
    }
    
    observe(element) {
      this.observedElements.add(element);
      // Simulate resize event immediately for testing
      setTimeout(() => {
        this.callback([{
          target: element,
          contentRect: {
            width: element.offsetWidth || 800,
            height: element.offsetHeight || 600,
            top: 0,
            left: 0,
            bottom: element.offsetHeight || 600,
            right: element.offsetWidth || 800
          }
        }]);
      }, 10);
    }
    
    unobserve(element) {
      this.observedElements.delete(element);
    }
    
    disconnect() {
      this.observedElements.clear();
    }
  };
  
  // Performance polyfill
  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      timing: {},
      mark: () => {},
      measure: () => {},
      getEntriesByType: () => [],
      getEntriesByName: () => []
    };
  }
}

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
  const hasVercelToken = Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_TOKEN.trim());
  const useMockServer = isCI && !hasVercelToken;
  
  if (isCI) {
    console.log('📍 Running in CI environment');
    console.log(`   VERCEL_TOKEN: ${hasVercelToken ? 'Present ✅' : 'Missing ❌'}`);
    console.log(`   Server mode: ${useMockServer ? 'Mock 🎭' : 'Real Vercel 🔧'}`);
    if (useMockServer) {
      console.log('   Using mock server (no Vercel token available)');
      console.log('   To use real server in CI, ensure VERCEL_TOKEN is set in GitHub secrets');
    } else {
      console.log('   Using real Vercel server with authentication');
    }
  } else {
    console.log('💻 Running in local development environment');
  }
  
  try {
    // Always start server for integration tests unless explicitly disabled
    // When running all tests, we need the server available
    const forceSkipServer = process.env.SKIP_SERVER === 'true';
    const isDatabaseOnlyTest = process.argv.some(arg => 
      arg.includes('database-transactions') || 
      arg.includes('database-operations') ||
      arg.includes('migration-checksums')
    );
    const needsServer = !forceSkipServer && !isDatabaseOnlyTest && (
      process.env.INTEGRATION_NEEDS_SERVER === 'true' || 
      process.argv.length < 4 || // Running all tests
      process.argv.some(arg => arg.includes('integration')) || // Any integration test
      process.argv.some(arg => arg.includes('api-health') || 
                               arg.includes('http-server') ||
                               arg.includes('payments') ||
                               arg.includes('email') ||
                               arg.includes('stripe-webhooks'))
    );
    
    if (needsServer && !serverStarted) {
      console.log('🔧 Starting test server for HTTP/API tests...');
      const serverUrl = await serverManager.start();
      
      // The serverManager.start() already does a health check internally
      // No need to do another one here - it would fail if unhealthy
      
      console.log(`✅ Test server started and healthy at ${serverUrl}`);
      serverStarted = true;
    } else if (!needsServer) {
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