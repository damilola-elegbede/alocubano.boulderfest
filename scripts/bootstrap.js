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

async function runBootstrap() {
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

    // Get and display status
    const status = await bootstrapService.getStatus();
    logger.log('\n📊 Bootstrap Status:');
    logger.log(`   Events in database: ${status.eventCount}`);
    logger.log(`   Ticket types in database: ${status.ticketTypeCount}`);

    logger.log('\n' + '═'.repeat(60));
    logger.log('✨ Bootstrap complete\n');

    process.exit(0);

  } catch (error) {
    logger.error('\n❌ Bootstrap failed!');

    // Check if this is a validation error and format nicely
    if (error.message && error.message.includes('Bootstrap validation failed')) {
      logger.error(`   ${error.message}`);
      logger.error('\n💡 Fix the errors in config/bootstrap.json and try again.');
    } else {
      logger.error(`   Error: ${error.message}`);

      if (error.stack && process.env.NODE_ENV !== 'production') {
        logger.error('\n   Stack trace:');
        logger.error(error.stack);
      }
    }

    logger.log('\n' + '═'.repeat(60));
    process.exit(1);
  }
}

// Run bootstrap
runBootstrap();