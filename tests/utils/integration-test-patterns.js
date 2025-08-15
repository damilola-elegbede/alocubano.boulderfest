/**
 * Integration Test Patterns and Utilities
 *
 * Provides reusable patterns for integration testing including:
 * - Service availability detection
 * - Database isolation
 * - API mocking and fallbacks
 * - Performance monitoring
 * - Error simulation
 *
 * This module has been migrated from TestEnvironmentManager to use simple-helpers
 * for improved performance and maintainability.
 */

import {
  backupEnv,
  restoreEnv,
  resetDatabaseSingleton,
  cleanupTest,
} from "../helpers/simple-helpers.js";

/**
 * Service availability patterns for integration tests
 * Handles external service detection and graceful degradation
 */
export function createServiceAvailabilityPatterns(config = {}) {
  const {
    useRealServices = true,
    skipOnUnavailable = true,
    timeout = 30000,
  } = config;

  // No instantiation needed with simple helpers approach

  return {
    // Service availability wrapper with graceful degradation
    withServiceAvailability: async (testFn, fallbackFn = null) => {
      if (!skipOnUnavailable) {
        return await testFn();
      }

      try {
        // Test service availability with timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Service availability check timeout")),
            timeout,
          );
        });

        const result = await Promise.race([testFn(), timeoutPromise]);

        return result;
      } catch (error) {
        if (fallbackFn) {
          console.warn(`Service unavailable, using fallback: ${error.message}`);
          return await fallbackFn();
        } else {
          console.warn(`Service unavailable, skipping test: ${error.message}`);
          return { skipped: true, reason: error.message };
        }
      }
    },

    // Database availability check
    checkDatabaseAvailability: async () => {
      try {
        const { getDatabaseClient } = await import("../../api/lib/database.js");
        const client = await getDatabaseClient();
        await client.execute("SELECT 1");
        return true;
      } catch (error) {
        console.warn("Database unavailable:", error.message);
        return false;
      }
    },

    // External API availability check
    checkAPIAvailability: async (url, expectedStatus = 200) => {
      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(timeout),
        });
        return response.status === expectedStatus;
      } catch (error) {
        console.warn(`API ${url} unavailable:`, error.message);
        return false;
      }
    },

    // Service health check with retry
    healthCheck: async (serviceName, checkFn, retries = 3) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const isHealthy = await checkFn();
          if (isHealthy) {
            return true;
          }
        } catch (error) {
          console.warn(
            `Health check attempt ${attempt} for ${serviceName} failed:`,
            error.message,
          );
        }

        if (attempt < retries) {
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }

      return false;
    },
  };
}

/**
 * Database isolation patterns for integration tests
 */
export function createDatabaseIsolationPatterns(config = {}) {
  const {
    useTransactions = true,
    resetBetweenTests = true,
    preserveSchema = true,
  } = config;

  return {
    // Transaction-based isolation
    withTransactionIsolation: async (testFn) => {
      if (!useTransactions) {
        return await testFn();
      }

      const { getDatabaseClient } = await import("../../api/lib/database.js");
      const client = await getDatabaseClient();

      try {
        await client.execute("BEGIN");
        const result = await testFn(client);
        await client.execute("ROLLBACK"); // Always rollback in tests
        return result;
      } catch (error) {
        try {
          await client.execute("ROLLBACK");
        } catch (rollbackError) {
          console.error("Transaction rollback failed:", rollbackError);
        }
        throw error;
      }
    },

    // Complete database reset
    withDatabaseReset: async (testFn) => {
      const envBackup = backupEnv();

      try {
        await resetDatabaseSingleton();

        const result = await testFn();

        if (resetBetweenTests) {
          await resetDatabaseSingleton();
        }

        return result;
      } finally {
        restoreEnv(envBackup);
      }
    },

    // Schema preservation with data cleanup
    withDataCleanup: async (testFn, tables = []) => {
      const { getDatabaseClient } = await import("../../api/lib/database.js");
      const client = await getDatabaseClient();

      // Store initial state if needed
      const initialData = preserveSchema
        ? await this._captureTableData(client, tables)
        : null;

      try {
        const result = await testFn(client);

        // Clean up test data
        for (const table of tables) {
          try {
            await client.execute(
              `DELETE FROM ${table} WHERE created_at > datetime('now', '-1 minute')`,
            );
          } catch (error) {
            console.warn(`Failed to clean table ${table}:`, error.message);
          }
        }

        return result;
      } catch (error) {
        // Restore initial state on error if preserving schema
        if (preserveSchema && initialData) {
          await this._restoreTableData(client, initialData);
        }
        throw error;
      }
    },

    // Helper methods
    _captureTableData: async (client, tables) => {
      const data = {};
      for (const table of tables) {
        try {
          const result = await client.execute(`SELECT * FROM ${table}`);
          data[table] = result.rows;
        } catch (error) {
          console.warn(`Failed to capture data from ${table}:`, error.message);
        }
      }
      return data;
    },

    _restoreTableData: async (client, data) => {
      for (const [table, rows] of Object.entries(data)) {
        try {
          await client.execute(`DELETE FROM ${table}`);
          for (const row of rows) {
            const columns = Object.keys(row).join(", ");
            const placeholders = Object.keys(row)
              .map(() => "?")
              .join(", ");
            const values = Object.values(row);
            await client.execute(
              `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
              values,
            );
          }
        } catch (error) {
          console.error(`Failed to restore data to ${table}:`, error.message);
        }
      }
    },
  };
}

/**
 * API mocking and fallback patterns
 */
export function createAPIMockingPatterns(config = {}) {
  const {
    mockByDefault = false,
    preserveRealCalls = false,
    recordInteractions = false,
  } = config;

  const interactions = [];

  return {
    // Mock external API calls
    withAPIMocking: async (testFn, mocks = {}) => {
      const originalFetch = global.fetch;
      const envBackup = backupEnv();

      try {
        // Set up fetch mock
        global.fetch = async (url, options) => {
          const interaction = {
            url: url.toString(),
            options: { ...options },
            timestamp: Date.now(),
          };

          if (recordInteractions) {
            interactions.push(interaction);
          }

          // Check for specific mock
          const mockKey = Object.keys(mocks).find((key) =>
            url.toString().includes(key),
          );
          if (mockKey) {
            const mockResponse = mocks[mockKey];
            return {
              ok: mockResponse.ok !== false,
              status: mockResponse.status || 200,
              json: async () => mockResponse.data || mockResponse,
              text: async () =>
                JSON.stringify(mockResponse.data || mockResponse),
              headers: new Headers(mockResponse.headers || {}),
            };
          }

          // Preserve real calls if configured
          if (preserveRealCalls && !mockByDefault) {
            return await originalFetch(url, options);
          }

          // Default mock response
          return {
            ok: true,
            status: 200,
            json: async () => ({ mocked: true, url: url.toString() }),
            text: async () =>
              JSON.stringify({ mocked: true, url: url.toString() }),
            headers: new Headers(),
          };
        };

        const result = await testFn();

        return { result, interactions: [...interactions] };
      } finally {
        global.fetch = originalFetch;
        restoreEnv(envBackup);
        interactions.length = 0; // Clear interactions
      }
    },

    // Service-specific mocking
    withBrevoMocking: async (testFn) => {
      return await this.withAPIMocking(testFn, {
        "api.brevo.com": {
          ok: true,
          status: 200,
          data: { messageId: "test-message-id" },
        },
      });
    },

    withStripeMocking: async (testFn) => {
      return await this.withAPIMocking(testFn, {
        "api.stripe.com": {
          ok: true,
          status: 200,
          data: {
            id: "test-session-id",
            url: "https://checkout.stripe.com/test",
          },
        },
      });
    },

    // Get recorded interactions for analysis
    getInteractions: () => [...interactions],

    // Clear recorded interactions
    clearInteractions: () => (interactions.length = 0),
  };
}

/**
 * Performance monitoring patterns for integration tests
 */
export function createPerformanceMonitoringPatterns(config = {}) {
  const {
    enableMetrics = true,
    trackMemory = true,
    trackTiming = true,
    thresholds = {},
  } = config;

  return {
    // Performance monitoring wrapper
    withPerformanceMonitoring: async (testFn, testName = "unknown") => {
      if (!enableMetrics) {
        return await testFn();
      }

      const metrics = {
        testName,
        startTime: performance.now(),
        startMemory: trackMemory ? process.memoryUsage() : null,
        endTime: null,
        endMemory: null,
        duration: null,
        memoryDelta: null,
      };

      try {
        const result = await testFn();

        metrics.endTime = performance.now();
        metrics.duration = metrics.endTime - metrics.startTime;

        if (trackMemory) {
          metrics.endMemory = process.memoryUsage();
          metrics.memoryDelta = {
            rss: metrics.endMemory.rss - metrics.startMemory.rss,
            heapUsed: metrics.endMemory.heapUsed - metrics.startMemory.heapUsed,
            heapTotal:
              metrics.endMemory.heapTotal - metrics.startMemory.heapTotal,
          };
        }

        // Check thresholds
        this._checkPerformanceThresholds(metrics, thresholds);

        return { result, metrics };
      } catch (error) {
        metrics.endTime = performance.now();
        metrics.duration = metrics.endTime - metrics.startTime;
        metrics.error = error.message;

        throw error;
      }
    },

    // Load testing simulation
    withLoadTesting: async (testFn, config = {}) => {
      const { concurrent = 5, iterations = 10, delay = 100 } = config;

      const results = [];

      for (let i = 0; i < iterations; i++) {
        const batch = Array(concurrent)
          .fill(null)
          .map(async (_, index) => {
            const batchMetrics = await this.withPerformanceMonitoring(
              testFn,
              `batch-${i}-item-${index}`,
            );
            return batchMetrics;
          });

        const batchResults = await Promise.allSettled(batch);
        results.push(...batchResults);

        // Delay between batches
        if (delay > 0 && i < iterations - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      return {
        total: results.length,
        successful: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
        results,
      };
    },

    // Memory leak detection
    detectMemoryLeaks: async (testFn, iterations = 10) => {
      if (!trackMemory) {
        throw new Error("Memory tracking must be enabled for leak detection");
      }

      const memorySnapshots = [];

      for (let i = 0; i < iterations; i++) {
        const { result, metrics } = await this.withPerformanceMonitoring(
          testFn,
          `leak-test-${i}`,
        );
        memorySnapshots.push({
          iteration: i,
          heapUsed: metrics.endMemory.heapUsed,
          rss: metrics.endMemory.rss,
          memoryDelta: metrics.memoryDelta,
        });

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      return this._analyzeMemoryTrends(memorySnapshots);
    },

    // Helper methods
    _checkPerformanceThresholds: (metrics, thresholds) => {
      if (thresholds.maxDuration && metrics.duration > thresholds.maxDuration) {
        console.warn(
          `Test ${metrics.testName} exceeded duration threshold: ${metrics.duration}ms > ${thresholds.maxDuration}ms`,
        );
      }

      if (
        thresholds.maxMemoryDelta &&
        metrics.memoryDelta &&
        metrics.memoryDelta.heapUsed > thresholds.maxMemoryDelta
      ) {
        console.warn(
          `Test ${metrics.testName} exceeded memory threshold: ${metrics.memoryDelta.heapUsed} bytes`,
        );
      }
    },

    _analyzeMemoryTrends: (snapshots) => {
      if (snapshots.length < 3) {
        return { warning: "Not enough snapshots for trend analysis" };
      }

      const heapTrend = this._calculateTrend(snapshots.map((s) => s.heapUsed));
      const rssTrend = this._calculateTrend(snapshots.map((s) => s.rss));

      return {
        snapshots,
        trends: {
          heapUsed: heapTrend,
          rss: rssTrend,
        },
        possibleLeak: heapTrend.slope > 1000000 || rssTrend.slope > 1000000, // 1MB per iteration
      };
    },

    _calculateTrend: (values) => {
      const n = values.length;
      const sumX = (n * (n - 1)) / 2;
      const sumY = values.reduce((sum, val) => sum + val, 0);
      const sumXY = values.reduce((sum, val, index) => sum + index * val, 0);
      const sumX2 = values.reduce((sum, _, index) => sum + index * index, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      return { slope, intercept };
    },
  };
}

/**
 * Error simulation and chaos testing patterns
 */
export function createErrorSimulationPatterns(config = {}) {
  const {
    enableChaos = false,
    errorRate = 0.1,
    errorTypes = ["network", "database", "timeout"],
  } = config;

  return {
    // Simulate random errors
    withChaosEngineering: async (testFn, chaosConfig = {}) => {
      if (!enableChaos && !chaosConfig.force) {
        return await testFn();
      }

      const actualErrorRate = chaosConfig.errorRate || errorRate;
      const actualErrorTypes = chaosConfig.errorTypes || errorTypes;

      // Randomly decide whether to inject an error
      if (Math.random() < actualErrorRate) {
        const errorType =
          actualErrorTypes[Math.floor(Math.random() * actualErrorTypes.length)];
        throw new Error(`Simulated ${errorType} error for chaos testing`);
      }

      return await testFn();
    },

    // Network failure simulation
    withNetworkFailure: async (testFn, failureRate = 0.5) => {
      const originalFetch = global.fetch;

      try {
        global.fetch = async (...args) => {
          if (Math.random() < failureRate) {
            throw new Error("Simulated network failure");
          }
          return await originalFetch(...args);
        };

        return await testFn();
      } finally {
        global.fetch = originalFetch;
      }
    },

    // Database failure simulation
    withDatabaseFailure: async (testFn, failureRate = 0.3) => {
      const envBackup = backupEnv();

      try {
        // Inject database connection failures
        if (Math.random() < failureRate) {
          process.env.DATABASE_URL = "invalid://database/url";
        }

        return await testFn();
      } finally {
        restoreEnv(envBackup);
      }
    },

    // Timeout simulation
    withTimeoutSimulation: async (testFn, timeoutMs = 5000) => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Simulated timeout")), timeoutMs);
      });

      return await Promise.race([testFn(), timeoutPromise]);
    },

    // Memory pressure simulation
    withMemoryPressure: async (testFn, pressureMB = 100) => {
      const memoryHog = [];

      try {
        // Allocate memory to create pressure
        for (let i = 0; i < pressureMB; i++) {
          memoryHog.push(new Array(1024 * 1024).fill(0)); // 1MB arrays
        }

        return await testFn();
      } finally {
        // Release memory
        memoryHog.length = 0;
        if (global.gc) {
          global.gc();
        }
      }
    },
  };
}

/**
 * Comprehensive integration test suite builder
 */
export function createIntegrationTestSuite(config = {}) {
  const servicePatterns = createServiceAvailabilityPatterns(config.services);
  const databasePatterns = createDatabaseIsolationPatterns(config.database);
  const mockingPatterns = createAPIMockingPatterns(config.mocking);
  const performancePatterns = createPerformanceMonitoringPatterns(
    config.performance,
  );
  const errorPatterns = createErrorSimulationPatterns(config.errors);

  return {
    // Combined patterns
    ...servicePatterns,
    ...databasePatterns,
    ...mockingPatterns,
    ...performancePatterns,
    ...errorPatterns,

    // Comprehensive test wrapper
    withFullIntegration: async (testFn, options = {}) => {
      const {
        useDatabase = true,
        useAPIMocking = false,
        monitorPerformance = true,
        enableChaos = false,
      } = options;

      let wrappedTest = testFn;

      // Apply layers based on options
      if (monitorPerformance) {
        const originalTest = wrappedTest;
        wrappedTest = async () => {
          const { result } =
            await performancePatterns.withPerformanceMonitoring(
              originalTest,
              options.testName,
            );
          return result;
        };
      }

      if (useDatabase) {
        const originalTest = wrappedTest;
        wrappedTest = async () => {
          return await databasePatterns.withDatabaseReset(originalTest);
        };
      }

      if (useAPIMocking) {
        const originalTest = wrappedTest;
        wrappedTest = async () => {
          const { result } = await mockingPatterns.withAPIMocking(
            originalTest,
            options.mocks,
          );
          return result;
        };
      }

      if (enableChaos) {
        const originalTest = wrappedTest;
        wrappedTest = async () => {
          return await errorPatterns.withChaosEngineering(
            originalTest,
            options.chaos,
          );
        };
      }

      // Apply service availability check
      return await servicePatterns.withServiceAvailability(
        wrappedTest,
        options.fallback,
      );
    },

    // Cleanup all patterns
    cleanup: async () => {
      await cleanupTest();
    },
  };
}

/**
 * Export default integration patterns
 */
export default {
  createServiceAvailabilityPatterns,
  createDatabaseIsolationPatterns,
  createAPIMockingPatterns,
  createPerformanceMonitoringPatterns,
  createErrorSimulationPatterns,
  createIntegrationTestSuite,
};
