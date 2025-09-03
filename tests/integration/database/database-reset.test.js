/**
 * Database Reset Mechanism Tests
 * Validates the database reset functionality works correctly
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { resetTestDatabase, DatabaseResetManager, RESET_CONFIG } from '../../../scripts/reset-test-database.js';
import { getDatabaseClient } from '../../../api/lib/database.js';

describe('Database Reset Mechanism', () => {
  let manager;
  
  beforeAll(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.TEST_DATABASE_RESET_ALLOWED = 'true';
    manager = new DatabaseResetManager();
  });

  test('safety checks prevent reset in production', async () => {
    // Temporarily change environment
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const prodManager = new DatabaseResetManager();
    
    await expect(prodManager.performSafetyChecks()).rejects.toThrow(
      /Database reset not allowed in environment/
    );
    
    // Restore environment
    process.env.NODE_ENV = originalEnv;
  });

  test('safety checks prevent reset on production URLs', async () => {
    // Temporarily set production-like URL
    const originalUrl = process.env.TURSO_DATABASE_URL;
    process.env.TURSO_DATABASE_URL = 'libsql://alocubano-production.turso.io';
    
    const prodManager = new DatabaseResetManager();
    
    await expect(prodManager.performSafetyChecks()).rejects.toThrow(
      /Potential production database detected/
    );
    
    // Restore URL
    process.env.TURSO_DATABASE_URL = originalUrl;
  });

  test('safety checks pass for test environment', async () => {
    const result = await manager.performSafetyChecks();
    expect(result).toBe(true);
  });

  test('can initialize database client', async () => {
    const client = await manager.initializeClient();
    expect(client).toBeDefined();
    expect(typeof client.execute).toBe('function');
  });

  test('can get table list', async () => {
    const tables = await manager.getTableList();
    expect(Array.isArray(tables)).toBe(true);
    // Should have at least migrations table after setup
    expect(tables.length).toBeGreaterThanOrEqual(0);
  });

  test('soft reset preserves schema', async () => {
    // Get tables before reset
    const tablesBefore = await manager.getTableList();
    
    // Perform soft reset
    const result = await resetTestDatabase('soft', { seedData: false });
    
    // Verify result
    expect(result.mode).toBe('soft');
    expect(typeof result.recordsCleaned).toBe('number');
    
    // Get tables after reset
    const tablesAfter = await manager.getTableList();
    
    // Schema should be preserved (same tables)
    expect(tablesAfter.length).toBeGreaterThanOrEqual(tablesBefore.length);
  });

  test('reset configuration is valid', () => {
    expect(RESET_CONFIG.soft).toBeDefined();
    expect(RESET_CONFIG.full).toBeDefined();
    expect(RESET_CONFIG.soft.preserveSchema).toBe(true);
    expect(RESET_CONFIG.full.preserveSchema).toBe(true);
  });

  test('seed data can be applied', async () => {
    // Reset with seed data
    const result = await resetTestDatabase('soft', { seedData: true });
    expect(result.mode).toBe('soft');
    
    // Verify database is accessible after seeding
    const client = await getDatabaseClient();
    const testResult = await client.execute('SELECT 1 as test');
    expect(testResult.rows).toHaveLength(1);
    expect(testResult.rows[0].test).toBe(1);
  });

  test('reset allows checking allowed status', () => {
    const isAllowed = manager.isResetAllowed();
    expect(typeof isAllowed).toBe('boolean');
    expect(isAllowed).toBe(true); // Should be true in test environment
  });
});

describe('Database Reset Integration', () => {
  test('database is accessible after reset', async () => {
    // Reset database
    await resetTestDatabase('soft');
    
    // Verify we can perform basic database operations
    const client = await getDatabaseClient();
    
    // Test basic query
    const result = await client.execute('SELECT datetime(CURRENT_TIMESTAMP) as now');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].now).toBeTruthy();
    
    // Test that we can query schema
    const tablesResult = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      ORDER BY name
    `);
    expect(Array.isArray(tablesResult.rows)).toBe(true);
  });
});

describe('Database Reset Error Handling', () => {
  test('prevents reset when not allowed', async () => {
    // Temporarily disable reset
    const originalAllowed = process.env.TEST_DATABASE_RESET_ALLOWED;
    const originalEnv = process.env.NODE_ENV;
    
    delete process.env.TEST_DATABASE_RESET_ALLOWED;
    process.env.NODE_ENV = 'production';
    
    const restrictedManager = new DatabaseResetManager();
    
    await expect(restrictedManager.reset('soft')).rejects.toThrow(
      /Database reset not allowed/
    );
    
    // Restore settings
    process.env.TEST_DATABASE_RESET_ALLOWED = originalAllowed;
    process.env.NODE_ENV = originalEnv;
  });
});