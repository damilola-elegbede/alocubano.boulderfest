/**
 * Ticket Type Cache Service
 * Provides cached access to ticket type data with automatic refresh
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

class TicketTypeCache {
  constructor() {
    this.cache = new Map();
    this.eventCache = new Map();
    this.ttl = process.env.VERCEL === '1' ? 5 * 60 * 1000 : 10 * 60 * 1000; // 5 min serverless, 10 min local
    this.lastFetch = null;
    this.fetchPromise = null;
    this.stats = {
      hits: 0,
      misses: 0,
      refreshes: 0
    };
  }

  /**
   * Get all ticket types with caching
   */
  async getAll() {
    // Return cached if still valid
    if (this.isValid()) {
      this.stats.hits++;
      return Array.from(this.cache.values());
    }

    // Prevent concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch and cache
    this.stats.misses++;
    this.fetchPromise = this.fetchFromDatabase();

    try {
      const data = await this.fetchPromise;
      return data;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Get ticket types for a specific event
   */
  async getByEventId(eventId) {
    const all = await this.getAll();
    return all.filter(t => t.event_id === eventId);
  }

  /**
   * Get a specific ticket type by ID
   */
  async getById(ticketTypeId) {
    // Try cache first
    if (this.isValid() && this.cache.has(ticketTypeId)) {
      this.stats.hits++;
      return this.cache.get(ticketTypeId);
    }

    // Check if we should refresh all data
    if (!this.isValid()) {
      await this.getAll();
      if (this.cache.has(ticketTypeId)) {
        return this.cache.get(ticketTypeId);
      }
    }

    // Fallback to direct database query
    this.stats.misses++;
    const db = await getDatabaseClient();

    try {
      const result = await db.execute({
        sql: `
          SELECT
            tt.*,
            e.name as event_name,
            e.start_date as event_start_date,
            e.venue_name as event_venue,
            e.status as event_status
          FROM ticket_types tt
          JOIN events e ON tt.event_id = e.id
          WHERE tt.id = ?
        `,
        args: [ticketTypeId]
      });

      if (result.rows && result.rows.length > 0) {
        const ticketType = this.enrichTicketType(result.rows[0]);
        // Cache the single result
        this.cache.set(ticketTypeId, ticketType);
        return ticketType;
      }

      return null;

    } catch (error) {
      logger.error('Failed to fetch ticket type by ID:', error);
      throw error;
    }
  }

  /**
   * Get ticket type by Stripe price ID
   */
  async getByStripePriceId(stripePriceId) {
    // Try to find in cache first
    if (this.isValid()) {
      for (const [id, ticketType] of this.cache.entries()) {
        if (ticketType.stripe_price_id === stripePriceId) {
          this.stats.hits++;
          return ticketType;
        }
      }
    }

    // Not in cache, fetch from database
    this.stats.misses++;
    const db = await getDatabaseClient();

    try {
      const result = await db.execute({
        sql: `
          SELECT
            tt.*,
            e.name as event_name,
            e.start_date as event_start_date,
            e.venue_name as event_venue,
            e.status as event_status
          FROM ticket_types tt
          JOIN events e ON tt.event_id = e.id
          WHERE tt.stripe_price_id = ?
        `,
        args: [stripePriceId]
      });

      if (result.rows && result.rows.length > 0) {
        const ticketType = this.enrichTicketType(result.rows[0]);
        // Cache the result
        this.cache.set(ticketType.id, ticketType);
        return ticketType;
      }

      return null;

    } catch (error) {
      logger.error('Failed to fetch ticket type by Stripe price ID:', error);
      throw error;
    }
  }

  /**
   * Get all events with caching
   */
  async getEvents() {
    if (this.isValid() && this.eventCache.size > 0) {
      this.stats.hits++;
      return Array.from(this.eventCache.values());
    }

    // Fetch events along with ticket types
    await this.getAll();
    return Array.from(this.eventCache.values());
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
   * Fetch all ticket types from database
   */
  async fetchFromDatabase() {
    const db = await getDatabaseClient();

    try {
      // Fetch events first (include test events for development/testing workflows)
      const eventsResult = await db.execute({
        sql: `
          SELECT * FROM events
          ORDER BY display_order, start_date
        `
      });

      // Clear and populate event cache
      this.eventCache.clear();
      for (const event of eventsResult.rows) {
        const eventId = typeof event.id === 'bigint' ? Number(event.id) : event.id;
        const displayOrder = typeof event.display_order === 'bigint' ? Number(event.display_order) : event.display_order;

        this.eventCache.set(eventId, {
          ...event,
          id: eventId,
          display_order: displayOrder,
          metadata: this.parseJSON(event.config)
        });
      }

      // Fetch ticket types with event information (include test tickets)
      // Note: Filtering by status is handled at the API layer based on include_test parameter
      const result = await db.execute({
        sql: `
          SELECT
            tt.*,
            e.name as event_name,
            e.start_date as event_start_date,
            e.venue_name as event_venue,
            e.status as event_status
          FROM ticket_types tt
          JOIN events e ON tt.event_id = e.id
          ORDER BY e.display_order, tt.display_order
        `
      });

      // Clear and populate cache
      this.cache.clear();
      const enrichedTypes = [];

      for (const row of result.rows) {
        const enriched = this.enrichTicketType(row);
        this.cache.set(enriched.id, enriched); // Use converted ID from enriched object
        enrichedTypes.push(enriched);
      }

      this.lastFetch = Date.now();
      this.stats.refreshes++;

      logger.log(`📊 Ticket cache refreshed: ${this.cache.size} types, ${this.eventCache.size} events`);

      return enrichedTypes;

    } catch (error) {
      logger.error('Failed to fetch ticket types from database:', error);
      throw error;
    }
  }

  /**
   * Enrich ticket type with calculated fields
   */
  enrichTicketType(row) {
    const metadata = this.parseJSON(row.metadata);
    const availability = this.parseJSON(row.availability);

    // Handle BigInt conversion from SQLite - convert ALL numeric fields
    const id = typeof row.id === 'bigint' ? Number(row.id) : row.id;
    const eventId = typeof row.event_id === 'bigint' ? Number(row.event_id) : row.event_id;
    const priceCents = typeof row.price_cents === 'bigint' ? Number(row.price_cents) : row.price_cents;
    const maxQuantity = typeof row.max_quantity === 'bigint' ? Number(row.max_quantity) : row.max_quantity;
    const soldCount = typeof row.sold_count === 'bigint' ? Number(row.sold_count) : row.sold_count;
    const displayOrder = typeof row.display_order === 'bigint' ? Number(row.display_order) : row.display_order;

    const availableQuantity = maxQuantity ?
                             Math.max(0, maxQuantity - (soldCount || 0)) :
                             null;

    const isAvailable = row.status === 'available' &&
                       (availableQuantity === null || availableQuantity > 0) &&
                       this.checkAvailabilityWindow(availability);

    return {
      ...row,
      id,
      event_id: eventId,
      price_cents: priceCents,
      max_quantity: maxQuantity,
      sold_count: soldCount,
      display_order: displayOrder,
      metadata,
      availability,
      available_quantity: availableQuantity,
      is_available: isAvailable,
      is_sold_out: row.status === 'sold-out' || (availableQuantity === 0),
      is_coming_soon: row.status === 'coming-soon',
      price_display: this.formatPrice(priceCents, row.currency),
      can_purchase: isAvailable && row.status !== 'test'
    };
  }

  /**
   * Check if ticket is within availability window
   */
  checkAvailabilityWindow(availability) {
    if (!availability) return true;

    const now = new Date();

    if (availability.start_date) {
      const startDate = new Date(availability.start_date);
      if (now < startDate) return false;
    }

    if (availability.end_date) {
      const endDate = new Date(availability.end_date);
      if (now > endDate) return false;
    }

    return true;
  }

  /**
   * Format price for display
   */
  formatPrice(priceCents, currency = 'USD') {
    // Handle BigInt conversion from SQLite
    const cents = typeof priceCents === 'bigint' ? Number(priceCents) : (priceCents || 0);
    const amount = cents / 100;

    if (currency === 'USD') {
      return `$${amount.toFixed(2)}`;
    }

    // Add more currency formatting as needed
    return `${currency} ${amount.toFixed(2)}`;
  }

  /**
   * Parse JSON safely
   */
  parseJSON(str) {
    if (!str) return {};
    if (typeof str === 'object') return str;

    try {
      return JSON.parse(str);
    } catch (error) {
      logger.warn('Failed to parse JSON:', str);
      return {};
    }
  }

  /**
   * Invalidate the cache
   */
  invalidate() {
    this.cache.clear();
    this.eventCache.clear();
    this.lastFetch = null;
    this.fetchPromise = null;
    logger.log('🔄 Ticket type cache invalidated');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      eventCacheSize: this.eventCache.size,
      isValid: this.isValid(),
      lastFetch: this.lastFetch,
      ttl: this.ttl,
      hitRate: this.stats.hits > 0 ?
               (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%' :
               '0%'
    };
  }

  /**
   * Update sold count for a ticket type
   */
  async updateSoldCount(ticketTypeId, increment = 1) {
    const db = await getDatabaseClient();

    try {
      await db.execute({
        sql: `
          UPDATE ticket_types
          SET sold_count = sold_count + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [increment, ticketTypeId]
      });

      // Update cache if present
      if (this.cache.has(ticketTypeId)) {
        const ticketType = this.cache.get(ticketTypeId);
        ticketType.sold_count = (ticketType.sold_count || 0) + increment;

        // Recalculate availability
        if (ticketType.max_quantity) {
          ticketType.available_quantity = Math.max(0,
            ticketType.max_quantity - ticketType.sold_count
          );

          // Update status if sold out
          if (ticketType.available_quantity === 0) {
            ticketType.status = 'sold-out';
            ticketType.is_sold_out = true;
            ticketType.is_available = false;
            ticketType.can_purchase = false;
          }
        }
      }

    } catch (error) {
      logger.error('Failed to update sold count:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const ticketTypeCache = new TicketTypeCache();

// Export class for testing
export { TicketTypeCache };