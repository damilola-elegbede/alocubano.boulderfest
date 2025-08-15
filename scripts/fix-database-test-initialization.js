#!/usr/bin/env node

/**
 * Quick Fix Script for Database Test Initialization Issues
 * 
 * This script implements the critical fixes identified in the test failure analysis:
 * 1. Aligns test database initialization with production patterns
 * 2. Updates mock database service to match expected interface
 * 3. Ensures consistent async patterns across all test helpers
 * 
 * Run with: node scripts/fix-database-test-initialization.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Files to update
const FILES_TO_UPDATE = {
  'tests/helpers/db.js': updateDbHelper,
  'tests/helpers/mocks.js': updateMocksHelper,
  'tests/helpers/setup.js': updateSetupHelper,
  'tests/helpers/browser-polyfills.js': createBrowserPolyfills
};

/**
 * Update db.js helper with async initialization
 */
function updateDbHelper(content) {
  // Add the new async database creation function
  const asyncDbFunction = `
/**
 * Creates an async test database with proper initialization
 * Matches production database service interface
 */
export async function createAsyncTestDatabase() {
  const db = createTestDatabase();
  const client = createLibSQLAdapter(db);
  
  // Ensure client matches production interface
  client.ensureInitialized = async () => client;
  client.getClient = async () => client;
  
  // Add test connection method
  client.testConnection = async () => {
    try {
      const result = await client.execute("SELECT 1 as test");
      return result && result.rows && result.rows.length > 0;
    } catch {
      return false;
    }
  };
  
  return { db, client };
}
`;

  // Insert before the last export or at the end
  const exportIndex = content.lastIndexOf('export');
  if (exportIndex > -1) {
    return content.slice(0, exportIndex) + asyncDbFunction + '\n' + content.slice(exportIndex);
  }
  return content + asyncDbFunction;
}

/**
 * Update mocks.js helper with proper database mock
 */
function updateMocksHelper(content) {
  // Add the database mock factory
  const databaseMockFactory = `
/**
 * Creates a properly structured mock database service
 * Matches the production DatabaseService interface exactly
 */
export function createMockDatabaseService(client) {
  return {
    // Core initialization methods
    ensureInitialized: async () => client,
    getClient: async () => client,
    initializeClient: async () => client,
    
    // Connection management
    testConnection: async () => true,
    close: async () => {
      if (client && typeof client.close === 'function') {
        await client.close();
      }
    },
    
    // Query execution
    execute: async (sql, params) => {
      if (typeof sql === 'string') {
        return client.execute(sql, params);
      }
      return client.execute(sql);
    },
    
    // Batch operations
    batch: async (statements) => {
      if (client.batch) {
        return client.batch(statements);
      }
      // Fallback for simple implementations
      const results = [];
      for (const stmt of statements) {
        results.push(await client.execute(stmt));
      }
      return results;
    },
    
    // State properties
    initialized: true,
    client: client,
    initializationPromise: Promise.resolve(client),
    
    // Test helpers
    resetForTesting: async () => {
      if (client && typeof client.close === 'function') {
        await client.close();
      }
    },
    
    // Statistics
    getConnectionStats: () => ({
      activeConnections: 1,
      initialized: true,
      hasClient: true,
      hasInitPromise: true,
      timestamp: new Date().toISOString()
    }),
    
    // Health check
    healthCheck: async () => ({
      status: 'healthy',
      connectionStats: {
        activeConnections: 1,
        initialized: true,
        hasClient: true
      },
      timestamp: new Date().toISOString()
    })
  };
}

/**
 * Mock database client helper for tests that don't need a real database
 */
export function mockDatabaseClient(overrides = {}) {
  const defaults = {
    execute: vi.fn().mockResolvedValue({ 
      rows: [], 
      rowsAffected: 0,
      lastInsertRowid: 1
    }),
    batch: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue(true)
  };
  
  const client = { ...defaults, ...overrides };
  
  // Add convenience methods
  client.mockReset = () => {
    Object.values(client).forEach(fn => {
      if (fn && typeof fn.mockReset === 'function') {
        fn.mockReset();
      }
    });
  };
  
  return client;
}
`;

  // Check if function already exists
  if (content.includes('createMockDatabaseService')) {
    return content; // Already updated
  }

  // Insert before the last export or at the end
  const exportIndex = content.lastIndexOf('export');
  if (exportIndex > -1) {
    return content.slice(0, exportIndex) + databaseMockFactory + '\n' + content.slice(exportIndex);
  }
  return content + databaseMockFactory;
}

/**
 * Update setup.js helper with async database initialization
 */
function updateSetupHelper(content) {
  // Replace the database setup section
  const oldPattern = /\/\/ Database setup[\s\S]*?(?=\/\/ Mock setup)/;
  
  const newDatabaseSetup = `  // Database setup
  if (options.database !== false) {
    // Use async database creation for proper initialization
    const { createAsyncTestDatabase } = await import('./db.js');
    const { db, client } = await createAsyncTestDatabase();
    
    setup.database = db;
    setup.client = client;
    
    // Mock the database module to return our test client
    const { createMockDatabaseService } = await import('./mocks.js');
    const mockService = createMockDatabaseService(client);
    
    vi.doMock('../../api/lib/database.js', () => ({
      getDatabase: () => mockService,
      getDatabaseClient: async () => client,
      testConnection: async () => true,
      resetDatabaseInstance: async () => {
        await mockService.resetForTesting();
      },
      DatabaseService: class {
        constructor() {
          return mockService;
        }
      }
    }));

    // Seed with test data
    if (options.seed !== false) {
      const fixture = options.seed || "minimal";
      try {
        const { seedTestData } = await import('./db.js');
        seedTestData(setup.database, fixture);
      } catch (error) {
        // Continue without seeding if fixture doesn't exist
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  `;

  if (oldPattern.test(content)) {
    return content.replace(oldPattern, newDatabaseSetup);
  }
  
  // If pattern not found, warn but don't break
  console.warn('Could not find database setup section in setup.js - manual update may be needed');
  return content;
}

/**
 * Create browser polyfills helper
 */
function createBrowserPolyfills() {
  return `/**
 * Browser API Polyfills for JSDOM Tests
 * 
 * Provides mock implementations of browser APIs that are not available in JSDOM
 * but are expected by the application code.
 */

/**
 * Setup all browser polyfills for a JSDOM window
 */
export function setupBrowserPolyfills(window) {
  // PageTransition API (for navigation animations)
  if (!window.PageTransition) {
    window.PageTransition = class PageTransition {
      constructor() {
        this.finished = Promise.resolve();
        this.ready = Promise.resolve();
        this.updateCallbackDone = Promise.resolve();
      }
      
      skipTransition() {
        return Promise.resolve();
      }
    };
  }
  
  // ViewTransition API (modern alternative to PageTransition)
  if (!window.ViewTransition) {
    window.ViewTransition = class ViewTransition {
      constructor() {
        this.finished = Promise.resolve();
        this.ready = Promise.resolve();
        this.updateCallbackDone = Promise.resolve();
      }
      
      skipTransition() {
        // Immediately resolve
      }
    };
  }
  
  // document.startViewTransition
  if (!window.document.startViewTransition) {
    window.document.startViewTransition = (callback) => {
      if (callback) {
        callback();
      }
      return new window.ViewTransition();
    };
  }
  
  // matchMedia (for responsive design tests)
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {}
    });
  }
  
  // IntersectionObserver (for lazy loading)
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class IntersectionObserver {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.elements = new Set();
      }
      
      observe(element) {
        this.elements.add(element);
        // Immediately trigger callback for testing
        setTimeout(() => {
          this.callback([{
            target: element,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: element.getBoundingClientRect(),
            intersectionRect: element.getBoundingClientRect(),
            rootBounds: null,
            time: Date.now()
          }], this);
        }, 0);
      }
      
      unobserve(element) {
        this.elements.delete(element);
      }
      
      disconnect() {
        this.elements.clear();
      }
    };
  }
  
  // ResizeObserver (for responsive components)
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.elements = new Set();
      }
      
      observe(element) {
        this.elements.add(element);
      }
      
      unobserve(element) {
        this.elements.delete(element);
      }
      
      disconnect() {
        this.elements.clear();
      }
    };
  }
  
  // Web Animations API
  if (!window.Element.prototype.animate) {
    window.Element.prototype.animate = function(keyframes, options) {
      return {
        play: () => {},
        pause: () => {},
        cancel: () => {},
        finish: () => {},
        reverse: () => {},
        playbackRate: 1,
        currentTime: 0,
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        onfinish: null,
        oncancel: null
      };
    };
  }
  
  // requestIdleCallback
  if (!window.requestIdleCallback) {
    window.requestIdleCallback = (callback) => {
      const start = Date.now();
      return setTimeout(() => {
        callback({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
        });
      }, 1);
    };
  }
  
  if (!window.cancelIdleCallback) {
    window.cancelIdleCallback = clearTimeout;
  }
  
  // Performance Observer (for performance tests)
  if (!window.PerformanceObserver) {
    window.PerformanceObserver = class PerformanceObserver {
      constructor(callback) {
        this.callback = callback;
      }
      
      observe(options) {}
      disconnect() {}
    };
  }
  
  // Crypto.randomUUID (for unique IDs)
  if (!window.crypto) {
    window.crypto = {};
  }
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  }
  
  return window;
}

/**
 * Setup polyfills for a specific test scenario
 */
export function setupTestScenario(window, scenario) {
  setupBrowserPolyfills(window);
  
  switch (scenario) {
    case 'mobile':
      // Override matchMedia for mobile tests
      window.matchMedia = (query) => ({
        matches: query.includes('max-width: 768px'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {}
      });
      break;
      
    case 'desktop':
      // Override matchMedia for desktop tests
      window.matchMedia = (query) => ({
        matches: query.includes('min-width: 769px'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {}
      });
      break;
      
    case 'reduced-motion':
      // Override matchMedia for accessibility tests
      window.matchMedia = (query) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {}
      });
      break;
  }
  
  return window;
}
`;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Fixing Database Test Initialization Issues\n');
  
  let updatedCount = 0;
  let createdCount = 0;
  
  for (const [filePath, updateFn] of Object.entries(FILES_TO_UPDATE)) {
    const fullPath = join(rootDir, filePath);
    
    try {
      if (existsSync(fullPath)) {
        // Update existing file
        const content = readFileSync(fullPath, 'utf8');
        const updated = updateFn(content);
        
        if (updated !== content) {
          writeFileSync(fullPath, updated);
          console.log(`✅ Updated: ${filePath}`);
          updatedCount++;
        } else {
          console.log(`⏭️  Skipped: ${filePath} (already up to date)`);
        }
      } else {
        // Create new file
        const content = updateFn('');
        writeFileSync(fullPath, content);
        console.log(`✅ Created: ${filePath}`);
        createdCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files updated: ${updatedCount}`);
  console.log(`   Files created: ${createdCount}`);
  
  console.log('\n📝 Next Steps:');
  console.log('1. Update test files to use setupBrowserPolyfills() in beforeEach hooks');
  console.log('2. Replace createTestDatabase() with createAsyncTestDatabase() in integration tests');
  console.log('3. Run: npm test to verify fixes');
  console.log('4. Commit changes and push to CI');
}

// Run the script
main().catch(console.error);