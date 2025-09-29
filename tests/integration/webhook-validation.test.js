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

describe('Webhook Validation Integration Tests', () => {
  let db;
  const startTime = Date.now();

  beforeEach(async () => {
    db = await getDbClient();

    // Ensure bootstrap is applied
    await bootstrapService.initialize();
  });

  test('metadata tampering detection: invalid ticket type', async () => {
    const testStart = Date.now();

    const sessionId = `cs_test_tamper1_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'tamper1@example.com',
        name: 'Tamper Test 1'
      },
      metadata: {
        event_id: '5',
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
                  event_id: '5',
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
      expect(error.message).toMatch(/ticket type|does not exist/i);
    }

    // Verify audit log created for security event
    const auditResult = await db.execute({
      sql: `SELECT * FROM audit_logs
            WHERE action = ? AND target_id = ?
            ORDER BY timestamp DESC LIMIT 1`,
      args: ['WEBHOOK_METADATA_VALIDATION_FAILED', sessionId]
    });

    expect(auditResult.rows.length).toBeGreaterThan(0);
    const auditLog = auditResult.rows[0];
    expect(auditLog.severity).toBe('critical');
    expect(auditLog.details).toContain('INVALID-TICKET-TYPE');

    console.log(`✓ Metadata tampering detection (invalid ticket type) test completed in ${Date.now() - testStart}ms`);
  });

  test('price manipulation detection: price mismatch', async () => {
    const testStart = Date.now();

    const ticketTypeId = '2025-11-weekender-full'; // Real price: 6500 cents
    const sessionId = `cs_test_price_${Date.now()}`;

    const mockStripeSession = {
      id: sessionId,
      amount_total: 100, // Tampered: claiming $1.00 instead of $65.00
      currency: 'usd',
      customer_details: {
        email: 'price-tamper@example.com',
        name: 'Price Tamper Test'
      },
      metadata: {
        event_id: '5',
        testMode: 'false' // Not a test - price validation should trigger
      },
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 100, // Tampered price
            price: {
              unit_amount: 100, // Tampered price
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

    // Should create tickets but flag for review
    const result = await createOrRetrieveTickets(mockStripeSession);

    // Verify tickets created with flagged_for_review status
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(ticketsResult.rows.length).toBe(1);
    const ticket = ticketsResult.rows[0];
    expect(ticket.status).toBe('flagged_for_review');

    // Verify metadata contains validation errors
    const metadata = JSON.parse(ticket.ticket_metadata || '{}');
    expect(metadata.validation).toBeDefined();
    expect(metadata.validation.passed).toBe(false);
    expect(metadata.validation.errors).toContain(expect.stringMatching(/price mismatch/i));

    // Verify audit log created
    const auditResult = await db.execute({
      sql: `SELECT * FROM audit_logs
            WHERE action = ? AND target_id = ?
            ORDER BY timestamp DESC LIMIT 1`,
      args: ['WEBHOOK_METADATA_VALIDATION_FAILED', sessionId]
    });

    expect(auditResult.rows.length).toBeGreaterThan(0);
    expect(auditResult.rows[0].severity).toBe('critical');

    // Verify security alert triggered
    const alertResult = await db.execute({
      sql: `SELECT * FROM security_alerts
            WHERE alert_type = ? AND severity = ?
            ORDER BY created_at DESC LIMIT 1`,
      args: ['webhook_metadata_tampering', 'critical']
    });

    expect(alertResult.rows.length).toBeGreaterThan(0);
    const alert = alertResult.rows[0];
    expect(alert.title).toMatch(/metadata tampering/i);
    expect(alert.evidence).toContain(sessionId);

    console.log(`✓ Price manipulation detection test completed in ${Date.now() - testStart}ms`);
  });

  test('sold-out ticket purchase rejection: quantity exceeds availability', async () => {
    const testStart = Date.now();

    const ticketTypeId = 'test-basic';
    const maxQuantity = 2;

    // Set ticket to near sold-out
    await db.execute({
      sql: 'UPDATE ticket_types SET max_quantity = ?, sold_count = ? WHERE id = ?',
      args: [maxQuantity, maxQuantity, ticketTypeId]
    });

    const sessionId = `cs_test_soldout_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      amount_total: 100,
      currency: 'usd',
      customer_details: {
        email: 'soldout@example.com',
        name: 'SoldOut Test'
      },
      metadata: {
        event_id: '-1',
        testMode: 'false'
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
                  event_id: '-1',
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
    expect(metadata.validation.errors).toContain(expect.stringMatching(/quantity|available/i));

    console.log(`✓ Sold-out ticket rejection test completed in ${Date.now() - testStart}ms`);
  });

  test('flagged_for_review status creation for validation failures', async () => {
    const testStart = Date.now();

    const sessionId = `cs_test_flagged_${Date.now()}`;

    // Create session with event_id mismatch
    const mockStripeSession = {
      id: sessionId,
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'flagged@example.com',
        name: 'Flagged Test'
      },
      metadata: {
        event_id: '999', // Wrong event_id
        testMode: 'false'
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
                  ticket_type: '2025-11-weekender-full',
                  event_id: '999', // Mismatch with actual ticket type
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

    const sessionId = `cs_test_alert_${Date.now()}`;

    // Simulate critical validation failure
    const mockStripeSession = {
      id: sessionId,
      amount_total: 10, // Severely tampered price
      currency: 'usd',
      customer_details: {
        email: 'critical-alert@example.com',
        name: 'Critical Alert Test'
      },
      metadata: {
        event_id: '5',
        testMode: 'false'
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
                  ticket_type: '2025-11-weekender-full',
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

    // Verify security alert created
    const alertResult = await db.execute({
      sql: `SELECT * FROM security_alerts
            WHERE alert_type = ?
            ORDER BY created_at DESC LIMIT 1`,
      args: ['webhook_metadata_tampering']
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

    const sessionId = `cs_test_audit_${Date.now()}`;

    // Valid session (should pass validation)
    const mockStripeSession = {
      id: sessionId,
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'audit@example.com',
        name: 'Audit Test'
      },
      metadata: {
        event_id: '5',
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
                  ticket_type: '2025-11-weekender-full',
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

    // Verify audit log created for PASSED validation
    const auditResult = await db.execute({
      sql: `SELECT * FROM audit_logs
            WHERE action = ? AND target_id = ?
            ORDER BY timestamp DESC LIMIT 1`,
      args: ['WEBHOOK_METADATA_VALIDATION_PASSED', sessionId]
    });

    expect(auditResult.rows.length).toBeGreaterThan(0);
    const auditLog = auditResult.rows[0];

    expect(auditLog.severity).toBe('info');
    expect(auditLog.target_type).toBe('stripe_webhook_validation');
    expect(auditLog.target_id).toBe(sessionId);

    // Verify detailed metadata
    const details = JSON.parse(auditLog.details);
    expect(details.ticket_type).toBe('2025-11-weekender-full');
    expect(details.quantity).toBe(1);
    expect(details.price_cents).toBe(6500);
    expect(details.validation_errors).toEqual([]);

    console.log(`✓ Audit logs test completed in ${Date.now() - testStart}ms`);
  });

  test('event_id mismatch detection', async () => {
    const testStart = Date.now();

    const sessionId = `cs_test_event_mismatch_${Date.now()}`;

    const mockStripeSession = {
      id: sessionId,
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'event-mismatch@example.com',
        name: 'Event Mismatch Test'
      },
      metadata: {
        event_id: '1', // Wrong event
        testMode: 'false'
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
                  ticket_type: '2025-11-weekender-full', // Belongs to event 5, not 1
                  event_id: '1',
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
    expect(metadata.validation.errors).toContain(expect.stringMatching(/event.*mismatch/i));

    console.log(`✓ Event ID mismatch detection test completed in ${Date.now() - testStart}ms`);
  });

  test('inactive event rejection', async () => {
    const testStart = Date.now();

    const ticketTypeId = 'test-premium';
    const sessionId = `cs_test_inactive_${Date.now()}`;

    // Set event to inactive
    await db.execute({
      sql: 'UPDATE events SET status = ? WHERE id = ?',
      args: ['cancelled', -2]
    });

    const mockStripeSession = {
      id: sessionId,
      amount_total: 500,
      currency: 'usd',
      customer_details: {
        email: 'inactive@example.com',
        name: 'Inactive Event Test'
      },
      metadata: {
        event_id: '-2',
        testMode: 'false'
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
                  ticket_type: ticketTypeId,
                  event_id: '-2',
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

    // Verify validation error mentions inactive event
    const metadata = JSON.parse(ticketsResult.rows[0].ticket_metadata);
    expect(metadata.validation.errors).toContain(expect.stringMatching(/event.*not active/i));

    console.log(`✓ Inactive event rejection test completed in ${Date.now() - testStart}ms`);
  });

  // Report total test execution time
  test('report total execution time', () => {
    const totalTime = Date.now() - startTime;
    console.log(`\n📊 Webhook Validation Test Suite: ${totalTime}ms total`);
    expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
  });
});