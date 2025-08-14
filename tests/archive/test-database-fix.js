#!/usr/bin/env node

/**
 * Integration Test for Database Architecture Fix
 * Simulates real test scenarios to ensure all patterns work
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDatabaseClient } from '../api/lib/database.js';
import { dbTestHelpers } from '../tests/utils/database-test-helpers.js';
import { getEmailSubscriberService } from '../api/lib/email-subscriber-service.js';

// Set up test environment
process.env.NODE_ENV = 'test';
process.env.TURSO_DATABASE_URL = ':memory:';
process.env.BREVO_API_KEY = 'test-key';
process.env.BREVO_NEWSLETTER_LIST_ID = '123';

console.log('🧪 Running Database Architecture Integration Test\n');

async function runTests() {
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Test 1: Database Test Helpers Initialize Correctly
  console.log('Test 1: Database Test Helpers Initialization');
  try {
    await dbTestHelpers.initialize();
    
    // Verify the db property is set and has execute method
    if (!dbTestHelpers.db) {
      throw new Error('dbTestHelpers.db is not set');
    }
    
    if (typeof dbTestHelpers.db.execute !== 'function') {
      throw new Error('dbTestHelpers.db missing execute method');
    }
    
    // Test that we can execute queries
    const result = await dbTestHelpers.db.execute('SELECT 1 as test');
    if (!result.rows || result.rows[0].test !== 1) {
      throw new Error('Execute failed on test helper db');
    }
    
    console.log('✅ Test 1 passed\n');
    testsPassed++;
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 2: Database Test Helpers Can Create Tables
  console.log('Test 2: Creating Essential Tables');
  try {
    await dbTestHelpers.ensureEssentialTables();
    
    // Verify tables were created
    const tables = await dbTestHelpers.db.execute(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    
    const tableNames = tables.rows.map(r => r.name);
    const requiredTables = ['transactions', 'tickets', 'email_subscribers'];
    
    for (const table of requiredTables) {
      if (!tableNames.includes(table)) {
        throw new Error(`Missing required table: ${table}`);
      }
    }
    
    console.log('✅ Test 2 passed\n');
    testsPassed++;
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 3: Database Test Helpers Can Seed Data
  console.log('Test 3: Seeding Test Data');
  try {
    const seedResult = await dbTestHelpers.seedDatabase({
      transactions: 2,
      tickets: 3,
      subscribers: 5
    });
    
    if (!seedResult.transactionIds || seedResult.transactionIds.length !== 2) {
      throw new Error('Incorrect number of transactions created');
    }
    
    if (seedResult.ticketCount !== 3) {
      throw new Error('Incorrect number of tickets created');
    }
    
    if (seedResult.subscriberCount !== 5) {
      throw new Error('Incorrect number of subscribers created');
    }
    
    // Verify data exists in database
    const stats = await dbTestHelpers.getDatabaseStats();
    if (stats.transactions !== 2) {
      throw new Error(`Expected 2 transactions, got ${stats.transactions}`);
    }
    
    console.log('✅ Test 3 passed\n');
    testsPassed++;
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 4: Email Subscriber Service Works
  console.log('Test 4: Email Subscriber Service');
  try {
    const emailService = getEmailSubscriberService();
    await emailService.ensureInitialized();
    
    const db = await emailService.getDb();
    
    if (!db || typeof db.execute !== 'function') {
      throw new Error('Email service did not return valid database client');
    }
    
    // Test that the service can query
    const result = await db.execute('SELECT COUNT(*) as count FROM email_subscribers');
    if (typeof result.rows[0].count !== 'number') {
      throw new Error('Email service database query failed');
    }
    
    console.log('✅ Test 4 passed\n');
    testsPassed++;
  } catch (error) {
    console.error('❌ Test 4 failed:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 5: Direct getDatabaseClient Works
  console.log('Test 5: Direct getDatabaseClient');
  try {
    const client = await getDatabaseClient();
    
    if (!client || typeof client.execute !== 'function') {
      throw new Error('getDatabaseClient did not return valid client');
    }
    
    // Test complex query
    const result = await client.execute(`
      SELECT 
        (SELECT COUNT(*) FROM transactions) as trans_count,
        (SELECT COUNT(*) FROM tickets) as ticket_count
    `);
    
    if (!result.rows || result.rows.length === 0) {
      throw new Error('Complex query failed');
    }
    
    console.log('✅ Test 5 passed\n');
    testsPassed++;
  } catch (error) {
    console.error('❌ Test 5 failed:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 6: Database Cleanup Works
  console.log('Test 6: Database Cleanup');
  try {
    await dbTestHelpers.cleanDatabase();
    
    const stats = await dbTestHelpers.getDatabaseStats();
    
    if (stats.transactions !== 0) {
      throw new Error(`Expected 0 transactions after cleanup, got ${stats.transactions}`);
    }
    
    if (stats.tickets !== 0) {
      throw new Error(`Expected 0 tickets after cleanup, got ${stats.tickets}`);
    }
    
    if (stats.subscribers !== 0) {
      throw new Error(`Expected 0 subscribers after cleanup, got ${stats.subscribers}`);
    }
    
    console.log('✅ Test 6 passed\n');
    testsPassed++;
  } catch (error) {
    console.error('❌ Test 6 failed:', error.message, '\n');
    testsFailed++;
  }
  
  // Summary
  console.log('═'.repeat(60));
  console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  
  if (testsFailed === 0) {
    console.log('\n✅ SUCCESS: All database architecture tests passed!');
    console.log('The database client access patterns are working correctly.');
    console.log('Integration and E2E tests should now function properly.');
    process.exit(0);
  } else {
    console.log('\n❌ FAILURE: Some tests failed.');
    console.log('Please review the errors above and fix the issues.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error during testing:', error);
  process.exit(1);
});