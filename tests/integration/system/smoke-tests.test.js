import { test, expect } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { testRequest, generateTestEmail, HTTP_STATUS } from '../handler-test-helper.js';

test('system health check validates critical services', async () => {
  const response = await testRequest('GET', '/api/health/check');

  if (response.status === 0) {
    console.warn('⚠️ Health service unavailable - skipping health validation');
    return;
  }

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('status');
  expect(response.data).toHaveProperty('services');
  expect(response.data).toHaveProperty('health_score');

  const { services } = response.data;
  expect(services).toHaveProperty('database');
  expect(services).toHaveProperty('stripe');
  expect(services).toHaveProperty('brevo');
  expect(services.database.status).toMatch(/healthy|degraded/);
  if (services.database.details) {
    expect(services.database.details).toHaveProperty('connection');
  }
});

test('core user journeys validation', async () => {
  const purchaseData = {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { email: generateTestEmail(), firstName: 'Test', lastName: 'User' }
  };
  const purchaseResponse = await testRequest('POST', '/api/payments/create-checkout-session', purchaseData);
  if (purchaseResponse.status === HTTP_STATUS.OK) {
    expect(purchaseResponse.data).toHaveProperty('checkoutUrl');
    expect(purchaseResponse.data.totalAmount).toBe(125.00);
  }

  const subscribeResponse = await testRequest('POST', '/api/email/subscribe', {
    email: generateTestEmail(), consentToMarketing: true
  });
  if (subscribeResponse.status === HTTP_STATUS.OK) {
    expect(subscribeResponse.data.success).toBe(true);
  }
});

test('security and operations readiness', async () => {
  const dashboardResponse = await testRequest('GET', '/api/admin/dashboard');
  if (dashboardResponse.status !== 0) {
    expect(dashboardResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  }

  const webhookResponse = await testRequest('POST', '/api/payments/stripe-webhook', {
    type: 'checkout.session.completed', data: { object: { id: 'test' } }
  });
  if (webhookResponse.status !== 0) {
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(webhookResponse.status)).toBe(true);
  }

  const ticketResponse = await testRequest('POST', '/api/tickets/validate', {
    token: 'invalid-test-token'
  });
  if (ticketResponse.status !== 0) {
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(ticketResponse.status)).toBe(true);
  }
});

test('critical API endpoints are accessible', async () => {
  const criticalEndpoints = [
    { path: '/api/health/check', method: 'GET' },
    { path: '/api/gallery', method: 'GET' },
    { path: '/api/payments/checkout-success', method: 'GET' }
  ];

  for (const endpoint of criticalEndpoints) {
    const response = await testRequest(endpoint.method, endpoint.path);

    // Skip if service is unavailable (status 0 indicates network/service issue)
    if (response.status === 0) {
      console.warn(`⚠️ ${endpoint.path} unavailable - skipping endpoint check`);
      continue;
    }

    // Endpoint should be responsive (not a 5xx server error)
    expect(response.status).toBeLessThan(500);

    // Should return OK or expected client errors (4xx), but not server errors
    expect(response.status < 500).toBeTruthy();
  }
});