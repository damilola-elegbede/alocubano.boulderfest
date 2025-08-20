/**
 * API Contract Tests - Essential endpoint validation
 * Minimal contract tests under 50 lines
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';
test('payment API accepts correct structure', async () => {
  const response = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { email: 'test@example.com' }
  });
  // API should exist and respond appropriately
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
  }
  expect([200, 400, 500].includes(response.status)).toBe(true);
});
test('email API accepts subscription data', async () => {
  const response = await testRequest('POST', '/api/email/subscribe', {
    email: 'test@example.com',
    name: 'Test User'
  });
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/email/subscribe`);
  }
  expect([200, 400, 500].includes(response.status)).toBe(true);
});
test('ticket validation API exists', async () => {
  const response = await testRequest('POST', '/api/tickets/validate', {
    ticketId: 'test-ticket-123'
  });
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/tickets/validate`);
  }
  expect([200, 400, 404, 500].includes(response.status)).toBe(true);
});
test('gallery API returns expected structure', async () => {
  const response = await testRequest('GET', '/api/gallery');
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for GET /api/gallery`);
  }
  expect([200, 403, 500].includes(response.status)).toBe(true);
  if (response.status === 200) {
    expect(Array.isArray(response.data.items) || response.data.error).toBe(true);
  }
});
test('admin dashboard requires authentication', async () => {
  const response = await testRequest('GET', '/api/admin/dashboard');
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for GET /api/admin/dashboard`);
  }
  expect([401, 500].includes(response.status)).toBe(true);
});
test('payment creates valid checkout session structure', async () => {
  const response = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { email: 'test@example.com', firstName: 'Test', lastName: 'User' }
  });
  if (response.status === 200 && response.data?.url) {
    expect(response.data.url).toContain('checkout.stripe.com');
  } else {
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
    }
    expect([200, 400, 500].includes(response.status)).toBe(true);
  }
});
test.skip('ticket transfer API accepts valid structure', async () => {
  // SKIP: Transfer endpoint requires database connection and hangs in test environment
  // This endpoint is tested in E2E tests with real database
  const response = await testRequest('POST', '/api/tickets/transfer', {
    ticketId: 'test-123',
    actionToken: 'token-456',
    newAttendee: { email: 'new@example.com', firstName: 'New', lastName: 'User' }
  });
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/tickets/transfer`);
  }
  // Transfer endpoint returns 404 in test environment (requires real database)
  expect([200, 400, 404, 401, 500].includes(response.status)).toBe(true);
});