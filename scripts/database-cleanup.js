#!/usr/bin/env node
/**
 * Database Cleanup Script
 * Standalone script for cleaning up test data from the database
 * Can be run manually or as part of CI/CD pipeline
 * 
 * Usage:
 *   node scripts/database-cleanup.js [options]
 * 
 * Options:
 *   --mode=test|full        Cleanup mode (default: test)
 *   --tables=table1,table2  Specific tables (default: all)
 *   --dry-run              Show what would be cleaned without actually cleaning
 *   --stats                Show cleanup statistics only
 *   --no-transaction       Disable transaction wrapping
 *   --help                 Show this help message
 * 
 * Examples:
 *   npm run db:cleanup:test           # Clean test data (safe)
 *   npm run db:cleanup:stats          # Show cleanup statistics
 *   npm run db:cleanup:dry-run        # Preview what would be cleaned
 *   node scripts/database-cleanup.js --mode=full --dry-run  # Preview full cleanup
 */

import { config } from 'dotenv';
import { cleanTestData, cleanAllData, getCleanupStats } from '../tests/e2e/helpers/database-cleanup.js';

// Load environment variables
config({ path: '.env.local' });

function showHelp() {
  console.log(`
Database Cleanup Script
======================

Clean up test data or perform full database cleanup while preserving schema.

Usage:
  node scripts/database-cleanup.js [options]

Options:
  --mode=test|full        Cleanup mode (default: test)
  --tables=table1,table2  Specific tables to clean (default: all)
  --dry-run              Show what would be cleaned without actually cleaning
  --stats                Show cleanup statistics only
  --no-transaction       Disable transaction wrapping
  --help                 Show this help message

Examples:
  # Safe cleanup of test data only
  node scripts/database-cleanup.js
  node scripts/database-cleanup.js --mode=test
  
  # Preview what would be cleaned
  node scripts/database-cleanup.js --dry-run
  
  # Show database statistics
  node scripts/database-cleanup.js --stats
  
  # Clean specific tables only
  node scripts/database-cleanup.js --tables=email_subscribers,transactions
  
  # Full cleanup (DANGER: removes ALL data)
  node scripts/database-cleanup.js --mode=full --dry-run
  
NPM Scripts:
  npm run db:cleanup:test      # Clean test data
  npm run db:cleanup:stats     # Show statistics
  npm run db:cleanup:dry-run   # Preview cleanup
  npm run db:cleanup:full      # Full cleanup (dangerous)

Database Tables:
  - email_subscribers    Newsletter subscriptions
  - email_events        Email interaction events  
  - email_audit_log     Email system audit trail
  - transactions        Payment transactions
  - registrations       Ticket registrations
  - payment_events      Payment event audit trail

Test Data Patterns:
  - Emails: test@example.com, @test.com, e2e-test-, etc.
  - Names: test user, john doe, jane doe, etc.
  - Recent: Data created in last 24 hours
  - Stripe Test: cs_test_, pi_test_ prefixes
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'test',
    tables: ['all'],
    dryRun: false,
    statsOnly: false,
    useTransaction: true,
    help: false
  };
  
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=')[1];
    } else if (arg.startsWith('--tables=')) {
      options.tables = arg.split('=')[1].split(',').map(t => t.trim());
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--stats') {
      options.statsOnly = true;
    } else if (arg === '--no-transaction') {
      options.useTransaction = false;
    } else if (arg.startsWith('--')) {
      console.warn(`⚠️  Unknown option: ${arg}`);
    }
  }
  
  // Validate mode
  if (!['test', 'full'].includes(options.mode)) {
    console.error(`❌ Invalid mode: ${options.mode}. Must be 'test' or 'full'`);
    process.exit(1);
  }
  
  return options;
}

async function main() {
  console.log('🗄️  Database Cleanup Script\n');
  
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  console.log(`📋 Mode: ${options.mode}`);
  console.log(`📊 Tables: ${options.tables.join(', ')}`);
  console.log(`🔍 Dry run: ${options.dryRun ? 'enabled' : 'disabled'}`);
  console.log(`💾 Transaction: ${options.useTransaction ? 'enabled' : 'disabled'}`);
  
  // Show warning for full cleanup
  if (options.mode === 'full' && !options.dryRun) {
    console.log('\n⚠️  WARNING: Full cleanup mode will delete ALL data from specified tables!');
    console.log('⚠️  This action cannot be undone!');
    console.log('⚠️  Consider running with --dry-run first.\n');
    
    // Add a delay to let the user see the warning
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  try {
    let result;
    
    if (options.statsOnly) {
      // Just show statistics
      result = await getCleanupStats({ testDataOnly: options.mode === 'test' });
      
      if (!result.success) {
        console.error('❌ Failed to get cleanup statistics:', result.error);
        process.exit(1);
      }
      
      console.log('📊 Database cleanup statistics retrieved successfully');
      
    } else if (options.mode === 'test') {
      // Clean test data only
      result = await cleanTestData({
        tables: options.tables,
        useTransaction: options.useTransaction,
        dryRun: options.dryRun
      });
      
    } else if (options.mode === 'full') {
      // Full cleanup
      result = await cleanAllData({
        tables: options.tables,
        useTransaction: options.useTransaction,
        dryRun: options.dryRun
      });
    }
    
    if (result && !result.success) {
      console.error('❌ Cleanup failed:', result.error);
      process.exit(1);
    }
    
    if (result && !options.statsOnly) {
      console.log(`🎉 Cleanup completed successfully! Records processed: ${result.recordsCleaned}`);
    }
    
  } catch (error) {
    console.error('❌ Cleanup script failed:', error.message);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('📍 Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('📍 Stack trace:', error.stack);
  }
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('❌ Script execution failed:', error.message);
  process.exit(1);
});