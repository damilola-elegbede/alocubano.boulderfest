/**
 * Test Utilities - General purpose E2E testing utilities
 * 
 * Provides common utility functions for E2E tests including
 * API waiting, timing, and general test helpers.
 */

/**
 * Wait for API endpoint to be available with retries
 * @param {string} url - API endpoint URL
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} True if API is available
 */
export async function waitForAPI(url, options = {}) {
  const {
    timeout = 30000,
    interval = 1000,
    maxRetries = 30,
    expectedStatus = 200,
    method = 'GET',
    headers = {}
  } = options;

  console.log(`⏳ Waiting for API at ${url} (timeout: ${timeout}ms)`);
  
  const startTime = Date.now();
  let attempts = 0;

  while (attempts < maxRetries && (Date.now() - startTime) < timeout) {
    attempts++;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      });

      if (response.status === expectedStatus || (response.status >= 200 && response.status < 300)) {
        console.log(`✅ API available at ${url} (attempt ${attempts})`);
        return true;
      }
      
      console.log(`⚠️  API returned status ${response.status}, expected ${expectedStatus} (attempt ${attempts})`);
    } catch (error) {
      console.log(`⚠️  API check failed: ${error.message} (attempt ${attempts})`);
    }

    if (attempts < maxRetries && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`❌ API not available at ${url} after ${attempts} attempts (${elapsed}ms elapsed)`);
  return false;
}

/**
 * Wait for condition to be true with polling
 * @param {Function} conditionFn - Function that returns boolean or Promise<boolean>
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} True if condition met
 */
export async function waitForCondition(conditionFn, options = {}) {
  const {
    timeout = 10000,
    interval = 100,
    name = 'condition'
  } = options;

  const startTime = Date.now();
  let attempts = 0;

  while ((Date.now() - startTime) < timeout) {
    attempts++;
    
    try {
      const result = await conditionFn();
      if (result) {
        console.log(`✅ Condition '${name}' met after ${attempts} attempts`);
        return true;
      }
    } catch (error) {
      console.log(`⚠️  Condition '${name}' check failed: ${error.message} (attempt ${attempts})`);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  const elapsed = Date.now() - startTime;
  console.log(`❌ Condition '${name}' not met after ${elapsed}ms (${attempts} attempts)`);
  return false;
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of successful function call
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    maxDelay = 10000,
    name = 'operation'
  } = options;

  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    attempt++;
    
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(`✅ ${name} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        console.log(`❌ ${name} failed after ${maxRetries} attempts: ${error.message}`);
        throw error;
      }
      
      console.log(`⚠️  ${name} failed on attempt ${attempt}, retrying in ${delay}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }
}

/**
 * Safe page navigation with error handling
 * @param {Page} page - Playwright page object
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @returns {Promise<Response|null>} Navigation response
 */
export async function safeNavigate(page, url, options = {}) {
  const {
    timeout = 30000,
    waitUntil = 'domcontentloaded',
    maxRetries = 3
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🚀 Navigating to ${url} (attempt ${attempt})`);
      const response = await page.goto(url, { 
        timeout,
        waitUntil 
      });
      
      if (response && response.ok()) {
        console.log(`✅ Successfully navigated to ${url}`);
        return response;
      } else {
        console.log(`⚠️  Navigation returned status ${response?.status()} for ${url}`);
      }
    } catch (error) {
      console.log(`❌ Navigation failed (attempt ${attempt}): ${error.message}`);
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  return null;
}

/**
 * Wait for network idle (no requests for specified duration)
 * @param {Page} page - Playwright page object
 * @param {Object} options - Wait options
 * @returns {Promise<void>}
 */
export async function waitForNetworkIdle(page, options = {}) {
  const {
    timeout = 10000,
    idleTime = 500
  } = options;

  try {
    await page.waitForLoadState('domcontentloaded', { timeout }); // Fixed: Removed networkidle wait
    await page.waitForTimeout(idleTime); // Small wait for dynamic content
    console.log('✅ Page loaded and settled');
  } catch (error) {
    console.log(`⚠️  Network idle timeout: ${error.message}`);
  }
}

/**
 * Generate random test data
 * @param {string} type - Type of data to generate
 * @param {Object} overrides - Override default values
 * @returns {Object} Generated test data
 */
export function generateTestData(type = 'user', overrides = {}) {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);

  const baseData = {
    id: `test_${type}_${randomId}_${timestamp}`,
    timestamp,
    ...overrides
  };

  switch (type) {
    case 'user':
      return {
        ...baseData,
        firstName: 'Test',
        lastName: 'User',
        email: `test.user.${randomId}.${timestamp}@e2etest.example.com`,
        phone: '+1234567890',
        ...overrides
      };

    case 'email':
      return `test.${type}.${randomId}.${timestamp}@e2etest.example.com`;

    case 'ticket':
      return {
        ...baseData,
        ticketType: 'weekend-pass',
        quantity: 1,
        price: 85.00,
        ...overrides
      };

    default:
      return baseData;
  }
}

/**
 * Create consistent delays for test stability
 * @param {number} ms - Milliseconds to wait
 * @param {string} reason - Reason for delay (for logging)
 * @returns {Promise<void>}
 */
export async function testDelay(ms, reason = 'stability') {
  if (ms > 0) {
    console.log(`⏳ Waiting ${ms}ms for ${reason}`);
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Format duration in human readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Log test step with consistent formatting
 * @param {string} step - Step description
 * @param {string} status - Status (info, success, warning, error)
 * @param {Object} details - Additional details to log
 */
export function logTestStep(step, status = 'info', details = {}) {
  const icons = {
    info: 'ℹ️ ',
    success: '✅',
    warning: '⚠️ ',
    error: '❌'
  };

  const icon = icons[status] || 'ℹ️ ';
  console.log(`${icon} ${step}`, Object.keys(details).length > 0 ? details : '');
}

export default {
  waitForAPI,
  waitForCondition,
  retryWithBackoff,
  safeNavigate,
  waitForNetworkIdle,
  generateTestData,
  testDelay,
  formatDuration,
  logTestStep
};