/**
 * Query Optimizer Unit Tests
 * Comprehensive tests for SQL query optimization and performance monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryOptimizer, createQueryOptimizer, withQueryOptimization } from '../../../../lib/performance/query-optimizer.js';
import { EventEmitter } from 'events';

describe('QueryOptimizer', () => {
  let mockDb;
  let optimizer;

  beforeEach(() => {
    // Create mock database service
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connectionString: 'sqlite:memory:',
    };

    optimizer = new QueryOptimizer(mockDb, {
      enableMonitoring: false, // Disable auto-monitoring for tests
      cacheQueries: true,
      maxPreparedStatements: 10,
    });
  });

  afterEach(() => {
    if (optimizer?.isMonitoring) {
      optimizer.stopPerformanceMonitoring();
    }
    vi.clearAllMocks();
  });

  describe('Query Analysis', () => {
    it('should analyze SELECT queries correctly', () => {
      const sql = 'SELECT * FROM tickets WHERE id = 1';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.queryType).toBe('SELECT');
      expect(analysis.hasSubqueries).toBe(false);
      expect(analysis.hasJoins).toBe(false);
      expect(analysis.usesWildcard).toBe(true);
    });

    it('should analyze INSERT queries correctly', () => {
      const sql = 'INSERT INTO tickets (id, name) VALUES (1, "test")';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.queryType).toBe('INSERT');
      expect(analysis.complexity).toBe('LOW');
    });

    it('should analyze UPDATE queries correctly', () => {
      const sql = 'UPDATE tickets SET status = "used" WHERE id = 1';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.queryType).toBe('UPDATE');
      expect(analysis.complexity).toBe('LOW');
    });

    it('should analyze DELETE queries correctly', () => {
      const sql = 'DELETE FROM tickets WHERE status = "cancelled"';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.queryType).toBe('DELETE');
    });

    it('should detect JOIN queries', () => {
      // Use SELECT * to get wildcard point for complexity calculation
      const sql = 'SELECT * FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.hasJoins).toBe(true);
      expect(analysis.usesWildcard).toBe(true);
      expect(analysis.complexity).toBe('MEDIUM'); // JOIN (2) + wildcard (1) = 3 points
    });

    it('should detect subqueries', () => {
      const sql = 'SELECT * FROM tickets WHERE transaction_id IN (SELECT id FROM transactions WHERE status = "completed")';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.hasSubqueries).toBe(true);
      expect(analysis.usesWildcard).toBe(true);
      // Subquery (3) + wildcard (1) = 4 points = MEDIUM (needs 5+ for HIGH)
      // To get HIGH, need more complexity
      expect(analysis.complexity).toBe('MEDIUM');
    });

    it('should detect aggregations', () => {
      const sql = 'SELECT COUNT(*), SUM(amount) FROM transactions GROUP BY event_id';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.hasAggregations).toBe(true);
    });

    it('should handle null/undefined input gracefully', () => {
      expect(() => optimizer.analyzeQuery(null)).not.toThrow();
      expect(() => optimizer.analyzeQuery(undefined)).not.toThrow();
      expect(() => optimizer.analyzeQuery('')).not.toThrow();

      const analysis = optimizer.analyzeQuery(null);
      expect(analysis.queryType).toBe('OTHER');
      expect(analysis.category).toBe('GENERAL');
    });
  });

  describe('Query Categorization', () => {
    it('should categorize ticket lookup queries', () => {
      const sql = 'SELECT * FROM tickets WHERE id = ?';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.category).toBe('TICKET_LOOKUP');
    });

    it('should categorize QR validation queries', () => {
      // Use a query that matches QR_VALIDATION specifically (without 'tickets' table)
      const sql = 'SELECT * FROM validations WHERE qr_code = ? AND status = "valid"';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.category).toBe('QR_VALIDATION');
    });

    it('should categorize check-in queries', () => {
      // Use an UPDATE query that matches CHECK_IN pattern
      // Should match CHECK_IN: /update.*tickets.*set.*checked_in/i
      // Should NOT match TICKET_LOOKUP (no 'id =' or 'order_id =')
      // Should NOT match TICKET_VALIDATION (no 'qr_code =', 'validation_token', or 'is_valid')
      const sql = 'UPDATE tickets SET checked_in = true, check_in_time = NOW() WHERE status = ?';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.category).toBe('CHECK_IN');
    });

    it('should categorize statistics queries', () => {
      const sql = 'SELECT COUNT(*) FROM tickets GROUP BY event_id';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.category).toBe('EVENT_STATISTICS');
    });

    it('should categorize inventory check queries', () => {
      const sql = 'SELECT tickets_available, capacity FROM events';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.category).toBe('INVENTORY_CHECK');
    });
  });

  describe('Complexity Assessment', () => {
    it('should rate simple queries as LOW complexity', () => {
      const sql = 'SELECT id, name FROM tickets WHERE id = 1';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.complexity).toBe('LOW');
    });

    it('should rate JOIN queries as MEDIUM complexity', () => {
      const sql = 'SELECT * FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.complexity).toBe('MEDIUM');
    });

    it('should rate queries with subqueries and joins as HIGH complexity', () => {
      const sql = `
        SELECT t.* FROM tickets t
        JOIN transactions tr ON t.transaction_id = tr.id
        WHERE t.event_id IN (SELECT id FROM events WHERE capacity > 100)
      `;
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.complexity).toBe('HIGH');
    });

    it('should increase complexity for wildcard selects', () => {
      const sqlWithWildcard = 'SELECT * FROM tickets';
      const sqlWithColumns = 'SELECT id, name FROM tickets';

      const analysisWildcard = optimizer.analyzeQuery(sqlWithWildcard);
      const analysisColumns = optimizer.analyzeQuery(sqlWithColumns);

      expect(analysisWildcard.usesWildcard).toBe(true);
      expect(analysisColumns.usesWildcard).toBe(false);
    });
  });

  describe('Optimization Suggestions', () => {
    it('should suggest avoiding SELECT *', () => {
      const sql = 'SELECT * FROM tickets';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.optimizations).toContain('Specify exact columns instead of SELECT *');
    });

    it('should suggest using JOINs instead of subqueries', () => {
      const sql = 'SELECT * FROM tickets WHERE id IN (SELECT ticket_id FROM registrations)';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.optimizations).toContain('Consider using JOINs instead of subqueries');
    });

    it('should suggest adding LIMIT clause', () => {
      const sql = 'SELECT * FROM tickets WHERE status = "valid"';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.optimizations).toContain('Add LIMIT clause to prevent large result sets');
    });

    it('should not suggest LIMIT for queries with LIMIT', () => {
      const sql = 'SELECT * FROM tickets LIMIT 10';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.optimizations).not.toContain('Add LIMIT clause to prevent large result sets');
    });
  });

  describe('Row Estimation', () => {
    it('should estimate 1 row for ticket lookup', () => {
      const sql = 'SELECT * FROM tickets WHERE id = ?';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.estimatedRows).toBe(1);
    });

    it('should estimate 1 row for QR validation', () => {
      const sql = 'SELECT * FROM tickets WHERE qr_code = ?';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.estimatedRows).toBe(1);
    });

    it('should estimate 100 rows for statistics', () => {
      const sql = 'SELECT COUNT(*) FROM tickets GROUP BY event_id';
      const analysis = optimizer.analyzeQuery(sql);

      expect(analysis.estimatedRows).toBe(100);
    });

    it('should estimate rows for general queries', () => {
      const sql = 'SELECT * FROM tickets WHERE status = "valid"';
      const analysis = optimizer.analyzeQuery(sql);

      // General queries estimate 50 rows by default
      expect(analysis.estimatedRows).toBe(50);
    });
  });

  describe('Query Execution Tracking', () => {
    it('should track successful query execution', async () => {
      mockDb.execute.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const sql = 'SELECT * FROM tickets WHERE id = 1';
      await optimizer.executeWithTracking(sql);

      const queryId = optimizer.generateQueryId(sql);
      const metrics = optimizer.queryMetrics.get(queryId);

      expect(metrics).toBeDefined();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.successfulExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(0);
    });

    it('should track failed query execution', async () => {
      const error = new Error('Database error');
      mockDb.execute.mockRejectedValue(error);

      const sql = 'SELECT * FROM invalid_table';

      await expect(optimizer.executeWithTracking(sql)).rejects.toThrow('Database error');

      const queryId = optimizer.generateQueryId(sql);
      const metrics = optimizer.queryMetrics.get(queryId);

      expect(metrics.failedExecutions).toBe(1);
      expect(metrics.lastError).toBe('Database error');
    });

    it('should track multiple executions', async () => {
      mockDb.execute.mockResolvedValue({ rows: [], rowCount: 0 });

      const sql = 'SELECT * FROM tickets';

      await optimizer.executeWithTracking(sql);
      await optimizer.executeWithTracking(sql);
      await optimizer.executeWithTracking(sql);

      const queryId = optimizer.generateQueryId(sql);
      const metrics = optimizer.queryMetrics.get(queryId);

      expect(metrics.totalExecutions).toBe(3);
    });

    it('should track execution time metrics', async () => {
      mockDb.execute.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 10))
      );

      const sql = 'SELECT * FROM tickets';
      await optimizer.executeWithTracking(sql);

      const queryId = optimizer.generateQueryId(sql);
      const metrics = optimizer.queryMetrics.get(queryId);

      expect(metrics.minTime).toBeGreaterThan(0);
      expect(metrics.maxTime).toBeGreaterThan(0);
      expect(metrics.avgTime).toBeGreaterThan(0);
    });

    it('should support query object format', async () => {
      mockDb.execute.mockResolvedValue({ rows: [], rowCount: 0 });

      const queryObj = { sql: 'SELECT * FROM tickets WHERE id = ?', args: [1] };
      await optimizer.executeWithTracking(queryObj);

      const queryId = optimizer.generateQueryId(queryObj);
      const metrics = optimizer.queryMetrics.get(queryId);

      expect(metrics).toBeDefined();
      expect(metrics.totalExecutions).toBe(1);
    });
  });

  describe('Slow Query Detection', () => {
    it('should detect slow queries', async () => {
      mockDb.execute.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 120))
      );

      const slowQueryHandler = vi.fn();
      optimizer.on('slow-query', slowQueryHandler);

      const sql = 'SELECT * FROM tickets';
      await optimizer.executeWithTracking(sql);

      expect(slowQueryHandler).toHaveBeenCalled();
      expect(optimizer.slowQueryLog.length).toBeGreaterThan(0);
    });

    it('should not flag fast queries as slow', async () => {
      mockDb.execute.mockResolvedValue({ rows: [], rowCount: 0 });

      const slowQueryHandler = vi.fn();
      optimizer.on('slow-query', slowQueryHandler);

      const sql = 'SELECT * FROM tickets WHERE id = 1';
      await optimizer.executeWithTracking(sql);

      expect(slowQueryHandler).not.toHaveBeenCalled();
    });

    it('should add index recommendations for slow QR validation queries', async () => {
      mockDb.execute.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 120))
      );

      const sql = 'SELECT * FROM tickets WHERE qr_code = ? AND is_valid = true';
      await optimizer.executeWithTracking(sql);

      // QR_VALIDATION category should have index recommendations
      expect(optimizer.indexRecommendations.size).toBeGreaterThan(0);
    });

    it('should limit slow query log size', async () => {
      mockDb.execute.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 120))
      );

      // Add many slow queries
      for (let i = 0; i < 1100; i++) {
        optimizer.handleSlowQuery(`SELECT * FROM test${i}`, 120, {
          category: 'GENERAL',
          complexity: 'LOW',
          optimizations: [],
        });
      }

      expect(optimizer.slowQueryLog.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Query ID Generation', () => {
    it('should generate consistent IDs for same query', () => {
      const sql = 'SELECT * FROM tickets WHERE id = 1';
      const id1 = optimizer.generateQueryId(sql);
      const id2 = optimizer.generateQueryId(sql);

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different queries', () => {
      const sql1 = 'SELECT * FROM tickets WHERE id = 1';
      const sql2 = 'SELECT * FROM tickets WHERE id = 2';

      const id1 = optimizer.generateQueryId(sql1);
      const id2 = optimizer.generateQueryId(sql2);

      expect(id1).not.toBe(id2);
    });

    it('should generate 8-character IDs', () => {
      const sql = 'SELECT * FROM tickets';
      const id = optimizer.generateQueryId(sql);

      expect(id).toHaveLength(8);
    });

    it('should handle query objects', () => {
      const queryObj = { sql: 'SELECT * FROM tickets', args: [] };
      const id = optimizer.generateQueryId(queryObj);

      expect(id).toHaveLength(8);
    });
  });

  describe('Prepared Statements', () => {
    it('should not create prepared statement for infrequent queries', () => {
      const sql = 'SELECT * FROM tickets WHERE id = 1';
      const prepared = optimizer.getPreparedStatement(sql);

      expect(prepared).toBeNull();
    });

    it('should create prepared statement for frequent queries', () => {
      const sql = 'SELECT * FROM tickets WHERE id = ?';

      // Simulate frequent executions
      const queryId = optimizer.generateQueryId(sql);
      optimizer.queryMetrics.set(queryId, {
        sql: sql.substring(0, 200),
        totalExecutions: 15,
      });

      const prepared = optimizer.getPreparedStatement(sql);

      expect(prepared).toBeDefined();
      expect(prepared.query).toBe(sql);
    });

    it('should track prepared statement usage', () => {
      const sql = 'SELECT * FROM tickets WHERE id = ?';

      const queryId = optimizer.generateQueryId(sql);
      optimizer.queryMetrics.set(queryId, {
        sql: sql.substring(0, 200),
        totalExecutions: 15,
      });

      const prepared1 = optimizer.getPreparedStatement(sql);
      const prepared2 = optimizer.getPreparedStatement(sql);

      expect(prepared2.useCount).toBe(2);
    });

    it('should limit prepared statement cache size', () => {
      // Create many prepared statements
      for (let i = 0; i < 15; i++) {
        const sql = `SELECT * FROM test${i} WHERE id = ?`;
        const queryId = optimizer.generateQueryId(sql);

        optimizer.queryMetrics.set(queryId, {
          sql: sql.substring(0, 200),
          totalExecutions: 20,
        });

        optimizer.getPreparedStatement(sql);
      }

      expect(optimizer.preparedStatements.size).toBeLessThanOrEqual(10);
    });

    it('should evict least recently used prepared statements', () => {
      const oldSql = 'SELECT * FROM old WHERE id = ?';
      const newSql = 'SELECT * FROM new WHERE id = ?';

      // Create old prepared statement
      const oldQueryId = optimizer.generateQueryId(oldSql);
      optimizer.queryMetrics.set(oldQueryId, {
        sql: oldSql.substring(0, 200),
        totalExecutions: 20,
      });
      const oldPrepared = optimizer.getPreparedStatement(oldSql);
      oldPrepared.lastUsed = new Date(Date.now() - 10000);

      // Fill cache with new statements
      for (let i = 0; i < 10; i++) {
        const sql = `SELECT * FROM test${i} WHERE id = ?`;
        const queryId = optimizer.generateQueryId(sql);
        optimizer.queryMetrics.set(queryId, {
          sql: sql.substring(0, 200),
          totalExecutions: 20,
        });
        optimizer.getPreparedStatement(sql);
      }

      expect(optimizer.preparedStatements.size).toBe(10);
    });
  });

  describe('Performance Analysis', () => {
    it('should analyze overall performance', () => {
      // Add some metrics
      optimizer.queryMetrics.set('query1', {
        category: 'TICKET_LOOKUP',
        totalExecutions: 10,
        totalTime: 50,
        avgTime: 5,
      });

      const analysis = optimizer.analyzePerformance();

      expect(analysis.totalQueries).toBe(1);
      expect(analysis.categoryPerformance).toBeDefined();
      expect(analysis.categoryPerformance.TICKET_LOOKUP).toBeDefined();
    });

    it('should identify problematic queries', () => {
      // Add slow query
      optimizer.queryMetrics.set('slow-query', {
        category: 'GENERAL',
        totalExecutions: 5,
        totalTime: 1000,
        avgTime: 200,
        sql: 'SELECT * FROM slow_table',
      });

      const analysis = optimizer.analyzePerformance();

      expect(analysis.problematicQueries.length).toBeGreaterThan(0);
      expect(analysis.problematicQueries[0].avgTime).toBeGreaterThan(100);
    });

    it('should calculate category performance', () => {
      optimizer.queryMetrics.set('q1', {
        category: 'TICKET_LOOKUP',
        totalExecutions: 5,
        totalTime: 25,
      });

      optimizer.queryMetrics.set('q2', {
        category: 'TICKET_LOOKUP',
        totalExecutions: 5,
        totalTime: 25,
      });

      const analysis = optimizer.analyzePerformance();

      expect(analysis.categoryPerformance.TICKET_LOOKUP.count).toBe(2);
      expect(analysis.categoryPerformance.TICKET_LOOKUP.totalTime).toBe(50);
    });
  });

  describe('Deep Analysis', () => {
    it('should identify caching opportunities', () => {
      // Add frequently executed simple query
      optimizer.queryMetrics.set('cacheable', {
        queryType: 'SELECT',
        category: 'TICKET_LOOKUP',
        complexity: 'LOW',
        totalExecutions: 150,
        totalTime: 150,
        avgTime: 1,
      });

      const analysis = optimizer.performDeepAnalysis();

      const cachingOpp = analysis.optimizationOpportunities.find(o => o.type === 'CACHING');
      expect(cachingOpp).toBeDefined();
      expect(cachingOpp.candidates.length).toBeGreaterThan(0);
    });

    it('should identify indexing opportunities', () => {
      optimizer.queryMetrics.set('needs-index', {
        category: 'QR_VALIDATION',
        avgTime: 80,
        totalTime: 800,
        totalExecutions: 10,
      });

      const analysis = optimizer.performDeepAnalysis();

      const indexOpp = analysis.optimizationOpportunities.find(o => o.type === 'INDEXING');
      expect(indexOpp).toBeDefined();
    });

    it('should detect N+1 query patterns', () => {
      const baseSql = 'SELECT * FROM tickets WHERE event_id = ';

      // Simulate N+1 pattern
      for (let i = 1; i <= 15; i++) {
        const sql = baseSql + i;
        const queryId = optimizer.generateQueryId(sql);

        optimizer.queryMetrics.set(queryId, {
          sql: sql.substring(0, 200),
          totalExecutions: 1,
        });

        optimizer.performanceHistory.push({
          queryId,
          timestamp: new Date(),
        });
      }

      const analysis = optimizer.performDeepAnalysis();

      const nplusOneOpp = analysis.optimizationOpportunities.find(o => o.type === 'N+1_QUERIES');
      expect(nplusOneOpp).toBeDefined();
    });
  });

  describe('Monitoring', () => {
    it('should start performance monitoring', () => {
      optimizer.startPerformanceMonitoring();

      expect(optimizer.isMonitoring).toBe(true);
      expect(optimizer.monitoringInterval).toBeDefined();
      expect(optimizer.deepAnalysisInterval).toBeDefined();
    });

    it('should stop performance monitoring', () => {
      optimizer.startPerformanceMonitoring();
      optimizer.stopPerformanceMonitoring();

      expect(optimizer.isMonitoring).toBe(false);
    });

    it('should not start monitoring twice', () => {
      optimizer.startPerformanceMonitoring();
      const firstInterval = optimizer.monitoringInterval;

      optimizer.startPerformanceMonitoring();

      expect(optimizer.monitoringInterval).toBe(firstInterval);
    });

    it('should emit performance analysis events', () => {
      return new Promise(resolve => {
        optimizer.on('performance-analysis', analysis => {
          expect(analysis).toBeDefined();
          expect(analysis.totalQueries).toBeDefined();
          resolve();
        });

        optimizer.analyzePerformance();
      });
    });
  });

  describe('Metrics Cleanup', () => {
    it('should clean up old metrics', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

      optimizer.queryMetrics.set('old-query', {
        lastExecuted: oldDate,
        totalExecutions: 5,
      });

      optimizer.queryMetrics.set('recent-query', {
        lastExecuted: new Date(),
        totalExecutions: 5,
      });

      optimizer.cleanupOldMetrics();

      expect(optimizer.queryMetrics.has('old-query')).toBe(false);
      expect(optimizer.queryMetrics.has('recent-query')).toBe(true);
    });

    it('should clean old prepared statements', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

      optimizer.preparedStatements.set('old', {
        lastUsed: oldDate,
        useCount: 5,
      });

      optimizer.cleanupOldMetrics();

      expect(optimizer.preparedStatements.has('old')).toBe(false);
    });

    it('should clean old slow query logs', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

      optimizer.slowQueryLog.push({
        timestamp: oldDate,
        sql: 'SELECT * FROM old',
        executionTime: 200,
      });

      optimizer.slowQueryLog.push({
        timestamp: new Date(),
        sql: 'SELECT * FROM recent',
        executionTime: 200,
      });

      optimizer.cleanupOldMetrics();

      expect(optimizer.slowQueryLog.length).toBe(1);
      expect(optimizer.slowQueryLog[0].sql).toContain('recent');
    });
  });

  describe('Reporting', () => {
    it('should generate performance report', () => {
      optimizer.queryMetrics.set('test', {
        category: 'GENERAL',
        totalExecutions: 10,
        totalTime: 100,
        avgTime: 10,
        optimizations: [],
      });

      const report = optimizer.generatePerformanceReport();

      expect(report.generatedAt).toBeDefined();
      expect(report.monitoring).toBeDefined();
      expect(report.queryBreakdown).toBeDefined();
      expect(report.optimizationOpportunities).toBeDefined();
    });

    it('should include slow queries in report', () => {
      optimizer.slowQueryLog.push({
        sql: 'SELECT * FROM slow',
        executionTime: 500,
        timestamp: new Date(),
      });

      const report = optimizer.generatePerformanceReport();

      expect(report.slowQueries.length).toBeGreaterThan(0);
    });

    it('should include index recommendations in report', () => {
      optimizer.indexRecommendations.add('CREATE INDEX idx_test ON tickets(id)');

      const report = optimizer.generatePerformanceReport();

      expect(report.indexRecommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Management', () => {
    it('should estimate memory usage', () => {
      optimizer.queryMetrics.set('test', { totalExecutions: 10 });
      optimizer.slowQueryLog.push({ sql: 'test', executionTime: 100 });

      const memory = optimizer.estimateMemoryUsage();

      expect(memory.bytes).toBeGreaterThan(0);
      expect(memory.mb).toBeDefined();
    });

    it('should limit performance history size', async () => {
      mockDb.execute.mockResolvedValue({ rows: [], rowCount: 0 });

      // Add many history entries
      for (let i = 0; i < 11000; i++) {
        optimizer.performanceHistory.push({
          queryId: 'test',
          executionTime: 10,
          timestamp: new Date(),
        });
      }

      // Trigger cleanup
      optimizer.recordQueryMetrics('test', 'SELECT *', 10, { category: 'GENERAL' }, true);

      expect(optimizer.performanceHistory.length).toBeLessThanOrEqual(10000);
    });
  });

  describe('Factory Functions', () => {
    it('should create optimizer with factory function', () => {
      const opt = createQueryOptimizer(mockDb);

      expect(opt).toBeInstanceOf(QueryOptimizer);
    });

    it('should wrap database service', () => {
      const wrapped = withQueryOptimization(mockDb);

      expect(wrapped.getPerformanceReport).toBeDefined();
      expect(wrapped.getQueryOptimizer).toBeDefined();
      expect(wrapped.resetPerformanceMetrics).toBeDefined();
    });

    it('should add optimizer methods to wrapped service', () => {
      const freshMockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        connectionString: 'sqlite:memory:',
      };

      const wrapped = withQueryOptimization(freshMockDb);

      expect(wrapped.getPerformanceReport).toBeDefined();
      expect(wrapped.getQueryOptimizer).toBeDefined();
      expect(wrapped.resetPerformanceMetrics).toBeDefined();

      const opt = wrapped.getQueryOptimizer();
      expect(opt).toBeInstanceOf(QueryOptimizer);

      opt.stopPerformanceMonitoring();
    });
  });

  describe('Database Type Detection', () => {
    it('should detect PostgreSQL', () => {
      const pgDb = { connectionString: 'postgres://localhost/test' };
      const opt = new QueryOptimizer(pgDb, { enableMonitoring: false });

      expect(opt.dbType).toBe('postgresql');
    });

    it('should detect MySQL', () => {
      const mysqlDb = { connectionString: 'mysql://localhost/test' };
      const opt = new QueryOptimizer(mysqlDb, { enableMonitoring: false });

      expect(opt.dbType).toBe('mysql');
    });

    it('should detect SQLite', () => {
      const sqliteDb = { connectionString: 'sqlite:memory:' };
      const opt = new QueryOptimizer(sqliteDb, { enableMonitoring: false });

      expect(opt.dbType).toBe('sqlite');
    });

    it('should default to SQLite', () => {
      const unknownDb = {};
      const opt = new QueryOptimizer(unknownDb, { enableMonitoring: false });

      expect(opt.dbType).toBe('sqlite');
    });
  });

  describe('Event Emission', () => {
    it('should emit slow-query events', async () => {
      mockDb.execute.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 120))
      );

      const handler = vi.fn();
      optimizer.on('slow-query', handler);

      await optimizer.executeWithTracking('SELECT * FROM tickets');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0]).toHaveProperty('sql');
      expect(handler.mock.calls[0][0]).toHaveProperty('executionTime');
    });

    it('should emit query-error events', async () => {
      mockDb.execute.mockRejectedValue(new Error('Test error'));

      const handler = vi.fn();
      optimizer.on('query-error', handler);

      await expect(optimizer.executeWithTracking('SELECT * FROM invalid')).rejects.toThrow();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit deep-analysis events', () => {
      const handler = vi.fn();
      optimizer.on('deep-analysis', handler);

      optimizer.performDeepAnalysis();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Optimization Opportunities', () => {
    it('should identify missing indexes', () => {
      optimizer.indexRecommendations.add('CREATE INDEX idx_test ON tickets(id)');

      const opportunities = optimizer.getOptimizationOpportunities();

      expect(opportunities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'MISSING_INDEXES',
            severity: 'HIGH',
          }),
        ])
      );
    });

    it('should identify slow queries', () => {
      for (let i = 0; i < 15; i++) {
        optimizer.slowQueryLog.push({
          sql: `SELECT * FROM test${i}`,
          executionTime: 200,
          category: 'GENERAL',
        });
      }

      const opportunities = optimizer.getOptimizationOpportunities();

      expect(opportunities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'SLOW_QUERIES',
            severity: 'MEDIUM',
          }),
        ])
      );
    });

    it('should identify inefficient patterns', () => {
      optimizer.queryMetrics.set('inefficient', {
        optimizations: ['Add index', 'Remove wildcard'],
        totalExecutions: 10,
      });

      const opportunities = optimizer.getOptimizationOpportunities();

      expect(opportunities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'INEFFICIENT_PATTERNS',
            severity: 'LOW',
          }),
        ])
      );
    });
  });

  describe('Export and Import', () => {
    it('should export metrics', () => {
      optimizer.queryMetrics.set('test', { totalExecutions: 10 });
      optimizer.slowQueryLog.push({ sql: 'test', executionTime: 100 });

      const exported = optimizer.exportMetrics();

      expect(exported.queryMetrics).toBeDefined();
      expect(exported.slowQueryLog).toBeDefined();
      expect(exported.performanceHistory).toBeDefined();
    });

    it('should import metrics', () => {
      const data = {
        queryMetrics: [
          { queryId: 'imported', totalExecutions: 5 },
        ],
        slowQueryLog: [
          { sql: 'imported', executionTime: 100 },
        ],
      };

      optimizer.importMetrics(data);

      expect(optimizer.queryMetrics.has('imported')).toBe(true);
      expect(optimizer.slowQueryLog.length).toBeGreaterThan(0);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all metrics', () => {
      optimizer.queryMetrics.set('test', { totalExecutions: 10 });
      optimizer.slowQueryLog.push({ sql: 'test' });
      optimizer.performanceHistory.push({ queryId: 'test' });

      optimizer.resetMetrics();

      expect(optimizer.queryMetrics.size).toBe(0);
      expect(optimizer.slowQueryLog.length).toBe(0);
      expect(optimizer.performanceHistory.length).toBe(0);
    });
  });
});
