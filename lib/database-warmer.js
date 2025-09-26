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
    this.warmupInterval = 3 * 60 * 1000; // Reduced to 3 minutes for serverless
    this.maxWarmupDuration = 15000; // 15 second timeout for warmup operations
    this.fastWarmupRetries = 2; // Quick retries for faster recovery
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
      // Add timeout protection to prevent 230+ second hangs
      const warmupOperation = this._executeWarmupWithTimeout();
      const result = await warmupOperation;

      const duration = Date.now() - startTime;
      logger.log(`✅ Database connection warmed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Database warmup failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  async _executeWarmupWithTimeout() {
    // Race between warmup operation and timeout to prevent hanging
    const warmupPromise = this._doWarmupOperation();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database warmup timed out after ${this.maxWarmupDuration}ms - preventing 230+ second hang`));
      }, this.maxWarmupDuration);
    });

    return Promise.race([warmupPromise, timeoutPromise]);
  }

  async _doWarmupOperation() {
    // Dynamically import to avoid circular dependencies
    const { getDatabaseClient } = await import('./database.js');

    // Multiple lightweight operations to establish a stable connection
    const client = await getDatabaseClient();

    // Fast connection validation queries
    await client.execute('SELECT 1 as warmup');

    // Verify batch operations work (important for Turso)
    await client.batch([
      { sql: 'SELECT 2 as batch_test', args: [] }
    ]);

    return true;
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

  /**
   * Fast warmup with exponential backoff retry logic to prevent long delays
   */
  async fastWarmup() {
    const startTime = Date.now();
    let attempt = 0;

    const tryWarmup = async (retryDelay = 200) => {
      try {
        attempt++;

        // Short timeout for each individual attempt
        const shortTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Fast warmup attempt ${attempt} timed out after 5 seconds`));
          }, 5000);
        });

        const warmupPromise = this._doWarmupOperation();
        await Promise.race([warmupPromise, shortTimeoutPromise]);

        const duration = Date.now() - startTime;
        logger.log(`✅ Fast database warmup succeeded in ${duration}ms (attempt ${attempt})`);
        return true;
      } catch (error) {
        const duration = Date.now() - startTime;

        if (attempt < this.fastWarmupRetries) {
          logger.warn(`Fast warmup attempt ${attempt} failed after ${duration}ms, retrying in ${retryDelay}ms:`, error.message);

          // Wait with exponential backoff
          await new Promise(resolve => setTimeout(resolve, retryDelay));

          // Retry with exponential backoff (200ms, 400ms, etc.)
          return tryWarmup(retryDelay * 2);
        } else {
          logger.error(`All ${this.fastWarmupRetries} fast warmup attempts failed after ${duration}ms:`, error.message);
          throw error;
        }
      }
    };

    return tryWarmup();
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

export async function fastWarmupDatabase() {
  return warmer.fastWarmup();
}

// Auto-warm on module load for Vercel using optimized fast warmup
if (process.env.VERCEL === '1' && process.env.NODE_ENV !== 'test') {
  // Use fast warmup to prevent 230+ second hangs on cold starts
  warmer.fastWarmup().catch(error => {
    logger.warn('Auto-warmup on module load failed, falling back to background warmup:', error.message);
    // Fallback to background warmup if fast warmup fails
    warmer.warmInBackground();
  });
}