import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { getDatabase } from "./database.js";

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

    this.expiryDays = parseInt(process.env.QR_CODE_EXPIRY_DAYS || "90");
    this.maxScans = parseInt(process.env.QR_CODE_MAX_SCANS || "10");

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
   * @returns {object} Database connection
   */
  getDb() {
    return getDatabase();
  }

  /**
   * Generate or retrieve QR token for a ticket
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<string>} JWT token for QR code
   */
  async getOrCreateToken(ticketId) {
    if (!ticketId) {
      throw new Error("Ticket ID is required");
    }

    const db = this.getDb();

    try {
      // Check if token already exists
      const result = await db.execute({
        sql: "SELECT qr_token FROM tickets WHERE ticket_id = ?",
        args: [ticketId],
      });

      if (result.rows[0]?.qr_token) {
        return result.rows[0].qr_token;
      }

      // Generate new token
      const token = jwt.sign(
        {
          tid: ticketId,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + this.expiryDays * 24 * 60 * 60,
        },
        this.secretKey,
      );

      // Store token
      await db.execute({
        sql: `UPDATE tickets 
              SET qr_token = ?, 
                  qr_code_generated_at = CURRENT_TIMESTAMP,
                  max_scan_count = ?
              WHERE ticket_id = ?`,
        args: [token, this.maxScans, ticketId],
      });

      return token;
    } catch (error) {
      console.error("Error generating QR token:", error.message);
      throw new Error("Failed to generate QR token");
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
