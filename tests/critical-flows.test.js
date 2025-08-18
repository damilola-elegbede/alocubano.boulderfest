/**
 * Critical Business Flow Tests - Cuban Salsa Festival Website
 * Tests the core business workflows that generate revenue and serve customers.
 * Focus: Real business value, not technical implementation details.
 * Target: 180 lines of high-impact testing
 */
import { test, expect } from 'vitest';
import { testRequest, testDb, createTestTicket, generateUniqueEmail } from './helpers.js';

// Critical Flow 1: Complete Ticket Purchase Journey
test('full ticket purchase flow with webhook processing', async () => {
  const testEmail = generateUniqueEmail('ticket-purchase');
  const ticketData = {
    cartItems: [{
      name: 'Weekend Pass',
      type: 'ticket',
      ticketType: 'weekend', 
      price: 125.00,
      quantity: 2,
      eventName: 'A Lo Cubano Boulder Fest 2026'
    }],
    customerInfo: {
      email: testEmail,
      firstName: 'Maria',
      lastName: 'Rodriguez'
    }
  };

  // Step 1: Create Stripe checkout session
  const checkout = await testRequest('POST', '/api/payments/create-checkout-session', ticketData);
  expect(checkout.status).toBe(200);
  expect(checkout.data.url).toContain('checkout.stripe.com');
  expect(checkout.data.session_id).toBeDefined();

  // Step 2: Simulate successful Stripe webhook
  const webhookPayload = {
    id: 'evt_test_webhook',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: checkout.data.session_id,
        payment_status: 'paid',
        customer_details: {
          email: testEmail,
          name: 'Maria Rodriguez'
        },
        amount_total: 25000, // $250.00 for 2 tickets
        currency: 'usd',
        metadata: {
          cart_items: JSON.stringify(ticketData.cartItems)
        }
      }
    }
  };

  const webhook = await testRequest('POST', '/api/payments/stripe-webhook', webhookPayload);
  expect(webhook.status).toBe(200);

  // Step 3: Verify registration was created
  const registrations = await testDb.query(
    'SELECT * FROM registrations WHERE buyer_email = ? ORDER BY created_at DESC',
    [testEmail]
  );
  expect(registrations.length).toBe(2); // 2 tickets purchased
  expect(registrations[0].status).toBe('confirmed');
  expect(registrations[0].ticket_type).toBe('weekend');
  expect(registrations[0].total_amount_cents).toBe(12500); // $125 per ticket

  // Step 4: Verify tickets can be retrieved
  const ticket = await testRequest('GET', `/api/tickets/${registrations[0].id}`);
  expect(ticket.status).toBe(200);
  expect(ticket.data.qrCode).toBeDefined();
  expect(ticket.data.buyer_email).toBe(testEmail);
});

// Critical Flow 2: Newsletter Subscription with Brevo Integration
test('newsletter signup integrates with email service', async () => {
  const testEmail = generateUniqueEmail('newsletter');
  const subscribeData = {
    email: testEmail,
    name: 'Carlos Santana',
    source: 'website_footer'
  };

  // Subscribe to newsletter
  const response = await testRequest('POST', '/api/email/subscribe', subscribeData);
  expect(response.status).toBe(200);
  expect(response.data.success).toBe(true);
  expect(response.data.message).toContain('subscribed');

  // Verify stored in local database
  const subscribers = await testDb.query(
    'SELECT * FROM newsletter_subscribers WHERE email = ?',
    [testEmail]
  );
  expect(subscribers.length).toBe(1);
  expect(subscribers[0].name).toBe('Carlos Santana');
  expect(subscribers[0].status).toBe('subscribed');
  expect(subscribers[0].source).toBe('website_footer');

  // Test unsubscribe flow
  const unsubscribe = await testRequest('POST', '/api/email/unsubscribe', {
    email: testEmail,
    token: subscribers[0].unsubscribe_token
  });
  expect(unsubscribe.status).toBe(200);
});

// Critical Flow 3: Ticket Validation System
test('QR code ticket validation works correctly', async () => {
  // Create a test ticket
  const testTicket = await createTestTicket({
    buyer_email: generateUniqueEmail('validation'),
    buyer_name: 'Ana Garcia',
    event_name: 'A Lo Cubano Boulder Fest 2026',
    ticket_type: 'Weekend Pass',
    status: 'confirmed'
  });

  // Generate QR code for ticket
  const qrResponse = await testRequest('GET', `/api/tickets/qr-code?ticketId=${testTicket.id}`);
  expect(qrResponse.status).toBe(200);
  expect(qrResponse.data.qrCode).toBeDefined();

  // Validate ticket via QR scan
  const validation = await testRequest('POST', '/api/tickets/validate', {
    qrToken: qrResponse.data.qrToken,
    scanLocation: 'main_entrance'
  });
  expect(validation.status).toBe(200);
  expect(validation.data.valid).toBe(true);
  expect(validation.data.ticket.buyer_name).toBe('Ana Garcia');
  expect(validation.data.ticket.used).toBe(false);

  // Mark ticket as used
  const checkin = await testRequest('POST', '/api/tickets/validate', {
    qrToken: qrResponse.data.qrToken,
    action: 'checkin',
    scanLocation: 'main_entrance'
  });
  expect(checkin.status).toBe(200);
  expect(checkin.data.ticket.used).toBe(true);

  // Verify ticket cannot be used again
  const secondScan = await testRequest('POST', '/api/tickets/validate', {
    qrToken: qrResponse.data.qrToken,
    scanLocation: 'main_entrance'
  });
  expect(secondScan.status).toBe(400);
  expect(secondScan.data.error).toContain('already used');
});

// Critical Flow 4: Gallery Content Delivery
test('gallery API delivers media content efficiently', async () => {
  // Test main gallery endpoint
  const gallery = await testRequest('GET', '/api/gallery?year=2024');
  expect(gallery.status).toBe(200);
  expect(gallery.data.photos).toBeDefined();
  expect(Array.isArray(gallery.data.photos)).toBe(true);

  if (gallery.data.photos.length > 0) {
    const photo = gallery.data.photos[0];
    expect(photo.id).toBeDefined();
    expect(photo.url).toBeDefined();
    expect(photo.thumbnailUrl).toBeDefined();
    expect(photo.alt).toBeDefined();
    expect(typeof photo.width).toBe('number');
    expect(typeof photo.height).toBe('number');
  }

  // Test featured photos endpoint
  const featured = await testRequest('GET', '/api/featured-photos');
  expect(featured.status).toBe(200);
  expect(featured.data.photos).toBeDefined();
  expect(featured.data.photos.length).toBeGreaterThan(0);

  // Test gallery years endpoint
  const years = await testRequest('GET', '/api/gallery/years');
  expect(years.status).toBe(200);
  expect(Array.isArray(years.data.years)).toBe(true);
  expect(years.data.years).toContain(2024);
});

// Critical Flow 5: Database Operations Under Load
test('database handles concurrent operations correctly', async () => {
  const emails = Array.from({ length: 5 }, (_, i) => 
    generateUniqueEmail(`concurrent-${i}`)
  );

  // Create multiple registrations concurrently
  const registrationPromises = emails.map(async (email, index) => {
    const registration = {
      buyer_email: email,
      buyer_name: `Test User ${index}`,
      event_name: 'A Lo Cubano Boulder Fest 2026',
      ticket_type: 'Weekend Pass',
      unit_price_cents: 12500,
      total_amount_cents: 12500,
      currency: 'usd',
      status: 'confirmed',
      payment_id: `test_payment_${index}`,
      created_at: new Date().toISOString()
    };
    return testDb.insert('registrations', registration);
  });

  const results = await Promise.all(registrationPromises);
  results.forEach(result => {
    expect(result.changes).toBe(1);
  });

  // Verify all registrations were created
  const allRegistrations = await testDb.query(
    'SELECT * FROM registrations WHERE buyer_email LIKE ? ORDER BY buyer_email',
    ['test-concurrent-%@%']
  );
  expect(allRegistrations.length).toBe(5);

  // Test concurrent newsletter subscriptions
  const subscriptionPromises = emails.map(async (email, index) => {
    return testRequest('POST', '/api/email/subscribe', {
      email: email.replace('concurrent', 'newsletter'),
      name: `Newsletter User ${index}`
    });
  });

  const subResults = await Promise.all(subscriptionPromises);
  subResults.forEach(result => {
    expect(result.status).toBe(200);
  });
});

// Error Recovery: Payment Webhook Idempotency
test('payment webhooks handle duplicate events correctly', async () => {
  const testEmail = generateUniqueEmail('idempotency');
  const sessionId = `cs_test_${Date.now()}`;
  
  const webhookPayload = {
    id: 'evt_duplicate_test',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_status: 'paid',
        customer_details: {
          email: testEmail,
          name: 'Duplicate Test'
        },
        amount_total: 12500,
        currency: 'usd',
        metadata: {
          cart_items: JSON.stringify([{
            name: 'Weekend Pass',
            type: 'ticket',
            price: 125.00,
            quantity: 1
          }])
        }
      }
    }
  };

  // Send webhook twice
  const first = await testRequest('POST', '/api/payments/stripe-webhook', webhookPayload);
  expect(first.status).toBe(200);

  const second = await testRequest('POST', '/api/payments/stripe-webhook', webhookPayload);
  expect(second.status).toBe(200); // Should not fail, just ignore

  // Verify only one registration was created
  const registrations = await testDb.query(
    'SELECT * FROM registrations WHERE buyer_email = ?',
    [testEmail]
  );
  expect(registrations.length).toBe(1);
});