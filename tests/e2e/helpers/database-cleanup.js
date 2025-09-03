/**
 * Database Cleanup Utilities for E2E Tests
 * Provides comprehensive cleanup functions to ensure deterministic testing
 * Compatible with both SQLite (development) and Turso (production/CI) databases
 */

import { getDatabaseClient } from '../../../api/lib/database.js';

/**
 * Check if table exists in database
 * @private
 */
async function tableExists(client, tableName) {
  try {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    return result.rows && result.rows.length > 0;
  } catch (error) {
    console.warn(`Failed to check if table ${tableName} exists:`, error.message);
    return false;
  }
}

/**
 * Configuration for test data identification patterns
 */
const TEST_DATA_PATTERNS = {
  // Email patterns that indicate test data
  emailPatterns: [
    'test@example.com',
    '@test.com',
    '@example.com', 
    'e2e-test',
    'playwright-test',
    'automation-test',
    '+test@',
    'testuser',
    'dummy@'
  ],
  
  // Name patterns that indicate test data
  namePatterns: [
    'test user',
    'test name',
    'john doe',
    'jane doe',
    'e2e test',
    'playwright',
    'automation',
    'dummy'
  ],
  
  // Transaction patterns that indicate test data
  transactionPatterns: [
    'test_transaction_',
    'e2e_',
    'playwright_',
    'cs_test_', // Stripe test session prefix
    'pi_test_'  // Stripe test payment intent prefix
  ]
};

/**
 * Check if an email matches test data patterns
 */
function isTestEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  const lowerEmail = email.toLowerCase();
  return TEST_DATA_PATTERNS.emailPatterns.some(pattern => 
    lowerEmail.includes(pattern.toLowerCase())
  );
}

/**
 * Check if a name matches test data patterns
 */
function isTestName(name) {
  if (!name || typeof name !== 'string') return false;
  
  const lowerName = name.toLowerCase();
  return TEST_DATA_PATTERNS.namePatterns.some(pattern => 
    lowerName.includes(pattern.toLowerCase())
  );
}

/**
 * Check if a transaction ID matches test data patterns
 */
function isTestTransaction(transactionId) {
  if (!transactionId || typeof transactionId !== 'string') return false;
  
  const lowerTransactionId = transactionId.toLowerCase();
  return TEST_DATA_PATTERNS.transactionPatterns.some(pattern => 
    lowerTransactionId.includes(pattern.toLowerCase())
  );
}

/**
 * Check if a timestamp indicates recent test data (within last 24 hours)
 */
function isRecentTestData(timestamp) {
  if (!timestamp) return false;
  
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const hoursDiff = (now - date) / (1000 * 60 * 60);
    
    // Consider data from last 24 hours as potentially test data
    return hoursDiff <= 24;
  } catch (error) {
    console.warn('Failed to parse timestamp for cleanup:', timestamp);
    return false;
  }
}

/**
 * Clean test data from email_subscribers table
 */
async function cleanEmailSubscribers(client, options = {}) {
  const { onlyTestData = true, transaction = null } = options;
  const executor = transaction || client;
  
  // Check if table exists
  if (!(await tableExists(client, 'email_subscribers'))) {
    console.log('🧹 Table email_subscribers does not exist, skipping cleanup');
    return 0;
  }
  
  try {
    // Get test subscribers first for logging
    let testSubscribersQuery = `
      SELECT id, email, first_name, last_name, created_at 
      FROM email_subscribers 
      WHERE 1=1
    `;
    
    const conditions = [];
    const params = [];
    
    if (onlyTestData) {
      // Build conditions for test data identification
      const emailPatternConditions = TEST_DATA_PATTERNS.emailPatterns.map(() => 
        'LOWER(email) LIKE LOWER(?)'
      );
      const namePatternConditions = TEST_DATA_PATTERNS.namePatterns.map(() => 
        '(LOWER(first_name) LIKE LOWER(?) OR LOWER(last_name) LIKE LOWER(?))'
      );
      
      // Add email pattern parameters
      TEST_DATA_PATTERNS.emailPatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
      });
      
      // Add name pattern parameters (each pattern used twice for first_name and last_name)
      TEST_DATA_PATTERNS.namePatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
        params.push(`%${pattern}%`);
      });
      
      conditions.push(`(${emailPatternConditions.join(' OR ')})`);
      conditions.push(`(${namePatternConditions.join(' OR ')})`);
      conditions.push('created_at > datetime("now", "-24 hours")'); // Recent data
      
      testSubscribersQuery += ` AND (${conditions.join(' OR ')})`;
    }
    
    const testSubscribers = await executor.execute(testSubscribersQuery, params);
    
    if (testSubscribers.rows && testSubscribers.rows.length > 0) {
      console.log(`🧹 Found ${testSubscribers.rows.length} test email subscribers to clean:`);
      testSubscribers.rows.forEach(row => {
        console.log(`   - ${row.email} (${row.first_name} ${row.last_name})`);
      });
      
      // Delete test subscribers
      let deleteQuery = 'DELETE FROM email_subscribers WHERE 1=1';
      if (onlyTestData) {
        deleteQuery += ` AND (${conditions.join(' OR ')})`;
      }
      
      const result = await executor.execute(deleteQuery, params);
      console.log(`✅ Cleaned ${result.changes || 0} email subscribers`);
      
      return result.changes || 0;
    } else {
      console.log('🧹 No test email subscribers found to clean');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to clean email subscribers:', error.message);
    throw error;
  }
}

/**
 * Clean test data from transactions table
 */
async function cleanTransactions(client, options = {}) {
  const { onlyTestData = true, transaction = null } = options;
  const executor = transaction || client;
  
  // Check if table exists
  if (!(await tableExists(client, 'transactions'))) {
    console.log('🧹 Table transactions does not exist, skipping cleanup');
    return 0;
  }
  
  try {
    // Get test transactions first for logging
    let testTransactionsQuery = `
      SELECT id, transaction_id, customer_email, amount_cents, created_at 
      FROM transactions 
      WHERE 1=1
    `;
    
    const conditions = [];
    const params = [];
    
    if (onlyTestData) {
      // Build conditions for test data identification
      const emailPatternConditions = TEST_DATA_PATTERNS.emailPatterns.map(() => 
        'LOWER(customer_email) LIKE LOWER(?)'
      );
      const transactionPatternConditions = TEST_DATA_PATTERNS.transactionPatterns.map(() => 
        'LOWER(transaction_id) LIKE LOWER(?)'
      );
      
      // Add email pattern parameters
      TEST_DATA_PATTERNS.emailPatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
      });
      
      // Add transaction pattern parameters
      TEST_DATA_PATTERNS.transactionPatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
      });
      
      conditions.push(`(${emailPatternConditions.join(' OR ')})`);
      conditions.push(`(${transactionPatternConditions.join(' OR ')})`);
      conditions.push('created_at > datetime("now", "-24 hours")'); // Recent data
      
      testTransactionsQuery += ` AND (${conditions.join(' OR ')})`;
    }
    
    const testTransactions = await executor.execute(testTransactionsQuery, params);
    
    if (testTransactions.rows && testTransactions.rows.length > 0) {
      console.log(`🧹 Found ${testTransactions.rows.length} test transactions to clean:`);
      testTransactions.rows.forEach(row => {
        console.log(`   - ${row.transaction_id} (${row.customer_email}, $${row.amount_cents/100})`);
      });
      
      // Delete test transactions
      let deleteQuery = 'DELETE FROM transactions WHERE 1=1';
      if (onlyTestData) {
        deleteQuery += ` AND (${conditions.join(' OR ')})`;
      }
      
      const result = await executor.execute(deleteQuery, params);
      console.log(`✅ Cleaned ${result.changes || 0} transactions`);
      
      return result.changes || 0;
    } else {
      console.log('🧹 No test transactions found to clean');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to clean transactions:', error.message);
    throw error;
  }
}

/**
 * Clean test data from registrations table
 */
async function cleanRegistrations(client, options = {}) {
  const { onlyTestData = true, transaction = null } = options;
  const executor = transaction || client;
  
  // Check if table exists
  if (!(await tableExists(client, 'registrations'))) {
    console.log('🧹 Table registrations does not exist, skipping cleanup');
    return 0;
  }
  
  try {
    // Get test registrations first for logging
    let testRegistrationsQuery = `
      SELECT id, ticket_id, email, first_name, last_name, registration_date 
      FROM registrations 
      WHERE 1=1
    `;
    
    const conditions = [];
    const params = [];
    
    if (onlyTestData) {
      // Build conditions for test data identification
      const emailPatternConditions = TEST_DATA_PATTERNS.emailPatterns.map(() => 
        'LOWER(email) LIKE LOWER(?)'
      );
      const namePatternConditions = TEST_DATA_PATTERNS.namePatterns.map(() => 
        '(LOWER(first_name) LIKE LOWER(?) OR LOWER(last_name) LIKE LOWER(?))'
      );
      
      // Add email pattern parameters
      TEST_DATA_PATTERNS.emailPatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
      });
      
      // Add name pattern parameters
      TEST_DATA_PATTERNS.namePatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
        params.push(`%${pattern}%`);
      });
      
      conditions.push(`(${emailPatternConditions.join(' OR ')})`);
      conditions.push(`(${namePatternConditions.join(' OR ')})`);
      conditions.push('registration_date > datetime("now", "-24 hours")'); // Recent data
      
      testRegistrationsQuery += ` AND (${conditions.join(' OR ')})`;
    }
    
    const testRegistrations = await executor.execute(testRegistrationsQuery, params);
    
    if (testRegistrations.rows && testRegistrations.rows.length > 0) {
      console.log(`🧹 Found ${testRegistrations.rows.length} test registrations to clean:`);
      testRegistrations.rows.forEach(row => {
        console.log(`   - ${row.ticket_id} (${row.email}, ${row.first_name} ${row.last_name})`);
      });
      
      // Delete test registrations
      let deleteQuery = 'DELETE FROM registrations WHERE 1=1';
      if (onlyTestData) {
        deleteQuery += ` AND (${conditions.join(' OR ')})`;
      }
      
      const result = await executor.execute(deleteQuery, params);
      console.log(`✅ Cleaned ${result.changes || 0} registrations`);
      
      return result.changes || 0;
    } else {
      console.log('🧹 No test registrations found to clean');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to clean registrations:', error.message);
    throw error;
  }
}

/**
 * Clean test data from payment_events table
 */
async function cleanPaymentEvents(client, options = {}) {
  const { onlyTestData = true, transaction = null } = options;
  const executor = transaction || client;
  
  // Check if table exists
  if (!(await tableExists(client, 'payment_events'))) {
    console.log('🧹 Table payment_events does not exist, skipping cleanup');
    return 0;
  }
  
  try {
    // Get test payment events first for logging
    let testEventsQuery = `
      SELECT id, event_id, event_type, stripe_session_id, created_at 
      FROM payment_events 
      WHERE 1=1
    `;
    
    const conditions = [];
    const params = [];
    
    if (onlyTestData) {
      // Build conditions for test data identification
      const eventPatternConditions = TEST_DATA_PATTERNS.transactionPatterns.map(() => 
        'LOWER(event_id) LIKE LOWER(?)'
      );
      const sessionPatternConditions = TEST_DATA_PATTERNS.transactionPatterns.map(() => 
        'LOWER(stripe_session_id) LIKE LOWER(?)'
      );
      
      // Add event pattern parameters
      TEST_DATA_PATTERNS.transactionPatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
      });
      
      // Add session pattern parameters
      TEST_DATA_PATTERNS.transactionPatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
      });
      
      conditions.push(`(${eventPatternConditions.join(' OR ')})`);
      conditions.push(`(${sessionPatternConditions.join(' OR ')})`);
      conditions.push('created_at > datetime("now", "-24 hours")'); // Recent data
      
      testEventsQuery += ` AND (${conditions.join(' OR ')})`;
    }
    
    const testEvents = await executor.execute(testEventsQuery, params);
    
    if (testEvents.rows && testEvents.rows.length > 0) {
      console.log(`🧹 Found ${testEvents.rows.length} test payment events to clean:`);
      testEvents.rows.forEach(row => {
        console.log(`   - ${row.event_id} (${row.event_type})`);
      });
      
      // Delete test payment events
      let deleteQuery = 'DELETE FROM payment_events WHERE 1=1';
      if (onlyTestData) {
        deleteQuery += ` AND (${conditions.join(' OR ')})`;
      }
      
      const result = await executor.execute(deleteQuery, params);
      console.log(`✅ Cleaned ${result.changes || 0} payment events`);
      
      return result.changes || 0;
    } else {
      console.log('🧹 No test payment events found to clean');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to clean payment events:', error.message);
    throw error;
  }
}

/**
 * Clean test data from email_events table
 */
async function cleanEmailEvents(client, options = {}) {
  const { onlyTestData = true, transaction = null } = options;
  const executor = transaction || client;
  
  // Check if table exists
  if (!(await tableExists(client, 'email_events'))) {
    console.log('🧹 Table email_events does not exist, skipping cleanup');
    return 0;
  }
  
  try {
    // Get test email events first for logging
    let testEventsQuery = `
      SELECT ee.id, ee.event_type, es.email, ee.occurred_at
      FROM email_events ee
      LEFT JOIN email_subscribers es ON ee.subscriber_id = es.id
      WHERE 1=1
    `;
    
    const conditions = [];
    const params = [];
    
    if (onlyTestData) {
      // Build conditions for test data identification
      const emailPatternConditions = TEST_DATA_PATTERNS.emailPatterns.map(() => 
        'LOWER(es.email) LIKE LOWER(?)'
      );
      
      // Add email pattern parameters
      TEST_DATA_PATTERNS.emailPatterns.forEach(pattern => {
        params.push(`%${pattern}%`);
      });
      
      conditions.push(`(${emailPatternConditions.join(' OR ')})`);
      conditions.push('ee.occurred_at > datetime("now", "-24 hours")'); // Recent data
      
      testEventsQuery += ` AND (${conditions.join(' OR ')})`;
    }
    
    const testEvents = await executor.execute(testEventsQuery, params);
    
    if (testEvents.rows && testEvents.rows.length > 0) {
      console.log(`🧹 Found ${testEvents.rows.length} test email events to clean:`);
      testEvents.rows.forEach(row => {
        console.log(`   - ${row.event_type} for ${row.email}`);
      });
      
      // Delete test email events (cascade will handle via foreign key, but be explicit)
      let deleteQuery = `
        DELETE FROM email_events 
        WHERE id IN (
          SELECT ee.id 
          FROM email_events ee
          LEFT JOIN email_subscribers es ON ee.subscriber_id = es.id
          WHERE 1=1
      `;
      
      if (onlyTestData) {
        deleteQuery += ` AND (${conditions.join(' OR ')})`;
      }
      deleteQuery += ')';
      
      const result = await executor.execute(deleteQuery, params);
      console.log(`✅ Cleaned ${result.changes || 0} email events`);
      
      return result.changes || 0;
    } else {
      console.log('🧹 No test email events found to clean');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to clean email events:', error.message);
    throw error;
  }
}

/**
 * Clean test data from email_audit_log table
 */
async function cleanEmailAuditLog(client, options = {}) {
  const { onlyTestData = true, transaction = null } = options;
  const executor = transaction || client;
  
  // Check if table exists
  if (!(await tableExists(client, 'email_audit_log'))) {
    console.log('🧹 Table email_audit_log does not exist, skipping cleanup');
    return 0;
  }
  
  try {
    // For audit log, we primarily clean based on recency for test runs
    let testAuditQuery = `
      SELECT id, entity_type, entity_id, action, created_at 
      FROM email_audit_log 
      WHERE 1=1
    `;
    
    const conditions = [];
    const params = [];
    
    if (onlyTestData) {
      conditions.push('created_at > datetime("now", "-24 hours")'); // Recent data only
      testAuditQuery += ` AND ${conditions.join(' AND ')}`;
    }
    
    const testAudit = await executor.execute(testAuditQuery, params);
    
    if (testAudit.rows && testAudit.rows.length > 0) {
      console.log(`🧹 Found ${testAudit.rows.length} test audit log entries to clean`);
      
      // Delete test audit log entries
      let deleteQuery = 'DELETE FROM email_audit_log WHERE 1=1';
      if (onlyTestData) {
        deleteQuery += ` AND ${conditions.join(' AND ')}`;
      }
      
      const result = await executor.execute(deleteQuery, params);
      console.log(`✅ Cleaned ${result.changes || 0} audit log entries`);
      
      return result.changes || 0;
    } else {
      console.log('🧹 No test audit log entries found to clean');
      return 0;
    }
  } catch (error) {
    console.error('❌ Failed to clean email audit log:', error.message);
    throw error;
  }
}

/**
 * Selective cleanup - removes only test data based on patterns
 */
async function cleanTestData(options = {}) {
  const { 
    tables = ['all'],
    useTransaction = true,
    dryRun = false 
  } = options;
  
  console.log('\n🧹 Starting selective test data cleanup...');
  console.log(`📋 Tables: ${tables.includes('all') ? 'all' : tables.join(', ')}`);
  console.log(`💾 Transaction: ${useTransaction ? 'enabled' : 'disabled'}`);
  console.log(`🔍 Dry run: ${dryRun ? 'enabled' : 'disabled'}\n`);
  
  try {
    const client = await getDatabaseClient();
    let transaction = null;
    let totalCleaned = 0;
    
    if (useTransaction && !dryRun) {
      console.log('🔄 Starting cleanup transaction...');
      transaction = await client.transaction();
    }
    
    const cleanupOptions = { 
      onlyTestData: true, 
      transaction,
      dryRun 
    };
    
    try {
      // Clean tables in dependency order (children first)
      if (tables.includes('all') || tables.includes('email_events')) {
        totalCleaned += await cleanEmailEvents(client, cleanupOptions);
      }
      
      if (tables.includes('all') || tables.includes('email_audit_log')) {
        totalCleaned += await cleanEmailAuditLog(client, cleanupOptions);
      }
      
      if (tables.includes('all') || tables.includes('payment_events')) {
        totalCleaned += await cleanPaymentEvents(client, cleanupOptions);
      }
      
      if (tables.includes('all') || tables.includes('registrations')) {
        totalCleaned += await cleanRegistrations(client, cleanupOptions);
      }
      
      if (tables.includes('all') || tables.includes('transactions')) {
        totalCleaned += await cleanTransactions(client, cleanupOptions);
      }
      
      if (tables.includes('all') || tables.includes('email_subscribers')) {
        totalCleaned += await cleanEmailSubscribers(client, cleanupOptions);
      }
      
      if (transaction && !dryRun) {
        await transaction.commit();
        console.log('✅ Cleanup transaction committed successfully');
      }
      
      console.log(`\n🎉 Selective cleanup completed! Total records cleaned: ${totalCleaned}\n`);
      return { success: true, recordsCleaned: totalCleaned };
      
    } catch (error) {
      if (transaction && !dryRun) {
        console.log('🔄 Rolling back cleanup transaction...');
        await transaction.rollback();
      }
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Test data cleanup failed:', error.message, '\n');
    return { success: false, error: error.message };
  }
}

/**
 * Full cleanup - removes ALL data from specified tables (preserves schema)
 */
async function cleanAllData(options = {}) {
  const { 
    tables = ['all'],
    useTransaction = true,
    dryRun = false 
  } = options;
  
  console.log('\n🧹 Starting full data cleanup (DANGER: removes ALL data)...');
  console.log(`📋 Tables: ${tables.includes('all') ? 'all' : tables.join(', ')}`);
  console.log(`💾 Transaction: ${useTransaction ? 'enabled' : 'disabled'}`);
  console.log(`🔍 Dry run: ${dryRun ? 'enabled' : 'disabled'}\n`);
  
  if (!dryRun) {
    console.log('⚠️  WARNING: This will delete ALL data from specified tables!');
  }
  
  try {
    const client = await getDatabaseClient();
    let transaction = null;
    let totalCleaned = 0;
    
    if (useTransaction && !dryRun) {
      console.log('🔄 Starting full cleanup transaction...');
      transaction = await client.transaction();
    }
    
    const executor = transaction || client;
    
    try {
      const tablesToClean = [];
      
      if (tables.includes('all')) {
        // Clean in dependency order (children first)
        tablesToClean.push(
          'email_events',
          'email_audit_log', 
          'payment_events',
          'registrations',
          'transactions',
          'email_subscribers'
        );
      } else {
        tablesToClean.push(...tables);
      }
      
      for (const table of tablesToClean) {
        console.log(`🧹 Cleaning table: ${table}`);
        
        // Check if table exists
        if (!(await tableExists(client, table))) {
          console.log(`⚠️  Table ${table} does not exist, skipping`);
          continue;
        }
        
        if (!dryRun) {
          const result = await executor.execute(`DELETE FROM ${table}`);
          const cleaned = result.changes || 0;
          totalCleaned += cleaned;
          console.log(`✅ Cleaned ${cleaned} records from ${table}`);
        } else {
          const countResult = await executor.execute(`SELECT COUNT(*) as count FROM ${table}`);
          const count = countResult.rows[0]?.count || 0;
          console.log(`🔍 Would clean ${count} records from ${table}`);
        }
      }
      
      if (transaction && !dryRun) {
        await transaction.commit();
        console.log('✅ Full cleanup transaction committed successfully');
      }
      
      console.log(`\n🎉 Full cleanup completed! Total records cleaned: ${totalCleaned}\n`);
      return { success: true, recordsCleaned: totalCleaned };
      
    } catch (error) {
      if (transaction && !dryRun) {
        console.log('🔄 Rolling back full cleanup transaction...');
        await transaction.rollback();
      }
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Full data cleanup failed:', error.message, '\n');
    return { success: false, error: error.message };
  }
}

/**
 * Get cleanup statistics - shows what would be cleaned without actually cleaning
 */
async function getCleanupStats(options = { testDataOnly: true }) {
  const { testDataOnly = true } = options;
  
  console.log('\n📊 Analyzing database for cleanup statistics...\n');
  
  try {
    const client = await getDatabaseClient();
    const stats = {};
    
    // Email subscribers
    if (await tableExists(client, 'email_subscribers')) {
      try {
        const totalSubscribers = await client.execute('SELECT COUNT(*) as count FROM email_subscribers');
        stats.email_subscribers = { total: totalSubscribers.rows[0]?.count || 0 };
        
        if (testDataOnly) {
          const emailPatternConditions = TEST_DATA_PATTERNS.emailPatterns.map(() => 'LOWER(email) LIKE LOWER(?)');
          const namePatternConditions = TEST_DATA_PATTERNS.namePatterns.map(() => 
            '(LOWER(first_name) LIKE LOWER(?) OR LOWER(last_name) LIKE LOWER(?))'
          );
          
          const params = [];
          TEST_DATA_PATTERNS.emailPatterns.forEach(pattern => params.push(`%${pattern}%`));
          TEST_DATA_PATTERNS.namePatterns.forEach(pattern => {
            params.push(`%${pattern}%`);
            params.push(`%${pattern}%`);
          });
          
          const testQuery = `
            SELECT COUNT(*) as count FROM email_subscribers 
            WHERE (${emailPatternConditions.join(' OR ')}) 
            OR (${namePatternConditions.join(' OR ')})
            OR created_at > datetime("now", "-24 hours")
          `;
          
          const testSubscribers = await client.execute(testQuery, params);
          stats.email_subscribers.testData = testSubscribers.rows[0]?.count || 0;
        }
      } catch (error) {
        console.warn('Could not analyze email_subscribers:', error.message);
        stats.email_subscribers = { total: 0, testData: 0 };
      }
    } else {
      stats.email_subscribers = { total: 0, testData: 0 };
    }
    
    // Transactions
    if (await tableExists(client, 'transactions')) {
      try {
        const totalTransactions = await client.execute('SELECT COUNT(*) as count FROM transactions');
        stats.transactions = { total: totalTransactions.rows[0]?.count || 0 };
        
        if (testDataOnly) {
          const emailPatternConditions = TEST_DATA_PATTERNS.emailPatterns.map(() => 'LOWER(customer_email) LIKE LOWER(?)');
          const transactionPatternConditions = TEST_DATA_PATTERNS.transactionPatterns.map(() => 'LOWER(transaction_id) LIKE LOWER(?)');
          
          const params = [];
          TEST_DATA_PATTERNS.emailPatterns.forEach(pattern => params.push(`%${pattern}%`));
          TEST_DATA_PATTERNS.transactionPatterns.forEach(pattern => params.push(`%${pattern}%`));
          
          const testQuery = `
            SELECT COUNT(*) as count FROM transactions 
            WHERE (${emailPatternConditions.join(' OR ')}) 
            OR (${transactionPatternConditions.join(' OR ')})
            OR created_at > datetime("now", "-24 hours")
          `;
          
          const testTransactions = await client.execute(testQuery, params);
          stats.transactions.testData = testTransactions.rows[0]?.count || 0;
        }
      } catch (error) {
        console.warn('Could not analyze transactions:', error.message);
        stats.transactions = { total: 0, testData: 0 };
      }
    } else {
      stats.transactions = { total: 0, testData: 0 };
    }
    
    // Add similar analysis for other tables...
    const otherTables = ['registrations', 'payment_events', 'email_events', 'email_audit_log'];
    for (const table of otherTables) {
      if (await tableExists(client, table)) {
        try {
          const totalResult = await client.execute(`SELECT COUNT(*) as count FROM ${table}`);
          stats[table] = { total: totalResult.rows[0]?.count || 0 };
          
          if (testDataOnly) {
            // Use the appropriate created_at or similar timestamp column
            let timeColumn = 'created_at';
            if (table === 'email_events') timeColumn = 'occurred_at';
            if (table === 'registrations') timeColumn = 'registration_date';
            
            const recentResult = await client.execute(
              `SELECT COUNT(*) as count FROM ${table} WHERE ${timeColumn} > datetime("now", "-24 hours")`,
            );
            stats[table].testData = recentResult.rows[0]?.count || 0;
          }
        } catch (error) {
          console.warn(`Could not analyze ${table}:`, error.message);
          stats[table] = { total: 0, testData: 0 };
        }
      } else {
        stats[table] = { total: 0, testData: 0 };
      }
    }
    
    // Display statistics
    console.log('📊 Database Cleanup Statistics:');
    console.log('================================\n');
    
    Object.entries(stats).forEach(([table, data]) => {
      console.log(`${table}:`);
      console.log(`  Total records: ${data.total}`);
      if (testDataOnly && data.testData !== undefined) {
        console.log(`  Test data: ${data.testData}`);
      }
      console.log('');
    });
    
    const totalRecords = Object.values(stats).reduce((sum, data) => sum + data.total, 0);
    const totalTestData = testDataOnly 
      ? Object.values(stats).reduce((sum, data) => sum + (data.testData || 0), 0)
      : 0;
    
    console.log(`Total database records: ${totalRecords}`);
    if (testDataOnly) {
      console.log(`Total test data records: ${totalTestData}`);
    }
    console.log('');
    
    return { success: true, stats, totalRecords, totalTestData };
    
  } catch (error) {
    console.error('\n❌ Failed to analyze database:', error.message, '\n');
    return { success: false, error: error.message };
  }
}

// Export all functions
export {
  cleanTestData,
  cleanAllData,
  getCleanupStats,
  cleanEmailSubscribers,
  cleanTransactions,
  cleanRegistrations,
  cleanPaymentEvents,
  cleanEmailEvents,
  cleanEmailAuditLog,
  isTestEmail,
  isTestName,
  isTestTransaction,
  isRecentTestData,
  TEST_DATA_PATTERNS
};

// Default export for convenience
export default {
  cleanTestData,
  cleanAllData,
  getCleanupStats
};