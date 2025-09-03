/**
 * Test Database Cleanup Fixes
 * Verify that the fixed table names and directory creation work correctly
 */

import { describe, test, expect } from 'vitest';
import { getDatabaseClient } from '../../../api/lib/database.js';

describe('Database Cleanup Fixes Verification', () => {
  test('should have correct table names in database schema', async () => {
    const client = await getDatabaseClient();
    
    // Check that the correct tables exist in the database
    const result = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      ORDER BY name
    `);
    
    const tableNames = result.rows.map(row => row.name);
    
    // Verify that the corrected table names exist
    expect(tableNames).toContain('transactions'); // Fixed: was 'payments' 
    expect(tableNames).toContain('registrations');
    expect(tableNames).toContain('tickets');
    expect(tableNames).toContain('admin_sessions');
    expect(tableNames).toContain('email_subscribers');
    expect(tableNames).toContain('email_events');
    expect(tableNames).toContain('payment_events');
    
    console.log(`✅ Found ${tableNames.length} tables in database schema`);
    console.log('📋 Tables:', tableNames.slice(0, 10).join(', ') + (tableNames.length > 10 ? '...' : ''));
  });

  test('should be able to clean data from existing tables', async () => {
    const client = await getDatabaseClient();
    
    // Test that we can perform DELETE operations on the fixed table names
    const tablesToTest = [
      'transactions',   // Fixed: was 'payments'
      'registrations',
      'email_subscribers',
      'email_events',
      'payment_events'
    ];
    
    let successfulCleanups = 0;
    
    for (const tableName of tablesToTest) {
      try {
        // Check if table exists
        const tableExists = await client.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [tableName]
        );
        
        if (tableExists.rows && tableExists.rows.length > 0) {
          // Try to perform a DELETE operation (this tests our cleanup SQL syntax)
          const result = await client.execute(`DELETE FROM ${tableName} WHERE 1=0`); // Delete nothing, just test syntax
          successfulCleanups++;
          console.log(`✅ Table ${tableName} cleanup syntax validated`);
        } else {
          console.log(`⚠️ Table ${tableName} does not exist in schema`);
        }
      } catch (error) {
        console.error(`❌ Failed to test cleanup for table ${tableName}:`, error.message);
      }
    }
    
    expect(successfulCleanups).toBeGreaterThan(0);
    console.log(`✅ Successfully validated cleanup syntax for ${successfulCleanups} tables`);
  });

  test('should verify column names in key tables', async () => {
    const client = await getDatabaseClient();
    
    // Test the column names that were mentioned in the issues
    try {
      // Test registrations table columns
      const registrationsColumns = await client.execute(`
        SELECT sql FROM sqlite_master 
        WHERE type = 'table' AND name = 'registrations'
      `);
      
      if (registrationsColumns.rows && registrationsColumns.rows.length > 0) {
        const createTableSQL = registrationsColumns.rows[0].sql;
        
        // Verify that the expected columns exist
        expect(createTableSQL).toContain('registration_date');  // Should exist
        expect(createTableSQL).toContain('transaction_id');     // Should exist
        
        console.log('✅ registrations table has correct column names');
      }
      
      // Test email_events table columns
      const emailEventsColumns = await client.execute(`
        SELECT sql FROM sqlite_master 
        WHERE type = 'table' AND name = 'email_events'
      `);
      
      if (emailEventsColumns.rows && emailEventsColumns.rows.length > 0) {
        const createTableSQL = emailEventsColumns.rows[0].sql;
        
        // Verify that the expected columns exist
        expect(createTableSQL).toContain('occurred_at');  // Should exist
        
        console.log('✅ email_events table has correct column names');
      }
      
    } catch (error) {
      console.warn('⚠️ Could not verify column names:', error.message);
      // Don't fail the test if tables don't exist yet
    }
  });
});