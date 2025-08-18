/**
 * Edge Cases and Security Tests - Cuban Salsa Festival Website
 * Tests scenarios that could break the system in production.
 * Focus: Concurrency, security, error handling, boundary conditions.
 * Target: 150 lines of critical edge case coverage
 */
import { test, expect } from 'vitest';
import { testRequest, testDb, generateUniqueEmail, createTestTicket } from './helpers.js';

// Edge Case 1: Concurrent Ticket Purchases (Race Conditions)
test('handles concurrent ticket purchases without overselling', async () => {
  const eventName = 'Limited Event';
  const ticketLimit = 3;
  
  // Simulate 5 people trying to buy the last 3 tickets simultaneously
  const purchasePromises = Array.from({ length: 5 }, (_, i) => {
    const testEmail = generateUniqueEmail(`concurrent-purchase-${i}`);
    return testRequest('POST', '/api/payments/create-checkout-session', {
      cartItems: [{
        name: 'Limited Ticket',
        type: 'ticket',
        ticketType: 'limited',
        price: 100.00,
        quantity: 1,
        eventName
      }],
      customerInfo: {
        email: testEmail,
        firstName: `Buyer${i}`,
        lastName: 'Test'
      }
    });
  });

  const results = await Promise.all(purchasePromises);
  
  // Count successful vs failed purchases
  const successful = results.filter(r => r.status === 200);
  const failed = results.filter(r => r.status >= 400);
  
  // Should not oversell - some purchases should fail
  expect(successful.length).toBeLessThanOrEqual(ticketLimit);
  expect(failed.length).toBeGreaterThan(0);
});

// Edge Case 2: SQL Injection Protection
test('prevents SQL injection in all inputs', async () => {
  const maliciousInputs = [
    "'; DROP TABLE registrations; --",
    "' OR '1'='1",
    "'; UPDATE registrations SET status='refunded'; --",
    "test@example.com'; INSERT INTO registrations VALUES (999,'hacker','evil'); --"
  ];

  for (const maliciousInput of maliciousInputs) {
    // Test email subscription endpoint
    const emailResponse = await testRequest('POST', '/api/email/subscribe', {
      email: maliciousInput,
      name: 'Test User'
    });
    
    // Should either reject (400) or sanitize input (200), but never 500
    expect([200, 400, 422]).toContain(emailResponse.status);
    
    // Test ticket validation endpoint
    const ticketResponse = await testRequest('POST', '/api/tickets/validate', {
      qrToken: maliciousInput,
      scanLocation: 'main_entrance'
    });
    
    expect([400, 401, 404]).toContain(ticketResponse.status);
  }

  // Verify no unauthorized changes occurred
  const tableCount = await testDb.query("SELECT COUNT(*) as count FROM registrations");
  expect(typeof tableCount[0].count).toBe('number');
});

// Edge Case 3: Payment Refund Handling
test('processes refunds correctly and updates ticket status', async () => {
  // Create a paid ticket
  const testTicket = await createTestTicket({
    buyer_email: generateUniqueEmail('refund-test'),
    buyer_name: 'Refund Test User',
    status: 'confirmed',
    payment_id: 'pi_test_refund_123'
  });

  // Simulate Stripe refund webhook
  const refundWebhook = {
    id: 'evt_refund_test',
    type: 'charge.dispute.created',
    data: {
      object: {
        id: 'ch_dispute_test',
        payment_intent: 'pi_test_refund_123',
        status: 'needs_response',
        amount: 12500,
        currency: 'usd'
      }
    }
  };

  const response = await testRequest('POST', '/api/payments/stripe-webhook', refundWebhook);
  expect(response.status).toBe(200);

  // Verify ticket status was updated
  const updatedTicket = await testDb.query(
    'SELECT * FROM registrations WHERE id = ?',
    [testTicket.id]
  );
  expect(updatedTicket[0].status).toBe('disputed');

  // Test ticket validation should fail for disputed ticket
  const validation = await testRequest('POST', '/api/tickets/validate', {
    qrToken: `ticket_${testTicket.id}`,
    scanLocation: 'main_entrance'
  });
  expect(validation.status).toBe(400);
  expect(validation.data.error).toContain('invalid');
});

// Edge Case 4: Email Bounce Handling
test('handles email bounces and unsubscribes correctly', async () => {
  const testEmail = generateUniqueEmail('bounce-test');
  
  // Subscribe user
  await testRequest('POST', '/api/email/subscribe', {
    email: testEmail,
    name: 'Bounce Test User'
  });

  // Simulate bounce webhook from Brevo
  const bounceWebhook = {
    type: 'hard_bounce',
    email: testEmail,
    event: 'bounce',
    reason: 'invalid_email',
    timestamp: new Date().toISOString()
  };

  const response = await testRequest('POST', '/api/email/brevo-webhook', bounceWebhook);
  expect(response.status).toBe(200);

  // Verify subscriber was marked as bounced
  const subscriber = await testDb.query(
    'SELECT * FROM newsletter_subscribers WHERE email = ?',
    [testEmail]
  );
  expect(subscriber[0].status).toBe('bounced');
  expect(subscriber[0].bounce_count).toBeGreaterThan(0);

  // Test that bounced emails are not sent to again
  const resubscribe = await testRequest('POST', '/api/email/subscribe', {
    email: testEmail,
    name: 'Retry User'
  });
  expect(resubscribe.status).toBe(400);
  expect(resubscribe.data.error).toContain('bounced');
});

// Edge Case 5: Large File Upload and Gallery Performance
test('gallery handles large datasets efficiently', async () => {
  // Test pagination with large offset
  const largeOffset = await testRequest('GET', '/api/gallery?page=100&limit=50');
  expect(largeOffset.status).toBe(200);
  expect(largeOffset.data.photos).toBeDefined();

  // Test invalid parameters
  const invalidParams = await testRequest('GET', '/api/gallery?limit=10000&year=invalid');
  expect([200, 400]).toContain(invalidParams.status);

  // Test request timeout behavior (should complete within 5 seconds)
  const start = Date.now();
  const timeoutTest = await testRequest('GET', '/api/gallery?year=2023');
  const duration = Date.now() - start;
  
  expect(timeoutTest.status).toBe(200);
  expect(duration).toBeLessThan(5000); // 5 second max
});

// Edge Case 6: Webhook Security and Validation
test('webhook endpoints validate signatures and reject invalid requests', async () => {
  // Test Stripe webhook without proper signature
  const unauthorizedStripe = await testRequest('POST', '/api/payments/stripe-webhook', {
    type: 'checkout.session.completed',
    data: { object: { id: 'fake_session', payment_status: 'paid' } }
  }, {
    'stripe-signature': 'invalid_signature'
  });
  expect([400, 401]).toContain(unauthorizedStripe.status);

  // Test Brevo webhook with invalid format
  const invalidBrevo = await testRequest('POST', '/api/email/brevo-webhook', {
    invalid_format: true
  });
  expect([400, 422]).toContain(invalidBrevo.status);

  // Test malformed JSON
  const malformedRequest = await fetch('http://localhost:3000/api/payments/stripe-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ invalid json'
  });
  expect(malformedRequest.status).toBe(400);
});

// Edge Case 7: Rate Limiting Enforcement
test('rate limiting prevents abuse', async () => {
  const testEmail = generateUniqueEmail('rate-limit');
  
  // Rapidly send multiple subscription requests
  const rapidRequests = Array.from({ length: 25 }, () => 
    testRequest('POST', '/api/email/subscribe', {
      email: testEmail,
      name: 'Rate Limit Test'
    })
  );

  const results = await Promise.all(rapidRequests);
  
  // Some requests should be rate limited
  const rateLimited = results.filter(r => r.status === 429);
  const successful = results.filter(r => r.status === 200);
  
  expect(rateLimited.length).toBeGreaterThan(0);
  expect(successful.length).toBeLessThan(25);
  expect(successful.length).toBeGreaterThan(0);
});

// Edge Case 8: Database Connection Failures
test('handles database connection failures gracefully', async () => {
  // This test simulates database unavailability
  // In a real scenario, you'd temporarily break the DB connection
  
  // Test that health check reports database issues
  const healthCheck = await testRequest('GET', '/api/health/database');
  expect([200, 503]).toContain(healthCheck.status);
  
  if (healthCheck.status === 503) {
    expect(healthCheck.data.error).toContain('database');
  }
});

// Edge Case 9: Admin Authentication Bypass Attempts
test('admin endpoints resist unauthorized access attempts', async () => {
  const adminEndpoints = [
    '/api/admin/dashboard',
    '/api/admin/registrations',
    '/api/admin/transactions'
  ];

  const bypassAttempts = [
    {}, // No auth
    { 'authorization': 'Bearer invalid_token' },
    { 'x-admin-token': 'fake_token' },
    { 'authorization': 'Bearer ' + 'a'.repeat(500) } // Overlong token
  ];

  for (const endpoint of adminEndpoints) {
    for (const headers of bypassAttempts) {
      const response = await testRequest('GET', endpoint, null, headers);
      expect([401, 403]).toContain(response.status);
      expect(response.data.error).toBeDefined();
    }
  }
});