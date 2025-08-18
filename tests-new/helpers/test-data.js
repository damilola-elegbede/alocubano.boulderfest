/**
 * Test Data Factory
 * Generates consistent test data for integration tests
 */

export class TestDataFactory {
  /**
   * Generate test ticket data
   */
  static createTicketData(overrides = {}) {
    const defaults = {
      stripe_payment_intent_id: `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event_name: 'Test Event 2026',
      ticket_type: 'Weekend Pass',
      quantity: 1,
      unit_price_cents: 12500, // $125.00
      total_amount_cents: 12500,
      currency: 'usd',
      buyer_name: 'Test User',
      buyer_email: 'test@example.com',
      buyer_phone: '+1234567890',
      status: 'confirmed',
      qr_token: `qr_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      scanned_count: 0,
      max_scans: 5
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate test subscriber data
   */
  static createSubscriberData(overrides = {}) {
    const defaults = {
      email: `test-${Date.now()}@example.com`,
      source: 'website',
      status: 'active',
      brevo_list_id: 2,
      bounce_count: 0
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate test payment intent data
   */
  static createPaymentIntentData(overrides = {}) {
    const defaults = {
      id: `pi_test_${Date.now()}`,
      object: 'payment_intent',
      amount: 12500,
      currency: 'usd',
      status: 'succeeded',
      metadata: {
        event_name: 'Test Event 2026',
        ticket_type: 'Weekend Pass',
        quantity: '1',
        buyer_name: 'Test User',
        buyer_email: 'test@example.com',
        buyer_phone: '+1234567890'
      },
      created: Math.floor(Date.now() / 1000),
      description: 'A Lo Cubano Boulder Fest - Weekend Pass',
      receipt_email: 'test@example.com'
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate test Stripe event data
   */
  static createStripeEvent(eventType = 'payment_intent.succeeded', eventData = {}) {
    const paymentIntent = this.createPaymentIntentData(eventData);

    return {
      id: `evt_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: paymentIntent
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: `req_${Date.now()}`,
        idempotency_key: null
      },
      type: eventType
    };
  }

  /**
   * Generate test checkout session data
   */
  static createCheckoutSessionData(overrides = {}) {
    const defaults = {
      event_name: 'Test Event 2026',
      ticket_type: 'Weekend Pass',
      quantity: 1,
      unit_price_cents: 12500,
      buyer_name: 'Test User',
      buyer_email: 'test@example.com',
      buyer_phone: '+1234567890',
      success_url: 'http://localhost:3001/checkout-success',
      cancel_url: 'http://localhost:3001/tickets'
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate test admin credentials
   */
  static createAdminCredentials() {
    return {
      username: 'admin',
      password: 'test-admin-password'
    };
  }

  /**
   * Generate test QR code data
   */
  static createQrCodeData(ticketId, overrides = {}) {
    const defaults = {
      ticketId,
      maxScans: 5,
      currentScans: 0,
      isValid: true,
      expiresAt: new Date(Date.now() + (180 * 24 * 60 * 60 * 1000)) // 180 days
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate test email data
   */
  static createEmailData(overrides = {}) {
    const defaults = {
      to: 'test@example.com',
      subject: 'Test Email Subject',
      template: 'ticket_confirmation',
      templateData: {
        buyer_name: 'Test User',
        event_name: 'Test Event 2026',
        ticket_type: 'Weekend Pass',
        quantity: 1
      }
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate test webhook payload for Brevo
   */
  static createBrevoWebhookData(eventType = 'delivered', overrides = {}) {
    const defaults = {
      event: eventType,
      email: 'test@example.com',
      id: Math.floor(Math.random() * 1000000),
      date: new Date().toISOString(),
      'message-id': `<${Date.now()}@example.com>`,
      subject: 'Test Email Subject'
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate test API response data
   */
  static createApiResponse(statusCode = 200, data = {}, overrides = {}) {
    const defaults = {
      status: statusCode,
      success: statusCode >= 200 && statusCode < 300,
      timestamp: new Date().toISOString(),
      data
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate realistic test email addresses
   */
  static generateTestEmails(count = 5) {
    const domains = ['example.com', 'test.com', 'demo.org'];
    const names = ['john', 'jane', 'bob', 'alice', 'charlie', 'diana'];
    const emails = [];

    for (let i = 0; i < count; i++) {
      const name = names[Math.floor(Math.random() * names.length)];
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const timestamp = Date.now() + i;
      emails.push(`${name}_${timestamp}@${domain}`);
    }

    return emails;
  }

  /**
   * Generate test performance data
   */
  static createPerformanceData(overrides = {}) {
    const defaults = {
      requestDuration: Math.floor(Math.random() * 500) + 50, // 50-550ms
      databaseDuration: Math.floor(Math.random() * 100) + 10, // 10-110ms
      memoryUsage: {
        rss: Math.floor(Math.random() * 50000000) + 10000000, // 10-60MB
        heapTotal: Math.floor(Math.random() * 30000000) + 5000000, // 5-35MB
        heapUsed: Math.floor(Math.random() * 20000000) + 3000000, // 3-23MB
        external: Math.floor(Math.random() * 5000000) + 1000000 // 1-6MB
      },
      cpuUsage: Math.random() * 100, // 0-100%
      timestamp: new Date().toISOString()
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Create batch test data
   */
  static createBatchData(factoryMethod, count = 10, overrides = []) {
    const batch = [];
    
    for (let i = 0; i < count; i++) {
      const override = overrides[i] || {};
      batch.push(factoryMethod(override));
    }
    
    return batch;
  }

  /**
   * Generate unique test identifiers
   */
  static generateUniqueId(prefix = 'test') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate test dates
   */
  static generateTestDates() {
    const now = new Date();
    
    return {
      past: new Date(now.getTime() - (24 * 60 * 60 * 1000)), // 1 day ago
      present: now,
      future: new Date(now.getTime() + (24 * 60 * 60 * 1000)), // 1 day from now
      farFuture: new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)) // 1 year from now
    };
  }
}

/**
 * Generate basic test data - legacy function for backward compatibility
 */
export function generateTestData() {
  return {
    timestamp: Date.now(),
    testId: TestDataFactory.generateUniqueId(),
    tickets: TestDataFactory.createBatchData(TestDataFactory.createTicketData, 3),
    subscribers: TestDataFactory.createBatchData(TestDataFactory.createSubscriberData, 2),
    adminCredentials: TestDataFactory.createAdminCredentials(),
    dates: TestDataFactory.generateTestDates()
  };
}