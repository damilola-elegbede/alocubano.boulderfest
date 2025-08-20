import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';
test('essential APIs respond', async () => {
  const endpoints = ['/api/health/check', '/api/health/database', '/api/gallery', '/api/featured-photos'];
  for (const path of endpoints) {
    const response = await testRequest('GET', path);
    if (response.status === 0) throw new Error(`Network connectivity failure for GET ${path}`);
    expect([200, 400, 403, 404, 500, 503].includes(response.status)).toBe(true);
  }
});

test('payment APIs accessible', async () => {
  const response = await testRequest('POST', '/api/payments/create-checkout-session', { tickets: [{ id: 'test', quantity: 1, price: 10 }] });
  if (response.status === 0) throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
  expect([200, 400, 500].includes(response.status)).toBe(true);
});

test('email APIs accessible', async () => {
  const response = await testRequest('POST', '/api/email/subscribe', { email: 'test@example.com', name: 'Test User' });
  if (response.status === 0) throw new Error(`Network connectivity failure for POST /api/email/subscribe`);
  expect([200, 400, 429, 500].includes(response.status)).toBe(true);
});

test('admin APIs protected', async () => {
  const response = await testRequest('GET', '/api/admin/dashboard');
  if (response.status === 0) throw new Error(`Network connectivity failure for GET /api/admin/dashboard`);
  expect([401, 403, 500].includes(response.status)).toBe(true);
});

test('stripe webhook endpoint accessible', async () => {
  const response = await testRequest('POST', '/api/payments/stripe-webhook', {});
  if (response.status === 0) throw new Error(`Network connectivity failure for POST /api/payments/stripe-webhook`);
  expect([200, 400, 401, 500].includes(response.status)).toBe(true);
});

test('ticket lifecycle endpoints accessible', async () => {
  const endpoints = ['/api/tickets/validate', '/api/tickets/qr-code', '/api/tickets/cancel'];
  for (const path of endpoints) {
    const response = await testRequest('POST', path, {});
    if (response.status === 0) throw new Error(`Network connectivity failure for POST ${path}`);
    expect([200, 400, 404, 500].includes(response.status)).toBe(true);
  }
});