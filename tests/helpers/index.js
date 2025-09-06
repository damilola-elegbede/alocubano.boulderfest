/**
 * Test Helpers Index - Central export point for all test helpers
 * 
 * This file provides a single import point for all test helper utilities,
 * making it easy to access helpers from anywhere in the test suite.
 */

// Core helpers
export * from '../helpers.js';
export { default as coreHelpers } from '../helpers.js';

// Unit test helpers
export * from './unit-test-helpers.js';
export { default as unitHelpers } from './unit-test-helpers.js';

// API test helpers
export * from './api-test-helpers.js';
export { default as apiHelpers } from './api-test-helpers.js';

// Re-export commonly used utilities
export {
  // From core helpers
  testRequest,
  generateTestEmail,
  generateTestId,
  createTestHelper,
  HTTP_STATUS
} from '../helpers.js';

export {
  // From unit test helpers
  MockFactory,
  TestDataBuilder,
  AssertionHelpers,
  TestEnvironment,
  waitForCondition,
  createSpy,
  generateTestData
} from './unit-test-helpers.js';

export {
  // From API test helpers
  APIRequestBuilder,
  ResponseValidator,
  APITestSuite,
  APITestPatterns
} from './api-test-helpers.js';

/**
 * Helper factory - Create helper instances with configuration
 */
export const HelperFactory = {
  /**
   * Create API test helper
   * @param {Object} config - Configuration options
   * @returns {Object} Configured API helper
   */
  createAPIHelper(config = {}) {
    return {
      request: (method, path) => new APIRequestBuilder(method, path),
      validate: (response) => new ResponseValidator(response),
      suite: (basePath) => new APITestSuite(basePath),
      patterns: APITestPatterns,
      ...config
    };
  },

  /**
   * Create unit test helper
   * @param {Object} config - Configuration options
   * @returns {Object} Configured unit test helper
   */
  createUnitHelper(config = {}) {
    return {
      mock: MockFactory,
      builder: TestDataBuilder,
      assert: AssertionHelpers,
      env: TestEnvironment,
      spy: createSpy,
      wait: waitForCondition,
      generate: generateTestData,
      ...config
    };
  },

  /**
   * Create test environment
   * @param {Object} config - Environment configuration
   * @returns {Object} Test environment with all helpers
   */
  createTestEnvironment(config = {}) {
    const unitHelper = this.createUnitHelper(config.unit);
    const apiHelper = this.createAPIHelper(config.api);

    return {
      unit: unitHelper,
      api: apiHelper,
      
      // Common utilities
      generateEmail: generateTestEmail,
      generateId: generateTestId,
      request: testRequest,
      
      // Environment setup
      setup: () => unitHelper.env.create(config.environment),
      
      // Cleanup
      cleanup: () => {
        // Add any global cleanup logic here
        console.log('🧹 Cleaning up test environment');
      }
    };
  }
};

/**
 * Quick access helpers for common use cases
 */
export const QuickHelpers = {
  /**
   * Create a mock API response
   * @param {number} status - HTTP status
   * @param {Object} data - Response data
   * @returns {Object} Mock response
   */
  mockResponse: (status = 200, data = {}) => 
    MockFactory.createMockResponse(status, data),

  /**
   * Create test user data
   * @param {Object} overrides - Override values
   * @returns {Object} User data
   */
  testUser: (overrides = {}) => 
    TestDataBuilder.user().merge(overrides).build(),

  /**
   * Create test email
   * @param {string} prefix - Email prefix
   * @returns {string} Test email
   */
  testEmail: (prefix = 'test') => 
    `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`,

  /**
   * Make API request with validation
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} data - Request data
   * @param {number} expectedStatus - Expected response status
   * @returns {Promise<Object>} Validated response
   */
  apiRequest: async (method, path, data = null, expectedStatus = 200) => {
    const response = await testRequest(method, path, data);
    ResponseValidator.validate(response).hasStatus(expectedStatus);
    return response;
  },

  /**
   * Wait for API to be ready
   * @param {string} endpoint - Endpoint to check
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<boolean>} True if ready
   */
  waitForAPI: async (endpoint = '/api/health/check', timeout = 30000) => {
    return waitForCondition(
      async () => {
        try {
          const response = await testRequest('GET', endpoint);
          return response.status === 200;
        } catch {
          return false;
        }
      },
      timeout,
      1000
    );
  }
};

// Default export with all helpers organized
export default {
  // Core functionality
  core: {
    testRequest,
    generateTestEmail,
    generateTestId,
    createTestHelper,
    HTTP_STATUS
  },

  // Unit testing
  unit: {
    MockFactory,
    TestDataBuilder,
    AssertionHelpers,
    TestEnvironment,
    waitForCondition,
    createSpy,
    generateTestData
  },

  // API testing
  api: {
    APIRequestBuilder,
    ResponseValidator,
    APITestSuite,
    APITestPatterns
  },

  // Factory methods
  factory: HelperFactory,

  // Quick access methods
  quick: QuickHelpers
};