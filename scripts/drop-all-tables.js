#!/usr/bin/env node

/**
 * Drop All Database Tables Script
 *
 * Drops all tables in the database while preserving the database itself.
 * Use this for complete schema reset before running fresh migrations.
 *
 * Usage:
 *   npm run db:drop-tables
 *   node scripts/drop-all-tables.js
 *
 * Safety:
 *   - Requires interactive confirmation (unless --force flag used)
 *   - Preserves migrations table by default (use --drop-migrations to remove)
 *   - Handles foreign key constraints safely
 */

import dotenv from 'dotenv';
import { getDatabaseClient } from '../lib/database.js';
import readline from 'readline';

// Load environment variables from .env.vercel
dotenv.config({ path: '.env.vercel' });

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  force: args.includes('--force') || args.includes('-f'),
  dropMigrations: args.includes('--drop-migrations'),
  help: args.includes('--help') || args.includes('-h')
};

// Help text
if (flags.help) {
  console.log(`
Drop All Database Tables Script

Usage:
  npm run db:drop-tables              # Interactive mode with confirmation
  node scripts/drop-all-tables.js     # Same as above

Options:
  --force, -f              Skip confirmation prompt (use with caution!)
  --drop-migrations        Also drop the migrations table (requires re-migration)
  --help, -h               Show this help message

Examples:
  npm run db:drop-tables                      # Interactive with migrations preserved
  npm run db:drop-tables -- --drop-migrations # Drop everything including migrations
  npm run db:drop-tables -- --force           # Skip confirmation (dangerous!)

⚠️  WARNING: This operation cannot be undone!
    All table data and schema will be permanently deleted.
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
      resolve(answer.toLowerCase().trim());
    });
  });
}

/**
 * Drop all tables in the database
 */
async function dropAllTables() {
  console.log('\n🗑️  Drop All Tables Script\n' + '='.repeat(50));

  try {
    const db = await getDatabaseClient();

    // Show which database will be affected
    const databaseUrl = process.env.TURSO_DATABASE_URL ||
                        process.env.DATABASE_URL ||
                        'UNKNOWN';

    console.log('\n🔍 Target Database:');
    if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://')) {
      // Show FULL URL for Turso databases
      console.log(`   ${databaseUrl}`);
      console.log(`   Type: Turso (Remote Database)`);
    } else if (databaseUrl === ':memory:' || databaseUrl.includes('memory')) {
      console.log(`   ${databaseUrl}`);
      console.log(`   Type: SQLite In-Memory (Test Database)`);
    } else if (databaseUrl === 'UNKNOWN') {
      console.log(`   ⚠️ Could not determine database URL`);
      console.log(`   Check TURSO_DATABASE_URL or DATABASE_URL environment variables`);
    } else {
      console.log(`   ${databaseUrl}`);
      console.log(`   Type: SQLite Local File`);
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

    // Get all view names
    const views = await db.execute({
      sql: `SELECT name FROM sqlite_master
            WHERE type='view'
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name`,
      args: []
    });

    if (tables.rows.length === 0 && views.rows.length === 0) {
      console.log('\n✅ No tables or views found. Database is already empty.');
      return;
    }

    // Filter out migrations table unless explicitly requested
    const tablesToDrop = tables.rows.filter(table => {
      if (flags.dropMigrations) {
        return true; // Drop everything
      }
      return table.name !== 'migrations';
    });

    // All views will be dropped (no filtering needed)
    const viewsToDrop = views.rows;

    if (tablesToDrop.length === 0 && viewsToDrop.length === 0) {
      console.log('\n✅ No tables or views to drop (only migrations table exists).');
      return;
    }

    // Display tables and views that will be dropped
    if (tablesToDrop.length > 0) {
      console.log(`\n📋 Found ${tablesToDrop.length} table(s) to drop:`);
      tablesToDrop.forEach((table, index) => {
        console.log(`   ${index + 1}. ${table.name}`);
      });
    }

    if (viewsToDrop.length > 0) {
      console.log(`\n👁️  Found ${viewsToDrop.length} view(s) to drop:`);
      viewsToDrop.forEach((view, index) => {
        console.log(`   ${index + 1}. ${view.name}`);
      });
    }

    if (!flags.dropMigrations && tables.rows.some(t => t.name === 'migrations')) {
      console.log('\n💡 The "migrations" table will be preserved.');
      console.log('   Use --drop-migrations flag to drop it as well.');
    }

    // Ask for confirmation unless --force flag is used
    if (!flags.force) {
      console.log('\n⚠️  ========================================');
      console.log('⚠️  WARNING: PERMANENT DESTRUCTIVE OPERATION');
      console.log('⚠️  ========================================');
      console.log('\n❗ YOU ARE ABOUT TO:');
      if (tablesToDrop.length > 0) {
        console.log(`   • Drop ${tablesToDrop.length} table(s) from the database`);
      }
      if (viewsToDrop.length > 0) {
        console.log(`   • Drop ${viewsToDrop.length} view(s) from the database`);
      }
      console.log(`   • Delete ALL data and schema`);
      console.log(`   • This action CANNOT be reversed or undone`);

      // Show database info again for emphasis
      console.log('\n📍 Target Database:');
      if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://')) {
        // Show FULL URL for Turso databases
        console.log(`   ${databaseUrl}`);
        console.log(`   ⚠️  This is a REMOTE Turso database`);
        console.log(`   ⚠️  Changes will affect all users/environments using this DB`);
      } else if (databaseUrl === ':memory:' || databaseUrl.includes('memory')) {
        console.log(`   ${databaseUrl} (Test/In-Memory)`);
      } else {
        console.log(`   ${databaseUrl}`);
      }

      if (tablesToDrop.length > 0) {
        console.log('\n📋 Tables to be dropped:');
        tablesToDrop.forEach((table, index) => {
          console.log(`   ${index + 1}. ${table.name}`);
        });
      }

      if (viewsToDrop.length > 0) {
        console.log('\n👁️  Views to be dropped:');
        viewsToDrop.forEach((view, index) => {
          console.log(`   ${index + 1}. ${view.name}`);
        });
      }

      const answer = await askConfirmation('\nDo you understand the consequences? (yes/no): ');

      if (answer !== 'yes') {
        console.log('\n❌ Operation cancelled. No tables were dropped.');
        return;
      }

      // Double confirmation for extra safety
      console.log('\n🔐 Final confirmation required.');
      console.log('   Type the database URL or "DROP ALL TABLES" to proceed:');
      const doubleCheck = await askConfirmation('Confirmation: ');

      // Accept either the full database URL or the safety phrase
      const isUrlMatch = doubleCheck === databaseUrl;
      const isSafetyPhrase = doubleCheck.toLowerCase() === 'drop all tables';

      if (!isUrlMatch && !isSafetyPhrase) {
        console.log('\n❌ Operation cancelled. Confirmation text did not match.');
        console.log('   You must type either:');
        console.log('   1. The exact database URL, or');
        console.log('   2. "DROP ALL TABLES" (case insensitive)');
        return;
      }
    }

    console.log('\n🔧 Dropping database objects...\n');

    // Disable foreign key checks to avoid constraint issues
    console.log('   Disabling foreign key constraints...');
    await db.execute({ sql: 'PRAGMA foreign_keys = OFF', args: [] });

    // Drop views first (views may depend on tables)
    let viewsDroppedCount = 0;
    if (viewsToDrop.length > 0) {
      console.log('\n   📝 Dropping views...');
      for (const view of viewsToDrop) {
        const viewName = view.name;
        try {
          console.log(`   ✓ Dropping view: ${viewName}`);
          await db.execute({
            sql: `DROP VIEW IF EXISTS ${viewName}`,
            args: []
          });
          viewsDroppedCount++;
        } catch (error) {
          console.error(`   ✗ Failed to drop view ${viewName}:`, error.message);
        }
      }
    }

    // Drop tables
    let tablesDroppedCount = 0;
    if (tablesToDrop.length > 0) {
      console.log('\n   📋 Dropping tables...');
      for (const table of tablesToDrop) {
        const tableName = table.name;
        try {
          console.log(`   ✓ Dropping table: ${tableName}`);
          await db.execute({
            sql: `DROP TABLE IF EXISTS ${tableName}`,
            args: []
          });
          tablesDroppedCount++;
        } catch (error) {
          console.error(`   ✗ Failed to drop table ${tableName}:`, error.message);
        }
      }
    }

    // Re-enable foreign key checks
    console.log('\n   Re-enabling foreign key constraints...');
    await db.execute({ sql: 'PRAGMA foreign_keys = ON', args: [] });

    console.log(`\n✅ Successfully dropped ${viewsDroppedCount} view(s) and ${tablesDroppedCount} table(s)!`);

    if (!flags.dropMigrations) {
      console.log('\n💡 Next steps:');
      console.log('   1. Run: npm run migrate:up');
      console.log('   2. Your migrations will rebuild the schema from scratch');
    } else {
      console.log('\n💡 Next steps:');
      console.log('   1. Re-initialize migrations tracking (if needed)');
      console.log('   2. Run: npm run migrate:up');
      console.log('   3. All migrations will be applied as fresh');
    }

  } catch (error) {
    console.error('\n❌ Error dropping tables:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Execute the script
dropAllTables()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });