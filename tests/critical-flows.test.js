/**
 * Critical Business Flow Tests - Cuban Salsa Festival Website
 * Tests the 5 core workflows that matter for business success.
 * Total target: < 200 lines
 */
import { test, expect } from 'vitest';
import { testRequest, testDb, cleanup } from './helpers.js';

// Critical Flow 1: Ticket Purchase
test('complete ticket purchase flow works', async () => {
  const ticketData = {
    cartItems: [{
      name: 'Weekend Pass',
      type: 'ticket', 
      ticketType: 'weekend',
      price: 125.00,
      quantity: 1
    }],
    customerInfo: {
      email: `test-${Date.now()}@example.com`,
      firstName: 'Test',
      lastName: 'User'
    }
  };

  // Create checkout session
  const checkout = await testRequest('POST', '/api/payments/create-checkout-session', ticketData);
  expect(checkout.url).toContain('checkout.stripe.com');
  
  // Simulate successful payment webhook
  const webhook = await testRequest('POST', '/api/payments/stripe-webhook', {
    type: 'checkout.session.completed',
    data: { object: { id: checkout.session_id, payment_status: 'paid' } }
  });
  expect(webhook.status).toBe(200);
  
  // Verify ticket was created
  const tickets = await testDb.query('SELECT * FROM registrations WHERE buyer_email = ?', [ticketData.customerInfo.email]);
  expect(tickets.length).toBe(1);
  expect(tickets[0].status).toBe('confirmed');
});

// Critical Flow 2: Payment Processing
test('stripe payment integration works', async () => {
  const paymentData = {
    amount: 12500, // $125.00 in cents
    currency: 'usd',
    payment_method: 'pm_card_visa'
  };

  const response = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { email: 'payment-test@example.com' }
  });

  expect(response.url).toBeDefined();
  expect(response.session_id).toBeDefined();
  expect(response.url).toContain('checkout.stripe.com');
});

// Critical Flow 3: Database Registration Storage
test('registration data is stored correctly', async () => {
  const registration = {
    buyer_email: `db-test-${Date.now()}@example.com`,
    buyer_name: 'Database Test User',
    event_name: 'A Lo Cubano Boulder Fest 2026',
    ticket_type: 'Weekend Pass',
    unit_price_cents: 12500,
    total_amount_cents: 12500,
    currency: 'usd',
    status: 'confirmed'
  };

  // Insert registration
  const result = await testDb.insert('registrations', registration);
  expect(result.changes).toBe(1);

  // Verify retrieval
  const retrieved = await testDb.query('SELECT * FROM registrations WHERE buyer_email = ?', [registration.buyer_email]);
  expect(retrieved.length).toBe(1);
  expect(retrieved[0].buyer_name).toBe(registration.buyer_name);
  expect(retrieved[0].status).toBe('confirmed');
});

// Critical Flow 4: Email Newsletter Signup
test('newsletter subscription works', async () => {
  const subscribeData = {
    email: `newsletter-${Date.now()}@example.com`,
    name: 'Newsletter Subscriber'
  };

  const response = await testRequest('POST', '/api/email/subscribe', subscribeData);
  expect(response.status).toBe(200);
  expect(response.data.success).toBe(true);
  
  // Verify stored in database
  const subscribers = await testDb.query('SELECT * FROM newsletter_subscribers WHERE email = ?', [subscribeData.email]);
  expect(subscribers.length).toBe(1);
  expect(subscribers[0].name).toBe(subscribeData.name);
});

// Critical Flow 5: Gallery Photo Loading
test('gallery displays photos correctly', async () => {
  const response = await testRequest('GET', '/api/gallery');
  expect(response.status).toBe(200);
  expect(response.data.photos).toBeDefined();
  expect(Array.isArray(response.data.photos)).toBe(true);
  
  // Test that photos have required fields
  if (response.data.photos.length > 0) {
    const photo = response.data.photos[0];
    expect(photo.id).toBeDefined();
    expect(photo.url).toBeDefined();
    expect(photo.thumbnailUrl).toBeDefined();
  }
});

// Error Handling: Payment Failure
test('handles payment failures gracefully', async () => {
  const badPaymentData = {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { email: 'invalid-email' } // Invalid email
  };

  const response = await testRequest('POST', '/api/payments/create-checkout-session', badPaymentData);
  expect([400, 422]).toContain(response.status); // Either validation error is acceptable
  expect(response.data.error).toBeDefined();
});

// Error Handling: Duplicate Email Subscription  
test('prevents duplicate email subscriptions', async () => {
  const email = `duplicate-${Date.now()}@example.com`;
  
  // First subscription - should succeed
  const first = await testRequest('POST', '/api/email/subscribe', { email, name: 'First Try' });
  expect(first.status).toBe(200);
  
  // Second subscription - should be rejected
  const second = await testRequest('POST', '/api/email/subscribe', { email, name: 'Second Try' });
  expect(second.status).toBe(400);
  expect(second.data.error).toContain('already subscribed');
});

// Health Check: Basic API Availability
test('core APIs are accessible', async () => {
  const healthCheck = await testRequest('GET', '/api/health/check');
  expect(healthCheck.status).toBe(200);
  expect(healthCheck.data.status).toBe('ok');
  
  const dbCheck = await testRequest('GET', '/api/health/database');
  expect(dbCheck.status).toBe(200);
  expect(dbCheck.data.database).toBe('connected');
});