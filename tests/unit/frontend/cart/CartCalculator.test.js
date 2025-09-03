/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateCartTotals,
  calculateLineTotal,
  calculateNewQuantity,
  isCartEmpty,
  validateTicketData,
  validateDonationData,
  generateDonationId,
  createDonation,
  applyQuantityConstraints,
  calculateItemCount
} from '../../../../js/lib/pure/cart-calculator.js';

describe('CartCalculator', () => {
  describe('calculateCartTotals', () => {
    it('should calculate totals for empty cart', () => {
      const cartState = { tickets: {}, donations: [] };
      const totals = calculateCartTotals(cartState);

      expect(totals).toEqual({
        tickets: 0,
        donations: 0,
        total: 0,
        itemCount: 0,
        donationCount: 0
      });
    });

    it('should calculate totals with only tickets', () => {
      const cartState = {
        tickets: {
          general: { price: 50, quantity: 2 },
          vip: { price: 100, quantity: 1 }
        },
        donations: []
      };
      const totals = calculateCartTotals(cartState);

      expect(totals).toEqual({
        tickets: 200, // (50*2) + (100*1)
        donations: 0,
        total: 200,
        itemCount: 3, // 2 + 1
        donationCount: 0
      });
    });

    it('should calculate totals with only donations', () => {
      const cartState = {
        tickets: {},
        donations: [
          { amount: 25 },
          { amount: 50 }
        ]
      };
      const totals = calculateCartTotals(cartState);

      expect(totals).toEqual({
        tickets: 0,
        donations: 75, // 25 + 50
        total: 75,
        itemCount: 0,
        donationCount: 2
      });
    });

    it('should calculate totals with tickets and donations', () => {
      const cartState = {
        tickets: {
          general: { price: 50, quantity: 1 }
        },
        donations: [
          { amount: 25 }
        ]
      };
      const totals = calculateCartTotals(cartState);

      expect(totals).toEqual({
        tickets: 50,
        donations: 25,
        total: 75,
        itemCount: 1,
        donationCount: 1
      });
    });

    it('should handle invalid ticket data gracefully', () => {
      const cartState = {
        tickets: {
          valid: { price: 50, quantity: 2 },
          invalidPrice: { price: null, quantity: 1 },
          invalidQuantity: { price: 30, quantity: null },
          missing: null
        },
        donations: []
      };
      const totals = calculateCartTotals(cartState);

      expect(totals).toEqual({
        tickets: 100, // Only valid ticket counted
        donations: 0,
        total: 100,
        itemCount: 2,
        donationCount: 0
      });
    });

    it('should handle invalid donation data gracefully', () => {
      const cartState = {
        tickets: {},
        donations: [
          { amount: 25 }, // Valid
          { amount: null }, // Invalid
          { amount: -10 }, // Invalid
          null, // Invalid
          { amount: 50 } // Valid
        ]
      };
      const totals = calculateCartTotals(cartState);

      expect(totals).toEqual({
        tickets: 0,
        donations: 75, // Only valid donations counted
        total: 75,
        itemCount: 0,
        donationCount: 2
      });
    });

    it('should round totals to 2 decimal places', () => {
      const cartState = {
        tickets: {
          test: { price: 33.333, quantity: 3 }
        },
        donations: [
          { amount: 10.555 }
        ]
      };
      const totals = calculateCartTotals(cartState);

      expect(totals.tickets).toBe(100); // 33.333 * 3 = 99.999, rounded to 100
      expect(totals.donations).toBe(10.56);
      expect(totals.total).toBe(110.55); // 100 + 10.55 = 110.55
    });

    it('should handle missing cart state properties', () => {
      expect(calculateCartTotals({})).toEqual({
        tickets: 0,
        donations: 0,
        total: 0,
        itemCount: 0,
        donationCount: 0
      });

      expect(calculateCartTotals({ tickets: {} })).toEqual({
        tickets: 0,
        donations: 0,
        total: 0,
        itemCount: 0,
        donationCount: 0
      });

      expect(calculateCartTotals({ donations: [] })).toEqual({
        tickets: 0,
        donations: 0,
        total: 0,
        itemCount: 0,
        donationCount: 0
      });
    });
  });

  describe('calculateLineTotal', () => {
    it('should calculate line total correctly', () => {
      expect(calculateLineTotal(50, 2)).toBe(100);
      expect(calculateLineTotal(33.33, 3)).toBe(99.99);
      expect(calculateLineTotal(0, 5)).toBe(0);
    });

    it('should handle invalid inputs', () => {
      expect(calculateLineTotal(null, 2)).toBe(0);
      expect(calculateLineTotal(50, null)).toBe(0);
      expect(calculateLineTotal('50', 2)).toBe(0);
      expect(calculateLineTotal(50, '2')).toBe(0);
      expect(calculateLineTotal(-10, 2)).toBe(0);
      expect(calculateLineTotal(50, -1)).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      expect(calculateLineTotal(33.333, 3)).toBe(100);
      expect(calculateLineTotal(10.555, 1)).toBe(10.56);
    });
  });

  describe('calculateNewQuantity', () => {
    it('should increase quantity correctly', () => {
      expect(calculateNewQuantity(0, 'increase')).toBe(1);
      expect(calculateNewQuantity(5, 'increase')).toBe(6);
      expect(calculateNewQuantity(9, 'increase')).toBe(10);
    });

    it('should decrease quantity correctly', () => {
      expect(calculateNewQuantity(1, 'decrease')).toBe(0);
      expect(calculateNewQuantity(5, 'decrease')).toBe(4);
      expect(calculateNewQuantity(0, 'decrease')).toBe(0); // Can't go below 0
    });

    it('should enforce maximum quantity limit', () => {
      expect(calculateNewQuantity(10, 'increase')).toBe(10); // Max 10
    });

    it('should enforce minimum quantity limit', () => {
      expect(calculateNewQuantity(0, 'decrease')).toBe(0); // Min 0
    });

    it('should handle invalid actions', () => {
      expect(calculateNewQuantity(5, 'invalid')).toBe(5);
      expect(calculateNewQuantity(5, null)).toBe(5);
    });

    it('should handle invalid current quantity', () => {
      expect(calculateNewQuantity(null, 'increase')).toBe(1);
      expect(calculateNewQuantity('5', 'increase')).toBe(1);
      expect(calculateNewQuantity(-1, 'increase')).toBe(0);
    });
  });

  describe('isCartEmpty', () => {
    it('should return true for empty cart', () => {
      expect(isCartEmpty({ tickets: {}, donations: [] })).toBe(true);
    });

    it('should return false when cart has tickets', () => {
      const cartState = {
        tickets: { general: { quantity: 1 } },
        donations: []
      };
      expect(isCartEmpty(cartState)).toBe(false);
    });

    it('should return false when cart has donations', () => {
      const cartState = {
        tickets: {},
        donations: [{ amount: 25 }]
      };
      expect(isCartEmpty(cartState)).toBe(false);
    });

    it('should handle zero quantities correctly', () => {
      const cartState = {
        tickets: { general: { quantity: 0 } },
        donations: []
      };
      expect(isCartEmpty(cartState)).toBe(true);
    });

    it('should handle invalid ticket data', () => {
      const cartState = {
        tickets: { 
          invalid: null,
          zeroQty: { quantity: 0 },
          noQty: { name: 'test' }
        },
        donations: []
      };
      expect(isCartEmpty(cartState)).toBe(true);
    });

    it('should handle invalid donation data', () => {
      const cartState = {
        tickets: {},
        donations: [
          { amount: 0 },
          null,
          { amount: -10 }
        ]
      };
      expect(isCartEmpty(cartState)).toBe(true);
    });
  });

  describe('validateTicketData', () => {
    it('should validate correct ticket data', () => {
      const ticketData = {
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        quantity: 2
      };
      const result = validateTicketData(ticketData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require ticketType', () => {
      const result = validateTicketData({ price: 50, name: 'Test' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Ticket type is required and must be a string');
    });

    it('should require valid price', () => {
      const result = validateTicketData({ ticketType: 'test', price: -10, name: 'Test' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Price must be a positive number');
    });

    it('should require name', () => {
      const result = validateTicketData({ ticketType: 'test', price: 50 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name is required and must be a string');
    });

    it('should validate quantity if provided', () => {
      const result = validateTicketData({ 
        ticketType: 'test', 
        price: 50, 
        name: 'Test',
        quantity: -1 
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Quantity must be a non-negative number');
    });

    it('should handle null/undefined input', () => {
      expect(validateTicketData(null).isValid).toBe(false);
      expect(validateTicketData(undefined).isValid).toBe(false);
    });
  });

  describe('validateDonationData', () => {
    it('should validate correct donation amount', () => {
      const result = validateDonationData(25);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-number amounts', () => {
      const result = validateDonationData('25');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Donation amount must be a number');
    });

    it('should reject zero and negative amounts', () => {
      expect(validateDonationData(0).isValid).toBe(false);
      expect(validateDonationData(-10).isValid).toBe(false);
    });

    it('should reject excessive amounts', () => {
      const result = validateDonationData(10001);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Donation amount cannot exceed $10,000');
    });

    it('should accept maximum valid amount', () => {
      const result = validateDonationData(10000);
      expect(result.isValid).toBe(true);
    });
  });

  describe('generateDonationId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateDonationId();
      const id2 = generateDonationId();
      
      expect(id1).toMatch(/^donation_\d+_\w+$/);
      expect(id2).toMatch(/^donation_\d+_\w+$/);
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateDonationId();
      const after = Date.now();
      
      const timestamp = parseInt(id.split('_')[1]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('createDonation', () => {
    let mockDateLocal;
    
    beforeEach(() => {
      mockDateLocal = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });
    
    afterEach(() => {
      if (mockDateLocal) {
        mockDateLocal.mockRestore();
      }
    });

    it('should create valid donation object', () => {
      const donation = createDonation(25);
      
      expect(donation).toMatchObject({
        amount: 25,
        name: 'Festival Support',
        addedAt: 1234567890
      });
      expect(donation.id).toMatch(/^donation_\d+_\w+$/);
    });

    it('should round amount to 2 decimal places', () => {
      const donation = createDonation(25.555);
      expect(donation.amount).toBe(25.56);
    });

    it('should throw error for invalid amounts', () => {
      expect(() => createDonation(0)).toThrow('Invalid donation');
      expect(() => createDonation(-10)).toThrow('Invalid donation');
      expect(() => createDonation('25')).toThrow('Invalid donation');
    });
  });

  describe('applyQuantityConstraints', () => {
    it('should enforce minimum constraint', () => {
      expect(applyQuantityConstraints(-1)).toBe(0);
      expect(applyQuantityConstraints(-10)).toBe(0);
    });

    it('should enforce maximum constraint', () => {
      expect(applyQuantityConstraints(11)).toBe(10);
      expect(applyQuantityConstraints(100)).toBe(10);
    });

    it('should allow valid quantities', () => {
      expect(applyQuantityConstraints(0)).toBe(0);
      expect(applyQuantityConstraints(5)).toBe(5);
      expect(applyQuantityConstraints(10)).toBe(10);
    });

    it('should handle invalid inputs', () => {
      expect(applyQuantityConstraints(null)).toBe(0);
      expect(applyQuantityConstraints(undefined)).toBe(0);
      expect(applyQuantityConstraints('5')).toBe(0);
      expect(applyQuantityConstraints(NaN)).toBe(0);
    });
  });

  describe('calculateItemCount', () => {
    it('should calculate total item count', () => {
      const cartState = {
        tickets: {
          general: { price: 50, quantity: 2 },
          vip: { price: 100, quantity: 1 }
        },
        donations: [
          { amount: 25 },
          { amount: 50 }
        ]
      };
      
      expect(calculateItemCount(cartState)).toBe(5); // 2 + 1 + 2
    });

    it('should return 0 for empty cart', () => {
      expect(calculateItemCount({ tickets: {}, donations: [] })).toBe(0);
    });

    it('should handle partial cart data', () => {
      expect(calculateItemCount({ tickets: { test: { price: 50, quantity: 2 } } })).toBe(2);
      expect(calculateItemCount({ donations: [{ amount: 25 }] })).toBe(1);
    });
  });
});