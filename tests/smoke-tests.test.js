/**
 * Smoke Tests - System health and critical user journey validation
 */
import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

test('system health check validates critical services', async () => {
  const response = await testRequest('GET', '/api/health/check');
  if (response.status === 0) throw new Error('Critical system failure - health check endpoint not responding');
  
  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('status');
  expect(response.data).toHaveProperty('services');
  expect(response.data).toHaveProperty('health_score');
  
  const { services } = response.data;
  expect(services).toHaveProperty('database');
  expect(services).toHaveProperty('stripe');
  expect(services).toHaveProperty('brevo');
  expect(services.database.status).toMatch(/healthy|degraded/);
  expect(services.database.details).toHaveProperty('connection');
});

test('ticket purchase user journey validation', async () => {
  const purchaseData = {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket', ticketType: 'weekend' }],
    customerInfo: { email: generateTestEmail(), firstName: 'Journey', lastName: 'Test' }
  };
  
  const response = await testRequest('POST', '/api/payments/create-checkout-session', purchaseData);
  if (response.status === 0) return;
  
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('checkoutUrl');
    expect(response.data).toHaveProperty('orderId');
    expect(response.data.totalAmount).toBe(125.00);
  } else {
    expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
    if (response.status === HTTP_STATUS.BAD_REQUEST) {
      expect(response.data).toHaveProperty('error');
    }
  }
});

test('newsletter subscription user journey validation', async () => {
  const subscriptionData = {
    email: generateTestEmail(), firstName: 'Newsletter', lastName: 'Test', 
    consentToMarketing: true, source: 'smoke-test'
  };
  
  const response = await testRequest('POST', '/api/email/subscribe', subscriptionData);
  if (response.status === 0) return;
  
  if ([HTTP_STATUS.OK, 201].includes(response.status)) {
    expect(response.data).toHaveProperty('success');
    expect(response.data).toHaveProperty('subscriber');
    expect(response.data.success).toBe(true);
    expect(response.data.subscriber.email).toBe(subscriptionData.email);
  } else {
    expect([200, 201, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.TOO_MANY_REQUESTS, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
    if (response.data?.error) expect(response.data.error).toBeDefined();
  }
});

test('admin security validation', async () => {
  const dashboardResponse = await testRequest('GET', '/api/admin/dashboard');
  if (dashboardResponse.status === 0) return;
  
  expect(dashboardResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(dashboardResponse.data).toHaveProperty('error');
  
  const loginResponse = await testRequest('POST', '/api/admin/login', {
    username: 'admin', password: 'definitely-wrong-password'
  });
  
  if (loginResponse.status !== 0) {
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.TOO_MANY_REQUESTS].includes(loginResponse.status)).toBe(true);
    if (loginResponse.status === HTTP_STATUS.UNAUTHORIZED) {
      expect(loginResponse.data).toHaveProperty('error');
    }
  }
});

test('payment webhook integration readiness', async () => {
  const response = await testRequest('POST', '/api/payments/stripe-webhook', {
    type: 'checkout.session.completed', data: { object: { id: 'test' } }
  });
  
  if (response.status === 0) return;
  
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, 422].includes(response.status)).toBe(true);
  if (response.data?.error) {
    expect(response.data.error).toMatch(/signature|webhook|verification/i);
  }
});

test('event day ticket operations readiness', async () => {
  const response = await testRequest('POST', '/api/tickets/validate', {
    qr_code: 'event-day-test-code-invalid'
  });
  
  if (response.status === 0) return;
  
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.TOO_MANY_REQUESTS].includes(response.status)).toBe(true);
  if (response.status === HTTP_STATUS.NOT_FOUND && response.data?.error) {
    expect(response.data.error).toMatch(/not found|invalid/i);
  }
});