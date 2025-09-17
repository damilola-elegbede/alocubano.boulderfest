/**
 * Audit Performance Integration Tests
 * Tests performance impact of audit logging under various load conditions
 * Validates database performance with audit tables and concurrent operations
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { testRequest, HTTP_STATUS, generateTestId } from './handler-test-helper.js';
import { getDbClient } from '../setup-integration.js';
import auditService from '../../lib/audit-service.js';

// Test admin credentials
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('❌ FATAL: TEST_ADMIN_PASSWORD required for audit performance tests');
}

describe('Audit Performance Integration Tests', () => {
  let dbClient;
  let adminToken;

  beforeEach(async () => {
    dbClient = await getDbClient();

    // Reset audit service state
    auditService.initialized = false;
    auditService.initializationPromise = null;
    auditService.db = null;

    // Initialize audit service
    await auditService.ensureInitialized();

    // Get admin token for authenticated requests
    const loginResponse = await testRequest('POST', '/api/admin/login', {
      username: 'admin',
      password: adminPassword
    });

    if (loginResponse.status === HTTP_STATUS.OK) {
      // Extract token from cookie
      const setCookie = loginResponse.headers && loginResponse.headers['set-cookie'];
      if (setCookie) {
        const tokenMatch = setCookie.match(/admin_session=([^;]+)/);
        if (tokenMatch) {
          adminToken = tokenMatch[1];
        }
      }
    } else {
      console.warn('⚠️ Could not obtain admin token - some tests may be skipped');
      adminToken = null;
    }
  });

  afterEach(async () => {
    // Clean up test data
    if (dbClient) {
      try {
        // Clean up performance test audit logs
        await dbClient.execute(
          "DELETE FROM audit_logs WHERE request_id LIKE 'perf_%' OR admin_user LIKE '%perf_test%'"
        );
      } catch (error) {
        console.warn('⚠️ Failed to clean performance test data:', error.message);
      }
    }
  });

  describe('Audit Logging Performance Impact', () => {
    test('single audit log entry performance is acceptable', async () => {
      const iterations = 10;
      const performanceResults = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        await auditService.logAdminAccess({
          requestId: generateTestId(`perf_single_${i}`),
          adminUser: 'perf_test_admin',
          sessionId: 'session_123',
          ipAddress: '127.0.0.1',
          userAgent: 'PerformanceTest/1.0',
          requestMethod: 'GET',
          requestUrl: '/api/admin/performance-test',
          responseStatus: 200,
          responseTimeMs: 100,
          metadata: {
            performanceTest: true,
            iteration: i
          }
        });

        const endTime = performance.now();
        const duration = endTime - startTime;
        performanceResults.push(duration);
      }

      // Calculate performance metrics
      const avgDuration = performanceResults.reduce((sum, duration) => sum + duration, 0) / iterations;
      const maxDuration = Math.max(...performanceResults);
      const minDuration = Math.min(...performanceResults);

      console.log('📊 Single Audit Log Performance:', {
        iterations,
        avgDuration: avgDuration.toFixed(2) + 'ms',
        maxDuration: maxDuration.toFixed(2) + 'ms',
        minDuration: minDuration.toFixed(2) + 'ms'
      });

      // Performance assertions
      expect(avgDuration).toBeLessThan(100); // Average should be under 100ms
      expect(maxDuration).toBeLessThan(200); // Max should be under 200ms

      // Verify all logs were created
      const auditLogs = await auditService.queryAuditLogs({
        adminUser: 'perf_test_admin',
        limit: iterations + 5
      });

      expect(auditLogs.logs.length).toBeGreaterThanOrEqual(iterations);
    });

    test('batch audit logging performance scales appropriately', async () => {
      const batchSizes = [5, 10, 25, 50];
      const batchResults = [];

      for (const batchSize of batchSizes) {
        const startTime = performance.now();

        // Create batch of audit logs
        const batchPromises = [];
        for (let i = 0; i < batchSize; i++) {
          batchPromises.push(
            auditService.logDataChange({
              requestId: generateTestId(`perf_batch_${batchSize}_${i}`),
              action: 'PERFORMANCE_TEST',
              targetType: 'batch_test',
              targetId: `batch_${batchSize}_item_${i}`,
              adminUser: `perf_batch_test_${batchSize}`,
              metadata: {
                batchSize,
                itemIndex: i,
                performanceTest: true
              }
            })
          );
        }

        // Execute batch
        await Promise.all(batchPromises);

        const endTime = performance.now();
        const totalDuration = endTime - startTime;
        const avgPerItem = totalDuration / batchSize;

        batchResults.push({
          batchSize,
          totalDuration,
          avgPerItem
        });

        console.log(`📊 Batch Performance (${batchSize} items):`, {
          totalDuration: totalDuration.toFixed(2) + 'ms',
          avgPerItem: avgPerItem.toFixed(2) + 'ms'
        });
      }

      // Verify scaling characteristics
      batchResults.forEach(result => {
        expect(result.avgPerItem).toBeLessThan(50); // Average per item should be under 50ms
        expect(result.totalDuration).toBeLessThan(5000); // Total batch should be under 5 seconds
      });

      // Verify logs were created
      for (const result of batchResults) {
        const batchLogs = await auditService.queryAuditLogs({
          adminUser: `perf_batch_test_${result.batchSize}`,
          limit: result.batchSize + 5
        });

        expect(batchLogs.logs.length).toBeGreaterThanOrEqual(result.batchSize);
      }
    });

    test('concurrent audit logging handles simultaneous requests', async () => {
      const concurrentRequests = 20;
      const requestsPerWorker = 5;

      const startTime = performance.now();

      // Create multiple concurrent "workers" each making several audit logs
      const workerPromises = [];
      for (let worker = 0; worker < concurrentRequests / requestsPerWorker; worker++) {
        const workerPromise = async () => {
          const workerLogs = [];
          for (let request = 0; request < requestsPerWorker; request++) {
            workerLogs.push(
              auditService.logAdminAccess({
                requestId: generateTestId(`perf_concurrent_w${worker}_r${request}`),
                adminUser: `perf_concurrent_worker_${worker}`,
                ipAddress: `192.168.${worker}.${request}`,
                userAgent: `ConcurrentTest/Worker${worker}`,
                requestMethod: 'POST',
                requestUrl: `/api/admin/concurrent-test/${worker}/${request}`,
                responseStatus: 200,
                responseTimeMs: 50 + request * 10,
                metadata: {
                  workerId: worker,
                  requestId: request,
                  concurrentTest: true
                }
              })
            );
          }
          return Promise.all(workerLogs);
        };

        workerPromises.push(workerPromise());
      }

      // Execute all workers concurrently
      await Promise.all(workerPromises);

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      console.log('📊 Concurrent Audit Logging Performance:', {
        concurrentRequests,
        totalDuration: totalDuration.toFixed(2) + 'ms',
        avgPerRequest: (totalDuration / concurrentRequests).toFixed(2) + 'ms'
      });

      // Performance assertions for concurrent access
      expect(totalDuration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(totalDuration / concurrentRequests).toBeLessThan(250); // Average per request under 250ms

      // Verify all logs were created
      const concurrentLogs = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: concurrentRequests + 10
      });

      const testLogs = concurrentLogs.logs.filter(log =>
        log.admin_user?.includes('perf_concurrent_worker')
      );

      expect(testLogs.length).toBeGreaterThanOrEqual(concurrentRequests);
    });
  });

  describe('Database Performance with Audit Tables', () => {
    test('audit table queries perform efficiently with large datasets', async () => {
      // Create a larger dataset for performance testing
      const largeDatasetSize = 100;
      console.log(`🔄 Creating ${largeDatasetSize} audit entries for performance testing...`);

      const createStartTime = performance.now();

      // Create test dataset in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let batch = 0; batch < largeDatasetSize / batchSize; batch++) {
        const batchPromises = [];
        for (let i = 0; i < batchSize; i++) {
          const entryIndex = batch * batchSize + i;
          batchPromises.push(
            auditService.logDataChange({
              requestId: generateTestId(`perf_dataset_${entryIndex}`),
              action: 'DATASET_ENTRY',
              targetType: 'performance_test',
              targetId: `dataset_item_${entryIndex}`,
              adminUser: `perf_dataset_user_${entryIndex % 5}`, // 5 different users
              metadata: {
                datasetIndex: entryIndex,
                batchNumber: batch,
                performanceTest: true
              },
              severity: entryIndex % 10 === 0 ? 'warning' : 'info' // 10% warnings
            })
          );
        }
        await Promise.all(batchPromises);
      }

      const createEndTime = performance.now();
      const createDuration = createEndTime - createStartTime;

      console.log(`✅ Dataset creation completed in ${createDuration.toFixed(2)}ms`);

      // Test various query patterns for performance
      const queryTests = [
        {
          name: 'Query by event type',
          query: { eventType: 'data_change', limit: 50 }
        },
        {
          name: 'Query by severity',
          query: { severity: 'warning', limit: 20 }
        },
        {
          name: 'Query by admin user',
          query: { adminUser: 'perf_dataset_user_0', limit: 30 }
        },
        {
          name: 'Query with pagination',
          query: { eventType: 'data_change', limit: 25, offset: 25 }
        }
      ];

      for (const queryTest of queryTests) {
        const queryStartTime = performance.now();

        const queryResult = await auditService.queryAuditLogs(queryTest.query);

        const queryEndTime = performance.now();
        const queryDuration = queryEndTime - queryStartTime;

        console.log(`📊 ${queryTest.name}:`, {
          duration: queryDuration.toFixed(2) + 'ms',
          resultsReturned: queryResult.logs.length,
          totalFound: queryResult.total
        });

        // Query performance assertions
        expect(queryDuration).toBeLessThan(500); // Queries should be under 500ms
        expect(queryResult.logs).toBeInstanceOf(Array);
        expect(queryResult.total).toBeGreaterThanOrEqual(queryResult.logs.length);
      }
    });

    test('audit statistics generation performs efficiently', async () => {
      // Create diverse audit data for statistics
      const statDataSize = 50;
      const eventTypes = ['admin_access', 'data_change', 'financial_event', 'data_processing'];
      const severities = ['info', 'warning', 'error'];

      console.log(`🔄 Creating ${statDataSize} diverse audit entries for statistics...`);

      for (let i = 0; i < statDataSize; i++) {
        const eventType = eventTypes[i % eventTypes.length];
        const severity = severities[i % severities.length];

        if (eventType === 'admin_access') {
          await auditService.logAdminAccess({
            requestId: generateTestId(`perf_stats_${i}`),
            adminUser: `stats_user_${i % 10}`,
            requestMethod: 'GET',
            requestUrl: `/api/admin/stats-test-${i}`,
            responseStatus: i % 10 === 0 ? 500 : 200,
            responseTimeMs: 100 + i * 2
          });
        } else if (eventType === 'data_change') {
          await auditService.logDataChange({
            requestId: generateTestId(`perf_stats_${i}`),
            action: 'STATS_TEST_ACTION',
            targetType: 'stats_test',
            targetId: `stats_item_${i}`,
            adminUser: `stats_user_${i % 10}`,
            severity
          });
        } else if (eventType === 'financial_event') {
          await auditService.logFinancialEvent({
            requestId: generateTestId(`perf_stats_${i}`),
            action: 'PAYMENT_PROCESSED',
            amountCents: 1000 + i * 10,
            transactionReference: `tx_stats_${i}`,
            paymentStatus: 'succeeded'
          });
        } else if (eventType === 'data_processing') {
          await auditService.logDataProcessing({
            requestId: generateTestId(`perf_stats_${i}`),
            action: 'DATA_COLLECTION',
            dataSubjectId: `subject_${i}`,
            dataType: 'personal_information',
            processingPurpose: 'service_provision',
            legalBasis: 'consent'
          });
        }
      }

      console.log('✅ Statistics test data created');

      // Test statistics generation performance
      const timeframes = ['1h', '24h'];

      for (const timeframe of timeframes) {
        const statsStartTime = performance.now();

        const stats = await auditService.getAuditStats(timeframe);

        const statsEndTime = performance.now();
        const statsDuration = statsEndTime - statsStartTime;

        console.log(`📊 Statistics generation (${timeframe}):`, {
          duration: statsDuration.toFixed(2) + 'ms',
          statsEntries: stats.stats.length,
          timeframe: stats.timeframe
        });

        // Statistics performance assertions
        expect(statsDuration).toBeLessThan(1000); // Should be under 1 second
        expect(stats.stats).toBeInstanceOf(Array);
        expect(stats.timeframe).toBe(timeframe);
        expect(stats.generated_at).toBeDefined();

        // Verify we have diverse statistics
        if (stats.stats.length > 0) {
          const uniqueEventTypes = [...new Set(stats.stats.map(s => s.event_type))];
          const uniqueSeverities = [...new Set(stats.stats.map(s => s.severity))];

          expect(uniqueEventTypes.length).toBeGreaterThan(1);
          expect(uniqueSeverities.length).toBeGreaterThan(1);
        }
      }
    });

    test('high-volume audit scenario performance', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping high-volume test');
        return;
      }

      // Simulate high-volume audit scenario (e.g., busy admin session)
      const highVolumeEvents = 200;
      const eventTypes = ['admin_access', 'data_change', 'security_event'];

      console.log(`🔄 Simulating high-volume scenario with ${highVolumeEvents} events...`);

      const scenarioStartTime = performance.now();

      // Create events in parallel batches to simulate real-world load
      const batchSize = 20;
      const batches = Math.ceil(highVolumeEvents / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        const batchStartTime = performance.now();
        const batchPromises = [];

        for (let i = 0; i < batchSize && (batch * batchSize + i) < highVolumeEvents; i++) {
          const eventIndex = batch * batchSize + i;
          const eventType = eventTypes[eventIndex % eventTypes.length];

          if (eventType === 'admin_access') {
            batchPromises.push(
              auditService.logAdminAccess({
                requestId: generateTestId(`perf_volume_${eventIndex}`),
                adminUser: 'high_volume_admin',
                sessionId: adminToken.substring(0, 8) + '...',
                ipAddress: `10.0.${Math.floor(eventIndex / 255)}.${eventIndex % 255}`,
                userAgent: 'HighVolumeTest/1.0',
                requestMethod: ['GET', 'POST', 'PUT'][eventIndex % 3],
                requestUrl: `/api/admin/volume-test/${eventIndex}`,
                responseStatus: eventIndex % 20 === 0 ? 500 : 200,
                responseTimeMs: 50 + (eventIndex % 100)
              })
            );
          } else if (eventType === 'data_change') {
            batchPromises.push(
              auditService.logDataChange({
                requestId: generateTestId(`perf_volume_${eventIndex}`),
                action: 'HIGH_VOLUME_OPERATION',
                targetType: 'volume_test',
                targetId: `volume_item_${eventIndex}`,
                adminUser: 'high_volume_admin',
                metadata: {
                  batchNumber: batch,
                  eventIndex,
                  highVolumeTest: true
                }
              })
            );
          } else if (eventType === 'security_event') {
            batchPromises.push(
              auditService.logDataChange({
                requestId: generateTestId(`perf_volume_${eventIndex}`),
                action: 'SECURITY_CHECK',
                targetType: 'security_monitoring',
                targetId: `security_check_${eventIndex}`,
                adminUser: 'high_volume_admin',
                severity: eventIndex % 50 === 0 ? 'warning' : 'info',
                metadata: {
                  securityCheck: true,
                  checkType: 'automated',
                  eventIndex
                }
              })
            );
          }
        }

        await Promise.all(batchPromises);

        const batchEndTime = performance.now();
        const batchDuration = batchEndTime - batchStartTime;

        if (batch % 5 === 0) { // Log every 5th batch
          console.log(`📊 Batch ${batch + 1}/${batches} completed in ${batchDuration.toFixed(2)}ms`);
        }

        // Brief pause between batches to simulate realistic timing
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const scenarioEndTime = performance.now();
      const totalDuration = scenarioEndTime - scenarioStartTime;

      console.log('📊 High-Volume Scenario Completed:', {
        totalEvents: highVolumeEvents,
        totalDuration: totalDuration.toFixed(2) + 'ms',
        avgPerEvent: (totalDuration / highVolumeEvents).toFixed(2) + 'ms',
        eventsPerSecond: (highVolumeEvents / (totalDuration / 1000)).toFixed(2)
      });

      // Performance assertions for high-volume scenario
      expect(totalDuration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(totalDuration / highVolumeEvents).toBeLessThan(150); // Average under 150ms per event

      // Verify audit system remains healthy after high-volume load
      const healthCheck = await auditService.healthCheck();
      expect(healthCheck.status).toBe('healthy');
      expect(healthCheck.database_connected).toBe(true);

      // Verify data integrity after high-volume operations
      const highVolumeQuery = await auditService.queryAuditLogs({
        adminUser: 'high_volume_admin',
        limit: 50
      });

      expect(highVolumeQuery.logs.length).toBeGreaterThan(0);
      expect(highVolumeQuery.total).toBeGreaterThan(highVolumeEvents * 0.8); // At least 80% should be found
    });
  });

  describe('Memory and Resource Usage', () => {
    test('audit service memory usage remains stable during operations', async () => {
      // Capture initial memory usage
      const initialMemory = process.memoryUsage();

      // Perform memory-intensive audit operations
      const memoryTestOperations = 100;

      for (let i = 0; i < memoryTestOperations; i++) {
        // Create audit logs with varying metadata sizes
        const largeMetadata = {
          operationIndex: i,
          largeDataSet: Array(100).fill(`data_item_${i}`),
          timestamp: new Date().toISOString(),
          memoryTest: true,
          additionalInfo: {
            nested: {
              deep: {
                data: `Large nested data for memory test ${i}`.repeat(10)
              }
            }
          }
        };

        await auditService.logDataChange({
          requestId: generateTestId(`perf_memory_${i}`),
          action: 'MEMORY_TEST_OPERATION',
          targetType: 'memory_test',
          targetId: `memory_item_${i}`,
          adminUser: 'memory_test_user',
          metadata: largeMetadata
        });

        // Periodic memory checks
        if (i % 25 === 0) {
          const currentMemory = process.memoryUsage();
          const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;

          console.log(`📊 Memory usage at operation ${i}:`, {
            heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024) + 'MB',
            heapGrowth: Math.round(memoryGrowth / 1024 / 1024) + 'MB'
          });

          // Memory should not grow excessively
          expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
        }
      }

      // Final memory check
      const finalMemory = process.memoryUsage();
      const totalMemoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log('📊 Final Memory Analysis:', {
        initialHeap: Math.round(initialMemory.heapUsed / 1024 / 1024) + 'MB',
        finalHeap: Math.round(finalMemory.heapUsed / 1024 / 1024) + 'MB',
        totalGrowth: Math.round(totalMemoryGrowth / 1024 / 1024) + 'MB',
        operations: memoryTestOperations
      });

      // Memory growth should be reasonable
      expect(totalMemoryGrowth).toBeLessThan(150 * 1024 * 1024); // Less than 150MB total growth

      // Force garbage collection if available (in test environment)
      if (global.gc) {
        global.gc();
        const postGcMemory = process.memoryUsage();
        console.log('📊 Post-GC Memory:', Math.round(postGcMemory.heapUsed / 1024 / 1024) + 'MB');
      }

      // Verify audit service is still functional after memory test
      const memoryTestHealth = await auditService.healthCheck();
      expect(memoryTestHealth.status).toBe('healthy');
    });

    test('database connection efficiency during sustained operations', async () => {
      // Test database connection reuse and efficiency
      const connectionTestOperations = 50;
      const connectionTimes = [];

      for (let i = 0; i < connectionTestOperations; i++) {
        const connectionStartTime = performance.now();

        // Force audit service to get database client
        await auditService.ensureInitialized();

        const connectionEndTime = performance.now();
        const connectionDuration = connectionEndTime - connectionStartTime;
        connectionTimes.push(connectionDuration);

        // Perform audit operation
        await auditService.logAdminAccess({
          requestId: generateTestId(`perf_connection_${i}`),
          adminUser: 'connection_test_user',
          requestMethod: 'GET',
          requestUrl: `/api/admin/connection-test/${i}`,
          responseStatus: 200,
          responseTimeMs: 75
        });
      }

      // Analyze connection performance
      const avgConnectionTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length;
      const maxConnectionTime = Math.max(...connectionTimes);

      console.log('📊 Database Connection Performance:', {
        operations: connectionTestOperations,
        avgConnectionTime: avgConnectionTime.toFixed(2) + 'ms',
        maxConnectionTime: maxConnectionTime.toFixed(2) + 'ms'
      });

      // Connection reuse should make subsequent connections very fast
      expect(avgConnectionTime).toBeLessThan(10); // Average under 10ms (connection reuse)
      expect(maxConnectionTime).toBeLessThan(100); // Max under 100ms

      // Most connections should be near-instant (reused)
      const fastConnections = connectionTimes.filter(time => time < 5).length;
      const fastConnectionRatio = fastConnections / connectionTimes.length;

      expect(fastConnectionRatio).toBeGreaterThan(0.8); // At least 80% should be fast (reused)
    });
  });
});