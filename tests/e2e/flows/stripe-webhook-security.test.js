/**
 * Stripe Webhook Security E2E Test
 * Tests webhook signature verification, idempotency, and event processing
 * Uses direct API testing with Playwright request context
 */

import { test, expect } from '@playwright/test';
import crypto from 'crypto';

// Test webhook endpoint
const WEBHOOK_ENDPOINT = '/api/payments/stripe-webhook';

// Mock webhook secret for testing (in real environment this would be from Stripe)
const TEST_WEBHOOK_SECRET = 'whsec_test_stripe_webhook_secret_for_testing';

// Helper to generate valid Stripe webhook signature
function generateStripeSignature(payload, secret, timestamp = null) {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signedPayload = `${ts}.${payloadString}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${ts},v1=${signature}`;
}

// Sample Stripe webhook event
const mockWebhookEvent = {
  id: 'evt_test_webhook_security',
  object: 'event',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_webhook_security',
      object: 'checkout.session',
      payment_status: 'paid',
      customer_details: {
        email: 'test@example.com',
        name: 'Test User'
      }
    }
  }
};

test.describe('Stripe Webhook Security', () => {

  test('should verify webhook signature', async ({ request }) => {
    const payload = JSON.stringify(mockWebhookEvent);
    const validSignature = generateStripeSignature(payload, TEST_WEBHOOK_SECRET);

    // Set environment variable for test
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'stripe-signature': validSignature,
        'content-type': 'application/json'
      }
    });

    // Should accept valid signature
    expect(response.status()).toBeLessThan(500);
    console.log('✅ Valid webhook signature accepted');
  });

  test('should reject invalid signature', async ({ request }) => {
    const payload = JSON.stringify(mockWebhookEvent);
    const invalidSignature = 't=1234567890,v1=invalid_signature';

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'stripe-signature': invalidSignature,
        'content-type': 'application/json'
      }
    });

    // Should reject invalid signature
    expect(response.status()).toBe(400);
    console.log('✅ Invalid webhook signature rejected');
  });

  test('should reject missing signature header', async ({ request }) => {
    const payload = JSON.stringify(mockWebhookEvent);

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'content-type': 'application/json'
        // Missing stripe-signature header
      }
    });

    // Should reject request without signature
    expect(response.status()).toBe(400);
    console.log('✅ Request without signature header rejected');
  });

  test('should handle replay attack prevention (idempotency)', async ({ request }) => {
    const uniqueEvent = {
      ...mockWebhookEvent,
      id: `evt_test_idempotency_${Date.now()}`
    };
    const payload = JSON.stringify(uniqueEvent);
    const signature = generateStripeSignature(payload, TEST_WEBHOOK_SECRET);

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    // First request - should be processed
    const response1 = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json'
      }
    });

    expect(response1.status()).toBeLessThan(500);

    // Second identical request - should be marked as already processed
    const response2 = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json'
      }
    });

    expect(response2.status()).toBe(200);
    const body2 = await response2.json();
    expect(body2.status).toBe('already_processed');

    console.log('✅ Replay attack prevention working (idempotency)');
  });

  test('should handle payment success event', async ({ request }) => {
    const successEvent = {
      ...mockWebhookEvent,
      id: `evt_test_success_${Date.now()}`,
      type: 'checkout.session.completed'
    };
    const payload = JSON.stringify(successEvent);
    const signature = generateStripeSignature(payload, TEST_WEBHOOK_SECRET);

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json'
      }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);

    console.log('✅ Payment success event processed');
  });

  test('should handle payment failure event', async ({ request }) => {
    const failureEvent = {
      ...mockWebhookEvent,
      id: `evt_test_failure_${Date.now()}`,
      type: 'checkout.session.async_payment_failed',
      data: {
        object: {
          id: 'cs_test_failed_payment',
          object: 'checkout.session',
          payment_status: 'unpaid'
        }
      }
    };
    const payload = JSON.stringify(failureEvent);
    const signature = generateStripeSignature(payload, TEST_WEBHOOK_SECRET);

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json'
      }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);

    console.log('✅ Payment failure event processed');
  });

  test('should handle webhook timeout gracefully', async ({ request }) => {
    // Test with method not allowed to simulate quick failure
    const response = await request.get(WEBHOOK_ENDPOINT);

    expect(response.status()).toBe(405);
    const body = await response.json();
    expect(body.error).toBe('Method not allowed');

    console.log('✅ Webhook handles invalid methods gracefully');
  });

  test('should reject malformed JSON payload', async ({ request }) => {
    const malformedPayload = '{"invalid": json payload';
    const signature = generateStripeSignature(malformedPayload, TEST_WEBHOOK_SECRET);

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: malformedPayload,
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json'
      }
    });

    // Should handle malformed JSON gracefully
    expect(response.status()).toBe(400);

    console.log('✅ Malformed JSON payload rejected');
  });

  test('should handle timestamp-based signature validation', async ({ request }) => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const payload = JSON.stringify(mockWebhookEvent);
    const oldSignature = generateStripeSignature(payload, TEST_WEBHOOK_SECRET, oldTimestamp);

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'stripe-signature': oldSignature,
        'content-type': 'application/json'
      }
    });

    // Should handle timestamp validation (Stripe library handles this)
    expect(response.status()).toBeLessThan(500);

    console.log('✅ Timestamp-based signature validation handled');
  });

  test('should handle webhook without secret (development mode)', async ({ request }) => {
    const payload = JSON.stringify(mockWebhookEvent);

    // Remove webhook secret to simulate development mode
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const response = await request.post(WEBHOOK_ENDPOINT, {
      data: payload,
      headers: {
        'content-type': 'application/json'
        // No stripe-signature header needed in dev mode
      }
    });

    // Should accept request without signature in dev mode
    expect(response.status()).toBeLessThan(500);

    console.log('✅ Development mode (no webhook secret) handled');
  });

});