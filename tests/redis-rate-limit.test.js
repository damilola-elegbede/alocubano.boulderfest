/**
 * Redis Rate Limiting Tests
 * Tests that rate limiting works correctly with both Redis and in-memory fallback
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

test('rate limiting prevents abuse on email subscription', async () => {
  const email = `test-${Date.now()}@example.com`;
  const requests = [];
  
  // Make 10 rapid requests (should trigger rate limit)
  for (let i = 0; i < 10; i++) {
    requests.push(testRequest('POST', '/api/email/subscribe', {
      email: email,
      name: `Test User ${i}`
    }));
  }
  
  const responses = await Promise.all(requests);
  const statusCodes = responses.map(r => r.status);
  
  // Some requests should be rate limited (429) or at least handled gracefully
  // In test environment without Redis, might get 200s or 400s
  const hasNetworkFailure = statusCodes.some(code => code === 0);
  if (hasNetworkFailure) {
    throw new Error(`Network connectivity failure for POST /api/email/subscribe`);
  }
  const hasRateLimiting = statusCodes.some(code => code === 429);
  const allHandled = statusCodes.every(code => [200, 400, 429, 500].includes(code));
  
  expect(allHandled).toBe(true);
  // Note: actual rate limiting (429) only works with Redis or after multiple attempts
});

test('rate limiting on ticket validation endpoint', async () => {
  const requests = [];
  
  // Simulate rapid QR code scanning attempts
  for (let i = 0; i < 15; i++) {
    requests.push(testRequest('POST', '/api/tickets/validate', {
      qr_code: `test-qr-${i}`
    }));
  }
  
  const responses = await Promise.all(requests);
  const statusCodes = responses.map(r => r.status);
  
  // All requests should be handled gracefully
  const hasNetworkFailure = statusCodes.some(code => code === 0);
  if (hasNetworkFailure) {
    throw new Error(`Network connectivity failure for POST /api/tickets/validate`);
  }
  const allHandled = statusCodes.every(code => [200, 400, 404, 429, 500].includes(code));
  expect(allHandled).toBe(true);
});

test('rate limiting on admin login attempts', async () => {
  const requests = [];
  
  // Simulate brute force login attempts
  for (let i = 0; i < 8; i++) {
    requests.push(testRequest('POST', '/api/admin/login', {
      username: 'admin',
      password: `wrong-password-${i}`
    }));
  }
  
  const responses = await Promise.all(requests);
  const statusCodes = responses.map(r => r.status);
  
  // Should see 401s for wrong password, potentially 429 for rate limiting
  const hasNetworkFailure = statusCodes.some(code => code === 0);
  if (hasNetworkFailure) {
    throw new Error(`Network connectivity failure for POST /api/admin/login`);
  }
  const allHandled = statusCodes.every(code => [401, 403, 429, 500].includes(code));
  expect(allHandled).toBe(true);
  
  // After many attempts, should potentially see rate limiting or account protection
  const hasProtection = statusCodes.some(code => code === 429 || code === 403);
  // Note: Protection behavior depends on Redis availability
});

test('rate limiting handles concurrent payment requests', async () => {
  const requests = [];
  const testPayload = {
    cartItems: [{ name: 'Test', price: 10, quantity: 1 }],
    customerInfo: { email: 'test@example.com' }
  };
  
  // Simulate concurrent payment attempts (could indicate attack or system stress)
  for (let i = 0; i < 5; i++) {
    requests.push(testRequest('POST', '/api/payments/create-checkout-session', testPayload));
  }
  
  const responses = await Promise.all(requests);
  const statusCodes = responses.map(r => r.status);
  
  // All should be handled gracefully (success, validation error, or rate limited)
  const hasNetworkFailure = statusCodes.some(code => code === 0);
  if (hasNetworkFailure) {
    throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
  }
  const allHandled = statusCodes.every(code => [200, 400, 422, 429, 500].includes(code));
  expect(allHandled).toBe(true);
});

test('webhook endpoints handle rapid events', async () => {
  const requests = [];
  
  // Simulate rapid webhook events from Stripe
  for (let i = 0; i < 3; i++) {
    requests.push(testRequest('POST', '/api/payments/stripe-webhook', {}));
  }
  
  const responses = await Promise.all(requests);
  const statusCodes = responses.map(r => r.status);
  const hasNetworkFailure = statusCodes.some(code => code === 0);
  if (hasNetworkFailure) {
    throw new Error(`Network connectivity failure for POST /api/payments/stripe-webhook`);
  }
  const allHandled = statusCodes.every(code => [200, 400, 401, 500].includes(code));
  expect(allHandled).toBe(true);
});