// Essential test helpers - zero abstractions, maximum readability
import { getApiUrl } from './setup.js';

// HTTP status codes for readable test assertions
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429
};

// Simple HTTP request wrapper for API testing
export async function testRequest(method, path, data = null, headers = {}) {
  const url = getApiUrl(path);
  
  const options = { 
    method, 
    headers: { 
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  if (data && method !== 'GET') { 
    options.body = JSON.stringify(data); 
  }
  
  // Request timeout handling
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), Number(process.env.VITEST_REQUEST_TIMEOUT || 30000));
  });
  
  try {
    const response = await Promise.race([fetch(url, options), timeoutPromise]);
    const responseData = await response.json().catch(() => ({}));
    return { status: response.status, data: responseData };
  } catch (error) {
    // Tests expect status: 0 for connection failures
    return { 
      status: 0, 
      data: { error: error.message === 'Request timeout' ? 'Request timeout' : 'Connection failed' } 
    };
  }
}

// Generate unique test email addresses
export function generateTestEmail() {
  return `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}

// Generate unique test ID
export function generateTestId(prefix = 'test') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// Create test helper instance for E2E tests
export async function createTestHelper(page) {
  return {
    // Page utilities
    page,
    
    // Navigation helpers
    async navigateTo(url) {
      console.log(`🚀 Navigating to: ${url}`);
      await page.goto(url);
      await page.waitForLoadState('domcontentloaded');
    },

    // Form helpers
    async fillForm(selector, data) {
      for (const [field, value] of Object.entries(data)) {
        const fieldSelector = `${selector} [name="${field}"], ${selector} #${field}`;
        await page.fill(fieldSelector, String(value));
      }
    },

    // Wait utilities
    async waitForElement(selector, options = {}) {
      return await page.waitForSelector(selector, { timeout: 10000, ...options });
    },

    async waitForText(text, options = {}) {
      return await page.waitForSelector(`text=${text}`, { timeout: 10000, ...options });
    },

    // API helpers
    async makeApiRequest(method, path, data = null) {
      return await testRequest(method, path, data);
    },

    // Cleanup helpers
    async cleanup() {
      console.log('🧹 Cleaning up test helper resources');
      // Add any necessary cleanup here
    },

    // Test data generation
    generateTestData(type = 'user') {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).slice(2);
      
      switch (type) {
        case 'user':
          return {
            id: generateTestId('user'),
            firstName: 'Test',
            lastName: 'User', 
            email: `test.${randomId}.${timestamp}@example.com`,
            phone: '+1234567890'
          };
        case 'email':
          return `test.${randomId}.${timestamp}@example.com`;
        default:
          return { id: generateTestId(type), timestamp };
      }
    }
  };
}

// Default export for consistency
export default {
  HTTP_STATUS,
  testRequest,
  generateTestEmail,
  generateTestId,
  createTestHelper
};