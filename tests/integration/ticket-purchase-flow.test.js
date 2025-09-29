/**
 * Ticket Purchase Flow Integration Tests
 * Complete flow: cart → validation → reservation → checkout → webhook → tickets
 * Tests sold_count increments, triggers fire correctly
 * Tests race condition prevention, overselling prevention with reservations
 * Tests ticket_type_id FK populated correctly
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { bootstrapService } from '../../lib/bootstrap-service.js';
import { createOrRetrieveTickets } from '../../lib/ticket-creation-service.js';
import transactionService from '../../lib/transaction-service.js';
import { createReservation, fulfillReservation, releaseReservation } from '../../lib/ticket-availability-service.js';

describe('Ticket Purchase Flow Integration Tests', () => {
  let db;
  const startTime = Date.now();

  beforeEach(async () => {
    db = await getDbClient();

    // Ensure bootstrap is applied for test ticket types
    await bootstrapService.initialize();
  });

  test('complete purchase flow: cart → checkout → webhook → tickets created', async () => {
    const testStart = Date.now();

    // Step 1: Simulate cart validation (frontend)
    const ticketTypeId = '2025-11-weekender-full'; // From bootstrap.json
    const quantity = 2;

    // Verify ticket type exists and is available
    const ticketTypeResult = await db.execute({
      sql: 'SELECT * FROM ticket_types WHERE id = ? AND status = ?',
      args: [ticketTypeId, 'available']
    });

    expect(ticketTypeResult.rows.length).toBe(1);
    const ticketType = ticketTypeResult.rows[0];
    expect(ticketType.price_cents).toBe(6500);

    // Step 2: Create reservation (prevent overselling)
    const sessionId = `cs_test_purchase_${Date.now()}`;
    const reservationId = await createReservation(sessionId, ticketTypeId, quantity);
    expect(reservationId).toBeDefined();

    // Step 3: Simulate Stripe checkout session completed webhook
    const mockStripeSession = {
      id: sessionId,
      amount_total: ticketType.price_cents * quantity,
      currency: 'usd',
      payment_status: 'paid',
      customer_details: {
        email: 'buyer@example.com',
        name: 'Test Buyer'
      },
      metadata: {
        event_id: String(ticketType.event_id),
        testMode: 'true'
      },
      line_items: {
        data: [
          {
            quantity: quantity,
            amount_total: ticketType.price_cents * quantity,
            description: ticketType.name,
            price: {
              id: `price_${ticketTypeId}`,
              unit_amount: ticketType.price_cents,
              product: {
                id: `prod_${ticketTypeId}`,
                name: ticketType.name,
                metadata: {
                  ticket_type: ticketTypeId,
                  event_id: String(ticketType.event_id),
                  event_date: '2025-11-08'
                }
              }
            }
          }
        ]
      }
    };

    // Step 4: Process webhook - create transaction and tickets
    const result = await createOrRetrieveTickets(mockStripeSession);

    expect(result).toBeDefined();
    expect(result.created).toBe(true);
    expect(result.ticketCount).toBe(quantity);
    expect(result.transaction).toBeDefined();

    // Step 5: Verify transaction created
    const transaction = result.transaction;
    expect(transaction.customer_email).toBe('buyer@example.com');
    expect(transaction.amount_cents).toBe(ticketType.price_cents * quantity);
    expect(transaction.stripe_session_id).toBe(sessionId);

    // Step 6: Verify tickets created
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transaction.id]
    });

    expect(ticketsResult.rows.length).toBe(quantity);

    // Verify ticket_type_id FK populated correctly
    for (const ticket of ticketsResult.rows) {
      expect(ticket.ticket_type).toBe(ticketTypeId);
      expect(ticket.ticket_type_id).toBe(ticketTypeId);
      expect(ticket.event_id).toBe(ticketType.event_id);
      expect(ticket.price_cents).toBeGreaterThan(0);
      expect(ticket.status).toBe('valid');
      expect(ticket.registration_status).toBe('pending');
    }

    // Step 7: Fulfill reservation (mark as completed)
    await fulfillReservation(sessionId, transaction.id);

    // Step 8: Verify sold_count incremented (via trigger)
    const updatedTicketType = await db.execute({
      sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
      args: [ticketTypeId]
    });

    expect(updatedTicketType.rows[0].sold_count).toBe(quantity);

    console.log(`✓ Complete purchase flow test completed in ${Date.now() - testStart}ms`);
  });

  test('sold_count increments after purchase via database trigger', async () => {
    const testStart = Date.now();

    const ticketTypeId = '2025-11-weekender-class'; // Different ticket type
    const quantity = 3;

    // Get initial sold_count
    const initialResult = await db.execute({
      sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
      args: [ticketTypeId]
    });
    const initialSoldCount = initialResult.rows[0].sold_count || 0;

    // Create a purchase
    const sessionId = `cs_test_soldcount_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      amount_total: 2500 * quantity,
      currency: 'usd',
      customer_details: {
        email: 'soldcount@example.com',
        name: 'SoldCount Test'
      },
      metadata: {
        event_id: '5',
        testMode: 'true'
      },
      line_items: {
        data: [
          {
            quantity: quantity,
            amount_total: 2500 * quantity,
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

    const result = await createOrRetrieveTickets(mockStripeSession);
    expect(result.ticketCount).toBe(quantity);

    // Verify sold_count incremented
    const updatedResult = await db.execute({
      sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
      args: [ticketTypeId]
    });

    const newSoldCount = updatedResult.rows[0].sold_count;
    expect(newSoldCount).toBe(initialSoldCount + quantity);

    console.log(`✓ sold_count trigger test completed in ${Date.now() - testStart}ms`);
  });

  test('triggers fire correctly on ticket creation', async () => {
    const testStart = Date.now();

    const ticketTypeId = '2025-11-weekender-full';
    const sessionId = `cs_test_trigger_${Date.now()}`;

    // Get initial state
    const initialState = await db.execute({
      sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
      args: [ticketTypeId]
    });
    const initialSoldCount = initialState.rows[0].sold_count || 0;

    // Create tickets
    const mockStripeSession = {
      id: sessionId,
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'trigger@example.com',
        name: 'Trigger Test'
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

    // Verify trigger updated sold_count
    const afterState = await db.execute({
      sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
      args: [ticketTypeId]
    });

    expect(afterState.rows[0].sold_count).toBe(initialSoldCount + 1);

    // Verify trigger ran (sold_count should update automatically)
    // Test that the trigger mechanism is working
    const triggerTest = await db.execute({
      sql: `SELECT COUNT(*) as count FROM tickets
            WHERE ticket_type_id = ? AND transaction_id IN (
              SELECT id FROM transactions WHERE stripe_session_id = ?
            )`,
      args: [ticketTypeId, sessionId]
    });

    expect(triggerTest.rows[0].count).toBe(1);

    console.log(`✓ Trigger functionality test completed in ${Date.now() - testStart}ms`);
  });

  test('race condition prevention with reservations', async () => {
    const testStart = Date.now();

    const ticketTypeId = 'test-basic'; // Test ticket with limited quantity
    const sessionId1 = `cs_test_race1_${Date.now()}`;
    const sessionId2 = `cs_test_race2_${Date.now()}`;

    // Set max_quantity for test
    await db.execute({
      sql: 'UPDATE ticket_types SET max_quantity = ? WHERE id = ?',
      args: [5, ticketTypeId]
    });

    // Create two concurrent reservations
    const reservation1 = createReservation(sessionId1, ticketTypeId, 3);
    const reservation2 = createReservation(sessionId2, ticketTypeId, 3);

    const [res1, res2] = await Promise.all([reservation1, reservation2]);

    // One should succeed, one should fail (only 5 available, 3+3 > 5)
    const successCount = [res1, res2].filter(r => r !== null).length;

    // At least one should fail due to insufficient quantity
    expect(successCount).toBeLessThanOrEqual(1);

    // If both succeeded, it means there was no race condition protection
    // This would be a bug
    if (successCount === 2) {
      console.warn('⚠️ Warning: Both reservations succeeded - potential race condition issue');
    }

    console.log(`✓ Race condition prevention test completed in ${Date.now() - testStart}ms`);
  });

  test('overselling prevention with max_quantity limit', async () => {
    const testStart = Date.now();

    const ticketTypeId = 'test-premium'; // Test ticket
    const maxQuantity = 2;

    // Set max_quantity
    await db.execute({
      sql: 'UPDATE ticket_types SET max_quantity = ?, sold_count = ? WHERE id = ?',
      args: [maxQuantity, 0, ticketTypeId]
    });

    // Try to purchase more than max_quantity
    const sessionId = `cs_test_oversell_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      amount_total: 500 * 3, // Trying to buy 3 when max is 2
      currency: 'usd',
      customer_details: {
        email: 'oversell@example.com',
        name: 'Oversell Test'
      },
      metadata: {
        event_id: '-2',
        testMode: 'true'
      },
      line_items: {
        data: [
          {
            quantity: 3,
            amount_total: 1500,
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

    // Should create tickets but flag for review due to overselling
    const result = await createOrRetrieveTickets(mockStripeSession);

    // Check if any tickets were flagged for review
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    // Some tickets should be flagged for review due to quantity validation failure
    const flaggedTickets = ticketsResult.rows.filter(t => t.status === 'flagged_for_review');
    expect(flaggedTickets.length).toBeGreaterThan(0);

    console.log(`✓ Overselling prevention test completed in ${Date.now() - testStart}ms`);
  });

  test('ticket_type_id foreign key populated correctly', async () => {
    const testStart = Date.now();

    const ticketTypeId = '2025-11-weekender-full';
    const sessionId = `cs_test_fk_${Date.now()}`;

    const mockStripeSession = {
      id: sessionId,
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'fk@example.com',
        name: 'FK Test'
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

    const result = await createOrRetrieveTickets(mockStripeSession);

    // Verify ticket has correct ticket_type_id
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(ticketsResult.rows.length).toBe(1);
    const ticket = ticketsResult.rows[0];

    // Both ticket_type and ticket_type_id should match
    expect(ticket.ticket_type).toBe(ticketTypeId);
    expect(ticket.ticket_type_id).toBe(ticketTypeId);

    // Verify FK relationship works
    const joinResult = await db.execute({
      sql: `SELECT t.ticket_id, tt.name, tt.price_cents
            FROM tickets t
            JOIN ticket_types tt ON t.ticket_type_id = tt.id
            WHERE t.ticket_id = ?`,
      args: [ticket.ticket_id]
    });

    expect(joinResult.rows.length).toBe(1);
    expect(joinResult.rows[0].name).toBe('Full Pass');
    expect(joinResult.rows[0].price_cents).toBe(6500);

    console.log(`✓ ticket_type_id FK test completed in ${Date.now() - testStart}ms`);
  });

  test('idempotency: calling createOrRetrieveTickets twice returns existing tickets', async () => {
    const testStart = Date.now();

    const sessionId = `cs_test_idempotent_${Date.now()}`;
    const mockStripeSession = {
      id: sessionId,
      amount_total: 6500,
      currency: 'usd',
      customer_details: {
        email: 'idempotent@example.com',
        name: 'Idempotent Test'
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

    // First call - creates tickets
    const result1 = await createOrRetrieveTickets(mockStripeSession);
    expect(result1.created).toBe(true);
    expect(result1.ticketCount).toBe(1);

    // Second call - returns existing tickets
    const result2 = await createOrRetrieveTickets(mockStripeSession);
    expect(result2.created).toBe(false);
    expect(result2.ticketCount).toBe(1);

    // Verify same transaction returned
    expect(result2.transaction.id).toBe(result1.transaction.id);

    // Verify only one set of tickets created
    const ticketsResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
      args: [result1.transaction.id]
    });

    expect(ticketsResult.rows[0].count).toBe(1);

    console.log(`✓ Idempotency test completed in ${Date.now() - testStart}ms`);
  });

  test('reservation lifecycle: create → fulfill → cleanup', async () => {
    const testStart = Date.now();

    const ticketTypeId = '2025-11-weekender-class';
    const sessionId = `cs_test_reservation_${Date.now()}`;
    const quantity = 2;

    // Create reservation
    const reservationId = await createReservation(sessionId, ticketTypeId, quantity);
    expect(reservationId).toBeDefined();

    // Verify reservation exists
    const reservationResult = await db.execute({
      sql: 'SELECT * FROM ticket_reservations WHERE session_id = ?',
      args: [sessionId]
    });

    expect(reservationResult.rows.length).toBe(1);
    expect(reservationResult.rows[0].status).toBe('pending');
    expect(reservationResult.rows[0].quantity).toBe(quantity);

    // Complete purchase and get transaction
    const mockStripeSession = {
      id: sessionId,
      amount_total: 2500 * quantity,
      currency: 'usd',
      customer_details: {
        email: 'reservation@example.com',
        name: 'Reservation Test'
      },
      metadata: {
        event_id: '5',
        testMode: 'true'
      },
      line_items: {
        data: [
          {
            quantity: quantity,
            amount_total: 2500 * quantity,
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

    const result = await createOrRetrieveTickets(mockStripeSession);

    // Fulfill reservation
    await fulfillReservation(sessionId, result.transaction.id);

    // Verify reservation marked as completed
    const fulfilledReservation = await db.execute({
      sql: 'SELECT * FROM ticket_reservations WHERE session_id = ?',
      args: [sessionId]
    });

    expect(fulfilledReservation.rows[0].status).toBe('completed');
    expect(fulfilledReservation.rows[0].transaction_id).toBe(result.transaction.id);

    console.log(`✓ Reservation lifecycle test completed in ${Date.now() - testStart}ms`);
  });

  // Report total test execution time
  test('report total execution time', () => {
    const totalTime = Date.now() - startTime;
    console.log(`\n📊 Ticket Purchase Flow Test Suite: ${totalTime}ms total`);
    expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
  });
});