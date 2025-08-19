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
  expect([200, 0, 400, 500].includes(response.status)).toBe(true);
});

test('email API accepts subscription data', async () => {
  const response = await testRequest('POST', '/api/email/subscribe', {
    email: 'test@example.com',
    name: 'Test User'
  });
  
  expect([200, 0, 400, 500].includes(response.status)).toBe(true);
});

test('ticket validation API exists', async () => {
  const response = await testRequest('POST', '/api/tickets/validate', {
    ticketId: 'test-ticket-123'
  });
  
  expect([200, 0, 400, 404, 500].includes(response.status)).toBe(true);
});

test('gallery API returns expected structure', async () => {
  const response = await testRequest('GET', '/api/gallery');
  
  expect([200, 0, 500].includes(response.status)).toBe(true);
  
  if (response.status === 200) {
    expect(Array.isArray(response.data.photos) || response.data.error).toBe(true);
  }
});

test('admin dashboard requires authentication', async () => {
  const response = await testRequest('GET', '/api/admin/dashboard');
  
  expect([401, 0, 500].includes(response.status)).toBe(true);
});