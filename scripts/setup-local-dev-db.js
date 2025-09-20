#!/usr/bin/env node

/**
 * Local Development Database Setup
 * Creates a SQLite database with proper schema for local development
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../data/development.db');
const dataDir = dirname(dbPath);

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

console.log('🚀 Setting up local development database...\n');

// Create database connection
const db = new Database(dbPath);

try {
  console.log('📦 Creating tables...');

  // Create migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending'
    )
  `);
  console.log('  ✅ migrations table created');

  // Create registrations table
  db.exec(`
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
  `);
  console.log('  ✅ registrations table created');

  // Create email_subscribers table with full schema
  db.exec(`
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
  `);
  console.log('  ✅ email_subscribers table created');

  // Create email_events table
  db.exec(`
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
  `);
  console.log('  ✅ email_events table created');

  // Create email_audit_log table
  db.exec(`
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
  `);
  console.log('  ✅ email_audit_log table created');

  console.log('\n🔍 Verifying schema...');

  // Verify email_subscribers schema
  const columns = db.prepare(`PRAGMA table_info(email_subscribers)`).all();
  const columnNames = columns.map(col => col.name);
  const requiredColumns = ['brevo_contact_id', 'list_ids', 'attributes', 'consent_date', 'consent_source'];

  const missing = requiredColumns.filter(col => !columnNames.includes(col));
  if (missing.length > 0) {
    console.error(`❌ Missing columns: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('  ✅ All required columns present');
  console.log(`  ℹ️  email_subscribers columns: ${columnNames.join(', ')}`);

  console.log('\n🧪 Adding test data...');

  // Insert test data
  const insertSubscriber = db.prepare(`
    INSERT OR REPLACE INTO email_subscribers (
      email, first_name, last_name, status, consent_source,
      list_ids, attributes, brevo_contact_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertSubscriber.run(
    'test-subscriber@local-dev.invalid',
    'Test',
    'Subscriber',
    'active',
    'dev-setup',
    '[]',
    '{}',
    null
  );

  console.log('  ✅ Test subscriber created');

  console.log('\n✅ Local development database setup complete!');
  console.log(`📁 Database file: ${dbPath}`);

} catch (error) {
  console.error('❌ Setup failed:', error);
  process.exit(1);
} finally {
  db.close();
}