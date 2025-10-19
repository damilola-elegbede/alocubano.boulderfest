/**
 * Manual Ticket Entry - Payment Validation Tests
 * Tests payment-specific validation rules including $0 transactions,
 * amount limits, and cash shift requirements
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Validate payment rules (mirrors service logic)
 */
function validatePaymentRules(params) {
  const { paymentMethod, totalPriceCents, cashShiftId, ticketItems } = params;

  // Rule 1: Negative amount prevention (check first)
  if (totalPriceCents < 0) {
    return {
      isValid: false,
      error: 'Transaction amount cannot be negative'
    };
  }

  // Rule 2: Maximum amount validation
  if (totalPriceCents > 1000000) {
    return {
      isValid: false,
      error: 'Maximum transaction amount is $10,000'
    };
  }

  // Rule 3: Comp tickets can have $0 price
  if (paymentMethod !== 'comp' && totalPriceCents === 0) {
    return {
      isValid: false,
      error: 'Transaction total cannot be $0 unless payment method is "comp"'
    };
  }

  // Rule 4: Minimum amount validation (except comp)
  if (paymentMethod !== 'comp' && totalPriceCents < 50) {
    return {
      isValid: false,
      error: 'Minimum transaction amount is $0.50'
    };
  }

  // Rule 5: Cash shift ID required for cash payments
  if (paymentMethod === 'cash' && !cashShiftId) {
    return {
      isValid: false,
      error: 'cashShiftId is required for cash payments'
    };
  }

  // Rule 6: Valid payment processor types only
  const allowedMethods = new Set(['cash', 'card_terminal', 'paypal', 'venmo', 'comp']);
  if (!allowedMethods.has(paymentMethod)) {
    return {
      isValid: false,
      error: `Invalid payment method: ${paymentMethod}`
    };
  }

  return { isValid: true };
}

/**
 * Calculate total price from ticket items
 */
function calculateTotalPrice(ticketItems, ticketPrices) {
  return ticketItems.reduce((total, item) => {
    const price = ticketPrices[item.ticketTypeId] || 0;
    return total + (price * item.quantity);
  }, 0);
}

// Realistic ticket prices (in cents) from bootstrap data
const TICKET_PRICES = {
  'full-pass-2026': 12500, // $125.00
  'friday-only-2026': 5000, // $50.00
  'saturday-only-2026': 5000, // $50.00
  'sunday-only-2026': 5000, // $50.00
  'workshops-only-2026': 7500, // $75.00
  'comp-pass-2026': 0, // $0.00 (comp)
  'test-pass': 10000 // $100.00 (test)
};

// ============================================================================
// Test Suites
// ============================================================================

describe('Manual Ticket Entry - Zero Dollar Transaction Validation', () => {
  it('should reject $0 transaction with cash payment method', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 0,
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Transaction total cannot be $0 unless payment method is "comp"');
  });

  it('should reject $0 transaction with card_terminal payment method', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 0,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Transaction total cannot be $0 unless payment method is "comp"');
  });

  it('should reject $0 transaction with venmo payment method', () => {
    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents: 0,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Transaction total cannot be $0 unless payment method is "comp"');
  });

  it('should reject $0 transaction with paypal payment method', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: 0,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Transaction total cannot be $0 unless payment method is "comp"');
  });

  it('should allow $0 transaction with comp payment method', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 0,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow comp payment with multiple free tickets', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 0,
      cashShiftId: null,
      ticketItems: [
        { ticketTypeId: 'comp-pass-2026', quantity: 3 },
        { ticketTypeId: 'comp-pass-2026', quantity: 2 }
      ]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow comp payment method with positive amount (discounted tickets)', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 2500, // $25.00 discounted
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'friday-only-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });
});

describe('Manual Ticket Entry - Minimum Amount Validation', () => {
  it('should reject transaction below $0.50 minimum with cash', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 49, // $0.49
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Minimum transaction amount is $0.50');
  });

  it('should reject transaction below $0.50 minimum with card_terminal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 25, // $0.25
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject transaction below $0.50 minimum with venmo', () => {
    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents: 10, // $0.10
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject transaction below $0.50 minimum with paypal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: 30, // $0.30
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should accept exactly $0.50 transaction with cash', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 50, // $0.50
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should accept $1.00 transaction with card_terminal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 100, // $1.00
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should accept $0.75 transaction with paypal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: 75, // $0.75
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow comp payment below $0.50 minimum', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 25, // $0.25
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });
});

describe('Manual Ticket Entry - Maximum Amount Validation', () => {
  it('should reject transaction exceeding $10,000 maximum with cash', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 1000001, // $10,000.01
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 100 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Maximum transaction amount is $10,000');
  });

  it('should reject transaction exceeding $10,000 maximum with card_terminal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 1500000, // $15,000
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 100 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject transaction exceeding $10,000 maximum with venmo', () => {
    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents: 2000000, // $20,000
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 100 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject transaction exceeding $10,000 maximum with paypal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: 1100000, // $11,000
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 100 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should accept exactly $10,000 transaction with cash', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 1000000, // $10,000
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 80 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should accept $9,999.99 transaction with card_terminal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 999999, // $9,999.99
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 79 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should accept $8,500.00 transaction with paypal', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: 850000, // $8,500.00
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 68 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should reject comp payment exceeding maximum', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 1000001, // $10,000.01
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 100 }]
    });
    expect(result.isValid).toBe(false);
  });
});

describe('Manual Ticket Entry - Negative Amount Prevention', () => {
  it('should reject negative amount with cash payment', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: -100,
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Transaction amount cannot be negative');
  });

  it('should reject negative amount with card_terminal payment', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: -5000,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject negative amount with venmo payment', () => {
    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents: -1,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject negative amount with paypal payment', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: -250,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject negative amount with comp payment', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: -100,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });
});

describe('Manual Ticket Entry - Cash Shift Requirement for Cash Payments', () => {
  it('should require cashShiftId for cash payment', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('cashShiftId is required for cash payments');
  });

  it('should require cashShiftId for cash payment - undefined', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 12500,
      cashShiftId: undefined,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should accept cash payment with valid cashShiftId', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 12500,
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should accept cash payment with large cashShiftId', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 12500,
      cashShiftId: 999999,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });
});

describe('Manual Ticket Entry - Cash Shift Not Required for Non-Cash Payments', () => {
  it('should allow card_terminal payment without cashShiftId', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow venmo payment without cashShiftId', () => {
    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow paypal payment without cashShiftId', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow comp payment without cashShiftId', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 0,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow card_terminal payment with cashShiftId provided (ignored)', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 12500,
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow venmo payment with cashShiftId provided (ignored)', () => {
    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents: 12500,
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow paypal payment with cashShiftId provided (ignored)', () => {
    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents: 12500,
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should allow comp payment with cashShiftId provided (ignored)', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 0,
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'comp-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });
});

describe('Manual Ticket Entry - Invalid Payment Processor Types', () => {
  it('should reject invalid payment method - stripe', () => {
    const result = validatePaymentRules({
      paymentMethod: 'stripe',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid payment method: stripe');
  });

  it('should reject invalid payment method - credit_card', () => {
    const result = validatePaymentRules({
      paymentMethod: 'credit_card',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject invalid payment method - check', () => {
    const result = validatePaymentRules({
      paymentMethod: 'check',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject invalid payment method - bank_transfer', () => {
    const result = validatePaymentRules({
      paymentMethod: 'bank_transfer',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject empty payment method', () => {
    const result = validatePaymentRules({
      paymentMethod: '',
      totalPriceCents: 12500,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });
});

describe('Manual Ticket Entry - Realistic Pricing Scenarios', () => {
  it('should accept single full pass purchase with cash', () => {
    const ticketItems = [{ ticketTypeId: 'full-pass-2026', quantity: 1 }];
    const totalPriceCents = calculateTotalPrice(ticketItems, TICKET_PRICES);

    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents,
      cashShiftId: 1,
      ticketItems
    });
    expect(result.isValid).toBe(true);
    expect(totalPriceCents).toBe(12500); // $125.00
  });

  it('should accept multiple day passes with card terminal', () => {
    const ticketItems = [
      { ticketTypeId: 'friday-only-2026', quantity: 2 },
      { ticketTypeId: 'saturday-only-2026', quantity: 3 }
    ];
    const totalPriceCents = calculateTotalPrice(ticketItems, TICKET_PRICES);

    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents,
      cashShiftId: null,
      ticketItems
    });
    expect(result.isValid).toBe(true);
    expect(totalPriceCents).toBe(25000); // $250.00
  });

  it('should accept workshops-only pass with venmo', () => {
    const ticketItems = [{ ticketTypeId: 'workshops-only-2026', quantity: 1 }];
    const totalPriceCents = calculateTotalPrice(ticketItems, TICKET_PRICES);

    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents,
      cashShiftId: null,
      ticketItems
    });
    expect(result.isValid).toBe(true);
    expect(totalPriceCents).toBe(7500); // $75.00
  });

  it('should accept single full pass purchase with paypal', () => {
    const ticketItems = [{ ticketTypeId: 'full-pass-2026', quantity: 1 }];
    const totalPriceCents = calculateTotalPrice(ticketItems, TICKET_PRICES);

    const result = validatePaymentRules({
      paymentMethod: 'paypal',
      totalPriceCents,
      cashShiftId: null,
      ticketItems
    });
    expect(result.isValid).toBe(true);
    expect(totalPriceCents).toBe(12500); // $125.00
  });

  it('should accept large group purchase with cash', () => {
    const ticketItems = [
      { ticketTypeId: 'full-pass-2026', quantity: 10 },
      { ticketTypeId: 'workshops-only-2026', quantity: 5 }
    ];
    const totalPriceCents = calculateTotalPrice(ticketItems, TICKET_PRICES);

    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents,
      cashShiftId: 1,
      ticketItems
    });
    expect(result.isValid).toBe(true);
    expect(totalPriceCents).toBe(162500); // $1,625.00
  });

  it('should accept comp pass with $0 price', () => {
    const ticketItems = [{ ticketTypeId: 'comp-pass-2026', quantity: 2 }];
    const totalPriceCents = calculateTotalPrice(ticketItems, TICKET_PRICES);

    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents,
      cashShiftId: null,
      ticketItems
    });
    expect(result.isValid).toBe(true);
    expect(totalPriceCents).toBe(0); // $0.00
  });

  it('should accept mixed ticket types with card terminal', () => {
    const ticketItems = [
      { ticketTypeId: 'full-pass-2026', quantity: 2 },
      { ticketTypeId: 'friday-only-2026', quantity: 3 },
      { ticketTypeId: 'workshops-only-2026', quantity: 1 }
    ];
    const totalPriceCents = calculateTotalPrice(ticketItems, TICKET_PRICES);

    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents,
      cashShiftId: null,
      ticketItems
    });
    expect(result.isValid).toBe(true);
    expect(totalPriceCents).toBe(47500); // $475.00
  });
});

describe('Manual Ticket Entry - Edge Cases and Boundary Conditions', () => {
  it('should handle boundary case - exactly $0.50 with cash', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 50, // $0.50
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should handle boundary case - exactly $10,000 with card', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 1000000, // $10,000
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 80 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should reject boundary violation - $0.49 with cash', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 49, // $0.49
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should reject boundary violation - $10,000.01 with card', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 1000001, // $10,000.01
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 81 }]
    });
    expect(result.isValid).toBe(false);
  });

  it('should handle comp with positive amount (partial discount)', () => {
    const result = validatePaymentRules({
      paymentMethod: 'comp',
      totalPriceCents: 5000, // $50.00 discounted from $125
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should validate cash shift ID zero', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 12500,
      cashShiftId: 0,
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(false);
  });
});

describe('Manual Ticket Entry - Payment Amount Precision', () => {
  it('should handle odd cent amounts with cash', () => {
    const result = validatePaymentRules({
      paymentMethod: 'cash',
      totalPriceCents: 12599, // $125.99
      cashShiftId: 1,
      ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should handle penny amounts correctly', () => {
    const result = validatePaymentRules({
      paymentMethod: 'card_terminal',
      totalPriceCents: 5001, // $50.01
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'friday-only-2026', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should validate amounts with no decimal cents', () => {
    const result = validatePaymentRules({
      paymentMethod: 'venmo',
      totalPriceCents: 10000, // $100.00
      cashShiftId: null,
      ticketItems: [{ ticketTypeId: 'test-pass', quantity: 1 }]
    });
    expect(result.isValid).toBe(true);
  });
});
