/**
 * Ticket Cache Service
 * High-performance ticket data access with in-memory caching
 * Provides fast lookup for tickets by event and individual ticket access
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

class TicketCacheService {
  constructor() {
    this.ticketCache = new Map(); // ticketId -> ticket data
    this.eventTicketCache = new Map(); // eventId -> Set of ticketIds
    this.allTicketsCache = new Map(); // 'all' -> array of all tickets

    // TTL configuration - shorter for serverless, longer for local dev
    this.ttl = process.env.VERCEL === '1' ? 5 * 60 * 1000 : 15 * 60 * 1000; // 5 min serverless, 15 min local
    this.lastFetch = null;
    this.fetchPromise = null;

    // Performance stats
    this.stats = {
      hits: 0,
      misses: 0,
      refreshes: 0,
      eventHits: 0,
      eventMisses: 0
    };

    // Database connection state
    this.db = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    // Fast path: already initialized with valid database connection
    if (this.initialized && this.db) {
      return this;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      // Clear promise on error to allow retry
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
      this.db = await getDatabaseClient();

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
   * Get tickets by event ID with caching
   */
  async getTicketsByEvent(eventId) {
    await this.ensureInitialized();

    // Return cached if still valid and event is cached
    if (this.isValid() && this.eventTicketCache.has(eventId)) {
      this.stats.eventHits++;
      const ticketIds = this.eventTicketCache.get(eventId);
      const tickets = [];

      for (const ticketId of ticketIds) {
        const ticket = this.ticketCache.get(ticketId);
        if (ticket) {
          tickets.push(ticket);
        }
      }

      return tickets;
    }

    // Cache miss - need to refresh or fetch specific event
    this.stats.eventMisses++;

    // Fetch specifically for this event
    return this.fetchTicketsByEventFromDatabase(eventId);
  }

  /**
   * Get ticket by ID with caching
   */
  async getTicketById(ticketId) {
    await this.ensureInitialized();

    // Try cache first
    if (this.isValid() && this.ticketCache.has(ticketId)) {
      this.stats.hits++;
      return this.ticketCache.get(ticketId);
    }

    // Cache miss
    this.stats.misses++;

    // Directly fetch single ticket
    return this.fetchSingleTicketFromDatabase(ticketId);
  }

  /**
   * Get all tickets with caching
   */
  async getAllTickets() {
    await this.ensureInitialized();

    // Return cached if still valid
    if (this.isValid() && this.allTicketsCache.has('all')) {
      this.stats.hits++;
      return this.allTicketsCache.get('all');
    }

    // Cache miss - refresh all data
    this.stats.misses++;
    return this.refreshCache();
  }

  /**
   * Check if cache is still valid
   */
  isValid() {
    if (!this.lastFetch || this.ticketCache.size === 0) {
      return false;
    }
    return (Date.now() - this.lastFetch) < this.ttl;
  }

  /**
   * Refresh the entire cache from database
   */
  async refreshCache() {
    // Prevent concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchAllTicketsFromDatabase();

    try {
      const tickets = await this.fetchPromise;
      return tickets;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Fetch all tickets from database and update cache
   */
  async fetchAllTicketsFromDatabase() {
    try {
      const result = await this.db.execute({
        sql: `
          SELECT
            t.*,
            tr.uuid as order_number,
            tr.customer_name,
            tr.customer_email as transaction_customer_email,
            tr.amount_cents as transaction_amount_cents,
            tr.completed_at as transaction_completed_at,
            tr.status as transaction_status,
            tt.name as ticket_type_name,
            tt.description as ticket_type_description,
            tt.price_cents as ticket_type_price_cents,
            tt.max_quantity as ticket_type_max_quantity,
            tt.sold_count as ticket_type_sold_count,
            e.name as event_name,
            e.date as event_date_actual,
            e.venue as event_venue,
            e.status as event_status
          FROM tickets t
          LEFT JOIN transactions tr ON t.transaction_id = tr.id
          LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
          LEFT JOIN events e ON t.event_id = e.id
          WHERE (t.is_test = 0 OR ?)
          ORDER BY t.created_at DESC
        `,
        args: [process.env.NODE_ENV === 'test']
      });

      // Clear existing caches
      this.ticketCache.clear();
      this.eventTicketCache.clear();
      this.allTicketsCache.clear();

      const enrichedTickets = [];

      for (const row of result.rows) {
        const enrichedTicket = this.enrichTicketData(row);

        // Add to main ticket cache
        this.ticketCache.set(enrichedTicket.ticket_id, enrichedTicket);

        // Add to event-based cache
        const eventId = enrichedTicket.event_id;
        if (eventId) {
          if (!this.eventTicketCache.has(eventId)) {
            this.eventTicketCache.set(eventId, new Set());
          }
          this.eventTicketCache.get(eventId).add(enrichedTicket.ticket_id);
        }

        enrichedTickets.push(enrichedTicket);
      }

      // Cache all tickets
      this.allTicketsCache.set('all', enrichedTickets);

      this.lastFetch = Date.now();
      this.stats.refreshes++;

      logger.log(`🎫 Ticket cache refreshed: ${enrichedTickets.length} tickets, ${this.eventTicketCache.size} events`);

      return enrichedTickets;

    } catch (error) {
      logger.error('Failed to fetch tickets from database:', error);
      throw error;
    }
  }

  /**
   * Fetch tickets for a specific event from database
   */
  async fetchTicketsByEventFromDatabase(eventId) {
    try {
      const result = await this.db.execute({
        sql: `
          SELECT
            t.*,
            tr.uuid as order_number,
            tr.customer_name,
            tr.customer_email as transaction_customer_email,
            tr.amount_cents as transaction_amount_cents,
            tr.completed_at as transaction_completed_at,
            tr.status as transaction_status,
            tt.name as ticket_type_name,
            tt.description as ticket_type_description,
            tt.price_cents as ticket_type_price_cents,
            tt.max_quantity as ticket_type_max_quantity,
            tt.sold_count as ticket_type_sold_count,
            e.name as event_name,
            e.date as event_date_actual,
            e.venue as event_venue,
            e.status as event_status
          FROM tickets t
          LEFT JOIN transactions tr ON t.transaction_id = tr.id
          LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
          LEFT JOIN events e ON t.event_id = e.id
          WHERE t.event_id = ? AND (t.is_test = 0 OR ?)
          ORDER BY t.created_at DESC
        `,
        args: [eventId, process.env.NODE_ENV === 'test']
      });

      const tickets = [];
      const ticketIds = new Set();

      for (const row of result.rows) {
        const enrichedTicket = this.enrichTicketData(row);

        // Add to main ticket cache
        this.ticketCache.set(enrichedTicket.ticket_id, enrichedTicket);
        ticketIds.add(enrichedTicket.ticket_id);
        tickets.push(enrichedTicket);
      }

      // Cache the event ticket IDs
      this.eventTicketCache.set(eventId, ticketIds);

      return tickets;

    } catch (error) {
      logger.error('Failed to fetch tickets by event from database:', error);
      throw error;
    }
  }

  /**
   * Fetch single ticket from database
   */
  async fetchSingleTicketFromDatabase(ticketId) {
    try {
      const result = await this.db.execute({
        sql: `
          SELECT
            t.*,
            tr.uuid as order_number,
            tr.customer_name,
            tr.customer_email as transaction_customer_email,
            tr.amount_cents as transaction_amount_cents,
            tr.completed_at as transaction_completed_at,
            tr.status as transaction_status,
            tt.name as ticket_type_name,
            tt.description as ticket_type_description,
            tt.price_cents as ticket_type_price_cents,
            tt.max_quantity as ticket_type_max_quantity,
            tt.sold_count as ticket_type_sold_count,
            e.name as event_name,
            e.date as event_date_actual,
            e.venue as event_venue,
            e.status as event_status
          FROM tickets t
          LEFT JOIN transactions tr ON t.transaction_id = tr.id
          LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
          LEFT JOIN events e ON t.event_id = e.id
          WHERE t.ticket_id = ?
        `,
        args: [ticketId]
      });

      if (result.rows && result.rows.length > 0) {
        const enrichedTicket = this.enrichTicketData(result.rows[0]);

        // Cache the single ticket
        this.ticketCache.set(ticketId, enrichedTicket);

        // Add to event cache if not already there
        const eventId = enrichedTicket.event_id;
        if (eventId) {
          if (!this.eventTicketCache.has(eventId)) {
            this.eventTicketCache.set(eventId, new Set());
          }
          this.eventTicketCache.get(eventId).add(ticketId);
        }

        return enrichedTicket;
      }

      return null;

    } catch (error) {
      logger.error('Failed to fetch single ticket from database:', error);
      throw error;
    }
  }

  /**
   * Enrich ticket data with calculated fields and formatted values
   */
  enrichTicketData(row) {
    // Parse JSON fields safely
    const ticketMetadata = this.parseJSON(row.ticket_metadata);

    // Calculate availability for related ticket type
    // Convert BigInt to Number to avoid "Cannot mix BigInt and other types" error
    const availableQuantity = row.ticket_type_max_quantity ?
                              Math.max(0, Number(row.ticket_type_max_quantity) - Number(row.ticket_type_sold_count || 0)) :
                              null;

    // Determine if ticket type is still available for new purchases
    const ticketTypeAvailable = availableQuantity === null || availableQuantity > 0;

    // Format price display
    const priceDisplay = this.formatPrice(row.price_cents);

    // Format attendee name
    const attendeeName = `${row.attendee_first_name || ''} ${row.attendee_last_name || ''}`.trim();

    // Determine registration status with enriched logic
    const isRegistered = row.registration_status === 'registered' ||
                        !!(row.attendee_first_name && row.attendee_last_name);

    return {
      ...row,

      // Enriched ticket metadata
      ticket_metadata: ticketMetadata,

      // Calculated availability fields
      ticket_type_available_quantity: availableQuantity,
      ticket_type_is_available: ticketTypeAvailable,
      ticket_type_is_sold_out: availableQuantity === 0,

      // Formatted display fields
      price_display: priceDisplay,
      attendee_name: attendeeName,
      formatted_ticket_type: this.formatTicketType(row.ticket_type),
      formatted_event_date: this.formatEventDate(row.event_date || row.event_date_actual),

      // Registration status
      is_registered: isRegistered,
      needs_registration: !isRegistered && row.status === 'valid',

      // Transaction status enrichment
      is_transaction_completed: row.transaction_status === 'completed',
      transaction_amount_display: this.formatPrice(row.transaction_amount_cents),

      // QR and validation status
      has_qr_code: !!(row.qr_code_data || row.validation_signature),
      is_scannable: row.status === 'valid' && !!(row.qr_code_data || row.validation_signature),

      // Timing information
      is_future_event: row.event_date_actual ? new Date(row.event_date_actual) > new Date() : true,
      days_until_event: this.calculateDaysUntilEvent(row.event_date_actual)
    };
  }

  /**
   * Format ticket type for display
   */
  formatTicketType(ticketType) {
    if (!ticketType) return 'General Admission';

    // Convert from snake_case or kebab-case to Title Case
    return ticketType
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }

  /**
   * Format event date for display
   */
  formatEventDate(date) {
    if (!date) return 'May 15-17, 2026';

    try {
      const d = new Date(date + 'T00:00:00');
      if (isNaN(d.getTime())) {
        return 'May 15-17, 2026';
      }
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Denver'
      });
    } catch (error) {
      return 'May 15-17, 2026';
    }
  }

  /**
   * Calculate days until event
   */
  calculateDaysUntilEvent(eventDate) {
    if (!eventDate) return null;

    try {
      const event = new Date(eventDate + 'T00:00:00');
      if (isNaN(event.getTime())) {
        return null;
      }
      const now = new Date();
      const diffTime = event - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays > 0 ? diffDays : 0;
    } catch (error) {
      return null;
    }
  }

  /**
   * Format price for display
   */
  formatPrice(priceCents, currency = 'USD') {
    const amount = (priceCents || 0) / 100;

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
   * Invalidate the cache manually
   */
  invalidateCache() {
    this.ticketCache.clear();
    this.eventTicketCache.clear();
    this.allTicketsCache.clear();
    this.lastFetch = null;
    this.fetchPromise = null;
    logger.log('🔄 Ticket cache invalidated');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const eventRequests = this.stats.eventHits + this.stats.eventMisses;

    return {
      ...this.stats,
      ticketCacheSize: this.ticketCache.size,
      eventCacheSize: this.eventTicketCache.size,
      allTicketsCacheSize: this.allTicketsCache.has('all') ? this.allTicketsCache.get('all').length : 0,
      isValid: this.isValid(),
      lastFetch: this.lastFetch,
      lastFetchFormatted: this.lastFetch ? new Date(this.lastFetch).toISOString() : null,
      ttl: this.ttl,
      ttlMinutes: Math.round(this.ttl / 60000),
      hitRate: totalRequests > 0 ?
               ((this.stats.hits / totalRequests) * 100).toFixed(2) + '%' :
               '0%',
      eventHitRate: eventRequests > 0 ?
                   ((this.stats.eventHits / eventRequests) * 100).toFixed(2) + '%' :
                   '0%',
      cacheAgeMinutes: this.lastFetch ?
                      Math.round((Date.now() - this.lastFetch) / 60000) :
                      null,
      isServerless: process.env.VERCEL === '1'
    };
  }

  /**
   * Handle database connection failures gracefully
   */
  async handleConnectionFailure(error) {
    logger.error('Ticket cache database connection failed:', error);

    // Reset connection state to allow retry
    this.initialized = false;
    this.db = null;
    this.initializationPromise = null;

    // Don't clear cache data - serve stale data if available
    if (this.ticketCache.size > 0) {
      logger.warn('Serving stale ticket cache data due to database connection failure');
      return true; // Indicate that stale data is available
    }

    throw error; // Re-throw if no cache data available
  }

  /**
   * Update ticket in cache after modification
   */
  updateTicketInCache(ticketId, updatedTicket) {
    if (this.ticketCache.has(ticketId)) {
      const enriched = this.enrichTicketData(updatedTicket);
      this.ticketCache.set(ticketId, enriched);

      // Update all tickets cache if it exists
      if (this.allTicketsCache.has('all')) {
        const allTickets = this.allTicketsCache.get('all');
        const index = allTickets.findIndex(t => t.ticket_id === ticketId);
        if (index >= 0) {
          allTickets[index] = enriched;
        }
      }

      logger.log(`🎫 Updated ticket ${ticketId} in cache`);
    }
  }

  /**
   * Remove ticket from cache after deletion
   */
  removeTicketFromCache(ticketId) {
    if (this.ticketCache.has(ticketId)) {
      const ticket = this.ticketCache.get(ticketId);
      const eventId = ticket.event_id;

      // Remove from main cache
      this.ticketCache.delete(ticketId);

      // Remove from event cache
      if (eventId && this.eventTicketCache.has(eventId)) {
        this.eventTicketCache.get(eventId).delete(ticketId);
      }

      // Remove from all tickets cache
      if (this.allTicketsCache.has('all')) {
        const allTickets = this.allTicketsCache.get('all');
        const index = allTickets.findIndex(t => t.ticket_id === ticketId);
        if (index >= 0) {
          allTickets.splice(index, 1);
        }
      }

      logger.log(`🎫 Removed ticket ${ticketId} from cache`);
    }
  }
}

// Export singleton instance
export const ticketCacheService = new TicketCacheService();

// Export class for testing
export { TicketCacheService };