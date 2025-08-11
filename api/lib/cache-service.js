/**
 * Cache Service
 * High-level caching service for A Lo Cubano Boulder Fest API
 * Provides optimized caching for common operations
 */

import {
  getCache,
  CACHE_TYPES,
  initializeCache,
  createCacheMiddleware,
} from "../../lib/cache/index.js";

class CacheService {
  constructor() {
    this.cache = null;
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize cache service
   */
  async init() {
    if (this.initialized) return;

    // Return existing promise if initialization is in progress
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // Initialize cache with festival data
        const warmUpData = await this.getWarmUpData();
        this.cache = await initializeCache(warmUpData);

        this.initialized = true;
        console.log("Cache service initialized successfully");
      } catch (error) {
        console.error("Cache service initialization failed:", error);
        // Fallback to basic cache without warm-up
        this.cache = getCache();
        this.initialized = true;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Get warm-up data for cache initialization
   */
  async getWarmUpData() {
    return {
      // Static event information
      "event:boulder-fest-2026": {
        name: "A Lo Cubano Boulder Fest 2026",
        dates: "May 15-17, 2026",
        location: "Avalon Ballroom, Boulder, CO",
        status: "upcoming",
      },

      // Featured artists (rarely change)
      "artists:featured": [
        "Maykel Fonts",
        "Dayme y El High",
        "Chacal",
        "El Micha",
      ],

      // Ticket types configuration
      "tickets:config": {
        earlyBird: { price: 125, available: true },
        regular: { price: 150, available: true },
        vip: { price: 250, available: true },
        workshop: { price: 75, available: true },
      },

      // Gallery years available
      "gallery:years": ["2023", "2024", "2025", "2026"],

      // Analytics configuration
      "analytics:config": {
        trackingEnabled: true,
        sampleRate: 0.1,
        endpoints: ["tickets", "gallery", "subscribe"],
      },
    };
  }

  /**
   * Ensure cache is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
    return this.cache;
  }

  /**
   * Get from cache with automatic initialization
   */
  async get(key, options = {}) {
    const cache = await this.ensureInitialized();
    return cache.get(key, options);
  }

  /**
   * Set in cache with automatic initialization
   */
  async set(key, value, options = {}) {
    const cache = await this.ensureInitialized();
    return cache.set(key, value, options);
  }

  /**
   * Delete from cache
   */
  async del(key, options = {}) {
    const cache = await this.ensureInitialized();
    return cache.del(key, options);
  }

  /**
   * Cache ticket availability data
   */
  async cacheTicketAvailability(ticketData) {
    const cache = await this.ensureInitialized();

    return cache.set("tickets:availability", ticketData, {
      type: CACHE_TYPES.DYNAMIC,
      namespace: "tickets",
    });
  }

  /**
   * Get cached ticket availability
   */
  async getTicketAvailability() {
    const cache = await this.ensureInitialized();

    return cache.get("tickets:availability", {
      namespace: "tickets",
      fallback: null,
    });
  }

  /**
   * Cache gallery data by year
   */
  async cacheGalleryData(year, photos) {
    const cache = await this.ensureInitialized();

    return cache.set(`gallery:${year}`, photos, {
      type: CACHE_TYPES.GALLERY,
      namespace: "gallery",
    });
  }

  /**
   * Get cached gallery data
   */
  async getGalleryData(year) {
    const cache = await this.ensureInitialized();

    return cache.get(`gallery:${year}`, {
      namespace: "gallery",
      fallback: null,
    });
  }

  /**
   * Cache user session data
   */
  async cacheUserSession(sessionId, userData) {
    const cache = await this.ensureInitialized();

    return cache.set(`session:${sessionId}`, userData, {
      type: CACHE_TYPES.SESSION,
      namespace: "sessions",
    });
  }

  /**
   * Get cached user session
   */
  async getUserSession(sessionId) {
    const cache = await this.ensureInitialized();

    return cache.get(`session:${sessionId}`, {
      namespace: "sessions",
      fallback: null,
    });
  }

  /**
   * Cache analytics data
   */
  async cacheAnalytics(key, data) {
    const cache = await this.ensureInitialized();

    return cache.set(key, data, {
      type: CACHE_TYPES.ANALYTICS,
      namespace: "analytics",
    });
  }

  /**
   * Get cached analytics data
   */
  async getAnalytics(key) {
    const cache = await this.ensureInitialized();

    return cache.get(key, {
      namespace: "analytics",
      fallback: null,
    });
  }

  /**
   * Cache API response
   */
  async cacheApiResponse(endpoint, method, params, response) {
    const cache = await this.ensureInitialized();

    // Create stable cache key by sorting all object keys recursively
    const sortedParams = params
      ? JSON.stringify(params, (key, value) => {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            return Object.keys(value)
              .sort()
              .reduce((sorted, k) => {
                sorted[k] = value[k];
                return sorted;
              }, {});
          }
          return value;
        })
      : "{}";
    const cacheKey = `${method}:${endpoint}:${sortedParams}`;

    return cache.set(cacheKey, response, {
      type: CACHE_TYPES.API,
      namespace: "api-responses",
    });
  }

  /**
   * Get cached API response
   */
  async getCachedApiResponse(endpoint, method, params) {
    const cache = await this.ensureInitialized();

    // Create stable cache key by sorting all object keys recursively
    const sortedParams = params
      ? JSON.stringify(params, (key, value) => {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            return Object.keys(value)
              .sort()
              .reduce((sorted, k) => {
                sorted[k] = value[k];
                return sorted;
              }, {});
          }
          return value;
        })
      : "{}";
    const cacheKey = `${method}:${endpoint}:${sortedParams}`;

    return cache.get(cacheKey, {
      namespace: "api-responses",
      fallback: null,
    });
  }

  /**
   * Cache payment data temporarily
   */
  async cachePaymentData(paymentId, data) {
    const cache = await this.ensureInitialized();

    return cache.set(`payment:${paymentId}`, data, {
      type: CACHE_TYPES.PAYMENTS,
      namespace: "payments",
    });
  }

  /**
   * Get cached payment data
   */
  async getPaymentData(paymentId) {
    const cache = await this.ensureInitialized();

    return cache.get(`payment:${paymentId}`, {
      namespace: "payments",
      fallback: null,
    });
  }

  /**
   * Increment counter (for rate limiting, analytics, etc.)
   */
  async incrementCounter(key, options = {}) {
    const cache = await this.ensureInitialized();

    return cache.incr(key, {
      namespace: "counters",
      type: CACHE_TYPES.ANALYTICS,
      ...options,
    });
  }

  /**
   * Get counter value
   */
  async getCounter(key) {
    const cache = await this.ensureInitialized();

    const result = await cache.get(key, {
      namespace: "counters",
      fallback: 0,
    });

    return Number(result) || 0;
  }

  /**
   * Invalidate cache patterns
   */
  async invalidatePattern(pattern, namespace) {
    const cache = await this.ensureInitialized();

    return cache.delPattern(pattern, { namespace });
  }

  /**
   * Invalidate all ticket-related cache
   */
  async invalidateTicketCache() {
    const cache = await this.ensureInitialized();

    const results = await Promise.allSettled([
      cache.delPattern("*", { namespace: "tickets" }),
      cache.delPattern("tickets:*"),
      cache.delPattern("*ticket*", { namespace: "api-responses" }),
    ]);

    const totalDeleted = results
      .filter((result) => result.status === "fulfilled")
      .reduce((sum, result) => sum + (result.value || 0), 0);

    console.log(`Invalidated ${totalDeleted} ticket-related cache entries`);
    return totalDeleted;
  }

  /**
   * Invalidate all gallery cache
   */
  async invalidateGalleryCache() {
    const cache = await this.ensureInitialized();

    const results = await Promise.allSettled([
      cache.delPattern("*", { namespace: "gallery" }),
      cache.delPattern("gallery:*"),
      cache.delPattern("*gallery*", { namespace: "api-responses" }),
    ]);

    const totalDeleted = results
      .filter((result) => result.status === "fulfilled")
      .reduce((sum, result) => sum + (result.value || 0), 0);

    console.log(`Invalidated ${totalDeleted} gallery-related cache entries`);
    return totalDeleted;
  }

  /**
   * Get cache health status
   */
  async getHealthStatus() {
    if (!this.initialized) {
      return {
        status: "not-initialized",
        timestamp: new Date().toISOString(),
      };
    }

    const cache = await this.ensureInitialized();

    if (typeof cache.healthCheck === "function") {
      return await cache.healthCheck();
    }

    return {
      status: "healthy",
      message: "Basic cache operational",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.initialized) {
      return { error: "Cache not initialized" };
    }

    const cache = await this.ensureInitialized();

    if (typeof cache.getStats === "function") {
      return await cache.getStats();
    }

    return { message: "Statistics not available for this cache type" };
  }

  /**
   * Create cache middleware for Express routes
   */
  createMiddleware(options = {}) {
    return createCacheMiddleware({
      namespace: "middleware",
      type: CACHE_TYPES.API,
      ...options,
    });
  }

  /**
   * Warm specific cache sections
   */
  async warmCache(section) {
    const cache = await this.ensureInitialized();

    switch (section) {
      case "tickets": {
        // Warm ticket-related cache
        const warmUpData = await this.getWarmUpData();
        await this.cacheTicketAvailability(warmUpData["tickets:config"]);
        break;
      }

      case "gallery": {
        // Warm gallery cache with years
        const warmUpData = await this.getWarmUpData();
        const galleryYears = warmUpData["gallery:years"];
        await cache.set("gallery:years", galleryYears, {
          type: CACHE_TYPES.GALLERY,
          namespace: "gallery",
        });
        break;
      }

      case "all": {
        // Re-warm entire cache
        const warmUpData = await this.getWarmUpData();
        if (typeof cache.warmCache === "function") {
          await cache.warmCache(warmUpData, { type: CACHE_TYPES.STATIC });
        }
        break;
      }

      default:
        console.warn(`Unknown cache section: ${section}`);
    }
  }

  /**
   * Close cache service
   */
  async close() {
    if (this.cache && typeof this.cache.close === "function") {
      await this.cache.close();
    }
    this.initialized = false;
    console.log("Cache service closed");
  }
}

// Create singleton instance
let cacheServiceInstance = null;

export function getCacheService() {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

export { CacheService };

// Export convenience functions
export const cacheService = getCacheService();

export default cacheService;
