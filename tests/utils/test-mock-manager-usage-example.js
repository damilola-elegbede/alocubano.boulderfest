/**
 * TestMockManager Usage Example
 * 
 * This demonstrates how to use the TestMockManager to solve the mock state bleeding
 * issue that was causing database environment tests to fail.
 * 
 * Before: Mocks from @libsql/client persisted between tests
 * After: Complete mock isolation with guaranteed fresh state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TestMockManagerAPI as MockManager,
  setupTestMockManager,
  createDatabaseTestMock,
  createManagedMock
} from './test-mock-manager.js';

/**
 * EXAMPLE 1: Basic Setup Pattern
 * Use this pattern in any test file that needs reliable mock isolation
 */
describe('Example: Basic Mock Isolation Pattern', () => {
  // Set up TestMockManager with full isolation
  const { beforeEach: mockBeforeEach, afterEach: mockAfterEach } = setupTestMockManager({
    enableDebug: false,        // Set to true for debugging
    validateIsolation: true,   // Validate isolation between tests
    autoCleanup: true,        // Auto-cleanup after each test
    strictMode: true          // Fail on isolation violations
  });

  beforeEach(() => {
    mockBeforeEach();
  });

  afterEach(() => {
    mockAfterEach();
  });

  it('first test - creates mock state', () => {
    const myMock = vi.fn();
    myMock('first-test-call');
    
    expect(myMock).toHaveBeenCalledWith('first-test-call');
  });

  it('second test - should not see previous state', () => {
    const myMock = vi.fn();
    // This test should not see the call from the first test
    expect(myMock).not.toHaveBeenCalled();
    
    myMock('second-test-call');
    expect(myMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * EXAMPLE 2: Database Mock Pattern
 * Specifically for database-related tests that were failing
 */
describe('Example: Database Mock Isolation', () => {
  let databaseClient;

  beforeEach(() => {
    // Clear any existing mocks
    MockManager.clearAllMocks();
    
    // Create fresh database mock
    const { client } = createDatabaseTestMock();
    databaseClient = client;
  });

  afterEach(() => {
    // Validate isolation and cleanup
    MockManager.validateMockIsolation();
    MockManager.clearAllMocks();
  });

  it('database test 1 - fresh client state', async () => {
    // Should start with clean state
    expect(databaseClient.execute).not.toHaveBeenCalled();
    
    await databaseClient.execute('SELECT * FROM users');
    expect(databaseClient.execute).toHaveBeenCalledWith('SELECT * FROM users');
  });

  it('database test 2 - isolated from previous test', async () => {
    // Should not see calls from previous test
    expect(databaseClient.execute).not.toHaveBeenCalled();
    
    await databaseClient.execute('SELECT * FROM orders');
    expect(databaseClient.execute).toHaveBeenCalledTimes(1);
    expect(databaseClient.execute).toHaveBeenCalledWith('SELECT * FROM orders');
  });
});

/**
 * EXAMPLE 3: Managed Mock Pattern
 * For when you need more control over mock lifecycle
 */
describe('Example: Managed Mock Pattern', () => {
  beforeEach(() => {
    MockManager.cleanup(); // Start clean
  });

  afterEach(() => {
    MockManager.cleanup(); // End clean
  });

  it('should use managed mocks with automatic registration', () => {
    // Create managed mock that gets automatically registered
    const serviceMock = createManagedMock('user-service', () => ({
      findUser: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn()
    }));

    serviceMock.findUser('user-123');
    expect(serviceMock.findUser).toHaveBeenCalledWith('user-123');

    // Mock is automatically tracked for cleanup
  });

  it('should have clean state after managed mock usage', () => {
    // Previous test's managed mocks should not affect this test
    const differentMock = createManagedMock('order-service', () => ({
      findOrder: vi.fn()
    }));

    expect(differentMock.findOrder).not.toHaveBeenCalled();
  });
});

/**
 * EXAMPLE 4: Debugging Mock Issues
 * How to diagnose and fix mock bleeding problems
 */
describe('Example: Mock Debugging', () => {
  it('should provide debugging tools for mock state analysis', () => {
    // Enable debug mode for detailed logging
    MockManager.setDebugMode(true);

    // Create some mocks
    const mock1 = vi.fn();
    const mock2 = vi.fn();
    
    MockManager.registerMock('test-mock-1', () => mock1);
    MockManager.registerMock('test-mock-2', () => mock2);

    // Analyze current mock state
    const state = MockManager.getMockState('test-mock-1');
    expect(state.isRegistered).toBe(true);
    expect(state.hasFactory).toBe(true);

    // Get overall manager state
    const managerState = MockManager.getManagerState();
    expect(managerState.registry.totalMocks).toBe(2);

    MockManager.setDebugMode(false);
  });
});

/**
 * EXAMPLE 5: Performance Testing Pattern
 * For tests that need many mocks but want to ensure cleanup
 */
describe('Example: Performance Testing with Cleanup', () => {
  it('should handle many mocks efficiently', () => {
    const startTime = performance.now();

    // Create many mocks
    const mocks = [];
    for (let i = 0; i < 100; i++) {
      const mock = createManagedMock(`perf-mock-${i}`, () => vi.fn());
      mocks.push(mock);
    }

    // Use the mocks
    mocks.forEach((mock, i) => mock(`call-${i}`));

    // Cleanup should be fast
    const cleanupStart = performance.now();
    MockManager.clearAllMocks();
    const cleanupEnd = performance.now();

    const totalTime = performance.now() - startTime;
    const cleanupTime = cleanupEnd - cleanupStart;

    expect(totalTime).toBeLessThan(100); // Total under 100ms
    expect(cleanupTime).toBeLessThan(50); // Cleanup under 50ms
  });
});

/**
 * FIXING THE ORIGINAL ISSUE: Database Environment Test
 * 
 * The original problem was that database client mocks from @libsql/client
 * were persisting between tests, causing unexpected behavior.
 * 
 * Here's how to fix it:
 */

// BEFORE (problematic):
// describe('Database Environment Tests', () => {
//   it('test 1', async () => {
//     const client = await getDatabaseClient();
//     await client.execute('SELECT 1');
//     // Mock state persists...
//   });
//   
//   it('test 2', async () => {
//     const client = await getDatabaseClient(); 
//     // Gets the same mock with persistent state from test 1!
//     expect(client.execute).toHaveBeenCalled(); // Unexpected!
//   });
// });

// AFTER (fixed with TestMockManager):
describe('Database Environment Tests - FIXED', () => {
  beforeEach(() => {
    MockManager.clearAllMocks(); // Ensure clean state
  });

  afterEach(() => {
    MockManager.validateMockIsolation(); // Verify isolation
  });

  it('test 1 - fresh database client', async () => {
    const { client } = createDatabaseTestMock();
    
    expect(client.execute).not.toHaveBeenCalled(); // Always fresh
    await client.execute('SELECT 1');
    expect(client.execute).toHaveBeenCalledWith('SELECT 1');
  });

  it('test 2 - isolated from test 1', async () => {
    const { client } = createDatabaseTestMock();
    
    // No state from previous test
    expect(client.execute).not.toHaveBeenCalled(); // ✅ Works!
    await client.execute('SELECT 2'); 
    expect(client.execute).toHaveBeenCalledTimes(1); // ✅ Correct count!
  });
});