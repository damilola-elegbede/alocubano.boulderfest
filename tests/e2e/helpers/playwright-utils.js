/**
 * Playwright Utility Functions
 * Provides compatibility layer for deprecated APIs and common patterns
 * Features unified timeout management based on Playwright config
 */

/**
 * Get dynamic timeout values based on test context
 * This function provides timeouts that scale with the Playwright config
 * @param {TestInfo} testInfo - Playwright test info object
 * @returns {Object} Timeout values derived from config
 */
export function getTimeouts(testInfo) {
  const testTimeout = testInfo?.timeout || (process.env.CI ? 90000 : 60000);

  return {
    // Main timeouts (from config)
    test: testTimeout,
    action: Math.floor(testTimeout * 0.33),        // 33% of test timeout
    navigation: Math.floor(testTimeout * 0.67),     // 67% of test timeout
    expect: Math.floor(testTimeout * 0.22),        // 22% of test timeout

    // Derived timeouts for common operations
    short: Math.floor(testTimeout * 0.08),         // 8% for quick operations (5s/3s)
    medium: Math.floor(testTimeout * 0.17),        // 17% for medium operations (15s/10s)
    long: Math.floor(testTimeout * 0.50),          // 50% for long operations (45s/30s)

    // Network-related timeouts
    healthCheck: Math.floor(testTimeout * 0.33),   // Same as action timeout
    api: Math.floor(testTimeout * 0.22),           // Same as expect timeout
  };
}

/**
 * Modern replacement for page.waitForLoadState('networkidle')
 * Uses a more reliable combination of DOM content loaded and network activity check
 * @param {Page} page - Playwright page object
 * @param {Object} options - Configuration options
 * @param {TestInfo} testInfo - Playwright test info for dynamic timeouts
 * @returns {Promise<void>}
 */
export async function waitForPageReady(page, options = {}, testInfo = null) {
  // Get dynamic timeouts based on test configuration
  const timeouts = getTimeouts(testInfo);

  const {
    timeout = timeouts.medium,  // Use dynamic medium timeout instead of hardcoded 10s
    waitForSelector = null,
    checkNetworkIdle = true,
    networkIdleTimeout = 500
  } = options;

  try {
    // First wait for DOM content to be loaded
    await page.waitForLoadState('domcontentloaded', { timeout });

    // If a specific selector is provided, wait for it
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout });
    }

    // Optional network idle check (less reliable but sometimes useful)
    if (checkNetworkIdle) {
      await page.waitForFunction(() => {
        // Check if there are no pending fetch requests
        // This is a heuristic - not as reliable as the old networkidle
        return !document.querySelector('[data-loading="true"]') &&
               document.readyState === 'complete';
      }, { timeout: networkIdleTimeout });
    }

    // Give a small buffer for any remaining async operations
    await page.waitForTimeout(100);

  } catch (error) {
    console.warn(`waitForPageReady timeout after ${timeout}ms:`, error.message);
    // Don't throw - allow test to continue
  }
}

/**
 * Wait for element to be stable (not moving/changing)
 * Useful replacement for networkidle when waiting for UI elements
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @param {Object} options - Configuration options
 * @param {TestInfo} testInfo - Playwright test info for dynamic timeouts
 * @returns {Promise<void>}
 */
export async function waitForElementStable(page, selector, options = {}, testInfo = null) {
  // Get dynamic timeouts based on test configuration
  const timeouts = getTimeouts(testInfo);
  const { timeout = timeouts.short, stableFor = 200 } = options;

  try {
    await page.waitForSelector(selector, { timeout });

    // Wait for element position to be stable
    await page.waitForFunction(
      ({ selector, stableFor }) => {
        const element = document.querySelector(selector);
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        if (!window._stableElementCheck) {
          window._stableElementCheck = { rect, timestamp: Date.now() };
          return false;
        }

        const prevCheck = window._stableElementCheck;
        const currentTime = Date.now();

        // Check if position changed
        if (rect.x !== prevCheck.rect.x || rect.y !== prevCheck.rect.y ||
            rect.width !== prevCheck.rect.width || rect.height !== prevCheck.rect.height) {
          window._stableElementCheck = { rect, timestamp: currentTime };
          return false;
        }

        // Element has been stable for required duration
        return (currentTime - prevCheck.timestamp) >= stableFor;
      },
      { selector, stableFor },
      { timeout }
    );
  } catch (error) {
    console.warn(`Element ${selector} not stable within ${timeout}ms:`, error.message);
  }
}

/**
 * Helper to get timeout for common test patterns
 * @param {TestInfo} testInfo - Playwright test info
 * @param {string} pattern - Timeout pattern type
 * @returns {number} Timeout value in milliseconds
 */
export function getTestTimeout(testInfo, pattern) {
  const timeouts = getTimeouts(testInfo);

  switch (pattern) {
    case 'quick': return timeouts.short;        // For fast operations (5s/3s)
    case 'normal': return timeouts.medium;      // For normal operations (15s/10s)
    case 'slow': return timeouts.long;          // For slow operations (45s/30s)
    case 'navigation': return timeouts.navigation; // For page navigation
    case 'action': return timeouts.action;      // For user actions
    case 'api': return timeouts.api;           // For API calls
    default: return timeouts.medium;            // Default to normal
  }
}

/**
 * Wait for all images in viewport to load
 * Good replacement for networkidle when images are the main concern
 * @param {Page} page - Playwright page object
 * @param {Object} options - Configuration options
 * @param {TestInfo} testInfo - Playwright test info for dynamic timeouts
 * @returns {Promise<void>}
 */
export async function waitForImagesLoaded(page, options = {}) {
  const { timeout = 10000, selector = 'img' } = options;

  try {
    await page.waitForFunction(
      (selector) => {
        const images = Array.from(document.querySelectorAll(selector));
        if (images.length === 0) return true;

        return images.every(img => {
          if (img.complete) return true;
          if (img.naturalWidth > 0) return true;
          return false;
        });
      },
      selector,
      { timeout }
    );
  } catch (error) {
    console.warn(`Images not loaded within ${timeout}ms:`, error.message);
  }
}

/**
 * Enhanced page navigation with modern waiting strategy
 * @param {Page} page - Playwright page object
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @returns {Promise<void>}
 */
export async function navigateAndWait(page, url, options = {}) {
  const {
    timeout = 30000,
    waitForSelector = null,
    checkImages = false,
    stableElement = null
  } = options;

  // Navigate to the page
  await page.goto(url, { timeout });

  // Wait for page to be ready
  await waitForPageReady(page, {
    timeout,
    waitForSelector,
    checkNetworkIdle: true
  });

  // Optional: wait for images to load
  if (checkImages) {
    await waitForImagesLoaded(page, { timeout: timeout / 2 });
  }

  // Optional: wait for specific element to be stable
  if (stableElement) {
    await waitForElementStable(page, stableElement, { timeout: timeout / 2 });
  }
}

/**
 * Modern replacement for complex waiting scenarios
 * @param {Page} page - Playwright page object
 * @param {Object} conditions - Waiting conditions
 * @returns {Promise<void>}
 */
export async function waitForConditions(page, conditions = {}) {
  const {
    timeout = 10000,
    domReady = true,
    selector = null,
    customFunction = null,
    noLoadingSpinners = true,
    stableForMs = 100
  } = conditions;

  const startTime = Date.now();

  try {
    // Wait for DOM ready
    if (domReady) {
      await page.waitForLoadState('domcontentloaded', { timeout });
    }

    // Wait for specific selector
    if (selector) {
      await page.waitForSelector(selector, {
        timeout: Math.max(1000, timeout - (Date.now() - startTime))
      });
    }

    // Wait for custom condition
    if (customFunction) {
      await page.waitForFunction(customFunction, {}, {
        timeout: Math.max(1000, timeout - (Date.now() - startTime))
      });
    }

    // Wait for no loading spinners
    if (noLoadingSpinners) {
      await page.waitForFunction(() => {
        const spinners = document.querySelectorAll(
          '.loading, .spinner, [data-loading="true"], .loading-overlay'
        );
        return spinners.length === 0;
      }, {}, {
        timeout: Math.max(1000, timeout - (Date.now() - startTime))
      });
    }

    // Final stability check
    if (stableForMs > 0) {
      await page.waitForTimeout(stableForMs);
    }

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.warn(`waitForConditions timeout after ${elapsed}ms:`, error.message);
    // Don't throw - allow test to continue with partial loading
  }
}
