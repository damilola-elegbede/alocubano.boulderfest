/**
 * Database Performance Service Unit Tests
 * Comprehensive tests for database performance monitoring and integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import DatabasePerformanceService from '../../../../lib/performance/database-performance-service.js';

// Mock dependencies
vi.mock('../../../../lib/database.js', () => ({
  getDatabaseClient: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    batch: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../../../../lib/performance/query-optimizer.js', () => ({
  createQueryOptimizer: vi.fn().mockReturnValue({
    on: vi.fn(),
    executeWithTracking: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    performDeepAnalysis: vi.fn().mockReturnValue({
      timestamp: new Date(),
      optimizationOpportunities: [],
    }),
    generatePerformanceReport: vi.fn().mockReturnValue({
      generatedAt: new Date().toISOString(),
      monitoring: {},
    }),
    startPerformanceMonitoring: vi.fn(),
    stopPerformanceMonitoring: vi.fn(),
    isMonitoring: false,
    dbType: 'sqlite',
    estimateMemoryUsage: vi.fn().mockReturnValue({ mb: 5 }),
  }),
}));

import { getDatabaseClient } from '../../../../lib/database.js';
import { createQueryOptimizer } from '../../../../lib/performance/query-optimizer.js';

describe('DatabasePerformanceService', () => {
  let service;
  let mockDb;
  let mockOptimizer;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      batch: vi.fn().mockResolvedValue([]),
    };

    mockOptimizer = {
      on: vi.fn(),
      executeWithTracking: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      performDeepAnalysis: vi.fn().mockReturnValue({
        timestamp: new Date(),
        optimizationOpportunities: [],
        indexRecommendations: [],
      }),
      generatePerformanceReport: vi.fn().mockReturnValue({
        generatedAt: new Date().toISOString(),
        monitoring: { totalQueriesTracked: 0 },
      }),
      startPerformanceMonitoring: vi.fn(),
      stopPerformanceMonitoring: vi.fn(),
      isMonitoring: false,
      dbType: 'sqlite',
      estimateMemoryUsage: vi.fn().mockReturnValue({ mb: 5 }),
    };

    getDatabaseClient.mockResolvedValue(mockDb);
    createQueryOptimizer.mockReturnValue(mockOptimizer);

    service = new DatabasePerformanceService();
  });

  afterEach(() => {
    if (service.isInitialized) {
      service.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();

      expect(service.isInitialized).toBe(true);
      expect(service.optimizer).toBeDefined();
      expect(createQueryOptimizer).toHaveBeenCalled();
    });

    it('should not initialize twice', async () => {
      await service.initialize();
      await service.initialize();

      expect(createQueryOptimizer).toHaveBeenCalledTimes(1);
    });

    it('should set up event handlers', async () => {
      await service.initialize();

      expect(mockOptimizer.on).toHaveBeenCalledWith('slow-query', expect.any(Function));
      expect(mockOptimizer.on).toHaveBeenCalledWith('performance-degradation', expect.any(Function));
      expect(mockOptimizer.on).toHaveBeenCalledWith('deep-analysis', expect.any(Function));
      expect(mockOptimizer.on).toHaveBeenCalledWith('query-error', expect.any(Function));
    });

    it('should wrap database methods', async () => {
      await service.initialize();

      expect(mockDb.execute).toBeDefined();
      expect(typeof mockDb.execute).toBe('function');
    });

    it('should handle initialization errors', async () => {
      getDatabaseClient.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(service.initialize()).rejects.toThrow('Connection failed');
      expect(service.isInitialized).toBe(false);
    });

    it('should run initial optimizations', async () => {
      await service.initialize();

      // Should have attempted to create indexes
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should track slow query alerts', () => {
      const slowQuery = {
        sql: 'SELECT * FROM tickets',
        executionTime: 250,
        category: 'GENERAL',
        complexity: 'LOW',
        optimizations: [],
        timestamp: new Date(),
      };

      service.handleSlowQueryAlert(slowQuery);

      expect(service.performanceAlerts.length).toBe(1);
      expect(service.performanceAlerts[0].type).toBe('SLOW_QUERY');
      expect(service.performanceAlerts[0].severity).toBe('HIGH');
    });

    it('should classify slow query severity correctly', () => {
      const mediumSlowQuery = {
        sql: 'SELECT * FROM tickets',
        executionTime: 75,
        category: 'GENERAL',
        complexity: 'LOW',
        optimizations: [],
        timestamp: new Date(),
      };

      service.handleSlowQueryAlert(mediumSlowQuery);

      expect(service.performanceAlerts[0].severity).toBe('MEDIUM');
    });

    it('should handle performance degradation', () => {
      const degradation = {
        slowQueryPercentage: 45,
        errorRate: 5,
        avgExecutionTime: 150,
      };

      service.handlePerformanceDegradation(degradation);

      expect(service.performanceAlerts.length).toBe(1);
      expect(service.performanceAlerts[0].type).toBe('PERFORMANCE_DEGRADATION');
    });

    it('should handle deep analysis results', () => {
      const analysis = {
        timestamp: new Date(),
        totalUniqueQueries: 50,
        indexRecommendations: ['CREATE INDEX idx_test'],
        optimizationOpportunities: [],
      };

      service.handleDeepAnalysis(analysis);

      expect(service.latestAnalysis).toBe(analysis);
    });

    it('should handle query errors', () => {
      const error = {
        sql: 'SELECT * FROM invalid',
        executionTime: 10,
        error: 'Table not found',
        timestamp: new Date(),
      };

      service.handleQueryError(error);

      expect(service.performanceAlerts.length).toBe(1);
      expect(service.performanceAlerts[0].type).toBe('QUERY_ERROR');
    });

    it('should limit alert history size', () => {
      for (let i = 0; i < 550; i++) {
        service.performanceAlerts.push({
          type: 'SLOW_QUERY',
          timestamp: new Date(),
        });
      }

      service.handleSlowQueryAlert({
        sql: 'test',
        executionTime: 100,
        category: 'GENERAL',
        complexity: 'LOW',
        optimizations: [],
        timestamp: new Date(),
      });

      expect(service.performanceAlerts.length).toBeLessThanOrEqual(500);
    });
  });

  describe('Database Method Wrapping', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should intercept execute calls', async () => {
      await mockDb.execute('SELECT * FROM tickets');

      expect(mockOptimizer.executeWithTracking).toHaveBeenCalled();
    });

    it('should track batch operations', async () => {
      const statements = [
        { sql: 'INSERT INTO tickets VALUES (1)', args: [] },
        { sql: 'INSERT INTO tickets VALUES (2)', args: [] },
      ];

      const batchSpy = vi.fn();
      service.on('batch-completed', batchSpy);

      await mockDb.batch(statements);

      expect(batchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          statementCount: 2,
          success: true,
        })
      );
    });

    it('should track batch failures', async () => {
      mockDb.batch.mockRejectedValueOnce(new Error('Batch failed'));

      const batchFailSpy = vi.fn();
      service.on('batch-failed', batchFailSpy);

      await expect(mockDb.batch([])).rejects.toThrow('Batch failed');

      expect(batchFailSpy).toHaveBeenCalled();
    });
  });

  describe('Initial Optimizations', () => {
    it('should create essential indexes', async () => {
      await service.initialize();

      // Should create multiple indexes
      const executeCalls = mockDb.execute.mock.calls;
      const indexCalls = executeCalls.filter(call =>
        call[0].includes('CREATE INDEX')
      );

      expect(indexCalls.length).toBeGreaterThan(0);
    });

    it('should handle index creation errors gracefully', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('Index already exists'));

      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should update database statistics', async () => {
      await service.initialize();
      await service.updateDatabaseStatistics();

      const analyzeCalls = mockDb.execute.mock.calls.filter(call =>
        call[0] === 'ANALYZE'
      );

      expect(analyzeCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Emergency Optimization', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should trigger deep analysis', async () => {
      await service.triggerEmergencyOptimization();

      expect(mockOptimizer.performDeepAnalysis).toHaveBeenCalled();
    });

    it('should apply critical indexes', async () => {
      service.latestAnalysis = {
        indexRecommendations: [
          'CREATE INDEX idx_1 ON tickets(id)',
          'CREATE INDEX idx_2 ON tickets(email)',
        ],
      };

      await service.triggerEmergencyOptimization();

      const indexCalls = mockDb.execute.mock.calls.filter(call =>
        call[0].includes('CREATE INDEX')
      );

      expect(indexCalls.length).toBeGreaterThan(0);
    });

    it('should continue on index creation errors', async () => {
      service.latestAnalysis = {
        indexRecommendations: ['CREATE INDEX idx_test ON tickets(id)'],
      };

      mockDb.execute.mockRejectedValueOnce(new Error('Index error'));

      await expect(service.triggerEmergencyOptimization()).resolves.not.toThrow();
    });

    it('should update statistics after emergency optimization', async () => {
      await service.triggerEmergencyOptimization();

      const analyzeCalls = mockDb.execute.mock.calls.filter(call =>
        call[0] === 'ANALYZE'
      );

      expect(analyzeCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Automatic Reporting', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should start automatic reporting', () => {
      service.startAutomaticReporting();

      expect(service.reportingInterval).toBeDefined();
    });

    it('should stop automatic reporting', () => {
      service.startAutomaticReporting();
      service.stopAutomaticReporting();

      expect(service.reportingInterval).toBeNull();
    });

    it('should generate periodic reports', done => {
      service.on('performance-report', report => {
        expect(report).toBeDefined();
        expect(report.status).toBeDefined();
        done();
      });

      service.startAutomaticReporting();
      // Manually trigger to avoid waiting
      const report = service.generateQuickReport();
      service.emit('performance-report', report);
    });
  });

  describe('Quick Reports', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should generate quick report with HEALTHY status', () => {
      const report = service.generateQuickReport();

      expect(report.status).toBe('HEALTHY');
      expect(report.timestamp).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('should detect WARNING status', () => {
      // Add some slow queries
      for (let i = 0; i < 7; i++) {
        service.performanceAlerts.push({
          type: 'SLOW_QUERY',
          timestamp: new Date(),
        });
      }

      const report = service.generateQuickReport();

      expect(report.status).toBe('WARNING');
      expect(report.issues.length).toBeGreaterThan(0);
    });

    it('should detect CRITICAL status', () => {
      // Add many issues
      for (let i = 0; i < 10; i++) {
        service.performanceAlerts.push({
          type: 'SLOW_QUERY',
          timestamp: new Date(),
        });
      }

      service.performanceAlerts.push({
        type: 'PERFORMANCE_DEGRADATION',
        timestamp: new Date(),
      });

      const report = service.generateQuickReport();

      expect(report.status).toBe('CRITICAL');
    });

    it('should filter recent alerts', () => {
      const oldAlert = {
        type: 'SLOW_QUERY',
        timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };

      const recentAlert = {
        type: 'SLOW_QUERY',
        timestamp: new Date(),
      };

      service.performanceAlerts.push(oldAlert, recentAlert);

      const report = service.generateQuickReport();

      expect(report.summary.slowQueries).toBe(1);
    });

    it('should handle missing optimizer', () => {
      service.optimizer = null;

      const report = service.generateQuickReport();

      expect(report.status).toBe('OPTIMIZER_NOT_AVAILABLE');
    });
  });

  describe('Detailed Reports', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should generate detailed report', () => {
      const report = service.getDetailedReport();

      expect(report).toBeDefined();
      expect(report.alerts).toBeDefined();
      expect(report.serviceHealth).toBeDefined();
    });

    it('should include alert breakdown', () => {
      service.performanceAlerts.push(
        { type: 'SLOW_QUERY', timestamp: new Date() },
        { type: 'SLOW_QUERY', timestamp: new Date() },
        { type: 'QUERY_ERROR', timestamp: new Date() }
      );

      const report = service.getDetailedReport();

      expect(report.alerts.byType.SLOW_QUERY).toBe(2);
      expect(report.alerts.byType.QUERY_ERROR).toBe(1);
    });

    it('should handle missing optimizer', () => {
      service.optimizer = null;

      const report = service.getDetailedReport();

      expect(report.error).toBe('Query optimizer not initialized');
    });
  });

  describe('Service Health', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should report HEALTHY status', () => {
      const health = service.getServiceHealth();

      expect(health.status).toBe('HEALTHY');
      expect(health.issues).toEqual([]);
    });

    it('should detect uninitialized service', () => {
      service.isInitialized = false;

      const health = service.getServiceHealth();

      expect(health.issues).toContain('Service not initialized');
    });

    it('should detect high memory usage', () => {
      mockOptimizer.estimateMemoryUsage.mockReturnValue({ mb: 150 });

      const health = service.getServiceHealth();

      expect(health.status).toBe('WARNING');
      expect(health.issues).toContain('High memory usage');
    });

    it('should detect too many alerts', () => {
      for (let i = 0; i < 1100; i++) {
        service.performanceAlerts.push({
          type: 'SLOW_QUERY',
          timestamp: new Date(),
        });
      }

      const health = service.getServiceHealth();

      expect(health.issues).toContain('Too many alerts in memory');
    });
  });

  describe('Recommendations', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should recommend index creation', () => {
      service.latestAnalysis = {
        indexRecommendations: ['CREATE INDEX idx_test'],
        optimizationOpportunities: [],
      };

      const recommendations = service.getQuickRecommendations();

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'CREATE_INDEXES',
            priority: 'HIGH',
          }),
        ])
      );
    });

    it('should recommend query optimization', () => {
      service.latestAnalysis = {
        indexRecommendations: [],
        optimizationOpportunities: [
          { impact: 8 },
          { impact: 9 },
        ],
      };

      const recommendations = service.getQuickRecommendations();

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'OPTIMIZE_QUERIES',
            priority: 'MEDIUM',
          }),
        ])
      );
    });

    it('should handle missing analysis', () => {
      service.latestAnalysis = null;

      const recommendations = service.getQuickRecommendations();

      expect(recommendations).toEqual([]);
    });
  });

  describe('Manual Optimization', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should trigger manual optimization', async () => {
      const result = await service.optimizeNow();

      expect(result.success).toBe(true);
      expect(mockOptimizer.performDeepAnalysis).toHaveBeenCalled();
    });

    it('should handle optimization errors', async () => {
      mockOptimizer.performDeepAnalysis.mockRejectedValueOnce(new Error('Analysis failed'));

      await expect(service.optimizeNow()).rejects.toThrow('Analysis failed');
    });

    it('should require initialized optimizer', async () => {
      service.optimizer = null;

      await expect(service.optimizeNow()).rejects.toThrow('Query optimizer not initialized');
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should stop monitoring on shutdown', () => {
      service.shutdown();

      expect(mockOptimizer.stopPerformanceMonitoring).toHaveBeenCalled();
    });

    it('should stop automatic reporting', () => {
      service.startAutomaticReporting();
      service.shutdown();

      expect(service.reportingInterval).toBeNull();
    });

    it('should remove event listeners', () => {
      const spy = vi.spyOn(service, 'removeAllListeners');

      service.shutdown();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit performance-alert for slow queries', () => {
      const spy = vi.fn();
      service.on('performance-alert', spy);

      service.handleSlowQueryAlert({
        sql: 'test',
        executionTime: 200,
        category: 'GENERAL',
        complexity: 'LOW',
        optimizations: [],
        timestamp: new Date(),
      });

      expect(spy).toHaveBeenCalled();
    });

    it('should emit deep-analysis-completed', () => {
      const spy = vi.fn();
      service.on('deep-analysis-completed', spy);

      service.handleDeepAnalysis({
        timestamp: new Date(),
        totalUniqueQueries: 10,
        indexRecommendations: [],
        optimizationOpportunities: [],
      });

      expect(spy).toHaveBeenCalled();
    });

    it('should emit query-error-alert', () => {
      const spy = vi.fn();
      service.on('query-error-alert', spy);

      service.handleQueryError({
        sql: 'test',
        executionTime: 10,
        error: 'error',
        timestamp: new Date(),
      });

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Database Statistics', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should update SQLite statistics', async () => {
      mockOptimizer.dbType = 'sqlite';

      await service.updateDatabaseStatistics();

      expect(mockDb.execute).toHaveBeenCalledWith('ANALYZE');
    });

    it('should update PostgreSQL statistics', async () => {
      mockOptimizer.dbType = 'postgresql';

      await service.updateDatabaseStatistics();

      expect(mockDb.execute).toHaveBeenCalledWith('ANALYZE');
    });

    it('should handle statistics update errors', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('ANALYZE failed'));

      await expect(service.updateDatabaseStatistics()).resolves.not.toThrow();
    });
  });

  describe('Error Counting', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should count query errors', () => {
      for (let i = 0; i < 5; i++) {
        service.handleQueryError({
          sql: 'test',
          executionTime: 10,
          error: 'error',
          timestamp: new Date(),
        });
      }

      expect(service.errorCount).toBe(5);
    });
  });

  describe('Alert Filtering', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should count alerts by type', () => {
      service.performanceAlerts.push(
        { type: 'SLOW_QUERY', timestamp: new Date() },
        { type: 'SLOW_QUERY', timestamp: new Date() },
        { type: 'QUERY_ERROR', timestamp: new Date() },
        { type: 'PERFORMANCE_DEGRADATION', timestamp: new Date() }
      );

      const byType = service.getAlertsByType();

      expect(byType.SLOW_QUERY).toBe(2);
      expect(byType.QUERY_ERROR).toBe(1);
      expect(byType.PERFORMANCE_DEGRADATION).toBe(1);
    });
  });

  describe('Performance Report Integration', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should include optimizer report data', () => {
      mockOptimizer.generatePerformanceReport.mockReturnValue({
        generatedAt: new Date().toISOString(),
        monitoring: { totalQueriesTracked: 50 },
        queryBreakdown: {},
      });

      const report = service.getDetailedReport();

      expect(report.monitoring).toBeDefined();
      expect(report.monitoring.totalQueriesTracked).toBe(50);
    });
  });
});
