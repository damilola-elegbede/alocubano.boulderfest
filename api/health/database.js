import { HealthStatus } from '../../lib/monitoring/health-checker.js';
import { getDatabaseConnection } from '../db/database.js';

/**
 * Validate database schema integrity
 */
async function validateSchema(db) {
  try {
    // Check for required tables
    const tables = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `).all();
    
    const tableNames = tables.map(t => t.name);
    const requiredTables = ['tickets', 'subscribers', 'migrations'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    if (missingTables.length > 0) {
      return {
        valid: false,
        error: `Missing tables: ${missingTables.join(', ')}`
      };
    }
    
    // Check tickets table columns
    const ticketColumns = await db.prepare(`
      PRAGMA table_info(tickets)
    `).all();
    
    const columnNames = ticketColumns.map(c => c.name);
    const requiredColumns = ['id', 'email', 'created_at', 'stripe_payment_intent_id'];
    const missingColumns = requiredColumns.filter(c => !columnNames.includes(c));
    
    if (missingColumns.length > 0) {
      return {
        valid: false,
        error: `Missing columns in tickets table: ${missingColumns.join(', ')}`
      };
    }
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Schema validation error: ${error.message}`
    };
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats(db) {
  try {
    // Get ticket count
    const ticketCount = await db.prepare(`
      SELECT COUNT(*) as count FROM tickets
    `).get();
    
    // Get subscriber count
    const subscriberCount = await db.prepare(`
      SELECT COUNT(*) as count FROM subscribers
    `).get();
    
    // Get database file size (approximation)
    const pageCount = await db.prepare(`
      PRAGMA page_count
    `).get();
    
    const pageSize = await db.prepare(`
      PRAGMA page_size
    `).get();
    
    const dbSize = (pageCount.page_count * pageSize.page_size) / (1024 * 1024); // MB
    
    // Get recent activity
    const recentTickets = await db.prepare(`
      SELECT COUNT(*) as count 
      FROM tickets 
      WHERE created_at > datetime('now', '-1 hour')
    `).get();
    
    return {
      total_tickets: ticketCount.count,
      total_subscribers: subscriberCount.count,
      database_size: `${dbSize.toFixed(2)}MB`,
      recent_tickets_1h: recentTickets.count
    };
  } catch (error) {
    return {
      error: `Failed to get database stats: ${error.message}`
    };
  }
}

/**
 * Get migration status
 */
async function getMigrationStatus(db) {
  try {
    // Check if migrations table exists
    const migrationTable = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `).get();
    
    if (!migrationTable) {
      return {
        migrations_applied: 0,
        latest_migration: 'none'
      };
    }
    
    // Get latest migration
    const latestMigration = await db.prepare(`
      SELECT * FROM migrations 
      ORDER BY id DESC 
      LIMIT 1
    `).get();
    
    // Get total migrations
    const totalMigrations = await db.prepare(`
      SELECT COUNT(*) as count FROM migrations
    `).get();
    
    return {
      migrations_applied: totalMigrations.count,
      latest_migration: latestMigration ? latestMigration.name : 'none',
      latest_applied_at: latestMigration ? latestMigration.applied_at : null
    };
  } catch (error) {
    return {
      error: `Failed to get migration status: ${error.message}`
    };
  }
}

/**
 * Check database health
 */
export const checkDatabaseHealth = async () => {
  const startTime = Date.now();
  
  try {
    // Get database connection
    const db = await getDatabaseConnection();
    
    // Test basic connectivity with a simple query
    const testQuery = await db.prepare("SELECT datetime('now') as now").get();
    
    if (!testQuery || !testQuery.now) {
      throw new Error('Database query test failed');
    }
    
    // Test write capability (non-destructive)
    await db.prepare(`
      CREATE TEMP TABLE IF NOT EXISTS health_check_temp (
        id INTEGER PRIMARY KEY,
        checked_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    await db.prepare(`
      INSERT INTO health_check_temp (id) VALUES (1)
      ON CONFLICT(id) DO UPDATE SET checked_at = CURRENT_TIMESTAMP
    `).run();
    
    // Validate schema
    const schemaValidation = await validateSchema(db);
    
    // Get database statistics
    const stats = await getDatabaseStats(db);
    
    // Get migration status
    const migrationStatus = await getMigrationStatus(db);
    
    // Clean up temp table
    await db.prepare("DROP TABLE IF EXISTS health_check_temp").run();
    
    // Determine health status
    let status = HealthStatus.HEALTHY;
    let details = {
      connection: 'active',
      read_write: 'operational',
      schema_valid: schemaValidation.valid,
      ...stats,
      ...migrationStatus
    };
    
    if (!schemaValidation.valid) {
      status = HealthStatus.UNHEALTHY;
      details.schema_error = schemaValidation.error;
    } else if (stats.error || migrationStatus.error) {
      status = HealthStatus.DEGRADED;
      if (stats.error) details.stats_error = stats.error;
      if (migrationStatus.error) details.migration_error = migrationStatus.error;
    }
    
    return {
      status,
      response_time: `${Date.now() - startTime}ms`,
      details
    };
  } catch (error) {
    return {
      status: HealthStatus.UNHEALTHY,
      response_time: `${Date.now() - startTime}ms`,
      error: error.message,
      details: {
        connection: 'failed',
        error_type: error.name || 'DatabaseError'
      }
    };
  }
};

/**
 * Vercel serverless function handler
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const health = await checkDatabaseHealth();
    const statusCode = health.status === HealthStatus.HEALTHY ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}