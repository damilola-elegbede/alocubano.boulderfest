/**
 * Ticket Color Service
 * Provides cached color mapping for ticket types based on pattern matching
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

class TicketColorService {
  constructor() {
    this.cache = new Map();
    this.ttl = process.env.VERCEL === '1' ? 5 * 60 * 1000 : 10 * 60 * 1000; // 5 min serverless, 10 min local
    this.lastFetch = null;
    this.fetchPromise = null;
    this.defaultColor = {
      name: 'Default',
      rgb: 'rgb(255, 255, 255)',
      emoji: '⬤'
    };
    this.stats = {
      hits: 0,
      misses: 0,
      refreshes: 0
    };
  }

  /**
   * Get color mapping for a specific ticket type
   * @param {string} ticketTypeId - Ticket type ID to match
   * @returns {Promise<{name: string, rgb: string, emoji: string}>}
   */
  async getColorForTicketType(ticketTypeId) {
    if (!ticketTypeId) {
      return this.defaultColor;
    }

    // Ensure color mappings are loaded
    await this.ensureMappingsLoaded();

    // Convert to lowercase for case-insensitive matching
    const ticketIdLower = ticketTypeId.toLowerCase();

    // Try to find matching pattern (cache is already sorted by display_order)
    for (const [pattern, color] of this.cache.entries()) {
      if (ticketIdLower.includes(pattern.toLowerCase())) {
        this.stats.hits++;
        logger.log(`[TicketColor] Matched "${ticketTypeId}" → ${color.name} (${color.rgb})`);
        return color;
      }
    }

    // No match found, return default
    this.stats.misses++;
    logger.log(`[TicketColor] No match for "${ticketTypeId}" → Default (white)`);
    return this.defaultColor;
  }

  /**
   * Get all color mappings
   * @returns {Promise<Array<{pattern: string, name: string, rgb: string, emoji: string, display_order: number}>>}
   */
  async getAllColorMappings() {
    await this.ensureMappingsLoaded();
    return Array.from(this.cache.entries()).map(([pattern, color]) => ({
      pattern,
      ...color
    }));
  }

  /**
   * Ensure color mappings are loaded and valid
   */
  async ensureMappingsLoaded() {
    // Return cached if still valid
    if (this.isValid()) {
      return;
    }

    // Prevent concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch and cache
    this.fetchPromise = this.fetchFromDatabase();

    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Check if cache is still valid
   */
  isValid() {
    return this.lastFetch &&
           (Date.now() - this.lastFetch) < this.ttl &&
           this.cache.size > 0;
  }

  /**
   * Fetch color mappings from database
   */
  async fetchFromDatabase() {
    const db = await getDatabaseClient();

    try {
      const result = await db.execute({
        sql: `
          SELECT pattern, color_name, color_rgb, circle_emoji, display_order
          FROM ticket_type_colors
          ORDER BY display_order ASC
        `
      });

      // Clear and populate cache
      this.cache.clear();

      for (const row of result.rows) {
        // Convert BigInt to Number for display_order
        const displayOrder = typeof row.display_order === 'bigint'
          ? Number(row.display_order)
          : row.display_order;

        this.cache.set(row.pattern, {
          name: row.color_name,
          rgb: row.color_rgb,
          emoji: row.circle_emoji || '⬤',
          display_order: displayOrder
        });
      }

      this.lastFetch = Date.now();
      this.stats.refreshes++;

      logger.log(`[TicketColor] Cache refreshed: ${this.cache.size} color mappings loaded`);

    } catch (error) {
      logger.error('[TicketColor] Failed to fetch color mappings from database:', error);

      // If database fetch fails, use fallback color mappings
      this.loadFallbackMappings();
      // Don't throw - fallback mappings allow continued operation
    }
  }

  /**
   * Load fallback color mappings if database is unavailable
   */
  loadFallbackMappings() {
    logger.warn('[TicketColor] Using fallback color mappings');

    this.cache.clear();
    this.cache.set('test-', { name: 'Test', rgb: 'rgb(255, 20, 147)', emoji: '⬤', display_order: 1 });
    this.cache.set('test_', { name: 'Test', rgb: 'rgb(255, 20, 147)', emoji: '⬤', display_order: 2 });
    this.cache.set('full', { name: 'Full Pass', rgb: 'rgb(169, 169, 169)', emoji: '⬤', display_order: 3 });
    this.cache.set('early-bird', { name: 'Full Pass', rgb: 'rgb(169, 169, 169)', emoji: '⬤', display_order: 4 });
    this.cache.set('friday', { name: 'Friday', rgb: 'rgb(255, 140, 0)', emoji: '⬤', display_order: 5 });
    this.cache.set('saturday', { name: 'Saturday', rgb: 'rgb(255, 215, 0)', emoji: '⬤', display_order: 6 });
    this.cache.set('sunday', { name: 'Sunday', rgb: 'rgb(30, 144, 255)', emoji: '⬤', display_order: 7 });
    this.cache.set('weekender', { name: 'Weekender', rgb: 'rgb(255, 255, 255)', emoji: '⬤', display_order: 8 });
    this.cache.set('weekend', { name: 'Weekend', rgb: 'rgb(255, 255, 255)', emoji: '⬤', display_order: 9 });

    this.lastFetch = Date.now();
  }

  /**
   * Invalidate the cache
   */
  invalidate() {
    this.cache.clear();
    this.lastFetch = null;
    this.fetchPromise = null;
    logger.log('[TicketColor] Cache invalidated');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      isValid: this.isValid(),
      lastFetch: this.lastFetch,
      ttl: this.ttl,
      hitRate: this.stats.hits > 0 ?
               (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%' :
               '0%'
    };
  }
}

// Export singleton instance
let ticketColorServiceInstance = null;

export function getTicketColorService() {
  if (!ticketColorServiceInstance) {
    ticketColorServiceInstance = new TicketColorService();
  }
  return ticketColorServiceInstance;
}

// Export class for testing
export { TicketColorService };

export default getTicketColorService();
