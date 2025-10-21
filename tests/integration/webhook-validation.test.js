/**
 * Webhook Validation Integration Tests
 * Tests metadata tampering detection, price manipulation detection
 * Tests sold-out ticket purchase rejection, flagged_for_review status
 * Tests security alerts triggered, audit logs created
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { bootstrapService } from '../../lib/bootstrap-service.js';
import { createOrRetrieveTickets } from '../../lib/ticket-creation-service.js';
import { createTestEvent } from './handler-test-helper.js';

describe('Webhook Validation Integration Tests', () => {
  let db;
  let testEventId;
  let testTicketTypeId;
  const startTime = Date.now();

  beforeEach(async () => {
    db = await getDbClient();

    // Ensure bootstrap is applied
    await bootstrapService.initialize();

    // Create active event for validation testing (not 'test' status to trigger real validation)
    testEventId = await createTestEvent(db, {
      slug: `webhook-test-event-${Date.now()}`,
      name: 'Webhook Test Event',
      status: 'active' // Use 'active' to ensure validation runs properly
    });

    // Create available ticket type for this event (not 'test' to trigger validation)
    testTicketTypeId = `test-ticket-${Date.now()}`;
    await db.execute({
      sql: `
        INSERT INTO ticket_types (
          id, event_id, name, price_cents, status, max_quantity, sold_count,
          event_date, event_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        testTicketTypeId,
        testEventId,
        'Test Weekender Ticket',
        6500,
        'available', // Use 'available' to ensure validation runs
        100,
        0,
        '2025-11-08',
        '19:00'
      ]
    });

  });

  test('metadata tampering detection: invalid ticket type', async () => {
    const testStart = Date.now();

    const sessionId = `cs_val_tamper1_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'tamper1@example.com',
        name: 'Tamper Test 1'
      },
      metadata: {
        event_id: String(testEventId),
        testMode: 'true'
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 6500,
            price: {
              unit_amount: 6500,
              product: {
                metadata: {
                  ticket_type: 'INVALID-TICKET-TYPE', // Tampered metadata
                  event_id: String(testEventId),
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    // Should throw error or create flagged ticket
    try {
      await createOrRetrieveTickets(mockStripeSession);
      // If no error, should have created flagged tickets
      throw new Error('Expected validation error for invalid ticket type');
    } catch (error) {
      // Verify error message indicates ticket type issue
      expect(error.message).toMatch(/ticket type|does not exist|FOREIGN KEY/i);
    }

    // Verify audit log created for security event (use created_at not timestamp)
    const auditResult = await db.execute({
      sql: `SELECT * FROM audit_logs
            WHERE action = ? AND target_id = ?
            ORDER BY created_at DESC LIMIT 1`,
      args: ['WEBHOOK_METADATA_VALIDATION_FAILED', sessionId]
    });

    expect(auditResult.rows.length).toBeGreaterThan(0);
    const auditLog = auditResult.rows[0];
    expect(auditLog.severity).toBe('critical');
    // metadata is stored as JSON string, parse it first
    const metadata = JSON.parse(auditLog.metadata || '{}');
    expect(metadata.ticket_type).toBe('INVALID-TICKET-TYPE');

    console.log(`✓ Metadata tampering detection (invalid ticket type) test completed in ${Date.now() - testStart}ms`);
  });

  test('price manipulation detection: price mismatch', async () => {
    const testStart = Date.now();

    const sessionId = `cs_validation_price_${Date.now()}`;

    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 100, // Tampered: claiming $1.00 instead of $65.00
      currency: 'usd',
      customer_details: {
        email: 'price-tamper@example.com',
        name: 'Price Tamper Test'
      },
      metadata: {
        event_id: String(testEventId)
        // NO testMode field - ensures validation runs
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 100, // Tampered price (real price: 6500 cents)
            price: {
              unit_amount: 100, // Tampered price
              product: {
                metadata: {
                  ticket_type: testTicketTypeId,
                  event_id: String(testEventId),
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    // Should create tickets but flag for review
    const result = await createOrRetrieveTickets(mockStripeSession);

    // Query all data after ticket creation
    // Execute all queries in parallel for efficiency
    const [ticketsResult, auditResult, alertResult] = await Promise.all([
      db.execute({
        sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
        args: [result.transaction.id]
      }),
      db.execute({
        sql: `SELECT * FROM audit_logs
              WHERE action = ? AND target_id = ?
              ORDER BY created_at DESC LIMIT 1`,
        args: ['WEBHOOK_METADATA_VALIDATION_FAILED', sessionId]
      }),
      db.execute({
        sql: `SELECT * FROM security_alerts
              WHERE alert_type = ? AND severity = ? AND correlation_id = ?
              ORDER BY created_at DESC LIMIT 1`,
        args: ['webhook_metadata_tampering', 'critical', sessionId]
      })
    ]);

    // Verify tickets created with flagged_for_review status
    expect(ticketsResult.rows.length).toBe(1);
    const ticket = ticketsResult.rows[0];
    expect(ticket.status).toBe('flagged_for_review');

    // Verify metadata contains validation errors
    const metadata = JSON.parse(ticket.ticket_metadata || '{}');
    expect(metadata.validation).toBeDefined();
    expect(metadata.validation.passed).toBe(false);
    expect(Array.isArray(metadata.validation.errors)).toBe(true);
    expect(metadata.validation.errors.some(err => /price mismatch/i.test(err))).toBe(true);

    // Verify audit log created
    expect(auditResult.rows.length).toBeGreaterThan(0);
    expect(auditResult.rows[0].severity).toBe('critical');

    // Verify security alert triggered
    expect(alertResult.rows.length).toBeGreaterThan(0);
    const alert = alertResult.rows[0];
    expect(alert.title).toMatch(/metadata tampering/i);
    expect(alert.evidence).toContain(sessionId);

    console.log(`✓ Price manipulation detection test completed in ${Date.now() - testStart}ms`);
  });

  test('sold-out ticket purchase rejection: quantity exceeds availability', async () => {
    const testStart = Date.now();

    const ticketTypeId = 'basic-pass';
    const maxQuantity = 2;

    // Create ticket type for this test
    await db.execute({
      sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, status, max_quantity, sold_count, event_date, event_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET max_quantity = excluded.max_quantity, sold_count = excluded.sold_count`,
      args: [ticketTypeId, testEventId, 'Basic Pass', 100, 'available', maxQuantity, maxQuantity, '2024-01-01', '19:00']
    });

    const sessionId = `cs_validation_soldout_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 100,
      currency: 'usd',
      customer_details: {
        email: 'soldout@example.com',
        name: 'SoldOut Test'
      },
      metadata: {
        event_id: String(testEventId)
        // NO testMode - ensures validation runs
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 100,
            price: {
              unit_amount: 100,
              product: {
                metadata: {
                  ticket_type: ticketTypeId,
                  event_id: String(testEventId),
                  event_date: '2024-01-01'
                }
              }
            }
          }
        ]
      }
    };

    // Should create tickets but flag for review
    const result = await createOrRetrieveTickets(mockStripeSession);

    // Verify tickets flagged
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(ticketsResult.rows.length).toBe(1);
    expect(ticketsResult.rows[0].status).toBe('flagged_for_review');

    // Verify validation errors mention quantity
    const metadata = JSON.parse(ticketsResult.rows[0].ticket_metadata || '{}');
    expect(Array.isArray(metadata.validation.errors)).toBe(true);
    expect(metadata.validation.errors.some(err => /quantity|available/i.test(err))).toBe(true);

    console.log(`✓ Sold-out ticket rejection test completed in ${Date.now() - testStart}ms`);
  });

  test('flagged_for_review status creation for validation failures', async () => {
    const testStart = Date.now();

    const sessionId = `cs_validation_flagged_${Date.now()}`;

    // Create session with price mismatch to trigger flagged status
    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 1000, // Tampered price (real: 6500)
      currency: 'usd',
      customer_details: {
        email: 'flagged@example.com',
        name: 'Flagged Test'
      },
      metadata: {
        event_id: String(testEventId)
        // NO testMode - ensures validation runs
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 1000, // Tampered price
            price: {
              unit_amount: 1000, // Tampered price
              product: {
                metadata: {
                  ticket_type: testTicketTypeId,
                  event_id: String(testEventId),
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    // Should create tickets with flagged status
    const result = await createOrRetrieveTickets(mockStripeSession);

    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(ticketsResult.rows.length).toBe(1);
    const ticket = ticketsResult.rows[0];

    // Verify flagged_for_review status
    expect(ticket.status).toBe('flagged_for_review');

    // Verify metadata contains detailed validation info
    const metadata = JSON.parse(ticket.ticket_metadata);
    expect(metadata.validation).toBeDefined();
    expect(metadata.validation.passed).toBe(false);
    expect(metadata.validation.errors.length).toBeGreaterThan(0);
    expect(metadata.validation.timestamp).toBeDefined();
    expect(metadata.validation.stripe_session_id).toBe(sessionId);

    console.log(`✓ flagged_for_review status creation test completed in ${Date.now() - testStart}ms`);
  });

  test('security alerts triggered for critical validation failures', async () => {
    const testStart = Date.now();

    const sessionId = `cs_validation_alert_${Date.now()}`;

    // Simulate critical validation failure
    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 10, // Severely tampered price
      currency: 'usd',
      customer_details: {
        email: 'critical-alert@example.com',
        name: 'Critical Alert Test'
      },
      metadata: {
        event_id: String(testEventId)
        // NO testMode - ensures validation runs
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 10,
            price: {
              unit_amount: 10,
              product: {
                metadata: {
                  ticket_type: testTicketTypeId,
                  event_id: String(testEventId),
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    // Create tickets and query security alert
    const result = await createOrRetrieveTickets(mockStripeSession);

    // Query security alert after ticket creation
    const alertResult = await db.execute({
      sql: `SELECT * FROM security_alerts
            WHERE alert_type = ? AND correlation_id = ?
            ORDER BY created_at DESC LIMIT 1`,
      args: ['webhook_metadata_tampering', sessionId]
    });

    expect(alertResult.rows.length).toBeGreaterThan(0);
    const alert = alertResult.rows[0];

    expect(alert.severity).toBe('critical');
    expect(alert.title).toMatch(/metadata tampering/i);
    expect(alert.description).toBeDefined();
    expect(alert.evidence).toContain(sessionId);
    expect(alert.indicators).toContain('price_manipulation');
    expect(alert.correlation_id).toBe(sessionId);

    // Verify affected resources recorded
    expect(alert.affected_resources).toContain(sessionId);

    console.log(`✓ Security alerts test completed in ${Date.now() - testStart}ms`);
  });

  test('audit logs created for all validation attempts', async () => {
    const testStart = Date.now();

    const sessionId = `cs_val_audit_${Date.now()}`;

    // Valid session (should pass validation)
    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'audit@example.com',
        name: 'Audit Test'
      },
      metadata: {
        event_id: String(testEventId),
        testMode: 'true'
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 6500,
            price: {
              unit_amount: 6500,
              product: {
                metadata: {
                  ticket_type: testTicketTypeId,
                  event_id: String(testEventId),
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    await createOrRetrieveTickets(mockStripeSession);

    // Verify audit log created for PASSED validation
    const auditResult = await db.execute({
      sql: `SELECT * FROM audit_logs
            WHERE action = ? AND target_id = ?
            ORDER BY created_at DESC LIMIT 1`,
      args: ['WEBHOOK_METADATA_VALIDATION_PASSED', sessionId]
    });

    expect(auditResult.rows.length).toBeGreaterThan(0);
    const auditLog = auditResult.rows[0];

    expect(auditLog.severity).toBe('info');
    expect(auditLog.target_type).toBe('stripe_webhook_validation');
    expect(auditLog.target_id).toBe(sessionId);

    // Verify detailed metadata
    const metadata = JSON.parse(auditLog.metadata || '{}');
    expect(metadata.ticket_type).toBe(testTicketTypeId);
    expect(metadata.quantity).toBe(1);
    expect(metadata.price_cents).toBe(6500);
    expect(metadata.validation_errors).toEqual([]);

    console.log(`✓ Audit logs test completed in ${Date.now() - testStart}ms`);
  });

  test('event_id mismatch detection', async () => {
    const testStart = Date.now();

    // Create a second event to validate event ID mismatch
    const wrongEventId = await createTestEvent(db, {
      slug: `wrong-event-${Date.now()}`,
      name: 'Wrong Event',
      status: 'active' // Use 'active' to ensure validation runs
    });

    const sessionId = `cs_validation_event_mismatch_${Date.now()}`;

    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'event-mismatch@example.com',
        name: 'Event Mismatch Test'
      },
      metadata: {
        event_id: String(wrongEventId) // Wrong event ID in session metadata
        // NO testMode - validation must run to detect event_id mismatch
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 6500,
            price: {
              unit_amount: 6500,
              product: {
                metadata: {
                  ticket_type: testTicketTypeId, // Belongs to testEventId
                  event_id: String(wrongEventId), // Wrong event in product metadata - should mismatch ticket's event
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    const result = await createOrRetrieveTickets(mockStripeSession);

    // Verify tickets flagged
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(ticketsResult.rows[0].status).toBe('flagged_for_review');

    // Verify validation error mentions event_id mismatch
    const metadata = JSON.parse(ticketsResult.rows[0].ticket_metadata);
    expect(Array.isArray(metadata.validation.errors)).toBe(true);
    expect(metadata.validation.errors.some(err => /event.*mismatch/i.test(err))).toBe(true);

    console.log(`✓ Event ID mismatch detection test completed in ${Date.now() - testStart}ms`);
  });

  test('inactive event rejection', async () => {
    const testStart = Date.now();

    const sessionId = `cs_validation_inactive_${Date.now()}`;

    // Create a separate event for this test and set it to inactive
    const inactiveEventId = await createTestEvent(db, {
      slug: `inactive-event-${Date.now()}`,
      name: 'Inactive Event Test',
      status: 'cancelled'
    });

    // Create a ticket type for the inactive event
    const inactiveTicketTypeId = `inactive-ticket-${Date.now()}`;
    await db.execute({
      sql: `
        INSERT INTO ticket_types (
          id, event_id, name, price_cents, status, max_quantity, sold_count,
          event_date, event_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        inactiveTicketTypeId,
        inactiveEventId,
        'Inactive Event Ticket',
        500,
        'available', // Use 'available' to ensure validation runs
        100,
        0,
        '2024-01-01',
        '19:00'
      ]
    });

    const mockStripeSession = {
      id: sessionId,
      created: Math.floor(Date.now() / 1000), // Stripe timestamp
      amount_total: 500,
      currency: 'usd',
      customer_details: {
        email: 'inactive@example.com',
        name: 'Inactive Event Test'
      },
      metadata: {
        event_id: String(inactiveEventId)
        // NO testMode - validation must run to detect inactive event
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 500,
            price: {
              unit_amount: 500,
              product: {
                metadata: {
                  ticket_type: inactiveTicketTypeId,
                  event_id: String(inactiveEventId),
                  event_date: '2024-01-01'
                }
              }
            }
          }
        ]
      }
    };

    const result = await createOrRetrieveTickets(mockStripeSession);

    // Verify tickets flagged
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(ticketsResult.rows[0].status).toBe('flagged_for_review');

    // Verify validation error mentions inactive event (validation checks for 'active' or 'test')
    const metadata = JSON.parse(ticketsResult.rows[0].ticket_metadata);
    expect(Array.isArray(metadata.validation.errors)).toBe(true);
    expect(metadata.validation.errors.some(err => /event.*not active or test/i.test(err))).toBe(true);

    console.log(`✓ Inactive event rejection test completed in ${Date.now() - testStart}ms`);
  });

  // Report total test execution time
  test('report total execution time', () => {
    const totalTime = Date.now() - startTime;
    console.log(`\n📊 Webhook Validation Test Suite: ${totalTime}ms total`);
    expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
  });
});