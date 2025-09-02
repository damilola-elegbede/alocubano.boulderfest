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
    setTimeout(() => reject(new Error('Request timeout')), 30000);
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