/**
 * Unit Tests for Cart Fingerprint Service
 * Tests deterministic cart hashing for idempotency in checkout flow
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Generate SHA-256 fingerprint from cart items for idempotency
 * This allows detecting duplicate checkout attempts with identical carts
 *
 * @param {Array} cartItems - Array of cart items with ticketTypeId, quantity, price_cents
 * @returns {string} Hex-encoded SHA-256 hash
 */
async function generateCartFingerprint(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Cart items must be a non-empty array');
  }

  // Sort by ticketTypeId for deterministic ordering
  const sortedItems = [...cartItems].sort((a, b) => {
    if (a.ticketTypeId !== b.ticketTypeId) {
      return a.ticketTypeId - b.ticketTypeId;
    }
    if (a.quantity !== b.quantity) {
      return a.quantity - b.quantity;
    }
    return a.price_cents - b.price_cents;
  });

  // Create canonical string representation
  const cartString = JSON.stringify(sortedItems);

  // Generate SHA-256 hash
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(cartString)
  );

  // Convert to hex string
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Node.js compatible version using crypto module
 */
function generateCartFingerprintSync(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Cart items must be a non-empty array');
  }

  // Sort by ticketTypeId for deterministic ordering
  const sortedItems = [...cartItems].sort((a, b) => {
    if (a.ticketTypeId !== b.ticketTypeId) {
      return a.ticketTypeId - b.ticketTypeId;
    }
    if (a.quantity !== b.quantity) {
      return a.quantity - b.quantity;
    }
    return a.price_cents - b.price_cents;
  });

  // Create canonical string representation
  const cartString = JSON.stringify(sortedItems);

  // Generate SHA-256 hash using Node.js crypto
  return crypto
    .createHash('sha256')
    .update(cartString)
    .digest('hex');
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('Cart Fingerprint Service - Unit Tests', () => {

  // Test data
  const SINGLE_ITEM_CART = [
    { ticketTypeId: 1, quantity: 2, price_cents: 12500 }
  ];

  const MULTI_ITEM_CART = [
    { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
    { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
  ];

  const LARGE_CART = Array.from({ length: 10 }, (_, i) => ({
    ticketTypeId: i + 1,
    quantity: Math.floor(Math.random() * 5) + 1,
    price_cents: (i + 1) * 1000
  }));

  // ============================================================================
  // A. FINGERPRINT GENERATION TESTS
  // ============================================================================

  describe('Fingerprint Generation', () => {
    it('should generate SHA-256 hash from cart data', () => {
      const fingerprint = generateCartFingerprintSync(SINGLE_ITEM_CART);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
      // SHA-256 produces 64 hex characters
      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic - same cart produces same hash', () => {
      const fingerprint1 = generateCartFingerprintSync(SINGLE_ITEM_CART);
      const fingerprint2 = generateCartFingerprintSync(SINGLE_ITEM_CART);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should be deterministic across multiple calls', () => {
      const fingerprints = Array.from({ length: 10 }, () =>
        generateCartFingerprintSync(SINGLE_ITEM_CART)
      );

      const allSame = fingerprints.every(fp => fp === fingerprints[0]);
      expect(allSame).toBe(true);
    });

    it('should include all cart fields in hash', () => {
      const cart1 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];
      const cart2 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should return hex string format', () => {
      const fingerprint = generateCartFingerprintSync(SINGLE_ITEM_CART);

      expect(fingerprint).toMatch(/^[0-9a-f]+$/);
      expect(fingerprint).not.toContain('0x'); // No hex prefix
    });

    it('should work with async version', async () => {
      const fingerprint = await generateCartFingerprint(SINGLE_ITEM_CART);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce same result for sync and async versions', async () => {
      const syncFingerprint = generateCartFingerprintSync(SINGLE_ITEM_CART);
      const asyncFingerprint = await generateCartFingerprint(SINGLE_ITEM_CART);

      expect(syncFingerprint).toBe(asyncFingerprint);
    });
  });

  // ============================================================================
  // B. FINGERPRINT UNIQUENESS TESTS
  // ============================================================================

  describe('Fingerprint Uniqueness', () => {
    it('should produce different hashes for different cart items', () => {
      const cart1 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];
      const cart2 = [{ ticketTypeId: 2, quantity: 2, price_cents: 12500 }];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should produce different hashes for different quantities', () => {
      const cart1 = [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }];
      const cart2 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should produce different hashes for different prices', () => {
      const cart1 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];
      const cart2 = [{ ticketTypeId: 1, quantity: 2, price_cents: 7500 }];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should produce different hashes for different item counts', () => {
      const cart1 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];
      const cart2 = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
      ];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should be order-independent - same items in different order produce same hash', () => {
      const cart1 = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
      ];
      const cart2 = [
        { ticketTypeId: 2, quantity: 1, price_cents: 7500 },
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 }
      ];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should handle multiple items with same ticketTypeId', () => {
      const cart1 = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 1, quantity: 1, price_cents: 12500 }
      ];
      const cart2 = [
        { ticketTypeId: 1, quantity: 1, price_cents: 12500 },
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 }
      ];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      // After sorting, should be identical
      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should differentiate between similar but different carts', () => {
      const cart1 = [
        { ticketTypeId: 1, quantity: 3, price_cents: 12500 }
      ];
      const cart2 = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 1, quantity: 1, price_cents: 12500 }
      ];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);

      // Different structure, should be different
      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  // ============================================================================
  // C. EDGE CASES TESTS
  // ============================================================================

  describe('Edge Cases', () => {
    it('should throw error for empty cart', () => {
      expect(() => {
        generateCartFingerprintSync([]);
      }).toThrow('Cart items must be a non-empty array');
    });

    it('should throw error for null cart', () => {
      expect(() => {
        generateCartFingerprintSync(null);
      }).toThrow('Cart items must be a non-empty array');
    });

    it('should throw error for undefined cart', () => {
      expect(() => {
        generateCartFingerprintSync(undefined);
      }).toThrow('Cart items must be a non-empty array');
    });

    it('should throw error for non-array cart', () => {
      expect(() => {
        generateCartFingerprintSync({ ticketTypeId: 1, quantity: 2, price_cents: 12500 });
      }).toThrow('Cart items must be a non-empty array');
    });

    it('should handle large carts (10+ items)', () => {
      const fingerprint = generateCartFingerprintSync(LARGE_CART);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
    });

    it('should handle cart with zero price', () => {
      const cart = [{ ticketTypeId: 1, quantity: 1, price_cents: 0 }];
      const fingerprint = generateCartFingerprintSync(cart);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
    });

    it('should handle cart with large quantities', () => {
      const cart = [{ ticketTypeId: 1, quantity: 1000, price_cents: 12500 }];
      const fingerprint = generateCartFingerprintSync(cart);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
    });

    it('should handle cart with large prices', () => {
      const cart = [{ ticketTypeId: 1, quantity: 2, price_cents: 999999999 }];
      const fingerprint = generateCartFingerprintSync(cart);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
    });

    it('should handle cart with decimal values in price_cents', () => {
      const cart = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500.50 }];
      const fingerprint = generateCartFingerprintSync(cart);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
    });

    it('should handle cart with extra properties', () => {
      const cart = [
        {
          ticketTypeId: 1,
          quantity: 2,
          price_cents: 12500,
          extraProp: 'should be ignored in hash'
        }
      ];

      const fingerprint1 = generateCartFingerprintSync(cart);

      // Same cart without extra property should produce different hash
      // (because JSON.stringify includes all properties)
      const cart2 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];
      const fingerprint2 = generateCartFingerprintSync(cart2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  // ============================================================================
  // D. COLLISION RESISTANCE TESTS
  // ============================================================================

  describe('Collision Resistance', () => {
    it('should produce unique hashes for many different carts', () => {
      const fingerprints = new Set();

      // Generate 100 different cart configurations
      for (let i = 1; i <= 100; i++) {
        const cart = [
          { ticketTypeId: i, quantity: i % 5 + 1, price_cents: i * 100 }
        ];
        const fingerprint = generateCartFingerprintSync(cart);
        fingerprints.add(fingerprint);
      }

      // All fingerprints should be unique
      expect(fingerprints.size).toBe(100);
    });

    it('should have good distribution of hash values', () => {
      const fingerprints = Array.from({ length: 50 }, (_, i) => {
        const cart = [{ ticketTypeId: 1, quantity: i + 1, price_cents: 12500 }];
        return generateCartFingerprintSync(cart);
      });

      // Check that hashes start with different characters (good distribution)
      const firstChars = new Set(fingerprints.map(fp => fp[0]));
      expect(firstChars.size).toBeGreaterThan(5); // Should have variety
    });
  });

  // ============================================================================
  // E. PRACTICAL USE CASES TESTS
  // ============================================================================

  describe('Practical Use Cases', () => {
    it('should detect identical checkout attempts', () => {
      const attempt1 = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
      ];

      const attempt2 = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
      ];

      const fingerprint1 = generateCartFingerprintSync(attempt1);
      const fingerprint2 = generateCartFingerprintSync(attempt2);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should differentiate user adding one more item', () => {
      const beforeCart = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 }
      ];

      const afterCart = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
      ];

      const fingerprint1 = generateCartFingerprintSync(beforeCart);
      const fingerprint2 = generateCartFingerprintSync(afterCart);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should differentiate price changes', () => {
      const beforeDiscount = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 }
      ];

      const afterDiscount = [
        { ticketTypeId: 1, quantity: 2, price_cents: 10000 }
      ];

      const fingerprint1 = generateCartFingerprintSync(beforeDiscount);
      const fingerprint2 = generateCartFingerprintSync(afterDiscount);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should work as Map/Object key for deduplication', () => {
      const cart1 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];
      const cart2 = [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }];
      const cart3 = [{ ticketTypeId: 2, quantity: 1, price_cents: 7500 }];

      const fingerprint1 = generateCartFingerprintSync(cart1);
      const fingerprint2 = generateCartFingerprintSync(cart2);
      const fingerprint3 = generateCartFingerprintSync(cart3);

      const deduplicationMap = new Map();
      deduplicationMap.set(fingerprint1, 'transaction-1');
      deduplicationMap.set(fingerprint2, 'transaction-2'); // Should overwrite
      deduplicationMap.set(fingerprint3, 'transaction-3');

      expect(deduplicationMap.size).toBe(2);
      expect(deduplicationMap.get(fingerprint1)).toBe('transaction-2');
    });

    it('should support idempotency checks', () => {
      const userCart = [
        { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
        { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
      ];

      const fingerprintAtCheckout = generateCartFingerprintSync(userCart);

      // Simulate user hitting back button and re-submitting
      const fingerprintOnRetry = generateCartFingerprintSync(userCart);

      expect(fingerprintAtCheckout).toBe(fingerprintOnRetry);
    });
  });

  // ============================================================================
  // F. PERFORMANCE TESTS
  // ============================================================================

  describe('Performance', () => {
    it('should generate fingerprint quickly for typical cart', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        generateCartFingerprintSync(SINGLE_ITEM_CART);
      }

      const duration = Date.now() - start;

      // Should complete 1000 operations in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle large carts efficiently', () => {
      const largeCart = Array.from({ length: 50 }, (_, i) => ({
        ticketTypeId: i + 1,
        quantity: 2,
        price_cents: 12500
      }));

      const start = Date.now();
      generateCartFingerprintSync(largeCart);
      const duration = Date.now() - start;

      // Should complete in under 10ms
      expect(duration).toBeLessThan(10);
    });
  });
});
