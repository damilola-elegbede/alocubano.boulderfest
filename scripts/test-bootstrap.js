#!/usr/bin/env node
/**
 * Test Bootstrap System
 *
 * Creates an in-memory database, runs migrations, then tests bootstrap
 * This validates the bootstrap system works correctly
 */

import { BootstrapSystem } from './bootstrap-vercel.js';
import { createLogger } from '../lib/bootstrap-helpers.js';
import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger('TestBootstrap');

async function runMigrations(db) {
  logger.info('📋 Running migrations...');

  const migrationsDir = path.join(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
      // Split on semicolons and execute each statement
      const statements = sql.split(';').filter(stmt => stmt.trim());

      for (const statement of statements) {
        if (statement.trim()) {
          await db.execute(statement.trim());
        }
      }

      logger.success(`   ✅ Applied migration: ${file}`);
    } catch (error) {
      logger.error(`   ❌ Migration failed: ${file} - ${error.message}`);
      throw error;
    }
  }
}

async function testBootstrap() {
  logger.info('\n🧪 Testing Bootstrap System');
  logger.info('═'.repeat(50));

  try {
    // Create in-memory database
    logger.info('🗄️  Creating test database...');
    const db = createClient({ url: ':memory:' });

    // Run migrations
    await runMigrations(db);

    // Create a mock bootstrap system that uses our test database
    class TestBootstrapSystem extends BootstrapSystem {
      async connect() {
        this.logger.info('\n🔌 Connecting to test database...');
        this.db = db;
        this.logger.success('   ✅ Connected to test database successfully');
        return this.db;
      }
    }

    // Set environment variables for test
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_EMAIL = 'test@example.com';

    // Run bootstrap
    const bootstrap = new TestBootstrapSystem();
    const exitCode = await bootstrap.run();

    if (exitCode === 0) {
      logger.success('\n🎉 Bootstrap test completed successfully!');

      // Verify data was created
      logger.info('\n🔍 Verifying bootstrap results...');

      const events = await db.execute('SELECT * FROM events');
      logger.info(`   📊 Events created: ${events.rows.length}`);

      const settings = await db.execute('SELECT * FROM event_settings');
      logger.info(`   📊 Settings created: ${settings.rows.length}`);

      const access = await db.execute('SELECT * FROM event_access');
      logger.info(`   📊 Access records created: ${access.rows.length}`);

      // Show some sample data
      if (events.rows.length > 0) {
        logger.info('\n📅 Sample events:');
        for (const event of events.rows) {
          logger.info(`   • ${event.name} (${event.slug}) - ${event.status}`);
        }
      }

      if (settings.rows.length > 0) {
        logger.info('\n⚙️  Sample settings:');
        const sampleSettings = settings.rows.slice(0, 5);
        for (const setting of sampleSettings) {
          logger.info(`   • ${setting.key}: ${setting.value}`);
        }
        if (settings.rows.length > 5) {
          logger.info(`   ... and ${settings.rows.length - 5} more`);
        }
      }

      logger.success('\n✨ All tests passed! Bootstrap system is working correctly.');
      return 0;
    } else {
      logger.error('\n❌ Bootstrap test failed!');
      return 1;
    }

  } catch (error) {
    logger.error('\n💥 Test failed with error:');
    logger.error(`   ${error.message}`);
    if (error.stack) {
      logger.error('\n   Stack trace:');
      logger.error(error.stack);
    }
    return 1;
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testBootstrap().then(code => {
    process.exit(code);
  }).catch(error => {
    console.error('Unexpected test error:', error);
    process.exit(1);
  });
}

export { testBootstrap };