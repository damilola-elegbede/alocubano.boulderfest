/**
 * Admin Bootstrap Integration Tests
 * Tests admin dashboard displays bootstrap data correctly
 * Verifies real-time sold_count shown, availability indicators work
 * Tests ticket types grouped by event
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { bootstrapService } from '../../lib/bootstrap-service.js';
import { createOrRetrieveTickets } from '../../lib/ticket-creation-service.js';

describe('Admin Bootstrap Integration Tests', () => {
  let db;
  const startTime = Date.now();

  beforeEach(async () => {
    db = await getDbClient();

    // Ensure bootstrap is applied
    await bootstrapService.initialize();
  });

  test('admin dashboard displays bootstrap data correctly', async () => {
    const testStart = Date.now();

    // Query for dashboard data (simulating admin endpoint)
    const eventsResult = await db.execute({
      sql: `SELECT e.*, COUNT(DISTINCT tt.id) as ticket_type_count
            FROM events e
            LEFT JOIN ticket_types tt ON e.id = tt.event_id
            WHERE e.status != 'test'
            GROUP BY e.id
            ORDER BY e.display_order`,
      args: []
    });

    expect(eventsResult.rows.length).toBeGreaterThan(0);

    // Verify events have correct data
    for (const event of eventsResult.rows) {
      expect(event.name).toBeDefined();
      expect(event.slug).toBeDefined();
      expect(event.type).toBeDefined();
      expect(event.start_date).toBeDefined();
      expect(event.display_order).toBeDefined();

      // Verify ticket_type_count calculated
      expect(event.ticket_type_count).toBeGreaterThanOrEqual(0);
    }

    // Verify featured events
    const featuredEvents = eventsResult.rows.filter(e => {
      const config = JSON.parse(e.config || '{}');
      return config.is_featured === true;
    });

    expect(featuredEvents.length).toBeGreaterThan(0);

    console.log(`✓ Admin dashboard data test completed in ${Date.now() - testStart}ms`);
  });

  test('real-time sold_count shown correctly in admin view', async () => {
    const testStart = Date.now();

    const ticketTypeId = '2025-11-weekender-full';

    // Get initial sold_count
    const initialResult = await db.execute({
      sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
      args: [ticketTypeId]
    });
    const initialSoldCount = initialResult.rows[0].sold_count || 0;

    // Simulate a purchase
    const sessionId = `cs_test_admin_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      amount_total: 13000, // 2 tickets * 6500
      currency: 'usd',
      customer_details: {
        email: 'admin-test@example.com',
        name: 'Admin Test'
      },
      metadata: {
        event_id: '5',
        testMode: 'true'
      },
      line_items: {
        data: [
          {
            quantity: 2,
            amount_total: 13000,
            price: {
              unit_amount: 6500,
              product: {
                metadata: {
                  ticket_type: ticketTypeId,
                  event_id: '5',
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    await createOrRetrieveTickets(mockStripeSession);

    // Query sold_count as admin would see it
    const adminViewResult = await db.execute({
      sql: `SELECT
              tt.id,
              tt.name,
              tt.price_cents,
              tt.max_quantity,
              tt.sold_count,
              tt.status,
              (tt.max_quantity - tt.sold_count) as available_quantity,
              CASE
                WHEN tt.max_quantity IS NULL THEN 'unlimited'
                WHEN tt.sold_count >= tt.max_quantity THEN 'sold_out'
                WHEN (tt.max_quantity - tt.sold_count) <= 10 THEN 'low'
                ELSE 'available'
              END as availability_status
            FROM ticket_types tt
            WHERE tt.id = ?`,
      args: [ticketTypeId]
    });

    expect(adminViewResult.rows.length).toBe(1);
    const adminView = adminViewResult.rows[0];

    // Verify sold_count updated
    expect(adminView.sold_count).toBe(initialSoldCount + 2);

    // Verify availability calculations
    if (adminView.max_quantity) {
      expect(adminView.available_quantity).toBe(adminView.max_quantity - adminView.sold_count);
    }

    console.log(`✓ Real-time sold_count test completed in ${Date.now() - testStart}ms`);
  });

  test('availability indicators work correctly', async () => {
    const testStart = Date.now();

    const ticketTypeId = 'test-basic';

    // Set up different availability scenarios
    const scenarios = [
      { max_quantity: 100, sold_count: 50, expected: 'available' },
      { max_quantity: 100, sold_count: 95, expected: 'low' },
      { max_quantity: 100, sold_count: 100, expected: 'sold_out' },
      { max_quantity: null, sold_count: 0, expected: 'unlimited' }
    ];

    for (const scenario of scenarios) {
      // Update ticket type
      await db.execute({
        sql: 'UPDATE ticket_types SET max_quantity = ?, sold_count = ? WHERE id = ?',
        args: [scenario.max_quantity, scenario.sold_count, ticketTypeId]
      });

      // Query availability status
      const result = await db.execute({
        sql: `SELECT
                id,
                max_quantity,
                sold_count,
                CASE
                  WHEN max_quantity IS NULL THEN 'unlimited'
                  WHEN sold_count >= max_quantity THEN 'sold_out'
                  WHEN (max_quantity - sold_count) <= 10 THEN 'low'
                  ELSE 'available'
                END as availability_status
              FROM ticket_types
              WHERE id = ?`,
        args: [ticketTypeId]
      });

      expect(result.rows[0].availability_status).toBe(scenario.expected);
    }

    console.log(`✓ Availability indicators test completed in ${Date.now() - testStart}ms`);
  });

  test('ticket types grouped by event for admin display', async () => {
    const testStart = Date.now();

    // Query ticket types grouped by event
    const groupedResult = await db.execute({
      sql: `SELECT
              e.id as event_id,
              e.name as event_name,
              e.slug as event_slug,
              e.start_date,
              e.end_date,
              e.status as event_status,
              tt.id as ticket_type_id,
              tt.name as ticket_type_name,
              tt.price_cents,
              tt.sold_count,
              tt.max_quantity,
              tt.status as ticket_status,
              tt.display_order
            FROM events e
            LEFT JOIN ticket_types tt ON e.id = tt.event_id
            WHERE e.status != 'test' AND (tt.status IS NULL OR tt.status != 'test')
            ORDER BY e.display_order, tt.display_order`,
      args: []
    });

    // Group results by event
    const eventMap = {};
    for (const row of groupedResult.rows) {
      const eventId = row.event_id;

      if (!eventMap[eventId]) {
        eventMap[eventId] = {
          event_id: row.event_id,
          event_name: row.event_name,
          event_slug: row.event_slug,
          start_date: row.start_date,
          end_date: row.end_date,
          event_status: row.event_status,
          ticket_types: []
        };
      }

      if (row.ticket_type_id) {
        eventMap[eventId].ticket_types.push({
          ticket_type_id: row.ticket_type_id,
          ticket_type_name: row.ticket_type_name,
          price_cents: row.price_cents,
          sold_count: row.sold_count,
          max_quantity: row.max_quantity,
          ticket_status: row.ticket_status
        });
      }
    }

    // Verify grouping worked
    const events = Object.values(eventMap);
    expect(events.length).toBeGreaterThan(0);

    // Verify each event has ticket types
    for (const event of events) {
      expect(event.event_name).toBeDefined();
      expect(event.event_slug).toBeDefined();

      if (event.ticket_types.length > 0) {
        // Verify ticket types are properly associated
        for (const ticketType of event.ticket_types) {
          expect(ticketType.ticket_type_id).toBeDefined();
          expect(ticketType.ticket_type_name).toBeDefined();
        }
      }
    }

    console.log(`✓ Ticket types grouped by event test completed in ${Date.now() - testStart}ms`);
  });

  test('admin view shows ticket sales statistics', async () => {
    const testStart = Date.now();

    // Create some test purchases
    const ticketTypeId = '2025-11-weekender-class';

    for (let i = 0; i < 3; i++) {
      const sessionId = `cs_test_stats_${Date.now()}_${i}`;
      const mockStripeSession = {
        id: sessionId,
        amount_total: 2500,
        currency: 'usd',
        customer_details: {
          email: `stats${i}@example.com`,
          name: `Stats Test ${i}`
        },
        metadata: {
          event_id: '5',
          testMode: 'true'
        },
        line_items: {
          data: [
            {
              quantity: 1,
              amount_total: 2500,
              price: {
                unit_amount: 2500,
                product: {
                  metadata: {
                    ticket_type: ticketTypeId,
                    event_id: '5',
                    event_date: '2025-11-08'
                  }
                }
              }
            }
          ]
        }
      };

      await createOrRetrieveTickets(mockStripeSession);
    }

    // Query sales statistics
    const statsResult = await db.execute({
      sql: `SELECT
              tt.id,
              tt.name,
              tt.price_cents,
              tt.sold_count,
              tt.max_quantity,
              (tt.sold_count * tt.price_cents) as total_revenue_cents,
              CASE
                WHEN tt.max_quantity IS NULL THEN 0
                ELSE ROUND((CAST(tt.sold_count AS FLOAT) / tt.max_quantity) * 100, 2)
              END as sales_percentage
            FROM ticket_types tt
            WHERE tt.id = ?`,
      args: [ticketTypeId]
    });

    expect(statsResult.rows.length).toBe(1);
    const stats = statsResult.rows[0];

    // Verify statistics calculated correctly
    expect(stats.sold_count).toBe(3);
    expect(stats.total_revenue_cents).toBe(3 * 2500);

    console.log(`✓ Admin sales statistics test completed in ${Date.now() - testStart}ms`);
  });

  test('admin view shows coming-soon tickets separately', async () => {
    const testStart = Date.now();

    // Query coming-soon tickets
    const comingSoonResult = await db.execute({
      sql: `SELECT
              e.name as event_name,
              tt.id,
              tt.name,
              tt.description,
              tt.status,
              tt.price_cents
            FROM ticket_types tt
            JOIN events e ON tt.event_id = e.id
            WHERE tt.status = 'coming-soon'
            ORDER BY e.display_order, tt.display_order`,
      args: []
    });

    expect(comingSoonResult.rows.length).toBeGreaterThan(0);

    // Verify coming-soon tickets have no price
    for (const ticket of comingSoonResult.rows) {
      expect(ticket.status).toBe('coming-soon');
      expect(ticket.price_cents).toBeNull();
      expect(ticket.name).toBeDefined();
    }

    // Query available tickets separately
    const availableResult = await db.execute({
      sql: `SELECT COUNT(*) as count
            FROM ticket_types
            WHERE status = 'available' AND price_cents IS NOT NULL`,
      args: []
    });

    expect(availableResult.rows[0].count).toBeGreaterThan(0);

    console.log(`✓ Coming-soon tickets display test completed in ${Date.now() - testStart}ms`);
  });

  test('admin dashboard shows event timeline', async () => {
    const testStart = Date.now();

    // Query events with timeline information
    const timelineResult = await db.execute({
      sql: `SELECT
              e.id,
              e.name,
              e.start_date,
              e.end_date,
              e.status,
              e.type,
              e.display_order,
              CASE
                WHEN date(e.start_date) > date('now') THEN 'upcoming'
                WHEN date(e.end_date) < date('now') THEN 'past'
                ELSE 'ongoing'
              END as timeline_status,
              julianday(e.start_date) - julianday('now') as days_until_start
            FROM events e
            WHERE e.status != 'test'
            ORDER BY e.start_date DESC`,
      args: []
    });

    expect(timelineResult.rows.length).toBeGreaterThan(0);

    // Verify timeline calculations
    for (const event of timelineResult.rows) {
      expect(event.timeline_status).toMatch(/upcoming|past|ongoing/);
      expect(typeof event.days_until_start).toBe('number');

      // Verify status matches timeline
      if (event.status === 'completed') {
        expect(event.timeline_status).toBe('past');
      }
    }

    console.log(`✓ Event timeline test completed in ${Date.now() - testStart}ms`);
  });

  test('admin view shows revenue by event', async () => {
    const testStart = Date.now();

    // Create test purchases for different events
    const purchases = [
      { ticket_type: '2025-11-weekender-full', event_id: '5', price: 6500 },
      { ticket_type: '2025-11-weekender-class', event_id: '5', price: 2500 }
    ];

    for (const purchase of purchases) {
      const sessionId = `cs_test_revenue_${Date.now()}_${purchase.ticket_type}`;
      const mockStripeSession = {
        id: sessionId,
        amount_total: purchase.price,
        currency: 'usd',
        customer_details: {
          email: 'revenue@example.com',
          name: 'Revenue Test'
        },
        metadata: {
          event_id: purchase.event_id,
          testMode: 'true'
        },
        line_items: {
          data: [
            {
              quantity: 1,
              amount_total: purchase.price,
              price: {
                unit_amount: purchase.price,
                product: {
                  metadata: {
                    ticket_type: purchase.ticket_type,
                    event_id: purchase.event_id,
                    event_date: '2025-11-08'
                  }
                }
              }
            }
          ]
        }
      };

      await createOrRetrieveTickets(mockStripeSession);
    }

    // Query revenue by event
    const revenueResult = await db.execute({
      sql: `SELECT
              e.id as event_id,
              e.name as event_name,
              COUNT(DISTINCT t.ticket_id) as total_tickets_sold,
              SUM(t.price_cents) as total_revenue_cents
            FROM events e
            JOIN tickets t ON e.id = t.event_id
            WHERE e.status != 'test'
            GROUP BY e.id, e.name
            ORDER BY total_revenue_cents DESC`,
      args: []
    });

    expect(revenueResult.rows.length).toBeGreaterThan(0);

    // Verify revenue calculations
    for (const event of revenueResult.rows) {
      expect(event.event_name).toBeDefined();
      expect(event.total_tickets_sold).toBeGreaterThan(0);
      expect(event.total_revenue_cents).toBeGreaterThan(0);
    }

    console.log(`✓ Revenue by event test completed in ${Date.now() - testStart}ms`);
  });

  // Report total test execution time
  test('report total execution time', () => {
    const totalTime = Date.now() - startTime;
    console.log(`\n📊 Admin Bootstrap Integration Test Suite: ${totalTime}ms total`);
    expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
  });
});