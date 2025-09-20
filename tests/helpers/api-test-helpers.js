/**
 * API Test Helpers - Utilities for testing API endpoints
 *
 * Provides comprehensive utilities for testing REST APIs,
 * including request builders, response validators, and
 * common testing patterns.
 */

// Standalone implementations to avoid vitest dependency issues
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429
};

const generateTestEmail = () => `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;

const testRequest = async (method, path, data = null, headers = {}) => {
  // This is a mock implementation for standalone use
  // In actual tests, this should be replaced by the real testRequest function
  console.warn('Using mock testRequest - replace with real implementation in tests');
  return {
    status: 200,
    data: { mock: true, method, path, data }
  };
};

/**
 * API Request Builder - Fluent builder for API requests
 */
export class APIRequestBuilder {
  constructor(method = 'GET', path = '') {
    this.config = {
      method,
      path,
      headers: {},
      body: null,
      expectedStatus: null,
      timeout: 30000
    };
  }

  /**
   * Set request path
   * @param {string} path - API path
   * @returns {APIRequestBuilder} Builder instance
   */
  to(path) {
    this.config.path = path;
    return this;
  }

  /**
   * Set request method
   * @param {string} method - HTTP method
   * @returns {APIRequestBuilder} Builder instance
   */
  method(method) {
    this.config.method = method;
    return this;
  }

  /**
   * Add header
   * @param {string} name - Header name
   * @param {string} value - Header value
   * @returns {APIRequestBuilder} Builder instance
   */
  header(name, value) {
    this.config.headers[name] = value;
    return this;
  }

  /**
   * Add multiple headers
   * @param {Object} headers - Headers object
   * @returns {APIRequestBuilder} Builder instance
   */
  headers(headers) {
    Object.assign(this.config.headers, headers);
    return this;
  }

  /**
   * Set request body
   * @param {any} body - Request body
   * @returns {APIRequestBuilder} Builder instance
   */
  body(body) {
    this.config.body = body;
    return this;
  }

  /**
   * Set JSON body
   * @param {Object} data - JSON data
   * @returns {APIRequestBuilder} Builder instance
   */
  json(data) {
    this.config.body = data;
    this.config.headers['Content-Type'] = 'application/json';
    return this;
  }

  /**
   * Set expected status code
   * @param {number} status - Expected HTTP status
   * @returns {APIRequestBuilder} Builder instance
   */
  expectStatus(status) {
    this.config.expectedStatus = status;
    return this;
  }

  /**
   * Set request timeout
   * @param {number} timeout - Timeout in milliseconds
   * @returns {APIRequestBuilder} Builder instance
   */
  timeout(timeout) {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Execute the request
   * @returns {Promise<Object>} Response object
   */
  async send() {
    const response = await testRequest(
      this.config.method,
      this.config.path,
      this.config.body,
      this.config.headers
    );

    // Validate expected status if specified
    if (this.config.expectedStatus !== null && response.status !== this.config.expectedStatus) {
      throw new Error(`Expected status ${this.config.expectedStatus}, got ${response.status}`);
    }

    return response;
  }

  /**
   * Create GET request
   * @param {string} path - API path
   * @returns {APIRequestBuilder} Builder instance
   */
  static get(path) {
    return new APIRequestBuilder('GET', path);
  }

  /**
   * Create POST request
   * @param {string} path - API path
   * @returns {APIRequestBuilder} Builder instance
   */
  static post(path) {
    return new APIRequestBuilder('POST', path);
  }

  /**
   * Create PUT request
   * @param {string} path - API path
   * @returns {APIRequestBuilder} Builder instance
   */
  static put(path) {
    return new APIRequestBuilder('PUT', path);
  }

  /**
   * Create DELETE request
   * @param {string} path - API path
   * @returns {APIRequestBuilder} Builder instance
   */
  static delete(path) {
    return new APIRequestBuilder('DELETE', path);
  }

  /**
   * Create PATCH request
   * @param {string} path - API path
   * @returns {APIRequestBuilder} Builder instance
   */
  static patch(path) {
    return new APIRequestBuilder('PATCH', path);
  }
}

/**
 * Response Validator - Validates API responses
 */
export class ResponseValidator {
  constructor(response) {
    this.response = response;
  }

  /**
   * Assert response status
   * @param {number} expectedStatus - Expected status code
   * @throws {Error} If status doesn't match
   */
  hasStatus(expectedStatus) {
    if (this.response.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus}, got ${this.response.status}. ` +
        `Response: ${JSON.stringify(this.response.data)}`
      );
    }
    return this;
  }

  /**
   * Assert response has property
   * @param {string} property - Property path (dot notation supported)
   * @throws {Error} If property is missing
   */
  hasProperty(property) {
    const value = this.getNestedProperty(this.response.data, property);
    if (value === undefined) {
      throw new Error(`Response missing property: ${property}`);
    }
    return this;
  }

  /**
   * Assert response property value
   * @param {string} property - Property path
   * @param {any} expectedValue - Expected value
   * @throws {Error} If value doesn't match
   */
  hasPropertyValue(property, expectedValue) {
    const value = this.getNestedProperty(this.response.data, property);
    if (value !== expectedValue) {
      throw new Error(
        `Property ${property} expected ${expectedValue}, got ${value}`
      );
    }
    return this;
  }

  /**
   * Assert response is JSON
   * @throws {Error} If response is not valid JSON
   */
  isJSON() {
    if (typeof this.response.data !== 'object' || this.response.data === null) {
      throw new Error('Response is not valid JSON');
    }
    return this;
  }

  /**
   * Assert response has error
   * @param {string} expectedError - Expected error message (optional)
   * @throws {Error} If no error found
   */
  hasError(expectedError = null) {
    const error = this.response.data.error || this.response.data.message;

    if (!error) {
      throw new Error('Response does not contain error');
    }

    if (expectedError && error !== expectedError) {
      throw new Error(`Expected error "${expectedError}", got "${error}"`);
    }

    return this;
  }

  /**
   * Assert response is successful (2xx status)
   * @throws {Error} If status is not 2xx
   */
  isSuccess() {
    if (this.response.status < 200 || this.response.status >= 300) {
      throw new Error(
        `Response is not successful: ${this.response.status} ${JSON.stringify(this.response.data)}`
      );
    }
    return this;
  }

  /**
   * Assert response data is array
   * @param {number} expectedLength - Expected array length (optional)
   * @throws {Error} If not array or wrong length
   */
  isArray(expectedLength = null) {
    if (!Array.isArray(this.response.data)) {
      throw new Error('Response data is not an array');
    }

    if (expectedLength !== null && this.response.data.length !== expectedLength) {
      throw new Error(
        `Expected array length ${expectedLength}, got ${this.response.data.length}`
      );
    }

    return this;
  }

  /**
   * Custom validation function
   * @param {Function} validator - Custom validation function
   * @throws {Error} If validation fails
   */
  custom(validator) {
    const result = validator(this.response);
    if (result !== true) {
      throw new Error(result || 'Custom validation failed');
    }
    return this;
  }

  /**
   * Get nested property value
   * @param {Object} obj - Object to search
   * @param {string} path - Property path (dot notation)
   * @returns {any} Property value
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key];
    }, obj);
  }

  /**
   * Create validator instance
   * @param {Object} response - Response to validate
   * @returns {ResponseValidator} Validator instance
   */
  static validate(response) {
    return new ResponseValidator(response);
  }
}

/**
 * API Test Suite Builder - Builds common API test scenarios
 */
export class APITestSuite {
  constructor(basePath) {
    this.basePath = basePath;
    this.tests = [];
  }

  /**
   * Add health check test
   * @param {string} endpoint - Health check endpoint
   * @returns {APITestSuite} Suite instance
   */
  healthCheck(endpoint = '/api/health/check') {
    this.tests.push({
      name: 'Health Check',
      async run() {
        const response = await APIRequestBuilder.get(endpoint).send();
        ResponseValidator.validate(response).hasStatus(HTTP_STATUS.OK);
      }
    });
    return this;
  }

  /**
   * Add CRUD operations tests
   * @param {Object} config - CRUD test configuration
   * @returns {APITestSuite} Suite instance
   */
  crud(config) {
    const {
      createEndpoint,
      readEndpoint,
      updateEndpoint,
      deleteEndpoint,
      testData,
      idField = 'id'
    } = config;

    // CREATE test
    if (createEndpoint) {
      this.tests.push({
        name: 'Create Resource',
        async run() {
          const response = await APIRequestBuilder.post(createEndpoint)
            .json(testData.create)
            .send();

          ResponseValidator.validate(response)
            .hasStatus(HTTP_STATUS.OK)
            .hasProperty(idField);

          return response.data;
        }
      });
    }

    // READ test
    if (readEndpoint) {
      this.tests.push({
        name: 'Read Resource',
        async run(createdResource) {
          const endpoint = readEndpoint.replace(`:${idField}`, createdResource[idField]);
          const response = await APIRequestBuilder.get(endpoint).send();

          ResponseValidator.validate(response)
            .hasStatus(HTTP_STATUS.OK)
            .hasProperty(idField);
        }
      });
    }

    // UPDATE test
    if (updateEndpoint) {
      this.tests.push({
        name: 'Update Resource',
        async run(createdResource) {
          const endpoint = updateEndpoint.replace(`:${idField}`, createdResource[idField]);
          const response = await APIRequestBuilder.put(endpoint)
            .json(testData.update)
            .send();

          ResponseValidator.validate(response).hasStatus(HTTP_STATUS.OK);
        }
      });
    }

    // DELETE test
    if (deleteEndpoint) {
      this.tests.push({
        name: 'Delete Resource',
        async run(createdResource) {
          const endpoint = deleteEndpoint.replace(`:${idField}`, createdResource[idField]);
          const response = await APIRequestBuilder.delete(endpoint).send();

          ResponseValidator.validate(response).hasStatus(HTTP_STATUS.OK);
        }
      });
    }

    return this;
  }

  /**
   * Add validation tests
   * @param {string} endpoint - Endpoint to test
   * @param {Array} validationTests - Validation test cases
   * @returns {APITestSuite} Suite instance
   */
  validation(endpoint, validationTests) {
    validationTests.forEach(testCase => {
      this.tests.push({
        name: `Validation: ${testCase.name}`,
        async run() {
          const response = await APIRequestBuilder.post(endpoint)
            .json(testCase.data)
            .send();

          ResponseValidator.validate(response)
            .hasStatus(testCase.expectedStatus || HTTP_STATUS.BAD_REQUEST);

          if (testCase.expectedError) {
            ResponseValidator.validate(response).hasError(testCase.expectedError);
          }
        }
      });
    });

    return this;
  }

  /**
   * Add security tests
   * @param {string} endpoint - Endpoint to test
   * @param {Object} securityConfig - Security test configuration
   * @returns {APITestSuite} Suite instance
   */
  security(endpoint, securityConfig = {}) {
    const {
      requiresAuth = true,
      rateLimited = false,
      csrfProtection = false
    } = securityConfig;

    // Unauthorized access test
    if (requiresAuth) {
      this.tests.push({
        name: 'Security: Unauthorized Access',
        async run() {
          const response = await APIRequestBuilder.post(endpoint)
            .json({ test: 'data' })
            .send();

          ResponseValidator.validate(response).hasStatus(HTTP_STATUS.UNAUTHORIZED);
        }
      });
    }

    // Rate limiting test
    if (rateLimited) {
      this.tests.push({
        name: 'Security: Rate Limiting',
        async run() {
          // Make multiple rapid requests
          const requests = Array(10).fill().map(() =>
            APIRequestBuilder.post(endpoint).json({ test: 'data' }).send()
          );

          const responses = await Promise.all(requests);

          // At least one should be rate limited
          const rateLimited = responses.some(r => r.status === HTTP_STATUS.TOO_MANY_REQUESTS);
          if (!rateLimited) {
            throw new Error('Expected rate limiting, but none occurred');
          }
        }
      });
    }

    return this;
  }

  /**
   * Execute all tests in the suite
   * @returns {Promise<Object>} Test results
   */
  async run() {
    const results = {
      total: this.tests.length,
      passed: 0,
      failed: 0,
      details: []
    };

    let sharedContext = null;

    for (const test of this.tests) {
      try {
        console.log(`🧪 Running: ${test.name}`);
        const result = await test.run(sharedContext);

        // Pass result to next test if it returns something
        if (result) {
          sharedContext = result;
        }

        results.passed++;
        results.details.push({
          name: test.name,
          status: 'passed',
          duration: 0 // Could add timing
        });

        console.log(`✅ ${test.name} passed`);
      } catch (error) {
        results.failed++;
        results.details.push({
          name: test.name,
          status: 'failed',
          error: error.message,
          duration: 0
        });

        console.log(`❌ ${test.name} failed: ${error.message}`);
      }
    }

    return results;
  }
}

/**
 * Common API test patterns
 */
export const APITestPatterns = {
  /**
   * Test email endpoint
   * @param {string} endpoint - Email endpoint
   * @returns {Object} Test results
   */
  async testEmailEndpoint(endpoint) {
    const validEmail = generateTestEmail();
    const invalidCases = [
      { email: '', expectedError: 'Email required' },
      { email: 'invalid-email', expectedError: 'Invalid email format' },
      { email: 'test@', expectedError: 'Invalid email format' }
    ];

    const suite = new APITestSuite(endpoint)
      .validation(endpoint, [
        {
          name: 'Valid Email',
          data: { email: validEmail, consent: true },
          expectedStatus: HTTP_STATUS.OK
        },
        ...invalidCases.map(testCase => ({
          name: `Invalid Email: ${testCase.email || 'empty'}`,
          data: testCase,
          expectedStatus: HTTP_STATUS.BAD_REQUEST,
          expectedError: testCase.expectedError
        }))
      ]);

    return await suite.run();
  },

  /**
   * Test authentication endpoint
   * @param {string} endpoint - Auth endpoint
   * @param {Object} validCredentials - Valid credentials
   * @returns {Object} Test results
   */
  async testAuthEndpoint(endpoint, validCredentials) {
    const suite = new APITestSuite(endpoint)
      .validation(endpoint, [
        {
          name: 'Valid Credentials',
          data: validCredentials,
          expectedStatus: HTTP_STATUS.OK
        },
        {
          name: 'Invalid Password',
          data: { ...validCredentials, password: 'wrong' },
          expectedStatus: HTTP_STATUS.UNAUTHORIZED,
          expectedError: 'Invalid password'
        },
        {
          name: 'Missing Password',
          data: { username: validCredentials.username },
          expectedStatus: HTTP_STATUS.BAD_REQUEST
        }
      ]);

    return await suite.run();
  }
};

// Export main classes and utilities
export default {
  APIRequestBuilder,
  ResponseValidator,
  APITestSuite,
  APITestPatterns
};