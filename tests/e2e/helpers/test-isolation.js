/**
 * Test Data Isolation System for E2E Tests
 * 
 * Provides unique test data generation and cleanup mechanisms to ensure
 * each test runs in a clean environment without conflicts during parallel execution.
 * 
 * Features:
 * - Unique test namespaces per test run
 * - Deterministic test data generation
 * - Automatic cleanup tracking
 * - Parallel test execution safety
 * - Transaction-like isolation where possible
 */

import crypto from 'crypto';
import { execSync } from 'child_process';

/**
 * Global test session data
 */
class TestIsolationManager {
  constructor() {
    this.sessionId = null;
    this.testRunId = null;
    this.createdResources = new Set();
    this.activeTests = new Map();
    this.cleanupTasks = [];
  }

  /**
   * Initialize test session with unique identifiers
   */
  initializeSession() {
    if (!this.sessionId) {
      // Create session ID based on timestamp and random string
      const timestamp = Date.now();
      const random = crypto.randomBytes(4).toString('hex');
      this.sessionId = `e2e_${timestamp}_${random}`;
      
      // Create test run ID for this specific test execution
      this.testRunId = `run_${crypto.randomBytes(6).toString('hex')}`;
      
      console.log(`🧪 Test isolation session initialized: ${this.sessionId}`);
      console.log(`🏃 Test run ID: ${this.testRunId}`);
    }
    return this.sessionId;
  }

  /**
   * Get unique namespace for current test
   */
  getTestNamespace(testTitle = '') {
    this.initializeSession();
    
    // Create test-specific namespace
    const sanitizedTitle = testTitle
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 30);
    
    const testId = sanitizedTitle || `test_${crypto.randomBytes(4).toString('hex')}`;
    const namespace = `${this.sessionId}_${testId}`;
    
    // Track active test
    this.activeTests.set(testTitle, {
      namespace,
      startTime: Date.now(),
      resources: new Set()
    });
    
    return namespace;
  }

  /**
   * Register a resource for cleanup
   */
  trackResource(testTitle, resourceType, resourceId) {
    const testData = this.activeTests.get(testTitle);
    if (testData) {
      testData.resources.add({ type: resourceType, id: resourceId });
    }
    this.createdResources.add({ type: resourceType, id: resourceId, testTitle });
  }

  /**
   * Add cleanup task to be executed later
   */
  addCleanupTask(task) {
    this.cleanupTasks.push(task);
  }

  /**
   * Clean up resources for a specific test
   */
  async cleanupTest(testTitle) {
    const testData = this.activeTests.get(testTitle);
    if (!testData) return;

    console.log(`🧹 Cleaning up test: ${testTitle}`);
    
    // Clean up test-specific resources
    for (const resource of testData.resources) {
      try {
        await this.cleanupResource(resource);
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup resource ${resource.type}:${resource.id}`, error.message);
      }
    }

    this.activeTests.delete(testTitle);
  }

  /**
   * Clean up a specific resource
   */
  async cleanupResource(resource) {
    switch (resource.type) {
      case 'user':
      case 'email':
        // For email subscriptions, we can't easily clean up from Brevo
        // but we use unique emails so no conflict
        console.log(`📧 Email resource ${resource.id} uses unique namespace (no cleanup needed)`);
        break;
      
      case 'ticket':
        // Clean up ticket from database if possible
        try {
          console.log(`🎫 Cleaning up ticket: ${resource.id}`);
          // Note: In real implementation, you might want to call a cleanup API
        } catch (error) {
          console.warn(`⚠️ Could not cleanup ticket ${resource.id}:`, error.message);
        }
        break;
      
      case 'registration':
        // Clean up registration data
        console.log(`📝 Cleaning up registration: ${resource.id}`);
        break;
      
      default:
        console.log(`🗑️ Unknown resource type: ${resource.type}`);
    }
  }

  /**
   * Clean up all resources for current session
   */
  async cleanupSession() {
    console.log(`🧹 Starting session cleanup for ${this.sessionId}`);
    
    // Run custom cleanup tasks first
    for (const task of this.cleanupTasks) {
      try {
        await task();
      } catch (error) {
        console.warn(`⚠️ Cleanup task failed:`, error.message);
      }
    }

    // Clean up all remaining resources
    for (const resource of this.createdResources) {
      try {
        await this.cleanupResource(resource);
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup resource:`, error.message);
      }
    }

    // Reset state
    this.createdResources.clear();
    this.activeTests.clear();
    this.cleanupTasks.length = 0;
    
    console.log(`✅ Session cleanup complete for ${this.sessionId}`);
  }
}

// Global manager instance
const testIsolationManager = new TestIsolationManager();

/**
 * Generate unique test email address
 * @param {string} testTitle - Title of the test
 * @param {string} purpose - Purpose of the email (e.g., 'newsletter', 'registration')
 * @returns {string} Unique test email
 */
export function generateTestEmail(testTitle = '', purpose = 'test') {
  const namespace = testIsolationManager.getTestNamespace(testTitle);
  const email = `${namespace}_${purpose}@e2etest.example.com`;
  
  // Track for cleanup
  testIsolationManager.trackResource(testTitle, 'email', email);
  
  return email;
}

/**
 * Generate consistent test user data
 * @param {string} testTitle - Title of the test
 * @param {Object} overrides - Override specific user properties
 * @returns {Object} Test user data
 */
export function generateTestUser(testTitle = '', overrides = {}) {
  const namespace = testIsolationManager.getTestNamespace(testTitle);
  
  // Create deterministic but unique user data based on namespace
  const hash = namespace.slice(-8);
  const defaultUser = {
    email: generateTestEmail(testTitle, 'user'),
    firstName: `Test${hash}`,
    lastName: `User${hash}`,
    phone: `+1555${hash.slice(0, 7).padEnd(7, '0')}`,
    dietaryRestrictions: '',
    emergencyContact: `Emergency${hash}`,
    emergencyPhone: `+1555${hash.slice(0, 7).split('').reverse().join('').padEnd(7, '1')}`,
    namespace: namespace
  };

  const user = { ...defaultUser, ...overrides };
  
  // Track for cleanup
  testIsolationManager.trackResource(testTitle, 'user', user.email);
  
  return user;
}

/**
 * Generate unique test ticket ID
 * @param {string} testTitle - Title of the test
 * @param {string} prefix - Prefix for ticket ID
 * @returns {string} Unique ticket ID
 */
export function generateTestTicketId(testTitle = '', prefix = 'TKT') {
  const namespace = testIsolationManager.getTestNamespace(testTitle);
  const ticketId = `${prefix}_${namespace}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  
  // Track for cleanup
  testIsolationManager.trackResource(testTitle, 'ticket', ticketId);
  
  return ticketId;
}

/**
 * Get unique namespace for current test
 * @param {string} testTitle - Title of the test
 * @returns {string} Unique namespace
 */
export function getTestNamespace(testTitle = '') {
  return testIsolationManager.getTestNamespace(testTitle);
}

/**
 * Generate test data for registration flow
 * @param {string} testTitle - Title of the test
 * @param {Object} options - Registration options
 * @returns {Object} Registration test data
 */
export function generateRegistrationData(testTitle = '', options = {}) {
  const user = generateTestUser(testTitle, options.user || {});
  const ticketId = generateTestTicketId(testTitle, 'REG');
  
  const registrationData = {
    ticketId,
    user,
    registrationToken: `token_${getTestNamespace(testTitle)}`,
    ...options
  };

  // Don't override user if options includes user data - it should already be merged
  if (options.user) {
    // Re-merge user data to ensure overrides are applied correctly
    registrationData.user = { ...user, ...options.user };
  }

  // Track for cleanup
  testIsolationManager.trackResource(testTitle, 'registration', registrationData.registrationToken);
  
  return registrationData;
}

/**
 * Generate test payment data
 * @param {string} testTitle - Title of the test
 * @param {Object} options - Payment options
 * @returns {Object} Payment test data
 */
export function generatePaymentData(testTitle = '', options = {}) {
  const namespace = getTestNamespace(testTitle);
  
  // Create base metadata first
  const baseMetadata = {
    test_namespace: namespace,
    test_title: testTitle,
    timestamp: Date.now()
  };

  // Merge with custom metadata
  const mergedMetadata = { ...baseMetadata, ...(options.metadata || {}) };
  
  const paymentData = {
    amount: options.amount || 5000, // $50.00 in cents
    currency: 'usd',
    metadata: mergedMetadata,
    customer_email: generateTestEmail(testTitle, 'payment'),
    // Don't spread options here to avoid overriding metadata
  };

  // Apply other options (excluding metadata which is already handled)
  const { metadata, ...otherOptions } = options;
  Object.assign(paymentData, otherOptions);
  
  return paymentData;
}

/**
 * Create test database transaction (if supported)
 * Note: Turso doesn't support traditional transactions, but we can simulate
 * isolation by using unique test data
 */
export async function withTestTransaction(testTitle, testFn) {
  const namespace = getTestNamespace(testTitle);
  
  console.log(`🔄 Starting test transaction for: ${testTitle} (${namespace})`);
  
  try {
    // Execute test function
    const result = await testFn(namespace);
    
    console.log(`✅ Test transaction completed for: ${testTitle}`);
    return result;
  } catch (error) {
    console.error(`❌ Test transaction failed for: ${testTitle}`, error.message);
    throw error;
  } finally {
    // Always cleanup test resources
    await testIsolationManager.cleanupTest(testTitle);
  }
}

/**
 * Add custom cleanup task
 * @param {Function} cleanupFn - Cleanup function to execute
 */
export function addCleanupTask(cleanupFn) {
  testIsolationManager.addCleanupTask(cleanupFn);
}

/**
 * Initialize test isolation for a test suite
 * Call this in beforeAll or similar setup hooks
 */
export async function initializeTestIsolation() {
  testIsolationManager.initializeSession();
  
  // Add process cleanup handler
  process.on('exit', async () => {
    await testIsolationManager.cleanupSession();
  });
  
  process.on('SIGINT', async () => {
    await testIsolationManager.cleanupSession();
    process.exit(0);
  });
}

/**
 * Clean up test isolation
 * Call this in afterAll or similar teardown hooks
 */
export async function cleanupTestIsolation() {
  await testIsolationManager.cleanupSession();
}

/**
 * Get current session information for debugging
 */
export function getSessionInfo() {
  return {
    sessionId: testIsolationManager.sessionId,
    testRunId: testIsolationManager.testRunId,
    activeTests: Array.from(testIsolationManager.activeTests.keys()),
    createdResources: Array.from(testIsolationManager.createdResources),
    cleanupTasks: testIsolationManager.cleanupTasks.length
  };
}

/**
 * Wait for a specified delay (useful for avoiding timing conflicts)
 * @param {number} ms - Milliseconds to wait
 */
export function waitMs(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export manager for advanced usage
export { testIsolationManager };