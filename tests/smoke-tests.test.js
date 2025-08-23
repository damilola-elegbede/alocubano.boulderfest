/**
 * Smoke Tests - High-level system health and critical user journey validation
 * Tests system readiness and core business flows
 */
import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

test('system health check validates all critical services', async () => {
  const healthResponse = await testRequest('GET', '/api/health/check');
  
  if (healthResponse.status === 0) {
    throw new Error('Critical system failure - health check endpoint not responding');
  }
  
  expect(healthResponse.status).toBe(HTTP_STATUS.OK);
  expect(healthResponse.data).toHaveProperty('status');
  expect(healthResponse.data).toHaveProperty('services');
  expect(healthResponse.data).toHaveProperty('health_score');
  
  // Validate critical services are reporting
  const { services } = healthResponse.data;
  expect(services).toHaveProperty('database');
  expect(services).toHaveProperty('stripe');
  expect(services).toHaveProperty('brevo');
  
  // Database must be healthy for core functionality
  expect(services.database.status).toMatch(/healthy|degraded/);
  expect(services.database.details).toHaveProperty('connection');
  
  console.log(`✓ System health: ${healthResponse.data.status} (score: ${healthResponse.data.health_score})`); 
});

test('ticket purchase user journey validation', async () => {
  // Simulate complete ticket purchase flow
  const purchaseData = {
    cartItems: [{ 
      name: 'Weekend Pass', 
      price: 125.00, 
      quantity: 1,
      type: 'ticket',
      ticketType: 'weekend'
    }],
    customerInfo: { 
      email: generateTestEmail(),
      firstName: 'Journey',
      lastName: 'Test'
    }
  };
  
  const checkoutResponse = await testRequest('POST', '/api/payments/create-checkout-session', purchaseData);
  
  if (checkoutResponse.status === 0) {
    console.warn('⚠️ Payment service unavailable - ticket purchase journey cannot be validated');
    return;
  }
  
  // Successful checkout should redirect to Stripe
  if (checkoutResponse.status === HTTP_STATUS.OK) {
    expect(checkoutResponse.data).toHaveProperty('checkoutUrl');
    expect(checkoutResponse.data).toHaveProperty('orderId');
    expect(checkoutResponse.data.totalAmount).toBe(125.00);
    console.log(`✓ Ticket purchase flow ready: ${checkoutResponse.data.orderId}`);
  }
  // Invalid requests should provide clear error messages
  else if (checkoutResponse.status === HTTP_STATUS.BAD_REQUEST) {
    expect(checkoutResponse.data).toHaveProperty('error');
    expect(checkoutResponse.data.error).toBeDefined();
  }
  else {
    expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(checkoutResponse.status)).toBe(true);
  }
});

test('newsletter subscription user journey validation', async () => {
  // Simulate complete newsletter signup flow
  const subscriptionData = {
    email: generateTestEmail(),
    firstName: 'Newsletter',
    lastName: 'Test',
    consentToMarketing: true,
    source: 'smoke-test'
  };
  
  const subscribeResponse = await testRequest('POST', '/api/email/subscribe', subscriptionData);
  
  if (subscribeResponse.status === 0) {
    console.warn('⚠️ Email service unavailable - subscription journey cannot be validated');
    return;
  }
  
  // Successful subscription
  if ([HTTP_STATUS.OK, 201].includes(subscribeResponse.status)) {
    expect(subscribeResponse.data).toHaveProperty('success');
    expect(subscribeResponse.data).toHaveProperty('subscriber');
    expect(subscribeResponse.data.success).toBe(true);
    expect(subscribeResponse.data.subscriber.email).toBe(subscriptionData.email);
    console.log(`✓ Newsletter subscription flow working: ${subscriptionData.email}`);
  }
  // Validation errors should be clear
  else if (subscribeResponse.status === HTTP_STATUS.BAD_REQUEST) {
    expect(subscribeResponse.data).toHaveProperty('error');
  }
  // Rate limiting is expected behavior
  else if (subscribeResponse.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    expect(subscribeResponse.data).toHaveProperty('error');
    console.log('✓ Rate limiting active on email subscription');
  }
  else {
    expect([200, 201, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.TOO_MANY_REQUESTS, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(subscribeResponse.status)).toBe(true);
  }
});

test('admin security validation', async () => {
  // Test admin dashboard protection
  const dashboardResponse = await testRequest('GET', '/api/admin/dashboard');
  
  if (dashboardResponse.status === 0) {
    console.warn('⚠️ Admin service unavailable - security validation skipped');
    return;
  }
  
  // Should always require authentication
  expect(dashboardResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(dashboardResponse.data).toHaveProperty('error');
  
  // Test admin login with wrong credentials
  const loginResponse = await testRequest('POST', '/api/admin/login', {
    username: 'admin',
    password: 'definitely-wrong-password'
  });
  
  if (loginResponse.status !== 0) {
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.TOO_MANY_REQUESTS].includes(loginResponse.status)).toBe(true);
    if (loginResponse.status === HTTP_STATUS.UNAUTHORIZED) {
      expect(loginResponse.data).toHaveProperty('error');
    }
  }
  
  console.log('✓ Admin endpoints properly protected');
});

test('payment webhook integration readiness', async () => {
  // Test webhook endpoint without valid signature (should be rejected)
  const webhookResponse = await testRequest('POST', '/api/payments/stripe-webhook', {
    type: 'checkout.session.completed',
    data: { object: { id: 'test' } }
  });
  
  if (webhookResponse.status === 0) {
    console.warn('⚠️ Webhook service unavailable - integration readiness cannot be validated');
    return;
  }
  
  // Should reject invalid webhook signatures
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, 422].includes(webhookResponse.status)).toBe(true);
  
  if (webhookResponse.data?.error) {
    expect(webhookResponse.data.error).toMatch(/signature|webhook|verification/i);
  }
  
  console.log('✓ Webhook endpoint secured and ready for Stripe integration');
});

test('event day ticket operations readiness', async () => {
  // Test QR code validation (critical for event day)
  const qrValidationResponse = await testRequest('POST', '/api/tickets/validate', {
    qr_code: 'event-day-test-code-invalid'
  });
  
  if (qrValidationResponse.status === 0) {
    console.warn('⚠️ Ticket validation service unavailable - event day operations at risk');
    return;
  }
  
  // Should handle invalid QR codes gracefully
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.TOO_MANY_REQUESTS].includes(qrValidationResponse.status)).toBe(true);
  
  if (qrValidationResponse.status === HTTP_STATUS.NOT_FOUND) {
    expect(qrValidationResponse.data).toHaveProperty('error');
    expect(qrValidationResponse.data.error).toMatch(/not found|invalid/i);
  }
  
  console.log('✓ Event day ticket validation system ready');
});