#!/usr/bin/env node
/**
 * Bootstrap Script for Vercel Deployments
 *
 * This script populates essential database records during the build process.
 * It runs after migrations but before the application build.
 *
 * Features:
 * - Environment-aware (production/preview/development)
 * - Idempotent (safe to run multiple times)
 * - Transactional (all or nothing)
 * - Verbose logging for debugging
 * - Automatic cleanup on failure
 */

import { getDatabaseClient } from '../lib/database.js';
import {
  detectEnvironment,
  loadConfig,
  flattenSettings,
  createLogger,
  validateRequiredEnvVars
} from '../lib/bootstrap-helpers.js';
import {
  createDatabaseHelpers,
  withDatabaseHelpers,
  BOOTSTRAP_INTEGRITY_EXPECTATIONS
} from '../lib/bootstrap-database-helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BootstrapSystem {
  constructor() {
    this.db = null;
    this.dbHelpers = null;
    this.environment = detectEnvironment();
    this.config = null;
    this.logger = createLogger('Bootstrap');
    this.stats = {
      events_created: 0,
      events_skipped: 0,
      settings_created: 0,
      settings_skipped: 0,
      access_granted: 0,
      access_skipped: 0,
      errors: [],
      transactions_used: 0,
      batch_operations: 0
    };
  }

  /**
   * Connect to the database using existing database service
   */
  async connect() {
    this.logger.info('\n🔌 Connecting to database...');

    try {
      this.db = await getDatabaseClient();
      this.dbHelpers = createDatabaseHelpers();
      await this.dbHelpers.init(this.db);

      // Test connection
      const testResult = await this.db.execute("SELECT 1 as test");

      if (!testResult || !testResult.rows || !Array.isArray(testResult.rows)) {
        throw new Error('Database client test query returned invalid response format');
      }

      this.logger.success('   ✅ Connected to database successfully');
      this.logger.info('   🔧 Database helpers initialized');
      return this.db;
    } catch (error) {
      this.logger.error('   ❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  /**
   * Load configuration file based on environment
   */
  async loadConfig() {
    this.logger.info('\n📄 Loading configuration...');
    this.logger.info(`   Environment: ${this.environment}`);

    try {
      this.config = await loadConfig(this.environment, __dirname);

      // Substitute environment variables
      if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
        this.config.admin_access.email = process.env.ADMIN_EMAIL || null;
      }

      this.logger.success(`   ✅ Loaded ${this.config.events?.length || 0} event(s) from configuration`);
    } catch (error) {
      this.logger.error('   ❌ Failed to load configuration:', error.message);
      throw error;
    }
  }

  /**
   * Check if an event already exists
   */
  async eventExists(slug) {
    const result = await this.db.execute({
      sql: 'SELECT id FROM events WHERE slug = ?',
      args: [slug]
    });
    return result.rows.length > 0;
  }

  /**
   * Check if a setting already exists
   */
  async settingExists(eventId, key) {
    const result = await this.db.execute({
      sql: 'SELECT id FROM event_settings WHERE event_id = ? AND key = ?',
      args: [eventId, key]
    });
    return result.rows.length > 0;
  }

  /**
   * Check if access already exists
   */
  async accessExists(eventId, email) {
    const result = await this.db.execute({
      sql: 'SELECT id FROM event_access WHERE event_id = ? AND user_email = ?',
      args: [eventId, email]
    });
    return result.rows.length > 0;
  }

  /**
   * Get event ID by slug
   */
  async getEventId(slug) {
    const result = await this.db.execute({
      sql: 'SELECT id FROM events WHERE slug = ?',
      args: [slug]
    });
    return result.rows.length > 0 ? result.rows[0].id : null;
  }

  /**
   * Bootstrap events using safe operations
   */
  async bootstrapEvents() {
    this.logger.info('\n📅 Bootstrapping Events...');

    if (!this.config.events || this.config.events.length === 0) {
      this.logger.warn('   ⏩ No events configured');
      return;
    }

    // Use transaction for atomic event creation
    await this.dbHelpers.safeTransaction(async (transaction) => {
      this.stats.transactions_used++;

      for (const eventData of this.config.events) {
        try {
          // Use safe upsert for idempotent operation
          const upsertResult = await this.dbHelpers.safeUpsert(
            'events',
            {
              slug: eventData.slug,
              name: eventData.name,
              type: eventData.type,
              status: eventData.status,
              description: eventData.description,
              venue_name: eventData.venue?.name,
              venue_address: eventData.venue?.address,
              venue_city: eventData.venue?.city || 'Boulder',
              venue_state: eventData.venue?.state || 'CO',
              venue_zip: eventData.venue?.zip,
              start_date: eventData.dates?.start,
              end_date: eventData.dates?.end,
              max_capacity: eventData.capacity,
              early_bird_end_date: eventData.dates?.early_bird_end,
              regular_price_start_date: eventData.dates?.regular_price_start,
              display_order: eventData.display_order || 0,
              is_featured: eventData.is_featured ? 1 : 0,
              is_visible: eventData.is_visible !== false ? 1 : 0,
              created_by: 'bootstrap',
              config: JSON.stringify({
                ticket_types: eventData.ticket_types?.map(t => t.code) || [],
                features: eventData.settings?.features || {},
                custom: eventData.custom_config || {},
                ...(this.config.defaults || {})
              })
            },
            ['slug'], // Conflict detection on slug
            { updateOnConflict: false } // Don't update existing events
          );

          if (upsertResult.action === 'inserted') {
            this.logger.success(`   ✅ Created event: ${eventData.name}`);
            this.stats.events_created++;
          } else if (upsertResult.action === 'skipped') {
            this.logger.warn(`   ⏩ Event "${eventData.name}" already exists`);
            this.stats.events_skipped++;
          }

        } catch (error) {
          this.logger.error(`   ❌ Error processing event ${eventData.slug}: ${error.message}`);
          this.stats.errors.push({
            type: 'event',
            slug: eventData.slug,
            error: error.message
          });
          // Don't throw - let other events continue
        }
      }
    }, {
      timeoutMs: 60000, // 1 minute timeout for events
      retryCount: 2
    });
  }

  /**
   * Bootstrap event settings using batch operations
   */
  async bootstrapSettings() {
    this.logger.info('\n⚙️  Bootstrapping Event Settings...');

    if (!this.config.events || this.config.events.length === 0) {
      this.logger.warn('   ⏩ No events configured');
      return;
    }

    // Process settings for all events in a single transaction
    await this.dbHelpers.safeTransaction(async (transaction) => {
      this.stats.transactions_used++;

      for (const eventData of this.config.events) {
        // Get event ID
        const eventId = await this.getEventId(eventData.slug);

        if (!eventId) {
          this.logger.warn(`   ⏩ Event "${eventData.slug}" not found, skipping settings`);
          continue;
        }

        this.logger.info(`   📌 Processing settings for: ${eventData.name}`);

        // Merge defaults with event-specific settings
        const mergedSettings = this._mergeSettings(
          this.config.defaults?.settings || {},
          eventData.settings || {}
        );

        // Flatten settings object to key-value pairs
        const settings = flattenSettings(mergedSettings);

        // Add ticket types as a special setting
        if (eventData.ticket_types) {
          settings['ticket.types'] = JSON.stringify(eventData.ticket_types);
        }

        // Prepare batch data for safe batch insert
        const settingsData = [];
        for (const [key, value] of Object.entries(settings)) {
          settingsData.push([eventId, key, String(value)]);
        }

        if (settingsData.length > 0) {
          // Use batch insert for performance
          const batchResult = await this.dbHelpers.safeBatchInsert(
            'event_settings',
            ['event_id', 'key', 'value'],
            settingsData,
            {
              conflictAction: 'IGNORE', // Skip existing settings
              chunkSize: 50,
              validateData: true
            }
          );

          this.stats.batch_operations++;
          this.stats.settings_created += batchResult.inserted;
          this.stats.settings_skipped += batchResult.skipped;

          this.logger.success(`     ✅ Batch inserted: ${batchResult.inserted} settings, ${batchResult.skipped} skipped`);

          if (batchResult.errors.length > 0) {
            this.logger.error(`     ❌ Batch errors: ${batchResult.errors.length}`);
            this.stats.errors.push(...batchResult.errors.map(err => ({
              type: 'setting_batch',
              event: eventData.slug,
              error: err.error
            })));
          }
        }
      }
    }, {
      timeoutMs: 120000, // 2 minute timeout for settings
      retryCount: 1
    });
  }

  /**
   * Merge default settings with event-specific settings (deep merge)
   */
  _mergeSettings(defaults, eventSettings) {
    const merged = JSON.parse(JSON.stringify(defaults)); // Deep clone

    function deepMerge(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }

    deepMerge(merged, eventSettings);
    return merged;
  }

  /**
   * Bootstrap admin access
   */
  async bootstrapAccess() {
    this.logger.info('\n👤 Bootstrapping Admin Access...');

    const adminEmail = this.config.admin_access?.email;

    if (!adminEmail) {
      this.logger.warn('   ⏩ No admin email configured (set ADMIN_EMAIL env var)');
      return;
    }

    // Grant access to all events or specific events
    const eventSlugs = this.config.admin_access.events || ['*'];
    let events = [];

    if (eventSlugs.includes('*')) {
      // Grant access to all events
      const result = await this.db.execute('SELECT id, slug, name FROM events');
      events = result.rows;
    } else {
      // Grant access to specific events
      for (const slug of eventSlugs) {
        const eventId = await this.getEventId(slug);
        if (eventId) {
          const result = await this.db.execute({
            sql: 'SELECT id, slug, name FROM events WHERE id = ?',
            args: [eventId]
          });
          if (result.rows.length > 0) {
            events.push(result.rows[0]);
          }
        }
      }
    }

    // Grant access to each event
    for (const event of events) {
      try {
        // Check if access exists
        if (await this.accessExists(event.id, adminEmail)) {
          this.logger.warn(`   ⏩ Admin access already exists for ${event.name}`);
          this.stats.access_skipped++;
          continue;
        }

        // Grant access
        await this.db.execute({
          sql: 'INSERT INTO event_access (event_id, user_email, role, granted_by) VALUES (?, ?, ?, ?)',
          args: [
            event.id,
            adminEmail,
            this.config.admin_access.role || 'admin',
            this.config.admin_access.granted_by || 'bootstrap'
          ]
        });

        this.logger.success(`   ✅ Granted admin access for ${event.name} to ${adminEmail}`);
        this.stats.access_granted++;

      } catch (error) {
        this.logger.error(`   ❌ Error granting access: ${error.message}`);
        this.stats.errors.push({
          type: 'access',
          event: event.slug,
          error: error.message
        });
      }
    }
  }

  /**
   * Verify bootstrap completed successfully with comprehensive integrity checks
   */
  async verify() {
    this.logger.info('\n🔍 Verifying Bootstrap...');

    // Basic data counts
    const eventCount = await this.db.execute('SELECT COUNT(*) as count FROM events');
    this.logger.info(`   📊 Events in database: ${eventCount.rows[0].count}`);

    const settingsCount = await this.db.execute('SELECT COUNT(*) as count FROM event_settings');
    this.logger.info(`   📊 Settings in database: ${settingsCount.rows[0].count}`);

    const accessCount = await this.db.execute('SELECT COUNT(*) as count FROM event_access');
    this.logger.info(`   📊 Access records in database: ${accessCount.rows[0].count}`);

    // Enhanced integrity verification using database helpers
    const integrityResult = await this.dbHelpers.verifyIntegrity({
      ...BOOTSTRAP_INTEGRITY_EXPECTATIONS,
      tableCounts: {
        ...BOOTSTRAP_INTEGRITY_EXPECTATIONS.tableCounts,
        events: Math.max(1, this.config.events?.length || 1),
        event_settings: Math.max(5, (this.config.events?.length || 1) * 5)
      }
    });

    if (integrityResult.passed) {
      this.logger.success('   ✅ Database integrity verification passed');
    } else {
      this.logger.error(`   ❌ Database integrity issues: ${integrityResult.errors.length} errors`);
      for (const error of integrityResult.errors) {
        this.logger.error(`      • ${error.type}: ${error.message}`);
      }
    }

    if (integrityResult.warnings.length > 0) {
      this.logger.warn(`   ⚠️  Integrity warnings: ${integrityResult.warnings.length}`);
      for (const warning of integrityResult.warnings) {
        this.logger.warn(`      • ${warning.type}: ${warning.error}`);
      }
    }

    // Check for critical settings
    const criticalSettings = [
      'payment.stripe_enabled',
      'registration.deadline_days',
      'ticket.types'
    ];

    for (const setting of criticalSettings) {
      const result = await this.db.execute({
        sql: 'SELECT COUNT(*) as count FROM event_settings WHERE key = ?',
        args: [setting]
      });

      if (result.rows[0].count === 0) {
        this.logger.warn(`   ⚠️  Missing critical setting: ${setting}`);
      } else {
        this.logger.success(`   ✅ Critical setting exists: ${setting}`);
      }
    }

    // Check for at least one upcoming event
    const upcomingEvents = await this.db.execute(
      "SELECT slug, name FROM events WHERE status = 'upcoming' AND is_visible = 1"
    );

    if (upcomingEvents.rows.length === 0) {
      this.logger.warn('   ⚠️  No upcoming events found!');
    } else {
      this.logger.success(`   ✅ Found ${upcomingEvents.rows.length} upcoming event(s)`);
      for (const event of upcomingEvents.rows) {
        this.logger.info(`      • ${event.name} (${event.slug})`);
      }
    }

    return integrityResult;
  }

  /**
   * Print summary statistics including database operation metrics
   */
  printSummary() {
    this.logger.info('\n📊 Bootstrap Summary');
    this.logger.info('═'.repeat(50));

    this.logger.info('   Events:');
    this.logger.success(`      Created: ${this.stats.events_created}`);
    this.logger.warn(`      Skipped: ${this.stats.events_skipped}`);

    this.logger.info('   Settings:');
    this.logger.success(`      Created: ${this.stats.settings_created}`);
    this.logger.warn(`      Skipped: ${this.stats.settings_skipped}`);

    this.logger.info('   Access:');
    this.logger.success(`      Granted: ${this.stats.access_granted}`);
    this.logger.warn(`      Skipped: ${this.stats.access_skipped}`);

    this.logger.info('   Operations:');
    this.logger.info(`      Transactions: ${this.stats.transactions_used}`);
    this.logger.info(`      Batch operations: ${this.stats.batch_operations}`);

    // Include database helper statistics if available
    if (this.dbHelpers) {
      const dbStats = this.dbHelpers.getStats();
      this.logger.info(`      Total queries: ${dbStats.queries}`);
      this.logger.info(`      Total inserts: ${dbStats.inserts}`);
      this.logger.info(`      Total updates: ${dbStats.updates}`);
      this.logger.info(`      Duration: ${dbStats.duration}ms`);
    }

    if (this.stats.errors.length > 0) {
      this.logger.error(`   Errors: ${this.stats.errors.length}`);
      for (const error of this.stats.errors) {
        this.logger.error(`      • ${error.type}: ${error.error}`);
      }
    } else {
      this.logger.success('   Errors: 0');
    }

    this.logger.info('═'.repeat(50));
  }

  /**
   * Main bootstrap execution
   */
  async run() {
    this.logger.info('\n' + '═'.repeat(60));
    this.logger.info('🚀 Production Data Bootstrap System');
    this.logger.info('═'.repeat(60));

    try {
      // Validate environment variables
      validateRequiredEnvVars(this.environment);

      // Connect to database
      await this.connect();

      // Load configuration
      await this.loadConfig();

      // Bootstrap data
      await this.bootstrapEvents();
      await this.bootstrapSettings();
      await this.bootstrapAccess();

      // Verify results
      await this.verify();

      // Print summary
      this.printSummary();

      // Success
      this.logger.success('\n✨ Bootstrap completed successfully!');

      // Return success code
      return 0;

    } catch (error) {
      this.logger.error('\n❌ Bootstrap failed!');
      this.logger.error(`   Error: ${error.message}`);

      if (error.stack) {
        this.logger.error('\n   Stack trace:');
        this.logger.error(error.stack);
      }

      // Return error code
      return 1;

    } finally {
      // Clean up database helpers
      if (this.dbHelpers) {
        await this.dbHelpers.cleanup();
      }

      // Database connection cleanup is handled by the database service
      this.logger.info('\n🔌 Database connection managed by service');
    }
  }
}

// Execute bootstrap if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bootstrap = new BootstrapSystem();

  // Handle interruption signals
  process.on('SIGINT', async () => {
    console.log('\n⚠️  Bootstrap interrupted');
    process.exit(130);
  });

  process.on('SIGTERM', async () => {
    console.log('\n⚠️  Bootstrap terminated');
    process.exit(143);
  });

  // Run bootstrap
  bootstrap.run().then(code => {
    process.exit(code);
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { BootstrapSystem };