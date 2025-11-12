import crypto from "crypto";
import { getDatabaseClient } from "./database.js";
import { TOKEN_EXPIRY, TOKEN_ACTIONS } from "./ticket-config.js";

export class TokenService {
  constructor() {
    // ✅ NEW WORKING PATTERN: Use getDatabaseClient() directly per operation
    // No longer store database instance in constructor to prevent hanging
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
    const db = await getDatabaseClient();
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.ACCESS);

    await db.execute({
      sql: `INSERT INTO access_tokens (
        token, token_type, entity_id, entity_type, expires_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        token,
        'access',
        transactionId,
        'transaction',
        expiresAt.toISOString(),
        JSON.stringify({ email })
      ],
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

    const db = await getDatabaseClient();
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.ACTION);

    await db.execute({
      sql: `INSERT INTO action_tokens (
        token, action_type, entity_id, entity_type, expires_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        token,
        actionType,
        targetId,
        'ticket',
        expiresAt.toISOString(),
        JSON.stringify({ email })
      ],
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
    const db = await getDatabaseClient();

    const result = await db.execute({
      sql: `SELECT * FROM access_tokens
            WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now')) AND revoked_at IS NULL`,
      args: [token],
    });

    if (result.rows.length === 0) {
      return { valid: false, error: "Invalid or expired access token" };
    }

    const tokenRecord = result.rows[0];
    const metadata = tokenRecord.metadata ? JSON.parse(tokenRecord.metadata) : {};

    return {
      valid: true,
      transactionId: tokenRecord.entity_id,
      email: metadata.email,
    };
  }

  /**
   * Validate action token (single-use)
   */
  async validateActionToken(token, expectedAction, targetId) {
    const db = await getDatabaseClient();

    const result = await db.execute({
      sql: `SELECT * FROM action_tokens
            WHERE token = ?
            AND action_type = ?
            AND entity_id = ?
            AND used_at IS NULL
            AND expires_at > datetime('now')`,
      args: [token, expectedAction, targetId],
    });

    if (result.rows.length === 0) {
      return {
        valid: false,
        error: "Invalid, expired, or already used action token",
      };
    }

    const tokenRecord = result.rows[0];
    const metadata = tokenRecord.metadata ? JSON.parse(tokenRecord.metadata) : {};

    // Mark as used
    await db.execute({
      sql: `UPDATE action_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [tokenRecord.id],
    });

    return {
      valid: true,
      email: metadata.email,
      actionType: tokenRecord.action_type,
      targetId: tokenRecord.entity_id,
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
    const db = await getDatabaseClient();
    const results = await Promise.all([
      db.execute({
        sql: `DELETE FROM access_tokens WHERE expires_at <= datetime('now')`,
      }),
      db.execute({
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
    const db = await getDatabaseClient();
    const [accessStats, actionStats] = await Promise.all([
      db.execute({
        sql: `SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as valid,
                COUNT(CASE WHEN revoked_at IS NOT NULL THEN 1 END) as revoked
              FROM access_tokens`,
      }),
      db.execute({
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
    const db = await getDatabaseClient();
    await Promise.all([
      db.execute({
        sql: `UPDATE access_tokens SET expires_at = datetime('now') WHERE entity_id = ?`,
        args: [transactionId],
      }),
      db.execute({
        sql: `UPDATE action_tokens SET expires_at = datetime('now') WHERE entity_id = ?`,
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
    const db = await getDatabaseClient();
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Use parameterized queries to prevent SQL injection
    // Email is stored in metadata JSON for both access_tokens and action_tokens
    let sql, args;
    if (tokenType === "access") {
      sql =
        "SELECT COUNT(*) as count FROM access_tokens WHERE json_extract(metadata, '$.email') = ? AND created_at > ?";
      args = [email, since.toISOString()];
    } else {
      sql =
        "SELECT COUNT(*) as count FROM action_tokens WHERE json_extract(metadata, '$.email') = ? AND created_at > ?";
      args = [email, since.toISOString()];
    }

    const result = await db.execute({ sql, args });

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
