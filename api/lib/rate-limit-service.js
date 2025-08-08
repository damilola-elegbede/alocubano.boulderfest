/**
 * Rate Limiting Service
 * Provides database-backed rate limiting for authentication and API endpoints
 */

import { getDatabase } from "./database.js";

class RateLimitService {
  constructor() {
    // Default configuration - can be overridden by environment variables
    this.defaultConfig = {
      maxAttempts: 5,
      lockoutDuration: 30 * 60 * 1000, // 30 minutes in milliseconds
      cleanupInterval: 60 * 60 * 1000, // 1 hour in milliseconds
    };
  }

  /**
   * Get configuration from environment variables with fallbacks
   */
  getConfig() {
    return {
      maxAttempts: parseInt(process.env.ADMIN_MAX_LOGIN_ATTEMPTS || this.defaultConfig.maxAttempts),
      lockoutDuration: parseInt(process.env.ADMIN_LOCKOUT_DURATION_MS || this.defaultConfig.lockoutDuration),
      cleanupInterval: parseInt(process.env.ADMIN_CLEANUP_INTERVAL_MS || this.defaultConfig.cleanupInterval),
    };
  }

  /**
   * Check if IP address is rate limited
   * @param {string} ipAddress - Client IP address
   * @returns {Promise<{isLocked: boolean, remainingTime?: number, attemptsRemaining?: number}>}
   */
  async checkRateLimit(ipAddress) {
    const db = getDatabase();
    const config = this.getConfig();

    try {
      // First, clean up expired attempts
      await this.cleanupExpiredAttempts();

      // Get current attempts for this IP
      const result = await db.execute({
        sql: `SELECT attempt_count, locked_until, last_attempt_at 
              FROM login_attempts 
              WHERE ip_address = ? AND (locked_until IS NULL OR locked_until > CURRENT_TIMESTAMP)`,
        args: [ipAddress]
      });

      if (result.rows.length === 0) {
        // No current attempts, IP is not rate limited
        return {
          isLocked: false,
          attemptsRemaining: config.maxAttempts
        };
      }

      const attemptRecord = result.rows[0];
      const lockedUntil = attemptRecord.locked_until ? new Date(attemptRecord.locked_until) : null;
      const now = new Date();

      // Check if currently locked
      if (lockedUntil && lockedUntil > now) {
        const remainingTime = Math.ceil((lockedUntil - now) / 1000 / 60); // minutes
        return {
          isLocked: true,
          remainingTime
        };
      }

      // Check if max attempts reached but not yet locked
      if (attemptRecord.attempt_count >= config.maxAttempts) {
        // Lock the IP
        await this.lockIP(ipAddress);
        const remainingTime = Math.ceil(config.lockoutDuration / 1000 / 60);
        return {
          isLocked: true,
          remainingTime
        };
      }

      // IP is not locked, return remaining attempts
      return {
        isLocked: false,
        attemptsRemaining: config.maxAttempts - attemptRecord.attempt_count
      };

    } catch (error) {
      console.error('Rate limit check failed:', error);
      // In case of database error, allow the request but log the issue
      return {
        isLocked: false,
        attemptsRemaining: config.maxAttempts,
        error: 'Rate limit check failed'
      };
    }
  }

  /**
   * Record a failed login attempt
   * @param {string} ipAddress - Client IP address
   * @returns {Promise<{attemptsRemaining: number, isLocked: boolean}>}
   */
  async recordFailedAttempt(ipAddress) {
    const db = getDatabase();
    const config = this.getConfig();

    try {
      // Use INSERT OR REPLACE for SQLite UPSERT behavior
      await db.execute({
        sql: `INSERT OR REPLACE INTO login_attempts (ip_address, attempt_count, last_attempt_at, updated_at, first_attempt_at)
              VALUES (?, 
                      COALESCE((SELECT attempt_count + 1 FROM login_attempts WHERE ip_address = ? AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)), 1),
                      CURRENT_TIMESTAMP, 
                      CURRENT_TIMESTAMP,
                      COALESCE((SELECT first_attempt_at FROM login_attempts WHERE ip_address = ?), CURRENT_TIMESTAMP))`,
        args: [ipAddress, ipAddress, ipAddress]
      });

      // Get updated attempt count
      const result = await db.execute({
        sql: `SELECT attempt_count FROM login_attempts WHERE ip_address = ?`,
        args: [ipAddress]
      });

      const attemptCount = result.rows[0]?.attempt_count || 0;
      const attemptsRemaining = Math.max(0, config.maxAttempts - attemptCount);

      // Check if we need to lock the IP
      if (attemptCount >= config.maxAttempts) {
        await this.lockIP(ipAddress);
        return {
          attemptsRemaining: 0,
          isLocked: true
        };
      }

      return {
        attemptsRemaining,
        isLocked: false
      };

    } catch (error) {
      console.error('Failed to record login attempt:', error);
      throw new Error('Rate limiting service unavailable');
    }
  }

  /**
   * Lock an IP address
   * @param {string} ipAddress - Client IP address
   */
  async lockIP(ipAddress) {
    const db = getDatabase();
    const config = this.getConfig();

    try {
      const lockedUntil = new Date(Date.now() + config.lockoutDuration).toISOString();

      await db.execute({
        sql: `UPDATE login_attempts 
              SET locked_until = ?, updated_at = CURRENT_TIMESTAMP
              WHERE ip_address = ?`,
        args: [lockedUntil, ipAddress]
      });

      console.log(`IP ${ipAddress} locked until ${lockedUntil}`);
    } catch (error) {
      console.error('Failed to lock IP:', error);
      throw error;
    }
  }

  /**
   * Clear attempts for an IP (e.g., after successful login)
   * @param {string} ipAddress - Client IP address
   */
  async clearAttempts(ipAddress) {
    const db = getDatabase();

    try {
      await db.execute({
        sql: `DELETE FROM login_attempts WHERE ip_address = ?`,
        args: [ipAddress]
      });
    } catch (error) {
      console.error('Failed to clear login attempts:', error);
      // Don't throw - this is not critical for functionality
    }
  }

  /**
   * Clean up expired login attempts and locks
   */
  async cleanupExpiredAttempts() {
    const db = getDatabase();

    try {
      // Remove expired locks and old attempts (older than 24 hours)
      await db.execute({
        sql: `DELETE FROM login_attempts 
              WHERE (locked_until IS NOT NULL AND locked_until <= CURRENT_TIMESTAMP)
                 OR (last_attempt_at <= datetime('now', '-24 hours'))`,
        args: []
      });
    } catch (error) {
      console.error('Failed to cleanup expired attempts:', error);
      // Don't throw - this is maintenance, not critical
    }
  }

  /**
   * Get rate limiting statistics (for monitoring)
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    const db = getDatabase();

    try {
      const results = await db.batch([
        {
          sql: `SELECT COUNT(*) as total_attempts FROM login_attempts`,
          args: []
        },
        {
          sql: `SELECT COUNT(*) as locked_ips FROM login_attempts WHERE locked_until > CURRENT_TIMESTAMP`,
          args: []
        },
        {
          sql: `SELECT COUNT(*) as expired_locks FROM login_attempts WHERE locked_until <= CURRENT_TIMESTAMP AND locked_until IS NOT NULL`,
          args: []
        }
      ]);

      return {
        totalAttempts: results[0].rows[0]?.total_attempts || 0,
        lockedIPs: results[1].rows[0]?.locked_ips || 0,
        expiredLocks: results[2].rows[0]?.expired_locks || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get rate limiting stats:', error);
      return {
        error: 'Failed to retrieve stats',
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
let rateLimitServiceInstance = null;

/**
 * Get rate limit service singleton instance
 * @returns {RateLimitService} Rate limit service instance
 */
export function getRateLimitService() {
  if (!rateLimitServiceInstance) {
    rateLimitServiceInstance = new RateLimitService();
  }
  return rateLimitServiceInstance;
}

export { RateLimitService };