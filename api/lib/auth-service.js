import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

export class AuthService {
  constructor() {
    // Fail immediately if ADMIN_SECRET is not configured
    if (!process.env.ADMIN_SECRET) {
      throw new Error("❌ FATAL: ADMIN_SECRET secret not configured");
    }

    this.sessionSecret = process.env.ADMIN_SECRET;
    // Session duration in milliseconds (not seconds!)
    // Default: 3600000ms = 1 hour
    this.sessionDuration = parseInt(
      process.env.ADMIN_SESSION_DURATION || "3600000",
    );

    if (this.sessionSecret.length < 32) {
      throw new Error("ADMIN_SECRET must be at least 32 characters long");
    }
  }

  /**
   * Verify admin password
   */
  async verifyPassword(password) {
    // Fail immediately if ADMIN_PASSWORD is not configured
    if (!process.env.ADMIN_PASSWORD) {
      throw new Error("❌ FATAL: ADMIN_PASSWORD secret not configured");
    }

    const adminPasswordHash = process.env.ADMIN_PASSWORD;
    const testAdminPassword = process.env.TEST_ADMIN_PASSWORD;

    if (!password || typeof password !== "string") {
      // Invalid password input
      return false;
    }

    try {
      // For E2E testing, support plain text TEST_ADMIN_PASSWORD
      const isE2ETest = process.env.NODE_ENV === "test" || 
                        process.env.E2E_TEST_MODE === "true" ||
                        process.env.CI === "true" ||
                        process.env.VERCEL_ENV === "preview";
      
      if (isE2ETest) {
        // Fail immediately if TEST_ADMIN_PASSWORD is not configured in test environments
        if (!testAdminPassword) {
          throw new Error("❌ FATAL: TEST_ADMIN_PASSWORD secret not configured");
        }
        
        if (password === testAdminPassword) {
          return true;
        }
      }

      // For production and development, use bcrypt hashed ADMIN_PASSWORD
      return await bcrypt.compare(password, adminPasswordHash);
    } catch (error) {
      // Re-throw fatal configuration errors immediately
      if (error.message.includes("❌ FATAL:")) {
        throw error;
      }
      // Handle bcrypt comparison errors gracefully
      return false;
    }
  }

  /**
   * Create admin session token
   */
  createSessionToken(adminId = "admin") {
    return jwt.sign(
      {
        id: adminId,
        role: "admin",
        loginTime: Date.now(),
      },
      this.sessionSecret,
      {
        expiresIn: Math.floor(this.sessionDuration / 1000) + "s",
        issuer: "alocubano-admin",
      },
    );
  }

  /**
   * Verify session token
   */
  verifySessionToken(token) {
    try {
      const decoded = jwt.verify(token, this.sessionSecret, {
        issuer: "alocubano-admin",
      });

      return {
        valid: true,
        admin: decoded,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Create session cookie
   */
  createSessionCookie(token) {
    return serialize("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: Math.floor(this.sessionDuration / 1000),
      path: "/",
    });
  }

  /**
   * Parse session from request
   */
  getSessionFromRequest(req) {
    // Check cookie first
    const cookies = parse(req.headers.cookie || "");
    if (cookies.admin_session) {
      return cookies.admin_session;
    }

    // Check Authorization header as fallback
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Middleware to require authentication
   */
  requireAuth(handler) {
    return async (req, res) => {
      const token = this.getSessionFromRequest(req);

      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const session = this.verifySessionToken(token);

      if (!session.valid) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }

      // Add admin info to request
      req.admin = session.admin;

      // Call the actual handler
      return handler(req, res);
    };
  }

  /**
   * Clear session cookie
   */
  clearSessionCookie() {
    return serialize("admin_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });
  }
}

export default new AuthService();
