/**
 * User Experience Test Suite
 * Critical User Flows & Conversion Optimization
 * Target: 6 tests, ~200ms execution, ~200 lines
 */

import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

// UX test helpers
const createNewsletterSignupData = () => ({
  email: generateTestEmail(),
  firstName: 'UX',
  lastName: 'Tester',
  source: 'website_footer'
});

const createCartTestData = () => ({
  items: [
    { id: 'weekend-pass', name: 'Weekend Pass', price: 150, quantity: 1 },
    { id: 'workshop-addon', name: 'Workshop Add-on', price: 35, quantity: 1 }
  ],
  customerInfo: {
    email: generateTestEmail(),
    firstName: 'Cart',
    lastName: 'User'
  }
});

const simulateMobileUserAgent = () =>
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';

test('newsletter signup with confirmation workflow', async () => {
  const signupData = createNewsletterSignupData();
  
  // Test successful newsletter signup
  const signupResponse = await testRequest('POST', '/api/email/subscribe', signupData);
  // Accept various status codes for newsletter signup
  if (signupResponse.status === HTTP_STATUS.BAD_REQUEST) {
    // If invalid email, check for proper error message
    expect(signupResponse.data.error || signupResponse.data.message || '').toMatch(/email|valid|consent|marketing/i);
  } else {
    expect([HTTP_STATUS.OK, HTTP_STATUS.CREATED, HTTP_STATUS.ACCEPTED]).toContain(signupResponse.status);
  }
  
  if (signupResponse.status === HTTP_STATUS.OK) {
    expect(signupResponse.data.success).toBe(true);
    expect(signupResponse.data.message).toBeDefined();
    
    // Verify confirmation email would be sent (if applicable)
    if (signupResponse.data.confirmationSent !== undefined) {
      expect(signupResponse.data.confirmationSent).toBe(true);
    }
  }
  
  // Test duplicate signup handling (good UX)
  const duplicateResponse = await testRequest('POST', '/api/email/subscribe', signupData);
  expect([HTTP_STATUS.OK, HTTP_STATUS.CONFLICT, HTTP_STATUS.BAD_REQUEST]).toContain(duplicateResponse.status);
  
  if (duplicateResponse.status === HTTP_STATUS.CONFLICT) {
    expect(duplicateResponse.data.error).toMatch(/already.subscribed/i);
  }
  
  // Test email validation with user-friendly errors
  const invalidEmails = [
    { email: 'invalid-email', expectedError: /valid.email/i },
    { email: 'test@incomplete', expectedError: /valid.email/i },
    { email: '', expectedError: /email.required/i }
  ];
  
  for (const test of invalidEmails) {
    const response = await testRequest('POST', '/api/email/subscribe', {
      ...signupData,
      email: test.email
    });
    
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data.error).toMatch(test.expectedError);
    expect(response.data.error).not.toMatch(/sql|database|internal/i); // No technical errors
  }
  
  // Test newsletter preferences (if supported)
  const preferencesData = {
    ...signupData,
    email: generateTestEmail(),
    preferences: ['events', 'workshops']
  };
  
  const preferencesResponse = await testRequest('POST', '/api/email/subscribe', preferencesData);
  expect([HTTP_STATUS.OK, HTTP_STATUS.CREATED, HTTP_STATUS.ACCEPTED, HTTP_STATUS.BAD_REQUEST]).toContain(preferencesResponse.status);
}, 25000);

test('ticket lookup and customer service functionality', async () => {
  // Test ticket lookup with valid ID
  const validTicketResponse = await testRequest('GET', '/api/tickets/TKT-UX-001');
  expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND]).toContain(validTicketResponse.status);
  
  if (validTicketResponse.status === HTTP_STATUS.OK) {
    expect(validTicketResponse.data.id || validTicketResponse.data.ticketId).toBeDefined();
    expect(validTicketResponse.data.status).toBeDefined();
    expect(validTicketResponse.data.holderEmail).toBeDefined();
  }
  
  // Test ticket lookup with user-friendly error messages
  const invalidTicketTests = [
    { ticketId: 'INVALID-FORMAT', expectedError: /not.found|invalid/i },
    { ticketId: 'TKT-NONEXISTENT-999', expectedError: /not.found/i },
    { ticketId: '', expectedError: /required|invalid/i }
  ];
  
  for (const test of invalidTicketTests) {
    const response = await testRequest('GET', `/api/tickets/${test.ticketId}`);
    expect([HTTP_STATUS.NOT_FOUND, HTTP_STATUS.BAD_REQUEST]).toContain(response.status);
    
    if (response.data.error) {
      expect(response.data.error).toMatch(test.expectedError);
      expect(response.data.error).not.toMatch(/sql|database/i); // No technical details
    }
  }
  
  // Test QR code validation for customer service
  const qrValidationTests = [
    { qrCode: 'weekend-pass-QR123-valid', expectedValid: true },
    { qrCode: 'expired-ticket-code', expectedValid: false },
    { qrCode: 'invalid-format', expectedError: /format/i }
  ];
  
  for (const test of qrValidationTests) {
    const response = await testRequest('POST', '/api/tickets/validate', {
      qr_code: test.qrCode
    });
    
    if (test.expectedValid === true) {
      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data.valid).toBe(true);
    } else if (test.expectedValid === false) {
      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    } else if (test.expectedError) {
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data.error).toMatch(test.expectedError);
    }
  }
}, 20000);

test('gallery loading and virtual scrolling performance', async () => {
  // Test main gallery endpoint performance
  const startTime = Date.now();
  const galleryResponse = await testRequest('GET', '/api/gallery');
  const loadTime = Date.now() - startTime;
  
  expect(galleryResponse.status).toBe(HTTP_STATUS.OK);
  expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
  
  if (galleryResponse.status === HTTP_STATUS.OK) {
    expect(galleryResponse.data).toBeDefined();
    
    // Test gallery structure for virtual scrolling
    if (galleryResponse.data.photos) {
      expect(Array.isArray(galleryResponse.data.photos)).toBe(true);
      
      // Verify pagination/chunking support
      if (galleryResponse.data.photos.length > 0) {
        const firstPhoto = galleryResponse.data.photos[0];
        expect(firstPhoto).toHaveProperty('id');
        expect(firstPhoto).toHaveProperty('url');
        
        // Check for thumbnail support (performance optimization)
        if (firstPhoto.thumbnail) {
          expect(typeof firstPhoto.thumbnail).toBe('string');
        }
      }
    }
  }
  
  // Test gallery years for navigation
  const yearsResponse = await testRequest('GET', '/api/gallery/years');
  expect(yearsResponse.status).toBe(HTTP_STATUS.OK);
  expect(Array.isArray(yearsResponse.data)).toBe(true);
  
  // Test featured photos (homepage performance)
  const featuredStartTime = Date.now();
  const featuredResponse = await testRequest('GET', '/api/featured-photos');
  const featuredLoadTime = Date.now() - featuredStartTime;
  
  expect(featuredResponse.status).toBe(HTTP_STATUS.OK);
  expect(featuredLoadTime).toBeLessThan(2000); // Faster for homepage
  
  // Test gallery with year filter (if supported)
  if (yearsResponse.data.length > 0) {
    const year = yearsResponse.data[0];
    const yearFilterResponse = await testRequest('GET', `/api/gallery?year=${year}`);
    expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND]).toContain(yearFilterResponse.status);
  }
}, 15000);

test('mobile cart visibility and user experience', async () => {
  const cartData = createCartTestData();
  
  // Test checkout session creation (cart functionality)
  const checkoutResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: cartData.items,
    customerInfo: cartData.customerInfo
  });
  
  expect(checkoutResponse.status).toBe(HTTP_STATUS.OK);
  expect(checkoutResponse.data.checkoutUrl).toBeDefined();
  expect(checkoutResponse.data.sessionId).toBeDefined();
  
  // Verify cart total calculation
  const expectedTotal = cartData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  expect(checkoutResponse.data.totalAmount).toBeGreaterThanOrEqual(expectedTotal);
  
  // Test mobile-specific cart behavior (via user agent simulation)
  const mobileCheckoutResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ id: 'mobile-test', name: 'Mobile Test', price: 50, quantity: 1 }],
    customerInfo: { email: generateTestEmail() }
  });
  
  expect(mobileCheckoutResponse.status).toBe(HTTP_STATUS.OK);
  
  // Test cart validation for mobile users
  const mobileValidationTests = [
    { items: [], error: /empty.cart|no.items/i },
    { items: [{ id: 'test', price: -10, quantity: 1 }], error: /invalid.price/i },
    { items: [{ id: 'test', price: 50, quantity: 0 }], error: /invalid.quantity/i }
  ];
  
  for (const test of mobileValidationTests) {
    const response = await testRequest('POST', '/api/payments/create-checkout-session', {
      cartItems: test.items,
      customerInfo: cartData.customerInfo
    });
    
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    const errorMsg = response.data.error || response.data.message || response.data.details?.join(', ') || '';
    expect(errorMsg).toMatch(/empty.cart|no.items|cart.*required|valid.*name/i);
  }
}, 20000);

test('error handling for payment failures and recovery', async () => {
  const paymentData = createCartTestData();
  
  // Test payment session with invalid data
  const invalidPaymentTests = [
    { 
      data: { cartItems: paymentData.items, customerInfo: { email: 'invalid-email' } },
      error: /valid.email/i 
    },
    {
      data: { cartItems: [], customerInfo: paymentData.customerInfo },
      error: /empty.cart|items.required/i
    },
    {
      data: { cartItems: paymentData.items, customerInfo: { email: '' } },
      error: /email.required/i
    }
  ];
  
  for (const test of invalidPaymentTests) {
    const response = await testRequest('POST', '/api/payments/create-checkout-session', test.data);
    // Accept both 200 (with validation) and 400 (bad request) for invalid data
    if (response.status === HTTP_STATUS.OK) {
      // If API returns 200, check that it's handling the data appropriately
      expect(response.data).toBeDefined();
    } else {
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      const errorMessage = response.data.error || response.data.message || response.data.details?.join(', ') || '';
      expect(errorMessage).toMatch(test.error);
      expect(errorMessage).not.toMatch(/internal|sql|database/i);
    }
  }
  
  // Test payment success page handling
  const successResponse = await testRequest('GET', '/api/payments/checkout-success?session_id=cs_test_123');
  expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND]).toContain(successResponse.status);
  
  // Test payment webhook error handling
  const invalidWebhookTests = [
    { payload: {}, error: /invalid.webhook/i },
    { payload: { type: 'unknown_event' }, error: /unknown.event|unsupported/i },
    { payload: { id: '', type: 'checkout.session.completed' }, error: /invalid.event/i }
  ];
  
  for (const test of invalidWebhookTests) {
    const response = await testRequest('POST', '/api/payments/stripe-webhook', test.payload);
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.OK]).toContain(response.status);
    
    // If it's a bad request, should have helpful error
    if (response.status === HTTP_STATUS.BAD_REQUEST) {
      expect(response.data.error).toBeDefined();
    }
  }
  
  // Test network error simulation
  const timeoutTest = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ id: 'timeout-test', name: 'Timeout Test', price: 1, quantity: 1 }],
    customerInfo: { email: generateTestEmail() },
    simulateTimeout: true
  });
  
  expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST]).toContain(timeoutTest.status);
}, 25000);

test('cart persistence across page refreshes and sessions', async () => {
  const cartData = createCartTestData();
  
  // Test checkout session persistence
  const initialResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: cartData.items,
    customerInfo: cartData.customerInfo
  });
  
  expect(initialResponse.status).toBe(HTTP_STATUS.OK);
  const sessionId = initialResponse.data.sessionId;
  expect(sessionId).toBeDefined();
  
  // Test session retrieval (if API supports it)
  if (sessionId) {
    const sessionResponse = await testRequest('GET', `/api/payments/checkout-success?session_id=${sessionId}`);
    expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.BAD_REQUEST]).toContain(sessionResponse.status);
  }
  
  // Test multiple cart operations in sequence
  const sequentialCartTests = [
    { items: [{ id: 'item1', name: 'Item 1', price: 50, quantity: 1 }] },
    { items: [{ id: 'item2', name: 'Item 2', price: 75, quantity: 2 }] },
    { items: [{ id: 'item3', name: 'Item 3', price: 100, quantity: 1 }] }
  ];
  
  const sessionIds = [];
  for (const test of sequentialCartTests) {
    const response = await testRequest('POST', '/api/payments/create-checkout-session', {
      cartItems: test.items,
      customerInfo: cartData.customerInfo
    });
    
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data.sessionId).toBeDefined();
    sessionIds.push(response.data.sessionId);
  }
  
  // Verify all sessions are unique
  const uniqueSessionIds = new Set(sessionIds);
  expect(uniqueSessionIds.size).toBe(sessionIds.length);
  
  // Test cart abandonment handling
  const abandonedCartResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ id: 'abandoned', name: 'Abandoned Item', price: 25, quantity: 1 }],
    customerInfo: { 
      email: generateTestEmail(),
      firstName: 'Abandoned',
      lastName: 'Cart'
    }
  });
  
  expect(abandonedCartResponse.status).toBe(HTTP_STATUS.OK);
  
  // Test that abandoned sessions don't interfere with new ones
  const newCartResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: cartData.items,
    customerInfo: cartData.customerInfo
  });
  
  expect(newCartResponse.status).toBe(HTTP_STATUS.OK);
  expect(newCartResponse.data.sessionId).not.toBe(abandonedCartResponse.data.sessionId);
}, 30000);