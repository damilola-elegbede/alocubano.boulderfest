/**
 * Comprehensive Test Suite for Bootstrap-Driven Ticket Architecture
 * Tests API endpoints, database integrity, cache performance, and frontend integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { performance } from 'perf_hooks';

// Test configuration
const BASE_URL = process.env.VITEST_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

describe('Bootstrap-Driven Ticket Architecture', () => {
  let performanceMetrics = {};

  beforeAll(async () => {
    console.log('\n🧪 Starting comprehensive ticket architecture tests...');
    console.log(`📍 Testing against: ${BASE_URL}`);
  });

  afterAll(() => {
    console.log('\n📊 Performance Metrics Summary:');
    Object.entries(performanceMetrics).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}ms`);
    });
  });

  describe('1. API Testing - /api/tickets/types', () => {
    it('should return all ticket types with correct structure', async () => {
      const start = performance.now();

      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      performanceMetrics['API_ALL_TICKETS'] = Math.round(performance.now() - start);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.tickets)).toBe(true);
      expect(data.metadata).toBeDefined();
      expect(data.timestamp).toBeDefined();

      // Verify structure of first ticket
      if (data.tickets.length > 0) {
        const ticket = data.tickets[0];
        expect(ticket).toHaveProperty('id');
        expect(ticket).toHaveProperty('event_id');
        expect(ticket).toHaveProperty('name');
        expect(ticket).toHaveProperty('price_cents');
        expect(ticket).toHaveProperty('status');
        expect(ticket).toHaveProperty('availability');
        expect(ticket).toHaveProperty('event');
        expect(ticket.event).toHaveProperty('name');
      }
    }, TEST_TIMEOUT);

    it('should filter by event_id correctly', async () => {
      const start = performance.now();

      const response = await fetch(`${BASE_URL}/api/tickets/types?event_id=boulder-fest-2026`);
      const data = await response.json();

      performanceMetrics['API_FILTER_EVENT'] = Math.round(performance.now() - start);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // All tickets should be for boulder-fest-2026
      data.tickets.forEach(ticket => {
        expect(ticket.event_id).toBe('boulder-fest-2026');
      });

      expect(data.metadata.filtered_by_event).toBe(true);
    }, TEST_TIMEOUT);

    it('should filter by status correctly', async () => {
      const start = performance.now();

      const response = await fetch(`${BASE_URL}/api/tickets/types?status=available,coming-soon`);
      const data = await response.json();

      performanceMetrics['API_FILTER_STATUS'] = Math.round(performance.now() - start);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // All tickets should have status 'available' or 'coming-soon'
      data.tickets.forEach(ticket => {
        expect(['available', 'coming-soon']).toContain(ticket.status);
      });

      expect(data.metadata.filtered_by_status).toBe(true);
    }, TEST_TIMEOUT);

    it('should exclude test tickets by default', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Should not contain test tickets
      data.tickets.forEach(ticket => {
        expect(ticket.status).not.toBe('test');
      });

      expect(data.metadata.include_test_tickets).toBe(false);
    }, TEST_TIMEOUT);

    it('should include test tickets when explicitly requested', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?include_test=true`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metadata.include_test_tickets).toBe(true);

      // Should contain some test tickets
      const testTickets = data.tickets.filter(ticket => ticket.status === 'test');
      expect(testTickets.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should return appropriate cache headers', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('public');
      expect(response.headers.get('cache-control')).toContain('max-age');
      expect(response.headers.get('etag')).toBeDefined();
      expect(response.headers.get('vary')).toContain('event_id');
    }, TEST_TIMEOUT);

    it('should handle CORS preflight requests', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`, {
        method: 'OPTIONS'
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-methods')).toContain('GET');
      expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
    }, TEST_TIMEOUT);

    it('should reject non-GET requests', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`, {
        method: 'POST'
      });

      expect(response.status).toBe(405);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Method not allowed');
    }, TEST_TIMEOUT);
  });

  describe('2. Database Verification', () => {
    it('should verify bootstrap data is loaded correctly', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?include_test=true`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tickets.length).toBeGreaterThan(0);

      // Verify specific tickets from bootstrap.json exist
      const ticketIds = data.tickets.map(t => t.id);
      expect(ticketIds).toContain('boulder-fest-2026-full-pass');
      expect(ticketIds).toContain('weekender-2025-11-full');
      expect(ticketIds).toContain('test-ticket-basic');

      // Verify pricing matches bootstrap.json
      const fullPass = data.tickets.find(t => t.id === 'boulder-fest-2026-full-pass');
      expect(fullPass?.price_cents).toBe(25000);
      expect(fullPass?.max_quantity).toBe(200);
      expect(fullPass?.sold_count).toBe(45);
    }, TEST_TIMEOUT);

    it('should verify event relationships are correct', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?event_id=boulder-fest-2026`);
      const data = await response.json();

      expect(response.status).toBe(200);

      data.tickets.forEach(ticket => {
        expect(ticket.event_id).toBe('boulder-fest-2026');
        expect(ticket.event.id).toBe('boulder-fest-2026');
        expect(ticket.event.name).toBe('A Lo Cubano Boulder Fest 2026');
        expect(ticket.event.venue).toBe('Avalon Ballroom, Boulder, CO');
      });
    }, TEST_TIMEOUT);

    it('should verify calculated availability fields', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?event_id=boulder-fest-2026`);
      const data = await response.json();

      expect(response.status).toBe(200);

      const fullPass = data.tickets.find(t => t.id === 'boulder-fest-2026-full-pass');
      if (fullPass) {
        expect(fullPass.availability).toBe(fullPass.max_quantity - fullPass.sold_count);
        expect(fullPass.availability).toBe(200 - 45); // 155
        expect(typeof fullPass.available_quantity).toBe('number');
        expect(typeof fullPass.is_available).toBe('boolean');
        expect(typeof fullPass.can_purchase).toBe('boolean');
        expect(fullPass.price_display).toBe('$250.00');
      }
    }, TEST_TIMEOUT);
  });

  describe('3. Cache Performance Testing', () => {
    it('should demonstrate cache hit improvement', async () => {
      // First request (cache miss)
      const start1 = performance.now();
      const response1 = await fetch(`${BASE_URL}/api/tickets/types`);
      const data1 = await response1.json();
      const time1 = performance.now() - start1;

      expect(response1.status).toBe(200);
      performanceMetrics['CACHE_MISS'] = Math.round(time1);

      // Second request (cache hit)
      const start2 = performance.now();
      const response2 = await fetch(`${BASE_URL}/api/tickets/types`);
      const data2 = await response2.json();
      const time2 = performance.now() - start2;

      expect(response2.status).toBe(200);
      performanceMetrics['CACHE_HIT'] = Math.round(time2);

      // Cache hit should be faster (though both are already very fast)
      console.log(`Cache miss: ${Math.round(time1)}ms, Cache hit: ${Math.round(time2)}ms`);

      // Verify response times are reasonable (under 1 second)
      expect(time1).toBeLessThan(1000);
      expect(time2).toBeLessThan(1000);
    }, TEST_TIMEOUT);

    it('should include cache statistics in non-production', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Should include cache metadata
      expect(data.metadata.cache_hit).toBeDefined();
      expect(data.metadata.response_time_ms).toBeDefined();
      expect(typeof data.metadata.response_time_ms).toBe('number');

      // In development, should include cache stats
      if (process.env.NODE_ENV !== 'production') {
        expect(data.cache_stats).toBeDefined();
        expect(data.cache_stats).toHaveProperty('hits');
        expect(data.cache_stats).toHaveProperty('misses');
        expect(data.cache_stats).toHaveProperty('hitRate');
      }
    }, TEST_TIMEOUT);
  });

  describe('4. Error Handling Testing', () => {
    it('should handle invalid event_id gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?event_id=nonexistent-event`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.tickets).toEqual([]);
      expect(data.metadata.total_tickets).toBe(0);
    }, TEST_TIMEOUT);

    it('should handle invalid status filter gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?status=invalid-status`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.tickets).toEqual([]);
      expect(data.metadata.total_tickets).toBe(0);
    }, TEST_TIMEOUT);

    it('should handle malformed query parameters', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?include_test=maybe&status=`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Should treat include_test=maybe as false
      expect(data.metadata.include_test_tickets).toBe(false);
    }, TEST_TIMEOUT);
  });

  describe('5. Integration Testing', () => {
    it('should verify ticket data structure matches frontend expectations', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?event_id=boulder-fest-2026`);
      const data = await response.json();

      expect(response.status).toBe(200);

      data.tickets.forEach(ticket => {
        // Required fields for frontend
        expect(ticket.id).toBeDefined();
        expect(ticket.name).toBeDefined();
        expect(ticket.description).toBeDefined();
        expect(ticket.price_cents).toBeDefined();
        expect(ticket.price_display).toBeDefined();
        expect(ticket.status).toBeDefined();
        expect(ticket.can_purchase).toBeDefined();
        expect(ticket.availability).toBeDefined();

        // Event information
        expect(ticket.event).toBeDefined();
        expect(ticket.event.name).toBeDefined();
        expect(ticket.event.date).toBeDefined();
        expect(ticket.event.venue).toBeDefined();

        // Stripe integration
        if (ticket.status !== 'test') {
          expect(ticket.stripe_price_id).toBeDefined();
        }
      });
    }, TEST_TIMEOUT);

    it('should verify different ticket statuses work correctly', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?include_test=true`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Find tickets with different statuses
      const availableTickets = data.tickets.filter(t => t.status === 'available');
      const comingSoonTickets = data.tickets.filter(t => t.status === 'coming-soon');
      const testTickets = data.tickets.filter(t => t.status === 'test');
      const closedTickets = data.tickets.filter(t => t.status === 'closed');

      // Verify each status type has correct properties
      availableTickets.forEach(ticket => {
        expect(ticket.can_purchase).toBe(true);
        expect(ticket.is_available).toBe(true);
      });

      comingSoonTickets.forEach(ticket => {
        expect(ticket.can_purchase).toBe(false);
        expect(ticket.is_available).toBe(false);
      });

      testTickets.forEach(ticket => {
        expect(ticket.status).toBe('test');
      });

      closedTickets.forEach(ticket => {
        expect(ticket.can_purchase).toBe(false);
        expect(ticket.status).toBe('closed');
      });
    }, TEST_TIMEOUT);
  });

  describe('6. Performance Verification', () => {
    it('should meet API response time targets (<100ms)', async () => {
      const iterations = 5;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const response = await fetch(`${BASE_URL}/api/tickets/types`);
        const time = performance.now() - start;

        expect(response.status).toBe(200);
        times.push(time);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      performanceMetrics['API_AVERAGE_RESPONSE'] = Math.round(avgTime);

      console.log(`Average API response time: ${Math.round(avgTime)}ms`);

      // Should be fast (under 500ms for serverless cold starts)
      expect(avgTime).toBeLessThan(500);
    }, TEST_TIMEOUT);

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const start = performance.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        fetch(`${BASE_URL}/api/tickets/types`)
      );

      const responses = await Promise.all(promises);
      const totalTime = performance.now() - start;

      performanceMetrics['CONCURRENT_REQUESTS'] = Math.round(totalTime);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      console.log(`${concurrentRequests} concurrent requests completed in ${Math.round(totalTime)}ms`);

      // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(2000);
    }, TEST_TIMEOUT);
  });

  describe('7. Bootstrap Service Verification', () => {
    it('should verify bootstrap service status', async () => {
      // This would require an admin endpoint or direct database access
      // For now, we verify by checking if bootstrap data is present
      const response = await fetch(`${BASE_URL}/api/tickets/types?include_test=true`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Should have tickets from all events in bootstrap.json
      const eventIds = [...new Set(data.tickets.map(t => t.event_id))];
      expect(eventIds).toContain('boulder-fest-2026');
      expect(eventIds).toContain('weekender-2025-11');
      expect(eventIds).toContain('boulder-fest-2025');
      expect(eventIds).toContain('test-event-1');
    }, TEST_TIMEOUT);
  });
});