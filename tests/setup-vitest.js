import { vi } from "vitest";
import {
  EventListenerTracker,
  MonitoringCleanupHelper,
  cleanupTest,
  logMemoryUsage,
} from "./utils/cleanup-helpers.js";

// Global event listener tracker
global.__testEventTracker = new EventListenerTracker();
global.__testEventTracker.start();

// Global monitoring cleanup helper
global.__testMonitoringHelper = new MonitoringCleanupHelper();

// Jest compatibility layer - provide jest global for legacy tests
global.jest = {
  fn: vi.fn,
  mock: vi.mock,
  spyOn: vi.spyOn,
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
  mocked: vi.mocked,
  unstable_mockModule: vi.mock,
};

// Mock global fetch for Node.js environment
global.fetch = vi.fn();

// Mock browser APIs that are used in real source code
// IntersectionObserver API
global.IntersectionObserver = vi
  .fn()
  .mockImplementation((callback, options) => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: options?.root || null,
    rootMargin: options?.rootMargin || "0px",
    thresholds: options?.threshold || [0],
  }));

// PerformanceObserver API
global.PerformanceObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(() => []),
  supportedEntryTypes: [
    "navigation",
    "measure",
    "mark",
    "resource",
    "paint",
    "largest-contentful-paint",
    "first-input",
    "layout-shift",
  ],
}));

// Performance API enhancements
if (!global.performance) {
  global.performance = {};
}

// Node 18.x has a read-only performance object, so we need to use defineProperty
const performanceMethods = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn(() => []),
  getEntriesByName: vi.fn(() => []),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
};

// Define each method individually to handle read-only properties
Object.keys(performanceMethods).forEach((key) => {
  try {
    if (
      !global.performance[key] ||
      typeof global.performance[key] !== "function"
    ) {
      Object.defineProperty(global.performance, key, {
        value: performanceMethods[key],
        writable: true,
        configurable: true,
      });
    }
  } catch (e) {
    // Silently fail if property cannot be defined
  }
});

// Define complex properties separately
try {
  if (!global.performance.memory) {
    Object.defineProperty(global.performance, "memory", {
      value: {
        usedJSHeapSize: 1024 * 1024,
        totalJSHeapSize: 2 * 1024 * 1024,
        jsHeapSizeLimit: 4 * 1024 * 1024,
      },
      writable: true,
      configurable: true,
    });
  }
} catch (e) {
  // Silently fail
}

try {
  if (!global.performance.navigation) {
    Object.defineProperty(global.performance, "navigation", {
      value: {
        type: 1,
        redirectCount: 0,
      },
      writable: true,
      configurable: true,
    });
  }
} catch (e) {
  // Silently fail
}

try {
  if (!global.performance.timing) {
    Object.defineProperty(global.performance, "timing", {
      value: {
        navigationStart: Date.now() - 1000,
        loadEventEnd: Date.now(),
      },
      writable: true,
      configurable: true,
    });
  }
} catch (e) {
  // Silently fail
}

// PageTransition API (experimental browser API)
global.PageTransition = vi.fn().mockImplementation(() => ({
  init: vi.fn(),
  start: vi.fn(),
  end: vi.fn(),
  cancel: vi.fn(),
}));

// Navigator API enhancements
if (!global.navigator) {
  global.navigator = {};
}

// Use Object.defineProperty for read-only properties
Object.defineProperty(global.navigator, "connection", {
  value: {
    effectiveType: "4g",
    downlink: 10,
    rtt: 50,
    saveData: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(global.navigator, "userAgent", {
  value: "Mozilla/5.0 (Node.js Test Environment)",
  writable: true,
  configurable: true,
});

Object.defineProperty(global.navigator, "onLine", {
  value: true,
  writable: true,
  configurable: true,
});

Object.defineProperty(global.navigator, "serviceWorker", {
  value: {
    register: vi.fn().mockResolvedValue({
      installing: null,
      waiting: null,
      active: { postMessage: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    ready: Promise.resolve({
      active: { postMessage: vi.fn() },
      addEventListener: vi.fn(),
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
  configurable: true,
});

// ResizeObserver API
global.ResizeObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// MutationObserver API
global.MutationObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(() => []),
}));

// Storage APIs with proper implementation
function createStorageMock() {
  const storage = {};

  return {
    getItem: vi.fn((key) => {
      return storage[key] || null;
    }),
    setItem: vi.fn((key, value) => {
      storage[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete storage[key];
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach((key) => delete storage[key]);
    }),
    get length() {
      return Object.keys(storage).length;
    },
    key: vi.fn((index) => {
      const keys = Object.keys(storage);
      return keys[index] || null;
    }),
  };
}

global.localStorage = createStorageMock();
global.sessionStorage = createStorageMock();

// URL API
if (!global.URL) {
  global.URL = {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  };
}

// RequestAnimationFrame
global.requestAnimationFrame = vi.fn((callback) => {
  setTimeout(callback, 16);
  return 1;
});
global.cancelAnimationFrame = vi.fn();

// RequestIdleCallback
global.requestIdleCallback = vi.fn((callback) => {
  setTimeout(() => callback({ timeRemaining: () => 50 }), 0);
  return 1;
});
global.cancelIdleCallback = vi.fn();

// Window object and sizing/viewport
if (!global.window) {
  global.window = global;
}

Object.defineProperty(global, "innerWidth", { value: 1024, writable: true });
Object.defineProperty(global, "innerHeight", { value: 768, writable: true });
Object.defineProperty(global, "outerWidth", { value: 1024, writable: true });
Object.defineProperty(global, "outerHeight", { value: 768, writable: true });

// Make sure window has the same properties as global
Object.defineProperty(global.window, "innerWidth", {
  value: 1024,
  writable: true,
});
Object.defineProperty(global.window, "innerHeight", {
  value: 768,
  writable: true,
});

// Window event handling
global.window.addEventListener = vi.fn();
global.window.removeEventListener = vi.fn();

// Window location - jsdom provides this automatically
// We'll only set it up if window exists but location doesn't
try {
  if (global.window && !global.window.location) {
    // For non-jsdom environments, create a mock
    Object.defineProperty(global.window, 'location', {
      value: {
        pathname: "/test",
        href: "http://localhost:3000/test",
        origin: "http://localhost:3000",
        hostname: "localhost",
        port: "3000",
        protocol: "http:",
        search: "",
        hash: "",
        assign: vi.fn(),
        reload: vi.fn(),
        replace: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  }
} catch (e) {
  // jsdom handles location automatically, so we can skip
}

// Screen API
global.screen = {
  width: 1920,
  height: 1080,
  availWidth: 1920,
  availHeight: 1040,
  colorDepth: 24,
  pixelDepth: 24,
};

// CSS and styling APIs
global.getComputedStyle = vi.fn(() => ({
  getPropertyValue: vi.fn(),
  width: "100px",
  height: "100px",
}));

// Image loading
global.Image = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  src: "",
  onload: null,
  onerror: null,
  width: 0,
  height: 0,
  naturalWidth: 0,
  naturalHeight: 0,
  complete: false,
}));

// Mock crypto for Node.js environment (only if not already defined)
if (!global.crypto) {
  const mockCrypto = {
    randomBytes: vi.fn(() =>
      Buffer.from("mock-random-bytes-1234567890123456", "utf8"),
    ),
    createHmac: vi.fn(() => ({
      update: vi.fn(() => ({
        digest: vi.fn(() => "mock-hash-digest-1234567890abcdef"),
      })),
    })),
  };

  Object.defineProperty(global, "crypto", {
    value: mockCrypto,
    writable: true,
  });
}

// Mock Node.js crypto module
vi.mock("crypto", () => ({
  randomBytes: vi.fn(() =>
    Buffer.from("mock-random-bytes-1234567890123456", "utf8"),
  ),
  createHmac: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => "mock-hash-digest-1234567890abcdef"),
    })),
  })),
}));

// Mock Node.js perf_hooks module
vi.mock("perf_hooks", () => ({
  performance: {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    timeOrigin: Date.now(),
  },
}));

// Mock process.env for tests
process.env.NODE_ENV = "test";

// Add monitoring-related environment variables for tests
process.env.METRICS_API_KEY = process.env.METRICS_API_KEY || "test-metrics-key";
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || "admin-test-key";
process.env.SENTRY_DSN = process.env.SENTRY_DSN || "";
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || "test-brevo-key";
process.env.BREVO_NEWSLETTER_LIST_ID = process.env.BREVO_NEWSLETTER_LIST_ID || "1";
process.env.BREVO_WELCOME_TEMPLATE_ID = process.env.BREVO_WELCOME_TEMPLATE_ID || "1";
process.env.BREVO_VERIFICATION_TEMPLATE_ID = process.env.BREVO_VERIFICATION_TEMPLATE_ID || "1";
process.env.UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || "test-unsubscribe-secret";
process.env.BREVO_WEBHOOK_SECRET = process.env.BREVO_WEBHOOK_SECRET || "test-webhook-secret";

// Global test utilities
global.createMockResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(data),
  text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  headers: new Map(),
});

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Aggressive cleanup after each test to prevent memory leaks
afterEach(() => {
  // Use comprehensive cleanup utility
  cleanupTest({
    eventTracker: global.__testEventTracker,
    monitoringHelper: global.__testMonitoringHelper,
    clearTimers: true,
    clearStorage: true,
    clearMocks: true,
    clearDOM: true,
  });

  // Log memory usage if high
  const memStats = logMemoryUsage("AfterEach");
  if (memStats && memStats.heapUsedMB > 500) {
    console.warn(
      `Test may have memory leak: ${memStats.heapUsedMB}MB heap used`,
    );
  }
});

// Global teardown - final cleanup
afterAll(() => {
  // Final cleanup
  if (global.__testEventTracker) {
    global.__testEventTracker.cleanup();
    global.__testEventTracker = null;
  }

  if (global.__testMonitoringHelper) {
    global.__testMonitoringHelper.cleanup();
    global.__testMonitoringHelper = null;
  }

  // Force final garbage collection
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      // Silently ignore
    }
  }

  // Log final memory stats
  logMemoryUsage("AfterAll");
});
