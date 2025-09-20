/**
 * Database Provider Integration Test
 * Tests that the database service pattern correctly respects test isolation mode
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { getTestIsolationManager } from '../../lib/test-isolation-manager.js';

describe('Integration: Database Provider Pattern', () => {
  let isolationManager;

  beforeAll(async () => {
    isolationManager = getTestIsolationManager();
    await isolationManager.initializeTestMode();
  });

  it('should return the worker database when in test isolation mode', async () => {
    // Verify we're in integration test mode
    expect(process.env.INTEGRATION_TEST_MODE).toBe('true');
    expect(process.env.DATABASE_URL).toBe(':memory:');

    // Get database client through the main function
    const clientFromGetDatabaseClient = await getDatabaseClient();

    // Get database client through test isolation manager
    const clientFromIsolationManager = await isolationManager.getWorkerDatabase();

    // They should be the same instance (worker database)
    expect(clientFromGetDatabaseClient).toBe(clientFromIsolationManager);

    // Verify it's a valid database client
    expect(clientFromGetDatabaseClient).toBeDefined();
    expect(typeof clientFromGetDatabaseClient.execute).toBe('function');

    // Test basic database operation
    const result = await clientFromGetDatabaseClient.execute('SELECT 1 as test');
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].test).toBe(1);
  });

  it('should work with services that use getDatabaseClient()', async () => {
    // Import a service that uses getDatabaseClient()
    const ticketService = (await import('../../lib/ticket-service.js')).default;

    // Ensure the service is initialized
    await ticketService.ensureInitialized();

    // The service should be initialized successfully
    expect(ticketService).toBeDefined();
    expect(ticketService.initialized).toBe(true);

    // The service should have a database client
    expect(ticketService.db).toBeDefined();
    expect(typeof ticketService.db.execute).toBe('function');

    // Test that it can execute queries
    const result = await ticketService.db.execute('SELECT 1 as service_test');
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].service_test).toBe(1);
  });

  it('should ensure all database calls use the same worker database', async () => {
    // Call getDatabaseClient() multiple times
    const client1 = await getDatabaseClient();
    const client2 = await getDatabaseClient();
    const client3 = await getDatabaseClient();

    // All should be the same instance
    expect(client1).toBe(client2);
    expect(client2).toBe(client3);

    // Also should be the same as the isolation manager's database
    const workerClient = await isolationManager.getWorkerDatabase();
    expect(client1).toBe(workerClient);
  });
});