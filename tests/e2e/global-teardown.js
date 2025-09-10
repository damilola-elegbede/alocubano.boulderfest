/**
 * E2E Global Teardown - Database Cleanup
 * Cleans up test data after E2E test runs to ensure clean state for future tests
 */

import { cleanTestData, getCleanupStats } from './helpers/database-cleanup.js';
import { getDatabaseClient } from '../../lib/database.js';

/**
 * Reset database sequences/auto-increment counters
 * Ensures predictable IDs in future test runs
 */
async function resetSequences(client) {
  console.log('🔄 Resetting database sequences...');
  
  try {
    // Get all tables with auto-increment columns
    const tablesResult = await client.execute(`
      SELECT name 
      FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      AND name NOT IN ('schema_migrations', 'migrations')
      ORDER BY name
    `);
    
    let resetCount = 0;
    
    for (const table of tablesResult.rows) {
      const tableName = table.name;
      
      try {
        // Check if table has an autoincrement column (usually 'id')
        const columnInfo = await client.execute(`PRAGMA table_info(${tableName})`);
        const hasAutoIncrement = columnInfo.rows.some(col => 
          col.name === 'id' && col.type.toUpperCase().includes('INTEGER')
        );
        
        if (hasAutoIncrement) {
          // Reset the sqlite_sequence for this table
          await client.execute(`DELETE FROM sqlite_sequence WHERE name = ?`, [tableName]);
          resetCount++;
          console.log(`   ✅ Reset sequence for ${tableName}`);
        }
      } catch (error) {
        console.warn(`   ⚠️  Failed to reset sequence for ${tableName}:`, error.message);
      }
    }
    
    console.log(`🔄 Reset ${resetCount} database sequences`);
    return resetCount;
    
  } catch (error) {
    console.error('❌ Failed to reset database sequences:', error.message);
    throw error;
  }
}

/**
 * Vacuum database to reclaim space and optimize
 */
async function vacuumDatabase(client) {
  console.log('🧹 Vacuuming database...');
  
  try {
    await client.execute('VACUUM');
    console.log('✅ Database vacuum completed');
  } catch (error) {
    console.warn('⚠️  Database vacuum failed (non-critical):', error.message);
  }
}

/**
 * Main global teardown function
 */
export default async function globalTeardown() {
  console.log('\n🧹 Starting E2E Global Teardown...\n');
  
  try {
    // First, get cleanup statistics to show what will be cleaned
    console.log('📊 Analyzing test data...');
    const stats = await getCleanupStats({ testDataOnly: true });
    
    if (!stats.success) {
      console.error('❌ Failed to analyze test data:', stats.error);
      return;
    }
    
    // Check if there's any test data to clean
    const hasTestData = stats.totalTestData > 0;
    
    if (!hasTestData) {
      console.log('✨ No test data found - database is clean');
      console.log('✅ E2E Global Teardown completed\n');
      return;
    }
    
    console.log(`📋 Found ${stats.totalTestData} test records to clean`);
    
    // Perform the cleanup
    console.log('\n🧹 Cleaning test data...');
    const cleanupResult = await cleanTestData({
      tables: ['all'],
      useTransaction: true,
      dryRun: false
    });
    
    if (!cleanupResult.success) {
      throw new Error(`Cleanup failed: ${cleanupResult.error}`);
    }
    
    console.log(`✅ Cleaned ${cleanupResult.recordsCleaned} test records`);
    
    // Reset sequences for predictable IDs in future tests
    const client = await getDatabaseClient();
    await resetSequences(client);
    
    // Optimize database
    await vacuumDatabase(client);
    
    console.log('\n🎉 E2E Global Teardown completed successfully');
    console.log('   • Test data cleaned');
    console.log('   • Sequences reset');
    console.log('   • Database optimized');
    console.log('   • Ready for next test run\n');
    
  } catch (error) {
    console.error('\n❌ E2E Global Teardown failed:', error.message);
    console.error('This may cause issues with subsequent test runs\n');
    
    // Log the error but don't fail the test run
    // Teardown failures shouldn't cause CI to fail
  }
}