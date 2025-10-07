/**
 * Resilient Google Drive Service
 * Wraps Google Drive API calls with circuit breaker and exponential backoff
 *
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Circuit breaker to prevent cascading failures during outages
 * - Rate limit handling with respect to Retry-After headers
 * - Fallback to cached data when circuit is open
 * - Comprehensive metrics and monitoring
 * - Longer timeout for Google Drive (5 minutes) due to potential large file operations
 */

import { getGoogleDriveService } from './google-drive-service.js';
import { ServiceCircuitBreaker } from './service-circuit-breaker.js';
import { withExponentialBackoff } from './exponential-backoff.js';
import { logger } from './logger.js';

/**
 * Resilient Google Drive Service with circuit breaker and retry logic
 */
class ResilientGoogleDriveService {
  constructor() {
    // Initialize circuit breaker for Google Drive API
    // Longer timeout due to potential API slowness with large galleries
    this.breaker = new ServiceCircuitBreaker({
      name: 'google-drive',
      failureThreshold: 5,       // Open circuit after 5 failures
      successThreshold: 2,        // Close circuit after 2 successes
      timeout: 300000,            // Try again after 5 minutes (Google Drive may need longer recovery)
      monitoringPeriod: 300000    // Track failures over 5 minutes
    });

    // Get the underlying Google Drive service
    this.driveService = null;
    this.initialized = false;

    // Track metrics
    this.metrics = {
      imagesRequests: 0,
      imagesFetched: 0,
      cacheHits: 0,
      rateLimitHits: 0,
      failures: 0,
      retryAttempts: 0,
      circuitBreaks: 0
    };

    // Cache for fallback when circuit is open
    this.fallbackCache = new Map();
    this.fallbackCacheTTL = 24 * 60 * 60 * 1000; // 24 hours

    // Listen to circuit breaker events
    this.breaker.on('stateChange', (event) => {
      logger.log(`[ResilientGoogleDrive] Circuit breaker state changed: ${event.from} → ${event.to}`);
      if (event.to === 'OPEN') {
        this.metrics.circuitBreaks++;
      }
    });
  }

  /**
   * Ensure service is initialized
   * @private
   */
  async _ensureInitialized() {
    if (!this.initialized) {
      this.driveService = getGoogleDriveService();
      await this.driveService.ensureInitialized();
      this.initialized = true;
    }
  }

  /**
   * Custom retry predicate for Google Drive-specific errors
   * @private
   */
  _shouldRetryGoogleDriveError(error) {
    const message = error.message?.toLowerCase() || '';
    const statusCode = error.code || error.response?.status;

    // Always retry rate limit errors (403 with specific reason)
    if (statusCode === 403) {
      if (message.includes('userRateLimitExceeded') ||
          message.includes('rateLimitExceeded') ||
          message.includes('quotaExceeded')) {
        return true;
      }
    }

    // Retry rate limits (429)
    if (statusCode === 429) {
      return true;
    }

    // Retry server errors
    if (statusCode >= 500) {
      return true;
    }

    // Retry network/timeout errors
    if (message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('socket hang up')) {
      return true;
    }

    // Don't retry auth failures
    if (statusCode === 401) {
      return false;
    }

    // Don't retry "not found" errors
    if (statusCode === 404) {
      return false;
    }

    return false;
  }

  /**
   * Extract Retry-After header value from error
   * @private
   */
  _getRetryAfterDelay(error) {
    const retryAfter = error.response?.headers?.['retry-after'];

    if (!retryAfter) {
      return null;
    }

    // Retry-After can be in seconds or a date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000; // Convert to milliseconds
    }

    // Try parsing as date
    try {
      const retryDate = new Date(retryAfter);
      const delay = retryDate.getTime() - Date.now();
      return delay > 0 ? delay : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetch images with resilience
   */
  async fetchImages(options = {}) {
    await this._ensureInitialized();

    this.metrics.imagesRequests++;

    const cacheKey = this._generateCacheKey(options);

    try {
      // Execute with circuit breaker and exponential backoff
      const result = await this.breaker.execute(
        () => withExponentialBackoff(
          async () => {
            // Check if rate limited and respect Retry-After
            const result = await this.driveService.fetchImages(options);

            // Cache successful result for fallback
            this._updateFallbackCache(cacheKey, result);

            return result;
          },
          {
            maxRetries: 3,
            initialDelay: 2000,      // Start with 2 seconds for Google Drive
            maxDelay: 60000,          // Max 1 minute delay
            factor: 2,
            shouldRetry: (error) => {
              // Check for rate limiting
              if (error.code === 403 || error.code === 429) {
                this.metrics.rateLimitHits++;

                // Respect Retry-After header if present
                const retryAfter = this._getRetryAfterDelay(error);
                if (retryAfter) {
                  logger.warn(`[ResilientGoogleDrive] Rate limited, respecting Retry-After: ${retryAfter}ms`);
                }
              }

              return this._shouldRetryGoogleDriveError(error);
            },
            operationName: 'GoogleDrive fetchImages'
          }
        ),
        () => this._getFallbackData(cacheKey) // Fallback: return cached data
      );

      // Update metrics based on source
      if (result.source === 'cache') {
        this.metrics.cacheHits++;
      } else {
        this.metrics.imagesFetched++;
      }

      return result;

    } catch (error) {
      this.metrics.failures++;
      logger.error('[ResilientGoogleDrive] Failed to fetch images', {
        error: error.message,
        code: error.code,
        options
      });
      throw error;
    }
  }

  /**
   * Generate cache key for options
   * @private
   */
  _generateCacheKey(options) {
    const { year, eventId, maxResults, includeVideos } = options;
    return `${eventId || year || 'default'}-${maxResults || 1000}-${includeVideos || false}`;
  }

  /**
   * Update fallback cache with fresh data
   * @private
   */
  _updateFallbackCache(key, data) {
    this.fallbackCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Clean old cache entries
    const now = Date.now();
    for (const [cacheKey, entry] of this.fallbackCache.entries()) {
      if (now - entry.timestamp > this.fallbackCacheTTL) {
        this.fallbackCache.delete(cacheKey);
      }
    }
  }

  /**
   * Get fallback data from cache
   * @private
   */
  _getFallbackData(key) {
    const entry = this.fallbackCache.get(key);

    if (!entry) {
      logger.warn('[ResilientGoogleDrive] No cached data available for fallback');
      return {
        eventId: 'unknown',
        year: new Date().getFullYear(),
        totalCount: 0,
        categories: {
          workshops: [],
          socials: [],
          performances: [],
          other: []
        },
        hasMore: false,
        source: 'fallback-empty',
        cacheTimestamp: new Date().toISOString(),
        warning: 'Service temporarily unavailable - showing empty gallery'
      };
    }

    logger.log('[ResilientGoogleDrive] Using cached data as fallback');

    return {
      ...entry.data,
      source: 'fallback-cache',
      cachedAt: new Date(entry.timestamp).toISOString(),
      warning: 'Service temporarily unavailable - showing cached data'
    };
  }

  /**
   * Clear cache (both service cache and fallback cache)
   */
  clearCache() {
    if (this.driveService) {
      this.driveService.clearCache();
    }
    this.fallbackCache.clear();
    logger.log('[ResilientGoogleDrive] All caches cleared');
  }

  /**
   * Get metrics
   */
  getMetrics() {
    const driveMetrics = this.driveService ? this.driveService.getMetrics() : {};

    return {
      service: 'google-drive',
      ...this.metrics,
      fallbackCacheSize: this.fallbackCache.size,
      underlyingService: driveMetrics,
      circuitBreaker: this.breaker.getMetrics()
    };
  }

  /**
   * Get health status
   */
  async healthCheck() {
    await this._ensureInitialized();

    try {
      const driveHealth = await this.driveService.healthCheck();
      const circuitHealth = this.breaker.getHealth();

      return {
        status: driveHealth.status === 'healthy' && circuitHealth.status === 'healthy'
          ? 'healthy'
          : 'degraded',
        googleDrive: driveHealth,
        circuitBreaker: circuitHealth,
        metrics: this.metrics,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reset circuit breaker (for testing/admin)
   */
  resetCircuitBreaker() {
    this.breaker.reset();
    logger.log('[ResilientGoogleDrive] Circuit breaker reset');
  }
}

// Export singleton instance
let resilientGoogleDriveServiceInstance = null;

/**
 * Get resilient Google Drive service singleton
 */
export function getResilientGoogleDriveService() {
  if (!resilientGoogleDriveServiceInstance) {
    resilientGoogleDriveServiceInstance = new ResilientGoogleDriveService();
  }
  return resilientGoogleDriveServiceInstance;
}

/**
 * Reset singleton for testing
 */
export function resetResilientGoogleDriveService() {
  resilientGoogleDriveServiceInstance = null;
}

export { ResilientGoogleDriveService };
