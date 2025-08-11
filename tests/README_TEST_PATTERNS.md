# Test Patterns and Async Initialization

<test-guide-metadata>
  <title>Comprehensive Testing Patterns for Async Services</title>
  <scope>Unit, integration, and performance testing best practices</scope>
  <audience>Developers writing and maintaining test suites</audience>
  <focus>Async initialization, service mocking, and test reliability</focus>
</test-guide-metadata>

## Overview

<testing-philosophy>
  <principle>Tests must be deterministic and reliable</principle>
  <principle>Async initialization should be handled consistently</principle>
  <principle>Mock services should behave predictably</principle>
  <principle>Test isolation prevents side effects between tests</principle>
</testing-philosophy>

This guide covers testing patterns for async services in the A Lo Cubano Boulder Fest project, focusing on reliable test initialization, proper service mocking, and handling async operations in tests.

## Test Initialization Utilities

<utility-overview>
  <file>/tests/utils/test-initialization-helpers.js</file>
  <purpose>Centralized async test setup and teardown</purpose>
  <patterns>Service initialization, dependency management, cleanup automation</patterns>
</utility-overview>

### Core Test Initialization Class

The `TestInitializationHelpers` class provides comprehensive test setup:

```javascript
import { TestInitializationHelpers } from "./utils/test-initialization-helpers.js";

const testInit = new TestInitializationHelpers();

// Initialize services for testing
const services = await testInit.initializeServices({
  database: {
    factory: () => createTestDatabase(),
    dependencies: [],
    timeout: 15000,
  },
  brevoService: {
    factory: () => createBrevoService(),
    dependencies: ["database"],
    timeout: 10000,
  },
});
```

### Key Features

<feature-list>
  <feature name="dependency-management">
    <description>Ensures services initialize in correct order</description>
    <implementation>Dependency graph resolution with timeout handling</implementation>
  </feature>
  <feature name="timeout-protection">
    <description>Prevents tests from hanging on failed initialization</description>
    <implementation>Race condition between initialization and timeout</implementation>
  </feature>
  <feature name="cleanup-automation">
    <description>Automatic resource cleanup after tests</description>
    <implementation>Registered cleanup tasks with error handling</implementation>
  </feature>
  <feature name="environment-setup">
    <description>Consistent test environment configuration</description>
    <implementation>Environment variable management with defaults</implementation>
  </feature>
</feature-list>

## Service Initialization Patterns

### 1. Dependency-Ordered Initialization

<initialization-pattern name="dependency-ordered">
  <use-case>Services that depend on other services</use-case>
  <benefits>Prevents initialization race conditions</benefits>
  <implementation>Promise-based dependency waiting</implementation>
</initialization-pattern>

```javascript
// Define service dependencies
const serviceDefinitions = {
  database: {
    factory: async () => {
      const db = await createTestDatabase();
      await db.migrate();
      return db;
    },
    dependencies: [], // No dependencies
    timeout: 15000,
  },

  emailService: {
    factory: async () => {
      // Wait for database to be ready
      const brevo = new BrevoService();
      await brevo.initialize();
      return brevo;
    },
    dependencies: ["database"], // Depends on database
    timeout: 10000,
  },
};

// Initialize with proper ordering
const services = await testInit.initializeServices(serviceDefinitions);
```

### 2. Database Readiness Checking

<database-pattern>
  <challenge>Database may not be immediately available</challenge>
  <solution>Polling with timeout and exponential backoff</solution>
</database-pattern>

```javascript
// Wait for database to be ready
await testInit.waitForDatabase(databaseService, 15000);

// Example implementation
async waitForDatabase(dbService, timeout = 15000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await dbService.execute("SELECT 1");
      return true;
    } catch (error) {
      if (Date.now() - startTime > timeout - 1000) {
        throw new Error(`Database not ready: ${error.message}`);
      }
      await this.sleep(500);
    }
  }

  return false;
}
```

### 3. Environment Variable Management

<environment-setup>
  <purpose>Consistent test environment across all test files</purpose>
  <features>Default values, required variable validation, test isolation</features>
</environment-setup>

```javascript
// Set up test environment with defaults
testInit.setupTestEnvironment({
  NODE_ENV: "test",
  TURSO_DATABASE_URL: "file:test.db",
  BREVO_API_KEY: "xkeysib-test123",
  BREVO_NEWSLETTER_LIST_ID: "123",
  BREVO_WEBHOOK_SECRET: "webhook_secret_123",
});

// Custom environment for specific tests
testInit.setupTestEnvironment({
  STRIPE_WEBHOOK_SECRET: "whsec_test123",
  ADMIN_PASSWORD: await bcrypt.hash("test_password", 10),
});
```

## Mock Service Patterns

<mocking-strategy>
  <approach>Behavior-based mocks that simulate real service patterns</approach>
  <focus>Async operations, error conditions, timing simulation</focus>
  <tools>Vitest mocks with proper async handling</tools>
</mocking-strategy>

### 1. Database Service Mocking

```javascript
const mockDatabase = {
  execute: vi.fn().mockResolvedValue({
    rows: [{ id: 1, name: "test" }],
    lastInsertRowid: 1,
  }),
  batch: vi.fn().mockResolvedValue([
    { rows: [], lastInsertRowid: 1 },
    { rows: [], lastInsertRowid: 2 },
  ]),
  close: vi.fn(),
  initialized: true,

  // Simulate connection testing
  testConnection: vi.fn().mockResolvedValue(true),

  // Health check simulation
  healthCheck: vi.fn().mockResolvedValue({
    status: "healthy",
    timestamp: new Date().toISOString(),
  }),
};
```

### 2. Brevo Service Mocking

```javascript
const mockBrevoService = {
  subscribeToNewsletter: vi
    .fn()
    .mockImplementation(async (email, attributes = {}) => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate different responses based on input
      if (email.includes("duplicate")) {
        throw new Error("Contact already exists");
      }

      return {
        id: `brevo_${Date.now()}`,
        email,
        listIds: [1],
        attributes,
      };
    }),

  unsubscribeContact: vi.fn().mockResolvedValue({ success: true }),

  healthCheck: vi.fn().mockResolvedValue({
    status: "healthy",
    apiKey: "***",
    listCount: 1,
  }),
};
```

### 3. Error Simulation Mocks

<error-simulation>
  <purpose>Test error handling and recovery scenarios</purpose>
  <patterns>Network timeouts, service unavailability, validation errors</patterns>
</error-simulation>

```javascript
// Mock that simulates intermittent failures
const unreliableDatabaseMock = {
  execute: vi.fn().mockImplementation(async (query) => {
    // Simulate 20% failure rate
    if (Math.random() < 0.2) {
      throw new Error("Database connection lost");
    }

    return { rows: [], lastInsertRowid: 1 };
  }),
};

// Mock that simulates timeout scenarios
const slowServiceMock = {
  operation: vi.fn().mockImplementation(async () => {
    // Simulate slow response (longer than typical timeout)
    await new Promise((resolve) => setTimeout(resolve, 15000));
    return { result: "success" };
  }),
};
```

## Test Lifecycle Management

<lifecycle-patterns>
  <setup>Environment preparation, service initialization</setup>
  <execution>Test isolation, async operation handling</execution>
  <teardown>Resource cleanup, state reset</teardown>
</lifecycle-patterns>

### 1. Complete Test Lifecycle

```javascript
import { withInitializedServices } from "./utils/test-initialization-helpers.js";

describe("Email Service Integration", () => {
  it("should handle newsletter subscription flow", async () => {
    await withInitializedServices(
      {
        database: {
          factory: () => createTestDatabase(),
          dependencies: [],
          timeout: 15000,
        },
        brevoService: {
          factory: () => createBrevoService(),
          dependencies: ["database"],
          timeout: 10000,
        },
      },
      async (services) => {
        // Test implementation with guaranteed initialized services
        const { database, brevoService } = services;

        const result = await brevoService.subscribeToNewsletter(
          "test@example.com",
          { firstName: "Test", lastName: "User" },
        );

        expect(result).toHaveProperty("id");
        expect(result.email).toBe("test@example.com");

        // Verify database interaction
        const subscribers = await database.execute(
          "SELECT * FROM newsletter_subscribers WHERE email = ?",
          ["test@example.com"],
        );

        expect(subscribers.rows).toHaveLength(1);

        // Cleanup is handled automatically by withInitializedServices
      },
    );
  });
});
```

### 2. Manual Lifecycle Management

```javascript
describe("Database Operations", () => {
  let testInit;
  let services;

  beforeEach(async () => {
    testInit = new TestInitializationHelpers();
    testInit.setupTestEnvironment();
    testInit.validatePrerequisites();

    services = await testInit.initializeServices({
      database: {
        factory: () => createTestDatabase(),
        timeout: 15000,
      },
    });
  });

  afterEach(async () => {
    await testInit.cleanup();
  });

  it("should perform database operations", async () => {
    const { database } = services;

    const result = await database.execute(
      "INSERT INTO test_table (name) VALUES (?)",
      ["test_value"],
    );

    expect(result.lastInsertRowid).toBeGreaterThan(0);
  });
});
```

## Async Operation Testing

<async-testing-patterns>
  <pattern name="promise-resolution">Waiting for promises to resolve completely</pattern>
  <pattern name="timeout-handling">Testing timeout scenarios and recovery</pattern>
  <pattern name="concurrent-operations">Testing race conditions and parallel execution</pattern>
  <pattern name="error-propagation">Ensuring errors bubble up correctly</pattern>
</async-testing-patterns>

### 1. Promise Resolution Testing

```javascript
it("should handle async initialization correctly", async () => {
  const service = new AsyncService();

  // Start multiple initialization attempts simultaneously
  const promise1 = service.ensureInitialized();
  const promise2 = service.ensureInitialized();
  const promise3 = service.ensureInitialized();

  // All should resolve to the same instance
  const [instance1, instance2, instance3] = await Promise.all([
    promise1,
    promise2,
    promise3,
  ]);

  expect(instance1).toBe(instance2);
  expect(instance2).toBe(instance3);

  // Verify only one initialization occurred
  expect(mockCreateInstance).toHaveBeenCalledTimes(1);
});
```

### 2. Timeout Testing

```javascript
it("should handle initialization timeout", async () => {
  const service = new AsyncService();

  // Mock a slow initialization
  mockCreateInstance.mockImplementation(
    () => new Promise((resolve) => setTimeout(resolve, 20000)),
  );

  // Should timeout after 10 seconds
  await expect(service.ensureInitialized()).rejects.toThrow(
    "Service initialization timeout",
  );

  // Should allow retry after timeout
  mockCreateInstance.mockImplementation(() => Promise.resolve(mockInstance));

  const instance = await service.ensureInitialized();
  expect(instance).toBe(mockInstance);
});
```

### 3. Concurrent Operation Testing

```javascript
it("should handle concurrent database operations", async () => {
  const database = await getDatabaseClient();

  // Simulate concurrent operations
  const operations = Array.from({ length: 10 }, (_, i) =>
    database.execute("INSERT INTO concurrent_test (value) VALUES (?)", [
      `value_${i}`,
    ]),
  );

  const results = await Promise.allSettled(operations);

  // All operations should succeed
  const successful = results.filter((r) => r.status === "fulfilled");
  expect(successful).toHaveLength(10);

  // Verify all values were inserted
  const rows = await database.execute(
    "SELECT COUNT(*) as count FROM concurrent_test",
  );
  expect(rows.rows[0].count).toBe(10);
});
```

## Retry Logic Testing

<retry-testing>
  <scenarios>Transient failures, permanent failures, backoff behavior</scenarios>
  <verification>Retry count, delay timing, final outcomes</verification>
</retry-testing>

### 1. Transient Failure Recovery

```javascript
it("should recover from transient failures", async () => {
  let attemptCount = 0;

  const flakyService = {
    initialize: vi.fn().mockImplementation(async () => {
      attemptCount++;

      if (attemptCount < 3) {
        throw new Error("Transient failure");
      }

      return { initialized: true, attempt: attemptCount };
    }),
  };

  const result = await testInit.retry(
    () => flakyService.initialize(),
    3, // maxAttempts
    100, // baseDelay
  );

  expect(result.initialized).toBe(true);
  expect(result.attempt).toBe(3);
  expect(flakyService.initialize).toHaveBeenCalledTimes(3);
});
```

### 2. Permanent Failure Handling

```javascript
it("should fail permanently after max retries", async () => {
  const permanentlyFailingService = {
    initialize: vi.fn().mockRejectedValue(new Error("Permanent failure")),
  };

  await expect(
    testInit.retry(() => permanentlyFailingService.initialize(), 3, 100),
  ).rejects.toThrow("Permanent failure");

  expect(permanentlyFailingService.initialize).toHaveBeenCalledTimes(3);
});
```

### 3. Exponential Backoff Testing

```javascript
it("should implement exponential backoff", async () => {
  const delays = [];
  const startTime = Date.now();

  const timingService = {
    initialize: vi.fn().mockImplementation(async () => {
      delays.push(Date.now() - startTime);
      throw new Error("Always fails");
    }),
  };

  try {
    await testInit.retry(
      () => timingService.initialize(),
      3,
      1000, // 1 second base delay
    );
  } catch (error) {
    // Expected to fail
  }

  // Verify exponential backoff: 0ms, ~1000ms, ~3000ms
  expect(delays[0]).toBeLessThan(100); // First attempt immediate
  expect(delays[1]).toBeGreaterThan(900); // Second after ~1s
  expect(delays[2]).toBeGreaterThan(2900); // Third after ~3s
});
```

## Test Data Management

<test-data-patterns>
  <builders>Programmatic test data creation</builders>
  <fixtures>Predefined test datasets</fixtures>
  <cleanup>Automatic data cleanup after tests</cleanup>
</test-data-patterns>

### 1. Test Data Builder Pattern

```javascript
class TestDataBuilder {
  constructor() {
    this.data = {};
  }

  withUser(overrides = {}) {
    this.data.user = {
      id: generateUniqueId(),
      email: `test${Date.now()}@example.com`,
      firstName: "Test",
      lastName: "User",
      createdAt: new Date().toISOString(),
      ...overrides,
    };
    return this;
  }

  withTicket(overrides = {}) {
    this.data.ticket = {
      id: generateUniqueId(),
      userId: this.data.user?.id,
      eventId: "boulder-fest-2026",
      type: "weekend-pass",
      quantity: 1,
      totalAmount: 12000,
      status: "confirmed",
      ...overrides,
    };
    return this;
  }

  async build() {
    const { database } = await this.getServices();

    if (this.data.user) {
      await database.execute(
        "INSERT INTO users (id, email, first_name, last_name, created_at) VALUES (?, ?, ?, ?, ?)",
        [
          this.data.user.id,
          this.data.user.email,
          this.data.user.firstName,
          this.data.user.lastName,
          this.data.user.createdAt,
        ],
      );
    }

    if (this.data.ticket) {
      await database.execute(
        "INSERT INTO tickets (id, user_id, event_id, type, quantity, total_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          this.data.ticket.id,
          this.data.ticket.userId,
          this.data.ticket.eventId,
          this.data.ticket.type,
          this.data.ticket.quantity,
          this.data.ticket.totalAmount,
          this.data.ticket.status,
        ],
      );
    }

    return this.data;
  }
}

// Usage in tests
it("should process ticket validation", async () => {
  const testData = await new TestDataBuilder()
    .withUser({ email: "validator@example.com" })
    .withTicket({ type: "day-pass" })
    .build();

  const validation = await validateTicket(testData.ticket.id);
  expect(validation.isValid).toBe(true);
});
```

### 2. Database Cleanup Patterns

```javascript
class DatabaseCleaner {
  constructor(database) {
    this.database = database;
    this.createdIds = {
      users: [],
      tickets: [],
      transactions: [],
    };
  }

  trackCreation(table, id) {
    this.createdIds[table].push(id);
  }

  async cleanup() {
    // Clean up in reverse dependency order
    for (const ticketId of this.createdIds.tickets) {
      await this.database.execute("DELETE FROM tickets WHERE id = ?", [
        ticketId,
      ]);
    }

    for (const userId of this.createdIds.users) {
      await this.database.execute("DELETE FROM users WHERE id = ?", [userId]);
    }

    // Clear tracking
    this.createdIds = { users: [], tickets: [], transactions: [] };
  }
}
```

## Performance Testing Patterns

<performance-testing>
  <metrics>Response time, throughput, resource utilization</metrics>
  <scenarios>Load testing, stress testing, endurance testing</scenarios>
  <tools>Custom load generation, timing utilities</tools>
</performance-testing>

### 1. Response Time Testing

```javascript
it("should respond within acceptable time limits", async () => {
  const service = await initializeService();
  const startTime = Date.now();

  const result = await service.processRequest({
    type: "newsletter_subscription",
    email: "perf@example.com",
  });

  const responseTime = Date.now() - startTime;

  expect(result).toHaveProperty("id");
  expect(responseTime).toBeLessThan(100); // 100ms SLA
});
```

### 2. Load Testing

```javascript
it("should handle concurrent requests", async () => {
  const service = await initializeService();
  const concurrentRequests = 50;

  const requests = Array.from({ length: concurrentRequests }, (_, i) =>
    service.processRequest({
      type: "ticket_validation",
      ticketId: `ticket_${i}`,
    }),
  );

  const startTime = Date.now();
  const results = await Promise.allSettled(requests);
  const totalTime = Date.now() - startTime;

  const successful = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");

  expect(successful.length).toBe(concurrentRequests);
  expect(failed.length).toBe(0);
  expect(totalTime).toBeLessThan(5000); // 5 second total time

  // Calculate throughput
  const throughput = concurrentRequests / (totalTime / 1000);
  expect(throughput).toBeGreaterThan(10); // 10 requests/second
});
```

## Troubleshooting Common Issues

<troubleshooting-guide>
  <issue severity="high">
    <problem>Tests hang indefinitely</problem>
    <causes>Missing await, infinite loops, unclosed resources</causes>
    <solutions>Timeout configuration, resource cleanup, promise debugging</solutions>
  </issue>
  <issue severity="medium">
    <problem>Intermittent test failures</problem>
    <causes>Race conditions, shared state, timing dependencies</causes>
    <solutions>Proper isolation, deterministic mocking, retry logic</solutions>
  </issue>
  <issue severity="medium">
    <problem>Memory leaks in test suite</problem>
    <causes>Unclosed connections, event listeners, large mock data</causes>
    <solutions>Cleanup automation, resource monitoring, mock optimization</solutions>
  </issue>
</troubleshooting-guide>

### 1. Debugging Hanging Tests

```javascript
// Add timeout to prevent hanging
it("should complete within timeout", async () => {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Test timeout")), 10000),
  );

  const testPromise = performAsyncOperation();

  // Race between test completion and timeout
  const result = await Promise.race([testPromise, timeoutPromise]);

  expect(result).toBeDefined();
}, 15000); // Vitest timeout
```

### 2. Debugging Race Conditions

```javascript
it("should handle race conditions properly", async () => {
  const service = new AsyncService();

  // Use barriers to control timing
  let initStarted = false;
  let proceedWithInit = false;

  const mockInit = vi.fn().mockImplementation(async () => {
    initStarted = true;

    // Wait for test to proceed
    while (!proceedWithInit) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return mockInstance;
  });

  service._performInitialization = mockInit;

  // Start initialization
  const promise1 = service.ensureInitialized();

  // Wait for initialization to start
  while (!initStarted) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Start second initialization
  const promise2 = service.ensureInitialized();

  // Now allow initialization to proceed
  proceedWithInit = true;

  const [result1, result2] = await Promise.all([promise1, promise2]);

  expect(result1).toBe(result2);
  expect(mockInit).toHaveBeenCalledTimes(1);
});
```

### 3. Resource Leak Detection

```javascript
describe("Resource Management", () => {
  let initialConnections;

  beforeEach(() => {
    initialConnections = getConnectionCount();
  });

  afterEach(() => {
    const currentConnections = getConnectionCount();

    if (currentConnections > initialConnections) {
      console.warn(
        `Potential connection leak: ${currentConnections - initialConnections} connections`,
      );
    }
  });

  it("should clean up resources properly", async () => {
    const service = await initializeService();
    await service.performOperations();
    await service.cleanup();

    // Verify no resource leaks
    expect(getConnectionCount()).toBe(initialConnections);
  });
});
```

## Best Practices Summary

<best-practices-summary>
  <practice priority="critical">Always use timeout protection for async operations</practice>
  <practice priority="critical">Implement proper cleanup in test lifecycle</practice>
  <practice priority="high">Use deterministic mocks that behave predictably</practice>
  <practice priority="high">Test both success and failure scenarios</practice>
  <practice priority="medium">Verify resource cleanup and prevent leaks</practice>
  <practice priority="medium">Use test data builders for complex scenarios</practice>
  <practice priority="low">Monitor test performance and execution time</practice>
</best-practices-summary>

### Quick Reference

```javascript
// ✅ Good test pattern
describe("Service Tests", () => {
  it("should handle async operations", async () => {
    await withInitializedServices(
      {
        service: { factory: createService, timeout: 10000 },
      },
      async ({ service }) => {
        const result = await service.operation();
        expect(result).toBeDefined();
      },
    );
  });
});

// ❌ Avoid these patterns
describe("Bad Patterns", () => {
  it("should not do this", async () => {
    // No timeout protection
    const result = await infiniteOperation();

    // No cleanup
    const service = createService();
    await service.operation();
    // service never cleaned up

    // Shared state
    globalVariable = "test";
    expect(otherTest()).toBe("test");
  });
});
```

## Related Documentation

<related-documentation>
  <doc>/docs/ASYNC_INITIALIZATION_GUIDE.md</doc>
  <doc>/docs/testing/TESTING_STRATEGY.md</doc>
  <doc>/docs/development/PERFORMANCE_OPTIMIZATIONS.md</doc>
</related-documentation>

---

_For production async patterns, see [Async Initialization Guide](/docs/ASYNC_INITIALIZATION_GUIDE.md)._
