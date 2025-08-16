/**
 * Stripe Webhook Helpers for Integration Tests
 * Handles Stripe webhook signature generation and payment simulation
 */
import crypto from 'crypto';
import { httpClient } from './http.js';

class StripeHelpers {
  constructor() {
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  }

  /**
   * Generate Stripe webhook signature
   */
  generateWebhookSignature(payload, secret = null) {
    const webhookSecret = secret || this.webhookSecret;
    
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable required');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    // Create signature string
    const signaturePayload = `${timestamp}.${payloadString}`;
    
    // Generate HMAC signature
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signaturePayload, 'utf8')
      .digest('hex');
    
    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Create test payment intent succeeded event
   */
  createPaymentIntentSucceededEvent(paymentIntentData = {}) {
    const defaultPaymentIntent = {
      id: `pi_test_${Date.now()}`,
      object: 'payment_intent',
      amount: 12500, // $125.00 in cents
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

    const paymentIntent = { ...defaultPaymentIntent, ...paymentIntentData };

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
      type: 'payment_intent.succeeded'
    };
  }

  /**
   * Create test payment intent failed event
   */
  createPaymentIntentFailedEvent(paymentIntentData = {}) {
    const paymentIntent = {
      id: `pi_test_${Date.now()}`,
      object: 'payment_intent',
      amount: 12500,
      currency: 'usd',
      status: 'requires_payment_method',
      last_payment_error: {
        code: 'card_declined',
        decline_code: 'generic_decline',
        message: 'Your card was declined.',
        type: 'card_error'
      },
      metadata: {
        event_name: 'Test Event 2026',
        ticket_type: 'Weekend Pass',
        quantity: '1',
        buyer_name: 'Test User',
        buyer_email: 'test@example.com'
      },
      created: Math.floor(Date.now() / 1000),
      ...paymentIntentData
    };

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
      type: 'payment_intent.payment_failed'
    };
  }

  /**
   * Send webhook to test server
   */
  async sendWebhook(eventData, signature = null) {
    const payload = JSON.stringify(eventData);
    const webhookSignature = signature || this.generateWebhookSignature(payload);

    const response = await httpClient.webhookRequest(
      '/api/payments/stripe-webhook',
      eventData,
      webhookSignature
    );

    return response;
  }

  /**
   * Simulate successful payment flow
   */
  async simulateSuccessfulPayment(paymentData = {}) {
    console.log('💳 Simulating successful Stripe payment...');
    
    const event = this.createPaymentIntentSucceededEvent(paymentData);
    const response = await this.sendWebhook(event);
    
    console.log('✅ Payment webhook sent');
    return {
      event,
      response,
      paymentIntentId: event.data.object.id
    };
  }

  /**
   * Simulate failed payment flow
   */
  async simulateFailedPayment(paymentData = {}) {
    console.log('💳 Simulating failed Stripe payment...');
    
    const event = this.createPaymentIntentFailedEvent(paymentData);
    const response = await this.sendWebhook(event);
    
    console.log('✅ Payment failure webhook sent');
    return {
      event,
      response,
      paymentIntentId: event.data.object.id
    };
  }

  /**
   * Create checkout session data for testing
   */
  createCheckoutSessionData(sessionData = {}) {
    const defaultSession = {
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

    return { ...defaultSession, ...sessionData };
  }

  /**
   * Test Stripe API connectivity
   */
  async testStripeConnection() {
    if (!this.stripeSecretKey) {
      return { connected: false, error: 'STRIPE_SECRET_KEY not configured' };
    }

    try {
      // Simple API test - get account information
      const response = await fetch('https://api.stripe.com/v1/account', {
        headers: {
          'Authorization': `Bearer ${this.stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          connected: true,
          accountId: data.id,
          testMode: !data.livemode
        };
      } else {
        return {
          connected: false,
          error: `Stripe API error: ${response.status}`
        };
      }
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Validate webhook signature (for testing signature validation)
   */
  validateWebhookSignature(payload, signature, secret = null) {
    try {
      const webhookSecret = secret || this.webhookSecret;
      
      if (!signature.startsWith('t=')) {
        return { valid: false, error: 'Invalid signature format' };
      }

      const [timestamp, ...signatures] = signature.split(',');
      const timestampValue = timestamp.replace('t=', '');
      
      // Check timestamp (should be within 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      const signatureTime = parseInt(timestampValue);
      
      if (Math.abs(now - signatureTime) > 300) { // 5 minutes
        return { valid: false, error: 'Timestamp too old' };
      }

      // Verify signature
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const signaturePayload = `${timestampValue}.${payloadString}`;
      
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signaturePayload, 'utf8')
        .digest('hex');

      const providedSignature = signatures[0]?.replace('v1=', '');
      
      if (expectedSignature === providedSignature) {
        return { valid: true };
      } else {
        return { valid: false, error: 'Signature mismatch' };
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get test card numbers for different scenarios
   */
  getTestCards() {
    return {
      success: '4242424242424242',
      decline: '4000000000000002',
      insufficientFunds: '4000000000009995',
      expired: '4000000000000069',
      processing: '4000000000000119',
      disputed: '4000000000000259'
    };
  }

  /**
   * Create test subscription event (for future use)
   */
  createSubscriptionEvent(eventType = 'customer.subscription.created', subscriptionData = {}) {
    const defaultSubscription = {
      id: `sub_test_${Date.now()}`,
      object: 'subscription',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
      customer: `cus_test_${Date.now()}`,
      plan: {
        id: 'newsletter_premium',
        amount: 999,
        currency: 'usd',
        interval: 'month'
      }
    };

    const subscription = { ...defaultSubscription, ...subscriptionData };

    return {
      id: `evt_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: subscription
      },
      livemode: false,
      pending_webhooks: 1,
      type: eventType
    };
  }
}

// Export singleton instance
export const stripeHelpers = new StripeHelpers();

// Export class for creating additional instances if needed
export { StripeHelpers };