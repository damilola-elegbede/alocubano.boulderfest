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
import { bootstrapSchemaValidator } from './bootstrap-schema.js';
import { safeStringify } from './bigint-serializer.js';

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

      // CRITICAL: Check if data exists FIRST (before checksum)
      // This detects when migrations wipe tables even if checksum matches
      const dataCheck = await this.checkDataExists();

      if (!dataCheck.hasData) {
        logger.log('🔄 Bootstrap data missing, applying now...');
        logger.log(`   Current state - Events: ${dataCheck.eventCount}, Ticket types: ${dataCheck.ticketTypeCount}`);
        logger.log('   This is normal after migrations that recreate tables.');

        // Force re-application regardless of checksum
        const result = await this.applyBootstrap(bootstrapData, checksum);
        return result;
      }

      // Data exists, now check if checksum matches (optimization to skip re-insertion)
      if (await this.isAlreadyApplied(checksum)) {
        logger.log('✅ Bootstrap already applied with checksum:', checksum.substring(0, 8) + '...');
        logger.log(`   Verified - Events: ${dataCheck.eventCount}, Ticket types: ${dataCheck.ticketTypeCount}`);
        return {
          status: 'already_applied',
          checksum,
          eventsCount: dataCheck.eventCount,
          ticketTypesCount: dataCheck.ticketTypeCount
        };
      }

      // Data exists but checksum changed - update data
      logger.log('🔄 Bootstrap checksum changed, updating data...');
      logger.log(`   Previous state - Events: ${dataCheck.eventCount}, Ticket types: ${dataCheck.ticketTypeCount}`);
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

      // Validate JSON schema BEFORE any processing
      logger.log('🔍 Validating bootstrap JSON schema...');
      const validationReport = bootstrapSchemaValidator.validate(data);

      // Log validation report
      bootstrapSchemaValidator.logReport(validationReport);

      // Reject if validation failed
      if (!validationReport.isValid) {
        const errorDetails = validationReport.errors
          .map(({ field, message }) => `  - ${field}: ${message}`)
          .join('\n');

        throw new Error(
          `Bootstrap validation failed with ${validationReport.errorCount} error(s):\n${errorDetails}`
        );
      }

      // Normalize the data structure (support both old and new formats)
      const normalizedData = this.normalizeBootstrapData(data);

      logger.log(`📄 Loaded bootstrap file version ${normalizedData.version}`);
      return normalizedData;

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Bootstrap file not found at: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Normalize bootstrap data to support both old (object) and new (array) formats
   */
  normalizeBootstrapData(data) {
    const normalized = { ...data };

    // Check if events is in old format (object with numeric string keys)
    if (!Array.isArray(data.events)) {
      logger.log('🔄 Detected old bootstrap format for events, converting to array...');
      normalized.events = Object.entries(data.events).map(([key, event]) => {
        // Ensure ID is correct (use event.id if present, otherwise parse key)
        return {
          ...event,
          id: event.id !== undefined ? event.id : parseInt(key)
        };
      });
      logger.log(`✅ Converted ${normalized.events.length} events to array format`);
    } else {
      logger.log('✅ Using new bootstrap array format for events');
    }

    // Check if ticket_types is in old format (object with string keys)
    if (!Array.isArray(data.ticket_types)) {
      logger.log('🔄 Detected old bootstrap format for ticket_types, converting to array...');
      normalized.ticket_types = Object.entries(data.ticket_types).map(([key, ticket]) => {
        // Ensure ID is correct (use ticket.id if present, otherwise use key)
        return {
          ...ticket,
          id: ticket.id !== undefined ? ticket.id : key
        };
      });
      logger.log(`✅ Converted ${normalized.ticket_types.length} ticket types to array format`);
    } else {
      logger.log('✅ Using new bootstrap array format for ticket_types');
    }

    return normalized;
  }

  /**
   * Calculate SHA-256 checksum of the bootstrap data
   */
  calculateChecksum(data) {
    const hash = crypto.createHash('sha256');

    // Create a deterministic string representation
    const content = safeStringify({
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
   * Check if bootstrap data actually exists in database
   * CRITICAL: Check this BEFORE checking checksum to detect migration-wiped tables
   */
  async checkDataExists() {
    const db = await getDatabaseClient();

    try {
      const eventResult = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM events',
        args: []
      });

      const ticketResult = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM ticket_types',
        args: []
      });

      const eventCount = Number(eventResult.rows[0].count);
      const ticketTypeCount = Number(ticketResult.rows[0].count);

      return {
        hasData: eventCount > 0 && ticketTypeCount > 0,
        eventCount,
        ticketTypeCount
      };

    } catch (error) {
      logger.error('Failed to check data existence:', error);
      // If check fails, assume no data exists (safer to re-apply bootstrap)
      return {
        hasData: false,
        eventCount: 0,
        ticketTypeCount: 0
      };
    }
  }

  /**
   * Apply the bootstrap configuration to the database
   */
  async applyBootstrap(data, checksum) {
    const db = await getDatabaseClient();
    const eventStatements = [];
    const ticketStatements = [];

    logger.log(`🚀 Applying bootstrap version ${data.version}...`);

    try {
      // Prepare event insertions/updates (now using array iteration)
      // Note: Use INSERT ... ON CONFLICT DO UPDATE to handle both new and existing events
      // This allows updating event details when bootstrap.json changes
      for (const event of data.events) {
        const eventId = event.id; // Use ID directly from object
        eventStatements.push({
          sql: `
            INSERT INTO events (
              id, slug, name, type, status, description,
              venue_name, venue_address, venue_city, venue_state, venue_zip,
              start_date, end_date, max_capacity,
              early_bird_end_date, regular_price_start_date,
              display_order, is_featured, is_visible, config
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              slug = excluded.slug,
              name = excluded.name,
              type = excluded.type,
              status = excluded.status,
              description = excluded.description,
              venue_name = excluded.venue_name,
              venue_address = excluded.venue_address,
              venue_city = excluded.venue_city,
              venue_state = excluded.venue_state,
              venue_zip = excluded.venue_zip,
              start_date = excluded.start_date,
              end_date = excluded.end_date,
              max_capacity = excluded.max_capacity,
              early_bird_end_date = excluded.early_bird_end_date,
              regular_price_start_date = excluded.regular_price_start_date,
              display_order = excluded.display_order,
              is_featured = excluded.is_featured,
              is_visible = excluded.is_visible,
              config = excluded.config,
              updated_at = CURRENT_TIMESTAMP
          `,
          args: [
            eventId,
            event.slug || `event-${eventId}`,
            event.name,
            event.type || 'festival',
            event.status || 'draft',
            event.description || null,
            event.venue_name || event.venue || null, // Support both new and legacy format
            event.venue_address || null,
            event.venue_city || 'Boulder', // Default to Boulder
            event.venue_state || 'CO', // Default to CO
            event.venue_zip || null,
            event.start_date,
            event.end_date || null,
            event.max_capacity || null,
            event.early_bird_end_date || null,
            event.regular_price_start_date || null,
            event.display_order || 0,
            event.is_featured || false,
            event.is_visible !== false, // Default to true
            safeStringify({}) // Empty config for now, can be extended later
          ]
        });
      }

      // STEP 1: Execute events first to ensure they exist before ticket_types reference them
      if (eventStatements.length > 0) {
        logger.log(`📝 Inserting ${eventStatements.length} events...`);

        try {
          await db.batch(eventStatements);
        } catch (error) {
          logger.error('❌ EVENTS BATCH INSERT FAILED');
          logger.error('Error:', error.message);
          logger.error('First event SQL:', eventStatements[0]?.sql?.substring(0, 200) + '...');
          logger.error('First event args:', eventStatements[0]?.args);
          logger.error(`Total statements: ${eventStatements.length}`);
          throw new Error(`Events insertion failed: ${error.message}`);
        }

        // Verify events exist after insertion
        const eventCheck = await db.execute({
          sql: 'SELECT COUNT(*) as count FROM events',
          args: []
        });
        const actualEventCount = Number(eventCheck.rows[0].count);
        logger.log(`✅ Events in database: ${actualEventCount}`);

        // Verify we have the expected number of events
        if (actualEventCount < data.events.length) {
          throw new Error(`Events insertion incomplete: expected ${data.events.length}, got ${actualEventCount}`);
        }

        // Log individual events for debugging
        const eventList = await db.execute({
          sql: 'SELECT id, slug FROM events ORDER BY id',
          args: []
        });
        eventList.rows.forEach(row => {
          logger.log(`   - Event ID ${row.id}: ${row.slug}`);
        });
      }

      // Prepare ticket type insertions/updates (now using array iteration)
      for (const ticket of data.ticket_types) {
        const ticketId = ticket.id; // Use ID directly from object
        ticketStatements.push({
          sql: `
            INSERT INTO ticket_types (
              id, event_id, stripe_price_id, name, description,
              price_cents, currency, status, max_quantity,
              sold_count, display_order, metadata, availability,
              event_date, event_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              event_date = excluded.event_date,
              event_time = excluded.event_time,
              updated_at = CURRENT_TIMESTAMP
            WHERE
              ticket_types.stripe_price_id != excluded.stripe_price_id OR
              ticket_types.price_cents != excluded.price_cents OR
              ticket_types.status != excluded.status OR
              ticket_types.metadata != excluded.metadata OR
              ticket_types.event_date != excluded.event_date OR
              ticket_types.event_time != excluded.event_time
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
            ticket.display_order || ticket.sort_order || 0, // Accept both display_order and sort_order (legacy)
            safeStringify({}), // Empty metadata for now
            safeStringify({}), // Empty availability for now
            ticket.event_date,
            ticket.event_time || '00:00'
          ]
        });
      }

      // STEP 2: Execute ticket_types batch (AFTER events are verified)
      let actualTicketCount = 0;
      if (ticketStatements.length > 0) {
        logger.log(`📝 Inserting ${ticketStatements.length} ticket types...`);

        try {
          await db.batch(ticketStatements);
        } catch (error) {
          logger.error('❌ TICKET TYPES BATCH INSERT FAILED');
          logger.error('Error:', error.message);
          logger.error('Error code:', error.code);
          logger.error('First ticket SQL:', ticketStatements[0]?.sql?.substring(0, 200) + '...');
          logger.error('First ticket args:', ticketStatements[0]?.args);
          logger.error(`Total statements: ${ticketStatements.length}`);

          // Check if events exist (should help diagnose FK constraint failures)
          const eventCheckAfterError = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM events',
            args: []
          });
          logger.error(`Events in database at time of error: ${eventCheckAfterError.rows[0].count}`);

          throw new Error(`Ticket types insertion failed: ${error.message}`);
        }

        // CRITICAL: Verify ticket_types were actually inserted
        const ticketCheck = await db.execute({
          sql: 'SELECT COUNT(*) as count FROM ticket_types',
          args: []
        });
        actualTicketCount = Number(ticketCheck.rows[0].count);
        logger.log(`✅ Ticket types in database: ${actualTicketCount}`);

        // FAIL if ticket_types table is empty (critical error)
        if (actualTicketCount === 0) {
          throw new Error(`CRITICAL: Ticket types table is empty after bootstrap! Expected ${ticketStatements.length} tickets. This likely indicates a foreign key constraint failure or silent INSERT failure.`);
        }

        // Warn if partial insertion
        if (actualTicketCount < ticketStatements.length) {
          logger.warn(`⚠️ Partial ticket insertion: expected ${ticketStatements.length}, got ${actualTicketCount}`);
        }

        // Log individual ticket types for debugging
        const ticketList = await db.execute({
          sql: 'SELECT id, name, event_id FROM ticket_types ORDER BY event_id, display_order',
          args: []
        });
        ticketList.rows.forEach(row => {
          logger.log(`   - Ticket ${row.id}: ${row.name} (event ${row.event_id})`);
        });
      }

      // STEP 2.5: Load ticket_type_colors from bootstrap.json
      let actualColorCount = 0;
      if (data.ticket_type_colors && data.ticket_type_colors.length > 0) {
        logger.log(`📝 Loading ${data.ticket_type_colors.length} color patterns...`);

        const colorStatements = [];
        for (const color of data.ticket_type_colors) {
          colorStatements.push({
            sql: `
              INSERT INTO ticket_type_colors (
                pattern, color_name, color_rgb, circle_emoji, display_order, description
              ) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(pattern) DO UPDATE SET
                color_name = excluded.color_name,
                color_rgb = excluded.color_rgb,
                circle_emoji = excluded.circle_emoji,
                display_order = excluded.display_order,
                description = excluded.description,
                updated_at = CURRENT_TIMESTAMP
            `,
            args: [
              color.pattern,
              color.color_name,
              color.color_rgb,
              color.circle_emoji || '⬤',
              color.display_order,
              color.description || null
            ]
          });
        }

        try {
          await db.batch(colorStatements);

          // Verify colors were inserted
          const colorCheck = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM ticket_type_colors',
            args: []
          });
          actualColorCount = Number(colorCheck.rows[0].count);
          logger.log(`✅ Color patterns in database: ${actualColorCount}`);

          if (actualColorCount === 0) {
            logger.warn('⚠️ Warning: ticket_type_colors table is empty after bootstrap');
          }
        } catch (error) {
          logger.error('❌ COLOR PATTERNS BATCH INSERT FAILED');
          logger.error('Error:', error.message);
          logger.error('First color SQL:', colorStatements[0]?.sql?.substring(0, 200) + '...');
          logger.error('First color args:', colorStatements[0]?.args);

          // Non-fatal error - colors are optional, ticket functionality will continue with fallback
          logger.warn('⚠️ Continuing without color patterns - fallback colors will be used');
        }
      } else {
        logger.log('ℹ️ No color patterns in bootstrap.json - skipping color loading');
      }

      // STEP 3: Record bootstrap version (only after successful data insertion)
      // Use INSERT OR REPLACE to handle re-application when tables are empty
      await db.execute({
        sql: `
          INSERT OR REPLACE INTO bootstrap_versions (version, checksum, applied_by, applied_at, status)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'success')
        `,
        args: [
          data.version,
          checksum,
          process.env.VERCEL_ENV || 'local'
        ]
      });

      // Log success with ACTUAL counts from database
      logger.log(`✅ Bootstrap ${data.version} applied successfully`);
      logger.log(`   - Events: ${data.events.length} (verified in database)`);
      logger.log(`   - Ticket types: ${actualTicketCount} (verified in database)`);
      logger.log(`   - Color patterns: ${actualColorCount} (verified in database)`);

      // Sync ticket prices with Stripe
      await this.syncStripePrices();

      // Clear any caches (will be implemented with cache service)
      await this.invalidateCaches();

      return {
        status: 'success',
        version: data.version,
        checksum,
        eventsCount: data.events.length,
        ticketTypesCount: actualTicketCount, // Return ACTUAL count, not expected
        colorPatternsCount: actualColorCount
      };

    } catch (error) {
      // Log failure in bootstrap_versions (use INSERT OR REPLACE to handle retries)
      try {
        await db.execute({
          sql: `
            INSERT OR REPLACE INTO bootstrap_versions (version, checksum, status, error_message, applied_by, applied_at)
            VALUES (?, ?, 'failed', ?, ?, CURRENT_TIMESTAMP)
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
   * Sync ticket prices with Stripe after bootstrap
   */
  async syncStripePrices() {
    try {
      logger.log('💳 Syncing ticket prices with Stripe...');

      const { stripePriceSyncService } = await import('./stripe-price-sync-service.js');
      const result = await stripePriceSyncService.syncPricesWithStripe();

      logger.log('✅ Stripe price sync complete:', {
        created: result.created.length,
        updated: result.updated.length,
        skipped: result.skipped.length,
        errors: result.errors.length
      });

      // Log any errors that occurred during sync
      if (result.errors.length > 0) {
        logger.warn('⚠️  Some ticket types failed to sync with Stripe:');
        result.errors.forEach((error) => {
          logger.warn(`  - ${error.ticketTypeName}: ${error.error}`);
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to sync prices with Stripe:', error.message);
      // Don't fail bootstrap if Stripe sync fails - it can be retried manually
      logger.warn('⚠️  Continuing bootstrap despite Stripe sync failure. Use admin endpoint to retry.');
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

      // Count events, ticket types, and color patterns
      const eventCount = await db.execute({
        sql: `SELECT COUNT(*) as count FROM events WHERE status != 'test'`,
        args: []
      });

      const ticketTypeCount = await db.execute({
        sql: `SELECT COUNT(*) as count FROM ticket_types WHERE status != 'test'`,
        args: []
      });

      const colorPatternCount = await db.execute({
        sql: `SELECT COUNT(*) as count FROM ticket_type_colors`,
        args: []
      });

      return {
        initialized: this.initialized,
        lastChecksum: this.lastChecksum,
        lastBootstrap: lastBootstrap.rows[0] || null,
        eventCount: eventCount.rows[0]?.count || 0,
        ticketTypeCount: ticketTypeCount.rows[0]?.count || 0,
        colorPatternCount: colorPatternCount.rows[0]?.count || 0
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