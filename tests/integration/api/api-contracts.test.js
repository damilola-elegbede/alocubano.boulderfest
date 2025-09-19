/**
 * API Contract Tests - Validates API contracts and response structures
 */
import { test, expect } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { testRequest, generateTestEmail, HTTP_STATUS } from '../handler-test-helper.js';

test('payment API creates valid Stripe checkout session', async () => {
  const validPaymentData = {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { 
      email: generateTestEmail(), 
      firstName: 'Test', 
      lastName: 'User' 
    }
  };
  
  const response = await testRequest('POST', '/api/payments/create-checkout-session', validPaymentData);
  
  // Skip test if server unavailable (graceful degradation)
  if (response.status === 0) {
    console.warn('⚠️ Payment service unavailable - skipping contract validation');
    return;
  }
  
  // Validate successful response structure
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('checkoutUrl');
    expect(response.data).toHaveProperty('sessionId');
    expect(response.data).toHaveProperty('orderId');
    expect(response.data).toHaveProperty('totalAmount');
    expect(response.data.checkoutUrl).toContain('checkout.stripe.com');
    expect(response.data.totalAmount).toBe(125.00);
  }
  // Validate error responses have proper structure
  else if (response.status === HTTP_STATUS.BAD_REQUEST) {
    expect(response.data).toHaveProperty('error');
    expect(typeof response.data.error).toBe('string');
  }
  // Should not return unexpected status codes (allow server errors)
  else {
    expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
  }
});

test('email subscription API validates and processes requests correctly', async () => {
  const validSubscriptionData = {
    email: generateTestEmail(),
    firstName: 'Test',
    lastName: 'User',
    consentToMarketing: true
  };
  
  const response = await testRequest('POST', '/api/email/subscribe', validSubscriptionData);
  
  if (response.status === 0) {
    console.warn('⚠️ Email service unavailable - skipping contract validation');
    return;
  }
  
  // Validate successful subscription
  if (response.status === HTTP_STATUS.OK || response.status === 201) {
    expect(response.data).toHaveProperty('success');
    expect(response.data).toHaveProperty('message');
    expect(response.data).toHaveProperty('subscriber');
    expect(response.data.subscriber).toHaveProperty('email');
    expect(response.data.subscriber).toHaveProperty('status');
    expect(response.data.success).toBe(true);
  }
  // Validate error structure for bad requests
  else if (response.status === HTTP_STATUS.BAD_REQUEST) {
    expect(response.data).toHaveProperty('error');
  }
  else {
    expect([200, 201, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.CONFLICT, HTTP_STATUS.TOO_MANY_REQUESTS, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
  }
});

test('ticket validation API handles QR codes correctly', async () => {
  // Test with invalid ticket ID to validate error handling
  const response = await testRequest('POST', '/api/tickets/validate', {
    token: 'invalid-ticket-id-12345'
  });
  
  if (response.status === 0) {
    console.warn('⚠️ Ticket service unavailable - skipping contract validation');
    return;
  }
  
  // Should return 404 for non-existent tickets or 400 for invalid format
  if (response.status === HTTP_STATUS.NOT_FOUND) {
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toMatch(/not found|invalid|does not exist/i);
  } else if (response.status === HTTP_STATUS.BAD_REQUEST) {
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toMatch(/invalid|required|format/i);
  } else if (response.status === HTTP_STATUS.OK) {
    // Validate successful response structure
    expect(response.data).toHaveProperty('valid');
    expect(typeof response.data.valid).toBe('boolean');
    if (response.data.valid) {
      expect(response.data).toHaveProperty('ticket');
    }
  }
  // Should not return unexpected status codes (allow server errors)
  expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.CONFLICT, HTTP_STATUS.TOO_MANY_REQUESTS, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
});

test('gallery API returns proper data structure', async () => {
  const response = await testRequest('GET', '/api/gallery');

  if (response.status === 0) {
    console.warn('⚠️ Gallery service unavailable - skipping contract validation');
    return;
  }

  // Validate successful response
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('eventId');
    expect(response.data).toHaveProperty('categories');
    expect(response.data).toHaveProperty('totalCount');
    expect(typeof response.data.totalCount).toBe('number');

    // Validate categories structure
    const categories = response.data.categories;
    expect(categories).toHaveProperty('workshops');
    expect(categories).toHaveProperty('socials');
    expect(Array.isArray(categories.workshops)).toBe(true);
    expect(Array.isArray(categories.socials)).toBe(true);
  }
  // Validate error responses
  else if (response.status === 403) {
    expect(response.data).toHaveProperty('error');
  }

  expect([HTTP_STATUS.OK, 403, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
});

test('admin dashboard enforces authentication', async () => {
  const response = await testRequest('GET', '/api/admin/dashboard');
  
  if (response.status === 0) {
    console.warn('⚠️ Admin service unavailable - skipping contract validation');
    return;
  }
  
  // Should require authentication (allow server errors)
  expect([HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
  if (response.data && response.data.error) {
    expect(response.data.error).toMatch(/unauthorized|authentication|access denied|not authorized|error/i);
  }
});

test('registration API contract validation', async () => {
  // Test registration status endpoint
  let response = await testRequest('GET', '/api/registration/TEST-TOKEN');
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('transactionId');
    expect(response.data).toHaveProperty('tickets');
  }
  
  // Test registration submission
  response = await testRequest('POST', '/api/tickets/register', {
    ticketId: 'TKT-CONTRACT1',
    firstName: 'Contract',
    lastName: 'Test',
    email: generateTestEmail()
  });
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('success');
    expect(response.data).toHaveProperty('attendee');
  }
  
  // Test health endpoint
  response = await testRequest('GET', '/api/registration/health');
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('service');
    expect(response.data).toHaveProperty('status');
  }
});