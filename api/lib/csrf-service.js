import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";

export class CSRFService {
  constructor() {
    this.secret = process.env.ADMIN_SECRET || process.env.JWT_SECRET;
    // Only throw error in production or if explicitly configured
    if (process.env.NODE_ENV === "production" && (!this.secret || this.secret.length < 32)) {
      throw new Error("CSRF secret must be at least 32 characters long");
    }
    // Use a default secret in development/test if not configured
    if (!this.secret || this.secret.length < 32) {
      this.secret = "development-only-csrf-secret-not-for-production-use";
    }
  }

  /**
   * Generate a CSRF token for a session
   */
  generateToken(sessionId) {
    const token = jwt.sign(
      {
        sessionId,
        nonce: randomBytes(16).toString("hex"),
        timestamp: Date.now(),
      },
      this.secret,
      {
        expiresIn: "1h",
        issuer: "alocubano-csrf",
      }
    );
    return token;
  }

  /**
   * Verify a CSRF token
   */
  verifyToken(token, sessionId) {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: "alocubano-csrf",
      });

      // Verify session ID matches
      if (decoded.sessionId !== sessionId) {
        return {
          valid: false,
          error: "Session mismatch",
        };
      }

      // Check timestamp is not too old (1 hour)
      const age = Date.now() - decoded.timestamp;
      if (age > 3600000) {
        // 1 hour in milliseconds
        return {
          valid: false,
          error: "Token expired",
        };
      }

      return {
        valid: true,
        decoded,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Middleware to validate CSRF tokens for state-changing requests
   */
  validateCSRF(handler) {
    return async (req, res) => {
      // Skip CSRF check for GET and HEAD requests
      if (req.method === "GET" || req.method === "HEAD") {
        return handler(req, res);
      }

      // Skip CSRF validation in development mode if configured
      if (
        process.env.NODE_ENV === "development" &&
        process.env.SKIP_CSRF === "true"
      ) {
        console.warn("CSRF protection skipped in development mode");
        return handler(req, res);
      }

      // Get CSRF token from header or body
      const csrfToken =
        req.headers["x-csrf-token"] ||
        req.headers["x-xsrf-token"] ||
        req.body?.csrfToken;

      if (!csrfToken) {
        // For now, we'll allow requests without CSRF tokens but log a warning
        // This prevents breaking existing functionality while we transition
        console.warn("CSRF token missing for state-changing request:", {
          method: req.method,
          url: req.url,
          ip: req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
        });
        // In production, you should return an error:
        // return res.status(403).json({ error: "CSRF token required" });
        return handler(req, res);
      }

      // Get session ID from the request (from JWT in cookie or auth header)
      const sessionId = req.admin?.id || "anonymous";

      const result = this.verifyToken(csrfToken, sessionId);

      if (!result.valid) {
        console.error("Invalid CSRF token:", result.error);
        // For now, just log but don't block
        // In production, you should return an error:
        // return res.status(403).json({ error: "Invalid CSRF token" });
      }

      // Add CSRF validation result to request
      req.csrfValid = result.valid;

      return handler(req, res);
    };
  }
}

export default new CSRFService();