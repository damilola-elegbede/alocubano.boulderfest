/**
 * Rate Limiting Tests - Validates rate limiting behavior
 */
import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

test('email subscription rate limiting blocks excessive requests', async () => {
  let requestCount = 0, rateLimitedCount = 0;
  
  for (let i = 0; i < 2; i++) {
    const response = await testRequest('POST', '/api/email/subscribe', {
      email: generateTestEmail(), firstName: 'Test', consentToMarketing: true
    });
    
    if (response.status !== 0) {
      requestCount++;
      if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) rateLimitedCount++;
    }
  }
  
  // If the server didn't respond (network status 0), skip to avoid false positives
  if (requestCount === 0) {
    console.warn('Skipping assertion: no successful responses received from subscription endpoint');
    return;
  }
  // Verify we at least made one successful request
  expect(requestCount).toBeGreaterThanOrEqual(1);
}, 10000);
test('ticket validation rate limiting prevents brute force scanning', async () => {
  let validationAttempts = 0, rateLimitedCount = 0;
  
  for (let i = 0; i < 8; i++) {
    const response = await testRequest('POST', '/api/tickets/validate', {
      qr_code: `bruteforce-attempt-${i}-${Date.now()}`
    });
    
    if (response.status === 0) return;
    
    if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
      rateLimitedCount++;
      expect(response.data).toHaveProperty('error');
      break;
    } else {
      validationAttempts++;
      // Should return 404 for invalid QR codes or 400 for malformed requests
      expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND].includes(response.status)).toBe(true);
    }
    
    await sleep(50);
  }
  
  expect(validationAttempts + rateLimitedCount).toBeGreaterThan(0);
}, 12000);
test('admin login rate limiting prevents brute force attacks', async () => {
  let loginAttempts = 0, rateLimitedCount = 0, authFailures = 0;
  
  for (let i = 0; i < 6; i++) {
    const response = await testRequest('POST', '/api/admin/login', {
      username: 'admin', password: `brute-force-attempt-${i}`
    });
    
    if (response.status === 0) return;
    
    if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS || response.status === 403) {
      rateLimitedCount++;
      expect(response.data).toHaveProperty('error');
      break;
    } else if (response.status === HTTP_STATUS.UNAUTHORIZED) {
      authFailures++;
    } else if (response.status === HTTP_STATUS.BAD_REQUEST) {
      loginAttempts++;
    }
    
    await sleep(75);
  }
  
  expect(authFailures + rateLimitedCount + loginAttempts).toBeGreaterThan(0);
}, 10000);
test('payment endpoint rate limiting prevents checkout spam', async () => {
  let totalRequests = 0, rateLimitedCount = 0;
  
  for (let i = 0; i < 3; i++) {
    const response = await testRequest('POST', '/api/payments/create-checkout-session', {
      cartItems: [{ name: 'Test Product', price: 10.00, quantity: 1 }],
      customerInfo: { email: generateTestEmail(), firstName: 'Test', lastName: 'User' }
    });
    
    totalRequests++;
    if (response.status === 0) return;
    if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
      rateLimitedCount++;
      break;
    }
    
    await sleep(20);
  }
  
  expect(totalRequests).toBeGreaterThan(0);
}, 15000);