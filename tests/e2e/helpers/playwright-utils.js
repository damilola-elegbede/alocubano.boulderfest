/**
 * Playwright Utility Functions
 * Provides compatibility layer for deprecated APIs and common patterns
 */

/**
 * Modern replacement for page.waitForLoadState('networkidle')
 * Uses a more reliable combination of DOM content loaded and network activity check
 * @param {Page} page - Playwright page object
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export async function waitForPageReady(page, options = {}) {
  const {
    timeout = 10000,
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
 * @returns {Promise<void>}
 */
export async function waitForElementStable(page, selector, options = {}) {
  const { timeout = 5000, stableFor = 200 } = options;

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
 * Wait for all images in viewport to load
 * Good replacement for networkidle when images are the main concern
 * @param {Page} page - Playwright page object
 * @param {Object} options - Configuration options
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
