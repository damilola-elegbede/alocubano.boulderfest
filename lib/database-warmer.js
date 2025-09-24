/**
 * Database Connection Warmer
 * Proactively warms database connections to reduce cold start latency in serverless environments
 */

import { logger } from './logger.js';

class DatabaseWarmer {
  constructor() {
    this.warmupExecuted = false;
    this.warmupPromise = null;
    this.lastWarmup = 0;
    this.warmupInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Warm up database connection proactively
   * This is called at the module level to warm connections during cold starts
   */
  async warmConnection() {
    // Skip if already warmed recently
    if (this.warmupExecuted && Date.now() - this.lastWarmup < this.warmupInterval) {
      return;
    }

    // Skip in test environments
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Return existing warmup if in progress
    if (this.warmupPromise) {
      return this.warmupPromise;
    }

    this.warmupPromise = this._performWarmup();

    try {
      await this.warmupPromise;
      this.warmupExecuted = true;
      this.lastWarmup = Date.now();
    } catch (error) {
      // Don't fail the entire request if warmup fails
      logger.warn('Database warmup failed (non-critical):', error.message);
    } finally {
      this.warmupPromise = null;
    }
  }

  async _performWarmup() {
    const startTime = Date.now();

    try {
      // Dynamically import to avoid circular dependencies
      const { getDatabaseClient } = await import('./database.js');

      // Get a database client (this triggers initialization)
      const client = await getDatabaseClient();

      // Execute a simple query to warm the connection
      await client.execute('SELECT 1 as warmup');

      const duration = Date.now() - startTime;
      logger.log(`✅ Database connection warmed in ${duration}ms`);

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Database warmup failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Execute warmup in background (non-blocking)
   * This allows the request to continue while warming happens
   */
  warmInBackground() {
    // Don't wait for warmup to complete
    this.warmConnection().catch(error => {
      logger.debug('Background warmup failed:', error.message);
    });
  }
}

// Singleton instance
const warmer = new DatabaseWarmer();

// Export functions
export async function warmDatabaseConnection() {
  return warmer.warmConnection();
}

export function warmDatabaseInBackground() {
  warmer.warmInBackground();
}

// Auto-warm on module load for Vercel
if (process.env.VERCEL === '1' && process.env.NODE_ENV !== 'test') {
  // Warm connection in background on cold start
  warmer.warmInBackground();
}