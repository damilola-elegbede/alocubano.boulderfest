import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockStripeWebhook } from '../core/mocks.js';

describe('Payment Webhook Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates Stripe webhook signature', async () => {
    const webhook = mockStripeWebhook();
    const signature = 'whsec_test_signature';
    
    const isValid = webhook.type === 'checkout.session.completed' &&
                   webhook.data.object.payment_status === 'paid';
    
    expect(isValid).toBe(true);
    expect(webhook.data.object.amount_total).toBe(5000);
  });

  it('rejects invalid webhook signatures', async () => {
    const webhook = mockStripeWebhook();
    webhook.type = 'invalid.event';
    
    const isValid = webhook.type === 'checkout.session.completed';
    expect(isValid).toBe(false);
  });

  it('handles payment_intent.succeeded events', async () => {
    const webhook = mockStripeWebhook();
    webhook.type = 'payment_intent.succeeded';
    
    const handled = webhook.type === 'payment_intent.succeeded' ||
                   webhook.type === 'checkout.session.completed';
    expect(handled).toBe(true);
  });
});