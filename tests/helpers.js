/**
 * Test Helpers - Essential utilities for streamlined testing
 * Minimal helper functions under 100 lines total
 */

// Simple HTTP client for API testing
export async function testRequest(method, path, data = null, customHeaders = {}) {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}${path}`;
  
  const options = {
    method,
    headers: { 
      'Content-Type': 'application/json',
      ...customHeaders 
    }
  };
  
  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = response.headers.get('content-type')?.includes('application/json') 
      ? await response.json() 
      : await response.text();
    
    return {
      status: response.status,
      data: responseData,
      ok: response.ok
    };
  } catch (error) {
    return {
      status: 0,
      data: { error: error.message },
      ok: false
    };
  }
}

// Generate test email
export function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

// Validate email format
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Wait helper for async tests
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Clean test data
export async function cleanupTestData() {
  // Cleanup is handled by database reset in setup
  return true;
}