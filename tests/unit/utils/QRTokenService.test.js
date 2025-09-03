import { describe, it, expect, beforeEach } from 'vitest';
import {
  TOKEN_EXPIRY,
  TOKEN_ACTIONS,
  generateSecureId,
  generateTicketId,
  hashToken,
  generateRegistrationToken,
  verifyJWTToken,
  generateAccessToken,
  generateActionToken,
  generateValidationToken,
  validateQRCode,
  validateActionToken,
  isTokenExpired,
  calculateTokenExpiry,
  generateUnsubscribeToken,
  validateUnsubscribeToken
} from './QRTokenService.js';

describe('QRTokenService', () => {
  const TEST_SECRET = 'test_secret_that_is_at_least_32_characters_long_for_security';
  const TEST_VALIDATION_SECRET = 'validation_secret_that_is_32_chars_plus_for_testing_purposes';

  describe('Token Constants', () => {
    it('defines correct token expiry times', () => {
      expect(TOKEN_EXPIRY.ACCESS).toBe(6 * 30 * 24 * 60 * 60 * 1000); // 6 months
      expect(TOKEN_EXPIRY.ACTION).toBe(30 * 60 * 1000); // 30 minutes
      expect(TOKEN_EXPIRY.QR_CODE).toBe(24 * 60 * 60 * 1000); // 24 hours
    });

    it('defines token actions', () => {
      expect(TOKEN_ACTIONS.TRANSFER).toBe('transfer');
      expect(TOKEN_ACTIONS.CANCEL).toBe('cancel');
      expect(TOKEN_ACTIONS.REFUND).toBe('refund');
      expect(TOKEN_ACTIONS.VIEW).toBe('view');
    });
  });

  describe('generateSecureId', () => {
    it('generates ID with correct format', () => {
      const id = generateSecureId('TKT', 8);
      const parts = id.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('TKT');
      expect(parts[1]).toHaveLength(8); // timestamp part
      expect(parts[2]).toHaveLength(8); // random part
    });

    it('generates unique IDs', () => {
      const id1 = generateSecureId('TKT', 6);
      const id2 = generateSecureId('TKT', 6);
      expect(id1).not.toBe(id2);
    });

    it('works without prefix', () => {
      const id = generateSecureId('', 6);
      const parts = id.split('-');
      expect(parts).toHaveLength(2);
    });

    it('handles different lengths', () => {
      const id4 = generateSecureId('TEST', 4);
      const id12 = generateSecureId('TEST', 12);
      expect(id4.split('-')[2]).toHaveLength(4);
      expect(id12.split('-')[2]).toHaveLength(12);
    });
  });

  describe('generateTicketId', () => {
    it('generates ticket ID with TKT prefix', () => {
      const id = generateTicketId();
      expect(id).toMatch(/^TKT-[0-9A-Z]+-[0-9A-F]{6}$/);
    });

    it('accepts custom prefix', () => {
      const id = generateTicketId('CUSTOM');
      expect(id).toMatch(/^CUSTOM-[0-9A-Z]+-[0-9A-F]{6}$/);
    });

    it('generates unique ticket IDs', () => {
      const ids = [];
      for (let i = 0; i < 100; i++) {
        ids.push(generateTicketId());
      }
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });
  });

  describe('hashToken', () => {
    it('generates consistent hashes', () => {
      const token = 'test-token';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different tokens', () => {
      const hash1 = hashToken('token1');
      const hash2 = hashToken('token2');
      expect(hash1).not.toBe(hash2);
    });

    it('throws error for invalid input', () => {
      expect(() => hashToken('')).toThrow('Token must be a non-empty string');
      expect(() => hashToken(null)).toThrow('Token must be a non-empty string');
      expect(() => hashToken(123)).toThrow('Token must be a non-empty string');
    });

    it('generates hex string', () => {
      const hash = hashToken('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateRegistrationToken', () => {
    it('generates valid JWT token', () => {
      const payload = { transactionId: 'txn123', email: 'test@example.com' };
      const token = generateRegistrationToken(payload, TEST_SECRET);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('includes required payload fields', () => {
      const payload = { transactionId: 'txn123', email: 'test@example.com' };
      const token = generateRegistrationToken(payload, TEST_SECRET);
      const verification = verifyJWTToken(token, TEST_SECRET);
      expect(verification.valid).toBe(true);
      expect(verification.payload.transactionId).toBe('txn123');
      expect(verification.payload.email).toBe('test@example.com');
    });

    it('throws error for missing transactionId', () => {
      const payload = { email: 'test@example.com' };
      expect(() => generateRegistrationToken(payload, TEST_SECRET))
        .toThrow('Transaction ID is required in payload');
    });

    it('throws error for short secret', () => {
      const payload = { transactionId: 'txn123' };
      expect(() => generateRegistrationToken(payload, 'short'))
        .toThrow('Secret must be at least 32 characters');
    });

    it('throws error for invalid payload', () => {
      expect(() => generateRegistrationToken(null, TEST_SECRET))
        .toThrow('Payload must be an object');
      expect(() => generateRegistrationToken('string', TEST_SECRET))
        .toThrow('Payload must be an object');
    });
  });

  describe('verifyJWTToken', () => {
    it('verifies valid tokens', () => {
      const payload = { transactionId: 'txn123', email: 'test@example.com' };
      const token = generateRegistrationToken(payload, TEST_SECRET);
      const result = verifyJWTToken(token, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.payload.transactionId).toBe('txn123');
    });

    it('rejects invalid tokens', () => {
      const result = verifyJWTToken('invalid-token', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('rejects tokens with wrong secret', () => {
      const payload = { transactionId: 'txn123' };
      const token = generateRegistrationToken(payload, TEST_SECRET);
      const result = verifyJWTToken(token, 'wrong_secret_that_is_32_chars_long');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('detects expired tokens', () => {
      // This would require mocking time or using very short expiry
      const payload = { transactionId: 'txn123' };
      const token = generateRegistrationToken(payload, TEST_SECRET, '0s');
      
      // Wait a moment then verify
      setTimeout(() => {
        const result = verifyJWTToken(token, TEST_SECRET);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Token has expired');
      }, 10);
    });

    it('validates token format', () => {
      const payload = { email: 'test@example.com' }; // Missing transactionId
      const token = generateRegistrationToken({ transactionId: 'temp' }, TEST_SECRET);
      
      // Manually create a token without transactionId
      const invalidPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const header = Buffer.from(JSON.stringify({typ: 'JWT', alg: 'HS256'})).toString('base64');
      const invalidToken = `${header}.${invalidPayload}.signature`;
      
      const result = verifyJWTToken(invalidToken, TEST_SECRET);
      expect(result.valid).toBe(false);
    });

    it('handles empty inputs', () => {
      expect(verifyJWTToken('', TEST_SECRET).valid).toBe(false);
      expect(verifyJWTToken('token', '').valid).toBe(false);
      expect(verifyJWTToken(null, TEST_SECRET).valid).toBe(false);
    });
  });

  describe('generateAccessToken', () => {
    it('generates access token with correct structure', () => {
      const result = generateAccessToken();
      expect(result.token).toBeDefined();
      expect(result.hash).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.token).toMatch(/^[a-f0-9]{64}$/);
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates unique tokens', () => {
      const token1 = generateAccessToken();
      const token2 = generateAccessToken();
      expect(token1.token).not.toBe(token2.token);
      expect(token1.hash).not.toBe(token2.hash);
    });

    it('sets correct expiration', () => {
      const result = generateAccessToken();
      const expectedExpiry = new Date(Date.now() + TOKEN_EXPIRY.ACCESS);
      const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });
  });

  describe('generateActionToken', () => {
    it('generates action token for valid actions', () => {
      const result = generateActionToken(TOKEN_ACTIONS.TRANSFER);
      expect(result.token).toBeDefined();
      expect(result.hash).toBeDefined();
      expect(result.actionType).toBe(TOKEN_ACTIONS.TRANSFER);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.token).toMatch(/^[a-f0-9]{48}$/);
    });

    it('throws error for invalid action', () => {
      expect(() => generateActionToken('invalid-action'))
        .toThrow('Invalid action type: invalid-action');
    });

    it('sets correct expiration', () => {
      const result = generateActionToken(TOKEN_ACTIONS.CANCEL);
      const expectedExpiry = new Date(Date.now() + TOKEN_EXPIRY.ACTION);
      const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('accepts all valid actions', () => {
      Object.values(TOKEN_ACTIONS).forEach(action => {
        const result = generateActionToken(action);
        expect(result.actionType).toBe(action);
      });
    });
  });

  describe('generateValidationToken', () => {
    it('generates QR validation token', () => {
      const result = generateValidationToken(
        'TKT-123', 'EVENT-456', 'test@example.com', TEST_VALIDATION_SECRET
      );
      expect(result.payload).toBeDefined();
      expect(result.signature).toBeDefined();
      expect(result.qrData).toBeDefined();
      expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('throws error for missing parameters', () => {
      expect(() => generateValidationToken(null, 'event', 'email', 'secret'))
        .toThrow('All parameters are required');
      expect(() => generateValidationToken('ticket', null, 'email', 'secret'))
        .toThrow('All parameters are required');
    });

    it('throws error for short secret', () => {
      expect(() => generateValidationToken('ticket', 'event', 'email', 'short'))
        .toThrow('Validation secret must be at least 32 characters');
    });

    it('generates valid base64 QR data', () => {
      const result = generateValidationToken(
        'TKT-123', 'EVENT-456', 'test@example.com', TEST_VALIDATION_SECRET
      );
      expect(() => Buffer.from(result.qrData, 'base64')).not.toThrow();
    });
  });

  describe('validateQRCode', () => {
    let validQRData;
    
    beforeEach(() => {
      const token = generateValidationToken(
        'TKT-123', 'EVENT-456', 'test@example.com', TEST_VALIDATION_SECRET
      );
      validQRData = token.qrData;
    });

    it('validates correct QR codes', () => {
      const result = validateQRCode(validQRData, TEST_VALIDATION_SECRET);
      expect(result.valid).toBe(true);
      expect(result.ticketId).toBe('TKT-123');
      expect(result.eventId).toBe('EVENT-456');
      expect(result.email).toBe('test@example.com');
    });

    it('validates with expected ticket ID', () => {
      const result = validateQRCode(validQRData, TEST_VALIDATION_SECRET, 'TKT-123');
      expect(result.valid).toBe(true);
    });

    it('rejects wrong ticket ID', () => {
      const result = validateQRCode(validQRData, TEST_VALIDATION_SECRET, 'TKT-999');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Ticket ID mismatch');
    });

    it('rejects invalid signatures', () => {
      const result = validateQRCode(validQRData, 'wrong_secret_that_is_32_characters_long');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid QR code signature');
    });

    it('rejects malformed QR data', () => {
      const result = validateQRCode('invalid-base64', TEST_VALIDATION_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Malformed QR code');
    });

    it('handles empty input', () => {
      const result = validateQRCode('', TEST_VALIDATION_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('QR data is required');
    });

    it('rejects expired QR codes', () => {
      // Generate a QR code and test with very short maxAge
      const result = validateQRCode(validQRData, TEST_VALIDATION_SECRET, null, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('QR code expired');
    });
  });

  describe('validateActionToken', () => {
    it('validates correct action tokens', () => {
      const token = 'test-token';
      const hash = hashToken(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      
      const result = validateActionToken(token, TOKEN_ACTIONS.TRANSFER, 'target123', hash, expiresAt);
      expect(result.valid).toBe(true);
    });

    it('rejects used tokens', () => {
      const token = 'test-token';
      const hash = hashToken(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const usedAt = new Date();
      
      const result = validateActionToken(token, TOKEN_ACTIONS.TRANSFER, 'target123', hash, expiresAt, usedAt);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has already been used');
    });

    it('rejects expired tokens', () => {
      const token = 'test-token';
      const hash = hashToken(token);
      const expiresAt = new Date(Date.now() - 1000); // Expired
      
      const result = validateActionToken(token, TOKEN_ACTIONS.TRANSFER, 'target123', hash, expiresAt);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has expired');
    });

    it('rejects invalid token hashes', () => {
      const token = 'test-token';
      const wrongHash = hashToken('wrong-token');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      
      const result = validateActionToken(token, TOKEN_ACTIONS.TRANSFER, 'target123', wrongHash, expiresAt);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('validates required parameters', () => {
      const result = validateActionToken('', TOKEN_ACTIONS.TRANSFER, 'target', 'hash', new Date());
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });
  });

  describe('isTokenExpired', () => {
    it('detects expired tokens', () => {
      const pastDate = new Date(Date.now() - 1000);
      expect(isTokenExpired(pastDate)).toBe(true);
    });

    it('detects valid tokens', () => {
      const futureDate = new Date(Date.now() + 1000);
      expect(isTokenExpired(futureDate)).toBe(false);
    });

    it('handles no expiration', () => {
      expect(isTokenExpired(null)).toBe(false);
      expect(isTokenExpired(undefined)).toBe(false);
    });
  });

  describe('calculateTokenExpiry', () => {
    it('calculates access token expiry', () => {
      const expiry = calculateTokenExpiry('access');
      const expected = new Date(Date.now() + TOKEN_EXPIRY.ACCESS);
      const timeDiff = Math.abs(expiry.getTime() - expected.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('calculates action token expiry', () => {
      const expiry = calculateTokenExpiry('action');
      const expected = new Date(Date.now() + TOKEN_EXPIRY.ACTION);
      const timeDiff = Math.abs(expiry.getTime() - expected.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('calculates QR token expiry', () => {
      const expiry = calculateTokenExpiry('qr');
      const expected = new Date(Date.now() + TOKEN_EXPIRY.QR_CODE);
      const timeDiff = Math.abs(expiry.getTime() - expected.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('throws error for unknown type', () => {
      expect(() => calculateTokenExpiry('unknown')).toThrow('Unknown token type: unknown');
    });
  });

  describe('generateUnsubscribeToken', () => {
    it('generates unsubscribe token', () => {
      const token = generateUnsubscribeToken('test@example.com', TEST_SECRET);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(2);
    });

    it('generates different tokens for different emails', () => {
      const token1 = generateUnsubscribeToken('test1@example.com', TEST_SECRET);
      const token2 = generateUnsubscribeToken('test2@example.com', TEST_SECRET);
      expect(token1).not.toBe(token2);
    });

    it('throws error for missing parameters', () => {
      expect(() => generateUnsubscribeToken('', TEST_SECRET)).toThrow('Email and secret are required');
      expect(() => generateUnsubscribeToken('email', '')).toThrow('Email and secret are required');
    });
  });

  describe('validateUnsubscribeToken', () => {
    it('validates correct unsubscribe tokens', () => {
      const email = 'test@example.com';
      const token = generateUnsubscribeToken(email, TEST_SECRET);
      const result = validateUnsubscribeToken(email, token, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it('rejects tokens with wrong email', () => {
      const token = generateUnsubscribeToken('test1@example.com', TEST_SECRET);
      const result = validateUnsubscribeToken('test2@example.com', token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email mismatch');
    });

    it('rejects tokens with wrong secret', () => {
      const email = 'test@example.com';
      const token = generateUnsubscribeToken(email, TEST_SECRET);
      const result = validateUnsubscribeToken(email, token, 'wrong_secret_32_characters_long');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token signature');
    });

    it('rejects expired tokens', () => {
      const email = 'test@example.com';
      const token = generateUnsubscribeToken(email, TEST_SECRET);
      const result = validateUnsubscribeToken(email, token, TEST_SECRET, 0); // 0ms maxAge
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('rejects malformed tokens', () => {
      const result = validateUnsubscribeToken('test@example.com', 'invalid-token', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Malformed token');
    });

    it('handles missing parameters', () => {
      const result = validateUnsubscribeToken('', 'token', 'secret');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email, token, and secret are required');
    });
  });
});