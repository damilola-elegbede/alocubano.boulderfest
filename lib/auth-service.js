import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

export class AuthService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.sessionSecret = null;
    this.sessionDuration = null;
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    // Fast path: already initialized
    if (this.initialized && this.sessionSecret) {
      return this;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      // Clear promise on error to allow retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      // Check for ADMIN_SECRET
      if (!process.env.ADMIN_SECRET) {
        throw new Error("❌ FATAL: ADMIN_SECRET not configured");
      }

      this.sessionSecret = process.env.ADMIN_SECRET;
      
      // Session duration in milliseconds (not seconds!)
      // Default: 3600000ms = 1 hour - with robust parsing
      const parsed = parseInt(process.env.ADMIN_SESSION_DURATION || "3600000", 10);
      this.sessionDuration = Number.isFinite(parsed) && parsed > 0 ? parsed : 3600000;

      if (this.sessionSecret.length < 32) {
        throw new Error("ADMIN_SECRET must be at least 32 characters long");
      }
      this.initialized = true;
      return this;
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Verify admin password with graceful fallback
   */
  async verifyPassword(password) {
    await this.ensureInitialized();

    if (!password || typeof password !== "string") {
      return false;
    }

    try {
      // Check environment to determine password verification strategy
      const isE2ETest = process.env.NODE_ENV === "test" || 
                        process.env.E2E_TEST_MODE === "true" ||
                        process.env.CI === "true" ||
                        process.env.VERCEL_ENV === "preview";
      
      const testAdminPassword = process.env.TEST_ADMIN_PASSWORD;
      const adminPasswordHash = process.env.ADMIN_PASSWORD;

      // In test environments, prefer TEST_ADMIN_PASSWORD if available
      if (isE2ETest && testAdminPassword) {
        // Plain text comparison for testing
        if (password === testAdminPassword) {
          return true;
        }
        // If TEST_ADMIN_PASSWORD doesn't match, still try bcrypt as fallback
      }

      // Fallback to bcrypt hashed password if available
      if (adminPasswordHash) {
        try {
          return await bcrypt.compare(password, adminPasswordHash);
        } catch (bcryptError) {
          console.error("Bcrypt comparison error:", bcryptError.message);
          // If bcrypt fails, password verification fails
          return false;
        }
      }

      // If neither TEST_ADMIN_PASSWORD nor ADMIN_PASSWORD is configured
      console.error("No admin password configured (neither TEST_ADMIN_PASSWORD nor ADMIN_PASSWORD)");
      return false;
      
    } catch (error) {
      console.error("Password verification error:", error.message);
      return false;
    }
  }

  /**
   * Create admin session token
   */
  async createSessionToken(adminId = "admin") {
    await this.ensureInitialized();
    
    return jwt.sign(
      {
        id: adminId,
        role: "admin",
        loginTime: Date.now(),
      },
      this.sessionSecret,
      {
        algorithm: "HS256",
        expiresIn: Math.floor(this.sessionDuration / 1000) + "s",
        issuer: "alocubano-admin",
      },
    );
  }

  /**
   * Verify session token
   */
  async verifySessionToken(token) {
    await this.ensureInitialized();
    
    try {
      const decoded = jwt.verify(token, this.sessionSecret, {
        algorithms: ["HS256"],
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
  async createSessionCookie(token) {
    await this.ensureInitialized();
    
    return serialize("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
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
   * Verify session from request (for session verification endpoint)
   */
  async verifySessionFromRequest(req) {
    const token = this.getSessionFromRequest(req);
    
    if (!token) {
      return {
        valid: false,
        error: "No session token provided",
      };
    }

    return await this.verifySessionToken(token);
  }

  /**
   * Middleware to require authentication
   */
  requireAuth(handler) {
    return async (req, res) => {
      try {
        await this.ensureInitialized();
        
        const token = this.getSessionFromRequest(req);

        if (!token) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const session = await this.verifySessionToken(token);

        if (!session.valid) {
          return res.status(401).json({ error: "Invalid or expired session" });
        }

        // Add admin info to request
        req.admin = session.admin;

        // Call the actual handler
        return handler(req, res);
      } catch (error) {
        console.error("Auth middleware error:", error);
        return res.status(500).json({ error: "Authentication service error" });
      }
    };
  }

  /**
   * Clear session cookie
   */
  clearSessionCookie() {
    return serialize("admin_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }

  /**
   * Check if MFA is required (optional in test environments)
   */
  isMFARequired() {
    // MFA is optional in test environments
    const isTestEnvironment = process.env.NODE_ENV === "test" || 
                             process.env.E2E_TEST_MODE === "true" ||
                             process.env.CI === "true" ||
                             process.env.VERCEL_ENV === "preview" ||
                             process.env.SKIP_MFA === "true";
    
    return !isTestEnvironment;
  }
}

// Create singleton instance
const authService = new AuthService();

// Export both the instance and the class
export default authService;
export { authService };