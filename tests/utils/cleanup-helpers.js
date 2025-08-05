/**
 * Test cleanup utilities to prevent memory leaks
 */

import { vi } from "vitest";

/**
 * Tracks all event listeners added during tests for cleanup
 */
export class EventListenerTracker {
  constructor() {
    this.listeners = new Set();
    this.originalAddEventListener = null;
    this.originalRemoveEventListener = null;
  }

  /**
   * Start tracking event listeners
   */
  start() {
    // Track addEventListener calls
    const tracker = this;

    // Save original methods
    if (typeof document !== "undefined") {
      this.originalAddEventListener = EventTarget.prototype.addEventListener;
      this.originalRemoveEventListener =
        EventTarget.prototype.removeEventListener;

      EventTarget.prototype.addEventListener = function (
        type,
        listener,
        options,
      ) {
        tracker.listeners.add({ target: this, type, listener, options });
        return tracker.originalAddEventListener.call(
          this,
          type,
          listener,
          options,
        );
      };

      EventTarget.prototype.removeEventListener = function (
        type,
        listener,
        options,
      ) {
        tracker.listeners.forEach((item) => {
          if (
            item.target === this &&
            item.type === type &&
            item.listener === listener
          ) {
            tracker.listeners.delete(item);
          }
        });
        return tracker.originalRemoveEventListener.call(
          this,
          type,
          listener,
          options,
        );
      };
    }
  }

  /**
   * Remove all tracked event listeners and restore original methods
   */
  cleanup() {
    // Remove all tracked listeners
    this.listeners.forEach(({ target, type, listener, options }) => {
      try {
        if (
          this.originalRemoveEventListener &&
          target &&
          typeof target.removeEventListener === "function"
        ) {
          this.originalRemoveEventListener.call(
            target,
            type,
            listener,
            options,
          );
        }
      } catch (e) {
        // Silently ignore if target is no longer valid
      }
    });

    // Clear the set
    this.listeners.clear();

    // Restore original methods
    if (this.originalAddEventListener) {
      EventTarget.prototype.addEventListener = this.originalAddEventListener;
    }
    if (this.originalRemoveEventListener) {
      EventTarget.prototype.removeEventListener =
        this.originalRemoveEventListener;
    }
  }
}

/**
 * Comprehensive DOM cleanup
 */
export function cleanupDOM() {
  if (typeof document === "undefined") return;

  try {
    // Remove all event listeners from body and its children
    const allElements = document.querySelectorAll("*");
    allElements.forEach((element) => {
      try {
        // Clone node to remove all event listeners
        const clone = element.cloneNode(true);
        if (element.parentNode) {
          element.parentNode.replaceChild(clone, element);
        }
      } catch (e) {
        // Element might be disconnected
      }
    });

    // Clear body and head
    document.body.innerHTML = "";
    document.head.innerHTML = "";

    // Remove any style elements
    const styles = document.querySelectorAll("style");
    styles.forEach((style) => style.remove());

    // Clear any data attributes
    document.documentElement.removeAttribute("data-test");
  } catch (e) {
    // Silently fail if DOM is in inconsistent state
  }
}

/**
 * Clean up JSDOM instance properly
 */
export function cleanupJSDOM(dom) {
  if (!dom) return;

  try {
    // Stop all timers in the window
    if (dom.window) {
      // Clear all timers
      const timerId = dom.window.setTimeout(() => {}, 0);
      for (let i = 0; i < timerId; i++) {
        dom.window.clearTimeout(i);
        dom.window.clearInterval(i);
      }

      // Close the window
      dom.window.close();
    }

    // Nullify references
    if (dom.reconfigure) {
      dom.reconfigure({ url: "about:blank" });
    }

    // Force garbage collection hint
    dom = null;
  } catch (e) {
    // Silently fail
  }
}

/**
 * Clear all vitest timers and mocks
 */
export function cleanupVitest() {
  vi.clearAllTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
}

/**
 * Clear all storage
 */
export function cleanupStorage() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.clear();
    }
  } catch (e) {
    // Silently fail
  }
}

/**
 * Comprehensive test cleanup function
 */
export function cleanupTest(options = {}) {
  const {
    dom = null,
    eventTracker = null,
    clearTimers = true,
    clearStorage = true,
    clearMocks = true,
    clearDOM = true,
  } = options;

  // Clean up event tracker
  if (eventTracker) {
    eventTracker.cleanup();
  }

  // Clean up JSDOM
  if (dom) {
    cleanupJSDOM(dom);
  }

  // Clean up DOM
  if (clearDOM) {
    cleanupDOM();
  }

  // Clean up storage
  if (clearStorage) {
    cleanupStorage();
  }

  // Clean up vitest
  if (clearMocks) {
    cleanupVitest();
  }

  // Clear timers
  if (clearTimers && typeof global !== "undefined") {
    // Clear Node.js timers
    const timerId = setTimeout(() => {}, 0);
    for (let i = 0; i < timerId; i++) {
      clearTimeout(i);
      clearInterval(i);
    }
  }

  // Force garbage collection if available
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      // Silently fail
    }
  }
}

/**
 * Memory usage monitor
 */
export function logMemoryUsage(label = "") {
  if (process.memoryUsage) {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);

    if (heapUsedMB > 500) {
      // Log if over 500MB
      console.warn(
        `[Memory Warning] ${label}: Heap ${heapUsedMB}MB/${heapTotalMB}MB, RSS ${rssMB}MB`,
      );
    }

    return { heapUsedMB, heapTotalMB, rssMB };
  }
  return null;
}

/**
 * Create a self-cleaning test environment
 */
export function createTestEnvironment() {
  const eventTracker = new EventListenerTracker();
  eventTracker.start();

  return {
    eventTracker,
    cleanup: (options = {}) => cleanupTest({ ...options, eventTracker }),
  };
}
