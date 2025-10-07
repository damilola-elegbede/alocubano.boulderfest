/**
 * Manual Ticket Entry - Cash Shift Validation Integration Tests
 * Tests cash shift validation including open/closed status,
 * race conditions, and balance updates
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { getDatabaseClient } from '../../../lib/database.js';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_TIMEOUT = 30000;
const TEST_USER_ID = 'test-admin-001';

let db;
let testCashShiftIds = [];

// ============================================================================
// Test Lifecycle
// ============================================================================

beforeAll(async () => {
  db = await getDatabaseClient();
  console.log('🔧 Cash Shift Validation tests initialized');
}, TEST_TIMEOUT);

afterAll(async () => {
  // Cleanup test cash shifts
  for (const shiftId of testCashShiftIds) {
    try {
      await db.execute({
        sql: 'DELETE FROM cash_shifts WHERE id = ?',
        args: [shiftId]
      });
    } catch (error) {
      console.error(`Failed to cleanup cash shift ${shiftId}:`, error);
    }
  }

  console.log('✅ Cash Shift Validation tests completed');
}, TEST_TIMEOUT);

afterEach(async () => {
  // Clean up any test transactions
  try {
    await db.execute({
      sql: `DELETE FROM transactions WHERE customer_email LIKE 'cash-shift-test-%@example.com'`
    });
  } catch (error) {
    console.error('Failed to cleanup test transactions:', error);
  }
});

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create test cash shift
 */
async function createTestCashShift(status = 'open', overrides = {}) {
  const shiftData = {
    user_id: TEST_USER_ID,
    opening_cash_cents: 10000, // $100.00
    status,
    opened_at: new Date().toISOString(),
    ...overrides
  };

  const result = await db.execute({
    sql: `INSERT INTO cash_shifts (
      user_id, opening_cash_cents, status, opened_at,
      cash_sales_count, cash_sales_total_cents, expected_cash_cents,
      created_at
    ) VALUES (?, ?, ?, ?, 0, 0, ?, CURRENT_TIMESTAMP)`,
    args: [
      shiftData.user_id,
      shiftData.opening_cash_cents,
      shiftData.status,
      shiftData.opened_at,
      shiftData.opening_cash_cents
    ]
  });

  const shiftId = Number(result.lastInsertRowid);
  testCashShiftIds.push(shiftId);

  return shiftId;
}

/**
 * Get cash shift by ID
 */
async function getCashShift(shiftId) {
  const result = await db.execute({
    sql: 'SELECT * FROM cash_shifts WHERE id = ?',
    args: [shiftId]
  });

  return result.rows && result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Close cash shift
 */
async function closeCashShift(shiftId, closingCashCents = 10000) {
  await db.execute({
    sql: `UPDATE cash_shifts
          SET status = 'closed',
              closing_cash_cents = ?,
              closed_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [closingCashCents, shiftId]
  });
}

/**
 * Validate cash shift requirement
 */
async function validateCashShiftForPayment(cashShiftId, paymentMethod) {
  // Rule 1: Cash payment requires cashShiftId
  if (paymentMethod === 'cash' && !cashShiftId) {
    return {
      isValid: false,
      error: 'cashShiftId is required for cash payments',
      errorCode: 'CASH_SHIFT_REQUIRED'
    };
  }

  // Rule 2: Non-cash payments don't require validation
  if (paymentMethod !== 'cash') {
    return { isValid: true };
  }

  // Rule 3: Validate cash shift exists and is open
  const shift = await getCashShift(cashShiftId);

  if (!shift) {
    return {
      isValid: false,
      error: 'Invalid or closed cash shift',
      errorCode: 'INVALID_CASH_SHIFT'
    };
  }

  if (shift.status !== 'open') {
    return {
      isValid: false,
      error: 'Cash shift must be open to accept payments',
      errorCode: 'CASH_SHIFT_CLOSED'
    };
  }

  return { isValid: true, shift };
}

/**
 * Update cash shift balance
 */
async function updateCashShiftBalance(shiftId, ticketCount, amountCents) {
  await db.execute({
    sql: `UPDATE cash_shifts
          SET cash_sales_count = cash_sales_count + ?,
              cash_sales_total_cents = cash_sales_total_cents + ?,
              expected_cash_cents = opening_cash_cents + cash_sales_total_cents + ?
          WHERE id = ? AND status = 'open'`,
    args: [ticketCount, amountCents, amountCents, shiftId]
  });
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Cash Shift Validation - Invalid Cash Shift ID', () => {
  it('should reject non-existent cash shift ID', async () => {
    const nonExistentId = 999999;

    const result = await validateCashShiftForPayment(nonExistentId, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid or closed cash shift');
    expect(result.errorCode).toBe('INVALID_CASH_SHIFT');
  }, TEST_TIMEOUT);

  it('should reject negative cash shift ID', async () => {
    const result = await validateCashShiftForPayment(-1, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_CASH_SHIFT');
  }, TEST_TIMEOUT);

  it('should reject zero cash shift ID', async () => {
    const result = await validateCashShiftForPayment(0, 'cash');

    expect(result.isValid).toBe(false);
  }, TEST_TIMEOUT);

  it('should handle very large cash shift ID gracefully', async () => {
    const largeId = Number.MAX_SAFE_INTEGER;

    const result = await validateCashShiftForPayment(largeId, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid or closed cash shift');
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Closed Cash Shift', () => {
  it('should reject payment to closed cash shift', async () => {
    const shiftId = await createTestCashShift('closed');

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/closed|open/i);
    expect(result.errorCode).toBe('INVALID_CASH_SHIFT');
  }, TEST_TIMEOUT);

  it('should reject payment to shift that was just closed', async () => {
    const shiftId = await createTestCashShift('open');

    // Close the shift
    await closeCashShift(shiftId, 15000);

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/closed|open/i);
  }, TEST_TIMEOUT);

  it('should provide clear error message for closed shift', async () => {
    const shiftId = await createTestCashShift('closed');

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.error).toContain('closed');
    expect(result.error).toContain('open');
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Open Cash Shift', () => {
  it('should accept payment to open cash shift', async () => {
    const shiftId = await createTestCashShift('open');

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(true);
    expect(result.shift).toBeDefined();
    expect(result.shift.status).toBe('open');
  }, TEST_TIMEOUT);

  it('should return shift details for valid open shift', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 20000
    });

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(true);
    expect(result.shift.id).toBe(shiftId);
    expect(result.shift.opening_cash_cents).toBe(20000);
    expect(result.shift.status).toBe('open');
  }, TEST_TIMEOUT);

  it('should accept multiple payments to same open shift', async () => {
    const shiftId = await createTestCashShift('open');

    const result1 = await validateCashShiftForPayment(shiftId, 'cash');
    const result2 = await validateCashShiftForPayment(shiftId, 'cash');
    const result3 = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result1.isValid).toBe(true);
    expect(result2.isValid).toBe(true);
    expect(result3.isValid).toBe(true);
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Race Condition Handling', () => {
  it('should handle shift closed mid-transaction', async () => {
    const shiftId = await createTestCashShift('open');

    // Simulate reading shift as open
    const initialValidation = await validateCashShiftForPayment(shiftId, 'cash');
    expect(initialValidation.isValid).toBe(true);

    // Close shift while transaction is being processed
    await closeCashShift(shiftId, 15000);

    // Re-validate before finalizing transaction
    const finalValidation = await validateCashShiftForPayment(shiftId, 'cash');

    expect(finalValidation.isValid).toBe(false);
    expect(finalValidation.error).toMatch(/closed/i);
  }, TEST_TIMEOUT);

  it('should handle concurrent payments to same shift', async () => {
    const shiftId = await createTestCashShift('open');

    // Simulate concurrent validation
    const validations = await Promise.all([
      validateCashShiftForPayment(shiftId, 'cash'),
      validateCashShiftForPayment(shiftId, 'cash'),
      validateCashShiftForPayment(shiftId, 'cash')
    ]);

    // All should succeed
    validations.forEach(result => {
      expect(result.isValid).toBe(true);
    });
  }, TEST_TIMEOUT);

  it('should detect shift closure during concurrent operations', async () => {
    const shiftId = await createTestCashShift('open');

    // Start validations
    const validationPromises = [
      validateCashShiftForPayment(shiftId, 'cash'),
      validateCashShiftForPayment(shiftId, 'cash')
    ];

    // Close shift during validations
    await closeCashShift(shiftId, 15000);

    // Wait for validations
    const results = await Promise.all(validationPromises);

    // Early validations might succeed, but final check should fail
    const finalCheck = await validateCashShiftForPayment(shiftId, 'cash');
    expect(finalCheck.isValid).toBe(false);
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Balance Updates', () => {
  it('should update cash shift balance for successful payment', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 10000
    });

    const ticketCount = 2;
    const amountCents = 12500; // $125.00

    await updateCashShiftBalance(shiftId, ticketCount, amountCents);

    const updatedShift = await getCashShift(shiftId);

    expect(updatedShift.cash_sales_count).toBe(ticketCount);
    expect(updatedShift.cash_sales_total_cents).toBe(amountCents);
    expect(updatedShift.expected_cash_cents).toBe(10000 + amountCents);
  }, TEST_TIMEOUT);

  it('should accumulate multiple payments correctly', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 10000
    });

    // First payment: 3 tickets, $150
    await updateCashShiftBalance(shiftId, 3, 15000);

    // Second payment: 2 tickets, $100
    await updateCashShiftBalance(shiftId, 2, 10000);

    // Third payment: 1 ticket, $50
    await updateCashShiftBalance(shiftId, 1, 5000);

    const updatedShift = await getCashShift(shiftId);

    expect(updatedShift.cash_sales_count).toBe(6); // 3 + 2 + 1
    expect(updatedShift.cash_sales_total_cents).toBe(30000); // $300
    expect(updatedShift.expected_cash_cents).toBe(40000); // $100 opening + $300 sales
  }, TEST_TIMEOUT);

  it('should not update closed shift balance', async () => {
    const shiftId = await createTestCashShift('closed');

    await updateCashShiftBalance(shiftId, 1, 5000);

    const shift = await getCashShift(shiftId);

    // Balance should remain at initial values
    expect(shift.cash_sales_count).toBe(0);
    expect(shift.cash_sales_total_cents).toBe(0);
  }, TEST_TIMEOUT);

  it('should handle large payment amounts', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 10000
    });

    const ticketCount = 50;
    const amountCents = 500000; // $5,000

    await updateCashShiftBalance(shiftId, ticketCount, amountCents);

    const updatedShift = await getCashShift(shiftId);

    expect(updatedShift.cash_sales_count).toBe(ticketCount);
    expect(updatedShift.cash_sales_total_cents).toBe(amountCents);
    expect(updatedShift.expected_cash_cents).toBe(510000); // $5,100
  }, TEST_TIMEOUT);

  it('should handle small payment amounts', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 10000
    });

    const ticketCount = 1;
    const amountCents = 50; // $0.50

    await updateCashShiftBalance(shiftId, ticketCount, amountCents);

    const updatedShift = await getCashShift(shiftId);

    expect(updatedShift.cash_sales_count).toBe(1);
    expect(updatedShift.cash_sales_total_cents).toBe(50);
    expect(updatedShift.expected_cash_cents).toBe(10050);
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Cash Payment Requirements', () => {
  it('should require cashShiftId for cash payment', async () => {
    const result = await validateCashShiftForPayment(null, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/required/i);
    expect(result.errorCode).toBe('CASH_SHIFT_REQUIRED');
  }, TEST_TIMEOUT);

  it('should require cashShiftId for cash payment - undefined', async () => {
    const result = await validateCashShiftForPayment(undefined, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('CASH_SHIFT_REQUIRED');
  }, TEST_TIMEOUT);

  it('should provide clear error for missing cashShiftId', async () => {
    const result = await validateCashShiftForPayment(null, 'cash');

    expect(result.error).toContain('required');
    expect(result.error).toContain('cash');
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Non-Cash Payment Methods', () => {
  it('should not require cashShiftId for card_terminal payment', async () => {
    const result = await validateCashShiftForPayment(null, 'card_terminal');

    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);

  it('should not require cashShiftId for venmo payment', async () => {
    const result = await validateCashShiftForPayment(null, 'venmo');

    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);

  it('should not require cashShiftId for comp payment', async () => {
    const result = await validateCashShiftForPayment(null, 'comp');

    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);

  it('should allow card_terminal with cashShiftId provided', async () => {
    const shiftId = await createTestCashShift('open');

    const result = await validateCashShiftForPayment(shiftId, 'card_terminal');

    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);

  it('should allow venmo with invalid cashShiftId provided', async () => {
    const result = await validateCashShiftForPayment(999999, 'venmo');

    // For non-cash payments, cash shift is not validated
    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);

  it('should allow comp with closed cashShiftId provided', async () => {
    const shiftId = await createTestCashShift('closed');

    const result = await validateCashShiftForPayment(shiftId, 'comp');

    // For non-cash payments, cash shift status is not checked
    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Edge Cases', () => {
  it('should handle cash shift with zero opening balance', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 0
    });

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(true);
    expect(result.shift.opening_cash_cents).toBe(0);
  }, TEST_TIMEOUT);

  it('should handle cash shift with large opening balance', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 1000000 // $10,000
    });

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(true);
    expect(result.shift.opening_cash_cents).toBe(1000000);
  }, TEST_TIMEOUT);

  it('should handle shift with existing sales', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 10000
    });

    // Add existing sales
    await updateCashShiftBalance(shiftId, 5, 25000);

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(true);
    expect(result.shift.cash_sales_count).toBe(5);
    expect(result.shift.cash_sales_total_cents).toBe(25000);
  }, TEST_TIMEOUT);

  it('should handle shift opened today', async () => {
    const shiftId = await createTestCashShift('open', {
      opened_at: new Date().toISOString()
    });

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);

  it('should handle shift opened in the past', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const shiftId = await createTestCashShift('open', {
      opened_at: yesterday.toISOString()
    });

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    // Old open shifts should still be valid
    expect(result.isValid).toBe(true);
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Database Integrity', () => {
  it('should maintain referential integrity for cash transactions', async () => {
    const shiftId = await createTestCashShift('open');

    // Verify shift exists
    const shift = await getCashShift(shiftId);
    expect(shift).not.toBeNull();
    expect(shift.id).toBe(shiftId);
  }, TEST_TIMEOUT);

  it('should prevent transactions after shift deletion', async () => {
    const shiftId = await createTestCashShift('open');

    // Delete shift (simulates database cleanup)
    await db.execute({
      sql: 'DELETE FROM cash_shifts WHERE id = ?',
      args: [shiftId]
    });

    // Remove from cleanup list
    const index = testCashShiftIds.indexOf(shiftId);
    if (index > -1) {
      testCashShiftIds.splice(index, 1);
    }

    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid or closed cash shift');
  }, TEST_TIMEOUT);

  it('should handle concurrent balance updates atomically', async () => {
    const shiftId = await createTestCashShift('open', {
      opening_cash_cents: 10000
    });

    // Simulate concurrent updates
    const updates = [
      updateCashShiftBalance(shiftId, 1, 5000),
      updateCashShiftBalance(shiftId, 2, 10000),
      updateCashShiftBalance(shiftId, 3, 15000)
    ];

    await Promise.all(updates);

    const finalShift = await getCashShift(shiftId);

    // Should accumulate all updates correctly
    expect(finalShift.cash_sales_count).toBe(6); // 1 + 2 + 3
    expect(finalShift.cash_sales_total_cents).toBe(30000); // $300
    expect(finalShift.expected_cash_cents).toBe(40000); // $100 + $300
  }, TEST_TIMEOUT);
});

describe('Cash Shift Validation - Error Messages', () => {
  it('should provide actionable error for missing cash shift', async () => {
    const result = await validateCashShiftForPayment(null, 'cash');

    expect(result.error).toContain('required');
    expect(result.errorCode).toBe('CASH_SHIFT_REQUIRED');
  }, TEST_TIMEOUT);

  it('should provide actionable error for invalid cash shift', async () => {
    const result = await validateCashShiftForPayment(999999, 'cash');

    expect(result.error).toContain('Invalid');
    expect(result.errorCode).toBe('INVALID_CASH_SHIFT');
  }, TEST_TIMEOUT);

  it('should provide actionable error for closed cash shift', async () => {
    const shiftId = await createTestCashShift('closed');
    const result = await validateCashShiftForPayment(shiftId, 'cash');

    expect(result.error).toContain('closed');
    expect(result.errorCode).toBe('INVALID_CASH_SHIFT');
  }, TEST_TIMEOUT);

  it('should suggest opening a cash shift', async () => {
    const result = await validateCashShiftForPayment(null, 'cash');

    expect(result.error.toLowerCase()).toMatch(/required|open|shift/);
  }, TEST_TIMEOUT);
});
