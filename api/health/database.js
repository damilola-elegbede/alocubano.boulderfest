import { HealthStatus } from '../../lib/monitoring/health-checker.js';
import { getDatabase } from '../lib/database.js';

/**
 * Validate database schema integrity
 */
async function validateSchema(dbService) {
  try {
    // Check for required tables
    const tablesResult = await dbService.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    const tableNames = tablesResult.rows.map(row => row[0]);
    const requiredTables = ['tickets', 'subscribers', 'migrations'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    if (missingTables.length > 0) {
      return {
        valid: false,
        error: `Missing tables: ${missingTables.join(', ')}`
      };
    }
    
    // Check tickets table columns
    const ticketColumnsResult = await dbService.execute(`
      PRAGMA table_info(tickets)
    `);
    
    const columnNames = ticketColumnsResult.rows.map(row => row[1]); // column name is second field in PRAGMA table_info
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
async function getDatabaseStats(dbService) {
  try {
    // Get ticket count
    const ticketCountResult = await dbService.execute(`
      SELECT COUNT(*) as count FROM tickets
    `);
    const ticketCount = ticketCountResult.rows[0][0];
    
    // Get subscriber count
    const subscriberCountResult = await dbService.execute(`
      SELECT COUNT(*) as count FROM subscribers
    `);
    const subscriberCount = subscriberCountResult.rows[0][0];
    
    // Get database file size (approximation)
    const pageCountResult = await dbService.execute(`
      PRAGMA page_count
    `);
    const pageCountVal = pageCountResult.rows[0][0] || 0;
    
    const pageSizeResult = await dbService.execute(`
      PRAGMA page_size
    `);
    const pageSizeVal = pageSizeResult.rows[0][0] || 0;
    
    // Guard against NaN when computing DB size
    const dbSize = (pageCountVal && pageSizeVal) ? 
      (pageCountVal * pageSizeVal) / (1024 * 1024) : null; // MB
    
    // Get recent activity
    const recentTicketsResult = await dbService.execute(`
      SELECT COUNT(*) as count 
      FROM tickets 
      WHERE created_at > datetime('now', '-1 hour')
    `);
    const recentTickets = recentTicketsResult.rows[0][0];
    
    return {
      total_tickets: ticketCount,
      total_subscribers: subscriberCount,
      database_size: dbSize !== null ? `${dbSize.toFixed(2)}MB` : 'unknown',
      recent_tickets_1h: recentTickets
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
async function getMigrationStatus(dbService) {
  try {
    // Check if migrations table exists
    const migrationTableResult = await dbService.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);
    
    if (migrationTableResult.rows.length === 0) {
      return {
        migrations_applied: 0,
        latest_migration: 'none'
      };
    }
    
    // Get latest migration
    const latestMigrationResult = await dbService.execute(`
      SELECT * FROM migrations 
      ORDER BY id DESC 
      LIMIT 1
    `);
    
    // Get total migrations
    const totalMigrationsResult = await dbService.execute(`
      SELECT COUNT(*) as count FROM migrations
    `);
    
    const latestMigration = latestMigrationResult.rows.length > 0 ? latestMigrationResult.rows[0] : null;
    const totalMigrations = totalMigrationsResult.rows[0][0];
    
    return {
      migrations_applied: totalMigrations,
      latest_migration: latestMigration ? latestMigration[1] : 'none', // name column
      latest_applied_at: latestMigration ? latestMigration[2] : null // applied_at column
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
    // Get database service
    const dbService = getDatabase();
    
    // Test basic connectivity with a simple query
    const testResult = await dbService.execute("SELECT datetime('now') as now");
    
    if (!testResult || !testResult.rows || testResult.rows.length === 0) {
      throw new Error('Database query test failed');
    }
    
    // Test write capability (non-destructive)
    await dbService.execute(`
      CREATE TEMP TABLE IF NOT EXISTS health_check_temp (
        id INTEGER PRIMARY KEY,
        checked_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await dbService.execute(`
      INSERT INTO health_check_temp (id) VALUES (1)
      ON CONFLICT(id) DO UPDATE SET checked_at = CURRENT_TIMESTAMP
    `);
    
    // Validate schema
    const schemaValidation = await validateSchema(dbService);
    
    // Get database statistics
    const stats = await getDatabaseStats(dbService);
    
    // Get migration status
    const migrationStatus = await getMigrationStatus(dbService);
    
    // Clean up temp table
    await dbService.execute("DROP TABLE IF EXISTS health_check_temp");
    
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