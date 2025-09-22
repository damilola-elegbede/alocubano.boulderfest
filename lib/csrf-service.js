import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";

export class CSRFService {
  constructor() {
    this.secret = process.env.ADMIN_SECRET || process.env.JWT_SECRET;
    // Only throw error in production or if explicitly configured
    if (
      process.env.NODE_ENV === "production" &&
      (!this.secret || this.secret.length < 32)
    ) {
      throw new Error("CSRF secret must be at least 32 characters long");
    }
    // Use a placeholder that clearly indicates configuration is needed
    if (!this.secret || this.secret.length < 32) {
      // In development/test, use a truly random secret generated at startup
      // This ensures each dev environment has a unique, non-forgeable secret
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) {
        // Generate a truly random secret for development (48 bytes = ~64 chars base64)
        // This prevents token reuse across different development machines
        this.secret = randomBytes(48).toString("base64");
      } else {
        throw new Error("CSRF secret must be configured in production");
      }
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
      },
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
        algorithms: ["HS256"],
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
  validateCSRF(handler, options = {}) {
    const {
      allowedOrigins = [],
      skipOriginValidation = false,
      requireHttps = process.env.NODE_ENV === "production"
    } = options;

    console.log(`🛡️  [CSRF] Creating validateCSRF middleware...`);

    return async (req, res) => {
      console.log(`🛡️  [CSRF] Executing validateCSRF for ${req.method} ${req.url}`);

      try {
        // Skip CSRF check for GET, HEAD, and OPTIONS requests
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
          console.log(`🛡️  [CSRF] Skipping CSRF check for ${req.method} request`);
          return handler(req, res);
        }

        console.log(`🛡️  [CSRF] Processing ${req.method} request - CSRF validation required`);

        // Skip CSRF validation in development mode if configured
        if (
          process.env.NODE_ENV === "development" &&
          process.env.SKIP_CSRF === "true"
        ) {
          console.warn("🛡️  [CSRF] CSRF protection skipped in development mode");
          return handler(req, res);
        }

        // Validate request security in production
        if (requireHttps) {
          const isSecure = req.secure ||
            req.headers['x-forwarded-proto'] === 'https' ||
            req.connection?.encrypted;

          if (!isSecure) {
            console.error("🛡️  [CSRF] HTTPS required for CSRF-protected requests");
            return res.status(403).json({ error: "HTTPS required" });
          }
        }

        // Origin validation for additional security
        if (!skipOriginValidation && allowedOrigins.length > 0) {
          const origin = req.headers.origin || req.headers.referer;
          if (origin) {
            const isOriginAllowed = allowedOrigins.some(allowed => {
              try {
                const originUrl = new URL(origin);
                const allowedUrl = new URL(allowed);
                return originUrl.origin === allowedUrl.origin;
              } catch {
                return false;
              }
            });

            if (!isOriginAllowed) {
              console.error("🛡️  [CSRF] Request from unauthorized origin:", origin);
              return res.status(403).json({ error: "Unauthorized origin" });
            }
          }
        }

        // Get CSRF token from request
        const csrfToken =
          req.headers["x-csrf-token"] ||
          req.headers["x-xsrf-token"] ||
          req.body?.csrfToken;

        if (!csrfToken) {
          console.error("🛡️  [CSRF] CSRF token missing for state-changing request:", {
            method: req.method,
            url: req.url,
            ip: req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
          });
          return res.status(403).json({ error: "CSRF token required" });
        }

        // Get session ID from request
        const sessionId = req.admin?.id ||
          req.headers["x-session-id"] ||
          req.ip ||
          "anonymous";

        // Verify CSRF token
        const result = this.verifyToken(csrfToken, sessionId);

        if (!result.valid) {
          console.error("🛡️  [CSRF] Invalid CSRF token for request", req.url, result.error);
          return res.status(403).json({
            error: "Invalid CSRF token"
          });
        }

        // CSRF validation passed
        req.csrfValid = result.valid;
        req.csrfDecoded = result.decoded;

        return handler(req, res);

      } catch (error) {
        console.error(`💥 [CSRF] Error in validateCSRF:`, {
          message: error.message,
          stack: error.stack,
          url: req.url,
          method: req.method
        });
        return res.status(500).json({
          error: "CSRF validation service error"
        });
      }
    };
  }
}

export default new CSRFService();
