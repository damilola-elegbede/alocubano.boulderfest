// Simple test helpers - no complexity
import { getApiUrl } from './setup.js';

export const HTTP_STATUS = {
  OK: 200, BAD_REQUEST: 400, UNAUTHORIZED: 401, NOT_FOUND: 404, CONFLICT: 409, TOO_MANY_REQUESTS: 429
};

export async function testRequest(method, path, data = null) {
  const url = getApiUrl(path);
  
  const options = { 
    method, 
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (data && method !== 'GET') { 
    options.body = JSON.stringify(data); 
  }
  
  // Create timeout promise for CI environment
  const timeout = 30000; // 30 seconds
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeout);
  });
  
  try {
    const response = await Promise.race([
      fetch(url, options),
      timeoutPromise
    ]);
    const responseData = await response.json().catch(() => ({}));
    return { status: response.status, data: responseData };
  } catch (error) {
    // Return status: 0 to indicate connection failure (as expected by tests)
    if (error.message === 'Request timeout') {
      console.warn(`⚠️ Request timeout for ${method} ${path}`);
      return { status: 0, data: { error: 'Request timeout' } };
    }
    return { status: 0, data: { error: 'Connection failed' } };
  }
}

export function generateTestEmail() {
  return `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}