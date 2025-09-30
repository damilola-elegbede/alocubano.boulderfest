#!/usr/bin/env node

/**
 * Drop All Database Tables Script - PRODUCTION VERSION
 *
 * ⚠️  EXTREME CAUTION: This script drops ALL tables in the PRODUCTION database.
 *
 * Features 7 levels of confirmation to prevent accidental production data loss:
 * 1. Understanding consequences check
 * 2. Database URL verification
 * 3. Environment confirmation (must type "PRODUCTION")
 * 4. Table count verification
 * 5. Random challenge code verification
 * 6. Destructive action acknowledgment (must type "I WILL DESTROY THE PRODUCTION DATABASE")
 * 7. Final countdown with abort option
 *
 * Usage:
 *   npm run db:drop-tables:prod
 *   node scripts/drop-all-tables-prod.js
 *
 * Safety Features:
 *   - Requires 7 separate confirmations
 *   - Validates production environment variables
 *   - Displays full database URL for verification
 *   - Random challenge code generation
 *   - 10-second countdown with abort option
 *   - No --force flag bypass (confirmations always required)
 */

import { getDatabaseClient } from '../lib/database.js';
import readline from 'readline';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';

// Load production environment variables from Vercel
try {
  if (!fs.existsSync('.vercel')) {
    console.error('\n❌ ERROR: Project not linked to Vercel');
    console.error('   Please run: vercel link');
    process.exit(1);
  }

  console.log('📥 Pulling production environment variables from Vercel...');
  execSync('vercel env pull .env.production --environment=production', {
    stdio: 'inherit'
  });

  // Load the pulled environment variables
  const envContent = fs.readFileSync('.env.production', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=');
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });

  console.log('✅ Production environment variables loaded\n');
} catch (error) {
  console.error('\n❌ ERROR: Failed to pull production environment variables');
  console.error('   Run: vercel link && vercel env pull .env.production --environment=production');
  console.error(`   Details: ${error.message}`);
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  dropMigrations: args.includes('--drop-migrations'),
  help: args.includes('--help') || args.includes('-h')
};

// Help text
if (flags.help) {
  console.log(`
Drop All Database Tables Script - PRODUCTION VERSION

⚠️  EXTREME DANGER: This script targets the PRODUCTION database.
    All confirmations are MANDATORY. There is NO bypass option.

Usage:
  npm run db:drop-tables:prod              # Interactive mode with 7 confirmations
  node scripts/drop-all-tables-prod.js     # Same as above

Options:
  --drop-migrations        Also drop the migrations table (requires re-migration)
  --help, -h               Show this help message

⚠️  WARNING: This operation cannot be undone!
    All production table data and schema will be permanently deleted.
    YOU MUST complete ALL 7 confirmation steps to proceed.
  `);
  process.exit(0);
}

/**
 * Prompt user for confirmation
 */
function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Generate random challenge code
 */
function generateChallengeCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Countdown with abort option
 */
async function countdownWithAbort(seconds) {
  console.log('\n⏰ Final countdown initiated...');
  console.log('   Press Ctrl+C to abort at any time.\n');

  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r   Proceeding in ${i} seconds... (Ctrl+C to abort)`);
    await sleep(1000);
  }
  console.log('\n');
}

/**
 * Drop all tables in the PRODUCTION database with 7-level confirmation
 */
async function dropAllTablesProduction() {
  console.log('\n' + '═'.repeat(70));
  console.log('🚨 DROP ALL PRODUCTION DATABASE TABLES - EXTREME DANGER ZONE 🚨');
  console.log('═'.repeat(70));

  try {
    // Verify we're using production environment variables
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      console.error('\n❌ ERROR: Production environment variables not found!');
      console.error('   Missing: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
      console.error('\n   Please run: vercel env pull .env.production --environment=production');
      process.exit(1);
    }

    const db = await getDatabaseClient();

    // Show which database will be affected
    const databaseUrl = process.env.TURSO_DATABASE_URL;

    console.log('\n🎯 TARGET DATABASE:');
    console.log('═'.repeat(70));
    console.log(`   ${databaseUrl}`);
    console.log(`   Type: Turso (PRODUCTION Remote Database)`);
    console.log('═'.repeat(70));

    // Verify this is a Turso production database
    if (!databaseUrl.startsWith('libsql://') && !databaseUrl.startsWith('https://')) {
      console.error('\n❌ ERROR: This does not appear to be a Turso production database!');
      console.error('   Expected libsql:// or https:// URL.');
      console.error(`   Found: ${databaseUrl}`);
      process.exit(1);
    }

    // Get all table names
    const tables = await db.execute({
      sql: `SELECT name FROM sqlite_master
            WHERE type='table'
            AND name NOT LIKE 'sqlite_%'
            AND name NOT LIKE '_litestream_%'
            ORDER BY name`,
      args: []
    });

    if (tables.rows.length === 0) {
      console.log('\n✅ No tables found. Database is already empty.');
      return;
    }

    // Filter out migrations table unless explicitly requested
    const tablesToDrop = tables.rows.filter(table => {
      if (flags.dropMigrations) {
        return true; // Drop everything
      }
      return table.name !== 'migrations';
    });

    if (tablesToDrop.length === 0) {
      console.log('\n✅ No tables to drop (only migrations table exists).');
      return;
    }

    // Display tables that will be dropped
    console.log(`\n📋 Found ${tablesToDrop.length} table(s) to drop:`);
    tablesToDrop.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.name}`);
    });

    if (!flags.dropMigrations && tables.rows.some(t => t.name === 'migrations')) {
      console.log('\n💡 The "migrations" table will be preserved.');
      console.log('   Use --drop-migrations flag to drop it as well.');
    }

    // ============================================================
    // LEVEL 1: Understanding Consequences
    // ============================================================
    console.log('\n' + '═'.repeat(70));
    console.log('🔒 CONFIRMATION LEVEL 1 of 7: Understanding Consequences');
    console.log('═'.repeat(70));
    console.log('\n⚠️  YOU ARE ABOUT TO:');
    console.log(`   • Drop ${tablesToDrop.length} table(s) from the PRODUCTION database`);
    console.log(`   • Delete ALL production data and schema in these tables`);
    console.log(`   • This will affect ALL users and customers`);
    console.log(`   • This action is PERMANENT and CANNOT be reversed`);
    console.log(`   • There is NO backup recovery unless you have external backups`);

    const level1 = await askConfirmation('\nDo you fully understand these consequences? (type "YES" to continue): ');

    if (level1 !== 'YES') {
      console.log('\n✅ Operation cancelled. Smart choice. No tables were dropped.');
      return;
    }

    // ============================================================
    // LEVEL 2: Database URL Verification
    // ============================================================
    console.log('\n' + '═'.repeat(70));
    console.log('🔒 CONFIRMATION LEVEL 2 of 7: Database URL Verification');
    console.log('═'.repeat(70));
    console.log('\n📍 Target Database:');
    console.log(`   ${databaseUrl}`);
    console.log('\nTo proceed, type the EXACT database URL above:');

    const level2 = await askConfirmation('Database URL: ');

    if (level2 !== databaseUrl) {
      console.log('\n❌ Operation cancelled. Database URL did not match.');
      return;
    }

    // ============================================================
    // LEVEL 3: Environment Confirmation
    // ============================================================
    console.log('\n' + '═'.repeat(70));
    console.log('🔒 CONFIRMATION LEVEL 3 of 7: Environment Confirmation');
    console.log('═'.repeat(70));
    console.log('\n🌍 You are targeting the PRODUCTION environment.');
    console.log('   This is NOT a development, staging, or test environment.');
    console.log('   Real customer data will be permanently destroyed.');

    const level3 = await askConfirmation('\nType "PRODUCTION" to confirm you understand: ');

    if (level3 !== 'PRODUCTION') {
      console.log('\n❌ Operation cancelled. Environment confirmation failed.');
      return;
    }

    // ============================================================
    // LEVEL 4: Table Count Verification
    // ============================================================
    console.log('\n' + '═'.repeat(70));
    console.log('🔒 CONFIRMATION LEVEL 4 of 7: Table Count Verification');
    console.log('═'.repeat(70));
    console.log(`\n📊 You are about to drop ${tablesToDrop.length} table(s).`);
    console.log('\n📋 Tables to be permanently deleted:');
    tablesToDrop.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.name}`);
    });

    const level4 = await askConfirmation(`\nType the number of tables being dropped (${tablesToDrop.length}): `);

    if (level4 !== tablesToDrop.length.toString()) {
      console.log('\n❌ Operation cancelled. Table count did not match.');
      return;
    }

    // ============================================================
    // LEVEL 5: Random Challenge Code
    // ============================================================
    const challengeCode = generateChallengeCode();
    console.log('\n' + '═'.repeat(70));
    console.log('🔒 CONFIRMATION LEVEL 5 of 7: Challenge Code Verification');
    console.log('═'.repeat(70));
    console.log('\n🎲 To prove you are paying attention, type this exact code:');
    console.log(`\n   → ${challengeCode} ←\n`);

    const level5 = await askConfirmation('Challenge code: ');

    if (level5 !== challengeCode) {
      console.log('\n❌ Operation cancelled. Challenge code did not match.');
      return;
    }

    // ============================================================
    // LEVEL 6: Destructive Action Acknowledgment
    // ============================================================
    console.log('\n' + '═'.repeat(70));
    console.log('🔒 CONFIRMATION LEVEL 6 of 7: Destructive Action Acknowledgment');
    console.log('═'.repeat(70));
    console.log('\n💥 This is a DESTRUCTIVE operation that will PERMANENTLY DELETE production data.');
    console.log('\nType this phrase EXACTLY (case-sensitive):');
    console.log('\n   "I WILL DESTROY THE PRODUCTION DATABASE"\n');

    const level6 = await askConfirmation('Phrase: ');

    if (level6 !== 'I WILL DESTROY THE PRODUCTION DATABASE') {
      console.log('\n❌ Operation cancelled. Destructive acknowledgment phrase did not match.');
      return;
    }

    // ============================================================
    // LEVEL 7: Final Countdown with Abort Option
    // ============================================================
    console.log('\n' + '═'.repeat(70));
    console.log('🔒 CONFIRMATION LEVEL 7 of 7: Final Countdown');
    console.log('═'.repeat(70));
    console.log('\n🚨 ALL CONFIRMATIONS PASSED. INITIATING FINAL COUNTDOWN.');
    console.log('\n⚠️  LAST CHANCE TO ABORT!');
    console.log('   - Press Ctrl+C NOW if you have any doubts');
    console.log('   - After countdown, tables will be PERMANENTLY DELETED');
    console.log('   - There is NO UNDO for this operation\n');

    await countdownWithAbort(10);

    // ============================================================
    // Execute the drop operations
    // ============================================================
    console.log('═'.repeat(70));
    console.log('🔧 EXECUTING TABLE DROP OPERATIONS');
    console.log('═'.repeat(70));
    console.log('');

    // Disable foreign key checks to avoid constraint issues
    console.log('   Disabling foreign key constraints...');
    await db.execute({ sql: 'PRAGMA foreign_keys = OFF', args: [] });

    // Drop each table
    let droppedCount = 0;
    for (const table of tablesToDrop) {
      const tableName = table.name;
      try {
        console.log(`   ✓ Dropping: ${tableName}`);
        await db.execute({
          sql: `DROP TABLE IF EXISTS ${tableName}`,
          args: []
        });
        droppedCount++;
      } catch (error) {
        console.error(`   ✗ Failed to drop ${tableName}:`, error.message);
      }
    }

    // Re-enable foreign key checks
    console.log('   Re-enabling foreign key constraints...');
    await db.execute({ sql: 'PRAGMA foreign_keys = ON', args: [] });

    console.log('\n' + '═'.repeat(70));
    console.log(`✅ Successfully dropped ${droppedCount} table(s) from PRODUCTION!`);
    console.log('═'.repeat(70));

    if (!flags.dropMigrations) {
      console.log('\n💡 Next steps:');
      console.log('   1. Run: npm run migrate:up');
      console.log('   2. Your migrations will rebuild the schema from scratch');
      console.log('   3. You will need to repopulate all production data');
    } else {
      console.log('\n💡 Next steps:');
      console.log('   1. Re-initialize migrations tracking (if needed)');
      console.log('   2. Run: npm run migrate:up');
      console.log('   3. All migrations will be applied as fresh');
      console.log('   4. You will need to repopulate all production data');
    }

    console.log('\n⚠️  REMINDER: Production data has been permanently deleted.');
    console.log('   Restore from backups if this was a mistake.\n');

  } catch (error) {
    console.error('\n❌ Error dropping tables:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Execute the script
dropAllTablesProduction()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });