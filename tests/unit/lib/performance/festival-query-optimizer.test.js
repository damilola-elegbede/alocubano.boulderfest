/**
 * Festival Query Optimizer Unit Tests
 * Comprehensive tests for festival-specific query optimizations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FestivalQueryOptimizer } from '../../../../lib/performance/festival-query-optimizer.js';

describe('FestivalQueryOptimizer', () => {
  let mockDb;
  let optimizer;

  beforeEach(() => {
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    optimizer = new FestivalQueryOptimizer(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Ticket Lookup Optimization', () => {
    it('should optimize ticket lookup by ID', async () => {
      const ticketId = 'TKT-001';
      mockDb.execute.mockResolvedValue({
        rows: [{ ticket_id: ticketId, status: 'valid' }],
      });

      const result = await optimizer.optimizeTicketLookup(ticketId);

      expect(result.data).toBeDefined();
      expect(result.queryType).toBe('TICKET_LOOKUP');
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('SELECT ticket_id'),
          args: [ticketId],
        })
      );
    });

    it('should select specific columns for efficiency', async () => {
      const ticketId = 'TKT-002';

      await optimizer.optimizeTicketLookup(ticketId);

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('ticket_id');
      expect(call.sql).toContain('transaction_id');
      expect(call.sql).toContain('attendee_email');
      expect(call.sql).not.toContain('SELECT *');
    });

    it('should include LIMIT 1 for single ticket lookup', async () => {
      await optimizer.optimizeTicketLookup('TKT-003');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('LIMIT 1');
    });

    it('should track execution metrics', async () => {
      mockDb.execute.mockResolvedValue({ rows: [{ ticket_id: 'TKT-004' }] });

      const result = await optimizer.optimizeTicketLookup('TKT-004');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.fromCache).toBe(false);
    });
  });

  describe('QR Code Validation Optimization', () => {
    it('should optimize QR validation queries', async () => {
      const qrData = 'QR-12345';
      mockDb.execute.mockResolvedValue({
        rows: [{ ticket_id: 'TKT-005', status: 'valid' }],
      });

      const result = await optimizer.optimizeQRValidation(qrData);

      expect(result.queryType).toBe('QR_VALIDATION');
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('qr_code_data'),
          args: [qrData],
        })
      );
    });

    it('should filter by valid statuses', async () => {
      await optimizer.optimizeQRValidation('QR-12345');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain("status IN ('valid', 'transferred')");
    });

    it('should use covering index columns', async () => {
      await optimizer.optimizeQRValidation('QR-12345');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('ticket_id');
      expect(call.sql).toContain('attendee_first_name');
      expect(call.sql).toContain('validation_signature');
    });

    it('should NOT cache QR validation results', async () => {
      const qrData = 'QR-SECURE';
      mockDb.execute.mockResolvedValue({ rows: [{ ticket_id: 'TKT-006' }] });

      // First call
      const result1 = await optimizer.optimizeQRValidation(qrData);
      expect(result1.fromCache).toBe(false);

      // Second call should also hit database (no cache)
      const result2 = await optimizer.optimizeQRValidation(qrData);
      expect(result2.fromCache).toBe(false);
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tickets by Email Optimization', () => {
    it('should optimize email lookup with JOIN', async () => {
      const email = 'test@example.com';
      mockDb.execute.mockResolvedValue({
        rows: [{ ticket_id: 'TKT-007', order_number: 'ORD-001' }],
      });

      const result = await optimizer.optimizeTicketsByEmail(email);

      expect(result.queryType).toBe('TICKETS_BY_EMAIL');
      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('JOIN transactions');
      expect(call.args).toEqual([email, email]);
    });

    it('should order by created_at DESC', async () => {
      await optimizer.optimizeTicketsByEmail('test@example.com');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('ORDER BY t.created_at DESC');
    });

    it('should include transaction details', async () => {
      await optimizer.optimizeTicketsByEmail('test@example.com');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('tr.uuid');
      expect(call.sql).toContain('tr.amount_total');
    });
  });

  describe('Event Statistics Optimization', () => {
    it('should aggregate multiple statistics in single query', async () => {
      const eventId = 'EVT-001';
      mockDb.execute.mockResolvedValue({
        rows: [{ total_tickets: 100, valid_tickets: 80 }],
      });

      const result = await optimizer.optimizeEventStatistics(eventId);

      expect(result.queryType).toBe('EVENT_STATISTICS');
      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('COUNT(*)');
      expect(call.sql).toContain('COUNT(CASE WHEN');
    });

    it('should calculate all ticket statuses', async () => {
      await optimizer.optimizeEventStatistics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain("status = 'valid'");
      expect(call.sql).toContain("status = 'used'");
      expect(call.sql).toContain("status = 'cancelled'");
    });

    it('should include check-in statistics', async () => {
      await optimizer.optimizeEventStatistics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('checked_in_at IS NOT NULL');
    });

    it('should include sale date range', async () => {
      await optimizer.optimizeEventStatistics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('MIN(created_at)');
      expect(call.sql).toContain('MAX(created_at)');
    });
  });

  describe('Daily Sales Report Optimization', () => {
    it('should group sales by date', async () => {
      const eventId = 'EVT-001';
      mockDb.execute.mockResolvedValue({
        rows: [{ sale_date: '2026-05-15', tickets_sold: 50 }],
      });

      const result = await optimizer.optimizeDailySalesReport(eventId);

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('DATE(t.created_at)');
      expect(call.sql).toContain('GROUP BY DATE(t.created_at)');
    });

    it('should calculate multiple metrics per day', async () => {
      await optimizer.optimizeDailySalesReport('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('COUNT(*)');
      expect(call.sql).toContain('COUNT(DISTINCT t.transaction_id)');
      expect(call.sql).toContain('SUM(tr.amount_total)');
    });

    it('should support custom day range', async () => {
      await optimizer.optimizeDailySalesReport('EVT-001', 60);

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('-60 days');
    });

    it('should default to 30 days', async () => {
      await optimizer.optimizeDailySalesReport('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('-30 days');
    });

    it('should filter by completed transactions', async () => {
      await optimizer.optimizeDailySalesReport('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain("tr.status = 'completed'");
    });

    it('should count workshop and social tickets separately', async () => {
      await optimizer.optimizeDailySalesReport('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('workshop');
      expect(call.sql).toContain('social');
    });
  });

  describe('Check-in Dashboard Optimization', () => {
    it('should calculate real-time check-in metrics', async () => {
      const eventId = 'EVT-001';
      mockDb.execute.mockResolvedValue({
        rows: [{ checked_in_count: 75, pending_checkin: 25 }],
      });

      const result = await optimizer.optimizeCheckinDashboard(eventId);

      expect(result.queryType).toBe('CHECKIN_DASHBOARD');
    });

    it('should count recent check-ins', async () => {
      await optimizer.optimizeCheckinDashboard('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('checked_in_at >=');
      expect(call.sql).toContain('-1 hour');
    });

    it('should group by ticket type', async () => {
      await optimizer.optimizeCheckinDashboard('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('GROUP BY ticket_type');
    });

    it('should include last check-in time', async () => {
      await optimizer.optimizeCheckinDashboard('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('MAX(checked_in_at)');
    });
  });

  describe('Revenue Breakdown Optimization', () => {
    it('should calculate revenue by ticket type', async () => {
      const eventId = 'EVT-001';
      mockDb.execute.mockResolvedValue({
        rows: [{ ticket_type: 'Workshop', total_revenue: 5000 }],
      });

      const result = await optimizer.optimizeRevenueBreakdown(eventId);

      expect(result.queryType).toBe('REVENUE_BREAKDOWN');
    });

    it('should include average transaction value', async () => {
      await optimizer.optimizeRevenueBreakdown('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('AVG(tr.amount_total)');
    });

    it('should order by revenue DESC', async () => {
      await optimizer.optimizeRevenueBreakdown('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('ORDER BY total_revenue DESC');
    });

    it('should include sale date range per type', async () => {
      await optimizer.optimizeRevenueBreakdown('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('MIN(tr.created_at)');
      expect(call.sql).toContain('MAX(tr.created_at)');
    });
  });

  describe('Hourly Sales Pattern Optimization', () => {
    it('should group by hour of day', async () => {
      const eventId = 'EVT-001';
      mockDb.execute.mockResolvedValue({
        rows: [{ hour: 14, tickets_sold: 20 }],
      });

      const result = await optimizer.optimizeHourlySalesPattern(eventId);

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain("strftime('%H'");
      expect(call.sql).toContain('GROUP BY');
    });

    it('should calculate average per hour', async () => {
      await optimizer.optimizeHourlySalesPattern('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('COUNT(DISTINCT DATE(t.created_at))');
      expect(call.sql).toContain('avg_per_hour');
    });

    it('should order by hour', async () => {
      await optimizer.optimizeHourlySalesPattern('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('ORDER BY hour');
    });
  });

  describe('Customer Analytics Optimization', () => {
    it('should aggregate customer purchase data', async () => {
      const eventId = 'EVT-001';
      mockDb.execute.mockResolvedValue({
        rows: [{ customer_email: 'test@example.com', total_tickets: 5 }],
      });

      const result = await optimizer.optimizeCustomerAnalytics(eventId);

      expect(result.queryType).toBe('CUSTOMER_ANALYTICS');
    });

    it('should only include repeat customers', async () => {
      await optimizer.optimizeCustomerAnalytics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('HAVING COUNT(*) > 1');
    });

    it('should calculate total spent', async () => {
      await optimizer.optimizeCustomerAnalytics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('SUM(tr.amount_total)');
    });

    it('should include purchase date range', async () => {
      await optimizer.optimizeCustomerAnalytics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('MIN(tr.created_at)');
      expect(call.sql).toContain('MAX(tr.created_at)');
    });

    it('should limit to top 100 customers', async () => {
      await optimizer.optimizeCustomerAnalytics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('LIMIT 100');
    });

    it('should order by total spent DESC', async () => {
      await optimizer.optimizeCustomerAnalytics('EVT-001');

      const call = mockDb.execute.mock.calls[0][0];
      expect(call.sql).toContain('ORDER BY total_spent DESC');
    });
  });

  describe('Query Caching', () => {
    it('should cache non-security-sensitive queries', async () => {
      mockDb.execute.mockResolvedValue({ rows: [{ id: 1 }] });

      const result1 = await optimizer.optimizeTicketLookup('TKT-CACHE');
      expect(result1.fromCache).toBe(false);

      const result2 = await optimizer.optimizeTicketLookup('TKT-CACHE');
      expect(result2.fromCache).toBe(true);
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL (5 minutes)', async () => {
      mockDb.execute.mockResolvedValue({ rows: [{ id: 1 }] });

      await optimizer.optimizeTicketLookup('TKT-TTL');

      // Manipulate cache timestamp
      const cacheKey = 'TICKET_LOOKUP:["TKT-TTL"]';
      const cached = optimizer.queryCache.get(cacheKey);
      cached.timestamp = Date.now() - 400000; // 6+ minutes ago

      const result = await optimizer.optimizeTicketLookup('TKT-TTL');
      expect(result.fromCache).toBe(false);
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });

    it('should clean cache when size exceeds limit', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });

      // Fill cache beyond limit
      for (let i = 0; i < 1100; i++) {
        await optimizer.optimizeTicketLookup(`TKT-${i}`);
      }

      expect(optimizer.queryCache.size).toBeLessThanOrEqual(1000);
    });

    it('should clean old entries during cleanup', () => {
      const oldKey = 'old:key';
      const newKey = 'new:key';

      optimizer.queryCache.set(oldKey, {
        data: [],
        timestamp: Date.now() - 700000, // 11+ minutes
      });

      optimizer.queryCache.set(newKey, {
        data: [],
        timestamp: Date.now(),
      });

      optimizer.cleanCache();

      expect(optimizer.queryCache.has(oldKey)).toBe(false);
      expect(optimizer.queryCache.has(newKey)).toBe(true);
    });
  });

  describe('Optimization Tracking', () => {
    it('should track execution metrics', async () => {
      mockDb.execute.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });

      await optimizer.optimizeTicketLookup('TKT-TRACK');

      const metrics = optimizer.optimizedQueries.get('TICKET_LOOKUP');
      expect(metrics).toBeDefined();
      expect(metrics.executions).toBe(1);
      expect(metrics.totalRows).toBe(2);
    });

    it('should calculate average execution time', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });

      await optimizer.optimizeTicketLookup('TKT-AVG-1');
      await optimizer.optimizeTicketLookup('TKT-AVG-2');

      const metrics = optimizer.optimizedQueries.get('TICKET_LOOKUP');
      expect(metrics.avgTime).toBeGreaterThan(0);
      expect(metrics.executions).toBe(2);
    });

    it('should track min and max execution times', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });

      await optimizer.optimizeTicketLookup('TKT-MIN-MAX');

      const metrics = optimizer.optimizedQueries.get('TICKET_LOOKUP');
      expect(metrics.minTime).toBeGreaterThanOrEqual(0);
      expect(metrics.maxTime).toBeGreaterThanOrEqual(metrics.minTime);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

      await expect(optimizer.optimizeTicketLookup('TKT-ERROR')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should log errors with context', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockDb.execute.mockRejectedValue(new Error('Query failed'));

      await expect(optimizer.optimizeEventStatistics('EVT-ERROR')).rejects.toThrow();

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Festival query optimization failed'),
        expect.any(Object)
      );

      consoleError.mockRestore();
    });

    it('should include execution time in error logs', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockDb.execute.mockRejectedValue(new Error('Timeout'));

      await expect(optimizer.optimizeTicketLookup('TKT-TIMEOUT')).rejects.toThrow();

      expect(consoleError.mock.calls[0][1]).toHaveProperty('executionTime');

      consoleError.mockRestore();
    });
  });

  describe('Statistics and Reporting', () => {
    it('should provide optimization statistics', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });

      await optimizer.optimizeTicketLookup('TKT-STATS-1');
      await optimizer.optimizeQRValidation('QR-STATS-1');

      const stats = optimizer.getOptimizationStats();

      expect(stats.queryTypes).toBeGreaterThan(0);
      expect(stats.totalExecutions).toBeGreaterThan(0);
      expect(stats.stats).toBeDefined();
    });

    it('should calculate cache hit rate', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });

      // Execute same query twice to test cache
      await optimizer.optimizeTicketLookup('TKT-CACHE-HIT');
      await optimizer.optimizeTicketLookup('TKT-CACHE-HIT');

      const stats = optimizer.getOptimizationStats();

      expect(stats.stats.TICKET_LOOKUP).toHaveProperty('cacheHitRate');
    });

    it('should include cache size in stats', async () => {
      const stats = optimizer.getOptimizationStats();

      expect(stats).toHaveProperty('cacheSize');
      expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Index Creation', () => {
    it('should create festival-specific indexes', async () => {
      mockDb.execute.mockResolvedValue({});

      const results = await optimizer.createFestivalIndexes();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.sql.includes('CREATE INDEX'))).toBe(true);
    });

    it('should handle existing indexes gracefully', async () => {
      mockDb.execute.mockRejectedValue(new Error('index already exists'));

      const results = await optimizer.createFestivalIndexes();

      const existingIndexResults = results.filter(r => r.error === 'already_exists');
      expect(existingIndexResults.length).toBeGreaterThan(0);
    });

    it('should set indexesCreated flag', async () => {
      await optimizer.createFestivalIndexes();

      expect(optimizer.indexesCreated).toBe(true);
    });

    it('should create covering indexes', async () => {
      await optimizer.createFestivalIndexes();

      const coveringIndexCalls = mockDb.execute.mock.calls.filter(call =>
        call[0].includes('covering')
      );

      expect(coveringIndexCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Festival Recommendations', () => {
    it('should recommend slow query optimization', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });

      // Create slow query metrics
      optimizer.optimizedQueries.set('SLOW_QUERY_TYPE', {
        executions: 10,
        totalTime: 1000,
        avgTime: 100,
        minTime: 80,
        maxTime: 120,
      });

      const recommendations = optimizer.getFestivalRecommendations();

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'SLOW_QUERY',
            priority: 'HIGH',
          }),
        ])
      );
    });

    it('should recommend cache improvements', async () => {
      // Create low cache hit rate scenario
      optimizer.optimizedQueries.set('LOW_CACHE_QUERY', {
        executions: 100,
        cacheHits: 10,
        cacheHitRate: 10,
      });

      const recommendations = optimizer.getFestivalRecommendations();

      const cacheRec = recommendations.find(r => r.type === 'LOW_CACHE_EFFICIENCY');
      expect(cacheRec).toBeDefined();
    });

    it('should recommend index creation if not done', () => {
      optimizer.indexesCreated = false;

      const recommendations = optimizer.getFestivalRecommendations();

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'MISSING_INDEXES',
            priority: 'HIGH',
          }),
        ])
      );
    });

    it('should not recommend indexes if already created', async () => {
      await optimizer.createFestivalIndexes();

      const recommendations = optimizer.getFestivalRecommendations();

      const indexRec = recommendations.find(r => r.type === 'MISSING_INDEXES');
      expect(indexRec).toBeUndefined();
    });
  });

  describe('Query Pattern Recognition', () => {
    it('should recognize ticket lookup patterns', () => {
      const pattern = optimizer.patterns.TICKET_LOOKUP_BY_ID;
      const sql = 'SELECT * FROM tickets WHERE ticket_id = ?';

      expect(pattern.test(sql)).toBe(true);
    });

    it('should recognize QR validation patterns', () => {
      const pattern = optimizer.patterns.QR_CODE_VALIDATION;
      const sql = 'SELECT * FROM tickets WHERE qr_code_data = ?';

      expect(pattern.test(sql)).toBe(true);
    });

    it('should recognize check-in patterns', () => {
      const pattern = optimizer.patterns.CHECKIN_STATUS;
      const sql = 'SELECT * FROM tickets WHERE status = "used"';

      expect(pattern.test(sql)).toBe(true);
    });
  });
});
