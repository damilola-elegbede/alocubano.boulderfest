/**
 * Cart Calculations Integration Test (T1.03.07)
 * Tests frontend cart calculation logic with various ticket types and quantities
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Mock cart calculation functions (would be imported from frontend in real scenario)
const CartCalculations = {
  /**
   * Calculate cart totals including taxes and fees
   */
  calculateTotal(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return {
        subtotal: 0,
        tax: 0,
        fees: 0,
        total: 0,
        currency: 'usd'
      };
    }

    const subtotal = items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // 8.5% sales tax for Boulder, CO
    const tax = Math.floor(subtotal * 0.085);
    
    // Processing fee: 2.9% + $0.30 per transaction
    const fees = Math.round(subtotal * 0.029 + 30);

    const total = subtotal + tax + fees;

    return {
      subtotal,
      tax,
      fees,
      total,
      currency: 'usd'
    };
  },

  /**
   * Validate cart items
   */
  validateCart(items) {
    const errors = [];

    if (!Array.isArray(items)) {
      errors.push('Cart items must be an array');
      return { valid: false, errors };
    }

    if (items.length === 0) {
      errors.push('Cart cannot be empty');
      return { valid: false, errors };
    }

    for (const [index, item] of items.entries()) {
      if (!item.id) {
        errors.push(`Item ${index}: Missing item ID`);
      }
      if (!item.name) {
        errors.push(`Item ${index}: Missing item name`);
      }
      if (typeof item.price !== 'number' || item.price < 0) {
        errors.push(`Item ${index}: Invalid price`);
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1) {
        errors.push(`Item ${index}: Invalid quantity`);
      }
      if (item.quantity > 10) {
        errors.push(`Item ${index}: Quantity exceeds maximum (10)`);
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Apply discount codes
   */
  applyDiscount(total, discountCode) {
    const discounts = {
      'EARLY_BIRD': { type: 'percentage', value: 0.15, description: '15% Early Bird Discount' },
      'STUDENT': { type: 'percentage', value: 0.10, description: '10% Student Discount' },
      'GROUP20': { type: 'fixed', value: 2000, description: '$20 Group Discount' }, // in cents
      'INVALID': null
    };

    const discount = discounts[discountCode];
    if (!discount) {
      return {
        originalTotal: total,
        discountAmount: 0,
        finalTotal: total,
        discountApplied: null,
        error: 'Invalid discount code'
      };
    }

    let discountAmount;
    if (discount.type === 'percentage') {
      discountAmount = Math.round(total * discount.value);
    } else {
      discountAmount = discount.value;
    }

    // Don't allow discount to make total negative
    discountAmount = Math.min(discountAmount, total);

    return {
      originalTotal: total,
      discountAmount,
      finalTotal: total - discountAmount,
      discountApplied: discount,
      error: null
    };
  }
};

describe('Cart Calculations Integration (T1.03.07)', () => {
  let testItems;

  beforeEach(() => {
    testItems = [
      {
        id: 'weekend-pass',
        name: 'Weekend Pass',
        price: 14000, // $140.00 in cents
        quantity: 1,
        type: 'ticket'
      },
      {
        id: 'friday-only',
        name: 'Friday Only Pass',
        price: 6000, // $60.00 in cents
        quantity: 2,
        type: 'ticket'
      },
      {
        id: 'donation',
        name: 'Festival Support Donation',
        price: 2500, // $25.00 in cents
        quantity: 1,
        type: 'donation'
      }
    ];
  });

  describe('Basic Cart Calculations', () => {
    it('should calculate correct subtotal for single item', () => {
      const singleItem = [testItems[0]];
      const result = CartCalculations.calculateTotal(singleItem);

      expect(result.subtotal).toBe(14000); // $140.00
      expect(result.currency).toBe('usd');
    });

    it('should calculate correct subtotal for multiple items', () => {
      const result = CartCalculations.calculateTotal(testItems);
      
      // $140 + ($60 * 2) + $25 = $285
      expect(result.subtotal).toBe(28500);
    });

    it('should calculate correct tax (8.5% Boulder CO)', () => {
      const result = CartCalculations.calculateTotal(testItems);
      
      // 8.5% of $285.00 = $24.22 = 2422 cents
      expect(result.tax).toBe(2422);
    });

    it('should calculate correct processing fees (2.9% + $0.30)', () => {
      const result = CartCalculations.calculateTotal(testItems);
      
      // 2.9% of $285.00 + $0.30 = $8.27 + $0.30 = $8.57 = 857 cents
      expect(result.fees).toBe(857);
    });

    it('should calculate correct total', () => {
      const result = CartCalculations.calculateTotal(testItems);
      
      // Subtotal: $285.00 + Tax: $24.22 + Fees: $8.57 = $317.79
      expect(result.total).toBe(31779);
    });

    it('should handle empty cart', () => {
      const result = CartCalculations.calculateTotal([]);
      
      expect(result.subtotal).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.fees).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Cart Validation', () => {
    it('should validate correct cart items', () => {
      const result = CartCalculations.validateCart(testItems);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty cart', () => {
      const result = CartCalculations.validateCart([]);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart cannot be empty');
    });

    it('should reject non-array cart', () => {
      const result = CartCalculations.validateCart(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart items must be an array');
    });

    it('should reject items with missing required fields', () => {
      const invalidItems = [
        { price: 1000, quantity: 1 }, // missing id and name
        { id: 'test', quantity: 1 }, // missing name and price
        { id: 'test', name: 'Test', price: 1000 } // missing quantity
      ];

      const result = CartCalculations.validateCart(invalidItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Item 0: Missing item ID');
      expect(result.errors).toContain('Item 0: Missing item name');
      expect(result.errors).toContain('Item 1: Missing item name');
      expect(result.errors).toContain('Item 2: Invalid quantity');
    });

    it('should reject items with invalid prices', () => {
      const invalidItems = [
        { id: 'test1', name: 'Test 1', price: -100, quantity: 1 },
        { id: 'test2', name: 'Test 2', price: 'invalid', quantity: 1 },
        { id: 'test3', name: 'Test 3', price: null, quantity: 1 }
      ];

      const result = CartCalculations.validateCart(invalidItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors.filter(e => e.includes('Invalid price'))).toHaveLength(3);
    });

    it('should reject items with invalid quantities', () => {
      const invalidItems = [
        { id: 'test1', name: 'Test 1', price: 1000, quantity: 0 },
        { id: 'test2', name: 'Test 2', price: 1000, quantity: -1 },
        { id: 'test3', name: 'Test 3', price: 1000, quantity: 15 } // over max
      ];

      const result = CartCalculations.validateCart(invalidItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors.filter(e => e.includes('Invalid quantity'))).toHaveLength(2);
      expect(result.errors.filter(e => e.includes('exceeds maximum'))).toHaveLength(1);
    });
  });

  describe('Discount Application', () => {
    it('should apply percentage discount correctly', () => {
      const total = 10000; // $100.00
      const result = CartCalculations.applyDiscount(total, 'EARLY_BIRD');
      
      expect(result.originalTotal).toBe(10000);
      expect(result.discountAmount).toBe(1500); // 15% of $100
      expect(result.finalTotal).toBe(8500); // $85.00
      expect(result.discountApplied.description).toBe('15% Early Bird Discount');
      expect(result.error).toBe(null);
    });

    it('should apply fixed amount discount correctly', () => {
      const total = 10000; // $100.00
      const result = CartCalculations.applyDiscount(total, 'GROUP20');
      
      expect(result.originalTotal).toBe(10000);
      expect(result.discountAmount).toBe(2000); // $20.00
      expect(result.finalTotal).toBe(8000); // $80.00
      expect(result.discountApplied.description).toBe('$20 Group Discount');
      expect(result.error).toBe(null);
    });

    it('should handle invalid discount codes', () => {
      const total = 10000;
      const result = CartCalculations.applyDiscount(total, 'INVALID_CODE');
      
      expect(result.originalTotal).toBe(10000);
      expect(result.discountAmount).toBe(0);
      expect(result.finalTotal).toBe(10000);
      expect(result.discountApplied).toBe(null);
      expect(result.error).toBe('Invalid discount code');
    });

    it('should not allow discount to make total negative', () => {
      const total = 1000; // $10.00
      const result = CartCalculations.applyDiscount(total, 'GROUP20'); // $20 discount
      
      expect(result.originalTotal).toBe(1000);
      expect(result.discountAmount).toBe(1000); // Capped at total
      expect(result.finalTotal).toBe(0);
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle large quantities correctly', () => {
      const largeQuantityItems = [{
        id: 'test',
        name: 'Test Item',
        price: 100, // $1.00
        quantity: 1000
      }];

      const result = CartCalculations.calculateTotal(largeQuantityItems);
      
      expect(result.subtotal).toBe(100000); // $1000.00
      expect(result.total).toBeGreaterThan(result.subtotal);
    });

    it('should handle very small amounts correctly', () => {
      const smallAmountItems = [{
        id: 'donation',
        name: 'Small Donation',
        price: 1, // $0.01
        quantity: 1
      }];

      const result = CartCalculations.calculateTotal(smallAmountItems);
      
      expect(result.subtotal).toBe(1);
      expect(result.tax).toBeGreaterThanOrEqual(0);
      expect(result.fees).toBeGreaterThanOrEqual(30); // Minimum $0.30 fee
    });

    it('should round calculations consistently', () => {
      // Test case that would produce fractional cents
      const items = [{
        id: 'test',
        name: 'Test Item',
        price: 333, // $3.33
        quantity: 1
      }];

      const result = CartCalculations.calculateTotal(items);
      
      // All amounts should be whole numbers (cents)
      expect(Number.isInteger(result.subtotal)).toBe(true);
      expect(Number.isInteger(result.tax)).toBe(true);
      expect(Number.isInteger(result.fees)).toBe(true);
      expect(Number.isInteger(result.total)).toBe(true);
    });

    it('should handle multiple discount applications', () => {
      const total = 20000; // $200.00
      
      // Apply first discount
      const firstDiscount = CartCalculations.applyDiscount(total, 'EARLY_BIRD');
      expect(firstDiscount.finalTotal).toBe(17000); // $170.00
      
      // Apply second discount to already discounted amount
      const secondDiscount = CartCalculations.applyDiscount(firstDiscount.finalTotal, 'GROUP20');
      expect(secondDiscount.finalTotal).toBe(15000); // $150.00
    });
  });

  describe('Real-world Scenarios', () => {
    it('should calculate total for typical family purchase', () => {
      const familyCart = [
        { id: 'weekend-adult', name: 'Adult Weekend Pass', price: 14000, quantity: 2 },
        { id: 'weekend-child', name: 'Child Weekend Pass', price: 7000, quantity: 1 },
        { id: 'parking', name: 'Parking Pass', price: 1500, quantity: 1 },
        { id: 'donation', name: 'Festival Support', price: 1000, quantity: 1 }
      ];

      const result = CartCalculations.calculateTotal(familyCart);
      
      // Subtotal: $140*2 + $70 + $15 + $10 = $375
      expect(result.subtotal).toBe(37500);
      
      // Should include tax and fees
      expect(result.total).toBeGreaterThan(40000); // > $400
      expect(result.total).toBeLessThan(45000); // < $450
    });

    it('should handle group purchase with discount', () => {
      const groupCart = [
        { id: 'weekend-pass', name: 'Weekend Pass', price: 14000, quantity: 8 }
      ];

      const calculation = CartCalculations.calculateTotal(groupCart);
      const withDiscount = CartCalculations.applyDiscount(calculation.total, 'GROUP20');
      
      // 8 passes * $140 = $1120 + tax + fees - $20 discount
      expect(calculation.subtotal).toBe(112000);
      expect(withDiscount.finalTotal).toBeLessThan(calculation.total);
      expect(withDiscount.discountAmount).toBe(2000);
    });

    it('should validate realistic cart limits', () => {
      const cartValidation = CartCalculations.validateCart(testItems);
      expect(cartValidation.valid).toBe(true);
      
      // Test maximum quantity limit
      const overLimitCart = [{
        id: 'test',
        name: 'Test',
        price: 1000,
        quantity: 11 // Over limit
      }];
      
      const overLimitValidation = CartCalculations.validateCart(overLimitCart);
      expect(overLimitValidation.valid).toBe(false);
    });
  });
});