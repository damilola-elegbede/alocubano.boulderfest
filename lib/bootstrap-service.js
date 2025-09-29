/**
 * Bootstrap Service for Ticket Management
 * Loads and applies ticket configuration from bootstrap-tickets.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BootstrapService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.lastChecksum = null;
  }

  /**
   * Initialize the bootstrap service and apply configuration
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      return result;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform the actual initialization
   */
  async _performInitialization() {
    try {
      logger.log('📋 Bootstrap Service: Starting initialization...');

      // Load bootstrap file
      const bootstrapData = await this.loadBootstrapFile();

      // Calculate checksum
      const checksum = this.calculateChecksum(bootstrapData);
      this.lastChecksum = checksum;

      // Check if already applied
      if (await this.isAlreadyApplied(checksum)) {
        logger.log('✅ Bootstrap already applied with checksum:', checksum.substring(0, 8) + '...');
        return { status: 'already_applied', checksum };
      }

      // Apply bootstrap data
      const result = await this.applyBootstrap(bootstrapData, checksum);

      logger.log('✅ Bootstrap Service: Initialization complete');
      return result;

    } catch (error) {
      logger.error('❌ Bootstrap Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load the bootstrap configuration file
   */
  async loadBootstrapFile() {
    const filePath = process.env.BOOTSTRAP_FILE_PATH ||
                    path.join(__dirname, '..', 'config', 'bootstrap.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Validate basic structure
      if (!data.version || !data.events || !data.ticket_types) {
        throw new Error('Invalid bootstrap file structure');
      }

      logger.log(`📄 Loaded bootstrap file version ${data.version}`);
      return data;

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Bootstrap file not found at: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Calculate SHA-256 checksum of the bootstrap data
   */
  calculateChecksum(data) {
    const hash = crypto.createHash('sha256');

    // Create a deterministic string representation
    const content = JSON.stringify({
      version: data.version,
      events: data.events,
      ticket_types: data.ticket_types
    }, null, 0); // No whitespace for consistent checksum

    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Check if this bootstrap version has already been applied
   */
  async isAlreadyApplied(checksum) {
    const db = await getDatabaseClient();

    try {
      const result = await db.execute({
        sql: `SELECT * FROM bootstrap_versions WHERE checksum = ? AND status = 'success'`,
        args: [checksum]
      });

      return result.rows && result.rows.length > 0;

    } catch (error) {
      // Table might not exist yet
      if (error.message.includes('no such table')) {
        logger.log('Bootstrap versions table does not exist yet');
        return false;
      }
      throw error;
    }
  }

  /**
   * Apply the bootstrap configuration to the database
   */
  async applyBootstrap(data, checksum) {
    const db = await getDatabaseClient();
    const statements = [];

    logger.log(`🚀 Applying bootstrap version ${data.version}...`);

    try {
      // Prepare event insertions/updates
      for (const [eventKey, event] of Object.entries(data.events)) {
        const eventId = parseInt(eventKey); // Convert string key to integer
        statements.push({
          sql: `
            INSERT INTO events (
              id, slug, name, type, start_date, end_date, venue_name,
              status, display_order, config
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              slug = excluded.slug,
              name = excluded.name,
              type = excluded.type,
              start_date = excluded.start_date,
              end_date = excluded.end_date,
              venue_name = excluded.venue_name,
              status = excluded.status,
              display_order = excluded.display_order,
              config = excluded.config,
              updated_at = CURRENT_TIMESTAMP
          `,
          args: [
            eventId,
            event.slug || `event-${eventId}`, // Use proper slug from bootstrap.json
            event.name,
            event.type || 'festival', // Use type from bootstrap.json
            event.start_date,
            event.end_date || null,
            event.venue,
            event.status === 'upcoming' ? 'active' : event.status, // Map 'upcoming' to 'active'
            event.display_order || 0,
            JSON.stringify({
              description: event.description,
              is_featured: event.is_featured,
              is_visible: event.is_visible
            })
          ]
        });
      }

      // Prepare ticket type insertions/updates
      for (const [ticketId, ticket] of Object.entries(data.ticket_types)) {
        statements.push({
          sql: `
            INSERT INTO ticket_types (
              id, event_id, stripe_price_id, name, description,
              price_cents, currency, status, max_quantity,
              sold_count, display_order, metadata, availability
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              event_id = excluded.event_id,
              stripe_price_id = excluded.stripe_price_id,
              name = excluded.name,
              description = excluded.description,
              price_cents = excluded.price_cents,
              currency = excluded.currency,
              status = excluded.status,
              max_quantity = excluded.max_quantity,
              display_order = excluded.display_order,
              metadata = excluded.metadata,
              availability = excluded.availability,
              updated_at = CURRENT_TIMESTAMP
            WHERE
              ticket_types.stripe_price_id != excluded.stripe_price_id OR
              ticket_types.price_cents != excluded.price_cents OR
              ticket_types.status != excluded.status OR
              ticket_types.metadata != excluded.metadata
          `,
          args: [
            ticketId,
            ticket.event_id, // bootstrap.json uses correct numeric event_id
            ticket.stripe_price_id || null,
            ticket.name,
            ticket.description || null,
            ticket.price_cents,
            data.metadata?.currency || 'USD', // Use currency from metadata
            ticket.status === 'coming-soon' ? 'coming-soon' : (ticket.status || 'available'),
            ticket.max_quantity || null,
            ticket.sold_count || 0,
            ticket.sort_order || 0, // bootstrap.json uses sort_order
            JSON.stringify({}), // Empty metadata for now
            JSON.stringify({}) // Empty availability for now
          ]
        });
      }

      // Record bootstrap version
      statements.push({
        sql: `
          INSERT INTO bootstrap_versions (version, checksum, applied_by)
          VALUES (?, ?, ?)
        `,
        args: [
          data.version,
          checksum,
          process.env.VERCEL_ENV || 'local'
        ]
      });

      // Execute all statements as a batch
      logger.log(`📝 Executing ${statements.length} bootstrap statements...`);
      await db.batch(statements);

      // Log success
      logger.log(`✅ Bootstrap ${data.version} applied successfully`);
      logger.log(`   - ${Object.keys(data.events).length} events`);
      logger.log(`   - ${Object.keys(data.ticket_types).length} ticket types`);

      // Clear any caches (will be implemented with cache service)
      await this.invalidateCaches();

      return {
        status: 'success',
        version: data.version,
        checksum,
        eventsCount: Object.keys(data.events).length,
        ticketTypesCount: Object.keys(data.ticket_types).length
      };

    } catch (error) {
      // Log failure in bootstrap_versions
      try {
        await db.execute({
          sql: `
            INSERT INTO bootstrap_versions (version, checksum, status, error_message, applied_by)
            VALUES (?, ?, 'failed', ?, ?)
          `,
          args: [
            data.version,
            checksum,
            error.message,
            process.env.VERCEL_ENV || 'local'
          ]
        });
      } catch (logError) {
        logger.error('Failed to log bootstrap failure:', logError);
      }

      throw error;
    }
  }

  /**
   * Invalidate any caches after bootstrap
   */
  async invalidateCaches() {
    try {
      // Import and invalidate ticket type cache
      const { ticketTypeCache } = await import('./ticket-type-cache.js');
      if (ticketTypeCache && typeof ticketTypeCache.invalidate === 'function') {
        ticketTypeCache.invalidate();
      }

      // Import and invalidate ticket cache service
      const { ticketCacheService } = await import('./ticket-cache-service.js');
      if (ticketCacheService && typeof ticketCacheService.invalidateCache === 'function') {
        ticketCacheService.invalidateCache();
      }

      logger.log('🔄 All caches invalidated after bootstrap');
    } catch (error) {
      logger.warn('Failed to invalidate some caches after bootstrap:', error.message);
    }
  }

  /**
   * Get bootstrap status information
   */
  async getStatus() {
    const db = await getDatabaseClient();

    try {
      // Get last successful bootstrap
      const lastBootstrap = await db.execute({
        sql: `
          SELECT * FROM bootstrap_versions
          WHERE status = 'success'
          ORDER BY applied_at DESC
          LIMIT 1
        `,
        args: []
      });

      // Count events and ticket types
      const eventCount = await db.execute({
        sql: `SELECT COUNT(*) as count FROM events WHERE status != 'test'`,
        args: []
      });

      const ticketTypeCount = await db.execute({
        sql: `SELECT COUNT(*) as count FROM ticket_types WHERE status != 'test'`,
        args: []
      });

      return {
        initialized: this.initialized,
        lastChecksum: this.lastChecksum,
        lastBootstrap: lastBootstrap.rows[0] || null,
        eventCount: eventCount.rows[0]?.count || 0,
        ticketTypeCount: ticketTypeCount.rows[0]?.count || 0
      };

    } catch (error) {
      logger.error('Failed to get bootstrap status:', error);
      return {
        initialized: this.initialized,
        error: error.message
      };
    }
  }

  /**
   * Force reapply bootstrap (for admin use)
   */
  async forceReapply() {
    this.initialized = false;
    this.initializationPromise = null;
    this.lastChecksum = null;

    // Delete the last checksum to force reapplication
    const db = await getDatabaseClient();

    if (this.lastChecksum) {
      await db.execute({
        sql: `DELETE FROM bootstrap_versions WHERE checksum = ?`,
        args: [this.lastChecksum]
      });
    }

    return this.initialize();
  }
}

// Export singleton instance
export const bootstrapService = new BootstrapService();