#!/usr/bin/env node
/**
 * Bootstrap Script for Build-Time Data Loading
 *
 * Loads event and ticket type configuration from config/bootstrap.json
 * and applies it to the database during the build process.
 *
 * Features:
 * - Runs during vercel-build (after migrations)
 * - Idempotent (safe to run multiple times)
 * - Checksum-based change detection
 * - Fails build if bootstrap fails
 */

import { bootstrapService } from '../lib/bootstrap-service.js';
import { logger } from '../lib/logger.js';
import { ensureDatabaseUrl } from '../lib/database-defaults.js';

async function runBootstrap() {
  // Set default local database if not configured
  ensureDatabaseUrl();

  logger.log('\n' + '═'.repeat(60));
  logger.log('🚀 Bootstrap Data Loading');
  logger.log('═'.repeat(60));
  logger.log(`   Environment: ${process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'}`);
  logger.log(`   Config: config/bootstrap.json\n`);

  try {
    const result = await bootstrapService.initialize();

    if (result.status === 'already_applied') {
      logger.log('✅ Bootstrap already applied (no changes detected)');
      logger.log(`   Checksum: ${result.checksum.substring(0, 12)}...`);
    } else if (result.status === 'success') {
      logger.log('✅ Bootstrap completed successfully!');
      logger.log(`   Version: ${result.version}`);
      logger.log(`   Events: ${result.eventsCount}`);
      logger.log(`   Ticket Types: ${result.ticketTypesCount}`);
      logger.log(`   Checksum: ${result.checksum.substring(0, 12)}...`);
    }

    // CRITICAL: Verify database state after bootstrap
    const status = await bootstrapService.getStatus();
    logger.log('\n📊 Bootstrap Verification:');
    logger.log(`   Events in database: ${status.eventCount}`);
    logger.log(`   Ticket types in database: ${status.ticketTypeCount}`);

    // FAIL if ticket_types table is empty (critical error)
    if (status.ticketTypeCount === 0) {
      logger.error('\n❌ BOOTSTRAP VERIFICATION FAILED!');
      logger.error('   Ticket types table is EMPTY after bootstrap.');
      logger.error('   This is a critical error that will cause runtime failures.');
      logger.error('\n💡 Possible causes:');
      logger.error('   - Foreign key constraint failure');
      logger.error('   - Events table empty (FK dependency)');
      logger.error('   - Silent INSERT failure');
      logger.error('   - Database connection issue');
      logger.log('\n' + '═'.repeat(60));
      process.exit(1);
    }

    // Warn if events table is empty
    if (status.eventCount === 0) {
      logger.warn('\n⚠️ WARNING: Events table is empty!');
      logger.warn('   This may cause ticket_types foreign key constraints to fail.');
    }

    logger.log('\n' + '═'.repeat(60));
    logger.log('✨ Bootstrap complete and verified\n');

    process.exit(0);

  } catch (error) {
    logger.error('\n❌ BOOTSTRAP FAILED - BUILD WILL FAIL');
    logger.error('═'.repeat(60));

    // Check if this is a validation error and format nicely
    if (error.message && error.message.includes('Bootstrap validation failed')) {
      logger.error(`\n   ${error.message}`);
      logger.error('\n💡 Fix the errors in config/bootstrap.json and try again.');
    } else if (error.message && error.message.includes('CRITICAL')) {
      // Critical errors get special formatting
      logger.error(`\n   ${error.message}`);
      logger.error('\n💡 This is a critical bootstrap failure.');
      logger.error('   Check the error logs above for detailed diagnostic information.');
    } else {
      logger.error(`\n   Error: ${error.message}`);

      if (error.stack && process.env.NODE_ENV !== 'production') {
        logger.error('\n📋 Stack trace:');
        error.stack.split('\n').forEach(line => logger.error(`   ${line}`));
      }
    }

    logger.error('\n🚨 Build cannot continue without valid bootstrap data.');
    logger.error('   The application will fail at runtime if bootstrap data is missing.');
    logger.log('\n' + '═'.repeat(60));
    process.exit(1);
  }
}

// Run bootstrap
runBootstrap();
