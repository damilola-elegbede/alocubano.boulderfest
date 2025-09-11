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
      console.log("[Auth] Starting auth service initialization...");
      console.log("[Auth] Environment:", {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        CI: process.env.CI,
        E2E_TEST_MODE: process.env.E2E_TEST_MODE
      });

      // Check for ADMIN_SECRET
      if (!process.env.ADMIN_SECRET) {
        console.error("[Auth] ADMIN_SECRET not found in environment variables");
        throw new Error("❌ FATAL: ADMIN_SECRET not configured");
      }

      this.sessionSecret = process.env.ADMIN_SECRET;
      console.log("[Auth] ADMIN_SECRET loaded, length:", this.sessionSecret.length);
      
      // Session duration in milliseconds (not seconds!)
      // Default: 3600000ms = 1 hour - with robust parsing
      const parsed = parseInt(process.env.ADMIN_SESSION_DURATION || "3600000", 10);
      this.sessionDuration = Number.isFinite(parsed) && parsed > 0 ? parsed : 3600000;
      console.log("[Auth] Session duration set to:", this.sessionDuration, "ms");

      if (this.sessionSecret.length < 32) {
        console.error("[Auth] ADMIN_SECRET too short:", this.sessionSecret.length, "< 32");
        throw new Error("ADMIN_SECRET must be at least 32 characters long");
      }
      
      this.initialized = true;
      console.log("[Auth] Auth service initialization completed successfully");
      return this;
    } catch (error) {
      console.error("[Auth] Initialization failed:", error.message);
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
      console.log("[Auth] Password verification failed: No password provided");
      return false;
    }

    try {
      // Determine environment - Production ONLY when both NODE_ENV and VERCEL_ENV are production
      const isProduction = process.env.NODE_ENV === "production" && 
                          process.env.VERCEL_ENV === "production";
      
      const isNonProd = !isProduction;
      
      const testAdminPassword = process.env.TEST_ADMIN_PASSWORD;
      const adminPasswordHash = process.env.ADMIN_PASSWORD;

      // Log environment detection (for debugging)
      console.log("[Auth] Environment detection:", {
        isProduction,
        isNonProd,
        VERCEL_ENV: process.env.VERCEL_ENV,
        NODE_ENV: process.env.NODE_ENV,
        hasTestPassword: !!testAdminPassword,
        hasAdminPassword: !!adminPasswordHash,
        testPasswordLength: testAdminPassword?.length,
        adminPasswordHashPrefix: adminPasswordHash?.substring(0, 7) // Show hash type only
      });

      // Non-production: Use TEST_ADMIN_PASSWORD only
      if (isNonProd) {
        if (!testAdminPassword) {
          console.error("[Auth] Non-production environment but TEST_ADMIN_PASSWORD not configured");
          return false;
        }
        
        // Trim both passwords to handle whitespace issues
        const trimmedPassword = password.trim();
        const trimmedTestPassword = testAdminPassword.trim();
        
        console.log("[Auth] Non-prod password check:", {
          providedLength: trimmedPassword.length,
          expectedLength: trimmedTestPassword.length,
          firstCharMatch: trimmedPassword[0] === trimmedTestPassword[0],
          lastCharMatch: trimmedPassword[trimmedPassword.length - 1] === trimmedTestPassword[trimmedTestPassword.length - 1]
        });
        
        const matches = trimmedPassword === trimmedTestPassword;
        console.log("[Auth] TEST_ADMIN_PASSWORD verification result:", matches);
        return matches;
      }

      // Production: Use ADMIN_PASSWORD (bcrypt hash) only
      if (isProduction) {
        if (!adminPasswordHash) {
          console.error("[Auth] Production environment but ADMIN_PASSWORD not configured");
          return false;
        }

        // Validate it looks like a bcrypt hash
        if (!adminPasswordHash.startsWith("$2a$") && !adminPasswordHash.startsWith("$2b$")) {
          console.error("[Auth] ADMIN_PASSWORD does not appear to be a valid bcrypt hash");
          console.error("[Auth] Hash prefix:", adminPasswordHash.substring(0, 4));
          return false;
        }

        try {
          console.log("[Auth] Attempting bcrypt comparison in production");
          const result = await bcrypt.compare(password, adminPasswordHash);
          console.log("[Auth] Bcrypt verification result:", result);
          return result;
        } catch (bcryptError) {
          console.error("[Auth] Bcrypt comparison error:", bcryptError.message);
          console.error("[Auth] This usually means ADMIN_PASSWORD is not a valid bcrypt hash");
          return false;
        }
      }

      // Should not reach here, but log if we do
      console.error("[Auth] Unexpected state: neither production nor non-production logic executed");
      return false;
      
    } catch (error) {
      console.error("[Auth] Password verification error:", error.message);
      console.error("[Auth] Stack trace:", error.stack);
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