/**
 * Service Mock Factory
 * 
 * Provides factory functions to create complete service mocks with all required methods
 * Ensures consistency between integration tests and prevents missing method errors
 */

import { vi } from "vitest";
import { DatabaseMock, EmailSubscriberServiceMock } from "./mock-services.js";

/**
 * Creates a complete email subscriber service mock with all methods
 * @param {Object} options Configuration options for the mock
 * @returns {Object} Complete mock with all EmailSubscriberService methods
 */
export function createEmailSubscriberServiceMock(options = {}) {
  const mock = {
    // Initialization methods
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockResolvedValue(new DatabaseMock()),

    // Core subscriber methods
    createSubscriber: vi.fn(),
    getSubscriberByEmail: vi.fn(),
    updateSubscriber: vi.fn(),
    unsubscribeSubscriber: vi.fn(),
    verifySubscriber: vi.fn(),

    // Event and audit methods
    logEmailEvent: vi.fn(),
    auditLog: vi.fn(),
    getRecentEvents: vi.fn(),
    processWebhookEvent: vi.fn(),

    // Stats and sync methods
    getSubscriberStats: vi.fn(),
    syncWithBrevo: vi.fn(),

    // Token methods
    generateUnsubscribeToken: vi.fn(),
    validateUnsubscribeToken: vi.fn(),
    generateVerificationToken: vi.fn(),

    // Internal properties (for testing state)
    initialized: false,
    initializationPromise: null,
  };

  // Configure default behaviors
  if (options.autoInitialize !== false) {
    mock.ensureInitialized.mockResolvedValue(mock);
  }

  if (options.defaultStats !== false) {
    mock.getSubscriberStats.mockResolvedValue({
      total: options.stats?.total || 1250,
      active: options.stats?.active || 1100,
      pending: options.stats?.pending || 50,
      unsubscribed: options.stats?.unsubscribed || 75,
      bounced: options.stats?.bounced || 25,
    });
  }

  if (options.defaultTokens !== false) {
    mock.generateUnsubscribeToken.mockImplementation((email) => `unsubscribe_${email}`);
    mock.validateUnsubscribeToken.mockImplementation((email, token) => token === `unsubscribe_${email}`);
    mock.generateVerificationToken.mockReturnValue("mock-verification-token");
  }

  if (options.defaultEvents !== false) {
    mock.getRecentEvents.mockResolvedValue([]);
    mock.logEmailEvent.mockResolvedValue({
      id: 1,
      subscriber_id: 1,
      event_type: "subscribed",
      event_data: {},
      occurred_at: new Date().toISOString(),
    });
  }

  // Allow custom overrides
  if (options.overrides) {
    Object.keys(options.overrides).forEach(key => {
      if (mock[key] && typeof mock[key].mockImplementation === 'function') {
        mock[key].mockImplementation(options.overrides[key]);
      } else if (mock[key] && typeof mock[key].mockResolvedValue === 'function') {
        mock[key].mockResolvedValue(options.overrides[key]);
      }
    });
  }

  return mock;
}

/**
 * Creates a complete database service mock with all methods
 * @param {Object} options Configuration options for the mock
 * @returns {Object} Complete mock with all database methods
 */
export function createDatabaseServiceMock(options = {}) {
  const mock = {
    execute: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(true),
    getClient: vi.fn(),
    close: vi.fn().mockResolvedValue(),
  };

  // Configure default execute behavior
  if (options.defaultQueries !== false) {
    mock.execute.mockImplementation((query, params = []) => {
      if (query.includes("sqlite_master")) {
        return Promise.resolve({
          rows: options.tables || [
            { name: "email_subscribers" },
            { name: "email_events" },
            { name: "email_audit_log" },
          ],
        });
      } else if (query.includes("table_info")) {
        return Promise.resolve({
          rows: options.columns || [
            { name: "id" },
            { name: "email" },
            { name: "status" },
            { name: "created_at" },
            { name: "updated_at" },
          ],
        });
      } else if (query.includes("index_list")) {
        return Promise.resolve({
          rows: options.indexes || [
            { name: "email_idx" },
            { name: "created_at_idx" },
          ],
        });
      } else if (query.includes("COUNT(*)")) {
        return Promise.resolve({
          rows: [{ count: options.rowCount || 42 }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  }

  // Allow custom overrides
  if (options.overrides) {
    Object.keys(options.overrides).forEach(key => {
      if (mock[key] && typeof mock[key].mockImplementation === 'function') {
        mock[key].mockImplementation(options.overrides[key]);
      }
    });
  }

  return mock;
}

/**
 * Creates a complete Brevo service mock with all methods
 * @param {Object} options Configuration options for the mock
 * @returns {Object} Complete mock with all Brevo service methods
 */
export function createBrevoServiceMock(options = {}) {
  const mock = {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    subscribeToNewsletter: vi.fn(),
    unsubscribeContact: vi.fn(),
    getContact: vi.fn(),
    updateContact: vi.fn(),
    processWebhookEvent: vi.fn(),
    getAllListStats: vi.fn(),
    sendTransactionalEmail: vi.fn(),
  };

  // Configure default behaviors
  if (options.autoInitialize !== false) {
    mock.ensureInitialized.mockResolvedValue(mock);
  }

  if (options.defaultSubscription !== false) {
    mock.subscribeToNewsletter.mockResolvedValue({
      id: options.contactId || 12345,
      email: "test@example.com",
    });
  }

  if (options.defaultStats !== false) {
    mock.getAllListStats.mockResolvedValue([
      {
        id: 1,
        name: "Newsletter",
        totalSubscribers: 1250,
        totalBlacklisted: 25,
      },
    ]);
  }

  // Allow custom overrides
  if (options.overrides) {
    Object.keys(options.overrides).forEach(key => {
      if (mock[key] && typeof mock[key].mockImplementation === 'function') {
        mock[key].mockImplementation(options.overrides[key]);
      }
    });
  }

  return mock;
}

/**
 * Integration test helper that sets up all service mocks consistently
 * @param {Object} options Configuration for all services
 * @returns {Object} Object with all configured service mocks
 */
export function createIntegrationTestMocks(options = {}) {
  const mocks = {
    emailSubscriberService: createEmailSubscriberServiceMock(options.emailService || {}),
    database: createDatabaseServiceMock(options.database || {}),
    brevoService: createBrevoServiceMock(options.brevo || {}),
  };

  // Setup module mocks for vitest
  if (options.setupViMocks !== false) {
    vi.mock("../../api/lib/email-subscriber-service.js", () => ({
      getEmailSubscriberService: vi.fn(() => mocks.emailSubscriberService),
      resetEmailSubscriberService: vi.fn(),
    }));

    vi.mock("../../api/lib/database.js", () => ({
      getDatabase: vi.fn(() => mocks.database),
      getDatabaseClient: vi.fn(() => mocks.database),
    }));

    vi.mock("../../api/lib/brevo-service.js", () => ({
      getBrevoService: vi.fn(() => mocks.brevoService),
    }));
  }

  return mocks;
}

/**
 * Validates that a service mock has all required methods
 * @param {Object} mock The mock object to validate
 * @param {Array} requiredMethods Array of method names that must exist
 * @throws {Error} If any required methods are missing
 */
export function validateServiceMock(mock, requiredMethods) {
  const missingMethods = requiredMethods.filter(method => !mock[method]);
  
  if (missingMethods.length > 0) {
    throw new Error(`Service mock is missing required methods: ${missingMethods.join(", ")}`);
  }
}

/**
 * Common method lists for validation
 */
export const REQUIRED_METHODS = {
  emailSubscriberService: [
    "ensureInitialized",
    "createSubscriber",
    "getSubscriberByEmail", 
    "updateSubscriber",
    "unsubscribeSubscriber",
    "verifySubscriber",
    "logEmailEvent",
    "auditLog",
    "getSubscriberStats",
    "getRecentEvents",
    "processWebhookEvent",
    "syncWithBrevo",
    "generateUnsubscribeToken",
    "validateUnsubscribeToken",
    "generateVerificationToken",
  ],
  database: [
    "execute",
    "testConnection",
  ],
  brevoService: [
    "ensureInitialized",
    "subscribeToNewsletter",
    "unsubscribeContact",
    "processWebhookEvent",
    "getAllListStats",
  ],
};

/**
 * Reset all mocks created by the factory
 * @param {Object} mocks Object containing service mocks
 */
export function resetAllMocks(mocks) {
  Object.values(mocks).forEach(mock => {
    if (mock && typeof mock === 'object') {
      Object.keys(mock).forEach(key => {
        if (mock[key] && typeof mock[key].mockReset === 'function') {
          mock[key].mockReset();
        }
      });
    }
  });
  
  vi.clearAllMocks();
}