/**
 * TOTP (Time-based One-Time Password) Generator for E2E Tests
 * Generates 6-digit MFA codes compatible with Google Authenticator
 */

import crypto from 'crypto';

/**
 * Generate a TOTP code from a base32-encoded secret
 * @param {string} secret - Base32-encoded secret (e.g., from MFA setup)
 * @param {number} timeStep - Time step in seconds (default: 30)
 * @param {number} digits - Number of digits in code (default: 6)
 * @returns {string} 6-digit TOTP code
 */
export function generateTOTP(secret, timeStep = 30, digits = 6) {
  // Decode base32 secret
  const key = base32Decode(secret);

  // Get current time counter
  const counter = Math.floor(Date.now() / 1000 / timeStep);

  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  // Generate HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  // Generate digits-long code
  const otp = code % Math.pow(10, digits);

  // Pad with leading zeros
  return otp.toString().padStart(digits, '0');
}

/**
 * Decode base32-encoded string to Buffer
 * @param {string} encoded - Base32-encoded string
 * @returns {Buffer} Decoded buffer
 */
function base32Decode(encoded) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanedEncoded = encoded.toUpperCase().replace(/=+$/, '');

  let bits = '';
  for (const char of cleanedEncoded) {
    const index = base32Chars.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

/**
 * Test MFA Secret for E2E Tests
 * This is a fixed secret used across all E2E tests for consistent MFA codes
 *
 * SECURITY NOTE: This secret is ONLY for testing and should NEVER be used in production
 */
export const TEST_MFA_SECRET = process.env.TEST_MFA_SECRET || 'JBSWY3DPEHPK3PXP'; // Default test secret

/**
 * Get current TOTP code for E2E tests
 * Uses the TEST_MFA_SECRET from environment or default
 *
 * @returns {string} Current 6-digit TOTP code
 */
export function getTestMFACode() {
  return generateTOTP(TEST_MFA_SECRET);
}

/**
 * Verify that a TOTP code is valid for a given secret
 * Checks current code and 1 time step before/after for clock drift tolerance
 *
 * @param {string} code - The TOTP code to verify
 * @param {string} secret - Base32-encoded secret
 * @param {number} window - Number of time steps to check before/after (default: 1)
 * @returns {boolean} True if code is valid
 */
export function verifyTOTP(code, secret, window = 1) {
  const timeStep = 30;
  const currentTime = Math.floor(Date.now() / 1000 / timeStep);

  // Check current time and window before/after
  for (let i = -window; i <= window; i++) {
    const time = currentTime + i;
    const counter = Buffer.alloc(8);
    counter.writeBigInt64BE(BigInt(time));

    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(counter);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0x0f;
    const generatedCode =
      (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
      1000000;

    if (generatedCode.toString().padStart(6, '0') === code) {
      return true;
    }
  }

  return false;
}
