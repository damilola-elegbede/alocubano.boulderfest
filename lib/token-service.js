import crypto from "crypto";
import { getDatabase } from "./database.js";
import { TOKEN_EXPIRY, TOKEN_ACTIONS } from "./ticket-config.js";

export class TokenService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Generate cryptographically secure random ID
   */
  generateSecureId(prefix = "", length = 8) {
    const randomBytes = crypto.randomBytes(length);
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes.toString("hex").toUpperCase();
    return prefix
      ? `${prefix}-${timestamp}-${random.substring(0, length)}`
      : `${timestamp}-${random.substring(0, length)}`;
  }

  /**
   * Generate secure ticket ID
   */
  generateTicketId() {
    const prefix = process.env.TICKET_PREFIX || "TKT";
    return this.generateSecureId(prefix, 6);
  }

  /**
   * Hash token for storage
   */
  hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Generate access token for multi-use ticket viewing
   * Long-lived (3-6 months), read-only operations
   */
  async generateAccessToken(transactionId, email) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.ACCESS);

    await this.db.execute({
      sql: `INSERT INTO access_tokens (
        token_hash, transaction_id, email, expires_at
      ) VALUES (?, ?, ?, ?)`,
      args: [tokenHash, transactionId, email, expiresAt.toISOString()],
    });

    return token;
  }

  /**
   * Generate action token for single-use security-critical operations
   * Short-lived (15-30 minutes), single-use for transfers, cancellations, refunds
   */
  async generateActionToken(actionType, targetId, email) {
    if (!Object.values(TOKEN_ACTIONS).includes(actionType)) {
      throw new Error(`Invalid action type: ${actionType}`);
    }

    const token = crypto.randomBytes(24).toString("hex");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.ACTION);

    await this.db.execute({
      sql: `INSERT INTO action_tokens (
        token_hash, action_type, target_id, email, expires_at
      ) VALUES (?, ?, ?, ?, ?)`,
      args: [tokenHash, actionType, targetId, email, expiresAt.toISOString()],
    });

    return token;
  }

  /**
   * Generate validation token for QR code check-in
   * Cryptographically signed for offline verification
   */
  generateValidationToken(ticketId, eventId, attendeeEmail) {
    const secret = process.env.VALIDATION_SECRET;
    if (!secret) {
      throw new Error("VALIDATION_SECRET environment variable is required");
    }
    const payload = {
      ticket_id: ticketId,
      event_id: eventId,
      email: attendeeEmail,
      issued_at: Date.now(),
    };

    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payloadString)
      .digest("hex");

    return {
      payload: payloadString,
      signature,
      qr_data: Buffer.from(`${payloadString}.${signature}`).toString("base64"),
    };
  }

  /**
   * Validate access token
   */
  async validateAccessToken(token) {
    const tokenHash = this.hashToken(token);

    const result = await this.db.execute({
      sql: `SELECT * FROM access_tokens 
            WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      args: [tokenHash],
    });

    if (result.rows.length === 0) {
      return { valid: false, error: "Invalid or expired access token" };
    }

    const tokenRecord = result.rows[0];

    // Update last used
    await this.db.execute({
      sql: `UPDATE access_tokens 
            SET last_used_at = CURRENT_TIMESTAMP, use_count = use_count + 1 
            WHERE id = ?`,
      args: [tokenRecord.id],
    });

    return {
      valid: true,
      transactionId: tokenRecord.transaction_id,
      email: tokenRecord.email,
    };
  }

  /**
   * Validate action token (single-use)
   */
  async validateActionToken(token, expectedAction, targetId) {
    const tokenHash = this.hashToken(token);

    const result = await this.db.execute({
      sql: `SELECT * FROM action_tokens 
            WHERE token_hash = ? 
            AND action_type = ? 
            AND target_id = ? 
            AND used_at IS NULL 
            AND expires_at > datetime('now')`,
      args: [tokenHash, expectedAction, targetId],
    });

    if (result.rows.length === 0) {
      return {
        valid: false,
        error: "Invalid, expired, or already used action token",
      };
    }

    const tokenRecord = result.rows[0];

    // Mark as used
    await this.db.execute({
      sql: `UPDATE action_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [tokenRecord.id],
    });

    return {
      valid: true,
      email: tokenRecord.email,
      actionType: tokenRecord.action_type,
      targetId: tokenRecord.target_id,
    };
  }

  /**
   * Validate QR code for check-in
   */
  validateQRCode(qrData, expectedTicketId = null) {
    try {
      const secret = process.env.VALIDATION_SECRET;
      if (!secret) {
        throw new Error("VALIDATION_SECRET environment variable is required");
      }
      const decoded = Buffer.from(qrData, "base64").toString("utf-8");
      const [payloadString, signature] = decoded.split(".");

      if (!payloadString || !signature) {
        return { valid: false, error: "Malformed QR code" };
      }

      // Verify signature
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(payloadString)
        .digest("hex");

      if (signature !== expectedSignature) {
        return { valid: false, error: "Invalid QR code signature" };
      }

      const payload = JSON.parse(payloadString);

      // Check if ticket ID matches expected (if provided)
      if (expectedTicketId && payload.ticket_id !== expectedTicketId) {
        return { valid: false, error: "Ticket ID mismatch" };
      }

      // Check if QR code is too old (prevent replay attacks)
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (Date.now() - payload.issued_at > maxAge) {
        return {
          valid: false,
          error: "QR code expired (regenerate from ticket)",
        };
      }

      return {
        valid: true,
        ticketId: payload.ticket_id,
        eventId: payload.event_id,
        email: payload.email,
        issuedAt: new Date(payload.issued_at),
      };
    } catch (error) {
      return { valid: false, error: "Failed to validate QR code" };
    }
  }

  /**
   * Cleanup expired tokens
   */
  async cleanupExpiredTokens() {
    const results = await Promise.all([
      this.db.execute({
        sql: `DELETE FROM access_tokens WHERE expires_at <= datetime('now')`,
      }),
      this.db.execute({
        sql: `DELETE FROM action_tokens WHERE expires_at <= datetime('now')`,
      }),
    ]);

    return {
      accessTokensDeleted: results[0].changes || 0,
      actionTokensDeleted: results[1].changes || 0,
    };
  }

  /**
   * Get token statistics for monitoring
   */
  async getTokenStats() {
    const [accessStats, actionStats] = await Promise.all([
      this.db.execute({
        sql: `SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as valid,
                COUNT(CASE WHEN last_used_at IS NOT NULL THEN 1 END) as used
              FROM access_tokens`,
      }),
      this.db.execute({
        sql: `SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN used_at IS NULL AND expires_at > datetime('now') THEN 1 END) as valid,
                COUNT(CASE WHEN used_at IS NOT NULL THEN 1 END) as used
              FROM action_tokens`,
      }),
    ]);

    return {
      accessTokens: accessStats.rows[0],
      actionTokens: actionStats.rows[0],
    };
  }

  /**
   * Revoke all tokens for a transaction
   */
  async revokeTransactionTokens(transactionId) {
    await Promise.all([
      this.db.execute({
        sql: `UPDATE access_tokens SET expires_at = datetime('now') WHERE transaction_id = ?`,
        args: [transactionId],
      }),
      this.db.execute({
        sql: `UPDATE action_tokens SET expires_at = datetime('now') WHERE target_id = ?`,
        args: [transactionId.toString()],
      }),
    ]);
  }

  /**
   * Rate limiting check for token generation
   */
  async checkRateLimit(
    email,
    tokenType = "access",
    windowMinutes = 60,
    maxRequests = 10,
  ) {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Use parameterized queries to prevent SQL injection
    let sql, args;
    if (tokenType === "access") {
      sql =
        "SELECT COUNT(*) as count FROM access_tokens WHERE email = ? AND created_at > ?";
      args = [email, since.toISOString()];
    } else {
      sql =
        "SELECT COUNT(*) as count FROM action_tokens WHERE email = ? AND created_at > ?";
      args = [email, since.toISOString()];
    }

    const result = await this.db.execute({ sql, args });

    const count = result.rows[0]?.count || 0;

    return {
      allowed: count < maxRequests,
      count,
      remaining: Math.max(0, maxRequests - count),
      resetAt: new Date(Date.now() + windowMinutes * 60 * 1000),
    };
  }
}

export default new TokenService();
