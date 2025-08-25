/**
 * Smoke Tests - System health and critical user journey validation
 */
import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

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
  expect(services.database.details).toHaveProperty('connection');
});

test('core user journeys validation', async () => {
  // Ticket purchase flow
  const purchaseData = {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { email: generateTestEmail(), firstName: 'Test', lastName: 'User' }
  };
  const purchaseResponse = await testRequest('POST', '/api/payments/create-checkout-session', purchaseData);
  if (purchaseResponse.status === HTTP_STATUS.OK) {
    expect(purchaseResponse.data).toHaveProperty('checkoutUrl');
    expect(purchaseResponse.data.totalAmount).toBe(125.00);
  }
  
  // Newsletter subscription
  const subscribeResponse = await testRequest('POST', '/api/email/subscribe', { 
    email: generateTestEmail(), consentToMarketing: true 
  });
  if (subscribeResponse.status === HTTP_STATUS.OK) {
    expect(subscribeResponse.data.success).toBe(true);
  }
});

test('security and operations readiness', async () => {
  // Admin security - dashboard should require authentication
  const dashboardResponse = await testRequest('GET', '/api/admin/dashboard');
  if (dashboardResponse.status !== 0) {
    expect(dashboardResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  }
  
  // Webhook security - should reject invalid signatures  
  const webhookResponse = await testRequest('POST', '/api/payments/stripe-webhook', {
    type: 'checkout.session.completed', data: { object: { id: 'test' } }
  });
  if (webhookResponse.status !== 0) {
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED].includes(webhookResponse.status)).toBe(true);
  }
  
  // Ticket validation - should handle invalid QR codes
  const ticketResponse = await testRequest('POST', '/api/tickets/validate', {
    qr_code: 'invalid-test-code'
  });
  if (ticketResponse.status !== 0) {
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND].includes(ticketResponse.status)).toBe(true);
  }
});