/**
 * Foundation test utilities - simple, direct helpers for test setup and teardown
 * Total file: <150 lines, no function >20 lines
 */

// Basic test setup - initializes clean test environment
export function setupTest() {
  // Clear any existing global state
  global.testStartTime = Date.now();
  global.testCleanupTasks = [];
  
  // Basic environment setup
  if (typeof window !== 'undefined') {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
  }
}

// Basic test teardown - cleans up after test execution
export function teardownTest() {
  // Run any registered cleanup tasks
  if (global.testCleanupTasks) {
    global.testCleanupTasks.forEach(task => {
      try { task(); } catch (e) { /* ignore cleanup errors */ }
    });
  }
  
  // Clear global test state
  delete global.testStartTime;
  delete global.testCleanupTasks;
}

// Simple async wait helper for test timing
export function waitFor(conditionFn, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function check() {
      if (conditionFn()) {
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`waitFor timeout after ${timeoutMs}ms`));
      } else {
        setTimeout(check, 10);
      }
    }
    
    check();
  });
}

// Create test context object with common test data
export function createTestContext(overrides = {}) {
  const context = {
    timestamp: Date.now(),
    testId: Math.random().toString(36).substr(2, 9),
    cleanup: [],
    
    // Common test data
    mockUser: { id: 1, email: 'test@example.com', name: 'Test User' },
    mockTicket: { id: 'ticket_123', event: 'test-event', price: 50 },
    
    // Helper to register cleanup functions
    addCleanup(fn) {
      this.cleanup.push(fn);
      global.testCleanupTasks?.push(fn);
    },
    
    // Execute all cleanup for this context
    runCleanup() {
      this.cleanup.forEach(fn => {
        try { fn(); } catch (e) { /* ignore */ }
      });
      this.cleanup = [];
    }
  };
  
  return { ...context, ...overrides };
}

// Cleanup async resources like timers and intervals
export function cleanupAsync() {
  // Clear any pending timers (if in test environment)
  if (global.clearAllTimers) {
    global.clearAllTimers();
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
}

// Create mock HTTP request object
export function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/test',
    headers: options.headers || {},
    body: options.body || null,
    query: options.query || {},
    params: options.params || {},
    
    // Helper methods
    get(header) { return this.headers[header.toLowerCase()]; },
    json() { return Promise.resolve(this.body); }
  };
}

// Create mock HTTP response object
export function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    
    // Response methods
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    
    // Test helpers
    getStatus() { return this.statusCode; },
    getBody() { return this.body; }
  };
  
  return response;
}

// Simple sleep function for test delays
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}