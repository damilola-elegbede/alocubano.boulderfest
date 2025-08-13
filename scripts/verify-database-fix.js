#!/usr/bin/env node

/**
 * Verification Script for Database Architecture Fix
 * Tests that all database access patterns work correctly
 */

import { getDatabaseClient, getDatabase, resetDatabaseInstance } from '../api/lib/database.js';
import { dbTestHelpers } from '../tests/utils/database-test-helpers.js';
import { getEmailSubscriberService, resetEmailSubscriberService } from '../api/lib/email-subscriber-service.js';

// Set up test environment
process.env.TURSO_DATABASE_URL = ':memory:';
process.env.NODE_ENV = 'test';
process.env.BREVO_API_KEY = 'test-key';

async function verify() {
  console.log('🔍 Verifying database architecture fix...\n');
  
  let allTestsPassed = true;
  
  try {
    // Test 1: getDatabaseClient returns raw client with execute method
    console.log('Test 1: Verify getDatabaseClient returns raw client...');
    const client1 = await getDatabaseClient();
    
    if (!client1) {
      throw new Error('getDatabaseClient returned null/undefined');
    }
    
    if (typeof client1.execute !== 'function') {
      throw new Error('Client missing execute method');
    }
    
    // Test execute works
    const result1 = await client1.execute('SELECT 1 as test');
    if (!result1.rows || result1.rows[0].test !== 1) {
      throw new Error('Execute method failed');
    }
    
    console.log('✅ Test 1 passed: getDatabaseClient returns valid client\n');
    
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message, '\n');
    allTestsPassed = false;
  }
  
  try {
    // Test 2: Multiple calls return same instance (singleton)
    console.log('Test 2: Verify singleton behavior...');
    const client2a = await getDatabaseClient();
    const client2b = await getDatabaseClient();
    
    if (client2a !== client2b) {
      throw new Error('Multiple calls returned different instances');
    }
    
    console.log('✅ Test 2 passed: Singleton pattern working\n');
    
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message, '\n');
    allTestsPassed = false;
  }
  
  try {
    // Test 3: DatabaseService.getClient() returns raw client
    console.log('Test 3: Verify DatabaseService.getClient()...');
    const service = getDatabase();
    const client3 = await service.getClient();
    
    if (!client3 || typeof client3.execute !== 'function') {
      throw new Error('Service.getClient() did not return valid client');
    }
    
    const result3 = await client3.execute('SELECT 2 as test');
    if (!result3.rows || result3.rows[0].test !== 2) {
      throw new Error('Client from service failed to execute');
    }
    
    console.log('✅ Test 3 passed: Service.getClient() returns valid client\n');
    
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message, '\n');
    allTestsPassed = false;
  }
  
  try {
    // Test 4: DatabaseService.ensureInitialized() returns raw client
    console.log('Test 4: Verify DatabaseService.ensureInitialized()...');
    const service = getDatabase();
    const client4 = await service.ensureInitialized();
    
    if (!client4 || typeof client4.execute !== 'function') {
      throw new Error('Service.ensureInitialized() did not return valid client');
    }
    
    const result4 = await client4.execute('SELECT 3 as test');
    if (!result4.rows || result4.rows[0].test !== 3) {
      throw new Error('Client from ensureInitialized failed to execute');
    }
    
    console.log('✅ Test 4 passed: Service.ensureInitialized() returns valid client\n');
    
  } catch (error) {
    console.error('❌ Test 4 failed:', error.message, '\n');
    allTestsPassed = false;
  }
  
  // Reset for fresh test
  resetDatabaseInstance();
  resetEmailSubscriberService();
  
  try {
    // Test 5: Database test helpers work correctly
    console.log('Test 5: Verify database test helpers...');
    await dbTestHelpers.initialize();
    
    if (!dbTestHelpers.db || typeof dbTestHelpers.db.execute !== 'function') {
      throw new Error('Test helpers did not initialize valid client');
    }
    
    // Try creating tables
    await dbTestHelpers.ensureEssentialTables();
    
    // Try executing SQL
    const result5 = await dbTestHelpers.executeSQL('SELECT 4 as test');
    if (!result5.rows || result5.rows[0].test !== 4) {
      throw new Error('Test helper executeSQL failed');
    }
    
    console.log('✅ Test 5 passed: Database test helpers working\n');
    
  } catch (error) {
    console.error('❌ Test 5 failed:', error.message, '\n');
    allTestsPassed = false;
  }
  
  try {
    // Test 6: Email subscriber service gets correct client
    console.log('Test 6: Verify email subscriber service...');
    const emailService = getEmailSubscriberService();
    await emailService.ensureInitialized();
    
    const emailDb = await emailService.getDb();
    
    if (!emailDb || typeof emailDb.execute !== 'function') {
      throw new Error('Email service did not get valid client');
    }
    
    const result6 = await emailDb.execute('SELECT 5 as test');
    if (!result6.rows || result6.rows[0].test !== 5) {
      throw new Error('Email service client failed to execute');
    }
    
    console.log('✅ Test 6 passed: Email service gets valid client\n');
    
  } catch (error) {
    console.error('❌ Test 6 failed:', error.message, '\n');
    allTestsPassed = false;
  }
  
  // Summary
  console.log('═'.repeat(50));
  if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED - Database architecture fix verified!');
    console.log('\nThe database client access patterns are now consistent.');
    console.log('All services and test helpers should work correctly.');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED - Please review the errors above');
    console.log('\nThe database architecture fix needs additional work.');
    process.exit(1);
  }
}

// Run verification
verify().catch(error => {
  console.error('Fatal error during verification:', error);
  process.exit(1);
});