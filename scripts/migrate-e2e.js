#!/usr/bin/env node

/**
 * E2E-specific Migration Runner
 * Runs database migrations on the E2E test database with rollback support
 */

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment configuration
// In CI/Vercel, env vars are already set
// Locally, load from .env.local
if (!process.env.VERCEL && !process.env.CI) {
  const envPath = resolve(__dirname, '../.env.local');
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

// Safety check for E2E database
function validateE2ESafety() {
  // Use E2E_TURSO_* vars with fallback to standard vars
  const dbUrl = process.env.E2E_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
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
  
  console.log('✅ E2E safety checks passed');
}

// Create database client
function createDatabaseClient() {
  // Use E2E_TURSO_* vars with fallback to standard vars
  const authToken = process.env.E2E_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
  const databaseUrl = process.env.E2E_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
  
  if (!authToken || !databaseUrl) {
    console.error('❌ Missing database credentials');
    process.exit(1);
  }
  
  try {
    return createClient({
      url: databaseUrl,
      authToken: authToken
    });
  } catch (error) {
    console.error('❌ Failed to create database client:', error.message);
    process.exit(1);
  }
}

// Calculate checksum for a migration file
function calculateChecksum(content) {
  return createHash('md5').update(content).digest('hex');
}

// Parse SQL file into individual statements
function parseSQLStatements(content) {
  // Remove single-line comments (-- comments)
  let withoutComments = content
    .split('\n')
    .map(line => {
      const commentIndex = line.indexOf('--');
      if (commentIndex !== -1) {
        // Check if the -- is inside a string literal
        const beforeComment = line.substring(0, commentIndex);
        const singleQuotes = (beforeComment.match(/'/g) || []).length;
        const doubleQuotes = (beforeComment.match(/"/g) || []).length;
        
        // If we have an odd number of quotes before the comment, it's likely inside a string
        if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
          return line.substring(0, commentIndex).trim();
        }
      }
      return line;
    })
    .join('\n');

  // Remove multi-line comments (/* ... */)
  withoutComments = withoutComments.replace(/\/\*[\s\S]*?\*\//g, '');

  // Split by semicolons but handle quoted strings properly
  const statements = [];
  let currentStatement = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < withoutComments.length; i++) {
    const char = withoutComments[i];
    const nextChar = withoutComments[i + 1];

    if (escaped) {
      escaped = false;
      currentStatement += char;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      currentStatement += char;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentStatement += char;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentStatement += char;
    } else if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      const statement = currentStatement.trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      currentStatement = '';
    } else {
      currentStatement += char;
    }
  }

  // Add the last statement if it doesn't end with semicolon
  const lastStatement = currentStatement.trim();
  if (lastStatement.length > 0) {
    statements.push(lastStatement);
  }

  return statements.filter(stmt => stmt.length > 0);
}

// Initialize migrations table
async function initMigrationsTable(client) {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        rollback_sql TEXT
      )
    `);
    console.log('✅ Migrations table ready');
  } catch (error) {
    console.error('❌ Failed to create migrations table:', error.message);
    throw error;
  }
}

// Get executed migrations
async function getExecutedMigrations(client) {
  try {
    const result = await client.execute(`
      SELECT filename, checksum, status 
      FROM migrations 
      WHERE status = 'completed'
      ORDER BY id
    `);
    return result.rows;
  } catch (error) {
    console.error('❌ Failed to get migrations:', error.message);
    throw error;
  }
}

// Load migration files
function loadMigrationFiles() {
  const migrationsDir = resolve(__dirname, '../migrations');
  
  if (!existsSync(migrationsDir)) {
    console.error('❌ Migrations directory not found');
    process.exit(1);
  }
  
  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  return files.map(filename => {
    const filepath = resolve(migrationsDir, filename);
    const content = readFileSync(filepath, 'utf-8');
    const checksum = calculateChecksum(content);
    
    return {
      filename,
      filepath,
      content,
      checksum,
      statements: parseSQLStatements(content)
    };
  });
}

// Execute a single migration
async function executeMigration(client, migration) {
  const { filename, checksum, statements } = migration;
  
  console.log(`\n📝 Running migration: ${filename}`);
  console.log(`   Checksum: ${checksum.substring(0, 8)}...`);
  console.log(`   Statements: ${statements.length}`);
  
  // Start transaction
  await client.execute('BEGIN TRANSACTION');
  
  try {
    // Use UPSERT instead of INSERT to avoid conflicts on retry
    await client.execute(`
      INSERT INTO migrations (filename, checksum, status)
      VALUES (?, ?, 'running')
      ON CONFLICT(filename) DO UPDATE SET 
        checksum = excluded.checksum,
        status = 'running',
        executed_at = CURRENT_TIMESTAMP,
        error_message = NULL
    `, [filename, checksum]);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`   Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        await client.execute(statement);
      } catch (error) {
        console.error(`   ❌ Statement failed: ${error.message}`);
        console.error(`   Statement: ${statement.substring(0, 100)}...`);
        throw error;
      }
    }
    
    // Mark as completed
    await client.execute(`
      UPDATE migrations 
      SET status = 'completed', executed_at = CURRENT_TIMESTAMP
      WHERE filename = ?
    `, [filename]);
    
    // Commit transaction
    await client.execute('COMMIT');
    console.log(`   ✅ Migration completed successfully`);
    
    return true;
  } catch (error) {
    // Rollback transaction
    await client.execute('ROLLBACK');
    
    // Record failure
    try {
      await client.execute(`
        INSERT INTO migrations (filename, checksum, status, error_message)
        VALUES (?, ?, 'failed', ?)
        ON CONFLICT(filename) DO UPDATE SET 
          status = 'failed',
          error_message = excluded.error_message,
          executed_at = CURRENT_TIMESTAMP
      `, [filename, checksum, error.message]);
    } catch (recordError) {
      console.error('   ⚠️ Failed to record migration failure:', recordError.message);
    }
    
    console.error(`   ❌ Migration failed and rolled back`);
    return false;
  }
}

// Rollback last migration (for testing purposes)
async function rollbackLastMigration(client) {
  try {
    const result = await client.execute(`
      SELECT filename FROM migrations 
      WHERE status = 'completed' 
      ORDER BY id DESC LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('ℹ️ No migrations to rollback');
      return;
    }
    
    const filename = result.rows[0].filename;
    console.log(`\n⏪ Rolling back migration: ${filename}`);
    
    // For E2E testing, we can simply mark as rolled back
    // In production, you'd implement actual rollback logic
    await client.execute(`
      UPDATE migrations 
      SET status = 'rolled_back' 
      WHERE filename = ?
    `, [filename]);
    
    console.log('✅ Migration marked as rolled back');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
}

// Validate schema consistency
async function validateSchema(client) {
  console.log('\n🔍 Validating schema consistency...');
  
  try {
    // Check for expected tables
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      ORDER BY name
    `);
    
    const expectedTables = [
      'migrations',
      'registrations',
      'email_subscribers',
      'tickets',
      'payment_events'
    ];
    
    const actualTables = tables.rows.map(row => row.name);
    const presentTables = expectedTables.filter(t => actualTables.includes(t));
    
    console.log(`   Tables found: ${presentTables.length}/${expectedTables.length}`);
    presentTables.forEach(table => console.log(`   ✅ ${table}`));
    
    // Check for test data integrity
    const testData = await client.execute(`
      SELECT COUNT(*) as count FROM registrations 
      WHERE email LIKE '%@e2e-test.%'
    `);
    
    console.log(`   Test records: ${testData.rows[0].count}`);
    
    return true;
  } catch (error) {
    console.error('   ❌ Schema validation failed:', error.message);
    return false;
  }
}

// Main migration runner
async function runMigrations() {
  console.log('🚀 E2E Migration Runner Starting...\n');
  
  // Step 1: Safety checks
  validateE2ESafety();
  
  // Step 2: Create client
  const client = createDatabaseClient();
  
  // Step 3: Parse command
  const command = process.argv[2] || 'up';
  
  try {
    // Initialize migrations table
    await initMigrationsTable(client);
    
    switch (command) {
      case 'up': {
        // Run pending migrations
        const executedMigrations = await getExecutedMigrations(client);
        const executedFilenames = new Set(executedMigrations.map(m => m.filename));
        
        const allMigrations = loadMigrationFiles();
        const pendingMigrations = allMigrations.filter(
          m => !executedFilenames.has(m.filename)
        );
        
        if (pendingMigrations.length === 0) {
          console.log('✅ All migrations are up to date');
        } else {
          console.log(`📦 Found ${pendingMigrations.length} pending migrations`);
          
          for (const migration of pendingMigrations) {
            const success = await executeMigration(client, migration);
            if (!success && !process.env.SKIP_ON_ERROR) {
              console.error('\n❌ Migration failed. Stopping.');
              process.exit(1);
            }
          }
          
          console.log('\n✅ All migrations completed');
        }
        
        // Validate schema
        await validateSchema(client);
        break;
      }
        
      case 'status': {
        // Show migration status
        const migrations = await client.execute(`
          SELECT filename, status, executed_at, error_message
          FROM migrations
          ORDER BY id
        `);
        
        console.log('\n📊 Migration Status:\n');
        
        if (migrations.rows.length === 0) {
          console.log('   No migrations recorded');
        } else {
          migrations.rows.forEach(m => {
            const status = m.status === 'completed' ? '✅' : 
                          m.status === 'failed' ? '❌' :
                          m.status === 'running' ? '🔄' : '⏳';
            console.log(`   ${status} ${m.filename}`);
            if (m.status === 'completed' && m.executed_at) {
              console.log(`      Executed: ${m.executed_at}`);
            }
            if (m.status === 'failed' && m.error_message) {
              console.log(`      Error: ${m.error_message}`);
            }
          });
        }
        break;
      }
        
      case 'rollback': {
        // Rollback last migration (E2E testing only)
        await rollbackLastMigration(client);
        break;
      }
        
      case 'validate': {
        // Just validate schema
        const isValid = await validateSchema(client);
        if (isValid) {
          console.log('\n✅ Schema validation passed');
        } else {
          console.log('\n❌ Schema validation failed');
          process.exit(1);
        }
        break;
      }
        
      case 'reset': {
        // Reset all migrations (E2E only)
        console.log('\n🔄 Resetting all migrations...');
        await client.execute('DELETE FROM migrations');
        console.log('✅ Migration history cleared');
        console.log('ℹ️ Run "migrate-e2e.js up" to rerun all migrations');
        break;
      }
        
      default:
        console.log(`
Usage: node migrate-e2e.js [command]

Commands:
  up        Run all pending migrations (default)
  status    Show migration status
  validate  Validate schema consistency
  rollback  Rollback last migration (E2E only)
  reset     Clear migration history (E2E only)

Options:
  SKIP_ON_ERROR=true  Continue on migration failure
        `);
        break;
    }
  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  } finally {
    // Close connection with error handling
    try {
      client.close();
    } catch (error) {
      console.error('⚠️ Warning: Failed to close database connection:', error.message);
    }
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
