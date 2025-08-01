#!/usr/bin/env node

/**
 * Database Migration Runner
 * Runs SQL migration files against Vercel Postgres database
 * Optimized for serverless deployment and CI/CD pipelines
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  migrationsDir: path.join(__dirname, '../migrations'),
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  lockTimeout: 30000, // 30 seconds
  queryTimeout: 60000, // 60 seconds
};

/**
 * Migration Runner Class
 */
class MigrationRunner {
  constructor() {
    this.pool = null;
    this.isLocked = false;
  }

  /**
   * Initialize database connection
   */
  async init() {
    if (!CONFIG.connectionString) {
      throw new Error('Database connection string not found. Please set POSTGRES_URL or DATABASE_URL environment variable.');
    }

    this.pool = new Pool({
      connectionString: CONFIG.connectionString,
      ssl: CONFIG.ssl,
      max: 5, // Smaller pool for migrations
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: CONFIG.queryTimeout,
      query_timeout: CONFIG.queryTimeout,
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      console.log('✅ Database connection established:', result.rows[0].now);
    } catch (error) {
      throw new Error(`Failed to connect to database: ${error.message}`);
    }
  }

  /**
   * Create migrations tracking table
   */
  async createMigrationsTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER,
        rollback_sql TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename);
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at ON schema_migrations(executed_at);
    `;

    await this.pool.query(createTableQuery);
    console.log('✅ Migrations tracking table ready');
  }

  /**
   * Acquire migration lock to prevent concurrent runs
   */
  async acquireLock() {
    const lockQuery = `
      SELECT pg_try_advisory_lock(12345) as acquired
    `;

    const result = await this.pool.query(lockQuery);
    this.isLocked = result.rows[0].acquired;

    if (!this.isLocked) {
      throw new Error('Could not acquire migration lock. Another migration may be running.');
    }

    console.log('🔒 Migration lock acquired');

    // Set up cleanup on exit
    process.on('exit', () => this.releaseLock());
    process.on('SIGINT', () => {
      this.releaseLock();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.releaseLock(); 
      process.exit(0);
    });
  }

  /**
   * Release migration lock
   */
  async releaseLock() {
    if (this.isLocked && this.pool) {
      try {
        await this.pool.query('SELECT pg_advisory_unlock(12345)');
        console.log('🔓 Migration lock released');
      } catch (error) {
        console.error('Error releasing lock:', error.message);
      }
      this.isLocked = false;
    }
  }

  /**
   * Get list of migration files
   */
  getMigrationFiles() {
    if (!fs.existsSync(CONFIG.migrationsDir)) {
      throw new Error(`Migrations directory not found: ${CONFIG.migrationsDir}`);
    }

    const files = fs.readdirSync(CONFIG.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure consistent ordering

    console.log(`📁 Found ${files.length} migration files`);
    return files;
  }

  /**
   * Get executed migrations from database
   */
  async getExecutedMigrations() {
    const query = 'SELECT filename, checksum FROM schema_migrations ORDER BY executed_at';
    const result = await this.pool.query(query);
    return new Map(result.rows.map(row => [row.filename, row.checksum]));
  }

  /**
   * Calculate file checksum
   */
  calculateChecksum(content) {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate migration file hasn't changed
   */
  validateMigration(filename, content, executedMigrations) {
    const currentChecksum = this.calculateChecksum(content);
    const storedChecksum = executedMigrations.get(filename);

    if (storedChecksum && storedChecksum !== currentChecksum) {
      throw new Error(
        `Migration file ${filename} has been modified after execution. ` +
        `Stored checksum: ${storedChecksum}, Current checksum: ${currentChecksum}`
      );
    }

    return currentChecksum;
  }

  /**
   * Execute a single migration
   */
  async executeMigration(filename, content, checksum) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const startTime = Date.now();
      console.log(`🚀 Executing migration: ${filename}`);

      // Split content into individual statements
      const statements = this.parseSqlStatements(content);
      
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }

      const executionTime = Date.now() - startTime;

      // Record migration execution
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum, execution_time_ms) VALUES ($1, $2, $3)',
        [filename, checksum, executionTime]
      );

      await client.query('COMMIT');
      
      console.log(`✅ Migration ${filename} completed in ${executionTime}ms`);
      return { success: true, executionTime };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration ${filename} failed:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Parse SQL content into individual statements
   */
  parseSqlStatements(content) {
    // Remove comments and normalize whitespace
    const cleanContent = content
      .replace(/--.*$/gm, '') // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Split on semicolons, but be careful about semicolons in strings
    const statements = [];
    let currentStatement = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < cleanContent.length; i++) {
      const char = cleanContent[i];
      const nextChar = cleanContent[i + 1];

      if (!inString && (char === "'" || char === '"')) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && cleanContent[i - 1] !== '\\') {
        inString = false;
        stringChar = '';
      } else if (!inString && char === ';') {
        statements.push(currentStatement.trim());
        currentStatement = '';
        continue;
      }

      currentStatement += char;
    }

    // Add the last statement if it doesn't end with semicolon
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements.filter(stmt => stmt.length > 0);
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(options = {}) {
    const { dryRun = false, force = false } = options;

    try {
      await this.init();
      await this.createMigrationsTable();
      await this.acquireLock();

      const migrationFiles = this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();

      if (migrationFiles.length === 0) {
        console.log('📝 No migration files found');
        return { executed: 0, skipped: 0 };
      }

      let executed = 0;
      let skipped = 0;

      for (const filename of migrationFiles) {
        const filePath = path.join(CONFIG.migrationsDir, filename);
        const content = fs.readFileSync(filePath, 'utf8');
        
        try {
          const checksum = this.validateMigration(filename, content, executedMigrations);
          
          if (executedMigrations.has(filename)) {
            console.log(`⏭️  Skipping already executed migration: ${filename}`);
            skipped++;
            continue;
          }

          if (dryRun) {
            console.log(`🔍 Would execute migration: ${filename}`);
            executed++;
            continue;
          }

          await this.executeMigration(filename, content, checksum);
          executed++;

        } catch (error) {
          console.error(`❌ Error processing migration ${filename}:`, error.message);
          if (!force) {
            throw error;
          }
          console.log('⚠️  Continuing due to --force flag');
        }
      }

      console.log(`\n📊 Migration Summary:`);
      console.log(`   Executed: ${executed}`);
      console.log(`   Skipped: ${skipped}`);
      console.log(`   Total: ${migrationFiles.length}`);

      return { executed, skipped };

    } finally {
      await this.releaseLock();
      if (this.pool) {
        await this.pool.end();
      }
    }
  }

  /**
   * Show migration status
   */
  async showStatus() {
    try {
      await this.init();
      await this.createMigrationsTable();

      const migrationFiles = this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();

      console.log('\n📋 Migration Status:');
      console.log('='.repeat(60));

      for (const filename of migrationFiles) {
        const isExecuted = executedMigrations.has(filename);
        const status = isExecuted ? '✅ Executed' : '⏳ Pending';
        console.log(`${status.padEnd(12)} ${filename}`);
      }

      console.log('='.repeat(60));
      console.log(`Total: ${migrationFiles.length}, Executed: ${executedMigrations.size}, Pending: ${migrationFiles.length - executedMigrations.size}`);

    } finally {
      if (this.pool) {
        await this.pool.end();
      }
    }
  }

  /**
   * Reset all migrations (dangerous!)
   */
  async reset(options = {}) {
    const { force = false } = options;

    if (!force) {
      throw new Error('Reset requires --force flag. This will delete all migration records!');
    }

    try {
      await this.init();
      await this.acquireLock();

      console.log('⚠️  RESETTING ALL MIGRATIONS - This will delete migration history!');
      
      await this.pool.query('DELETE FROM schema_migrations');
      console.log('✅ Migration history cleared');

    } finally {
      await this.releaseLock();
      if (this.pool) {
        await this.pool.end();
      }
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';
  
  const options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    help: args.includes('--help') || args.includes('-h'),
  };

  if (options.help) {
    console.log(`
Database Migration Runner

Usage:
  node run-migrations.js [command] [options]

Commands:
  run      Run pending migrations (default)
  status   Show migration status
  reset    Reset migration history (requires --force)

Options:
  --dry-run    Show what would be executed without running
  --force      Continue on errors or force dangerous operations
  --help, -h   Show this help message

Examples:
  node run-migrations.js run
  node run-migrations.js status
  node run-migrations.js run --dry-run
  node run-migrations.js reset --force
`);
    return;
  }

  const runner = new MigrationRunner();

  try {
    switch (command) {
      case 'run':
        await runner.runMigrations(options);
        break;
      case 'status':
        await runner.showStatus();
        break;
      case 'reset':
        await runner.reset(options);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Use --help for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default MigrationRunner;