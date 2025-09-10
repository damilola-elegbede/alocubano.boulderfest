import { describe, it, expect } from 'vitest';
import { PaymentCalculator } from '../../../../lib/domain/payment/PaymentCalculator.js';

describe('PaymentCalculator Domain Service', () => {
  describe('calculateCartTotal()', () => {
    it('calculates total for single item cart', () => {
      const cartItems = [
        { name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket' }
      ];
      
      const result = PaymentCalculator.calculateCartTotal(cartItems);
      
      expect(result.total).toBe(125.00);
      expect(result.subtotal).toBe(125.00);
      expect(result.itemCount).toBe(1);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].itemTotal).toBe(125.00);
    });

    it('calculates total for multiple item cart', () => {
      const cartItems = [
        { name: 'Weekend Pass', price: 125.00, quantity: 2, type: 'ticket' },
        { name: 'Single Day', price: 75.00, quantity: 1, type: 'ticket' },
        { name: 'Donation', price: 25.00, quantity: 1, type: 'donation' }
      ];
      
      const result = PaymentCalculator.calculateCartTotal(cartItems);
      
      expect(result.total).toBe(350.00); // (125*2) + 75 + 25 = 250 + 75 + 25
      expect(result.subtotal).toBe(350.00);
      expect(result.itemCount).toBe(4);
      expect(result.breakdown).toHaveLength(3);
    });

    it('handles empty cart', () => {
      const result = PaymentCalculator.calculateCartTotal([]);
      
      expect(result.total).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.itemCount).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });

    it('handles null/undefined cart items', () => {
      expect(PaymentCalculator.calculateCartTotal(null).total).toBe(0);
      expect(PaymentCalculator.calculateCartTotal(undefined).total).toBe(0);
      expect(PaymentCalculator.calculateCartTotal('invalid').total).toBe(0);
    });

    it('handles cart with decimal precision', () => {
      const cartItems = [
        { name: 'Item 1', price: 12.99, quantity: 3, type: 'ticket' },
        { name: 'Item 2', price: 7.50, quantity: 2, type: 'donation' }
      ];
      
      const result = PaymentCalculator.calculateCartTotal(cartItems);
      
      expect(result.total).toBe(53.97); // (12.99*3) + (7.50*2)
      expect(result.itemCount).toBe(5);
    });

    it('provides detailed breakdown for each item', () => {
      const cartItems = [
        { name: 'Weekend Pass', price: 125.00, quantity: 2, type: 'ticket' },
        { name: 'Donation', price: 50.00, quantity: 1, type: 'donation' }
      ];
      
      const result = PaymentCalculator.calculateCartTotal(cartItems);
      
      expect(result.breakdown[0]).toEqual({
        name: 'Weekend Pass',
        price: 125.00,
        quantity: 2,
        itemTotal: 250.00,
        type: 'ticket'
      });
      expect(result.breakdown[1]).toEqual({
        name: 'Donation',
        price: 50.00,
        quantity: 1,
        itemTotal: 50.00,
        type: 'donation'
      });
    });
  });

  describe('calculateItemTotal()', () => {
    it('calculates item total correctly', () => {
      const item = { name: 'Test Item', price: 25.50, quantity: 3, type: 'ticket' };
      const result = PaymentCalculator.calculateItemTotal(item);
      
      expect(result.total).toBe(76.50);
      expect(result.unitPrice).toBe(25.50);
      expect(result.quantity).toBe(3);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('handles invalid item data', () => {
      const result = PaymentCalculator.calculateItemTotal(null);
      
      expect(result.total).toBe(0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid item data');
    });

    it('rejects negative prices', () => {
      const item = { name: 'Test', price: -10, quantity: 1, type: 'ticket' };
      const result = PaymentCalculator.calculateItemTotal(item);
      
      expect(result.total).toBe(0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Negative price not allowed');
    });

    it('rejects zero or negative quantities', () => {
      const result1 = PaymentCalculator.calculateItemTotal({ price: 10, quantity: 0 });
      const result2 = PaymentCalculator.calculateItemTotal({ price: 10, quantity: -1 });
      
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
    });

    it('handles zero price items', () => {
      const item = { name: 'Free Item', price: 0, quantity: 1, type: 'ticket' };
      const result = PaymentCalculator.calculateItemTotal(item);
      
      expect(result.total).toBe(0);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('determineOrderType()', () => {
    it('identifies ticket-only order', () => {
      const cartItems = [
        { type: 'ticket', name: 'Pass 1', price: 100, quantity: 1 },
        { type: 'ticket', name: 'Pass 2', price: 150, quantity: 1 }
      ];
      
      const result = PaymentCalculator.determineOrderType(cartItems);
      
      expect(result.orderType).toBe('tickets');
      expect(result.hasTickets).toBe(true);
      expect(result.hasDonations).toBe(false);
      expect(result.hasMerchandise).toBe(false);
      expect(result.itemTypes).toEqual(['ticket']);
    });

    it('identifies donation-only order', () => {
      const cartItems = [
        { type: 'donation', name: 'General Fund', price: 25, quantity: 1 },
        { type: 'donation', name: 'Artist Support', price: 50, quantity: 1 }
      ];
      
      const result = PaymentCalculator.determineOrderType(cartItems);
      
      expect(result.orderType).toBe('donation');
      expect(result.hasTickets).toBe(false);
      expect(result.hasDonations).toBe(true);
      expect(result.hasMerchandise).toBe(false);
      expect(result.itemTypes).toEqual(['donation']);
    });

    it('identifies merchandise-only order', () => {
      const cartItems = [
        { type: 'merchandise', name: 'T-Shirt', price: 25, quantity: 2 }
      ];
      
      const result = PaymentCalculator.determineOrderType(cartItems);
      
      expect(result.orderType).toBe('merchandise');
      expect(result.hasTickets).toBe(false);
      expect(result.hasDonations).toBe(false);
      expect(result.hasMerchandise).toBe(true);
      expect(result.itemTypes).toEqual(['merchandise']);
    });

    it('identifies mixed order type', () => {
      const cartItems = [
        { type: 'ticket', name: 'Pass', price: 100, quantity: 1 },
        { type: 'donation', name: 'Fund', price: 25, quantity: 1 },
        { type: 'merchandise', name: 'Shirt', price: 20, quantity: 1 }
      ];
      
      const result = PaymentCalculator.determineOrderType(cartItems);
      
      expect(result.orderType).toBe('mixed');
      expect(result.hasTickets).toBe(true);
      expect(result.hasDonations).toBe(true);
      expect(result.hasMerchandise).toBe(true);
      expect(result.itemTypes).toEqual(['ticket', 'donation', 'merchandise']);
    });

    it('handles empty cart', () => {
      const result = PaymentCalculator.determineOrderType([]);
      
      expect(result.orderType).toBe('empty');
      expect(result.hasTickets).toBe(false);
      expect(result.hasDonations).toBe(false);
      expect(result.hasMerchandise).toBe(false);
      expect(result.itemTypes).toEqual([]);
    });
  });

  describe('calculateTax()', () => {
    it('applies Colorado tax rate (currently 0%)', () => {
      const result = PaymentCalculator.calculateTax(100, 'CO');
      
      expect(result.taxAmount).toBe(0);
      expect(result.taxRate).toBe(0.0);
      expect(result.taxZone).toBe('CO');
      expect(result.taxableAmount).toBe(100);
    });

    it('applies default tax rate for unknown zones', () => {
      const result = PaymentCalculator.calculateTax(100, 'UNKNOWN');
      
      expect(result.taxAmount).toBe(0);
      expect(result.taxRate).toBe(0.0);
      expect(result.taxZone).toBe('UNKNOWN');
    });

    it('handles zero subtotal', () => {
      const result = PaymentCalculator.calculateTax(0, 'CO');
      
      expect(result.taxAmount).toBe(0);
      expect(result.taxableAmount).toBe(0);
    });
  });

  describe('calculateProcessingFees()', () => {
    it('calculates card processing fees (currently 0%)', () => {
      const result = PaymentCalculator.calculateProcessingFees(100, 'card');
      
      expect(result.feeAmount).toBe(0);
      expect(result.feeRate).toBe(0.0);
      expect(result.paymentMethod).toBe('card');
      expect(result.description).toBe('Processing fee');
    });

    it('handles Stripe Link payment method', () => {
      const result = PaymentCalculator.calculateProcessingFees(100, 'link');
      
      expect(result.feeAmount).toBe(0);
      expect(result.feeRate).toBe(0.0);
      expect(result.paymentMethod).toBe('link');
    });

    it('falls back to card rate for unknown payment methods', () => {
      const result = PaymentCalculator.calculateProcessingFees(100, 'unknown');
      
      expect(result.feeAmount).toBe(0);
      expect(result.feeRate).toBe(0.0);
      expect(result.paymentMethod).toBe('unknown');
    });
  });

  describe('applyDiscount()', () => {
    it('applies percentage discount', () => {
      const discount = {
        active: true,
        type: 'percentage',
        value: 10,
        code: 'SAVE10'
      };
      
      const result = PaymentCalculator.applyDiscount(100, discount);
      
      expect(result.discountAmount).toBe(10);
      expect(result.discountPercent).toBe(10);
      expect(result.discountCode).toBe('SAVE10');
      expect(result.finalAmount).toBe(90);
    });

    it('applies fixed dollar discount', () => {
      const discount = {
        active: true,
        type: 'fixed',
        value: 25,
        code: 'SAVE25'
      };
      
      const result = PaymentCalculator.applyDiscount(100, discount);
      
      expect(result.discountAmount).toBe(25);
      expect(result.discountPercent).toBe(25);
      expect(result.finalAmount).toBe(75);
    });

    it('caps fixed discount at subtotal amount', () => {
      const discount = {
        active: true,
        type: 'fixed',
        value: 150,
        code: 'BIG_SAVE'
      };
      
      const result = PaymentCalculator.applyDiscount(100, discount);
      
      expect(result.discountAmount).toBe(100);
      expect(result.finalAmount).toBe(0);
    });

    it('enforces minimum order requirements', () => {
      const discount = {
        active: true,
        type: 'percentage',
        value: 15,
        code: 'MIN_ORDER',
        minimumOrder: 50
      };
      
      const result = PaymentCalculator.applyDiscount(25, discount);
      
      expect(result.discountAmount).toBe(0);
      expect(result.finalAmount).toBe(25);
      expect(result.error).toBe('Minimum order of $50 required');
    });

    it('handles inactive discount', () => {
      const discount = {
        active: false,
        type: 'percentage',
        value: 10,
        code: 'INACTIVE'
      };
      
      const result = PaymentCalculator.applyDiscount(100, discount);
      
      expect(result.discountAmount).toBe(0);
      expect(result.finalAmount).toBe(100);
      expect(result.discountCode).toBeNull();
    });

    it('handles missing discount', () => {
      const result = PaymentCalculator.applyDiscount(100, null);
      
      expect(result.discountAmount).toBe(0);
      expect(result.finalAmount).toBe(100);
      expect(result.discountCode).toBeNull();
    });
  });

  describe('convertToStripeCents()', () => {
    it('converts dollars to cents correctly', () => {
      expect(PaymentCalculator.convertToStripeCents(125.00)).toBe(12500);
      expect(PaymentCalculator.convertToStripeCents(12.50)).toBe(1250);
      expect(PaymentCalculator.convertToStripeCents(0.99)).toBe(99);
      expect(PaymentCalculator.convertToStripeCents(0.01)).toBe(1);
    });

    it('rounds fractional cents', () => {
      expect(PaymentCalculator.convertToStripeCents(12.499)).toBe(1250);
      expect(PaymentCalculator.convertToStripeCents(12.501)).toBe(1250);
    });

    it('handles invalid inputs', () => {
      expect(PaymentCalculator.convertToStripeCents(null)).toBe(0);
      expect(PaymentCalculator.convertToStripeCents(undefined)).toBe(0);
      expect(PaymentCalculator.convertToStripeCents('invalid')).toBe(0);
      expect(PaymentCalculator.convertToStripeCents(NaN)).toBe(0);
      expect(PaymentCalculator.convertToStripeCents(-10)).toBe(0);
    });

    it('handles zero amount', () => {
      expect(PaymentCalculator.convertToStripeCents(0)).toBe(0);
    });
  });

  describe('convertFromStripeCents()', () => {
    it('converts cents to dollars correctly', () => {
      expect(PaymentCalculator.convertFromStripeCents(12500)).toBe(125.00);
      expect(PaymentCalculator.convertFromStripeCents(1250)).toBe(12.50);
      expect(PaymentCalculator.convertFromStripeCents(99)).toBe(0.99);
      expect(PaymentCalculator.convertFromStripeCents(1)).toBe(0.01);
    });

    it('handles invalid inputs', () => {
      expect(PaymentCalculator.convertFromStripeCents(null)).toBe(0);
      expect(PaymentCalculator.convertFromStripeCents(undefined)).toBe(0);
      expect(PaymentCalculator.convertFromStripeCents('invalid')).toBe(0);
      expect(PaymentCalculator.convertFromStripeCents(NaN)).toBe(0);
      expect(PaymentCalculator.convertFromStripeCents(-10)).toBe(0);
    });

    it('handles zero amount', () => {
      expect(PaymentCalculator.convertFromStripeCents(0)).toBe(0);
    });
  });

  describe('validateCartForCheckout()', () => {
    it('validates valid cart successfully', () => {
      const cartItems = [
        { name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket' },
        { name: 'Donation', price: 25.00, quantity: 1, type: 'donation' }
      ];
      
      const result = PaymentCalculator.validateCartForCheckout(cartItems);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.calculation.total).toBe(150.00);
    });

    it('rejects empty cart', () => {
      const result = PaymentCalculator.validateCartForCheckout([]);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart cannot be empty');
    });

    it('rejects non-array cart items', () => {
      const result = PaymentCalculator.validateCartForCheckout('invalid');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart items must be an array');
    });

    it('validates individual item errors', () => {
      const cartItems = [
        { name: '', price: 125.00, quantity: 1, type: 'ticket' },
        { name: 'Valid Item', price: -10, quantity: 1, type: 'ticket' }
      ];
      
      const result = PaymentCalculator.validateCartForCheckout(cartItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Item 1: Name is required');
      expect(result.errors).toContain('Item 2: Negative price not allowed');
    });

    it('rejects invalid item types', () => {
      const cartItems = [
        { name: 'Test', price: 10, quantity: 1, type: 'invalid' }
      ];
      
      const result = PaymentCalculator.validateCartForCheckout(cartItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Item 1: Invalid item type');
    });

    it('rejects cart with zero total', () => {
      const cartItems = [
        { name: 'Free Item', price: 0, quantity: 1, type: 'ticket' }
      ];
      
      const result = PaymentCalculator.validateCartForCheckout(cartItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart total must be greater than zero');
    });
  });
});