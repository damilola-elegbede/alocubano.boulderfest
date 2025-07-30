#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Migration configuration
const config = {
  development: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/alocubano_dev',
    ssl: false
  },
  staging: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  },
  production: {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: true,
      ca: process.env.DATABASE_CA_CERT
    }
  }
};

class DatabaseMigration {
  constructor(environment = 'development') {
    this.environment = environment;
    this.config = config[environment];
    this.client = null;
    this.migrationsPath = join(dirname(__dirname), 'migrations');
  }

  async connect() {
    try {
      this.client = new pg.Client(this.config);
      await this.client.connect();
      console.log(`✅ Connected to ${this.environment} database`);
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('Disconnected from database');
    }
  }

  async createMigrationsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER,
        checksum VARCHAR(64),
        rollback_sql TEXT
      );
    `;

    try {
      await this.client.query(query);
      console.log('✅ Migrations table ready');
    } catch (error) {
      console.error('❌ Failed to create migrations table:', error.message);
      throw error;
    }
  }

  async getExecutedMigrations() {
    const query = 'SELECT version FROM schema_migrations ORDER BY version';
    const result = await this.client.query(query);
    return result.rows.map(row => row.version);
  }

  async getMigrationFiles() {
    const files = readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();
    return files;
  }

  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async runMigration(filename) {
    const filepath = join(this.migrationsPath, filename);
    const content = readFileSync(filepath, 'utf8');
    const checksum = this.calculateChecksum(content);

    console.log(`\n🔄 Running migration: ${filename}`);

    const startTime = Date.now();

    try {
      // Start transaction
      await this.client.query('BEGIN');

      // Execute migration
      await this.client.query(content);

      // Record migration
      const recordQuery = `
        INSERT INTO schema_migrations (version, execution_time_ms, checksum)
        VALUES ($1, $2, $3)
      `;
      
      const executionTime = Date.now() - startTime;
      await this.client.query(recordQuery, [filename, executionTime, checksum]);

      // Commit transaction
      await this.client.query('COMMIT');

      console.log(`✅ Migration completed in ${executionTime}ms`);
      return { success: true, executionTime };
    } catch (error) {
      // Rollback transaction
      await this.client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${error.message}`);
      throw error;
    }
  }

  async rollbackMigration(version) {
    console.log(`\n🔄 Rolling back migration: ${version}`);

    try {
      // Start transaction
      await this.client.query('BEGIN');

      // Get rollback SQL if stored
      const result = await this.client.query(
        'SELECT rollback_sql FROM schema_migrations WHERE version = $1',
        [version]
      );

      if (result.rows[0]?.rollback_sql) {
        // Execute rollback SQL
        await this.client.query(result.rows[0].rollback_sql);
      }

      // Remove migration record
      await this.client.query(
        'DELETE FROM schema_migrations WHERE version = $1',
        [version]
      );

      // Commit transaction
      await this.client.query('COMMIT');

      console.log('✅ Rollback completed');
    } catch (error) {
      await this.client.query('ROLLBACK');
      console.error(`❌ Rollback failed: ${error.message}`);
      throw error;
    }
  }

  async migrate() {
    try {
      await this.connect();
      await this.createMigrationsTable();

      const executedMigrations = await this.getExecutedMigrations();
      const migrationFiles = await this.getMigrationFiles();
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ Database is up to date');
        return;
      }

      console.log(`Found ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        await this.runMigration(migration);
      }

      console.log('\n✅ All migrations completed successfully');
    } catch (error) {
      console.error('\n❌ Migration process failed:', error.message);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  async status() {
    try {
      await this.connect();
      await this.createMigrationsTable();

      const executedMigrations = await this.getExecutedMigrations();
      const migrationFiles = await this.getMigrationFiles();

      console.log('\n📊 Migration Status');
      console.log('==================');

      for (const file of migrationFiles) {
        const status = executedMigrations.includes(file) ? '✅' : '⏳';
        console.log(`${status} ${file}`);
      }

      const pending = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );
      
      console.log(`\nTotal: ${migrationFiles.length}`);
      console.log(`Executed: ${executedMigrations.length}`);
      console.log(`Pending: ${pending.length}`);
    } finally {
      await this.disconnect();
    }
  }

  async validate() {
    try {
      await this.connect();

      console.log('\n🔍 Validating database schema...');

      // Check critical tables
      const tables = [
        'customers',
        'payment_methods',
        'orders',
        'order_items',
        'payments',
        'refunds',
        'webhook_events',
        'payment_audit_log',
        'discount_codes'
      ];

      for (const table of tables) {
        const result = await this.client.query(
          `SELECT COUNT(*) FROM information_schema.tables 
           WHERE table_schema = 'public' AND table_name = $1`,
          [table]
        );

        if (result.rows[0].count === '0') {
          console.error(`❌ Missing table: ${table}`);
        } else {
          console.log(`✅ Table exists: ${table}`);
        }
      }

      // Check critical indexes
      const indexes = [
        'idx_customers_email',
        'idx_payments_order',
        'idx_orders_status'
      ];

      for (const index of indexes) {
        const result = await this.client.query(
          `SELECT COUNT(*) FROM pg_indexes 
           WHERE schemaname = 'public' AND indexname = $1`,
          [index]
        );

        if (result.rows[0].count === '0') {
          console.error(`❌ Missing index: ${index}`);
        } else {
          console.log(`✅ Index exists: ${index}`);
        }
      }

      console.log('\n✅ Schema validation completed');
    } finally {
      await this.disconnect();
    }
  }
}

// CLI interface
const command = process.argv[2];
const environment = process.env.NODE_ENV || 'development';

const migration = new DatabaseMigration(environment);

switch (command) {
  case 'up':
  case 'migrate':
    migration.migrate().catch(process.exit.bind(process, 1));
    break;
    
  case 'down':
  case 'rollback':
    const version = process.argv[3];
    if (!version) {
      console.error('Please specify a migration version to rollback');
      process.exit(1);
    }
    migration.rollbackMigration(version).catch(process.exit.bind(process, 1));
    break;
    
  case 'status':
    migration.status().catch(process.exit.bind(process, 1));
    break;
    
  case 'validate':
    migration.validate().catch(process.exit.bind(process, 1));
    break;
    
  default:
    console.log(`
Database Migration Tool

Usage:
  node scripts/database-migration.js <command> [options]

Commands:
  up, migrate     Run all pending migrations
  down, rollback  Rollback a specific migration
  status          Show migration status
  validate        Validate database schema

Environment:
  Set NODE_ENV to 'development', 'staging', or 'production'
  Current: ${environment}
    `);
}