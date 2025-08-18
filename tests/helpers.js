/**
 * Streamlined Test Helpers
 * Simple utilities for the new minimalist test framework
 */

let requestCounter = 0;

/**
 * Generate unique email for testing
 */
export function generateUniqueEmail(prefix = 'test') {
  const timestamp = Date.now();
  const counter = ++requestCounter;
  return `${prefix}-${timestamp}-${counter}@test.example`;
}

/**
 * Simple HTTP test client with basic error handling
 */
export async function testRequest(method, url, data = null) {
  try {
    const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const fullURL = `${baseURL}${url}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Runner/1.0'
      }
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(fullURL, options);
    
    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = { message: 'Non-JSON response' };
    }

    return {
      status: response.status,
      data: responseData,
      headers: Object.fromEntries(response.headers)
    };
  } catch (error) {
    console.warn(`Test request failed: ${method} ${url}`, error.message);
    return {
      status: 0,
      data: { error: error.message },
      headers: {}
    };
  }
}

/**
 * Create test ticket data
 */
export async function createTestTicket(overrides = {}) {
  const defaultTicket = {
    id: `test-ticket-${Date.now()}`,
    buyer_email: generateUniqueEmail('ticket'),
    buyer_name: 'Test User',
    event_name: 'A Lo Cubano Boulder Fest 2026',
    status: 'confirmed',
    purchase_date: new Date().toISOString(),
    ...overrides
  };

  // In a real implementation, this would create the ticket in the database
  // For now, return the mock ticket data
  return defaultTicket;
}

/**
 * Simple retry helper for flaky tests
 */
export async function withRetry(fn, maxAttempts = 3, delay = 100) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
}

/**
 * Sleep utility for tests that need timing
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}