import { describe, test, expect, beforeEach, vi } from 'vitest';
import { 
  mockFetch, 
  mockBrevoService, 
  mockStripeService,
  mockDatabaseClient,
  assertMockCalled,
  resetMocks
} from '../helpers/mocks';

describe('Mock Helpers', () => {
  describe('mockFetch', () => {
    test('returns configured responses in sequence', async () => {
      const fetch = mockFetch([
        { data: { id: 1 }, status: 200 },
        { data: { error: 'Not found' }, status: 404, ok: false }
      ]);
      
      const res1 = await fetch('/api/user');
      expect(res1.status).toBe(200);
      expect(res1.ok).toBe(true);
      expect(await res1.json()).toEqual({ id: 1 });
      
      const res2 = await fetch('/api/missing');
      expect(res2.ok).toBe(false);
      expect(res2.status).toBe(404);
      expect(await res2.json()).toEqual({ error: 'Not found' });
    });
    
    test('defaults to successful response when no config provided', async () => {
      const fetch = mockFetch();
      
      const response = await fetch('/api/test');
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({});
    });
    
    test('provides all response methods', async () => {
      const fetch = mockFetch([{ data: { test: 'data' } }]);
      const response = await fetch('/api/test');
      
      expect(typeof response.json).toBe('function');
      expect(typeof response.text).toBe('function');
      expect(typeof response.blob).toBe('function');
      expect(response.headers).toBeInstanceOf(Headers);
    });
    
    test('increments through responses on multiple calls', async () => {
      const fetch = mockFetch([
        { data: { call: 1 } },
        { data: { call: 2 } },
        { data: { call: 3 } }
      ]);
      
      expect(await (await fetch('/api/1')).json()).toEqual({ call: 1 });
      expect(await (await fetch('/api/2')).json()).toEqual({ call: 2 });
      expect(await (await fetch('/api/3')).json()).toEqual({ call: 3 });
    });
  });
  
  describe('mockBrevoService', () => {
    test('provides all required email service methods', () => {
      const brevo = mockBrevoService();
      
      expect(brevo.sendEmail).toBeDefined();
      expect(brevo.addContact).toBeDefined();
      expect(brevo.removeContact).toBeDefined();
      expect(brevo.getContact).toBeDefined();
      expect(brevo.updateContact).toBeDefined();
      
      // All methods should be Vitest mocks
      expect(vi.isMockFunction(brevo.sendEmail)).toBe(true);
      expect(vi.isMockFunction(brevo.addContact)).toBe(true);
    });
    
    test('sendEmail returns expected format', async () => {
      const brevo = mockBrevoService();
      const result = await brevo.sendEmail();
      
      expect(result.messageId).toMatch(/^msg_\d+$/);
    });
    
    test('addContact returns expected format', async () => {
      const brevo = mockBrevoService();
      const result = await brevo.addContact();
      
      expect(result.id).toMatch(/^contact_\d+$/);
    });
    
    test('getContact returns default contact data', async () => {
      const brevo = mockBrevoService();
      const result = await brevo.getContact();
      
      expect(result).toEqual({
        email: 'test@example.com',
        listIds: [1, 2]
      });
    });
    
    test('all methods can be mocked with custom responses', async () => {
      const brevo = mockBrevoService();
      
      brevo.sendEmail.mockResolvedValue({ messageId: 'custom-msg-123' });
      brevo.addContact.mockResolvedValue({ id: 'custom-contact-456' });
      
      expect(await brevo.sendEmail()).toEqual({ messageId: 'custom-msg-123' });
      expect(await brevo.addContact()).toEqual({ id: 'custom-contact-456' });
    });
  });
  
  describe('mockStripeService', () => {
    test('provides checkout session methods', () => {
      const stripe = mockStripeService();
      
      expect(stripe.checkout.sessions.create).toBeDefined();
      expect(stripe.checkout.sessions.retrieve).toBeDefined();
      expect(stripe.webhooks.constructEvent).toBeDefined();
      
      expect(vi.isMockFunction(stripe.checkout.sessions.create)).toBe(true);
    });
    
    test('creates checkout session with expected format', async () => {
      const stripe = mockStripeService();
      
      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: 'price_123', quantity: 1 }]
      });
      
      expect(session.id).toMatch(/^cs_test_\d+$/);
      expect(session.url).toBe('https://checkout.stripe.com/test');
      expect(session.payment_status).toBe('unpaid');
    });
    
    test('retrieves checkout session with paid status', async () => {
      const stripe = mockStripeService();
      
      const session = await stripe.checkout.sessions.retrieve('cs_test_123');
      
      expect(session.id).toMatch(/^cs_test_\d+$/);
      expect(session.payment_status).toBe('paid');
      expect(session.customer_email).toBe('test@example.com');
    });
    
    test('constructs webhook events', () => {
      const stripe = mockStripeService();
      
      const event = stripe.webhooks.constructEvent('payload', 'signature', 'secret');
      
      expect(event.type).toBe('checkout.session.completed');
      expect(event.data.object.id).toMatch(/^cs_test_\d+$/);
      expect(event.data.object.payment_status).toBe('paid');
    });
    
    test('allows custom mock responses', async () => {
      const stripe = mockStripeService();
      
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_custom_123',
        url: 'https://custom.url',
        payment_status: 'requires_payment_method'
      });
      
      const result = await stripe.checkout.sessions.create();
      expect(result.id).toBe('cs_custom_123');
      expect(result.url).toBe('https://custom.url');
    });
  });
  
  describe('mockDatabaseClient', () => {
    test('provides all database methods', () => {
      const db = mockDatabaseClient();
      
      expect(db.execute).toBeDefined();
      expect(db.close).toBeDefined();
      expect(db.transaction).toBeDefined();
      
      expect(vi.isMockFunction(db.execute)).toBe(true);
    });
    
    test('execute returns default empty result', async () => {
      const db = mockDatabaseClient();
      
      const result = await db.execute('SELECT * FROM users');
      expect(result).toEqual({ rows: [], rowsAffected: 0 });
    });
    
    test('execute returns configured responses by query type', async () => {
      const responses = {
        SELECT: { rows: [{ id: 1, name: 'Test' }], rowsAffected: 0 },
        INSERT: { rows: [], rowsAffected: 1 },
        UPDATE: { rows: [], rowsAffected: 2 }
      };
      const db = mockDatabaseClient(responses);
      
      const selectResult = await db.execute('SELECT * FROM users');
      expect(selectResult.rows).toHaveLength(1);
      expect(selectResult.rows[0].name).toBe('Test');
      
      const insertResult = await db.execute('INSERT INTO users VALUES (...)');
      expect(insertResult.rowsAffected).toBe(1);
      
      const updateResult = await db.execute('UPDATE users SET name = ?');
      expect(updateResult.rowsAffected).toBe(2);
    });
    
    test('transaction method provides transaction context', async () => {
      const db = mockDatabaseClient();
      
      const result = await db.transaction(async (tx) => {
        expect(tx.execute).toBeDefined();
        expect(tx.rollback).toBeDefined();
        
        const txResult = await tx.execute('INSERT INTO test VALUES (1)');
        expect(txResult.rowsAffected).toBe(1);
        
        return 'transaction-complete';
      });
      
      expect(result).toBe('transaction-complete');
    });
    
    test('close method resolves without error', async () => {
      const db = mockDatabaseClient();
      await expect(db.close()).resolves.toBeUndefined();
    });
  });
  
  describe('assertMockCalled', () => {
    test('validates mock calls with expected arguments', () => {
      const mock = vi.fn();
      mock('first', 1);
      mock('second', 2);
      mock('third', 3);
      
      assertMockCalled(mock, [
        ['first', 1],
        ['second', 2],
        ['third', 3]
      ]);
    });
    
    test('throws error for incorrect call count', () => {
      const mock = vi.fn();
      mock('only-call');
      
      expect(() => {
        assertMockCalled(mock, [
          ['first-call'],
          ['second-call']
        ]);
      }).toThrow();
    });
    
    test('throws error for incorrect arguments', () => {
      const mock = vi.fn();
      mock('actual', 123);
      
      expect(() => {
        assertMockCalled(mock, [
          ['expected', 456]
        ]);
      }).toThrow();
    });
    
    test('handles empty expected calls', () => {
      const mock = vi.fn();
      
      assertMockCalled(mock, []);
      expect(mock).toHaveBeenCalledTimes(0);
    });
  });
  
  describe('resetMocks', () => {
    let mockA, mockB;
    
    beforeEach(() => {
      mockA = vi.fn();
      mockB = vi.fn();
    });
    
    test('clears all mocks without assertions', () => {
      mockA('test');
      mockB('test');
      
      expect(mockA).toHaveBeenCalledTimes(1);
      expect(mockB).toHaveBeenCalledTimes(1);
      
      resetMocks();
      
      expect(mockA).toHaveBeenCalledTimes(0);
      expect(mockB).toHaveBeenCalledTimes(0);
    });
    
    test('validates expected call counts before clearing', () => {
      mockA('test');
      mockA('test2');
      mockB('test');
      
      const mocks = { mockA, mockB };
      const assertions = { mockA: 2, mockB: 1 };
      
      expect(() => resetMocks(mocks, assertions)).not.toThrow();
      
      expect(mockA).toHaveBeenCalledTimes(0);
      expect(mockB).toHaveBeenCalledTimes(0);
    });
    
    test('throws error if assertion fails before clearing', () => {
      mockA('test');
      
      const mocks = { mockA };
      const assertions = { mockA: 2 }; // Expected 2, but only called 1 time
      
      expect(() => resetMocks(mocks, assertions)).toThrow();
    });
    
    test('handles missing mocks in assertions gracefully', () => {
      const mocks = {};
      const assertions = { nonExistentMock: 1 };
      
      expect(() => resetMocks(mocks, assertions)).not.toThrow();
    });
  });
});