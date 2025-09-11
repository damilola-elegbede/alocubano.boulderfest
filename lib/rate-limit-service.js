/**
 * Rate limiting service for API endpoints
 * Prevents brute force attacks and abuse
 */

import { isTestEnvironment, isFeatureEnabled } from './utils/environment-detector.js';

// In-memory storage for rate limits (use Redis in production)
const rateLimitMap = new Map();
const failedAttemptsMap = new Map();

export class RateLimitService {
  constructor() {
    // SECURITY: Use centralized environment detection
    this.isTestEnvironment = isFeatureEnabled('rate-limit-bypass') && 
                            process.env.TEST_RATE_LIMITING !== 'true';
    
    // Log environment detection for audit trail
    if (this.isTestEnvironment) {
      console.log('[RateLimitService] Test environment detected - using relaxed limits');
    }
    
    // Configuration
    this.windowMs = 60000; // 1 minute window
    this.maxRequests = 100; // Max requests per window
    this.loginMaxAttempts = 5; // Keep normal limits for testing
    this.lockoutDuration = this.isTestEnvironment ? 3000 : 900000; // 3 seconds vs 15 minutes lockout
  }

  /**
   * Get client identifier from request
   */
  getClientId(req) {
    // Handle both req object and headers directly
    const headers = req.headers || req;

    // Handle case-insensitive header lookup for x-forwarded-for
    const forwardedFor =
      headers["x-forwarded-for"] ||
      headers["X-Forwarded-For"] ||
      headers["X-FORWARDED-FOR"];

    return (
      forwardedFor?.split(",")[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(req, customLimit = null) {
    const clientId = this.getClientId(req);
    const limit = customLimit || this.maxRequests;
    const now = Date.now();

    const record = rateLimitMap.get(clientId);

    if (!record) {
      rateLimitMap.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return false;
    }

    if (now > record.resetTime) {
      rateLimitMap.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return false;
    }

    record.count++;
    return record.count > limit;
  }

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(clientId) {
    // Bypass rate limiting in test environments for smoother E2E testing
    if (this.isTestEnvironment) {
      return {
        attemptsRemaining: 999,
        isLocked: false,
      };
    }
    
    const now = Date.now();
    const record = failedAttemptsMap.get(clientId) || {
      attempts: 0,
      lastAttempt: now,
      lockedUntil: 0,
    };

    record.attempts++;
    record.lastAttempt = now;

    if (record.attempts >= this.loginMaxAttempts) {
      record.lockedUntil = now + this.lockoutDuration;
    }

    failedAttemptsMap.set(clientId, record);

    return {
      attemptsRemaining: Math.max(0, this.loginMaxAttempts - record.attempts),
      isLocked: record.lockedUntil > now,
    };
  }

  /**
   * Check if client is locked out
   */
  isLockedOut(clientId) {
    // Never lock out in test environments
    if (this.isTestEnvironment) {
      return false;
    }
    
    const record = failedAttemptsMap.get(clientId);
    if (!record) return false;

    const now = Date.now();
    if (now > record.lockedUntil) {
      // Reset after lockout expires
      failedAttemptsMap.delete(clientId);
      return false;
    }

    return record.lockedUntil > now;
  }

  /**
   * Get remaining lockout time
   */
  getRemainingLockoutTime(clientId) {
    // No lockout time in test environments
    if (this.isTestEnvironment) {
      return 0;
    }
    
    const record = failedAttemptsMap.get(clientId);
    if (!record || !record.lockedUntil) return 0;

    const remaining = record.lockedUntil - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000)); // Return seconds
  }

  /**
   * Clear failed attempts for client
   */
  clearFailedAttempts(clientId) {
    failedAttemptsMap.delete(clientId);
  }

  /**
   * Clear attempts (alias for clearFailedAttempts)
   */
  clearAttempts(clientId) {
    return this.clearFailedAttempts(clientId);
  }

  /**
   * Check rate limit with configurable options
   * Used by analytics and other endpoints
   */
  async checkLimit(req, type = "general", options = {}) {
    const {
      maxAttempts = 100,
      windowMs = 60000, // 1 minute default
    } = options;

    const clientId = this.getClientId(req);
    const key = `${type}_${clientId}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);

    if (!record) {
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    if (now > record.resetTime) {
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    record.count++;
    const isAllowed = record.count <= maxAttempts;
    const remaining = Math.max(0, maxAttempts - record.count);
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);

    return {
      allowed: isAllowed,
      remaining,
      retryAfter: isAllowed ? null : retryAfter,
    };
  }

  /**
   * Clean up old records (run periodically)
   */
  cleanup() {
    const now = Date.now();

    // Clean rate limits
    for (const [clientId, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(clientId);
      }
    }

    // Clean failed attempts
    for (const [clientId, record] of failedAttemptsMap.entries()) {
      if (now > record.lockedUntil && record.lockedUntil > 0) {
        failedAttemptsMap.delete(clientId);
      }
    }
  }

  /**
   * Clear all rate limits - for test environments only
   */
  clearAll() {
    if (this.isTestEnvironment || process.env.NODE_ENV === 'test') {
      rateLimitMap.clear();
      failedAttemptsMap.clear();
      return true;
    }
    return false;
  }
}

// Lazy singleton pattern - don't create instance during import
let rateLimitInstance = null;

/**
 * Get or create the RateLimitService singleton instance
 * Uses lazy initialization to prevent import-time issues
 */
export function getRateLimitService() {
  if (!rateLimitInstance) {
    rateLimitInstance = new RateLimitService();

    // DISABLED for Vercel serverless - setInterval not supported
    // Run cleanup every 5 minutes
    // setInterval(() => {
    //   rateLimitInstance.cleanup();
    // }, 300000);
  }
  return rateLimitInstance;
}

// Export default as the getter function for backward compatibility
// This ensures the module can be imported without execution
export default { getRateLimitService };