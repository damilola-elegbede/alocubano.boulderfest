/**
 * Lazy Loading Component Tests - Real Source Code
 * Testing actual LazyLoader class from js/components/lazy-loading.js
 */

import { vi } from "vitest";

const fs = require("fs");
const path = require("path");

// Load actual LazyLoader source code
let lazyLoadingSource;
try {
  const lazyLoadingPath = path.join(
    __dirname,
    "../../js/components/lazy-loading.js",
  );
  lazyLoadingSource = fs.readFileSync(lazyLoadingPath, "utf8");
} catch (error) {
  console.error("Failed to load lazy loading source:", error);
  throw new Error(
    `Lazy loading tests cannot run without source file: ${error.message}`,
  );
}

describe("LazyLoader Real Source Code Integration", () => {
  let mockIntersectionObserver;
  let observeCallback;
  let lazyLoaderLoaded = false;

  const setupLazyLoadingEnvironment = () => {
    // Mock IntersectionObserver with callback capture
    mockIntersectionObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };

    global.IntersectionObserver = vi
      .fn()
      .mockImplementation((callback, options) => {
        observeCallback = callback; // Capture the callback for testing
        return mockIntersectionObserver;
      });

    // Load the actual lazy loading source code
    if (lazyLoadingSource && !lazyLoaderLoaded) {
      try {
        eval(lazyLoadingSource);
        lazyLoaderLoaded = true;
      } catch (error) {
        console.warn("LazyLoader source evaluation failed:", error);
      }
    }
  };

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = "";

    // Reset mocks
    vi.clearAllMocks();
    lazyLoaderLoaded = false;

    // Set up environment
    setupLazyLoadingEnvironment();
  });

  afterEach(() => {
    // Clean up any observers
    if (global.window && global.window.LazyLoader) {
      // Any cleanup needed
    }
  });

  test("should load actual LazyLoader source code successfully", () => {
    expect(lazyLoadingSource).toBeDefined();
    expect(lazyLoadingSource.length).toBeGreaterThan(1000);
    expect(lazyLoadingSource).toContain("class LazyLoader");
    expect(lazyLoadingSource).toContain("window.LazyLoader = LazyLoader");
  });

  test("should have LazyLoader class available globally after loading", () => {
    expect(global.window.LazyLoader).toBeDefined();
    expect(typeof global.window.LazyLoader).toBe("function");
    expect(typeof global.window.LazyLoader.createSimple).toBe("function");
    expect(typeof global.window.LazyLoader.createAdvanced).toBe("function");
  });

  test("should create LazyLoader instance with default configuration", () => {
    const LazyLoader = global.window.LazyLoader;

    // Set up DOM with lazy loading elements
    document.body.innerHTML = `
      <img data-src="image1.jpg" alt="Test 1">
      <img data-src="image2.jpg" alt="Test 2">
    `;

    const loader = new LazyLoader();

    expect(loader).toBeInstanceOf(LazyLoader);
    expect(loader.config).toBeDefined();
    expect(loader.config.rootMargin).toBe("50px 0px");
    expect(loader.config.threshold).toBe(0.1);
    expect(loader.config.selector).toBe("img[data-src]");
    expect(loader.config.advanced).toBe(false);
  });

  test("should create LazyLoader instance with custom configuration", () => {
    const LazyLoader = global.window.LazyLoader;

    const customConfig = {
      rootMargin: "100px 0px",
      threshold: 0.2,
      selector: ".custom-lazy",
      advanced: true,
      maxRetries: 5,
    };

    document.body.innerHTML = `<div class="custom-lazy" data-loaded="false"></div>`;

    const loader = new LazyLoader(customConfig);

    expect(loader.config.rootMargin).toBe("100px 0px");
    expect(loader.config.threshold).toBe(0.2);
    expect(loader.config.selector).toBe(".custom-lazy");
    expect(loader.config.advanced).toBe(true);
    expect(loader.config.maxRetries).toBe(5);
  });

  test("should initialize IntersectionObserver with correct options", () => {
    const LazyLoader = global.window.LazyLoader;

    document.body.innerHTML = `<img data-src="test.jpg" alt="Test">`;

    new LazyLoader({
      rootMargin: "25px 0px",
      threshold: 0.5,
    });

    expect(global.IntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        rootMargin: "25px 0px",
        threshold: 0.5,
      }),
    );
  });

  test("should observe elements matching selector", () => {
    const LazyLoader = global.window.LazyLoader;

    document.body.innerHTML = `
      <img data-src="image1.jpg" alt="Test 1">
      <img data-src="image2.jpg" alt="Test 2">
      <img src="loaded.jpg" alt="Already loaded">
    `;

    new LazyLoader();

    // Should observe the data-src images but not the already loaded one
    expect(mockIntersectionObserver.observe).toHaveBeenCalledTimes(2);
  });

  test("should handle intersection callback for simple images", () => {
    const LazyLoader = global.window.LazyLoader;

    const img = document.createElement("img");
    img.setAttribute("data-src", "test-image.jpg");
    img.alt = "Test image";
    document.body.appendChild(img);

    new LazyLoader();

    // Simulate intersection callback
    const mockEntry = {
      target: img,
      isIntersecting: true,
    };

    if (observeCallback) {
      observeCallback([mockEntry]);
    }

    // After intersection, image should start loading
    expect(img.src).toContain("test-image.jpg");
    expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(img);
  });

  test(
    "should handle failed image loading with retry logic",
    { timeout: 5000 },
    async () => {
      const LazyLoader = global.window.LazyLoader;

      const img = document.createElement("img");
      img.setAttribute("data-src", "nonexistent-image.jpg");
      document.body.appendChild(img);

      const loader = new LazyLoader();

      // Simulate intersection
      const mockEntry = {
        target: img,
        isIntersecting: true,
      };

      if (observeCallback) {
        observeCallback([mockEntry]);
      }

      // Simulate image load error
      await new Promise((resolve) => {
        setTimeout(() => {
          const errorEvent = new Event("error");
          img.dispatchEvent(errorEvent);

          // Should track failed image
          expect(loader.failedImages).toBeInstanceOf(Map);
          expect(loader.failedImages.size).toBeGreaterThan(0);

          resolve();
        }, 100);
      });
    },
  );

  test("should handle advanced mode with lazy items", () => {
    const LazyLoader = global.window.LazyLoader;

    document.body.innerHTML = `
      <div class="lazy-item" data-loaded="false" data-src="item1.jpg">
        <div class="placeholder">Loading...</div>
      </div>
      <div class="lazy-item" data-loaded="false" data-src="item2.jpg">
        <div class="placeholder">Loading...</div>
      </div>
    `;

    new LazyLoader({
      advanced: true,
      advancedSelector: '.lazy-item[data-loaded="false"]',
    });

    expect(mockIntersectionObserver.observe).toHaveBeenCalledTimes(2);
  });

  test("should use static factory methods", () => {
    const LazyLoader = global.window.LazyLoader;

    document.body.innerHTML = `
      <img data-src="simple1.jpg" alt="Simple 1">
      <img data-src="simple2.jpg" alt="Simple 2">
    `;

    const simpleLoader = LazyLoader.createSimple({
      selector: "img[data-src]",
      threshold: 0.3,
    });

    expect(simpleLoader).toBeInstanceOf(LazyLoader);
    expect(simpleLoader.config.advanced).toBe(false);
    expect(simpleLoader.config.threshold).toBe(0.3);

    const advancedLoader = LazyLoader.createAdvanced({
      advancedSelector: ".advanced-lazy",
    });

    expect(advancedLoader).toBeInstanceOf(LazyLoader);
    expect(advancedLoader.config.advanced).toBe(true);
  });

  test("should handle fallback when IntersectionObserver is not supported", () => {
    // Temporarily remove IntersectionObserver
    const originalIO = global.IntersectionObserver;
    delete global.IntersectionObserver;

    const LazyLoader = global.window.LazyLoader;

    document.body.innerHTML = `
      <img data-src="fallback1.jpg" alt="Fallback 1">
      <img data-src="fallback2.jpg" alt="Fallback 2">
    `;

    const loader = new LazyLoader();

    // Should have fallen back to immediate loading
    expect(loader.observer).toBeNull();

    // Restore IntersectionObserver
    global.IntersectionObserver = originalIO;
  });

  test("should track failed images and provide retry functionality", () => {
    const LazyLoader = global.window.LazyLoader;

    const loader = new LazyLoader();

    // Test failed image tracking methods
    expect(typeof loader.getFailedImageCount).toBe("function");
    expect(typeof loader.clearFailedImages).toBe("function");
    expect(typeof loader.retryAllFailedImages).toBe("function");

    expect(loader.getFailedImageCount()).toBe(0);
  });

  test("should provide utility methods for dynamic control", () => {
    const LazyLoader = global.window.LazyLoader;

    const loader = new LazyLoader();

    // Test utility methods exist
    expect(typeof loader.observeNewElements).toBe("function");
    expect(typeof loader.loadAll).toBe("function");
    expect(typeof loader.destroy).toBe("function");
    expect(typeof loader.updateConfig).toBe("function");
  });

  test("should clean up observer when destroyed", () => {
    const LazyLoader = global.window.LazyLoader;

    const loader = new LazyLoader();

    expect(loader.observer).not.toBeNull();

    loader.destroy();

    expect(mockIntersectionObserver.disconnect).toHaveBeenCalled();
    expect(loader.observer).toBeNull();
  });
});
