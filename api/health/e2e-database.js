/**
 * E2E Database Health Check Endpoint
 * Provides database status and schema validation for CI integration
 */

import { createClient } from '@libsql/client';

// Helper to check if we're in E2E mode
function isE2EMode() {
  return process.env.E2E_TEST_MODE === 'true' || 
         process.env.ENVIRONMENT === 'e2e-test';
}

// Create E2E database client
function createE2EClient() {
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  
  // Safety check - ensure E2E database
  if (!databaseUrl || (!databaseUrl.includes('test') && !databaseUrl.includes('staging'))) {
    throw new Error('Invalid E2E database configuration');
  }
  
  return createClient({
    url: databaseUrl,
    authToken: authToken
  });
}

// Check database connectivity
async function checkConnectivity(client) {
  try {
    const result = await client.execute('SELECT 1 as ping');
    return {
      connected: result.rows[0]?.ping === 1,
      latency: null // Could implement timing if needed
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

// Validate database schema
async function validateSchema(client) {
  const requiredTables = [
    'migrations',
    'registrations',
    'email_subscribers',
    'tickets',
    'payment_events',
    'admin_rate_limits',
    'admin_sessions',
    'wallet_passes'
  ];
  
  try {
    const tablesResult = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      ORDER BY name
    `);
    
    const existingTables = tablesResult.rows.map(row => row.name);
    const missingTables = [];
    const presentTables = [];
    
    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        presentTables.push(table);
      } else {
        missingTables.push(table);
      }
    }
    
    // Check core table columns
    const columnChecks = {};
    
    // Check registrations table
    try {
      const regColumns = await client.execute('PRAGMA table_info(registrations)');
      const regColumnNames = regColumns.rows.map(row => row.name);
      const requiredRegColumns = ['ticket_id', 'email', 'first_name', 'last_name', 'ticket_type'];
      
      columnChecks.registrations = {
        hasRequiredColumns: requiredRegColumns.every(col => regColumnNames.includes(col)),
        columns: regColumnNames.length,
        missing: requiredRegColumns.filter(col => !regColumnNames.includes(col))
      };
    } catch (error) {
      columnChecks.registrations = { error: error.message };
    }
    
    return {
      valid: missingTables.length === 0,
      totalTables: existingTables.length,
      requiredTables: requiredTables.length,
      presentTables: presentTables.length,
      missingTables: missingTables,
      columnChecks: columnChecks
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

// Check migration status
async function checkMigrations(client) {
  try {
    const migrations = await client.execute(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM migrations
    `);
    
    const lastMigration = await client.execute(`
      SELECT filename, status, executed_at 
      FROM migrations 
      ORDER BY id DESC 
      LIMIT 1
    `);
    
    return {
      total: migrations.rows[0].total,
      completed: migrations.rows[0].completed,
      failed: migrations.rows[0].failed,
      pending: migrations.rows[0].pending,
      lastMigration: lastMigration.rows[0] || null
    };
  } catch (error) {
    return {
      error: error.message
    };
  }
}

// Check test data presence
async function checkTestData(client) {
  try {
    const registrations = await client.execute(`
      SELECT COUNT(*) as count 
      FROM registrations 
      WHERE email LIKE '%@e2e-test.%'
    `);
    
    const subscribers = await client.execute(`
      SELECT COUNT(*) as count 
      FROM email_subscribers 
      WHERE email LIKE '%@e2e-test.%'
    `);
    
    return {
      testRegistrations: registrations.rows[0].count,
      testSubscribers: subscribers.rows[0].count,
      hasTestData: registrations.rows[0].count > 0 || subscribers.rows[0].count > 0
    };
  } catch (error) {
    return {
      error: error.message
    };
  }
}

// Main health check handler
export default async function handler(req, res) {
  // Only allow in E2E mode
  if (!isE2EMode()) {
    return res.status(403).json({
      error: 'E2E health check endpoint is not available in this environment'
    });
  }
  
  // Allow only GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const startTime = Date.now();
  const health = {
    status: 'checking',
    timestamp: new Date().toISOString(),
    environment: process.env.ENVIRONMENT,
    checks: {}
  };
  
  let client;
  
  try {
    // Create database client
    client = createE2EClient();
    health.checks.clientCreation = { success: true };
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.clientCreation = { 
      success: false, 
      error: error.message 
    };
    return res.status(503).json(health);
  }
  
  try {
    // Run all health checks
    const [connectivity, schema, migrations, testData] = await Promise.all([
      checkConnectivity(client),
      validateSchema(client),
      checkMigrations(client),
      checkTestData(client)
    ]);
    
    health.checks.connectivity = connectivity;
    health.checks.schema = schema;
    health.checks.migrations = migrations;
    health.checks.testData = testData;
    
    // Determine overall health status
    const isHealthy = 
      connectivity.connected &&
      schema.valid &&
      !migrations.error &&
      migrations.failed === 0;
    
    health.status = isHealthy ? 'healthy' : 'unhealthy';
    health.responseTime = Date.now() - startTime;
    
    // Add summary
    health.summary = {
      databaseConnected: connectivity.connected,
      schemaValid: schema.valid,
      migrationsComplete: migrations.completed === migrations.total,
      testDataPresent: testData.hasTestData,
      overallHealth: isHealthy
    };
    
    // Return appropriate status code
    const statusCode = isHealthy ? 200 : 503;
    return res.status(statusCode).json(health);
    
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
    health.responseTime = Date.now() - startTime;
    
    return res.status(503).json(health);
    
  } finally {
    // Clean up database connection
    if (client) {
      try {
        client.close();
      } catch (error) {
        console.error('Failed to close database connection:', error);
      }
    }
  }
}