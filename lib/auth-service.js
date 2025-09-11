import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

// CI optimization constants
const CI_BCRYPT_TIMEOUT = 5000; // 5 second timeout for CI environments
const CI_JWT_TIMEOUT = 2000; // 2 second timeout for JWT operations in CI

export class AuthService {
  constructor() {
    // Defer initialization - don't throw errors during construction
    this.initialized = false;
    this.initError = null;
    this.sessionSecret = null;
    this.sessionDuration = null;
    
    // Environment detection - distinguish E2E tests from regular environments
    this.isE2ETest = process.env.E2E_TEST_MODE === 'true';  // Only true when running E2E tests
    this.isCI = process.env.CI === 'true';
    this.isTest = process.env.NODE_ENV === 'test';
    this.isCIOrTest = this.isCI || this.isTest;
    
    // Circuit breaker for failing fast in CI
    this.circuitBreakerState = 'closed'; // closed, open, half-open
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.circuitBreakerTimeout = 30000; // 30 seconds
  }

  /**
   * Circuit breaker pattern for failing fast in CI
   */
  isCircuitOpen() {
    if (this.circuitBreakerState === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.circuitBreakerTimeout) {
        this.circuitBreakerState = 'half-open';
        this.failureCount = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.circuitBreakerState = 'closed';
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    // Open circuit after 3 failures in CI environments
    if (this.isCIOrTest && this.failureCount >= 3) {
      this.circuitBreakerState = 'open';
    }
  }

  /**
   * Initialize the service with environment variables
   * This is called lazily when the service is first used
   */
  initialize() {
    if (this.initialized) return;
    
    // Fast path for CI environments - fail fast if circuit is open
    if (this.isCIOrTest && this.isCircuitOpen()) {
      throw new Error("Service circuit breaker is open - failing fast for CI");
    }
    
    try {
      // Validate ADMIN_SECRET configuration
      if (!process.env.ADMIN_SECRET) {
        throw new Error("❌ FATAL: ADMIN_SECRET secret not configured");
      }

      this.sessionSecret = process.env.ADMIN_SECRET;
      
      if (this.sessionSecret.length < 32) {
        throw new Error("ADMIN_SECRET must be at least 32 characters long");
      }
      
      // Session duration in milliseconds (not seconds!)
      // Default: 3600000ms = 1 hour, but shorter for E2E test environments
      const defaultDuration = this.isE2ETest ? "600000" : "3600000"; // 10 minutes for E2E tests, 1 hour for production/Vercel
      this.sessionDuration = parseInt(
        process.env.ADMIN_SESSION_DURATION || defaultDuration,
      );
      
      this.initialized = true;
      this.recordSuccess();
    } catch (error) {
      this.initError = error;
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Ensure service is initialized before use
   */
  ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
    }
    if (this.initError) {
      throw this.initError;
    }
  }

  /**
   * Timeout wrapper for async operations in CI environments
   */
  withTimeout(promise, timeoutMs, operation = 'operation') {
    if (!this.isCIOrTest) {
      return promise; // No timeout in production
    }

    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${operation} timed out after ${timeoutMs}ms in CI environment`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Verify admin password
   */
  async verifyPassword(password) {
    // Initialize lazily when needed
    this.ensureInitialized();
    
    // Circuit breaker check for CI environments
    if (this.isCIOrTest && this.isCircuitOpen()) {
      throw new Error("Auth service circuit breaker is open - failing fast for CI");
    }
    
    // Fail immediately if ADMIN_PASSWORD is not configured
    if (!process.env.ADMIN_PASSWORD) {
      this.recordFailure();
      throw new Error("❌ FATAL: ADMIN_PASSWORD secret not configured");
    }

    const adminPasswordHash = process.env.ADMIN_PASSWORD;
    const testAdminPassword = process.env.TEST_ADMIN_PASSWORD;

    if (!password || typeof password !== "string") {
      // Invalid password input
      return false;
    }

    try {
      // When running E2E tests specifically, use TEST_ADMIN_PASSWORD
      if (this.isE2ETest && testAdminPassword) {
        // E2E tests should use plain text TEST_ADMIN_PASSWORD for speed
        const isValid = password === testAdminPassword;
        this.recordSuccess();
        return isValid;
      }

      // For all other environments (production, Vercel preview, development),
      // use bcrypt hashed ADMIN_PASSWORD
      const bcryptPromise = bcrypt.compare(password, adminPasswordHash);
      const result = await this.withTimeout(
        bcryptPromise, 
        this.isE2ETest ? CI_BCRYPT_TIMEOUT : 10000,  // Shorter timeout for E2E, normal for others
        'bcrypt password verification'
      );
      
      this.recordSuccess();
      return result;
    } catch (error) {
      // Re-throw fatal configuration errors immediately
      if (error.message.includes("❌ FATAL:")) {
        throw error;
      }
      
      // Record failure for timeout and other errors in CI
      if (this.isCIOrTest) {
        this.recordFailure();
      }
      
      // Handle bcrypt comparison errors gracefully
      if (error.message.includes('timed out')) {
        console.warn(`Auth service: ${error.message}`);
        return false; // Treat timeout as auth failure for security
      }
      
      return false;
    }
  }

  /**
   * Create admin session token
   */
  createSessionToken(adminId = "admin") {
    this.ensureInitialized();
    
    try {
      const token = jwt.sign(
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
      
      this.recordSuccess();
      return token;
    } catch (error) {
      if (this.isCIOrTest) {
        this.recordFailure();
      }
      throw error;
    }
  }

  /**
   * Verify session token
   */
  verifySessionToken(token) {
    this.ensureInitialized();
    
    // Circuit breaker check for CI environments
    if (this.isCIOrTest && this.isCircuitOpen()) {
      return {
        valid: false,
        error: "Auth service circuit breaker is open",
      };
    }
    
    try {
      const decoded = jwt.verify(token, this.sessionSecret, {
        issuer: "alocubano-admin",
      });

      this.recordSuccess();
      return {
        valid: true,
        admin: decoded,
      };
    } catch (error) {
      if (this.isCIOrTest) {
        this.recordFailure();
      }
      
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
    this.ensureInitialized();
    
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
    // This method doesn't need initialization
    
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
      // Fast fail for CI environments if circuit is open
      if (this.isCIOrTest && this.isCircuitOpen()) {
        console.warn("Auth service circuit breaker is open - failing fast for CI");
        return res.status(503).json({ 
          error: "Service temporarily unavailable",
          details: "Circuit breaker is open"
        });
      }
      
      try {
        this.ensureInitialized();
      } catch (error) {
        console.error("AuthService initialization failed:", error);
        
        if (this.isCIOrTest) {
          this.recordFailure();
        }
        
        return res.status(503).json({ 
          error: "Service temporarily unavailable",
          details: process.env.NODE_ENV === "development" ? error.message : undefined
        });
      }
      
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
    // This method doesn't need initialization
    
    return serialize("admin_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }
}

// Lazy singleton pattern - don't create instance during import
let authServiceInstance = null;

/**
 * Get or create the AuthService singleton instance
 * Uses lazy initialization to prevent import-time failures
 */
export function getAuthService() {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}

/**
 * Verify admin token - wrapper for compatibility
 * Used by audit-log.js and other security components
 */
export async function verifyAdminToken(req) {
  try {
    const authService = getAuthService();
    
    // Fast fail for CI environments if circuit is open
    if (authService.isCIOrTest && authService.isCircuitOpen()) {
      console.warn("Admin token verification: circuit breaker is open - failing fast for CI");
      return {
        authorized: false,
        reason: "Service circuit breaker is open"
      };
    }
    
    authService.ensureInitialized();
    
    const token = authService.getSessionFromRequest(req);
    
    if (!token) {
      return {
        authorized: false,
        reason: "No authentication token provided"
      };
    }
    
    const session = authService.verifySessionToken(token);
    
    if (!session.valid) {
      return {
        authorized: false,
        reason: session.error || "Invalid or expired session"
      };
    }
    
    return {
      authorized: true,
      admin: session.admin,
      token: token
    };
  } catch (error) {
    console.error("Admin token verification failed:", error);
    
    // Record failure for CI tracking
    const authService = getAuthService();
    if (authService.isCIOrTest) {
      authService.recordFailure();
    }
    
    return {
      authorized: false,
      reason: "Service initialization failed"
    };
  }
}

// Export default as the getter function for backward compatibility
// This ensures the module can be imported without throwing errors
export default {
  getAuthService,
  verifyAdminToken
};