import { getDatabaseClient } from "./database.js";

/**
 * MFA Rate Limiting Service
 * Handles rate limiting specifically for MFA attempts to prevent brute force attacks
 */
export class MfaRateLimitService {
  constructor() {
    this.maxAttempts = parseInt(process.env.MFA_MAX_ATTEMPTS || "5");
    this.lockoutDuration = parseInt(process.env.MFA_LOCKOUT_DURATION || "15"); // minutes
    this.windowSize = parseInt(process.env.MFA_WINDOW_SIZE || "60"); // minutes
    this.cleanupInterval = parseInt(
      process.env.MFA_CLEANUP_INTERVAL || "3600000",
    ); // ms (1 hour)
    this.cleanupTimer = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    if (this.initialized && this.db) {
      return this;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      this.initializationPromise = null;
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      // In integration test mode, use the test isolation manager's database
      if (process.env.INTEGRATION_TEST_MODE === 'true') {
        try {
          const { getTestIsolationManager } = await import('./test-isolation-manager.js');
          const isolationManager = getTestIsolationManager();
          this.db = await isolationManager.getScopedDatabaseClient();
        } catch (error) {
          console.warn('[MfaRateLimitService] Failed to get test database, falling back to standard database:', error.message);
          this.db = await getDatabaseClient();
        }
      } else {
        this.db = await getDatabaseClient();
      }

      if (!this.db) {
        throw new Error('Failed to get database client - db is null');
      }

      this.initialized = true;
      return this;
    } catch (error) {
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Check if admin/IP combination is rate limited
   */
  async checkRateLimit(adminId, ipAddress) {
    await this.ensureInitialized();
    const now = new Date();

    try {
      // Get current rate limit record
      const result = await this.db.execute({
        sql: `SELECT attempt_count, locked_until, first_attempt_at, last_attempt_at 
              FROM admin_mfa_rate_limits 
              WHERE admin_id = ? AND ip_address = ?`,
        args: [adminId, ipAddress],
      });

      if (!result.rows[0]) {
        return {
          isLocked: false,
          attemptsRemaining: this.maxAttempts,
          remainingTime: 0,
        };
      }

      const record = result.rows[0];

      // Check if still locked
      if (record.locked_until && new Date(record.locked_until) > now) {
        const remainingTime = Math.ceil(
          (new Date(record.locked_until) - now) / 60000,
        );
        return {
          isLocked: true,
          attemptsRemaining: 0,
          remainingTime,
        };
      }

      // Check if window has expired (reset attempts)
      const firstAttemptTime = new Date(record.first_attempt_at);
      const windowExpired =
        now - firstAttemptTime > this.windowSize * 60 * 1000;

      if (windowExpired) {
        // Clear expired attempts
        await this.clearAttempts(adminId, ipAddress);
        return {
          isLocked: false,
          attemptsRemaining: this.maxAttempts,
          remainingTime: 0,
        };
      }

      // Check if at max attempts
      if (record.attempt_count >= this.maxAttempts) {
        // Lock the account
        const lockoutEnd = new Date(
          now.getTime() + this.lockoutDuration * 60 * 1000,
        );

        await this.db.execute({
          sql: `UPDATE admin_mfa_rate_limits
                SET locked_until = ?
                WHERE admin_id = ? AND ip_address = ?`,
          args: [lockoutEnd.toISOString(), adminId, ipAddress],
        });

        return {
          isLocked: true,
          attemptsRemaining: 0,
          remainingTime: this.lockoutDuration,
        };
      }

      return {
        isLocked: false,
        attemptsRemaining: this.maxAttempts - record.attempt_count,
        remainingTime: 0,
      };
    } catch (error) {
      console.error("Error checking MFA rate limit:", error);
      // Default to allowing access if rate limiting fails
      return {
        isLocked: false,
        attemptsRemaining: this.maxAttempts,
        remainingTime: 0,
      };
    }
  }

  /**
   * Record a failed MFA attempt
   */
  async recordFailedAttempt(adminId, ipAddress) {
    await this.ensureInitialized();

    try {
      const now = new Date();

      // Try to update existing record
      const updateResult = await this.db.execute({
        sql: `UPDATE admin_mfa_rate_limits 
              SET attempt_count = attempt_count + 1, 
                  last_attempt_at = ? 
              WHERE admin_id = ? AND ip_address = ?`,
        args: [now.toISOString(), adminId, ipAddress],
      });

      // If no record exists, create one
      if (updateResult.changes === 0) {
        await this.db.execute({
          sql: `INSERT INTO admin_mfa_rate_limits 
                (admin_id, ip_address, attempt_count, first_attempt_at, last_attempt_at) 
                VALUES (?, ?, 1, ?, ?)`,
          args: [adminId, ipAddress, now.toISOString(), now.toISOString()],
        });
      }

      // Get updated record to return current state
      const result = await this.db.execute({
        sql: `SELECT attempt_count FROM admin_mfa_rate_limits 
              WHERE admin_id = ? AND ip_address = ?`,
        args: [adminId, ipAddress],
      });

      const attemptCount = result.rows[0]?.attempt_count || 1;
      const isLocked = attemptCount >= this.maxAttempts;

      return {
        attemptsRemaining: Math.max(0, this.maxAttempts - attemptCount),
        isLocked,
      };
    } catch (error) {
      console.error("Error recording MFA failed attempt:", error);
      return {
        attemptsRemaining: this.maxAttempts - 1,
        isLocked: false,
      };
    }
  }

  /**
   * Clear failed attempts for admin/IP combination
   */
  async clearAttempts(adminId, ipAddress) {
    await this.ensureInitialized();

    try {
      await this.db.execute({
        sql: `DELETE FROM admin_mfa_rate_limits 
              WHERE admin_id = ? AND ip_address = ?`,
        args: [adminId, ipAddress],
      });

      return true;
    } catch (error) {
      console.error("Error clearing MFA attempts:", error);
      return false;
    }
  }

  /**
   * Get rate limit statistics for monitoring
   */
  async getStatistics(adminId = null) {
    await this.ensureInitialized();

    try {
      const baseQuery = `
        SELECT 
          COUNT(*) as total_records,
          SUM(CASE WHEN locked_until > datetime('now') THEN 1 ELSE 0 END) as currently_locked,
          AVG(attempt_count) as avg_attempts,
          MAX(attempt_count) as max_attempts,
          COUNT(DISTINCT ip_address) as unique_ips
        FROM admin_mfa_rate_limits
      `;

      const args = [];
      let sql = baseQuery;

      if (adminId) {
        sql += " WHERE admin_id = ?";
        args.push(adminId);
      }

      const result = await this.db.execute({
        sql,
        args,
      });

      return (
        result.rows[0] || {
          total_records: 0,
          currently_locked: 0,
          avg_attempts: 0,
          max_attempts: 0,
          unique_ips: 0,
        }
      );
    } catch (error) {
      console.error("Error getting MFA rate limit statistics:", error);
      return null;
    }
  }

  /**
   * Get locked accounts with details
   */
  async getLockedAccounts() {
    await this.ensureInitialized();

    try {
      const result = await this.db.execute({
        sql: `SELECT admin_id, ip_address, attempt_count, locked_until, 
                     first_attempt_at, last_attempt_at
              FROM admin_mfa_rate_limits 
              WHERE locked_until > datetime('now')
              ORDER BY locked_until DESC`,
        args: [],
      });

      return result.rows.map((row) => ({
        adminId: row.admin_id,
        ipAddress: row.ip_address,
        attemptCount: row.attempt_count,
        lockedUntil: row.locked_until,
        firstAttemptAt: row.first_attempt_at,
        lastAttemptAt: row.last_attempt_at,
        remainingTime: Math.ceil(
          (new Date(row.locked_until) - new Date()) / 60000,
        ),
      }));
    } catch (error) {
      console.error("Error getting locked MFA accounts:", error);
      return [];
    }
  }

  /**
   * Manually unlock an admin/IP combination (emergency use)
   */
  async emergencyUnlock(adminId, ipAddress) {
    await this.ensureInitialized();

    try {
      const result = await this.db.execute({
        sql: `UPDATE admin_mfa_rate_limits 
              SET locked_until = NULL, attempt_count = 0, 
                  first_attempt_at = datetime('now'),
                  last_attempt_at = datetime('now')
              WHERE admin_id = ? AND ip_address = ?`,
        args: [adminId, ipAddress],
      });

      return result.changes > 0;
    } catch (error) {
      console.error("Error performing emergency MFA unlock:", error);
      return false;
    }
  }

  /**
   * Start periodic cleanup of expired records
   */
  startCleanup() {
    // Guard against multiple intervals
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpiredRecords();
    }, this.cleanupInterval);
  }

  /**
   * Stop periodic cleanup timer
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Close the service and clean up resources
   */
  close() {
    this.stopCleanup();
  }

  /**
   * Clean up old rate limit records
   */
  async cleanupExpiredRecords() {
    await this.ensureInitialized();

    try {
      // Remove records older than 24 hours that aren't locked
      const cleanupTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const result = await this.db.execute({
        sql: `DELETE FROM admin_mfa_rate_limits 
              WHERE last_attempt_at < ? 
              AND (locked_until IS NULL OR locked_until < datetime('now'))`,
        args: [cleanupTime.toISOString()],
      });

      if (result.changes > 0) {
        console.log(
          `Cleaned up ${result.changes} expired MFA rate limit records`,
        );
      }
    } catch (error) {
      console.error("Error cleaning up MFA rate limit records:", error);
    }
  }
}

// Create and export singleton instance
const mfaRateLimitService = new MfaRateLimitService();

export function getMfaRateLimitService() {
  return mfaRateLimitService;
}

export default mfaRateLimitService;
