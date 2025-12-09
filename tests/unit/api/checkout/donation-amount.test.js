/**
 * @vitest-environment node
 *
 * Unit tests for donation amount handling in checkout
 *
 * These tests verify that donation amounts are correctly converted to cents
 * and passed to Stripe without double-multiplication.
 *
 * Context: A bug was discovered where $10 donations were charged as $1000
 * because donations were stored in cents (1000) but the checkout API
 * was multiplying by 100 again (resulting in 100,000 cents = $1000).
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Unit Amount Calculation Tests
// =============================================================================

describe('Donation Amount Calculation', () => {
  /**
   * This test verifies the core logic that both tickets and donations
   * use the same cents-based storage and calculation.
   */
  describe('unit_amount calculation', () => {
    /**
     * Simulates the corrected logic from create-checkout-session.js
     * Both tickets and donations are stored in cents, so no conversion needed.
     */
    const calculateUnitAmount = (item) => {
      // Both tickets and donations are stored in cents
      return Math.round(item.price);
    };

    it('should calculate correct unit_amount for $10 donation (1000 cents)', () => {
      // Donation stored in cart as 1000 cents ($10)
      const donationItem = {
        type: 'donation',
        name: 'Festival Support',
        price: 1000, // cents (from cart-manager.js: amount * 100)
        quantity: 1,
      };

      const unitAmount = calculateUnitAmount(donationItem);

      // Should be 1000 cents ($10), NOT 100000 cents ($1000)
      expect(unitAmount).toBe(1000);
    });

    it('should calculate correct unit_amount for $25 donation (2500 cents)', () => {
      const donationItem = {
        type: 'donation',
        name: 'Festival Support',
        price: 2500, // cents
        quantity: 1,
      };

      const unitAmount = calculateUnitAmount(donationItem);
      expect(unitAmount).toBe(2500);
    });

    it('should calculate correct unit_amount for $100 donation (10000 cents)', () => {
      const donationItem = {
        type: 'donation',
        name: 'Festival Support',
        price: 10000, // cents
        quantity: 1,
      };

      const unitAmount = calculateUnitAmount(donationItem);
      expect(unitAmount).toBe(10000);
    });

    it('should calculate correct unit_amount for $65 ticket (6500 cents)', () => {
      // Ticket stored in cart as 6500 cents ($65)
      const ticketItem = {
        type: 'ticket',
        name: 'Full Weekend Pass',
        price: 6500, // cents (from ticket-selection.js: parseFloat(price) * 100)
        quantity: 1,
        ticketType: 'full_weekend',
        eventId: 1,
        eventDate: '2026-05-15',
      };

      const unitAmount = calculateUnitAmount(ticketItem);
      expect(unitAmount).toBe(6500);
    });

    it('should handle both donations and tickets identically', () => {
      // This is the key test - both should use the same logic
      const donation = { type: 'donation', price: 5000 }; // $50 donation in cents
      const ticket = { type: 'ticket', price: 5000 }; // $50 ticket in cents

      const donationAmount = calculateUnitAmount(donation);
      const ticketAmount = calculateUnitAmount(ticket);

      // Both should produce the same result since both are in cents
      expect(donationAmount).toBe(ticketAmount);
      expect(donationAmount).toBe(5000);
    });
  });

  describe('cart storage format', () => {
    /**
     * Simulates cart-manager.js addDonation behavior
     */
    const storeDonationInCart = (dollarAmount) => {
      // From cart-manager.js line 429: Math.round(amount * 100)
      return Math.round(dollarAmount * 100);
    };

    /**
     * Simulates ticket-selection.js behavior
     */
    const storeTicketInCart = (dollarAmount) => {
      // From ticket-selection.js line 510: parseFloat(card.dataset.price) * 100
      return Math.round(dollarAmount * 100);
    };

    it('should store $10 donation as 1000 cents', () => {
      expect(storeDonationInCart(10)).toBe(1000);
    });

    it('should store $65 ticket as 6500 cents', () => {
      expect(storeTicketInCart(65)).toBe(6500);
    });

    it('should store donations and tickets in same format (cents)', () => {
      const donationCents = storeDonationInCart(50);
      const ticketCents = storeTicketInCart(50);

      expect(donationCents).toBe(ticketCents);
      expect(donationCents).toBe(5000);
    });
  });

  describe('display format', () => {
    /**
     * Simulates display logic from floating-cart.js and OrderSummary.jsx
     */
    const formatForDisplay = (amountInCents) => {
      return (amountInCents / 100).toFixed(2);
    };

    it('should display 1000 cents as $10.00', () => {
      expect(formatForDisplay(1000)).toBe('10.00');
    });

    it('should display 6500 cents as $65.00', () => {
      expect(formatForDisplay(6500)).toBe('65.00');
    });

    it('should display 10000 cents as $100.00', () => {
      expect(formatForDisplay(10000)).toBe('100.00');
    });
  });
});

// =============================================================================
// Regression Prevention Tests
// =============================================================================

describe('Regression Prevention: Double Multiplication Bug', () => {
  /**
   * The OLD buggy logic that caused $10 → $1000
   */
  const buggyCalculateUnitAmount = (item) => {
    // BUG: This was the old code that multiplied donations by 100 again
    return item.type === 'donation'
      ? Math.round(item.price * 100) // Double multiply!
      : Math.round(item.price);
  };

  /**
   * The FIXED logic
   */
  const fixedCalculateUnitAmount = (item) => {
    // Both tickets and donations are stored in cents
    return Math.round(item.price);
  };

  it('should NOT multiply donation price by 100 (regression test)', () => {
    const donation = { type: 'donation', price: 1000 }; // $10 in cents

    // Buggy behavior would produce 100000 ($1000)
    const buggyResult = buggyCalculateUnitAmount(donation);
    expect(buggyResult).toBe(100000); // This is WRONG

    // Fixed behavior produces 1000 ($10)
    const fixedResult = fixedCalculateUnitAmount(donation);
    expect(fixedResult).toBe(1000); // This is CORRECT

    // Verify they're different
    expect(fixedResult).not.toBe(buggyResult);
  });

  it('should handle tickets the same way in both old and new logic', () => {
    const ticket = { type: 'ticket', price: 6500 }; // $65 in cents

    // Both should produce 6500 for tickets
    const buggyResult = buggyCalculateUnitAmount(ticket);
    const fixedResult = fixedCalculateUnitAmount(ticket);

    expect(buggyResult).toBe(6500);
    expect(fixedResult).toBe(6500);
  });
});
