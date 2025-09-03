/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_CART_STATE,
  generateSessionId,
  createInitialCartState,
  serializeCartState,
  deserializeCartState,
  isValidCartState,
  migrateDonationFormat,
  cleanCartState,
  isValidTicket,
  isValidDonation,
  calculateCartStateSize,
  isWithinStorageLimits,
  createCartStateDiff
} from '../../../../js/lib/pure/cart-persistence.js';

// Mock global Blob for Node.js environment
global.Blob = class Blob {
  constructor(content) {
    this.size = JSON.stringify(content[0]).length;
  }
};

describe('CartPersistence', () => {
  let mockDate;

  beforeEach(() => {
    mockDate = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
  });

  afterEach(() => {
    if (mockDate) {
      mockDate.mockRestore();
    }
    vi.clearAllMocks();
  });

  describe('DEFAULT_CART_STATE', () => {
    it('should have required structure', () => {
      expect(DEFAULT_CART_STATE).toHaveProperty('tickets');
      expect(DEFAULT_CART_STATE).toHaveProperty('donations');
      expect(DEFAULT_CART_STATE).toHaveProperty('metadata');
      
      expect(DEFAULT_CART_STATE.tickets).toEqual({});
      expect(DEFAULT_CART_STATE.donations).toEqual([]);
      expect(DEFAULT_CART_STATE.metadata).toHaveProperty('createdAt');
      expect(DEFAULT_CART_STATE.metadata).toHaveProperty('updatedAt');
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      
      expect(id1).toMatch(/^session_\d+_\w+$/);
      expect(id2).toMatch(/^session_\d+_\w+$/);
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp in session ID', () => {
      const id = generateSessionId();
      const timestamp = parseInt(id.split('_')[1]);
      
      expect(timestamp).toBe(1234567890);
    });

    it('should include random component', () => {
      const id = generateSessionId();
      const randomPart = id.split('_')[2];
      
      expect(randomPart).toMatch(/^\w+$/);
      expect(randomPart.length).toBeGreaterThan(0);
    });
  });

  describe('createInitialCartState', () => {
    it('should create valid initial state', () => {
      const state = createInitialCartState();
      
      expect(state).toMatchObject({
        tickets: {},
        donations: [],
        metadata: {
          createdAt: 1234567890,
          updatedAt: 1234567890
        }
      });
      expect(state.metadata.sessionId).toMatch(/^session_\d+_\w+$/);
    });

    it('should create unique session IDs', () => {
      const state1 = createInitialCartState();
      const state2 = createInitialCartState();
      
      expect(state1.metadata.sessionId).not.toBe(state2.metadata.sessionId);
    });
  });

  describe('serializeCartState', () => {
    it('should serialize valid cart state', () => {
      const cartState = createInitialCartState();
      const serialized = serializeCartState(cartState);
      
      expect(() => JSON.parse(serialized)).not.toThrow();
      
      const parsed = JSON.parse(serialized);
      expect(parsed).toMatchObject({
        tickets: {},
        donations: [],
        metadata: expect.objectContaining({
          updatedAt: 1234567890
        })
      });
    });

    it('should update timestamp during serialization', () => {
      const cartState = createInitialCartState();
      cartState.metadata.updatedAt = 1000; // Old timestamp
      
      const serialized = serializeCartState(cartState);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.metadata.updatedAt).toBe(1234567890);
    });

    it('should handle null/undefined input', () => {
      const serialized1 = serializeCartState(null);
      const serialized2 = serializeCartState(undefined);
      
      const parsed1 = JSON.parse(serialized1);
      const parsed2 = JSON.parse(serialized2);
      
      expect(isValidCartState(parsed1)).toBe(true);
      expect(isValidCartState(parsed2)).toBe(true);
    });

    it('should handle serialization errors gracefully', () => {
      const circularCart = {};
      circularCart.self = circularCart; // Circular reference
      
      const serialized = serializeCartState(circularCart);
      const parsed = JSON.parse(serialized);
      
      expect(isValidCartState(parsed)).toBe(true);
    });

    it('should serialize complex cart state', () => {
      const cartState = {
        tickets: {
          general: { ticketType: 'general', price: 50, name: 'General', quantity: 2 }
        },
        donations: [
          { id: 'donation1', amount: 25, name: 'Support' }
        ],
        metadata: {
          createdAt: 1000,
          updatedAt: 2000,
          sessionId: 'test-session'
        }
      };
      
      const serialized = serializeCartState(cartState);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.tickets.general).toMatchObject(cartState.tickets.general);
      expect(parsed.donations[0]).toMatchObject(cartState.donations[0]);
      expect(parsed.metadata.updatedAt).toBe(1234567890); // Updated timestamp
    });
  });

  describe('deserializeCartState', () => {
    it('should deserialize valid cart state', () => {
      const originalState = createInitialCartState();
      const serialized = JSON.stringify(originalState);
      const deserialized = deserializeCartState(serialized);
      
      expect(deserialized).toMatchObject(originalState);
    });

    it('should handle invalid JSON gracefully', () => {
      const invalid = '{"tickets": invalid json}';
      const result = deserializeCartState(invalid);
      
      expect(isValidCartState(result)).toBe(true);
      expect(result).toMatchObject({
        tickets: {},
        donations: [],
        metadata: expect.objectContaining({
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
          sessionId: expect.any(String)
        })
      });
    });

    it('should handle null/undefined input', () => {
      expect(isValidCartState(deserializeCartState(null))).toBe(true);
      expect(isValidCartState(deserializeCartState(undefined))).toBe(true);
      expect(isValidCartState(deserializeCartState(''))).toBe(true);
    });

    it('should migrate old donation format', () => {
      const oldFormat = {
        tickets: {},
        donations: { amount: 50, updatedAt: 1000 }, // Old single donation format
        metadata: { createdAt: 1000, updatedAt: 1000, sessionId: 'test' }
      };
      
      const serialized = JSON.stringify(oldFormat);
      const deserialized = deserializeCartState(serialized);
      
      expect(Array.isArray(deserialized.donations)).toBe(true);
      expect(deserialized.donations).toHaveLength(1);
      expect(deserialized.donations[0]).toMatchObject({
        amount: 50,
        name: 'Festival Support',
        addedAt: 1000
      });
    });

    it('should handle old donation format with zero amount', () => {
      const oldFormat = {
        tickets: {},
        donations: { amount: 0 },
        metadata: { createdAt: 1000, updatedAt: 1000, sessionId: 'test' }
      };
      
      const serialized = JSON.stringify(oldFormat);
      const deserialized = deserializeCartState(serialized);
      
      expect(deserialized.donations).toEqual([]);
    });

    it('should return initial state for invalid structure', () => {
      const invalid = { tickets: 'not an object' };
      const serialized = JSON.stringify(invalid);
      const deserialized = deserializeCartState(serialized);
      
      expect(isValidCartState(deserialized)).toBe(true);
      expect(deserialized).toMatchObject({
        tickets: {},
        donations: [],
        metadata: expect.objectContaining({
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
          sessionId: expect.any(String)
        })
      });
    });
  });

  describe('isValidCartState', () => {
    it('should validate correct cart state', () => {
      const validState = createInitialCartState();
      expect(isValidCartState(validState)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(isValidCartState(null)).toBe(false);
      expect(isValidCartState(undefined)).toBe(false);
    });

    it('should reject non-objects', () => {
      expect(isValidCartState('string')).toBe(false);
      expect(isValidCartState(123)).toBe(false);
      expect(isValidCartState([])).toBe(false);
    });

    it('should reject missing metadata', () => {
      const invalid = { tickets: {}, donations: [] };
      expect(isValidCartState(invalid)).toBe(false);
    });

    it('should reject missing tickets', () => {
      const invalid = { donations: [], metadata: { createdAt: 1000, updatedAt: 1000 } };
      expect(isValidCartState(invalid)).toBe(false);
    });

    it('should reject missing donations', () => {
      const invalid = { tickets: {}, metadata: { createdAt: 1000, updatedAt: 1000 } };
      expect(isValidCartState(invalid)).toBe(false);
    });

    it('should reject invalid metadata timestamps', () => {
      const invalid1 = {
        tickets: {},
        donations: [],
        metadata: { createdAt: 'invalid', updatedAt: 1000 }
      };
      const invalid2 = {
        tickets: {},
        donations: [],
        metadata: { createdAt: 1000, updatedAt: null }
      };
      
      expect(isValidCartState(invalid1)).toBe(false);
      expect(isValidCartState(invalid2)).toBe(false);
    });

    it('should reject non-array donations', () => {
      const invalid = {
        tickets: {},
        donations: 'not array',
        metadata: { createdAt: 1000, updatedAt: 1000 }
      };
      
      expect(isValidCartState(invalid)).toBe(false);
    });
  });

  describe('migrateDonationFormat', () => {
    it('should migrate old single donation format', () => {
      const oldState = {
        tickets: {},
        donations: { amount: 100, updatedAt: 5000 },
        metadata: { createdAt: 1000, updatedAt: 2000 }
      };
      
      const migrated = migrateDonationFormat(oldState);
      
      expect(Array.isArray(migrated.donations)).toBe(true);
      expect(migrated.donations).toHaveLength(1);
      expect(migrated.donations[0]).toMatchObject({
        amount: 100,
        name: 'Festival Support',
        addedAt: 5000
      });
    });

    it('should handle old format with no amount', () => {
      const oldState = {
        tickets: {},
        donations: { amount: 0 },
        metadata: { createdAt: 1000, updatedAt: 2000 }
      };
      
      const migrated = migrateDonationFormat(oldState);
      expect(migrated.donations).toEqual([]);
    });

    it('should preserve already migrated donations', () => {
      const newState = {
        tickets: {},
        donations: [{ id: 'test', amount: 50, name: 'Support' }],
        metadata: { createdAt: 1000, updatedAt: 2000 }
      };
      
      const migrated = migrateDonationFormat(newState);
      expect(migrated.donations).toEqual(newState.donations);
    });

    it('should handle invalid input', () => {
      expect(isValidCartState(migrateDonationFormat(null))).toBe(true);
      expect(isValidCartState(migrateDonationFormat(undefined))).toBe(true);
    });

    it('should fix non-array donations', () => {
      const invalidState = {
        tickets: {},
        donations: 'not array',
        metadata: { createdAt: 1000, updatedAt: 2000 }
      };
      
      const migrated = migrateDonationFormat(invalidState);
      expect(migrated.donations).toEqual([]);
    });
  });

  describe('cleanCartState', () => {
    it('should remove invalid tickets', () => {
      const dirtyState = {
        tickets: {
          valid: { ticketType: 'valid', price: 50, name: 'Valid', quantity: 2 },
          noPrice: { ticketType: 'noprice', name: 'No Price', quantity: 1 },
          noName: { ticketType: 'noname', price: 30, quantity: 1 },
          zeroQuantity: { ticketType: 'zero', price: 40, name: 'Zero', quantity: 0 }
        },
        donations: [],
        metadata: { createdAt: 1000, updatedAt: 2000 }
      };
      
      const cleaned = cleanCartState(dirtyState);
      
      expect(Object.keys(cleaned.tickets)).toEqual(['valid']);
      expect(cleaned.tickets.valid).toMatchObject(dirtyState.tickets.valid);
    });

    it('should remove invalid donations', () => {
      const dirtyState = {
        tickets: {},
        donations: [
          { id: 'valid', amount: 50, name: 'Valid' },
          { id: 'noamount', name: 'No Amount' },
          { id: 'zeroamount', amount: 0, name: 'Zero' },
          null,
          { id: 'negative', amount: -10, name: 'Negative' }
        ],
        metadata: { createdAt: 1000, updatedAt: 2000 }
      };
      
      const cleaned = cleanCartState(dirtyState);
      
      expect(cleaned.donations).toHaveLength(1);
      expect(cleaned.donations[0]).toMatchObject(dirtyState.donations[0]);
    });

    it('should update timestamp', () => {
      const state = createInitialCartState();
      state.metadata.updatedAt = 5000;
      
      const cleaned = cleanCartState(state);
      expect(cleaned.metadata.updatedAt).toBe(1234567890);
    });

    it('should handle invalid cart state', () => {
      const invalid = { tickets: 'invalid' };
      const cleaned = cleanCartState(invalid);
      
      expect(isValidCartState(cleaned)).toBe(true);
    });
  });

  describe('isValidTicket', () => {
    it('should validate correct ticket', () => {
      const validTicket = {
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        quantity: 2
      };
      
      expect(isValidTicket(validTicket)).toBe(true);
    });

    it('should reject tickets with missing properties', () => {
      expect(isValidTicket({ price: 50, name: 'Test', quantity: 1 })).toBe(false);
      expect(isValidTicket({ ticketType: 'test', name: 'Test', quantity: 1 })).toBe(false);
      expect(isValidTicket({ ticketType: 'test', price: 50, quantity: 1 })).toBe(false);
      expect(isValidTicket({ ticketType: 'test', price: 50, name: 'Test' })).toBe(false);
    });

    it('should reject tickets with invalid property types', () => {
      expect(isValidTicket({ 
        ticketType: 123, price: 50, name: 'Test', quantity: 1 
      })).toBe(false);
      expect(isValidTicket({ 
        ticketType: 'test', price: '50', name: 'Test', quantity: 1 
      })).toBe(false);
      expect(isValidTicket({ 
        ticketType: 'test', price: 50, name: 123, quantity: 1 
      })).toBe(false);
      expect(isValidTicket({ 
        ticketType: 'test', price: 50, name: 'Test', quantity: '1' 
      })).toBe(false);
    });

    it('should reject tickets with invalid values', () => {
      expect(isValidTicket({ 
        ticketType: '', price: 50, name: 'Test', quantity: 1 
      })).toBe(false);
      expect(isValidTicket({ 
        ticketType: 'test', price: 0, name: 'Test', quantity: 1 
      })).toBe(false);
      expect(isValidTicket({ 
        ticketType: 'test', price: 50, name: '', quantity: 1 
      })).toBe(false);
      expect(isValidTicket({ 
        ticketType: 'test', price: 50, name: 'Test', quantity: 0 
      })).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidTicket(null)).toBe(false);
      expect(isValidTicket(undefined)).toBe(false);
    });
  });

  describe('isValidDonation', () => {
    it('should validate correct donation', () => {
      const validDonation = {
        id: 'donation_123',
        amount: 50,
        name: 'Festival Support'
      };
      
      expect(isValidDonation(validDonation)).toBe(true);
    });

    it('should reject donations with missing properties', () => {
      expect(isValidDonation({ amount: 50, name: 'Test' })).toBe(false);
      expect(isValidDonation({ id: 'test', name: 'Test' })).toBe(false);
      expect(isValidDonation({ id: 'test', amount: 50 })).toBe(false);
    });

    it('should reject donations with invalid property types', () => {
      expect(isValidDonation({ id: 123, amount: 50, name: 'Test' })).toBe(false);
      expect(isValidDonation({ id: 'test', amount: '50', name: 'Test' })).toBe(false);
      expect(isValidDonation({ id: 'test', amount: 50, name: 123 })).toBe(false);
    });

    it('should reject donations with invalid values', () => {
      expect(isValidDonation({ id: '', amount: 50, name: 'Test' })).toBe(false);
      expect(isValidDonation({ id: 'test', amount: 0, name: 'Test' })).toBe(false);
      expect(isValidDonation({ id: 'test', amount: 50, name: '' })).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidDonation(null)).toBe(false);
      expect(isValidDonation(undefined)).toBe(false);
    });
  });

  describe('calculateCartStateSize', () => {
    it('should calculate size for cart state', () => {
      const state = createInitialCartState();
      const size = calculateCartStateSize(state);
      
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);
    });

    it('should handle serialization errors', () => {
      const circularState = {};
      circularState.self = circularState;
      
      const size = calculateCartStateSize(circularState);
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0); // Circular references are still serializable in our implementation
    });

    it('should calculate different sizes for different states', () => {
      const smallState = createInitialCartState();
      const largeState = {
        ...createInitialCartState(),
        tickets: {
          ticket1: { ticketType: 'test', price: 50, name: 'Test Ticket', quantity: 5 }
        },
        donations: [
          { id: 'donation1', amount: 100, name: 'Large Donation' }
        ]
      };
      
      const smallSize = calculateCartStateSize(smallState);
      const largeSize = calculateCartStateSize(largeState);
      
      expect(largeSize).toBeGreaterThan(smallSize);
    });
  });

  describe('isWithinStorageLimits', () => {
    it('should return true for small cart states', () => {
      const state = createInitialCartState();
      expect(isWithinStorageLimits(state)).toBe(true);
    });

    it('should use custom size limit', () => {
      const state = createInitialCartState();
      const size = calculateCartStateSize(state);
      
      expect(isWithinStorageLimits(state, size - 1)).toBe(false);
      expect(isWithinStorageLimits(state, size + 1)).toBe(true);
    });

    it('should handle edge case at exact limit', () => {
      const state = createInitialCartState();
      const size = calculateCartStateSize(state);
      
      expect(isWithinStorageLimits(state, size)).toBe(true);
    });
  });

  describe('createCartStateDiff', () => {
    it('should detect added tickets', () => {
      const oldState = { tickets: {}, donations: [] };
      const newState = { 
        tickets: { general: { quantity: 2 } }, 
        donations: [] 
      };
      
      const diff = createCartStateDiff(oldState, newState);
      
      expect(diff.tickets.added).toContain('general');
      expect(diff.tickets.updated).toHaveLength(0);
      expect(diff.tickets.removed).toHaveLength(0);
      expect(diff.totalsChanged).toBe(true);
    });

    it('should detect removed tickets', () => {
      const oldState = { 
        tickets: { general: { quantity: 2 } }, 
        donations: [] 
      };
      const newState = { tickets: {}, donations: [] };
      
      const diff = createCartStateDiff(oldState, newState);
      
      expect(diff.tickets.removed).toContain('general');
      expect(diff.tickets.added).toHaveLength(0);
      expect(diff.tickets.updated).toHaveLength(0);
      expect(diff.totalsChanged).toBe(true);
    });

    it('should detect updated tickets', () => {
      const oldState = { 
        tickets: { general: { quantity: 2 } }, 
        donations: [] 
      };
      const newState = { 
        tickets: { general: { quantity: 5 } }, 
        donations: [] 
      };
      
      const diff = createCartStateDiff(oldState, newState);
      
      expect(diff.tickets.updated).toHaveLength(1);
      expect(diff.tickets.updated[0]).toMatchObject({
        type: 'general',
        oldQuantity: 2,
        newQuantity: 5
      });
      expect(diff.totalsChanged).toBe(true);
    });

    it('should detect donation changes', () => {
      const oldState = { tickets: {}, donations: [] };
      const newState = { tickets: {}, donations: [{ amount: 50 }] };
      
      const diff = createCartStateDiff(oldState, newState);
      
      expect(diff.donations.added).toHaveLength(1);
      expect(diff.donations.removed).toHaveLength(0);
      expect(diff.totalsChanged).toBe(true);
    });

    it('should handle no changes', () => {
      const state = { 
        tickets: { general: { quantity: 2 } }, 
        donations: [{ amount: 50 }] 
      };
      
      const diff = createCartStateDiff(state, state);
      
      expect(diff.tickets.added).toHaveLength(0);
      expect(diff.tickets.updated).toHaveLength(0);
      expect(diff.tickets.removed).toHaveLength(0);
      expect(diff.donations.added).toHaveLength(0);
      expect(diff.donations.removed).toHaveLength(0);
      expect(diff.totalsChanged).toBe(false);
    });

    it('should handle null/undefined states', () => {
      const diff = createCartStateDiff(null, { tickets: {}, donations: [] });
      
      expect(diff.totalsChanged).toBe(false);
      expect(diff.tickets.added).toHaveLength(0);
    });
  });
});