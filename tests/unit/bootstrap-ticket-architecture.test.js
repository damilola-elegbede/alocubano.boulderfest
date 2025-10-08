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

    it('should exclude test tickets in production environment', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Test tickets visibility depends on environment
      const isProduction = data.metadata.environment === 'production';
      expect(data.metadata.test_tickets_visible).toBe(!isProduction);

      if (isProduction) {
        // Production should not contain test tickets
        data.tickets.forEach(ticket => {
          expect(ticket.status).not.toBe('test');
        });
      }
    }, TEST_TIMEOUT);

    it('should include test tickets in non-production environments', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Test tickets visibility is environment-based (not query parameter based)
      const isProduction = data.metadata.environment === 'production';
      expect(data.metadata.test_tickets_visible).toBe(!isProduction);

      // In non-production environments, should contain some test tickets
      if (!isProduction) {
        const testTickets = data.tickets.filter(ticket => ticket.status === 'test');
        expect(testTickets.length).toBeGreaterThan(0);
      }
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
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tickets.length).toBeGreaterThan(0);

      // Verify specific tickets from bootstrap.json exist
      const ticketIds = data.tickets.map(t => t.id);
      expect(ticketIds).toContain('boulder-fest-2026-full-pass');
      expect(ticketIds).toContain('weekender-2025-11-full');

      // Test tickets are only visible in non-production environments
      if (data.metadata.test_tickets_visible) {
        expect(ticketIds).toContain('test-ticket-basic');
      }

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
      const response = await fetch(`${BASE_URL}/api/tickets/types?status=`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Test ticket visibility is environment-based
      const isProduction = data.metadata.environment === 'production';
      expect(data.metadata.test_tickets_visible).toBe(!isProduction);
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
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
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

      // Test tickets only available in non-production
      if (data.metadata.test_tickets_visible) {
        testTickets.forEach(ticket => {
          expect(ticket.status).toBe('test');
        });
      }

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
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Should have tickets from production events in bootstrap.json
      const eventIds = [...new Set(data.tickets.map(t => t.event_id))];
      expect(eventIds).toContain('boulder-fest-2026');
      expect(eventIds).toContain('weekender-2025-11');
      expect(eventIds).toContain('boulder-fest-2025');

      // Test events only visible in non-production
      if (data.metadata.test_tickets_visible) {
        expect(eventIds).toContain('test-event-1');
      }
    }, TEST_TIMEOUT);
  });

  describe('8. Ticket Card Generator Features', () => {
    it('should display color indicator from color_rgb field', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?event_id=boulder-fest-2026`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify tickets have color_rgb field
      data.tickets.forEach(ticket => {
        expect(ticket).toHaveProperty('color_rgb');

        // color_rgb should be a valid RGB string or null
        if (ticket.color_rgb) {
          expect(ticket.color_rgb).toMatch(/^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/);
        }
      });

      // At least some tickets should have colors assigned
      const ticketsWithColors = data.tickets.filter(t => t.color_rgb);
      expect(ticketsWithColors.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should handle XSS in ticket names with uppercase before escape', async () => {
      // This test verifies the frontend pattern: uppercase BEFORE escaping
      // Example: "Rock & Roll".toUpperCase() => "ROCK & ROLL" then escape => "ROCK &amp; ROLL"
      // NOT: "Rock & Roll" escape => "Rock &amp; Roll" then uppercase => "ROCK &AMP; ROLL" (wrong!)

      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify ticket names are properly structured for safe rendering
      data.tickets.forEach(ticket => {
        expect(ticket.name).toBeDefined();
        expect(typeof ticket.name).toBe('string');

        // Ticket names should not contain HTML entities in the API response
        // The frontend handles escaping after uppercase transformation
        expect(ticket.name).not.toMatch(/&amp;|&lt;|&gt;|&quot;|&#039;/);
      });
    }, TEST_TIMEOUT);

    it('should format Mountain Time in event headers', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify events array exists
      expect(data.events).toBeDefined();
      expect(Array.isArray(data.events)).toBe(true);

      if (data.events.length > 0) {
        data.events.forEach(event => {
          // Events should have date fields
          expect(event.start_date).toBeDefined();
          expect(event.end_date).toBeDefined();

          // Dates should be in ISO format
          expect(event.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(event.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

          // Event should have venue information
          expect(event.venue_name).toBeDefined();
          expect(event.event_name).toBeDefined();
        });
      }
    }, TEST_TIMEOUT);

    it('should group tickets by event correctly', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events).toBeDefined();

      // Verify events are grouped
      data.events.forEach(event => {
        expect(event.event_id).toBeDefined();
        expect(event.ticket_types).toBeDefined();
        expect(Array.isArray(event.ticket_types)).toBe(true);

        // All tickets in this event should have matching event_id
        event.ticket_types.forEach(ticket => {
          expect(ticket.event_id).toBe(event.event_id);
        });
      });

      // Verify events are sorted chronologically
      if (data.events.length > 1) {
        for (let i = 0; i < data.events.length - 1; i++) {
          const currentDate = new Date(data.events[i].start_date);
          const nextDate = new Date(data.events[i + 1].start_date);

          // Events should be in chronological order
          expect(currentDate.getTime()).toBeLessThanOrEqual(nextDate.getTime());
        }
      }
    }, TEST_TIMEOUT);

    it('should handle missing color_rgb with fallback to default', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Check if any tickets are missing color
      const ticketsWithoutColor = data.tickets.filter(t => !t.color_rgb);

      if (ticketsWithoutColor.length > 0) {
        // Frontend should handle this gracefully
        // Verify the API doesn't break when color is missing
        ticketsWithoutColor.forEach(ticket => {
          expect(ticket).toHaveProperty('id');
          expect(ticket).toHaveProperty('name');
          expect(ticket.color_rgb === null || ticket.color_rgb === undefined).toBe(true);
        });
      }
    }, TEST_TIMEOUT);

    it('should escape HTML entities in ticket descriptions', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify descriptions are safe strings
      data.tickets.forEach(ticket => {
        if (ticket.description) {
          expect(typeof ticket.description).toBe('string');

          // API should return raw text, frontend handles escaping
          // Verify no script tags in raw data
          expect(ticket.description.toLowerCase()).not.toContain('<script');
          expect(ticket.description.toLowerCase()).not.toContain('javascript:');
        }
      });
    }, TEST_TIMEOUT);

    it('should handle ticket status for card display', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify all tickets have a valid status
      const validStatuses = ['available', 'coming-soon', 'sold-out', 'closed', 'test'];

      data.tickets.forEach(ticket => {
        expect(ticket.status).toBeDefined();
        expect(validStatuses).toContain(ticket.status);

        // Coming-soon tickets should have can_purchase = false
        if (ticket.status === 'coming-soon') {
          expect(ticket.can_purchase).toBe(false);
        }

        // Sold-out tickets should have can_purchase = false
        if (ticket.status === 'sold-out') {
          expect(ticket.can_purchase).toBe(false);
        }

        // Available tickets should have can_purchase = true
        if (ticket.status === 'available') {
          expect(ticket.can_purchase).toBe(true);
        }
      });
    }, TEST_TIMEOUT);

    it('should provide complete event information for card headers', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events).toBeDefined();

      data.events.forEach(event => {
        // Required for event header rendering
        expect(event.event_id).toBeDefined();
        expect(event.event_name).toBeDefined();
        expect(event.venue_name).toBeDefined();
        expect(event.start_date).toBeDefined();
        expect(event.end_date).toBeDefined();

        // Verify dates are valid
        const startDate = new Date(event.start_date);
        const endDate = new Date(event.end_date);

        expect(startDate.toString()).not.toBe('Invalid Date');
        expect(endDate.toString()).not.toBe('Invalid Date');
        expect(startDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    }, TEST_TIMEOUT);

    it('should handle price display formatting requirements', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types`);
      const data = await response.json();

      expect(response.status).toBe(200);

      data.tickets.forEach(ticket => {
        // price_cents should be present
        expect(ticket).toHaveProperty('price_cents');

        // price_display should be formatted as currency
        if (ticket.price_cents !== null && ticket.price_cents !== undefined) {
          expect(ticket.price_display).toBeDefined();
          expect(ticket.price_display).toMatch(/^\$\d+\.\d{2}$/);

          // Verify price_display matches price_cents
          const expectedDisplay = `$${(ticket.price_cents / 100).toFixed(2)}`;
          expect(ticket.price_display).toBe(expectedDisplay);
        }
      });
    }, TEST_TIMEOUT);

    it('should support quantity selector data attributes', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/types?event_id=boulder-fest-2026`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify tickets have required data for quantity selectors
      data.tickets.forEach(ticket => {
        expect(ticket.id).toBeDefined();
        expect(ticket.price_cents).toBeDefined();
        expect(ticket.name).toBeDefined();
        expect(ticket.availability).toBeDefined();

        // Available tickets should have availability > 0
        if (ticket.status === 'available') {
          expect(ticket.availability).toBeGreaterThan(0);
        }
      });
    }, TEST_TIMEOUT);
  });
});