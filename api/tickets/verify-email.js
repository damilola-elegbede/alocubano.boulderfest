/**
 * Email Verification Code API Endpoint
 * Sends a 6-digit verification code to the provided email
 */

import { getDatabaseClient } from "../../lib/database.js";
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { sendEmail } from '../../lib/email-service.js';
import { generateVerificationCodeEmail } from '../../lib/email-templates/verification-code.js';
import crypto from 'crypto';

// Rate limiting storage (in production, use Redis or similar)
const rateLimitMap = new Map();

/**
 * Rate limiting middleware
 * Allows 3 verification code requests per email per 15 minutes
 */
function rateLimit(email) {
  const limit = 3;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  const key = `verify_${email.toLowerCase()}`;
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
      error: 'Too many verification requests. Please try again later.',
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000)
    };
  }

  rateData.count++;
  return { allowed: true };
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate a 6-digit verification code
 */
function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Get client IP address
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Verify email endpoint handler
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
    const { email } = req.body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    const sanitizedEmail = email.toLowerCase().trim();

    if (!isValidEmail(sanitizedEmail)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Check rate limiting
    const rateLimitResult = rateLimit(sanitizedEmail);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: rateLimitResult.error,
        retryAfter: rateLimitResult.retryAfter
      });
    }

    // Check if email has any tickets
    const client = await getDatabaseClient();
    const ticketsResult = await client.execute({
      sql: `
        SELECT COUNT(*) as count
        FROM tickets
        WHERE LOWER(attendee_email) = LOWER(?)
        OR EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = tickets.transaction_id
          AND LOWER(t.purchaser_email) = LOWER(?)
        )
      `,
      args: [sanitizedEmail, sanitizedEmail]
    });

    const ticketCount = ticketsResult.rows[0]?.count || 0;

    if (ticketCount === 0) {
      // Don't reveal if email exists or not (security best practice)
      // Send success response even if no tickets found
      return res.status(200).json({
        success: true,
        message: 'If tickets are associated with this email, a verification code has been sent.'
      });
    }

    // Generate verification code
    const code = generateVerificationCode();
    const expiryMinutes = 5;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    const ipAddress = getClientIp(req);

    // Store verification code in database
    await client.execute({
      sql: `
        INSERT INTO email_verification_codes (email, code, expires_at, ip_address, status)
        VALUES (?, ?, ?, ?, 'pending')
      `,
      args: [sanitizedEmail, code, expiresAt, ipAddress]
    });

    // Send verification code email
    const emailHtml = generateVerificationCodeEmail({
      code,
      expiryMinutes
    });

    await sendEmail({
      to: sanitizedEmail,
      subject: 'Your Verification Code for A Lo Cubano Boulder Fest',
      html: emailHtml
    });

    console.log(`[VerifyEmail] Verification code sent to ${sanitizedEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Verification code sent to your email',
      expiresIn: expiryMinutes * 60 // seconds
    });

  } catch (error) {
    console.error('[VerifyEmail] Error:', error);

    return res.status(500).json({
      error: 'Failed to send verification code. Please try again later.'
    });
  }
}
