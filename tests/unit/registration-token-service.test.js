/**
 * Unit Tests for Registration Token Service
 * Tests JWT token generation, validation, expiration, and transaction ID handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegistrationTokenService } from '../../lib/registration-token-service.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

describe('RegistrationTokenService - Unit Tests', () => {
  let service;
  let mockDb;
  const TEST_SECRET = 'test-registration-secret-key-minimum-32-chars-long';

  beforeEach(() => {
    // Set up environment for testing
    process.env.REGISTRATION_SECRET = TEST_SECRET;
    process.env.INTEGRATION_TEST_MODE = 'false';

    // Create fresh service instance
    service = new RegistrationTokenService();

    // Mock database client
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [], rowsAffected: 1 })
    };

    // Override internal state for unit testing
    service.db = mockDb;
    service.secret = TEST_SECRET;
    service.initialized = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Generation', () => {
    it('should generate valid JWT token with correct payload structure', async () => {
      const transactionId = 12345;

      mockDb.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

      const token = await service.createToken(transactionId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify JWT structure
      const decoded = jwt.verify(token, TEST_SECRET);
      expect(decoded).toHaveProperty('tid');
      expect(decoded).toHaveProperty('txn');
      expect(decoded).toHaveProperty('type', 'registration');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    it('should encode transaction ID as string in token payload', async () => {
      const transactionId = 98765;

      mockDb.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

      const token = await service.createToken(transactionId);
      const decoded = jwt.verify(token, TEST_SECRET);

      expect(decoded.txn).toBe('98765');
      expect(typeof decoded.txn).toBe('string');
    });

    it('should handle BigInt transaction IDs correctly', async () => {
      const transactionId = BigInt('9007199254740991'); // Max safe integer + 1

      mockDb.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

      const token = await service.createToken(transactionId);
      const decoded = jwt.verify(token, TEST_SECRET);

      expect(decoded.txn).toBe('9007199254740991');
    });

    it('should generate unique token IDs for each token', async () => {
      mockDb.execute.mockResolvedValue({ rows: [], rowsAffected: 1 });

      const token1 = await service.createToken(1);
      const token2 = await service.createToken(1);

      const decoded1 = jwt.verify(token1, TEST_SECRET);
      const decoded2 = jwt.verify(token2, TEST_SECRET);

      expect(decoded1.tid).not.toBe(decoded2.tid);
    });

    it('should set token expiration to 72 hours by default', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

      const beforeTime = Math.floor(Date.now() / 1000);
      const token = await service.createToken(123);
      const afterTime = Math.floor(Date.now() / 1000);

      const decoded = jwt.verify(token, TEST_SECRET);
      const expectedExpiry = 72 * 60 * 60; // 72 hours in seconds

      expect(decoded.exp - decoded.iat).toBe(expectedExpiry);
      expect(decoded.iat).toBeGreaterThanOrEqual(beforeTime);
      expect(decoded.iat).toBeLessThanOrEqual(afterTime);
    });

    it('should update transaction record with token and expiration', async () => {
      const transactionId = 456;

      mockDb.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

      await service.createToken(transactionId);

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('UPDATE transactions'),
          args: expect.arrayContaining([
            expect.any(String), // token
            expect.any(String), // expiration ISO string
            expect.any(String), // initiated_at ISO string
            transactionId
          ])
        })
      );
    });
  });

  describe('Token Validation', () => {
    it('should validate token with correct signature successfully', async () => {
      const transactionId = 789;
      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: String(transactionId),
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockResolvedValueOnce({
        rows: [{
          id: transactionId,
          customer_email: 'test@example.com',
          registration_token: token,
          registration_token_expires: new Date(Date.now() + 3600000).toISOString(),
          all_tickets_registered: false
        }]
      });

      const result = await service.validateAndConsumeToken(token, '127.0.0.1');

      expect(result).toHaveProperty('transactionId', transactionId);
      expect(result).toHaveProperty('customerId', 'test@example.com');
    });

    it('should reject token with invalid signature', async () => {
      const token = jwt.sign(
        { tid: 'test', txn: '123', type: 'registration' },
        'wrong-secret',
        { algorithm: 'HS256' }
      );

      await expect(
        service.validateAndConsumeToken(token, '127.0.0.1')
      ).rejects.toThrow();
    });

    it('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '123',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      await expect(
        service.validateAndConsumeToken(expiredToken, '127.0.0.1')
      ).rejects.toThrow();
    });

    it('should reject token if not found in database', async () => {
      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '999',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.validateAndConsumeToken(token, '127.0.0.1')
      ).rejects.toThrow('Token invalid or expired');
    });

    it('should reject token if registration already completed', async () => {
      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '123',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockResolvedValueOnce({
        rows: [{
          id: 123,
          customer_email: 'test@example.com',
          registration_token: token,
          registration_token_expires: new Date(Date.now() + 3600000).toISOString(),
          all_tickets_registered: true
        }]
      });

      await expect(
        service.validateAndConsumeToken(token, '127.0.0.1')
      ).rejects.toThrow('Registration already completed');
    });

    it('should atomically consume token after validation', async () => {
      const transactionId = 555;
      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: String(transactionId),
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute
        .mockResolvedValueOnce({
          rows: [{
            id: transactionId,
            customer_email: 'test@example.com',
            registration_token: token,
            registration_token_expires: new Date(Date.now() + 3600000).toISOString(),
            all_tickets_registered: false
          }]
        })
        .mockResolvedValueOnce({ rowsAffected: 1 });

      await service.validateAndConsumeToken(token, '127.0.0.1');

      // Verify token was nullified
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('registration_token = NULL'),
          args: [transactionId, token]
        })
      );
    });
  });

  describe('Token Expiration', () => {
    it('should respect custom expiration time if configured', async () => {
      service.tokenExpiry = 48 * 60 * 60; // 48 hours

      mockDb.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

      const token = await service.createToken(123);
      const decoded = jwt.verify(token, TEST_SECRET);

      expect(decoded.exp - decoded.iat).toBe(48 * 60 * 60);
    });

    it('should validate token within expiration window', async () => {
      const transactionId = 111;
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: String(transactionId),
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: futureExpiry
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockResolvedValueOnce({
        rows: [{
          id: transactionId,
          customer_email: 'test@example.com',
          registration_token: token,
          registration_token_expires: new Date(futureExpiry * 1000).toISOString(),
          all_tickets_registered: false
        }]
      });

      const result = await service.validateAndConsumeToken(token, '127.0.0.1');
      expect(result.transactionId).toBe(transactionId);
    });

    it('should reject token past server-side expiration even if JWT valid', async () => {
      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '123',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600 // JWT still valid
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      // But database says it's expired
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.validateAndConsumeToken(token, '127.0.0.1')
      ).rejects.toThrow('Token invalid or expired');
    });
  });

  describe('Token Revocation', () => {
    it('should revoke token for given transaction ID', async () => {
      const transactionId = 777;

      mockDb.execute.mockResolvedValueOnce({ rowsAffected: 1 });

      await service.revokeToken(transactionId);

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('registration_token = NULL'),
          args: [transactionId]
        })
      );
    });

    it('should handle revocation of non-existent token gracefully', async () => {
      mockDb.execute.mockResolvedValueOnce({ rowsAffected: 0 });

      await expect(service.revokeToken(99999)).resolves.not.toThrow();
    });
  });

  describe('Security & Error Handling', () => {
    it('should reject initialization without REGISTRATION_SECRET', () => {
      delete process.env.REGISTRATION_SECRET;

      expect(() => {
        const newService = new RegistrationTokenService();
        newService.secret = null;
        newService._performInitialization();
      }).rejects.toThrow('REGISTRATION_SECRET must be set');
    });

    it('should reject secret shorter than 32 characters', async () => {
      process.env.REGISTRATION_SECRET = 'short-secret';

      const newService = new RegistrationTokenService();
      await expect(newService.ensureInitialized()).rejects.toThrow(
        'REGISTRATION_SECRET must be set (>=32 chars)'
      );
    });

    it('should handle malformed token gracefully', async () => {
      const malformedToken = 'not.a.valid.jwt.token.at.all';

      await expect(
        service.validateAndConsumeToken(malformedToken, '127.0.0.1')
      ).rejects.toThrow();
    });

    it('should handle database errors during token creation', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(service.createToken(123)).rejects.toThrow('Database connection failed');
    });

    it('should handle database errors during token validation', async () => {
      const token = jwt.sign(
        { tid: 'test', txn: '123', type: 'registration' },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockRejectedValueOnce(new Error('Database query failed'));

      await expect(
        service.validateAndConsumeToken(token, '127.0.0.1')
      ).rejects.toThrow('Database query failed');
    });
  });

  describe('Audit Logging', () => {
    it('should log token creation', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockDb.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

      await service.createToken(123);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('registration_token_usage')
      );

      consoleSpy.mockRestore();
    });

    it('should log successful token validation', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '123',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockResolvedValueOnce({
        rows: [{
          id: 123,
          customer_email: 'test@example.com',
          registration_token: token,
          registration_token_expires: new Date(Date.now() + 3600000).toISOString(),
          all_tickets_registered: false
        }]
      });

      await service.validateAndConsumeToken(token, '192.168.1.1');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('validated')
      );

      consoleSpy.mockRestore();
    });

    it('should log failed token validation', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const token = jwt.sign(
        { tid: 'test', txn: '123', type: 'registration' },
        'wrong-secret',
        { algorithm: 'HS256' }
      );

      await expect(
        service.validateAndConsumeToken(token, '192.168.1.1')
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed')
      );

      consoleSpy.mockRestore();
    });

    it('should include IP address in audit logs', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '123',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockResolvedValueOnce({
        rows: [{
          id: 123,
          customer_email: 'test@example.com',
          registration_token: token,
          registration_token_expires: new Date(Date.now() + 3600000).toISOString(),
          all_tickets_registered: false
        }]
      });

      await service.validateAndConsumeToken(token, '203.0.113.45');

      const logCall = consoleSpy.mock.calls.find(call =>
        call[0].includes('203.0.113.45')
      );
      expect(logCall).toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  describe('Performance', () => {
    it('should validate token under 100ms target', async () => {
      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '123',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockResolvedValueOnce({
        rows: [{
          id: 123,
          customer_email: 'test@example.com',
          registration_token: token,
          registration_token_expires: new Date(Date.now() + 3600000).toISOString(),
          all_tickets_registered: false
        }]
      });

      const start = Date.now();
      await service.validateAndConsumeToken(token, '127.0.0.1');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should warn if validation exceeds 100ms', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const token = jwt.sign(
        {
          tid: crypto.randomUUID(),
          txn: '123',
          type: 'registration',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        TEST_SECRET,
        { algorithm: 'HS256' }
      );

      mockDb.execute.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
        return {
          rows: [{
            id: 123,
            customer_email: 'test@example.com',
            registration_token: token,
            registration_token_expires: new Date(Date.now() + 3600000).toISOString(),
            all_tickets_registered: false
          }]
        };
      });

      await service.validateAndConsumeToken(token, '127.0.0.1');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeded 100ms')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
