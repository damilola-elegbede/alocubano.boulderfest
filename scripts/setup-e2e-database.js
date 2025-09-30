#!/usr/bin/env node

/**
 * E2E Database Setup Automation Script
 * Sets up and validates the E2E test database instance
 */

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { columnExists } from "../lib/db-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment configuration
// In CI/Vercel, env vars are already set
// Locally, load from .env.vercel
if (!process.env.VERCEL && !process.env.CI) {
  const envPath = resolve(__dirname, '../.env.vercel');
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

// Safety check: Ensure we're using E2E database
function validateDatabaseSafety() {
  // Use standard Turso environment variables
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const isE2E = process.env.E2E_TEST_MODE === 'true' ||
                process.env.ENVIRONMENT === 'e2e-test' ||
                process.env.NODE_ENV === 'test';

  if (!isE2E) {
    console.error('❌ Safety check failed: Not in E2E test mode');
    console.error('   Set E2E_TEST_MODE=true or ENVIRONMENT=e2e-test');
    process.exit(1);
  }

  // In E2E mode, warn if database URL doesn't look like a test database
  if (dbUrl && !dbUrl.includes('test') && !dbUrl.includes('staging')) {
    console.warn('⚠️  Warning: Database URL does not contain "test" or "staging"');
    console.warn('   Please verify you are using the correct E2E test database');
  }

  console.log('✅ E2E mode safety checks passed');
}

// Create database client
function createDatabaseClient() {
  // Use standard Turso environment variables
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const databaseUrl = process.env.TURSO_DATABASE_URL;

  if (!authToken || !databaseUrl) {
    console.error('❌ Missing database credentials');
    console.error('   Required: TURSO_AUTH_TOKEN, TURSO_DATABASE_URL');
    process.exit(1);
  }

  try {
    const client = createClient({
      url: databaseUrl,
      authToken: authToken
    });
    console.log('✅ Database client created successfully');
    return client;
  } catch (error) {
    console.error('❌ Failed to create database client:', error.message);
    process.exit(1);
  }
}

// Test database connection
async function testConnection(client) {
  try {
    const result = await client.execute('SELECT 1 as test');
    if (result.rows[0].test === 1) {
      console.log('✅ Database connection test successful');
      return true;
    }
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

// Create core tables for testing
async function createCoreTables(client) {
  const tables = [
    {
      name: 'migrations',
      sql: `
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL UNIQUE,
          checksum TEXT NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'pending'
        )
      `
    },
    {
      name: 'registrations',
      sql: `
        CREATE TABLE IF NOT EXISTS registrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          ticket_type TEXT NOT NULL,
          purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          stripe_session_id TEXT,
          qr_code TEXT,
          status TEXT DEFAULT 'active'
        )
      `
    },
    {
      name: 'email_subscribers',
      sql: `
        CREATE TABLE IF NOT EXISTS email_subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          first_name TEXT,
          last_name TEXT,
          phone TEXT,
          status TEXT DEFAULT 'pending' CHECK (
            status IN ('pending', 'active', 'unsubscribed', 'bounced')
          ),
          brevo_contact_id TEXT,
          list_ids TEXT DEFAULT '[]',
          attributes TEXT DEFAULT '{}',
          consent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          consent_source TEXT DEFAULT 'website',
          consent_ip TEXT,
          verification_token TEXT,
          verified_at TIMESTAMP,
          unsubscribed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
    },
    {
      name: 'email_events',
      sql: `
        CREATE TABLE IF NOT EXISTS email_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subscriber_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          event_data TEXT DEFAULT '{}',
          brevo_event_id TEXT,
          occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (subscriber_id) REFERENCES email_subscribers(id) ON DELETE CASCADE
        )
      `
    },
    {
      name: 'email_audit_log',
      sql: `
        CREATE TABLE IF NOT EXISTS email_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          actor_id TEXT,
          changes TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
    }
  ];

  console.log('\n📦 Creating core tables...');

  for (const table of tables) {
    try {
      await client.execute(table.sql);
      console.log(`   ✅ Table "${table.name}" created/verified`);

      // Add missing columns to existing tables
      if (table.name === 'email_subscribers') {
        // Check if source column exists
        try {
          const hasSourceColumn = await columnExists(client, 'email_subscribers', 'source');

          if (!hasSourceColumn) {
            // Add source column to existing table
            await client.execute(`ALTER TABLE email_subscribers ADD COLUMN source TEXT DEFAULT 'website'`);
            console.log(`   ✅ Added missing "source" column to email_subscribers`);
          }
        } catch (alterError) {
          console.log(`   ⚠️  ALTER TABLE warning: ${alterError.message}`);
          // Check if error is due to duplicate column (acceptable)
          if (alterError.message.includes('duplicate column') ||
              alterError.message.includes('already exists')) {
            console.log(`   ℹ️  Column "source" already exists, continuing...`);
          } else {
            console.error(`   ❌ Unexpected ALTER TABLE error: ${alterError.message}`);
            return false;
          }

          // Verify the column exists after error
          try {
            const columnExistsAfterError = await columnExists(client, 'email_subscribers', 'source');
            if (!columnExistsAfterError) {
              console.error(`   ❌ Failed to verify "source" column existence`);
              return false;
            }
          } catch (verifyError) {
            console.error(`   ❌ Failed to verify column after ALTER: ${verifyError.message}`);
            return false;
          }
        }      }
    } catch (error) {
      console.error(`   ❌ Failed to create table "${table.name}":`, error.message);
      return false;
    }
  }

  return true;
}

// Validate database schema
async function validateSchema(client) {
  console.log('\n🔍 Validating database schema...');

  try {
    // Check table existence
    const tablesResult = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name IN ('migrations', 'registrations', 'email_subscribers', 'email_events', 'email_audit_log')
      ORDER BY name
    `);

    const expectedTables = ['email_subscribers', 'email_events', 'email_audit_log', 'migrations', 'registrations'];
    const actualTables = tablesResult.rows.map(row => row.name);

    const missingTables = expectedTables.filter(t => !actualTables.includes(t));
    if (missingTables.length > 0) {
      console.error(`   ❌ Missing tables: ${missingTables.join(', ')}`);
      return false;
    }

    console.log(`   ✅ All required tables exist: ${actualTables.join(', ')}`);

    // Validate registrations table structure
    const columnsResult = await client.execute(`
      PRAGMA table_info(registrations)
    `);

    const requiredColumns = ['ticket_id', 'email', 'first_name', 'last_name', 'ticket_type'];
    const actualColumns = columnsResult.rows.map(row => row.name);
    const missingColumns = requiredColumns.filter(c => !actualColumns.includes(c));

    if (missingColumns.length > 0) {
      console.error(`   ❌ Missing columns in registrations: ${missingColumns.join(', ')}`);
      return false;
    }

    console.log(`   ✅ Registrations table has all required columns`);
    return true;

  } catch (error) {
    console.error('   ❌ Schema validation failed:', error.message);
    return false;
  }
}

// Insert test data
async function insertTestData(client) {
  console.log('\n🔧 Inserting test data...');

  try {
    // Clear existing test data
    await client.execute("DELETE FROM registrations WHERE email LIKE '%@e2e-test.%'");
    await client.execute("DELETE FROM email_subscribers WHERE email LIKE '%@e2e-test.%'");

    // Insert test registration
    await client.execute(`
      INSERT INTO registrations (
        ticket_id, email, first_name, last_name,
        ticket_type, stripe_session_id, qr_code, status
      ) VALUES (
        'E2E-FAKE-001', 'fake-user@e2e-test.invalid', 'Fake', 'TestUser',
        'full-pass', 'cs_fake_e2e_session_123456', 'QR-FAKE-E2E-001', 'active'
      )
    `);
    console.log('   ✅ Test registration created');

    // Insert test subscriber
    await client.execute(`
      INSERT INTO email_subscribers (
        email, first_name, last_name, status, consent_source,
        list_ids, attributes, brevo_contact_id
      ) VALUES (
        'fake-subscriber@e2e-test.invalid', 'Test', 'Subscriber', 'active',
        'e2e-test', '[]', '{}', NULL
      )
    `);
    console.log('   ✅ Test subscriber created');

    // Verify data insertion
    const regCount = await client.execute("SELECT COUNT(*) as count FROM registrations WHERE email LIKE '%@e2e-test.%'");
    const subCount = await client.execute("SELECT COUNT(*) as count FROM email_subscribers WHERE email LIKE '%@e2e-test.%'");

    console.log(`   ✅ Test data verified: ${regCount.rows[0].count} registrations, ${subCount.rows[0].count} subscribers`);

    return true;
  } catch (error) {
    console.error('   ❌ Failed to insert test data:', error.message);
    return false;
  }
}

// Clean up database
async function cleanupDatabase(client, fullReset = false) {
  console.log('\n🧹 Cleaning up database...');

  try {
    if (fullReset) {
      // Drop all tables for full reset (order matters due to foreign keys)
      await client.execute("DROP TABLE IF EXISTS email_events");
      await client.execute("DROP TABLE IF EXISTS email_audit_log");
      await client.execute("DROP TABLE IF EXISTS email_subscribers");
      await client.execute("DROP TABLE IF EXISTS registrations");
      await client.execute("DROP TABLE IF EXISTS migrations");
      console.log('   ✅ All tables dropped for full reset');
    } else {
      // Just clean test data (order matters due to foreign keys)
      await client.execute("DELETE FROM email_events WHERE subscriber_id IN (SELECT id FROM email_subscribers WHERE email LIKE '%@e2e-test.%')");
      await client.execute("DELETE FROM email_audit_log WHERE entity_type = 'email_subscribers' AND entity_id IN (SELECT id FROM email_subscribers WHERE email LIKE '%@e2e-test.%')");
      await client.execute("DELETE FROM email_subscribers WHERE email LIKE '%@e2e-test.%'");
      await client.execute("DELETE FROM registrations WHERE email LIKE '%@e2e-test.%'");
      console.log('   ✅ Test data cleaned');
    }
    return true;
  } catch (error) {
    console.error('   ❌ Cleanup failed:', error.message);
    return false;
  }
}

// Main setup function
async function setupE2EDatabase() {
  console.log('🚀 E2E Database Setup Starting...\n');

  // Step 1: Validate safety checks
  validateDatabaseSafety();

  // Step 2: Create database client
  const client = createDatabaseClient();

  // Step 3: Test connection
  const connectionOk = await testConnection(client);
  if (!connectionOk) {
    process.exit(1);
  }

  // Step 4: Parse command line arguments
  const args = process.argv.slice(2);
  const command = args[0] || 'setup';

  switch (command) {
    case 'setup': {
      // Create tables and insert test data
      const tablesCreated = await createCoreTables(client);
      if (!tablesCreated) {
        process.exit(1);
      }

      const schemaValid = await validateSchema(client);
      if (!schemaValid) {
        process.exit(1);
      }

      const dataInserted = await insertTestData(client);
      if (!dataInserted) {
        process.exit(1);
      }

      console.log('\n✅ E2E database setup completed successfully!');
      break;
    }

    case 'validate': {
      // Just validate existing schema
      const isValid = await validateSchema(client);
      if (isValid) {
        console.log('\n✅ Database schema validation passed!');
      } else {
        console.log('\n❌ Database schema validation failed!');
        process.exit(1);
      }
      break;
    }

    case 'clean': {
      // Clean test data only
      const cleaned = await cleanupDatabase(client, false);
      if (cleaned) {
        console.log('\n✅ Database cleaned successfully!');
      } else {
        process.exit(1);
      }
      break;
    }

    case 'reset': {
      // Full reset - drop and recreate everything
      const reset = await cleanupDatabase(client, true);
      if (!reset) {
        process.exit(1);
      }

      const recreated = await createCoreTables(client);
      if (!recreated) {
        process.exit(1);
      }

      const reinserted = await insertTestData(client);
      if (!reinserted) {
        process.exit(1);
      }

      console.log('\n✅ Database fully reset successfully!');
      break;
    }

    default:
      console.log(`
Usage: node setup-e2e-database.js [command]

Commands:
  setup     Create tables and insert test data (default)
  validate  Validate existing database schema
  clean     Remove test data only
  reset     Drop all tables and recreate from scratch
      `);
      break;
  }

  // Close connection with error handling
  try {
    client.close();
  } catch (error) {
    console.error('⚠️ Warning: Failed to close database connection:', error.message);
  }
}

// Run the setup
setupE2EDatabase().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
