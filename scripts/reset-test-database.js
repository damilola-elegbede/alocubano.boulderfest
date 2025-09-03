/**
 * Test Database Reset Functionality
 * Provides safe database reset for test environments only
 */

import { getDatabaseClient } from '../api/lib/database.js';

/**
 * Reset the test database to a clean state
 * @param {string} mode - Reset mode: 'soft' (preserve schema) or 'full' (complete reset)
 * @param {Object} options - Additional options for reset
 * @returns {Promise<Object>} Reset result with statistics
 */
export async function resetTestDatabase(mode = 'soft', options = {}) {
  // Prevent accidental production resets
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database reset not allowed in production');
  }
  
  if (process.env.TURSO_DATABASE_URL && !process.env.TEST_DATABASE_RESET_ALLOWED) {
    throw new Error('Test database reset requires TEST_DATABASE_RESET_ALLOWED=true');
  }
  
  console.log(`🔄 Performing ${mode} database reset for tests`);
  
  try {
    const client = await getDatabaseClient();
    let recordsCleaned = 0;
    
    if (mode === 'full') {
      // Full reset - drop all tables except migrations
      const tables = ['tickets', 'registrations', 'admin_sessions', 'newsletter_subscribers'];
      for (const table of tables) {
        try {
          await client.execute(`DELETE FROM ${table}`);
          const result = await client.execute(`SELECT changes() as count`);
          recordsCleaned += result.rows[0]?.count || 0;
        } catch (err) {
          // Table might not exist yet
          console.log(`Table ${table} not found, skipping`);
        }
      }
    } else {
      // Soft reset - only clear test data
      const testPatterns = [
        "DELETE FROM tickets WHERE purchaser_email LIKE '%test%'",
        "DELETE FROM registrations WHERE attendee_email LIKE '%test%'",
        "DELETE FROM newsletter_subscribers WHERE email LIKE '%test%'"
      ];
      
      for (const query of testPatterns) {
        try {
          await client.execute(query);
          const result = await client.execute(`SELECT changes() as count`);
          recordsCleaned += result.rows[0]?.count || 0;
        } catch (err) {
          console.log(`Query failed: ${query.substring(0, 50)}...`);
        }
      }
    }
    
    console.log(`✅ Database reset complete. Records cleaned: ${recordsCleaned}`);
    
    return { 
      success: true, 
      recordsCleaned,
      mode,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Database reset failed:', error);
    throw error;
  }
}

/**
 * Database Reset Manager for controlled test cleanup
 */
export class DatabaseResetManager {
  constructor() {
    this.resetAllowed = process.env.TEST_DATABASE_RESET_ALLOWED === 'true';
    this.environment = process.env.NODE_ENV || 'development';
    this.client = null;
  }
  
  async performSafetyChecks() {
    if (this.environment === 'production') {
      throw new Error('Database reset not allowed in environment: production');
    }
    
    const url = process.env.TURSO_DATABASE_URL || '';
    if (url.includes('-production') || url.includes('prod-')) {
      throw new Error('Potential production database detected in URL');
    }
    
    return true;
  }
  
  async initializeClient() {
    this.client = await getDatabaseClient();
    return this.client;
  }
  
  async getTableList() {
    if (!this.client) {
      await this.initializeClient();
    }
    
    const result = await this.client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      AND name != 'migrations'
    `);
    
    return result.rows.map(row => row.name);
  }
  
  async getRecordCounts() {
    const tables = await this.getTableList();
    const counts = {};
    
    for (const table of tables) {
      const result = await this.client.execute(`SELECT COUNT(*) as count FROM ${table}`);
      counts[table] = result.rows[0].count;
    }
    
    return counts;
  }
  
  async performReset(mode = 'soft', tables = []) {
    await this.performSafetyChecks();
    
    if (!this.client) {
      await this.initializeClient();
    }
    
    let affectedRows = 0;
    
    for (const table of tables) {
      await this.client.execute(`DELETE FROM ${table}`);
      const result = await this.client.execute(`SELECT changes() as count`);
      affectedRows += result.rows[0]?.count || 0;
    }
    
    return { affectedRows, tables: tables.length };
  }
  
  async verifyReset(targetTables = []) {
    const counts = await this.getRecordCounts();
    
    for (const table of targetTables) {
      if (counts[table] && counts[table] > 0) {
        return false;
      }
    }
    
    return true;
  }
  
  async reset(mode = 'soft') {
    if (!this.resetAllowed && this.environment !== 'test') {
      throw new Error('Database reset not allowed in current environment');
    }
    return resetTestDatabase(mode);
  }
  
  isResetAllowed() {
    return this.resetAllowed || this.environment === 'test';
  }
}

/**
 * Reset configuration presets
 */
export const RESET_CONFIG = {
  soft: { 
    preserveSchema: true, 
    seedData: true,
    clearPattern: 'test'
  },
  full: { 
    preserveSchema: true, 
    seedData: false,
    clearPattern: 'all'
  },
  schema: {
    preserveSchema: false,
    seedData: true,
    clearPattern: 'all'
  }
};

/**
 * Setup test database for E2E tests
 * Wrapper function that provides database setup and migration for E2E test compatibility
 * @param {Object} options - Setup options
 * @returns {Promise<Object>} Setup result with health information
 */
export async function setupTestDatabase(options = {}) {
  const startTime = Date.now();
  const mode = options.mode || 'full';
  
  console.log('🔄 Setting up test database for E2E tests...');
  
  try {
    // Ensure database is initialized
    const client = await getDatabaseClient();
    
    // Apply any pending migrations first
    console.log('📦 Checking database migrations...');
    let migrationsApplied = 0;
    
    try {
      // Check if migrations table exists
      const migrationTableCheck = await client.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='migrations'
      `);
      
      if (migrationTableCheck.rows.length > 0) {
        const migrationStatus = await client.execute('SELECT COUNT(*) as count FROM migrations');
        migrationsApplied = migrationStatus.rows[0]?.count || 0;
        console.log(`  ✅ Found ${migrationsApplied} applied migrations`);
      } else {
        console.log('  ℹ️  No migrations table found (fresh database)');
      }
    } catch (error) {
      console.warn('  ⚠️  Could not check migrations:', error.message);
    }
    
    // Perform database reset for clean test state
    console.log('🧹 Resetting database to clean state...');
    const resetResult = await resetTestDatabase(mode);
    
    // Get table count for health check
    let tableCount = 0;
    try {
      const tablesResult = await client.execute(`
        SELECT COUNT(*) as count FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%'
      `);
      tableCount = tablesResult.rows[0]?.count || 0;
    } catch (error) {
      console.warn('  ⚠️  Could not count tables:', error.message);
    }
    
    const duration = Date.now() - startTime;
    
    const result = {
      success: true,
      mode,
      duration,
      health: {
        tableCount,
        migrationsApplied,
        databaseType: process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite',
        resetRecords: resetResult.recordsCleaned
      },
      resetResult
    };
    
    console.log(`✅ Test database setup complete (${duration}ms)`);
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Test database setup failed (${duration}ms):`, error.message);
    
    // Return partial result for debugging
    return {
      success: false,
      mode,
      duration,
      error: error.message,
      health: {
        tableCount: 0,
        migrationsApplied: 0,
        databaseType: process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite',
        resetRecords: 0
      }
    };
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || 'soft';
  resetTestDatabase(mode)
    .then(result => {
      console.log('Reset result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Reset failed:', error);
      process.exit(1);
    });
}