/**
 * Verification Code Validation API Endpoint
 * Validates the 6-digit code and creates a JWT session token
 */

import { getDatabaseClient } from "../../lib/database.js";
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getClientIp, maskEmail } from '../../lib/volunteer-helpers.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Rate limiting storage
const rateLimitMap = new Map();

/**
 * Rate limiting middleware
 * Allows 10 verification attempts per IP per 15 minutes
 */
function rateLimit(ip) {
  const limit = 10;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  const key = `verify_code_${ip}`;
  const now = Date.now();

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 0, resetTime: now + windowMs });
  }

  const rateData = rateLimitMap.get(key);

  if (now > rateData.resetTime) {
    rateData.count = 0;
    rateData.resetTime = now + windowMs;
  }

  if (rateData.count >= limit) {
    return {
      allowed: false,
      error: 'Too many verification attempts. Please try again later.',
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000)
    };
  }

  rateData.count++;
  return { allowed: true };
}

/**
 * Create JWT access token for ticket viewing
 */
function createAccessToken(email) {
  const secret = process.env.REGISTRATION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('REGISTRATION_SECRET not configured properly');
  }

  const tokenId = crypto.randomBytes(16).toString('hex');

  return jwt.sign(
    {
      email: email.toLowerCase(),
      tokenId,
      purpose: 'ticket_viewing',
      createdAt: Date.now()
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: '1h', // 1 hour session
      issuer: 'alocubano-tickets'
    }
  );
}

/**
 * Verify code endpoint handler
 */
export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const { email, code } = req.body;

    // Validate inputs
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        error: 'Verification code is required'
      });
    }

    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedCode = code.trim();

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(sanitizedCode)) {
      return res.status(400).json({
        error: 'Invalid verification code format'
      });
    }

    // Check rate limiting
    const ipAddress = getClientIp(req);
    const rateLimitResult = rateLimit(ipAddress);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: rateLimitResult.error,
        retryAfter: rateLimitResult.retryAfter
      });
    }

    // Look up verification code
    const client = await getDatabaseClient();
    const result = await client.execute({
      sql: `
        SELECT *
        FROM email_verification_codes
        WHERE email = ?
        AND code = ?
        AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      args: [sanitizedEmail, sanitizedCode]
    });

    if (result.rows.length === 0) {
      // Track failed attempts for the latest pending code to prevent brute force
      const pendingResult = await client.execute({
        sql: `
          SELECT id, attempts, max_attempts
          FROM email_verification_codes
          WHERE email = ?
            AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        args: [sanitizedEmail]
      });

      if (pendingResult.rows.length > 0) {
        const pending = processDatabaseResult(pendingResult.rows[0]);
        const newAttempts = pending.attempts + 1;
        const exceeded = newAttempts > pending.max_attempts;

        await client.execute({
          sql: `
            UPDATE email_verification_codes
            SET attempts = ?, status = CASE WHEN ? THEN 'failed' ELSE status END
            WHERE id = ?
          `,
          args: [newAttempts, exceeded ? 1 : 0, pending.id]
        });

        if (exceeded) {
          return res.status(400).json({
            error: 'Too many verification attempts. Please request a new code.'
          });
        }
      }

      return res.status(400).json({
        error: 'Invalid or expired verification code'
      });
    }

    const verification = processDatabaseResult(result.rows[0]);

    // Check if code has expired
    const now = new Date();
    const expiresAt = new Date(verification.expires_at);
    if (now > expiresAt) {
      // Mark as expired
      await client.execute({
        sql: `UPDATE email_verification_codes SET status = 'expired' WHERE id = ?`,
        args: [verification.id]
      });

      return res.status(400).json({
        error: 'Verification code has expired. Please request a new code.'
      });
    }

    // Check attempts
    const attempts = verification.attempts + 1;
    if (attempts > verification.max_attempts) {
      // Mark as failed
      await client.execute({
        sql: `UPDATE email_verification_codes SET status = 'failed', attempts = ? WHERE id = ?`,
        args: [attempts, verification.id]
      });

      return res.status(400).json({
        error: 'Too many verification attempts. Please request a new code.'
      });
    }

    // Code is valid - mark as verified
    await client.execute({
      sql: `
        UPDATE email_verification_codes
        SET status = 'verified', verified_at = CURRENT_TIMESTAMP, attempts = ?
        WHERE id = ?
      `,
      args: [attempts, verification.id]
    });

    // Invalidate all other pending codes for this email (one-time use)
    await client.execute({
      sql: `
        UPDATE email_verification_codes
        SET status = 'expired'
        WHERE email = ?
        AND id != ?
        AND status = 'pending'
      `,
      args: [sanitizedEmail, verification.id]
    });

    // Create JWT access token
    const accessToken = createAccessToken(sanitizedEmail);

    console.log(`[VerifyCode] Code verified successfully for ${maskEmail(sanitizedEmail)}`);

    return res.status(200).json({
      success: true,
      message: 'Verification successful',
      accessToken,
      expiresIn: 3600 // 1 hour in seconds
    });

  } catch (error) {
    console.error('[VerifyCode] Error:', error);

    return res.status(500).json({
      error: 'Failed to verify code. Please try again later.'
    });
  }
}
