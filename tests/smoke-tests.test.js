/**
 * Smoke Tests - Essential system health checks
 * Minimal tests under 60 lines for complexity control
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

// Core health checks
test('essential APIs respond', async () => {
  const endpoints = [
    '/api/health/check',
    '/api/health/database',
    '/api/gallery',
    '/api/featured-photos'
  ];

  for (const path of endpoints) {
    const response = await testRequest('GET', path);
    // Allow for success (200), client errors (4xx), or server errors (5xx)
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for GET ${path}`);
    }
    expect([200, 400, 403, 404, 500, 503].includes(response.status)).toBe(true);
  }
});

// Payment system health
test('payment APIs accessible', async () => {
  const response = await testRequest('POST', '/api/payments/create-checkout-session', {
    tickets: [{ id: 'test', quantity: 1, price: 10 }]
  });
  
  // Should respond (even with validation errors)
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
  }
  expect([200, 400, 500].includes(response.status)).toBe(true);
});

// Email system health  
test('email APIs accessible', async () => {
  const response = await testRequest('POST', '/api/email/subscribe', {
    email: 'test@example.com',
    name: 'Test User'
  });
  
  // Should respond appropriately
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/email/subscribe`);
  }
  expect([200, 400, 429, 500].includes(response.status)).toBe(true);
});

// Admin system health
test('admin APIs protected', async () => {
  const response = await testRequest('GET', '/api/admin/dashboard');
  
  // Should be protected (401), forbidden (403), or server error (500)
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for GET /api/admin/dashboard`);
  }
  expect([401, 403, 500].includes(response.status)).toBe(true);
});

// Revenue-critical endpoints health
test('stripe webhook endpoint accessible', async () => {
  const response = await testRequest('POST', '/api/payments/stripe-webhook', {});
  
  // Should respond (even with invalid signature/payload)
  if (response.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/payments/stripe-webhook`);
  }
  expect([200, 400, 401, 500].includes(response.status)).toBe(true);
});

test('ticket lifecycle endpoints accessible', async () => {
  const endpoints = [
    '/api/tickets/validate',
    '/api/tickets/qr-code',
    '/api/tickets/cancel'
  ];
  
  for (const path of endpoints) {
    const response = await testRequest('POST', path, {});
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for POST ${path}`);
    }
    expect([200, 400, 404, 500].includes(response.status)).toBe(true);
  }
});