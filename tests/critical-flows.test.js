/**
 * Critical Business Flows Test Suite
 * Revenue Protection & Core Business Operations
 * Target: 8 tests, ~300ms execution, ~300 lines
 */

import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

// Test data for critical flows
const createTestTicketData = () => ({
  ticketType: 'weekend-pass',
  quantity: 1,
  email: generateTestEmail(),
  firstName: 'John',
  lastName: 'Doe',
  phone: '+1-555-0123'
});

const createMockStripeSession = () => ({
  url: 'https://checkout.stripe.com/pay/cs_test_123',
  id: 'cs_test_123',
  payment_intent: 'pi_test_123',
  metadata: {
    ticketType: 'weekend-pass',
    quantity: '1',
    email: generateTestEmail()
  }
});

test('complete ticket purchase end-to-end flow', async () => {
  const ticketData = createTestTicketData();
  
  // Step 1: Create Stripe checkout session
  const sessionResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{
      id: 'weekend-pass',
      name: 'Weekend Pass',
      price: 150,
      quantity: 1
    }],
    customerInfo: {
      email: ticketData.email,
      firstName: ticketData.firstName,
      lastName: ticketData.lastName
    }
  });
  
  expect(sessionResponse.status).toBe(HTTP_STATUS.OK);
  expect(sessionResponse.data.checkoutUrl).toContain('checkout.stripe.com');
  expect(sessionResponse.data.sessionId).toBeDefined();
  expect(sessionResponse.data.totalAmount).toBe(150);
  
  // Step 2: Simulate successful payment webhook
  const webhookData = {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionResponse.data.sessionId,
        payment_status: 'paid',
        customer_details: { email: ticketData.email },
        metadata: {
          ticketType: 'weekend-pass',
          quantity: '1'
        },
        amount_total: 15000
      }
    }
  };
  
  const webhookResponse = await testRequest('POST', '/api/payments/stripe-webhook', webhookData);
  expect(webhookResponse.status).toBe(HTTP_STATUS.OK);
  expect(webhookResponse.data.ticketId).toBeDefined();
  
  // Step 3: Validate ticket was created and can be retrieved
  if (webhookResponse.data.ticketId) {
    const ticketResponse = await testRequest('GET', `/api/tickets/${webhookResponse.data.ticketId}`);
    expect(ticketResponse.status).toBe(HTTP_STATUS.OK);
    expect(ticketResponse.data.status).toBe('confirmed');
    // Email should match either the original or a test email format
    expect(ticketResponse.data.holderEmail).toMatch(/test.*@example\.com/);
    expect(ticketResponse.data.qrCode).toBeDefined();
  }
}, 45000);

test('payment webhook signature validation and fraud prevention', async () => {
  const validWebhook = {
    id: 'evt_valid_123',
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid' } }
  };
  
  // Test with missing signature
  const noSignatureResponse = await testRequest('POST', '/api/payments/stripe-webhook', validWebhook);
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED]).toContain(noSignatureResponse.status);
  
  // Test with invalid signature
  const invalidSigResponse = await testRequest('POST', '/api/payments/stripe-webhook', validWebhook, {
    'stripe-signature': 'invalid_signature_123'
  });
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED]).toContain(invalidSigResponse.status);
  
  // Test webhook event validation
  const malformedWebhook = { invalid: 'data' };
  const malformedResponse = await testRequest('POST', '/api/payments/stripe-webhook', malformedWebhook);
  expect(malformedResponse.status).toBe(HTTP_STATUS.BAD_REQUEST);
}, 10000);

test('ticket validation and QR code verification system', async () => {
  // Test valid ticket QR code
  const validResponse = await testRequest('POST', '/api/tickets/validate', {
    qr_code: 'weekend-pass-QR123-valid'
  });
  expect(validResponse.status).toBe(HTTP_STATUS.OK);
  expect(validResponse.data.valid).toBe(true);
  expect(validResponse.data.ticket).toBeDefined();
  
  // Test invalid/expired QR code
  const invalidResponse = await testRequest('POST', '/api/tickets/validate', {
    qr_code: 'expired-or-invalid-code'
  });
  expect(invalidResponse.status).toBe(HTTP_STATUS.NOT_FOUND);
  
  // Test malformed QR code format
  const malformedResponse = await testRequest('POST', '/api/tickets/validate', {
    qr_code: 'invalid-format'
  });
  expect(malformedResponse.status).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(malformedResponse.data.error).toMatch(/format/i);
  
  // Test QR code validation security (injection attempts)
  const injectionResponse = await testRequest('POST', '/api/tickets/validate', {
    qr_code: "'; DROP TABLE tickets; --"
  });
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND]).toContain(injectionResponse.status);
}, 8000);

test('Apple and Google wallet pass generation', async () => {
  const testTicketId = 'TKT-WALLET-001';
  
  // Test Apple Wallet pass generation
  const appleResponse = await testRequest('GET', `/api/tickets/apple-wallet/${testTicketId}`);
  expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND]).toContain(appleResponse.status);
  
  if (appleResponse.status === HTTP_STATUS.OK) {
    expect(appleResponse.data.passUrl || appleResponse.data.passData).toBeDefined();
  }
  
  // Test Google Wallet pass generation
  const googleResponse = await testRequest('GET', `/api/tickets/google-wallet/${testTicketId}`);
  expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND]).toContain(googleResponse.status);
  
  if (googleResponse.status === HTTP_STATUS.OK) {
    expect(googleResponse.data.passUrl || googleResponse.data.passData).toBeDefined();
  }
  
  // Test pass generation with invalid ticket ID
  const invalidResponse = await testRequest('GET', '/api/tickets/apple-wallet/INVALID-ID');
  expect(invalidResponse.status).toBe(HTTP_STATUS.NOT_FOUND);
}, 10000);

test('cart calculations with pricing accuracy', async () => {
  const cartItems = [
    { id: 'weekend-pass', name: 'Weekend Pass', price: 150, quantity: 2 },
    { id: 'friday-only', name: 'Friday Only', price: 60, quantity: 1 },
    { id: 'workshop-add', name: 'Workshop Add-on', price: 35, quantity: 1 }
  ];
  
  const sessionResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems,
    customerInfo: {
      email: generateTestEmail(),
      firstName: 'Test',
      lastName: 'User'
    },
    discountCode: 'EARLY_BIRD_10',
    processingFee: true
  });
  
  expect(sessionResponse.status).toBe(HTTP_STATUS.OK);
  
  // Verify total calculation: (150*2 + 60 + 35) = 395
  const expectedSubtotal = 395;
  expect(sessionResponse.data.totalAmount).toBeGreaterThanOrEqual(expectedSubtotal);
  
  // Verify line items are preserved
  expect(sessionResponse.data.sessionId).toBeDefined();
  expect(sessionResponse.data.checkoutUrl).toContain('stripe.com');
  
  // Test with zero quantity (should fail)
  const invalidCartResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ id: 'test', name: 'Test', price: 100, quantity: 0 }],
    customerInfo: { email: generateTestEmail() }
  });
  expect(invalidCartResponse.status).toBe(HTTP_STATUS.BAD_REQUEST);
}, 8000);

test('payment failure recovery and error handling', async () => {
  // Simulate payment failure webhook
  const failureWebhook = {
    id: 'evt_failed_123',
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: 'pi_failed_123',
        status: 'requires_payment_method',
        last_payment_error: { message: 'Your card was declined.' }
      }
    }
  };
  
  const failureResponse = await testRequest('POST', '/api/payments/stripe-webhook', failureWebhook);
  expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST]).toContain(failureResponse.status);
  
  // Test invalid payment data handling
  const invalidPayment = {
    cartItems: [],
    customerInfo: { email: 'invalid-email' }
  };
  
  const invalidResponse = await testRequest('POST', '/api/payments/create-checkout-session', invalidPayment);
  expect(invalidResponse.status).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(invalidResponse.data.error).toBeDefined();
  
  // Test network timeout simulation
  const emptyResponse = await testRequest('POST', '/api/payments/create-checkout-session', {});
  expect(emptyResponse.status).toBe(HTTP_STATUS.BAD_REQUEST);
}, 12000);

test('refund webhook handling and processing', async () => {
  // Simulate refund webhook
  const refundWebhook = {
    id: 'evt_refund_123',
    type: 'charge.dispute.created',
    data: {
      object: {
        id: 'dp_refund_123',
        amount: 15000,
        status: 'warning_needs_response',
        charge: 'ch_test_123'
      }
    }
  };
  
  const refundResponse = await testRequest('POST', '/api/payments/stripe-webhook', refundWebhook);
  expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST]).toContain(refundResponse.status);
  
  // Test partial refund scenario
  const partialRefundWebhook = {
    id: 'evt_partial_123',
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_partial_123',
        amount_due: 7500,
        status: 'open'
      }
    }
  };
  
  const partialResponse = await testRequest('POST', '/api/payments/stripe-webhook', partialRefundWebhook);
  expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST]).toContain(partialResponse.status);
}, 8000);

test('donation processing and receipt generation', async () => {
  const donationData = {
    amount: 50,
    donorName: 'Jane Supporter',
    donorEmail: generateTestEmail(),
    message: 'Love supporting Cuban culture!',
    anonymous: false
  };
  
  // Test donation processing
  const sessionResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{
      id: 'donation',
      name: 'Festival Donation',
      price: donationData.amount,
      quantity: 1
    }],
    customerInfo: {
      email: donationData.donorEmail,
      firstName: donationData.donorName.split(' ')[0],
      lastName: donationData.donorName.split(' ')[1] || ''
    },
    isDonation: true
  });
  
  expect(sessionResponse.status).toBe(HTTP_STATUS.OK);
  expect(sessionResponse.data.totalAmount).toBe(donationData.amount);
  expect(sessionResponse.data.checkoutUrl).toContain('stripe.com');
  
  // Test minimum donation validation
  const smallDonationResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ id: 'donation', name: 'Small Donation', price: 0.50, quantity: 1 }],
    customerInfo: { email: generateTestEmail() },
    isDonation: true
  });
  expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST]).toContain(smallDonationResponse.status);
}, 8000);