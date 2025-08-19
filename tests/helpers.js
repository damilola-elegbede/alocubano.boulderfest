/**
 * Test Helpers - Essential utilities for streamlined testing
 * Minimal helper functions under 100 lines total
 */

// Simple HTTP client for API testing with timeout and error boundaries
export async function testRequest(method, path, data = null, customHeaders = {}) {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}${path}`;
  
  // Setup AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
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
    
    // Handle timeout errors
    if (error.name === 'AbortError') {
      return {
        status: 0,
        data: { error: `Request timeout for ${method} ${path}` },
        ok: false
      };
    }
    
    // Handle network and other errors with context
    return {
      status: 0,
      data: { error: `Network error for ${method} ${path}: ${error.message}` },
      ok: false
    };
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