/**
 * Global Test Setup
 *
 * Centralizes test configuration, environment setup, and common utilities
 * Provides consistent testing environment across all test suites
 */

import { beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { JSDOM } from "jsdom";
import { mockServices } from "./mock-services.js";

/**
 * Test Environment Configuration
 */
export class TestEnvironment {
  constructor() {
    this.dom = null;
    this.originalFetch = null;
    this.originalConsole = null;
    this.cleanupTasks = [];
    this.testData = new Map();
  }

  /**
   * Setup DOM environment for browser-based testing
   */
  setupDOM(html = null) {
    const defaultHTML = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test Environment</title>
          <style>
            /* Basic styles for testing */
            .hidden { display: none !important; }
            .visible { display: block !important; }
            .gallery-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
            .gallery-item { position: relative; overflow: hidden; }
            .floating-cart { position: fixed; bottom: 20px; right: 20px; z-index: 1000; }
          </style>
        </head>
        <body>
          <header>
            <nav id="main-navigation">
              <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/about">About</a></li>
                <li><a href="/tickets">Tickets</a></li>
                <li><a href="/gallery">Gallery</a></li>
              </ul>
            </nav>
          </header>
          <main id="main-content">
            <div id="app"></div>
          </main>
          <footer>
            <p>&copy; 2026 A Lo Cubano Boulder Fest</p>
          </footer>
          
          <!-- Common test elements -->
          <div id="test-container" style="display: none;"></div>
          <div id="modal-container"></div>
          <div class="floating-cart" style="display: none;">
            <div class="cart-content">
              <span class="cart-count">0</span>
              <span class="cart-total">$0.00</span>
            </div>
          </div>
        </body>
      </html>
    `;

    this.dom = new JSDOM(html || defaultHTML, {
      url: "http://localhost:3000",
      pretendToBeVisual: true,
      resources: "usable",
      runScripts: "dangerously",
    });

    // Set global DOM references
    global.window = this.dom.window;
    global.document = this.dom.window.document;
    global.navigator = this.dom.window.navigator;
    global.location = this.dom.window.location;
    global.history = this.dom.window.history;
    global.localStorage = this.dom.window.localStorage;
    global.sessionStorage = this.dom.window.sessionStorage;

    // Mock DOM APIs
    this.setupDOMMocks();

    return this.dom;
  }

  /**
   * Setup DOM-specific mocks
   */
  setupDOMMocks() {
    // Mock requestAnimationFrame
    global.requestAnimationFrame = vi.fn((callback) => {
      return setTimeout(callback, 16); // ~60fps
    });

    global.cancelAnimationFrame = vi.fn((id) => {
      clearTimeout(id);
    });

    // Mock IntersectionObserver
    global.IntersectionObserver = vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      root: null,
      rootMargin: "0px",
      thresholds: [0],
    }));

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    // Mock URLSearchParams if not available
    if (!global.URLSearchParams) {
      global.URLSearchParams = this.dom.window.URLSearchParams;
    }

    // Mock performance API
    if (!global.performance) {
      global.performance = {
        now: vi.fn(() => Date.now()),
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByType: vi.fn(() => []),
        getEntriesByName: vi.fn(() => []),
        clearMarks: vi.fn(),
        clearMeasures: vi.fn(),
        memory: {
          usedJSHeapSize: 1000000,
          totalJSHeapSize: 2000000,
          jsHeapSizeLimit: 4000000,
        },
      };
    }
  }

  /**
   * Setup environment variables for testing
   */
  setupEnvironment() {
    // Set test environment variables
    process.env.NODE_ENV = "test";
    process.env.VITEST = "true";

    // Mock API keys and secrets - clearly fake values for testing only
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_fake_test_key_for_unit_tests_only";
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_secret_key_for_unit_tests_only";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake_webhook_secret";

    process.env.BREVO_API_KEY = "xkeysib-test-api-key";
    process.env.BREVO_NEWSLETTER_LIST_ID = "1";
    process.env.BREVO_WEBHOOK_SECRET = "brevo-test-webhook-secret";
    process.env.BREVO_WELCOME_TEMPLATE_ID = "1";
    process.env.SEND_WELCOME_EMAIL = "true";

    process.env.ADMIN_PASSWORD = "$2b$10$testhashedpassword";
    process.env.ADMIN_SECRET = "test-admin-secret-key-for-testing-only";
    process.env.WALLET_AUTH_SECRET = "test-wallet-auth-secret-key-for-testing";

    // Database configuration for testing
    process.env.DATABASE_URL = ":memory:";
    process.env.TURSO_DATABASE_URL = "";
    process.env.TURSO_AUTH_TOKEN = "";

    // Gallery configuration
    process.env.GOOGLE_DRIVE_FOLDER_ID = "test-folder-id";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@test.com";
    process.env.GOOGLE_PRIVATE_KEY = "test-private-key";
  }

  /**
   * Setup console utilities for testing
   */
  setupConsole() {
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };

    // Create test-friendly console that captures output
    const testConsole = {
      logs: [],
      warnings: [],
      errors: [],
      info: [],
    };

    console.log = vi.fn((...args) => {
      testConsole.logs.push(args.join(" "));
      if (process.env.TEST_VERBOSE) {
        this.originalConsole.log(...args);
      }
    });

    console.warn = vi.fn((...args) => {
      testConsole.warnings.push(args.join(" "));
      if (process.env.TEST_VERBOSE) {
        this.originalConsole.warn(...args);
      }
    });

    console.error = vi.fn((...args) => {
      testConsole.errors.push(args.join(" "));
      if (process.env.TEST_VERBOSE) {
        this.originalConsole.error(...args);
      }
    });

    console.info = vi.fn((...args) => {
      testConsole.info.push(args.join(" "));
      if (process.env.TEST_VERBOSE) {
        this.originalConsole.info(...args);
      }
    });

    global.testConsole = testConsole;
  }

  /**
   * Setup fetch mock for API testing
   */
  setupFetch() {
    this.originalFetch = global.fetch;

    global.fetch = vi.fn((url, options) => {
      // Log API calls in test mode
      if (process.env.TEST_VERBOSE) {
        console.log(`[FETCH] ${options?.method || "GET"} ${url}`);
      }

      // Default mock response
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ success: true }),
        text: () => Promise.resolve('{"success": true}'),
        headers: new Map([["content-type", "application/json"]]),
      });
    });
  }

  /**
   * Setup mock services
   */
  setupMockServices() {
    mockServices.initialize();
  }

  /**
   * Add cleanup task
   */
  addCleanupTask(task) {
    this.cleanupTasks.push(task);
  }

  /**
   * Set test data for sharing between tests
   */
  setTestData(key, value) {
    this.testData.set(key, value);
  }

  /**
   * Get test data
   */
  getTestData(key, defaultValue = null) {
    return this.testData.get(key) || defaultValue;
  }

  /**
   * Clear test data
   */
  clearTestData() {
    this.testData.clear();
  }

  /**
   * Complete cleanup of test environment
   */
  cleanup() {
    // Run custom cleanup tasks
    this.cleanupTasks.forEach((task) => {
      try {
        task();
      } catch (error) {
        console.warn("Cleanup task failed:", error);
      }
    });
    this.cleanupTasks = [];

    // Reset mocks
    vi.clearAllMocks();
    mockServices.resetAll();

    // Clear test data
    this.clearTestData();

    // Reset console
    if (this.originalConsole) {
      Object.assign(console, this.originalConsole);
      this.originalConsole = null;
    }

    // Reset fetch
    if (this.originalFetch) {
      global.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    // Clear DOM
    if (this.dom) {
      this.dom.window.close();
      this.dom = null;
    }

    // Clear globals
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.location;
    delete global.history;
    delete global.localStorage;
    delete global.sessionStorage;
    delete global.testConsole;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
    delete global.IntersectionObserver;
    delete global.ResizeObserver;
  }
}

/**
 * Global test environment instance
 */
export const testEnv = new TestEnvironment();

/**
 * Test utilities
 */
export const TestUtils = {
  /**
   * Wait for next tick
   */
  nextTick: () => new Promise((resolve) => setTimeout(resolve, 0)),

  /**
   * Wait for DOM updates
   */
  waitForDOM: (delay = 0) => {
    return new Promise((resolve) => {
      if (delay > 0) {
        setTimeout(resolve, delay);
      } else if (global.requestAnimationFrame) {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      } else {
        setTimeout(resolve, 16);
      }
    });
  },

  /**
   * Wait for element to appear
   */
  waitForElement: async (selector, timeout = 5000) => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await TestUtils.nextTick();
    }

    throw new Error(
      `Element with selector "${selector}" not found within ${timeout}ms`,
    );
  },

  /**
   * Simulate user interaction
   */
  simulateEvent: (element, eventType, eventInit = {}) => {
    const event = new window.Event(eventType, {
      bubbles: true,
      cancelable: true,
      ...eventInit,
    });

    element.dispatchEvent(event);
    return event;
  },

  /**
   * Simulate click event
   */
  click: (element) => {
    TestUtils.simulateEvent(element, "click");
  },

  /**
   * Simulate form input
   */
  typeInInput: (input, text) => {
    input.value = text;
    TestUtils.simulateEvent(input, "input");
    TestUtils.simulateEvent(input, "change");
  },

  /**
   * Create mock element
   */
  createElement: (tag, attributes = {}, textContent = "") => {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(([key, value]) => {
      if (key.startsWith("data-")) {
        element.dataset[key.replace("data-", "")] = value;
      } else if (key === "className") {
        element.className = value;
      } else {
        element.setAttribute(key, value);
      }
    });

    if (textContent) {
      element.textContent = textContent;
    }

    return element;
  },

  /**
   * Mock API response
   */
  mockApiResponse: (data, options = {}) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
      headers: new Map([
        ["content-type", "application/json"],
        ...Object.entries(options.headers || {}),
      ]),
      ...options,
    });
  },

  /**
   * Mock API error
   */
  mockApiError: (status = 500, message = "Internal Server Error") => {
    return Promise.resolve({
      ok: false,
      status,
      statusText: message,
      json: () => Promise.resolve({ error: message }),
      text: () => Promise.resolve(JSON.stringify({ error: message })),
      headers: new Map([["content-type", "application/json"]]),
    });
  },

  /**
   * Generate test ID
   */
  generateId: (prefix = "test") => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  },

  /**
   * Create temporary file for testing
   */
  createTempFile: (content, filename = null) => {
    const name = filename || `temp-${TestUtils.generateId()}.json`;
    const blob = new Blob([content], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    return file;
  },
};

/**
 * Common test setup functions
 */
export const TestSetup = {
  /**
   * Standard browser test setup
   */
  browser: () => {
    testEnv.setupDOM();
    testEnv.setupEnvironment();
    testEnv.setupConsole();
    testEnv.setupFetch();
    testEnv.setupMockServices();
  },

  /**
   * Node.js API test setup
   */
  node: () => {
    testEnv.setupEnvironment();
    testEnv.setupConsole();
    testEnv.setupFetch();
    testEnv.setupMockServices();
  },

  /**
   * Database test setup
   */
  database: () => {
    testEnv.setupEnvironment();
    testEnv.setupConsole();
    // Database-specific setup would go here
  },

  /**
   * Integration test setup
   */
  integration: () => {
    TestSetup.browser();
    // Additional integration-specific setup
  },

  /**
   * Performance test setup
   */
  performance: () => {
    TestSetup.browser();
    // Setup performance monitoring
    global.performance.mark("test-start");
  },
};

/**
 * Test assertion helpers
 */
export const TestAssertions = {
  /**
   * Assert element is visible
   */
  isVisible: (element) => {
    if (!element) throw new Error("Element not found");
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  },

  /**
   * Assert element has class
   */
  hasClass: (element, className) => {
    if (!element) throw new Error("Element not found");
    return element.classList.contains(className);
  },

  /**
   * Assert element contains text
   */
  hasText: (element, text) => {
    if (!element) throw new Error("Element not found");
    return element.textContent.includes(text);
  },

  /**
   * Assert API response structure
   */
  isValidApiResponse: (response, requiredFields = []) => {
    if (!response || typeof response !== "object") {
      return false;
    }

    return requiredFields.every((field) => {
      const keys = field.split(".");
      let current = response;

      for (const key of keys) {
        if (current[key] === undefined) return false;
        current = current[key];
      }

      return true;
    });
  },

  /**
   * Assert performance metrics
   */
  meetsPerformanceTarget: (duration, target) => {
    return duration <= target;
  },
};

/**
 * Global setup and teardown hooks
 * These run automatically when importing this module
 */

// Global test setup - runs before each test file
beforeAll(() => {
  // Initialize test environment
  if (process.env.TEST_VERBOSE) {
    console.log("[TEST SETUP] Initializing global test environment");
  }
});

// Global test cleanup - runs after each test file
afterAll(() => {
  testEnv.cleanup();
  if (process.env.TEST_VERBOSE) {
    console.log("[TEST CLEANUP] Global test environment cleaned up");
  }
});

// Per-test setup
beforeEach(() => {
  // Clear any previous test state
  testEnv.clearTestData();
  vi.clearAllMocks();
});

// Per-test cleanup
afterEach(() => {
  // Clean up any test-specific state
  if (global.testConsole) {
    global.testConsole.logs = [];
    global.testConsole.warnings = [];
    global.testConsole.errors = [];
    global.testConsole.info = [];
  }
});

/**
 * Export everything for easy importing
 */
export default {
  testEnv,
  TestUtils,
  TestSetup,
  TestAssertions,
  TestEnvironment,
};
