/**
 * Test Helpers - Essential utilities for streamlined testing
 * Minimal helper functions under 100 lines total
 */

// Environment detection for intelligent retry behavior
const CI_ENV = process.env.CI === 'true' || process.env.CI === '1';
const POST_MERGE = process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main';

// Retry configuration based on environment
const RETRY_CONFIG = {
  local: { maxRetries: 0, timeout: 5000 },
  ci: { maxRetries: 2, timeout: 10000 },
  postMerge: { maxRetries: 3, timeout: 15000 }
};

// Get current environment configuration
function getRetryConfig() {
  if (POST_MERGE) return RETRY_CONFIG.postMerge;
  if (CI_ENV) return RETRY_CONFIG.ci;
  return RETRY_CONFIG.local;
}

// Sleep utility for exponential backoff
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Simple HTTP client for API testing with intelligent retry and timeout handling
export async function testRequest(method, path, data = null, customHeaders = {}) {
  const config = getRetryConfig();
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}${path}`;
  
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // Setup AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    const options = {
      method,
      headers: { 
        'Content-Type': 'application/json',
        ...customHeaders 
      },
      signal: controller.signal
    };
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      // Handle unexpected status codes explicitly
      if (!response.ok && ![400, 401, 404, 422, 429, 500, 503].includes(response.status)) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
      let responseData;
      const isJson = response.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        try {
          responseData = await response.json();
        } catch {
          responseData = await response.text();
        }
      } else {
        responseData = await response.text();
      }
      return {
        status: response.status,
        data: responseData,
        ok: response.ok
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      // If this is the last attempt, return the error
      if (attempt === config.maxRetries) {
        // Handle timeout errors
        if (error.name === 'AbortError') {
          return {
            status: 0,
            data: { error: `Request timeout for ${method} ${path} after ${attempt + 1} attempts` },
            ok: false
          };
        }
        // Handle network and other errors with context
        return {
          status: 0,
          data: { error: `Network error for ${method} ${path} after ${attempt + 1} attempts: ${error.message}` },
          ok: false
        };
      }
      
      // Log retry attempt and wait with exponential backoff
      const retryDelay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      console.log(`Retry attempt ${attempt + 1}/${config.maxRetries + 1} for ${method} ${path} in ${retryDelay}ms`);
      await sleep(retryDelay);
    }
  }
}
// Generate test email
export function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}
// Generate test payment data
export function generateTestPayment(overrides = {}) {
  return {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { 
      email: generateTestEmail(),
      firstName: 'Test',
      lastName: 'User'
    },
    ...overrides
  };
}

// Add status code constants for consistency
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};