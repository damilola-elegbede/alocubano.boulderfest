/**
 * Unit Tests: Ticket Cache Service
 * Tests the high-performance ticket data access layer
 */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { TicketCacheService } from '../../../lib/ticket-cache-service.js';

// Mock the database
const mockDb = {
  execute: vi.fn()
};

// Mock the database client
vi.mock('../../../lib/database.js', () => ({
  getDatabaseClient: vi.fn(() => Promise.resolve(mockDb))
}));

// Mock logger
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Ticket Cache Service', () => {
  let ticketCacheService;

  beforeEach(() => {
    // Create fresh service instance for each test
    ticketCacheService = new TicketCacheService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clear any running promises
    ticketCacheService.fetchPromise = null;
  });

  describe('Initialization', () => {
    it('should initialize with empty cache', () => {
      expect(ticketCacheService.ticketCache.size).toBe(0);
      expect(ticketCacheService.eventTicketCache.size).toBe(0);
      expect(ticketCacheService.allTicketsCache.size).toBe(0);
      expect(ticketCacheService.initialized).toBe(false);
    });

    it('should set appropriate TTL for serverless vs local', () => {
      // Test serverless TTL
      process.env.VERCEL = '1';
      const serverlessService = new TicketCacheService();
      expect(serverlessService.ttl).toBe(5 * 60 * 1000); // 5 minutes

      // Test local TTL
      delete process.env.VERCEL;
      const localService = new TicketCacheService();
      expect(localService.ttl).toBe(15 * 60 * 1000); // 15 minutes
    });

    it('should initialize database connection', async () => {
      await ticketCacheService.ensureInitialized();

      expect(ticketCacheService.initialized).toBe(true);
      expect(ticketCacheService.db).toBe(mockDb);
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock database connection failure
      const { getDatabaseClient } = await import('../../../lib/database.js');
      getDatabaseClient.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(ticketCacheService.ensureInitialized()).rejects.toThrow('Database connection failed');
      expect(ticketCacheService.initialized).toBe(false);
      expect(ticketCacheService.db).toBe(null);
    });
  });

  describe('Cache Operations', () => {
    beforeEach(async () => {
      await ticketCacheService.ensureInitialized();
    });

    it('should detect invalid cache correctly', () => {
      expect(ticketCacheService.isValid()).toBe(false);

      // Set recent fetch time with data
      ticketCacheService.lastFetch = Date.now();
      ticketCacheService.ticketCache.set('test', {});
      expect(ticketCacheService.isValid()).toBe(true);

      // Test expired cache
      ticketCacheService.lastFetch = Date.now() - (20 * 60 * 1000); // 20 minutes ago
      expect(ticketCacheService.isValid()).toBe(false);
    });

    it('should invalidate cache properly', () => {
      // Add some test data
      ticketCacheService.ticketCache.set('ticket1', { id: 1 });
      ticketCacheService.eventTicketCache.set('event1', new Set(['ticket1']));
      ticketCacheService.allTicketsCache.set('all', [{ id: 1 }]);
      ticketCacheService.lastFetch = Date.now();

      ticketCacheService.invalidateCache();

      expect(ticketCacheService.ticketCache.size).toBe(0);
      expect(ticketCacheService.eventTicketCache.size).toBe(0);
      expect(ticketCacheService.allTicketsCache.size).toBe(0);
      expect(ticketCacheService.lastFetch).toBe(null);
      expect(ticketCacheService.fetchPromise).toBe(null);
    });
  });

  describe('Data Fetching', () => {
    beforeEach(async () => {
      await ticketCacheService.ensureInitialized();
    });

    it('should fetch all tickets from database', async () => {
      const mockTickets = [
        {
          id: 1,
          ticket_id: 'ticket-123',
          event_id: 'boulder-fest-2026',
          ticket_type: 'weekender',
          price_cents: 15000,
          attendee_first_name: 'John',
          attendee_last_name: 'Doe',
          attendee_email: 'john@example.com',
          status: 'valid',
          is_test: 0,
          created_at: '2024-01-01T00:00:00Z',
          ticket_metadata: '{}',
          order_number: 'ORDER-123',
          transaction_customer_email: 'john@example.com',
          event_name: 'Boulder Fest 2026',
          event_date_actual: '2026-05-15'
        }
      ];

      mockDb.execute.mockResolvedValueOnce({ rows: mockTickets });

      const result = await ticketCacheService.getAllTickets();

      expect(result).toHaveLength(1);
      expect(result[0].ticket_id).toBe('ticket-123');
      expect(result[0].price_display).toBe('$150.00');
      expect(result[0].attendee_name).toBe('John Doe');
      expect(result[0].is_registered).toBe(true);

      // Verify cache is populated
      expect(ticketCacheService.ticketCache.size).toBe(1);
      expect(ticketCacheService.eventTicketCache.has('boulder-fest-2026')).toBe(true);
      expect(ticketCacheService.allTicketsCache.has('all')).toBe(true);
    });

    it('should fetch tickets by event ID', async () => {
      const mockTickets = [
        {
          id: 1,
          ticket_id: 'ticket-123',
          event_id: 'boulder-fest-2026',
          ticket_type: 'weekender',
          price_cents: 15000,
          status: 'valid',
          is_test: 0,
          ticket_metadata: '{}',
          attendee_first_name: 'John',
          attendee_last_name: 'Doe'
        }
      ];

      mockDb.execute.mockResolvedValueOnce({ rows: mockTickets });

      const result = await ticketCacheService.getTicketsByEvent('boulder-fest-2026');

      expect(result).toHaveLength(1);
      expect(result[0].event_id).toBe('boulder-fest-2026');
      expect(mockDb.execute).toHaveBeenCalledWith({
        sql: expect.stringContaining('WHERE t.event_id = ?'),
        args: expect.arrayContaining(['boulder-fest-2026'])
      });
    });

    it('should fetch single ticket by ID', async () => {
      const mockTicket = {
        id: 1,
        ticket_id: 'ticket-123',
        event_id: 'boulder-fest-2026',
        ticket_type: 'weekender',
        price_cents: 15000,
        status: 'valid',
        ticket_metadata: '{}',
        attendee_first_name: 'John',
        attendee_last_name: 'Doe'
      };

      mockDb.execute.mockResolvedValueOnce({ rows: [mockTicket] });

      const result = await ticketCacheService.getTicketById('ticket-123');

      expect(result.ticket_id).toBe('ticket-123');
      expect(mockDb.execute).toHaveBeenCalledWith({
        sql: expect.stringContaining('WHERE t.ticket_id = ?'),
        args: expect.arrayContaining(['ticket-123'])
      });

      // Verify cache is updated
      expect(ticketCacheService.ticketCache.has('ticket-123')).toBe(true);
    });

    it('should return null for non-existent ticket', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const result = await ticketCacheService.getTicketById('non-existent');

      expect(result).toBe(null);
    });
  });

  describe('Data Enrichment', () => {
    beforeEach(async () => {
      await ticketCacheService.ensureInitialized();
    });

    it('should enrich ticket data with calculated fields', () => {
      const rawTicket = {
        ticket_id: 'ticket-123',
        event_id: 'boulder-fest-2026',
        ticket_type: 'weekender_pass',
        price_cents: 15000,
        attendee_first_name: 'John',
        attendee_last_name: 'Doe',
        status: 'valid',
        registration_status: 'registered',
        event_date_actual: '2026-05-15',
        ticket_type_max_quantity: 100,
        ticket_type_sold_count: 50,
        transaction_status: 'completed',
        transaction_amount_cents: 15000,
        qr_code_data: 'qr-data-123',
        ticket_metadata: JSON.stringify({ source: 'website' })
      };

      const enriched = ticketCacheService.enrichTicketData(rawTicket);

      expect(enriched.price_display).toBe('$150.00');
      expect(enriched.attendee_name).toBe('John Doe');
      expect(enriched.formatted_ticket_type).toBe('Weekender Pass');
      expect(enriched.is_registered).toBe(true);
      expect(enriched.ticket_type_available_quantity).toBe(50);
      expect(enriched.ticket_type_is_available).toBe(true);
      expect(enriched.is_transaction_completed).toBe(true);
      expect(enriched.has_qr_code).toBe(true);
      expect(enriched.is_scannable).toBe(true);
      expect(enriched.is_future_event).toBe(true);
      expect(typeof enriched.days_until_event).toBe('number');
    });

    it('should handle missing data gracefully', () => {
      const rawTicket = {
        ticket_id: 'ticket-123',
        price_cents: null,
        attendee_first_name: null,
        attendee_last_name: null,
        ticket_metadata: null
      };

      const enriched = ticketCacheService.enrichTicketData(rawTicket);

      expect(enriched.price_display).toBe('$0.00');
      expect(enriched.attendee_name).toBe('');
      expect(enriched.ticket_metadata).toEqual({});
      expect(enriched.is_registered).toBe(false);
    });
  });

  describe('Cache Performance', () => {
    beforeEach(async () => {
      await ticketCacheService.ensureInitialized();
    });

    it('should track hit/miss statistics', async () => {
      // Setup cache with data
      ticketCacheService.ticketCache.set('ticket-123', { ticket_id: 'ticket-123' });
      ticketCacheService.lastFetch = Date.now();

      // Cache hit
      await ticketCacheService.getTicketById('ticket-123');
      expect(ticketCacheService.stats.hits).toBe(1);

      // Cache miss (will fetch from DB)
      mockDb.execute.mockResolvedValueOnce({ rows: [] });
      await ticketCacheService.getTicketById('ticket-456');
      expect(ticketCacheService.stats.misses).toBe(1);
    });

    it('should provide comprehensive cache statistics', () => {
      ticketCacheService.stats.hits = 80;
      ticketCacheService.stats.misses = 20;
      ticketCacheService.stats.eventHits = 15;
      ticketCacheService.stats.eventMisses = 5;
      ticketCacheService.stats.refreshes = 3;
      ticketCacheService.lastFetch = Date.now() - 60000; // 1 minute ago
      ticketCacheService.ticketCache.set('test', {});

      const stats = ticketCacheService.getCacheStats();

      expect(stats.hitRate).toBe('80.00%');
      expect(stats.eventHitRate).toBe('75.00%');
      expect(stats.ticketCacheSize).toBe(1);
      expect(stats.cacheAgeMinutes).toBe(1);
      expect(stats.ttlMinutes).toBeGreaterThan(0);
      expect(typeof stats.isServerless).toBe('boolean');
    });
  });

  describe('Cache Updates', () => {
    beforeEach(async () => {
      await ticketCacheService.ensureInitialized();
    });

    it('should update ticket in cache', () => {
      // Setup initial cache
      const initialTicket = { ticket_id: 'ticket-123', status: 'valid' };
      ticketCacheService.ticketCache.set('ticket-123', initialTicket);
      ticketCacheService.allTicketsCache.set('all', [initialTicket]);

      // Update ticket
      const updatedTicket = { ticket_id: 'ticket-123', status: 'used', price_cents: 15000 };
      ticketCacheService.updateTicketInCache('ticket-123', updatedTicket);

      const cached = ticketCacheService.ticketCache.get('ticket-123');
      expect(cached.status).toBe('used');
      expect(cached.price_display).toBe('$150.00');

      // Check all tickets cache is updated
      const allTickets = ticketCacheService.allTicketsCache.get('all');
      expect(allTickets[0].status).toBe('used');
    });

    it('should remove ticket from cache', () => {
      // Setup cache
      const ticket = { ticket_id: 'ticket-123', event_id: 'event-1' };
      ticketCacheService.ticketCache.set('ticket-123', ticket);
      ticketCacheService.eventTicketCache.set('event-1', new Set(['ticket-123']));
      ticketCacheService.allTicketsCache.set('all', [ticket]);

      ticketCacheService.removeTicketFromCache('ticket-123');

      expect(ticketCacheService.ticketCache.has('ticket-123')).toBe(false);
      expect(ticketCacheService.eventTicketCache.get('event-1').has('ticket-123')).toBe(false);
      expect(ticketCacheService.allTicketsCache.get('all')).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await ticketCacheService.ensureInitialized();
    });

    it('should handle database connection failures', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(ticketCacheService.getAllTickets()).rejects.toThrow('Connection failed');
    });

    it('should serve stale data when database fails', async () => {
      // Setup stale cache data
      ticketCacheService.ticketCache.set('ticket-123', { ticket_id: 'ticket-123' });

      const canServeStale = await ticketCacheService.handleConnectionFailure(new Error('DB down'));
      expect(canServeStale).toBe(true);
    });

    it('should throw error when no cache data available', async () => {
      // No cache data
      expect(ticketCacheService.ticketCache.size).toBe(0);

      await expect(
        ticketCacheService.handleConnectionFailure(new Error('DB down'))
      ).rejects.toThrow('DB down');
    });
  });

  describe('Utility Functions', () => {
    it('should format ticket type correctly', () => {
      expect(ticketCacheService.formatTicketType('weekender_pass')).toBe('Weekender Pass');
      expect(ticketCacheService.formatTicketType('single-day')).toBe('Single Day');
      expect(ticketCacheService.formatTicketType('VIP')).toBe('VIP');
      expect(ticketCacheService.formatTicketType(null)).toBe('General Admission');
    });

    it('should format event date correctly', () => {
      expect(ticketCacheService.formatEventDate('2026-05-15')).toContain('2026');
      expect(ticketCacheService.formatEventDate(null)).toBe('May 15-17, 2026');
      expect(ticketCacheService.formatEventDate('invalid')).toBe('May 15-17, 2026');
    });

    it('should calculate days until event', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const days = ticketCacheService.calculateDaysUntilEvent(futureDateStr);
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(11);

      expect(ticketCacheService.calculateDaysUntilEvent(null)).toBe(null);
      expect(ticketCacheService.calculateDaysUntilEvent('invalid')).toBe(null);
    });

    it('should format price correctly', () => {
      expect(ticketCacheService.formatPrice(15000)).toBe('$150.00');
      expect(ticketCacheService.formatPrice(0)).toBe('$0.00');
      expect(ticketCacheService.formatPrice(null)).toBe('$0.00');
      expect(ticketCacheService.formatPrice(5000, 'EUR')).toBe('EUR 50.00');
    });

    it('should parse JSON safely', () => {
      expect(ticketCacheService.parseJSON('{"key": "value"}')).toEqual({ key: 'value' });
      expect(ticketCacheService.parseJSON('invalid json')).toEqual({});
      expect(ticketCacheService.parseJSON(null)).toEqual({});
      expect(ticketCacheService.parseJSON({ already: 'object' })).toEqual({ already: 'object' });
    });
  });
});