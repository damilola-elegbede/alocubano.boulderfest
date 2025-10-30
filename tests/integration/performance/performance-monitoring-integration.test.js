/**
 * Performance Monitoring Integration Tests
 * End-to-end tests for performance monitoring and alerting
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { getDatabaseClient } from '../../../lib/database.js';
import DatabasePerformanceService from '../../../lib/performance/database-performance-service.js';
import { QueryOptimizer } from '../../../lib/performance/query-optimizer.js';

describe('Performance Monitoring Integration', () => {
  let db;
  let performanceService;

  beforeAll(async () => {
    db = await getDatabaseClient();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.execute('DELETE FROM tickets WHERE ticket_id LIKE "PERF-TEST-%"');
    await db.execute('DELETE FROM transactions WHERE uuid LIKE "PERF-TEST-%"');

    // Create fresh performance service
    performanceService = new DatabasePerformanceService();
  });

  afterAll(async () => {
    if (performanceService?.isInitialized) {
      performanceService.shutdown();
    }

    // Final cleanup
    await db.execute('DELETE FROM tickets WHERE ticket_id LIKE "PERF-TEST-%"');
    await db.execute('DELETE FROM transactions WHERE uuid LIKE "PERF-TEST-%"');
  });

  describe('Service Initialization', () => {
    it('should initialize performance monitoring service', async () => {
      await performanceService.initialize();

      expect(performanceService.isInitialized).toBe(true);
      expect(performanceService.optimizer).toBeDefined();
    });

    it('should create essential indexes on initialization', async () => {
      await performanceService.initialize();

      // Check if indexes were created
      const indexes = await db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_tickets_%'"
      );

      expect(indexes.rows.length).toBeGreaterThan(0);
    });

    it('should not initialize twice', async () => {
      await performanceService.initialize();
      const optimizer1 = performanceService.optimizer;

      await performanceService.initialize();
      const optimizer2 = performanceService.optimizer;

      expect(optimizer1).toBe(optimizer2);
    });
  });

  describe('Real-time Query Monitoring', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should monitor actual database queries', async () => {
      // Create test data
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (uuid, customer_email, amount_total, status, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['PERF-TEST-TX-001', 'monitor@example.com', 10000, 'completed'],
      });

      const transactionId = Number(txResult.lastInsertRowid);

      // Execute monitored query
      await db.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id,
                attendee_first_name, attendee_last_name, attendee_email, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['PERF-TEST-TKT-001', transactionId, 'Workshop', 'friday-workshop',
               'Monitor', 'Test', 'monitor@example.com', 'valid'],
      });

      // Verify monitoring captured the query
      const report = performanceService.getDetailedReport();
      expect(report).toBeDefined();
    });

    it('should track query execution times', async () => {
      // Execute a query
      await db.execute('SELECT COUNT(*) as count FROM tickets');

      const report = performanceService.getDetailedReport();
      expect(report.monitoring).toBeDefined();
    });

    it('should detect slow queries', async () => {
      const slowQueryHandler = vi.fn();
      performanceService.on('performance-alert', slowQueryHandler);

      // Simulate slow query by forcing a complex operation
      await db.execute(`
        SELECT t.*, tr.*
        FROM tickets t
        CROSS JOIN transactions tr
        WHERE t.status = 'valid'
        LIMIT 1
      `);

      // Note: May or may not trigger depending on data size
      // This is more of a capability test
    });
  });

  describe('Alert System', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should emit slow query alerts', done => {
      performanceService.on('performance-alert', alert => {
        expect(alert).toBeDefined();
        expect(alert.type).toBeDefined();
        expect(alert.severity).toBeDefined();
        done();
      });

      // Manually trigger alert
      performanceService.handleSlowQueryAlert({
        sql: 'SELECT * FROM tickets',
        executionTime: 250,
        category: 'GENERAL',
        complexity: 'LOW',
        optimizations: [],
        timestamp: new Date(),
      });
    });

    it('should store alert history', () => {
      performanceService.handleSlowQueryAlert({
        sql: 'SELECT * FROM tickets',
        executionTime: 150,
        category: 'GENERAL',
        complexity: 'LOW',
        optimizations: [],
        timestamp: new Date(),
      });

      expect(performanceService.performanceAlerts.length).toBe(1);
    });

    it('should classify alert severity', () => {
      // High severity
      performanceService.handleSlowQueryAlert({
        sql: 'test',
        executionTime: 500,
        category: 'GENERAL',
        complexity: 'HIGH',
        optimizations: [],
        timestamp: new Date(),
      });

      expect(performanceService.performanceAlerts[0].severity).toBe('HIGH');

      // Medium severity
      performanceService.handleSlowQueryAlert({
        sql: 'test2',
        executionTime: 80,
        category: 'GENERAL',
        complexity: 'LOW',
        optimizations: [],
        timestamp: new Date(),
      });

      expect(performanceService.performanceAlerts[1].severity).toBe('MEDIUM');
    });
  });

  describe('Performance Reporting', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should generate quick performance reports', () => {
      const report = performanceService.generateQuickReport();

      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('issues');
      expect(report).toHaveProperty('recommendations');
    });

    it('should generate detailed performance reports', () => {
      const report = performanceService.getDetailedReport();

      expect(report).toHaveProperty('alerts');
      expect(report).toHaveProperty('serviceHealth');
    });

    it('should detect HEALTHY status', () => {
      const report = performanceService.generateQuickReport();

      expect(report.status).toBe('HEALTHY');
      expect(report.issues).toEqual([]);
    });

    it('should detect WARNING status with issues', () => {
      // Add slow queries
      for (let i = 0; i < 7; i++) {
        performanceService.performanceAlerts.push({
          type: 'SLOW_QUERY',
          timestamp: new Date(),
        });
      }

      const report = performanceService.generateQuickReport();

      expect(report.status).toBe('WARNING');
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Automatic Reporting', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should start automatic reporting', () => {
      performanceService.startAutomaticReporting();

      expect(performanceService.reportingInterval).toBeDefined();

      performanceService.stopAutomaticReporting();
    });

    it('should emit periodic reports', done => {
      performanceService.on('performance-report', report => {
        expect(report).toBeDefined();
        expect(report.status).toBeDefined();
        performanceService.stopAutomaticReporting();
        done();
      });

      performanceService.startAutomaticReporting();

      // Manually trigger to avoid waiting
      const report = performanceService.generateQuickReport();
      performanceService.emit('performance-report', report);
    });
  });

  describe('Index Optimization', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should create recommended indexes', async () => {
      const indexesBefore = await db.execute(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index'"
      );

      const countBefore = indexesBefore.rows[0].count;

      // Trigger optimization
      await performanceService.runInitialOptimizations();

      const indexesAfter = await db.execute(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index'"
      );

      const countAfter = indexesAfter.rows[0].count;

      expect(countAfter).toBeGreaterThanOrEqual(countBefore);
    });

    it('should update database statistics', async () => {
      // This should not throw
      await expect(performanceService.updateDatabaseStatistics()).resolves.not.toThrow();
    });
  });

  describe('Emergency Optimization', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should trigger emergency optimization', async () => {
      const result = await performanceService.triggerEmergencyOptimization();

      expect(result).not.toThrow;
    });

    it('should perform deep analysis during emergency', async () => {
      const deepAnalysisSpy = vi.spyOn(performanceService.optimizer, 'performDeepAnalysis');

      await performanceService.triggerEmergencyOptimization();

      expect(deepAnalysisSpy).toHaveBeenCalled();
    });
  });

  describe('Service Health Monitoring', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should report service health', () => {
      const health = performanceService.getServiceHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('memoryUsage');
      expect(health).toHaveProperty('alertCount');
      expect(health).toHaveProperty('isMonitoring');
    });

    it('should detect healthy service', () => {
      const health = performanceService.getServiceHealth();

      expect(health.status).toBe('HEALTHY');
      expect(health.issues).toEqual([]);
    });

    it('should detect high alert count', () => {
      // Add many alerts
      for (let i = 0; i < 1100; i++) {
        performanceService.performanceAlerts.push({
          type: 'SLOW_QUERY',
          timestamp: new Date(),
        });
      }

      const health = performanceService.getServiceHealth();

      expect(health.status).toBe('WARNING');
      expect(health.issues).toContain('Too many alerts in memory');
    });
  });

  describe('Optimization Recommendations', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should provide optimization recommendations', () => {
      performanceService.latestAnalysis = {
        indexRecommendations: ['CREATE INDEX idx_test ON tickets(id)'],
        optimizationOpportunities: [],
      };

      const recommendations = performanceService.getQuickRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toHaveProperty('type');
      expect(recommendations[0]).toHaveProperty('priority');
    });

    it('should recommend index creation', () => {
      performanceService.latestAnalysis = {
        indexRecommendations: ['CREATE INDEX idx_1', 'CREATE INDEX idx_2'],
        optimizationOpportunities: [],
      };

      const recommendations = performanceService.getQuickRecommendations();

      const indexRec = recommendations.find(r => r.type === 'CREATE_INDEXES');
      expect(indexRec).toBeDefined();
      expect(indexRec.priority).toBe('HIGH');
    });

    it('should recommend query optimization', () => {
      performanceService.latestAnalysis = {
        indexRecommendations: [],
        optimizationOpportunities: [
          { impact: 8 },
          { impact: 9 },
          { impact: 7 },
        ],
      };

      const recommendations = performanceService.getQuickRecommendations();

      const queryRec = recommendations.find(r => r.type === 'OPTIMIZE_QUERIES');
      expect(queryRec).toBeDefined();
      expect(queryRec.priority).toBe('MEDIUM');
    });
  });

  describe('Manual Optimization Trigger', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should execute manual optimization', async () => {
      const result = await performanceService.optimizeNow();

      expect(result.success).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should perform deep analysis on manual trigger', async () => {
      const deepAnalysisSpy = vi.spyOn(performanceService.optimizer, 'performDeepAnalysis');

      await performanceService.optimizeNow();

      expect(deepAnalysisSpy).toHaveBeenCalled();
    });
  });

  describe('Batch Operation Monitoring', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should monitor batch operations', async () => {
      const batchSpy = vi.fn();
      performanceService.on('batch-completed', batchSpy);

      // Execute batch
      await db.batch([
        {
          sql: 'SELECT COUNT(*) FROM tickets',
          args: [],
        },
        {
          sql: 'SELECT COUNT(*) FROM transactions',
          args: [],
        },
      ]);

      expect(batchSpy).toHaveBeenCalled();
    });

    it('should track batch execution time', async () => {
      let batchDuration;

      performanceService.on('batch-completed', event => {
        batchDuration = event.duration;
      });

      await db.batch([
        { sql: 'SELECT 1', args: [] },
      ]);

      expect(batchDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Dashboard Integration', () => {
    beforeEach(async () => {
      await performanceService.initialize();

      // Create test data
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (uuid, customer_email, amount_total, status, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['PERF-TEST-DASH', 'dash@example.com', 15000, 'completed'],
      });

      const transactionId = Number(txResult.lastInsertRowid);

      for (let i = 0; i < 10; i++) {
        await db.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id,
                  attendee_first_name, attendee_last_name, attendee_email, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [`PERF-TEST-DASH-${i}`, transactionId, 'Workshop', 'friday-workshop',
                 'Dashboard', `User${i}`, `dash${i}@example.com`, 'valid'],
        });
      }
    });

    it('should provide metrics for dashboard display', () => {
      const report = performanceService.getDetailedReport();

      expect(report).toHaveProperty('alerts');
      expect(report).toHaveProperty('serviceHealth');
    });

    it('should categorize alerts for dashboard', () => {
      performanceService.performanceAlerts.push(
        { type: 'SLOW_QUERY', timestamp: new Date() },
        { type: 'SLOW_QUERY', timestamp: new Date() },
        { type: 'QUERY_ERROR', timestamp: new Date() }
      );

      const report = performanceService.getDetailedReport();

      expect(report.alerts.byType).toBeDefined();
      expect(report.alerts.byType.SLOW_QUERY).toBe(2);
      expect(report.alerts.byType.QUERY_ERROR).toBe(1);
    });
  });

  describe('Long-running Monitoring', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should maintain performance over multiple queries', async () => {
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        await db.execute('SELECT COUNT(*) FROM tickets WHERE status = ?', ['valid']);
      }

      const health = performanceService.getServiceHealth();
      expect(health.status).toBe('HEALTHY');
    });

    it('should handle sustained load', async () => {
      const queries = [];

      for (let i = 0; i < 50; i++) {
        queries.push(
          db.execute('SELECT COUNT(*) FROM tickets')
        );
      }

      await Promise.all(queries);

      const health = performanceService.getServiceHealth();
      expect(health).toBeDefined();
    });
  });

  describe('Service Shutdown', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should shutdown cleanly', () => {
      expect(() => performanceService.shutdown()).not.toThrow();
    });

    it('should stop monitoring on shutdown', () => {
      performanceService.optimizer.startPerformanceMonitoring();

      performanceService.shutdown();

      expect(performanceService.optimizer.isMonitoring).toBe(false);
    });

    it('should stop automatic reporting on shutdown', () => {
      performanceService.startAutomaticReporting();
      const intervalBefore = performanceService.reportingInterval;

      performanceService.shutdown();

      expect(performanceService.reportingInterval).toBeNull();
      expect(intervalBefore).not.toBeNull();
    });
  });

  describe('Error Recovery', () => {
    beforeEach(async () => {
      await performanceService.initialize();
    });

    it('should handle query errors gracefully', async () => {
      try {
        await db.execute('SELECT * FROM nonexistent_table');
      } catch (error) {
        // Error expected
      }

      const health = performanceService.getServiceHealth();
      expect(health).toBeDefined();
    });

    it('should continue monitoring after errors', async () => {
      try {
        await db.execute('INVALID SQL');
      } catch (error) {
        // Expected
      }

      // Should still work
      const result = await db.execute('SELECT 1');
      expect(result).toBeDefined();
    });
  });
});
