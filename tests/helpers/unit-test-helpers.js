/**
 * Unit Test Helpers - Utilities specifically for unit testing
 *
 * Provides mock factories, test utilities, and common patterns
 * for unit testing individual components and functions.
 */

/**
 * Mock Factory - Creates consistent mocks for testing
 */
export class MockFactory {
  /**
   * Create mock HTTP response
   * @param {number} status - HTTP status code
   * @param {Object} data - Response data
   * @param {Object} headers - Response headers
   * @returns {Object} Mock response
   */
  static createMockResponse(status = 200, data = {}, headers = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: this.getStatusText(status),
      headers: {
        'content-type': 'application/json',
        ...headers
      },
      json: async () => data,
      text: async () => JSON.stringify(data),
      blob: async () => new Blob([JSON.stringify(data)]),
      clone: () => this.createMockResponse(status, data, headers)
    };
  }

  /**
   * Create mock fetch function
   * @param {Object|Function} responseConfig - Response config or function
   * @returns {Function} Mock fetch function
   */
  static createMockFetch(responseConfig) {
    if (typeof responseConfig === 'function') {
      return responseConfig;
    }

    return async (url, options = {}) => {
      console.log(`📡 Mock fetch: ${options.method || 'GET'} ${url}`);

      if (responseConfig.delay) {
        await new Promise(resolve => setTimeout(resolve, responseConfig.delay));
      }

      if (responseConfig.error) {
        throw new Error(responseConfig.error);
      }

      return this.createMockResponse(
        responseConfig.status || 200,
        responseConfig.data || {},
        responseConfig.headers || {}
      );
    };
  }

  /**
   * Create mock DOM element
   * @param {string} tagName - Element tag name
   * @param {Object} attributes - Element attributes
   * @param {string} textContent - Element text content
   * @returns {Object} Mock DOM element
   */
  static createMockElement(tagName = 'div', attributes = {}, textContent = '') {
    const element = {
      tagName: tagName.toUpperCase(),
      attributes: new Map(),
      style: {},
      classList: new Set(),
      textContent,
      innerHTML: textContent,
      children: [],
      parentElement: null,

      // Attribute methods
      getAttribute(name) {
        return this.attributes.get(name) || null;
      },

      setAttribute(name, value) {
        this.attributes.set(name, String(value));
      },

      hasAttribute(name) {
        return this.attributes.has(name);
      },

      removeAttribute(name) {
        this.attributes.delete(name);
      },

      // Class methods
      addClass(className) {
        this.classList.add(className);
      },

      removeClass(className) {
        this.classList.delete(className);
      },

      hasClass(className) {
        return this.classList.has(className);
      },

      // Query methods
      querySelector(selector) {
        // Simple mock - always returns null
        return null;
      },

      querySelectorAll(selector) {
        // Simple mock - always returns empty array
        return [];
      },

      // Event methods
      addEventListener(event, handler) {
        if (!this._eventListeners) this._eventListeners = {};
        if (!this._eventListeners[event]) this._eventListeners[event] = [];
        this._eventListeners[event].push(handler);
      },

      removeEventListener(event, handler) {
        if (!this._eventListeners || !this._eventListeners[event]) return;
        const index = this._eventListeners[event].indexOf(handler);
        if (index > -1) this._eventListeners[event].splice(index, 1);
      },

      dispatchEvent(event) {
        if (!this._eventListeners || !this._eventListeners[event.type]) return;
        this._eventListeners[event.type].forEach(handler => handler(event));
      }
    };

    // Set initial attributes
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }

    return element;
  }

  /**
   * Create mock local storage
   * @param {Object} initialData - Initial storage data
   * @returns {Object} Mock localStorage
   */
  static createMockLocalStorage(initialData = {}) {
    const storage = new Map(Object.entries(initialData));

    return {
      getItem(key) {
        return storage.get(key) || null;
      },

      setItem(key, value) {
        storage.set(key, String(value));
      },

      removeItem(key) {
        storage.delete(key);
      },

      clear() {
        storage.clear();
      },

      key(index) {
        const keys = Array.from(storage.keys());
        return keys[index] || null;
      },

      get length() {
        return storage.size;
      }
    };
  }

  /**
   * Get HTTP status text
   * @param {number} status - HTTP status code
   * @returns {string} Status text
   */
  static getStatusText(status) {
    const statusTexts = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      429: 'Too Many Requests',
      500: 'Internal Server Error'
    };
    return statusTexts[status] || 'Unknown';
  }
}

/**
 * Test Data Builder - Fluent builder for test data
 */
export class TestDataBuilder {
  constructor(type = 'generic') {
    this.type = type;
    this.data = {};
    this.timestamp = Date.now();
  }

  /**
   * Set a property value
   * @param {string} key - Property key
   * @param {any} value - Property value
   * @returns {TestDataBuilder} Builder instance
   */
  with(key, value) {
    this.data[key] = value;
    return this;
  }

  /**
   * Merge an object into the data
   * @param {Object} obj - Object to merge
   * @returns {TestDataBuilder} Builder instance
   */
  merge(obj) {
    Object.assign(this.data, obj);
    return this;
  }

  /**
   * Build the final data object
   * @returns {Object} Built data object
   */
  build() {
    return {
      id: `test_${this.type}_${this.timestamp}_${Math.random().toString(36).slice(2)}`,
      type: this.type,
      createdAt: new Date().toISOString(),
      ...this.data
    };
  }

  /**
   * Create a new builder instance
   * @param {string} type - Data type
   * @returns {TestDataBuilder} New builder instance
   */
  static create(type = 'generic') {
    return new TestDataBuilder(type);
  }

  /**
   * Create user data builder
   * @returns {TestDataBuilder} User data builder
   */
  static user() {
    return new TestDataBuilder('user')
      .with('firstName', 'Test')
      .with('lastName', 'User')
      .with('email', `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`)
      .with('phone', '+1234567890');
  }

  /**
   * Create ticket data builder
   * @returns {TestDataBuilder} Ticket data builder
   */
  static ticket() {
    return new TestDataBuilder('ticket')
      .with('type', 'weekend-pass')
      .with('price', 85.00)
      .with('quantity', 1)
      .with('status', 'available');
  }

  /**
   * Create registration data builder
   * @returns {TestDataBuilder} Registration data builder
   */
  static registration() {
    return new TestDataBuilder('registration')
      .with('status', 'pending')
      .with('ticketId', `ticket_${Date.now()}`)
      .with('userEmail', `test.${Date.now()}@example.com`);
  }
}

/**
 * Assertion Helpers - Custom assertion utilities
 */
export class AssertionHelpers {
  /**
   * Assert that an object has expected properties
   * @param {Object} obj - Object to check
   * @param {Array} properties - Required properties
   * @throws {Error} If properties are missing
   */
  static hasProperties(obj, properties) {
    const missing = properties.filter(prop => !(prop in obj));
    if (missing.length > 0) {
      throw new Error(`Missing properties: ${missing.join(', ')}`);
    }
  }

  /**
   * Assert that a value is a valid email
   * @param {string} email - Email to validate
   * @throws {Error} If email is invalid
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }
  }

  /**
   * Assert that a value is within a range
   * @param {number} value - Value to check
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @throws {Error} If value is out of range
   */
  static isInRange(value, min, max) {
    if (value < min || value > max) {
      throw new Error(`Value ${value} is not in range [${min}, ${max}]`);
    }
  }

  /**
   * Assert that a string matches a pattern
   * @param {string} str - String to check
   * @param {RegExp} pattern - Pattern to match
   * @throws {Error} If string doesn't match
   */
  static matchesPattern(str, pattern) {
    if (!pattern.test(str)) {
      throw new Error(`String "${str}" does not match pattern ${pattern}`);
    }
  }

  /**
   * Assert that an array has expected length
   * @param {Array} arr - Array to check
   * @param {number} expectedLength - Expected length
   * @throws {Error} If length doesn't match
   */
  static hasLength(arr, expectedLength) {
    if (arr.length !== expectedLength) {
      throw new Error(`Expected array length ${expectedLength}, got ${arr.length}`);
    }
  }
}

/**
 * Test Environment Utilities
 */
export class TestEnvironment {
  /**
   * Create isolated test environment
   * @param {Object} config - Environment configuration
   * @returns {Object} Test environment
   */
  static create(config = {}) {
    const env = {
      // Mock global objects
      localStorage: MockFactory.createMockLocalStorage(config.localStorage),
      sessionStorage: MockFactory.createMockLocalStorage(config.sessionStorage),
      fetch: MockFactory.createMockFetch(config.fetch || {}),

      // Environment state
      config,
      cleanupTasks: [],

      // Cleanup method
      cleanup() {
        this.cleanupTasks.forEach(task => {
          try {
            task();
          } catch (error) {
            console.warn('Cleanup task failed:', error);
          }
        });
        this.cleanupTasks = [];
      },

      // Add cleanup task
      addCleanup(task) {
        this.cleanupTasks.push(task);
      }
    };

    return env;
  }

  /**
   * Setup browser environment mocks
   * @param {Object} globalObj - Global object to modify (e.g., global, window)
   * @param {Object} config - Mock configuration
   * @returns {Function} Cleanup function
   */
  static setupBrowserMocks(globalObj = global, config = {}) {
    const originalValues = {};

    // Mock fetch
    if (!globalObj.fetch && config.fetch !== false) {
      globalObj.fetch = MockFactory.createMockFetch(config.fetch || {});
    }

    // Mock localStorage
    if (!globalObj.localStorage && config.localStorage !== false) {
      originalValues.localStorage = globalObj.localStorage;
      globalObj.localStorage = MockFactory.createMockLocalStorage(config.localStorage);
    }

    // Mock sessionStorage
    if (!globalObj.sessionStorage && config.sessionStorage !== false) {
      originalValues.sessionStorage = globalObj.sessionStorage;
      globalObj.sessionStorage = MockFactory.createMockLocalStorage(config.sessionStorage);
    }

    // Mock document if needed
    if (!globalObj.document && config.document !== false) {
      originalValues.document = globalObj.document;
      globalObj.document = {
        createElement: (tagName) => MockFactory.createMockElement(tagName),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
      };
    }

    // Return cleanup function
    return () => {
      for (const [key, value] of Object.entries(originalValues)) {
        if (value === undefined) {
          delete globalObj[key];
        } else {
          globalObj[key] = value;
        }
      }
    };
  }
}

/**
 * Common test utilities
 */

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>} True if condition met, false if timeout
 */
export async function waitForCondition(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Create spy function
 * @param {Function} originalFn - Original function to spy on
 * @returns {Function} Spy function with call tracking
 */
export function createSpy(originalFn = () => {}) {
  const calls = [];

  const spy = function(...args) {
    calls.push({ args, timestamp: Date.now() });
    return originalFn.apply(this, args);
  };

  spy.calls = calls;
  spy.callCount = () => calls.length;
  spy.calledWith = (...expectedArgs) => {
    return calls.some(call =>
      call.args.length === expectedArgs.length &&
      call.args.every((arg, i) => arg === expectedArgs[i])
    );
  };
  spy.reset = () => calls.length = 0;

  return spy;
}

/**
 * Generate random test data
 * @param {string} type - Type of data to generate
 * @param {Object} overrides - Override default values
 * @returns {any} Generated test data
 */
export function generateTestData(type, overrides = {}) {
  switch (type) {
    case 'email':
      return `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;

    case 'phone':
      return '+1' + Math.floor(Math.random() * 9000000000 + 1000000000);

    case 'id':
      return `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    case 'user':
      return TestDataBuilder.user().merge(overrides).build();

    case 'ticket':
      return TestDataBuilder.ticket().merge(overrides).build();

    case 'registration':
      return TestDataBuilder.registration().merge(overrides).build();

    default:
      return TestDataBuilder.create(type).merge(overrides).build();
  }
}

/**
 * Database Test Helpers - Create test data in database
 * Use these helpers when tests need specific database records beyond base seed data
 */

// Re-export base data for tests that need to reference it
export { BASE_EVENT, BASE_TICKETS, BASE_TRANSACTION } from '../fixtures/seed-base-data.js';

/**
 * Create test event with unique data
 * Use this when tests need a specific event beyond the BASE_EVENT
 *
 * @param {Object} db - Database client (@libsql/client)
 * @param {Object} overrides - Override default event values
 * @returns {Promise<Object>} Created event with id
 */
export async function createTestEvent(db, overrides = {}) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 10000);
  const event = {
    slug: `test-event-${uniqueId}`,
    name: `Test Event ${uniqueId}`,
    type: 'festival',
    status: 'active',
    description: 'Test event for unit testing',
    venue_name: 'Test Venue',
    venue_address: '123 Test St',
    venue_city: 'Boulder',
    venue_state: 'CO',
    venue_zip: '80301',
    start_date: '2026-06-01',
    end_date: '2026-06-03',
    max_capacity: 200,
    early_bird_end_date: '2026-05-01',
    regular_price_start_date: '2026-05-02',
    display_order: 0,
    is_featured: false,
    is_visible: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };

  const result = await db.execute({
    sql: `INSERT INTO events
          (slug, name, type, status, description, venue_name, venue_address, venue_city, venue_state, venue_zip,
           start_date, end_date, max_capacity, early_bird_end_date, regular_price_start_date,
           display_order, is_featured, is_visible, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      event.slug,
      event.name,
      event.type,
      event.status,
      event.description,
      event.venue_name,
      event.venue_address,
      event.venue_city,
      event.venue_state,
      event.venue_zip,
      event.start_date,
      event.end_date,
      event.max_capacity,
      event.early_bird_end_date,
      event.regular_price_start_date,
      event.display_order,
      event.is_featured ? 1 : 0,
      event.is_visible ? 1 : 0,
      event.created_at,
      event.updated_at
    ]
  });

  return { ...event, id: result.rows[0].id };
}

/**
 * Create test transaction with unique data
 * Use this when tests need a specific transaction
 *
 * @param {Object} db - Database client
 * @param {Object} overrides - Override default transaction values
 * @returns {Promise<Object>} Created transaction
 */
export async function createTestTransaction(db, overrides = {}) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 10000);
  const transaction = {
    transaction_id: `TXN_TEST_${uniqueId}`,
    stripe_session_id: `cs_test_${uniqueId}`,
    stripe_payment_intent: `pi_test_${uniqueId}`,
    email: `test-${uniqueId}@example.com`,
    status: 'completed',
    amount: 10000,
    currency: 'usd',
    ticket_count: 1,
    event_id: 1, // Use base event by default
    metadata: JSON.stringify({ test: true, unique_id: uniqueId }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };

  const result = await db.execute({
    sql: `INSERT INTO transactions
          (transaction_id, stripe_session_id, stripe_payment_intent, email, status,
           amount, currency, ticket_count, event_id, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      transaction.transaction_id,
      transaction.stripe_session_id,
      transaction.stripe_payment_intent,
      transaction.email,
      transaction.status,
      transaction.amount,
      transaction.currency,
      transaction.ticket_count,
      transaction.event_id,
      transaction.metadata,
      transaction.created_at,
      transaction.updated_at
    ]
  });

  return { ...transaction, id: result.rows[0].id };
}

/**
 * Create test ticket with unique data
 * Use this when tests need a specific ticket beyond BASE_TICKETS
 *
 * @param {Object} db - Database client
 * @param {Object} overrides - Override default ticket values
 * @returns {Promise<Object>} Created ticket
 */
export async function createTestTicket(db, overrides = {}) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 10000);
  const ticket = {
    ticket_id: `TEST_${uniqueId}`,
    event_id: 1, // Use base event by default
    transaction_id: 'TXN_BASE_001', // Use base transaction by default
    status: 'active',
    ticket_type: 'Test Pass',
    price: 10000,
    attendee_first_name: 'Test',
    attendee_last_name: 'Attendee',
    attendee_email: `test-${uniqueId}@example.com`,
    qr_token: null,
    registration_token: null,
    registered_at: null,
    registration_deadline: '2026-05-14T23:59:59.000Z',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };

  await db.execute({
    sql: `INSERT INTO tickets
          (ticket_id, event_id, transaction_id, status, ticket_type, price,
           attendee_first_name, attendee_last_name, attendee_email,
           qr_token, registration_token, registered_at, registration_deadline,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ticket.ticket_id,
      ticket.event_id,
      ticket.transaction_id,
      ticket.status,
      ticket.ticket_type,
      ticket.price,
      ticket.attendee_first_name,
      ticket.attendee_last_name,
      ticket.attendee_email,
      ticket.qr_token,
      ticket.registration_token,
      ticket.registered_at,
      ticket.registration_deadline,
      ticket.created_at,
      ticket.updated_at
    ]
  });

  return ticket;
}

/**
 * Get database client for testing
 * Convenience function to get the database client
 *
 * @returns {Promise<Object>} Database client
 */
export async function getTestDatabaseClient() {
  const { getDatabaseClient } = await import('../../lib/database.js');
  return await getDatabaseClient();
}

/**
 * Clean up test data
 * Delete test records created during a test
 *
 * @param {Object} db - Database client
 * @param {Object} options - Cleanup options
 * @param {Array<string>} options.ticketIds - Ticket IDs to delete
 * @param {Array<string>} options.transactionIds - Transaction IDs to delete
 * @param {Array<number>} options.eventIds - Event IDs to delete
 */
export async function cleanupTestData(db, options = {}) {
  const { ticketIds = [], transactionIds = [], eventIds = [] } = options;

  // Delete tickets
  for (const ticketId of ticketIds) {
    await db.execute({
      sql: 'DELETE FROM tickets WHERE ticket_id = ?',
      args: [ticketId]
    });
  }

  // Delete transactions
  for (const transactionId of transactionIds) {
    await db.execute({
      sql: 'DELETE FROM transactions WHERE transaction_id = ?',
      args: [transactionId]
    });
  }

  // Delete events (be careful - may have FK constraints)
  for (const eventId of eventIds) {
    await db.execute({
      sql: 'DELETE FROM events WHERE id = ? AND id > 1', // Protect BASE_EVENT (id=1)
      args: [eventId]
    });
  }
}

// Export all utilities
export default {
  MockFactory,
  TestDataBuilder,
  AssertionHelpers,
  TestEnvironment,
  waitForCondition,
  createSpy,
  generateTestData,
  // Database helpers
  createTestEvent,
  createTestTransaction,
  createTestTicket,
  getTestDatabaseClient,
  cleanupTestData
};