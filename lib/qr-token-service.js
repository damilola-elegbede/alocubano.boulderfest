import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { getDatabaseClient } from "./database.js";
import { processDatabaseResult } from "./bigint-serializer.js";
// Token fix cutoff date: tokens created before this date have incorrect 72-hour expiration
// Tokens created after this date have proper event-based expiration
// NOTE: Set to January 1, 2025 (past date) - all new tokens should use event-based expiry
export const TOKEN_FIX_CUTOFF = new Date('2025-01-01T00:00:00Z').getTime() / 1000;


/**
 * Service for managing QR code tokens and generation
 */
export class QRTokenService {
  constructor() {
    // Check if we're in test mode
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.INTEGRATION_TEST_MODE === 'true';

    // Don't initialize DB in constructor - get fresh connection per operation
    if (isTestMode && !process.env.QR_SECRET_KEY) {
      // Use test default for integration tests
      this.secretKey = 'test-qr-secret-key-for-integration-tests';
      console.log('🔐 Using test mode QR secret key');
    } else {
      this.secretKey = process.env.QR_SECRET_KEY;
    }

    // SECURITY FIX: Ensure QR_SECRET_KEY is set in production
    if (!isTestMode && !this.secretKey) {
      throw new Error("❌ FATAL: QR_SECRET_KEY environment variable must be set in production");
    }

    // Removed: expiryDays - now calculated per event (end_date + 7 days)

    const parsedMaxScans = Number.parseInt(process.env.QR_CODE_MAX_SCANS ?? "", 10);
    this.maxScans = Number.isFinite(parsedMaxScans) && parsedMaxScans >= 0
      ? parsedMaxScans
      : 3;

    // Critical wallet secret - use fallback in test mode
    if (isTestMode && !process.env.WALLET_AUTH_SECRET) {
      // Use test default for integration tests
      console.log('🎫 Using test mode wallet auth secret');
      // Don't throw error in test mode
    } else if (!process.env.WALLET_AUTH_SECRET) {
      throw new Error("❌ FATAL: WALLET_AUTH_SECRET secret not configured");
    }
  }

  /**
   * Get database connection
   * @returns {Promise<object>} Database connection
   */
  async getDb() {
    return getDatabaseClient();
  }

  /**
   * Get event end date for a specific ticket
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<string|null>} Event end date or null if not found
   */
  async getEventEndDateForTicket(ticketId) {
    const db = await this.getDb();
    const result = await db.execute({
      sql: `SELECT e.end_date
            FROM events e
            JOIN tickets t ON t.event_id = e.id
            WHERE t.ticket_id = ?`,
      args: [ticketId]
    });

    // BIGINT FIX: Sanitize database result before accessing properties
    const sanitized = processDatabaseResult(result.rows[0]);
    return sanitized?.end_date;
  }

  /**
   * Generate QR token with custom payload (for test mode support)
   * @param {object} payload - Token payload
   * @returns {string} JWT token for QR code
   */
  generateToken(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error("Payload is required for token generation");
    }

    // SECURITY FIX: No fallback secret in production
    if (!this.secretKey) {
      throw new Error("❌ FATAL: QR secret key not available for token generation");
    }

    // Add standard token fields if not present
    // Default to 1 year if no expiration provided (test mode fallback)
    const tokenPayload = {
      ...payload,
      iat: payload.iat || Math.floor(Date.now() / 1000),
      exp: payload.exp || Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60),
    };

    try {
      return jwt.sign(tokenPayload, this.secretKey);
    } catch (error) {
      console.error("Error generating token:", error.message);
      throw new Error("Failed to generate token");
    }
  }

  /**
   * Generate or retrieve QR token for a ticket with retry logic
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<string>} JWT token for QR code
   */
  async getOrCreateToken(ticketId) {
    if (!ticketId) {
      throw new Error("Ticket ID is required");
    }

    // CRITICAL FIX: Convert BigInt to string for JWT compatibility
    // Database returns ticket_id as BigInt, but jwt.sign() cannot serialize BigInt
    const ticketIdStr = typeof ticketId === 'bigint' ? String(ticketId) : ticketId;

    const maxRetries = 5;
    const baseDelay = 30; // ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const db = await this.getDb();

        // Check if token already exists and get current state
        const result = await db.execute({
          sql: "SELECT qr_token, scan_count, max_scan_count FROM tickets WHERE ticket_id = ?",
          args: [ticketIdStr],
        });

        // BIGINT FIX: Sanitize database result to convert BigInt values
        const sanitizedRow = processDatabaseResult(result.rows[0]);

        if (sanitizedRow?.qr_token) {
          return sanitizedRow.qr_token;
        }

        // Get current ticket state to determine safe max_scan_count
        const ticket = sanitizedRow;
        if (!ticket) {
          throw new Error("Ticket not found");
        }

        // Look up event end date for this ticket
        const eventEndDate = await this.getEventEndDateForTicket(ticketIdStr);

        let expiresAt;
        if (eventEndDate) {
          // Set expiration to 7 days after event ends
          const eventEnd = new Date(eventEndDate);
          eventEnd.setDate(eventEnd.getDate() + 7);
          expiresAt = Math.floor(eventEnd.getTime() / 1000);
          console.log(`[QRToken] Token expires 7 days after event (${eventEnd.toISOString()})`);
        } else {
          // Fallback: 1 year if event lookup fails
          expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
          console.warn('[QRToken] Event lookup failed, using 1-year fallback');
        }

        // Generate new token using generateToken method with event-based expiration
        // CRITICAL: Use ticketIdStr (string) instead of ticketId (may be BigInt) for JWT compatibility
        const token = this.generateToken({
          tid: ticketIdStr,
          exp: expiresAt
        });

        // CRITICAL FIX: Only update max_scan_count if it won't violate trigger constraint
        // Trigger enforces: scan_count <= max_scan_count
        // If current scan_count is already >= desired maxScans, keep existing max_scan_count
        const currentScanCount = ticket.scan_count || 0;
        const currentMaxScanCount = ticket.max_scan_count || 10;
        const desiredMaxScans = this.maxScans;

        // Choose the larger value to avoid trigger constraint violation
        const safeMaxScanCount = Math.max(currentScanCount, desiredMaxScans, currentMaxScanCount);

        // Store token with safe max_scan_count
        await db.execute({
          sql: `UPDATE tickets
                SET qr_token = ?,
                    max_scan_count = ?,
                    qr_code_generated_at = CURRENT_TIMESTAMP
                WHERE ticket_id = ?`,
          args: [token, safeMaxScanCount, ticketIdStr],
        });

        return token;
      } catch (error) {
        const isBusyError = error.message?.includes('SQLITE_BUSY') ||
                            error.message?.includes('database is locked');

        if (isBusyError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 10;
          const delayRounded = Math.floor(delay);
          console.log(`[QR-TOKEN] Database busy, retrying (${attempt}/${maxRetries}) after ${delayRounded}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        console.error("Error generating QR token:", error.message);
        throw new Error("Failed to generate QR token");
      }
    }

    throw new Error("Maximum retry attempts exceeded for QR token generation");
  }

  /**
   * Validate QR token
   * @param {string} token - JWT token to validate
   * @returns {object} Validation result with payload if valid
   */
  validateToken(token) {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is required' };
    }

    // SECURITY FIX: No fallback secret in production
    if (!this.secretKey) {
      return { valid: false, error: 'Secret key not available for token validation' };
    }

    try {
      const decoded = jwt.verify(token, this.secretKey);
      return { valid: true, payload: decoded };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        // Check if this is an old token (created before the fix)
        try {
          const payload = jwt.decode(token);
          if (payload?.iat && payload.iat < TOKEN_FIX_CUTOFF) {
            // Old token - ignore JWT exp, database will check registration_deadline
            const decoded = jwt.verify(token, this.secretKey, { ignoreExpiration: true });
            console.warn(`[QRToken] Old token (iat: ${new Date(payload.iat * 1000).toISOString()}) - ignoring JWT exp, using database expiration`);
            return { valid: true, payload: decoded };
          }
        } catch (decodeError) {
          console.error('[QRToken] Failed to decode expired token:', decodeError.message);
        }
        return { valid: false, error: 'Token has expired' };
      }
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: 'Token verification failed' };
    }
  }

  /**
   * Check if token is a test token
   * @param {string} token - JWT token to check
   * @returns {boolean} True if test token
   */
  isTestToken(token) {
    try {
      const validation = this.validateToken(token);
      if (!validation.valid) {
        return false;
      }
      
      const payload = validation.payload;
      return !!(payload.isTest || payload.tid?.startsWith('TEST-'));
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate QR code image from token
   * @param {string} token - JWT token or ticket ID
   * @param {object} options - QR code generation options
   * @returns {Promise<string>} QR code as data URL
   */
  async generateQRImage(token, options = {}) {
    if (!token) {
      throw new Error("Token is required for QR code generation");
    }

    // Validate token format (basic check)
    if (typeof token !== "string" || token.length < 10) {
      throw new Error("Invalid token format");
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:8080";

    // Use POST body instead of URL query for security
    const qrData = `${baseUrl}/my-ticket#${token}`;

    const qrOptions = {
      errorCorrectionLevel: "M",
      type: "image/png",
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      ...options,
    };

    try {
      return await QRCode.toDataURL(qrData, qrOptions);
    } catch (error) {
      console.error("Error generating QR code image:", error.message);
      throw new Error("Failed to generate QR code image");
    }
  }

  /**
   * Verify if service is properly configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    // WALLET_AUTH_SECRET is now validated in constructor, so it should always be present
    return !!(
      this.secretKey &&
      this.secretKey.length > 20 &&
      process.env.WALLET_AUTH_SECRET &&
      process.env.WALLET_AUTH_SECRET.length > 20
    );
  }

  /**
   * Clean up resources (for testing)
   */
  async cleanup() {
    // No persistent connections to clean up
    // Each operation uses its own connection
  }
}

// Singleton instance
let qrTokenService = null;

/**
 * Get QR Token Service singleton instance
 * @returns {QRTokenService} QR Token Service instance
 */
export function getQRTokenService() {
  if (!qrTokenService) {
    qrTokenService = new QRTokenService();
  }
  return qrTokenService;
}
