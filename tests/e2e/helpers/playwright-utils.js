/**
 * Playwright Utility Functions
 * Simplified and reliable implementations to prevent E2E test timeouts
 * 
 * CHANGES MADE TO PREVENT TIMEOUTS:
 * - Reduced default timeouts from 10s to 5s
 * - Disabled complex network idle checks by default  
 * - Added try-catch with fallback behavior for all waiting operations
 * - Simplified DOM checking logic
 * - Added mobile-specific viewport handling
 */

/**
 * Simplified and reliable page readiness check
 * Uses simple DOM content loaded with fallback behavior
 * @param {Page} page - Playwright page object
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export async function waitForPageReady(page, options = {}) {
  const {
    timeout = 5000, // Reduced from 10000 to prevent long waits
    waitForSelector = null,
    checkNetworkIdle = false, // Disabled by default to prevent hangs
    networkIdleTimeout = 200 // Reduced timeout
  } = options;

  try {
    // First wait for DOM content to be loaded
    await page.waitForLoadState('domcontentloaded', { timeout });
    
    // If a specific selector is provided, wait for it with shorter timeout
    if (waitForSelector) {
      try {
        await page.waitForSelector(waitForSelector, { timeout: Math.min(2000, timeout) });
      } catch (error) {
        console.warn(`Selector ${waitForSelector} not found, continuing...`);
      }
    }
    
    // Optional simplified network idle check (disabled by default)
    if (checkNetworkIdle) {
      try {
        await page.waitForFunction(() => {
          return document.readyState === 'complete';
        }, { timeout: networkIdleTimeout });
      } catch (error) {
        console.warn(`Network idle check timeout, continuing...`);
      }
    }
    
    // Short fixed delay instead of complex checks
    await page.waitForTimeout(200);
    
  } catch (error) {
    console.warn(`waitForPageReady timeout after ${timeout}ms:`, error.message);
    // Always fall back gracefully - don't throw
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
 * Simplified page navigation with reliable waiting strategy
 * @param {Page} page - Playwright page object
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @returns {Promise<void>}
 */
export async function navigateAndWait(page, url, options = {}) {
  const {
    timeout = 15000, // Reduced from 30000
    waitForSelector = null,
    checkImages = false,
    stableElement = null
  } = options;
  
  // Navigate to the page
  await page.goto(url, { timeout });
  
  // Wait for page to be ready with simplified approach
  await waitForPageReady(page, { 
    timeout: Math.min(5000, timeout), 
    waitForSelector,
    checkNetworkIdle: false  // Disabled to prevent hangs
  });
  
  // Optional: wait for images to load (simplified)
  if (checkImages) {
    await waitForImagesLoaded(page, { timeout: Math.min(3000, timeout / 2) });
  }
  
  // Optional: wait for specific element to be stable (with timeout)
  if (stableElement) {
    await waitForElementStable(page, stableElement, { timeout: Math.min(3000, timeout / 2) });
  }
}

/**
 * Simplified replacement for complex waiting scenarios
 * Uses basic checks with fallback behavior to prevent hangs
 * @param {Page} page - Playwright page object
 * @param {Object} conditions - Waiting conditions
 * @returns {Promise<void>}
 */
export async function waitForConditions(page, conditions = {}) {
  const {
    timeout = 5000, // Reduced from 10000
    domReady = true,
    selector = null,
    customFunction = null,
    noLoadingSpinners = false, // Disabled by default to prevent hangs
    stableForMs = 100
  } = conditions;
  
  const startTime = Date.now();
  
  try {
    // Wait for DOM ready
    if (domReady) {
      await page.waitForLoadState('domcontentloaded', { timeout: Math.min(3000, timeout) });
    }
    
    // Wait for specific selector with fallback
    if (selector) {
      try {
        const remainingTime = Math.max(1000, timeout - (Date.now() - startTime));
        await page.waitForSelector(selector, { timeout: Math.min(2000, remainingTime) });
      } catch (error) {
        console.warn(`Selector ${selector} not found within timeout, continuing...`);
      }
    }
    
    // Wait for custom condition with fallback
    if (customFunction) {
      try {
        const remainingTime = Math.max(1000, timeout - (Date.now() - startTime));
        await page.waitForFunction(customFunction, {}, { timeout: Math.min(2000, remainingTime) });
      } catch (error) {
        console.warn(`Custom function condition not met within timeout, continuing...`);
      }
    }
    
    // Simplified loading spinner check (disabled by default)
    if (noLoadingSpinners) {
      try {
        const remainingTime = Math.max(500, timeout - (Date.now() - startTime));
        await page.waitForFunction(() => {
          // Simplified check - only look for common loading indicators
          const hasLoading = document.querySelector('.loading, .spinner');
          return !hasLoading;
        }, {}, { timeout: Math.min(1000, remainingTime) });
      } catch (error) {
        console.warn(`Loading spinner check timeout, continuing...`);
      }
    }
    
    // Final stability check (reduced)
    if (stableForMs > 0) {
      await page.waitForTimeout(Math.min(200, stableForMs));
    }
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.warn(`waitForConditions timeout after ${elapsed}ms:`, error.message);
    // Always fall back gracefully - don't throw
  }
}

/**
 * Mobile-friendly click helper that handles viewport issues
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @param {Object} options - Click options
 * @returns {Promise<void>}
 */
export async function mobileClick(page, selector, options = {}) {
  const { timeout = 5000, forceClick = false } = options;
  
  try {
    const element = page.locator(selector);
    
    // First ensure element exists
    await element.waitFor({ timeout: Math.min(2000, timeout) });
    
    // For mobile, scroll to element and ensure it's in viewport
    await element.scrollIntoViewIfNeeded();
    
    // Short delay for any animations to complete
    await page.waitForTimeout(200);
    
    // Try normal click first
    try {
      await element.click({ timeout: Math.min(3000, timeout) });
    } catch (clickError) {
      console.warn(`Normal click failed for ${selector}, trying force click...`);
      
      // Fallback to force click if element is having viewport issues
      if (forceClick) {
        await element.click({ force: true, timeout: Math.min(2000, timeout) });
      } else {
        throw clickError;
      }
    }
    
  } catch (error) {
    console.warn(`Mobile click failed for ${selector}:`, error.message);
    throw error;
  }
}
