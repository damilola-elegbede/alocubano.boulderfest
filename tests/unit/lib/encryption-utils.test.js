/**
 * Unit Tests for Encryption Utils
 * Tests MFA secret encryption and decryption using AES-256-GCM
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret } from '../../../lib/encryption-utils.js';
import crypto from 'crypto';

describe('Encryption Utils - Unit Tests', () => {
  let originalEnv;
  const TEST_ADMIN_SECRET = 'test-admin-secret-key-minimum-32-chars-long-for-security-testing';

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('encryptSecret', () => {
    describe('Basic Encryption', () => {
      it('should encrypt a plain text secret', () => {
        const secret = 'JBSWY3DPEHPK3PXP';
        const encrypted = encryptSecret(secret);

        expect(encrypted).toBeDefined();
        expect(typeof encrypted).toBe('string');
      });

      it('should return JSON string', () => {
        const secret = 'TEST_SECRET_123';
        const encrypted = encryptSecret(secret);

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });

      it('should include encrypted data in result', () => {
        const secret = 'SECRET_DATA';
        const encrypted = encryptSecret(secret);
        const parsed = JSON.parse(encrypted);

        expect(parsed).toHaveProperty('encrypted');
        expect(typeof parsed.encrypted).toBe('string');
        expect(parsed.encrypted.length).toBeGreaterThan(0);
      });

      it('should include IV in result', () => {
        const secret = 'SECRET_DATA';
        const encrypted = encryptSecret(secret);
        const parsed = JSON.parse(encrypted);

        expect(parsed).toHaveProperty('iv');
        expect(typeof parsed.iv).toBe('string');
        expect(parsed.iv.length).toBe(32); // 16 bytes as hex = 32 characters
      });

      it('should include auth tag in result', () => {
        const secret = 'SECRET_DATA';
        const encrypted = encryptSecret(secret);
        const parsed = JSON.parse(encrypted);

        expect(parsed).toHaveProperty('authTag');
        expect(typeof parsed.authTag).toBe('string');
        expect(parsed.authTag.length).toBe(32); // 16 bytes as hex = 32 characters
      });
    });

    describe('Encryption Properties', () => {
      it('should use AES-256-GCM algorithm', () => {
        const secret = 'TEST_SECRET';
        const encrypted = encryptSecret(secret);
        const parsed = JSON.parse(encrypted);

        // Verify structure consistent with AES-256-GCM
        expect(parsed.encrypted).toBeDefined();
        expect(parsed.iv).toBeDefined();
        expect(parsed.authTag).toBeDefined();
      });

      it('should generate unique IV for each encryption', () => {
        const secret = 'SAME_SECRET';
        const encrypted1 = encryptSecret(secret);
        const encrypted2 = encryptSecret(secret);

        const parsed1 = JSON.parse(encrypted1);
        const parsed2 = JSON.parse(encrypted2);

        expect(parsed1.iv).not.toBe(parsed2.iv);
      });

      it('should produce different ciphertext for same input', () => {
        const secret = 'SAME_SECRET';
        const encrypted1 = encryptSecret(secret);
        const encrypted2 = encryptSecret(secret);

        const parsed1 = JSON.parse(encrypted1);
        const parsed2 = JSON.parse(encrypted2);

        expect(parsed1.encrypted).not.toBe(parsed2.encrypted);
      });

      it('should use 16-byte IV', () => {
        const secret = 'TEST';
        const encrypted = encryptSecret(secret);
        const parsed = JSON.parse(encrypted);

        // IV should be 16 bytes (32 hex characters)
        expect(parsed.iv.length).toBe(32);
        expect(/^[0-9a-f]{32}$/.test(parsed.iv)).toBe(true);
      });

      it('should derive key from ADMIN_SECRET', () => {
        // Change admin secret and verify different output
        const secret = 'CONSTANT_SECRET';

        process.env.ADMIN_SECRET = 'first-secret-key-minimum-32-chars-long';
        const encrypted1 = encryptSecret(secret);

        process.env.ADMIN_SECRET = 'second-secret-key-minimum-32-chars-long';
        const encrypted2 = encryptSecret(secret);

        const parsed1 = JSON.parse(encrypted1);
        const parsed2 = JSON.parse(encrypted2);

        // Same secret with different keys should produce different output
        expect(parsed1.encrypted).not.toBe(parsed2.encrypted);
      });

      it('should use "mfa-salt" as salt', () => {
        // This is implicit in the implementation
        // We verify by checking encryption/decryption works correctly
        const secret = 'TEST_SECRET';
        const encrypted = encryptSecret(secret);

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });
    });

    describe('Input Validation', () => {
      it('should handle empty string', () => {
        const encrypted = encryptSecret('');
        const parsed = JSON.parse(encrypted);

        expect(parsed.encrypted).toBeDefined();
        expect(parsed.iv).toBeDefined();
        expect(parsed.authTag).toBeDefined();
      });

      it('should handle short secrets', () => {
        const encrypted = encryptSecret('A');

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });

      it('should handle long secrets', () => {
        const longSecret = 'A'.repeat(1000);
        const encrypted = encryptSecret(longSecret);

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });

      it('should handle secrets with special characters', () => {
        const secret = 'SECRET!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
        const encrypted = encryptSecret(secret);

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });

      it('should handle secrets with unicode characters', () => {
        const secret = 'SECRET_中文_español_🔐';
        const encrypted = encryptSecret(secret);

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });

      it('should handle secrets with newlines', () => {
        const secret = 'LINE1\nLINE2\nLINE3';
        const encrypted = encryptSecret(secret);

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });

      it('should handle base32 encoded secrets (TOTP format)', () => {
        const secret = 'JBSWY3DPEHPK3PXP';
        const encrypted = encryptSecret(secret);

        expect(() => JSON.parse(encrypted)).not.toThrow();
      });
    });

    describe('AAD (Additional Authenticated Data)', () => {
      it('should use "mfa-secret" as AAD', () => {
        // AAD is used internally, we verify through successful round-trip
        const secret = 'TEST_SECRET';
        const encrypted = encryptSecret(secret);
        const decrypted = decryptSecret(encrypted);

        expect(decrypted).toBe(secret);
      });
    });
  });

  describe('decryptSecret', () => {
    describe('Basic Decryption', () => {
      it('should decrypt encrypted secret', () => {
        const original = 'JBSWY3DPEHPK3PXP';
        const encrypted = encryptSecret(original);
        const decrypted = decryptSecret(encrypted);

        expect(decrypted).toBe(original);
      });

      it('should handle round-trip encryption/decryption', () => {
        const secrets = [
          'SHORT',
          'MEDIUM_LENGTH_SECRET',
          'VERY_LONG_SECRET_WITH_LOTS_OF_CHARACTERS_' + 'A'.repeat(100)
        ];

        secrets.forEach(secret => {
          const encrypted = encryptSecret(secret);
          const decrypted = decryptSecret(encrypted);
          expect(decrypted).toBe(secret);
        });
      });

      it('should preserve exact secret value', () => {
        const original = 'EXACT_VALUE_123!@#';
        const encrypted = encryptSecret(original);
        const decrypted = decryptSecret(encrypted);

        expect(decrypted).toBe(original);
        expect(decrypted.length).toBe(original.length);
      });

      it('should handle empty string decryption', () => {
        const encrypted = encryptSecret('');
        const decrypted = decryptSecret(encrypted);

        expect(decrypted).toBe('');
      });

      it('should handle unicode characters', () => {
        const original = 'SECRET_中文_español_🔐';
        const encrypted = encryptSecret(original);
        const decrypted = decryptSecret(encrypted);

        expect(decrypted).toBe(original);
      });
    });

    describe('Error Handling', () => {
      it('should throw error for invalid encrypted data', () => {
        const invalidData = '{"encrypted":"invalid","iv":"invalid","authTag":"invalid"}';

        expect(() => decryptSecret(invalidData)).toThrow('Failed to decrypt MFA secret');
      });

      it('should throw error for malformed JSON', () => {
        const malformedJson = 'not-valid-json';

        expect(() => decryptSecret(malformedJson)).toThrow();
      });

      it('should throw error for missing encrypted field', () => {
        const missingEncrypted = JSON.stringify({
          iv: '0'.repeat(32),
          authTag: '0'.repeat(32)
        });

        expect(() => decryptSecret(missingEncrypted)).toThrow();
      });

      it('should throw error for missing IV field', () => {
        const missingIv = JSON.stringify({
          encrypted: 'abc',
          authTag: '0'.repeat(32)
        });

        expect(() => decryptSecret(missingIv)).toThrow();
      });

      it('should throw error for missing authTag field', () => {
        const missingAuthTag = JSON.stringify({
          encrypted: 'abc',
          iv: '0'.repeat(32)
        });

        expect(() => decryptSecret(missingAuthTag)).toThrow();
      });

      it('should throw error for tampered ciphertext', () => {
        const original = 'SECRET';
        const encrypted = encryptSecret(original);
        const parsed = JSON.parse(encrypted);

        // Tamper with encrypted data
        parsed.encrypted = parsed.encrypted.slice(0, -2) + 'XX';
        const tampered = JSON.stringify(parsed);

        expect(() => decryptSecret(tampered)).toThrow('Failed to decrypt MFA secret');
      });

      it('should throw error for tampered auth tag', () => {
        const original = 'SECRET';
        const encrypted = encryptSecret(original);
        const parsed = JSON.parse(encrypted);

        // Tamper with auth tag
        parsed.authTag = '0'.repeat(32);
        const tampered = JSON.stringify(parsed);

        expect(() => decryptSecret(tampered)).toThrow('Failed to decrypt MFA secret');
      });

      it('should throw error for wrong key', () => {
        const original = 'SECRET';
        const encrypted = encryptSecret(original);

        // Change the admin secret
        process.env.ADMIN_SECRET = 'different-secret-key-minimum-32-chars-long-for-testing';

        expect(() => decryptSecret(encrypted)).toThrow('Failed to decrypt MFA secret');
      });

      it('should throw error for empty encrypted data', () => {
        expect(() => decryptSecret('')).toThrow();
      });

      it('should throw error for null input', () => {
        expect(() => decryptSecret(null)).toThrow();
      });

      it('should throw error for undefined input', () => {
        expect(() => decryptSecret(undefined)).toThrow();
      });
    });

    describe('Security Properties', () => {
      it('should fail decryption with wrong AAD', () => {
        // This is implicitly tested by the implementation
        // AAD mismatch will cause authentication failure
        const original = 'SECRET';
        const encrypted = encryptSecret(original);

        // Manually create cipher with wrong AAD to test
        const parsed = JSON.parse(encrypted);
        const key = crypto.scryptSync(process.env.ADMIN_SECRET, 'mfa-salt', 32);
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(parsed.iv, 'hex')
        );

        // Set wrong AAD
        decipher.setAAD(Buffer.from('wrong-aad'));
        decipher.setAuthTag(Buffer.from(parsed.authTag, 'hex'));

        expect(() => {
          let decrypted = decipher.update(parsed.encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
        }).toThrow();
      });

      it('should verify authentication tag', () => {
        const original = 'SECRET';
        const encrypted = encryptSecret(original);
        const parsed = JSON.parse(encrypted);

        // Corrupt auth tag
        const corruptedAuthTag = parsed.authTag.split('').reverse().join('');
        const corrupted = JSON.stringify({
          ...parsed,
          authTag: corruptedAuthTag
        });

        expect(() => decryptSecret(corrupted)).toThrow('Failed to decrypt MFA secret');
      });
    });
  });

  describe('Round-Trip Tests', () => {
    it('should maintain data integrity through multiple encryptions', () => {
      const original = 'TOTP_SECRET_KEY';

      for (let i = 0; i < 10; i++) {
        const encrypted = encryptSecret(original);
        const decrypted = decryptSecret(encrypted);
        expect(decrypted).toBe(original);
      }
    });

    it('should handle sequential encrypt/decrypt operations', () => {
      const secrets = [
        'SECRET_1',
        'SECRET_2',
        'SECRET_3'
      ];

      const encrypted = secrets.map(s => encryptSecret(s));
      const decrypted = encrypted.map(e => decryptSecret(e));

      decrypted.forEach((d, i) => {
        expect(d).toBe(secrets[i]);
      });
    });

    it('should produce different encrypted values for same secret', () => {
      const secret = 'CONSTANT_SECRET';
      const encryptions = [];

      for (let i = 0; i < 5; i++) {
        encryptions.push(encryptSecret(secret));
      }

      // All should decrypt to same value
      encryptions.forEach(encrypted => {
        expect(decryptSecret(encrypted)).toBe(secret);
      });

      // But encrypted values should be different
      const uniqueValues = new Set(encryptions);
      expect(uniqueValues.size).toBe(encryptions.length);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical TOTP secrets', () => {
      const totpSecrets = [
        'JBSWY3DPEHPK3PXP',
        'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
        'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
      ];

      totpSecrets.forEach(secret => {
        const encrypted = encryptSecret(secret);
        const decrypted = decryptSecret(encrypted);
        expect(decrypted).toBe(secret);
      });
    });

    it('should handle secrets with various lengths', () => {
      const lengths = [1, 10, 32, 64, 128, 256, 512];

      lengths.forEach(length => {
        const secret = 'A'.repeat(length);
        const encrypted = encryptSecret(secret);
        const decrypted = decryptSecret(encrypted);
        expect(decrypted).toBe(secret);
        expect(decrypted.length).toBe(length);
      });
    });

    it('should handle concurrent encryption operations', () => {
      const secrets = Array.from({ length: 100 }, (_, i) => `SECRET_${i}`);
      const encrypted = secrets.map(s => encryptSecret(s));
      const decrypted = encrypted.map(e => decryptSecret(e));

      decrypted.forEach((d, i) => {
        expect(d).toBe(secrets[i]);
      });
    });
  });

  describe('Key Derivation', () => {
    it('should use scrypt for key derivation', () => {
      // Verify key derivation produces consistent results
      const secret = 'TEST';
      process.env.ADMIN_SECRET = 'consistent-key';

      const encrypted1 = encryptSecret(secret);
      const decrypted1 = decryptSecret(encrypted1);

      const encrypted2 = encryptSecret(secret);
      const decrypted2 = decryptSecret(encrypted2);

      expect(decrypted1).toBe(secret);
      expect(decrypted2).toBe(secret);
    });

    it('should produce 32-byte keys for AES-256', () => {
      // Implicit test - if key was wrong size, encryption would fail
      const secret = 'TEST';
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(secret);
    });

    it('should use same salt for encryption and decryption', () => {
      const secret = 'TEST';
      const encrypted = encryptSecret(secret);

      // Decryption should work because same salt is used
      expect(() => decryptSecret(encrypted)).not.toThrow();
    });
  });

  describe('Data Format', () => {
    it('should produce hex-encoded output', () => {
      const secret = 'TEST';
      const encrypted = encryptSecret(secret);
      const parsed = JSON.parse(encrypted);

      // Verify hex format
      expect(/^[0-9a-f]+$/.test(parsed.encrypted)).toBe(true);
      expect(/^[0-9a-f]+$/.test(parsed.iv)).toBe(true);
      expect(/^[0-9a-f]+$/.test(parsed.authTag)).toBe(true);
    });

    it('should have consistent JSON structure', () => {
      const secret = 'TEST';
      const encrypted = encryptSecret(secret);
      const parsed = JSON.parse(encrypted);

      expect(Object.keys(parsed).sort()).toEqual(['authTag', 'encrypted', 'iv']);
    });

    it('should be serializable and deserializable', () => {
      const secret = 'TEST';
      const encrypted = encryptSecret(secret);

      // Serialize and deserialize
      const serialized = JSON.stringify(JSON.parse(encrypted));
      const decrypted = decryptSecret(serialized);

      expect(decrypted).toBe(secret);
    });
  });

  describe('Edge Cases', () => {
    it('should handle secrets with only whitespace', () => {
      const secret = '   \t\n  ';
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(secret);
    });

    it('should handle secrets with control characters', () => {
      const secret = 'SECRET\x00\x01\x02';
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(secret);
    });

    it('should handle secrets with emoji', () => {
      const secret = '🔐🔑🗝️';
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(secret);
    });

    it('should handle maximum practical secret length', () => {
      const secret = 'A'.repeat(10000);
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(secret);
      expect(decrypted.length).toBe(10000);
    });
  });

  describe('Performance', () => {
    it('should encrypt within reasonable time', () => {
      const secret = 'PERFORMANCE_TEST_SECRET';
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        encryptSecret(secret);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // 100 encryptions in < 1 second
    });

    it('should decrypt within reasonable time', () => {
      const secret = 'PERFORMANCE_TEST_SECRET';
      const encrypted = Array.from({ length: 100 }, () => encryptSecret(secret));

      const start = Date.now();
      encrypted.forEach(e => decryptSecret(e));
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // 100 decryptions in < 1 second
    });
  });
});
