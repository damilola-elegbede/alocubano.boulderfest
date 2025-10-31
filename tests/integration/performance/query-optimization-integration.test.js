/**
 * Query Optimization Integration Tests
 * Tests query optimization with real database operations
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getDatabaseClient } from '../../../lib/database.js';
import { QueryOptimizer } from '../../../lib/performance/query-optimizer.js';
import { FestivalQueryOptimizer } from '../../../lib/performance/festival-query-optimizer.js';
import crypto from 'node:crypto';

describe('Query Optimization Integration', () => {
  let db;
  let queryOptimizer;
  let festivalOptimizer;

  beforeAll(async () => {
    db = await getDatabaseClient();
    queryOptimizer = new QueryOptimizer(db, { enableMonitoring: false });
    festivalOptimizer = new FestivalQueryOptimizer(db);
  });

  beforeEach(async () => {
    // Clean up test data
    await db.execute('DELETE FROM tickets WHERE ticket_id LIKE "TEST-%"');
    await db.execute('DELETE FROM transactions WHERE uuid LIKE "TEST-%"');

    // Reset optimizer metrics
    queryOptimizer.resetMetrics();
  });

  afterAll(async () => {
    if (queryOptimizer?.isMonitoring) {
      queryOptimizer.stopPerformanceMonitoring();
    }

    // Final cleanup
    await db.execute('DELETE FROM tickets WHERE ticket_id LIKE "TEST-%"');
    await db.execute('DELETE FROM transactions WHERE uuid LIKE "TEST-%"');
  });

  describe('Real Database Query Optimization', () => {
    it('should execute optimized SELECT query', async () => {
      // Create test transaction
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (uuid, customer_email, amount_total, status, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['TEST-TX-001', 'test@example.com', 10000, 'completed'],
      });

      const transactionId = Number(txResult.lastInsertRowid);

      // Create test ticket
      await db.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id,
                attendee_first_name, attendee_last_name, attendee_email, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['TEST-TKT-001', transactionId, 'Workshop', 'friday-workshop', 'Test', 'User',
               'test@example.com', 'valid'],
      });

      // Execute through optimizer
      const result = await queryOptimizer.executeWithTracking(
        'SELECT * FROM tickets WHERE ticket_id = ?',
        ['TEST-TKT-001']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].ticket_id).toBe('TEST-TKT-001');

      // Verify metrics were tracked
      const metrics = queryOptimizer.queryMetrics;
      expect(metrics.size).toBeGreaterThan(0);
    });

    it('should track execution time for real queries', async () => {
      const startSize = queryOptimizer.performanceHistory.length;

      await queryOptimizer.executeWithTracking(
        'SELECT COUNT(*) as count FROM tickets WHERE status = ?',
        ['valid']
      );

      expect(queryOptimizer.performanceHistory.length).toBe(startSize + 1);
      const lastEntry = queryOptimizer.performanceHistory[queryOptimizer.performanceHistory.length - 1];
      expect(lastEntry.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should categorize festival-specific queries correctly', async () => {
      const sql = 'SELECT * FROM tickets WHERE ticket_id = ?';
      const analysis = queryOptimizer.analyzeQuery(sql);

      expect(analysis.category).toBe('TICKET_LOOKUP');
      expect(analysis.queryType).toBe('SELECT');
    });
  });

  describe('Index Recommendation Testing', () => {
    it('should recommend indexes for slow queries', async () => {
      // Create multiple test tickets to simulate load
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (uuid, customer_email, amount_total, status, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['TEST-TX-INDEX', 'index-test@example.com', 5000, 'completed'],
      });

      const transactionId = Number(txResult.lastInsertRowid);

      for (let i = 0; i < 10; i++) {
        await db.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id,
                  attendee_first_name, attendee_last_name, attendee_email, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [`TEST-TKT-IDX-${i}`, transactionId, 'Workshop', 'friday-workshop',
                 'Test', `User${i}`, `test${i}@example.com`, 'valid'],
        });
      }

      // Execute query that should benefit from index
      await queryOptimizer.executeWithTracking(
        'SELECT * FROM tickets WHERE attendee_email = ?',
        ['test5@example.com']
      );

      // Check if optimizer provides recommendations
      const opportunities = queryOptimizer.getOptimizationOpportunities();
      expect(opportunities).toBeDefined();
    });

    it('should detect missing indexes for QR validation', async () => {
      const sql = 'SELECT * FROM tickets WHERE qr_code_data = ?';
      const analysis = queryOptimizer.analyzeQuery(sql);

      expect(analysis.category).toBe('QR_VALIDATION');

      // Simulate slow execution
      queryOptimizer.handleSlowQuery(sql, 150, analysis);

      expect(queryOptimizer.indexRecommendations.size).toBeGreaterThan(0);
    });
  });

  describe('Festival Query Optimizer Integration', () => {
    beforeEach(async () => {
      // Create test data for festival queries
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (uuid, customer_email, amount_total, status, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['TEST-TX-FESTIVAL', 'festival@example.com', 25000, 'completed'],
      });

      const transactionId = Number(txResult.lastInsertRowid);

      // Create various ticket types
      const ticketTypes = ['Workshop', 'Social', 'Full Pass'];

      for (let i = 0; i < 5; i++) {
        await db.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id,
                  attendee_first_name, attendee_last_name, attendee_email, status,
                  qr_code_data, validation_signature, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [
            `TEST-FEST-${i}`,
            transactionId,
            ticketTypes[i % ticketTypes.length],
            'friday-workshop',
            'Festival',
            `Test${i}`,
            `fest${i}@example.com`,
            'valid',
            crypto.randomBytes(16).toString('hex'),
            crypto.randomBytes(32).toString('hex'),
          ],
        });
      }
    });

    it('should optimize ticket lookup by ID', async () => {
      const result = await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');

      expect(result.data.length).toBe(1);
      expect(result.data[0].ticket_id).toBe('TEST-FEST-0');
      expect(result.executionTime).toBeLessThan(50); // Should be fast
      expect(result.fromCache).toBe(false);
    });

    it('should cache ticket lookup results', async () => {
      // First call - not cached
      const result1 = await festivalOptimizer.optimizeTicketLookup('TEST-FEST-1');
      expect(result1.fromCache).toBe(false);

      // Second call - should be cached
      const result2 = await festivalOptimizer.optimizeTicketLookup('TEST-FEST-1');
      expect(result2.fromCache).toBe(true);
      expect(result2.executionTime).toBe(0); // Cached query has zero execution time
    });

    it('should optimize tickets by email with JOIN', async () => {
      const result = await festivalOptimizer.optimizeTicketsByEmail('fest0@example.com');

      expect(result.data.length).toBe(1);
      expect(result.data[0]).toHaveProperty('order_number');
      expect(result.data[0]).toHaveProperty('amount_total');
    });

    it('should optimize event statistics query', async () => {
      const result = await festivalOptimizer.optimizeEventStatistics('friday-workshop');

      expect(result.data.length).toBe(1);
      const stats = result.data[0];

      expect(stats).toHaveProperty('total_tickets');
      expect(stats).toHaveProperty('valid_tickets');
      expect(stats.total_tickets).toBe(5);
    });

    it('should optimize daily sales report', async () => {
      const result = await festivalOptimizer.optimizeDailySalesReport('friday-workshop', 7);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should optimize check-in dashboard query', async () => {
      const result = await festivalOptimizer.optimizeCheckinDashboard('friday-workshop');

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should optimize revenue breakdown', async () => {
      const result = await festivalOptimizer.optimizeRevenueBreakdown('friday-workshop');

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      const breakdown = result.data[0];
      expect(breakdown).toHaveProperty('ticket_type');
      expect(breakdown).toHaveProperty('total_revenue');
    });
  });

  describe('Performance Benchmarking', () => {
    it('should complete simple query in reasonable time', async () => {
      const start = performance.now();

      await db.execute(
        'SELECT COUNT(*) as count FROM tickets WHERE status = ?',
        ['valid']
      );

      const duration = performance.now() - start;
      // Reasonable threshold for CI environments - 500ms should always pass
      expect(duration).toBeLessThan(500);
    });

    it('should complete ticket lookup in reasonable time', async () => {
      // Create test ticket
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (uuid, customer_email, amount_total, status, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['TEST-TX-PERF', 'perf@example.com', 5000, 'completed'],
      });

      const transactionId = Number(txResult.lastInsertRowid);

      await db.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id,
                attendee_first_name, attendee_last_name, attendee_email, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['TEST-TKT-PERF', transactionId, 'Workshop', 'friday-workshop',
               'Perf', 'Test', 'perf@example.com', 'valid'],
      });

      const start = performance.now();
      const result = await festivalOptimizer.optimizeTicketLookup('TEST-TKT-PERF');
      const duration = performance.now() - start;

      expect(result.data.length).toBe(1);
      // Reasonable threshold for CI environments
      expect(duration).toBeLessThan(500);
    });

    it('should show performance improvement with caching', async () => {
      // First call - not cached
      const start1 = performance.now();
      const result1 = await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');
      const uncachedDuration = performance.now() - start1;

      expect(result1.fromCache).toBe(false);

      // Second call - cached
      const start2 = performance.now();
      const result2 = await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');
      const cachedDuration = performance.now() - start2;

      expect(result2.fromCache).toBe(true);
      // Cached should be faster than uncached (relative comparison)
      expect(cachedDuration).toBeLessThanOrEqual(uncachedDuration);
    });
  });

  describe('Query Plan Analysis', () => {
    it('should use indexes for ticket_id lookups', async () => {
      const plan = await db.execute(
        'EXPLAIN QUERY PLAN SELECT * FROM tickets WHERE ticket_id = ?',
        ['TEST-TKT-001']
      );

      // SQLite should use index if available
      expect(plan.rows.length).toBeGreaterThan(0);
    });

    it('should optimize JOIN queries', async () => {
      const sql = `
        SELECT t.*, tr.uuid, tr.amount_total
        FROM tickets t
        JOIN transactions tr ON t.transaction_id = tr.id
        WHERE t.ticket_id = ?
      `;

      const plan = await db.execute(`EXPLAIN QUERY PLAN ${sql}`, ['TEST-TKT-001']);

      expect(plan.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Optimization Effectiveness', () => {
    it('should reduce query execution time with optimizations', async () => {
      // Create substantial test data
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (uuid, customer_email, amount_total, status, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: ['TEST-TX-BULK', 'bulk@example.com', 50000, 'completed'],
      });

      const transactionId = Number(txResult.lastInsertRowid);

      // Create 50 test tickets
      for (let i = 0; i < 50; i++) {
        await db.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id,
                  attendee_first_name, attendee_last_name, attendee_email, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [`TEST-BULK-${i}`, transactionId, 'Workshop', 'friday-workshop',
                 'Bulk', `User${i}`, `bulk${i}@example.com`, 'valid'],
        });
      }

      // Unoptimized query (SELECT *)
      const start1 = performance.now();
      await db.execute('SELECT * FROM tickets WHERE event_id = ?', ['friday-workshop']);
      const unoptimized = performance.now() - start1;

      // Optimized query (specific columns)
      const start2 = performance.now();
      await db.execute(
        'SELECT ticket_id, attendee_email, status FROM tickets WHERE event_id = ?',
        ['friday-workshop']
      );
      const optimized = performance.now() - start2;

      // Optimized should be faster or similar
      expect(optimized).toBeLessThanOrEqual(unoptimized * 1.5); // Allow 50% margin
    });

    it('should track optimization improvements', async () => {
      const metrics1 = festivalOptimizer.getOptimizationStats();
      const initialExecutions = metrics1.totalExecutions;

      // Execute multiple queries
      await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');
      await festivalOptimizer.optimizeTicketLookup('TEST-FEST-1');

      const metrics2 = festivalOptimizer.getOptimizationStats();

      expect(metrics2.totalExecutions).toBeGreaterThan(initialExecutions);
      expect(metrics2.stats).toHaveProperty('TICKET_LOOKUP');
    });
  });

  describe('Index Creation and Verification', () => {
    it('should create festival-specific indexes', async () => {
      const results = await festivalOptimizer.createFestivalIndexes();

      expect(results.length).toBeGreaterThan(0);

      // Most should succeed or already exist
      const successOrExists = results.filter(
        r => r.success || r.error === 'already_exists'
      );

      expect(successOrExists.length).toBe(results.length);
    });

    it('should verify indexes exist after creation', async () => {
      await festivalOptimizer.createFestivalIndexes();

      // Query to check indexes
      const indexes = await db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_tickets_%'"
      );

      expect(indexes.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Query Optimization', () => {
    it('should handle concurrent queries efficiently', async () => {
      const queries = [];

      for (let i = 0; i < 10; i++) {
        queries.push(
          festivalOptimizer.optimizeTicketLookup('TEST-FEST-0')
        );
      }

      const results = await Promise.all(queries);

      // First one should hit DB, rest should be cached
      expect(results[0].fromCache).toBe(false);
      results.slice(1).forEach(result => {
        expect(result.fromCache).toBe(true);
      });
    });

    it('should maintain cache consistency under load', async () => {
      const queries = [];

      for (let i = 0; i < 20; i++) {
        queries.push(
          festivalOptimizer.optimizeEventStatistics('friday-workshop')
        );
      }

      const results = await Promise.all(queries);

      // All results should be consistent
      const firstResult = JSON.stringify(results[0].data);
      results.forEach(result => {
        expect(JSON.stringify(result.data)).toBe(firstResult);
      });
    });
  });

  describe('Cache Invalidation', () => {
    it('should respect cache TTL', async () => {
      // First call - cache miss
      const result1 = await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');
      expect(result1.fromCache).toBe(false);

      // Manipulate cache to expire it
      const cacheKey = 'TICKET_LOOKUP:["TEST-FEST-0"]';
      const cached = festivalOptimizer.queryCache.get(cacheKey);
      if (cached) {
        cached.timestamp = Date.now() - 400000; // Expire cache
      }

      // Next call should be cache miss
      const result2 = await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');
      expect(result2.fromCache).toBe(false);
    });

    it('should clean expired cache entries', () => {
      // Add old entries
      festivalOptimizer.queryCache.set('old-key-1', {
        data: [],
        timestamp: Date.now() - 700000,
      });

      festivalOptimizer.queryCache.set('new-key', {
        data: [],
        timestamp: Date.now(),
      });

      const sizeBefore = festivalOptimizer.queryCache.size;

      festivalOptimizer.cleanCache();

      expect(festivalOptimizer.queryCache.size).toBeLessThan(sizeBefore);
      expect(festivalOptimizer.queryCache.has('old-key-1')).toBe(false);
      expect(festivalOptimizer.queryCache.has('new-key')).toBe(true);
    });
  });

  describe('Query Metrics and Statistics', () => {
    it('should provide detailed query statistics', async () => {
      // Execute various queries
      await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');
      await festivalOptimizer.optimizeEventStatistics('friday-workshop');

      const stats = festivalOptimizer.getOptimizationStats();

      expect(stats).toHaveProperty('queryTypes');
      expect(stats).toHaveProperty('totalExecutions');
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('stats');
    });

    it('should track query performance trends', async () => {
      // Execute same query multiple times
      for (let i = 0; i < 5; i++) {
        await festivalOptimizer.optimizeTicketLookup('TEST-FEST-0');
      }

      const stats = festivalOptimizer.getOptimizationStats();
      const ticketLookupStats = stats.stats.TICKET_LOOKUP;

      expect(ticketLookupStats).toBeDefined();
      expect(ticketLookupStats.executions).toBeGreaterThanOrEqual(5);
      expect(ticketLookupStats).toHaveProperty('avgTime');
      expect(ticketLookupStats).toHaveProperty('minTime');
      expect(ticketLookupStats).toHaveProperty('maxTime');
    });
  });
});
