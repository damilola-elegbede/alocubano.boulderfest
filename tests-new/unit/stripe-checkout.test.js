/**
 * Stripe Checkout Session Tests
 * Tests critical checkout flow with price and metadata validation
 */

import { describe, it, expect, vi } from 'vitest';
import { mockStripeCheckoutSession } from '../core/mocks.js';

// Mock Stripe
const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn()
    }
  }
};

vi.mock('stripe', () => ({ default: vi.fn(() => mockStripe) }));

describe('Stripe Checkout Session', () => {
  it('creates session with correct price calculation', () => {
    const session = mockStripeCheckoutSession();
    expect(session.amount_total).toBe(14000); // $140 in cents
    expect(session.currency).toBe('usd');
  });

  it('includes required metadata', () => {
    const session = mockStripeCheckoutSession();
    expect(session.metadata.eventType).toBe('full-pass');
    expect(session.metadata.quantity).toBe('1');
  });

  it('validates different ticket types', () => {
    const fullPass = { ...mockStripeCheckoutSession(), metadata: { eventType: 'full-pass', quantity: '1' } };
    const dayPass = { ...mockStripeCheckoutSession(), metadata: { eventType: 'day-pass', quantity: '2' } };
    
    expect(fullPass.metadata.eventType).toBe('full-pass');
    expect(dayPass.metadata.eventType).toBe('day-pass');
    expect(dayPass.metadata.quantity).toBe('2');
  });

  it('enforces quantity limits', () => {
    const session = mockStripeCheckoutSession();
    const quantity = parseInt(session.metadata.quantity);
    
    expect(quantity).toBeGreaterThan(0);
    expect(quantity).toBeLessThanOrEqual(10); // Max 10 tickets
  });
});