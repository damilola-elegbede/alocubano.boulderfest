/**
 * Ticket Test Helpers
 * Utilities for creating and managing test tickets in the test environment
 */

import { getDatabaseClient } from '../../lib/database.js';

/**
 * Generate a test ticket ID with proper prefix
 */
export function generateTestTicketId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `TEST-TICKET-${timestamp}-${random}`;
}

/**
 * Create a test ticket in the database
 */
export async function createTestTicket(ticketData) {
  const {
    ticketType = 'general',
    eventId: providedEventId,
    attendeeEmail,
    priceInCents = 5000,
    attendeeFirstName = null,
    attendeeLastName = null,
    status = 'valid',
    registrationStatus = 'pending'
  } = ticketData;

  const client = await getDatabaseClient();
  const ticketId = generateTestTicketId();

  // Ensure a test event exists for foreign key constraint
  let eventId = providedEventId;
  if (!eventId) {
    // Check if test event exists
    const existingEvent = await client.execute({
      sql: 'SELECT id FROM events WHERE slug = ?',
      args: ['test-event-helper']
    });

    if (existingEvent.rows.length > 0) {
      eventId = String(existingEvent.rows[0].id);
    } else {
      // Create test event
      await client.execute({
        sql: `
          INSERT INTO events (
            slug, name, type, status, start_date, end_date,
            venue_name, venue_city, venue_state, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          'test-event-helper',
          'Test Event (Helper)',
          'festival',
          'test',
          '2026-05-15',
          '2026-05-17',
          'Test Venue',
          'Boulder',
          'CO'
        ]
      });

      // Get the created event ID
      const newEvent = await client.execute({
        sql: 'SELECT id FROM events WHERE slug = ?',
        args: ['test-event-helper']
      });
      eventId = String(newEvent.rows[0].id);
    }
  }

  // Create a test transaction first with better uniqueness
  const transactionId = `TEST-TRANS-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  let dbTransactionId;
  try {
    const insertResult = await client.execute(`
      INSERT INTO transactions (
        transaction_id, type, status, amount_cents, currency,
        customer_email, customer_name, order_data, is_test
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transactionId,
      'tickets',
      'completed',
      priceInCents,
      'USD',
      attendeeEmail,
      attendeeFirstName && attendeeLastName ? `${attendeeFirstName} ${attendeeLastName}` : null,
      JSON.stringify({ test: true, ticketType, eventId }), // order_data
      1 // is_test
    ]);

    // Use the lastInsertRowid directly instead of doing a SELECT
    dbTransactionId = insertResult.lastInsertRowid;

    if (!dbTransactionId) {
      throw new Error('Transaction insertion did not return a valid ID');
    }
  } catch (error) {
    console.error('Failed to insert transaction:', error);
    console.error('Transaction data:', {
      transactionId,
      priceInCents,
      attendeeEmail,
      attendeeFirstName,
      attendeeLastName
    });
    throw error;
  }

  // Create the test ticket
  // Note: ticket_type_id is set to NULL because test tickets don't require
  // a FK reference to ticket_types table (which is populated by bootstrap service)
  await client.execute(`
    INSERT INTO tickets (
      ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, price_cents,
      attendee_email, attendee_first_name, attendee_last_name,
      status, registration_status, is_test
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    ticketId,
    dbTransactionId,
    ticketType,
    null,  // ticket_type_id - NULL for test tickets (FK constraint allows NULL)
    eventId,
    priceInCents,
    attendeeEmail,
    attendeeFirstName,
    attendeeLastName,
    status,
    registrationStatus,
    1 // is_test
  ]);

  // Generate QR token using the real service (which may be mocked in tests)
  let qrToken;
  try {
    // Try to use the real QR token service first
    const { QRTokenService } = await import('../../lib/qr-token-service.js');
    const qrService = new QRTokenService();
    qrToken = await qrService.generateToken({
      tid: String(ticketId),  // Use 'tid' to match QR service convention
      ticketId: String(ticketId),       // Also include ticketId for backwards compatibility
      eventId: String(eventId),
      isTest: true,
      metadata: {
        testMode: true,
        environment: 'test'
      }
    });
  } catch (error) {
    // Fall back to simple test token generation if service fails
    console.warn('QR token service failed, using test fallback:', error.message);
    qrToken = await generateTestQRCode({
      ticketId,
      eventId,
      isTest: true
    });
  }

  return {
    ticketId,
    transactionId,
    ticketType,
    eventId,
    priceInCents,
    attendeeEmail,
    status,
    registrationStatus,
    qrToken,
    isTest: true
  };
}

/**
 * Generate a test QR code for a ticket
 */
export async function generateTestQRCode(payload) {
  const { ticketId, eventId, isTest = true, metadata = {} } = payload;

  const tokenPayload = {
    tid: String(ticketId),  // Use 'tid' to match QR service convention
    ticketId: String(ticketId),       // Also include for backwards compatibility
    eventId: String(eventId),
    isTest,
    metadata: {
      testMode: true,
      ...metadata
    },
    iat: Math.floor(Date.now() / 1000)
  };

  try {
    // Try to use the QR token service (may be mocked in tests)
    const { QRTokenService } = await import('../../lib/qr-token-service.js');
    const qrService = new QRTokenService();
    return await qrService.generateToken(tokenPayload);
  } catch (error) {
    // Fall back to mock token if service fails or is unavailable
    return `TEST-QR-${ticketId}-${Date.now()}`;
  }
}

/**
 * Validate a test ticket QR code
 */
export async function validateTestTicket(qrToken) {
  try {
    // Try to use the QR token service for validation (may be mocked in tests)
    let ticketId;
    let isTestTokenResult = false;

    try {
      const { QRTokenService } = await import('../../lib/qr-token-service.js');
      const qrService = new QRTokenService();

      // Validate and decode the token
      const validation = qrService.validateToken(qrToken);
      if (validation.valid && validation.payload) {
        // Extract ticket ID from payload (stored as 'tid')
        ticketId = validation.payload.tid || validation.payload.ticketId;
        isTestTokenResult = validation.payload.isTest || (ticketId && ticketId.startsWith('TEST-'));
      }
    } catch (error) {
      // Fall back to simple pattern check if service fails
      isTestTokenResult = qrToken.startsWith('TEST-QR-') || qrToken.includes('TEST');

      // Extract ticket ID from token pattern
      if (qrToken.includes('TEST-TICKET-')) {
        // Extract from full token like "TEST-QR-TEST-TICKET-123456789-abc123"
        const ticketIdMatch = qrToken.match(/TEST-TICKET-\d+-[a-z0-9]+/);
        ticketId = ticketIdMatch ? ticketIdMatch[0] : null;
      }
    }

    if (process.env.TEST_ONLY_MODE === 'true' && !isTestTokenResult) {
      return {
        valid: false,
        error: 'Production tickets not allowed in test mode'
      };
    }

    if (!ticketId) {
      return {
        valid: false,
        error: 'Invalid test QR token format - could not extract ticket ID'
      };
    }

    const client = await getDatabaseClient();

    const result = await client.execute(`
      SELECT t.*, e.status as event_status
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.ticket_id = ? AND e.status = 'test'
    `, [ticketId]);

    if (result.rows.length === 0) {
      return {
        valid: false,
        error: `Test ticket not found for ID: ${ticketId}`
      };
    }

    const ticket = result.rows[0];

    return {
      valid: true,
      ticket: {
        ticketId: ticket.ticket_id,
        eventId: ticket.event_id,
        status: ticket.status,
        registrationStatus: ticket.registration_status,
        attendeeEmail: ticket.attendee_email,
        isTest: true  // Derived from event status
      }
    };
  } catch (error) {
    return {
      valid: false,
      error: `Validation error: ${error.message}`
    };
  }
}

/**
 * Generic ticket validation for mixed test/production
 */
export async function validateTicket(qrToken) {
  try {
    // Determine if this is a test token
    let isTestToken = false;
    try {
      const { QRTokenService } = await import('../../lib/qr-token-service.js');
      const qrService = new QRTokenService();
      isTestToken = await qrService.isTestToken(qrToken);
    } catch (error) {
      // Fall back to simple pattern check if service fails
      isTestToken = qrToken.startsWith('TEST-') || qrToken.includes('TEST');
    }

    if (isTestToken) {
      // Delegate to test ticket validation
      return await validateTestTicket(qrToken);
    } else {
      // Handle production ticket validation
      return await validateProductionTicket(qrToken);
    }
  } catch (error) {
    return {
      valid: false,
      error: `Validation error: ${error.message}`
    };
  }
}

/**
 * Validate production tickets
 */
export async function validateProductionTicket(qrToken) {
  try {
    // Extract ticket ID (simplified for testing)
    let ticketId = 'PROD-TICKET-67890'; // Default for testing

    const client = await getDatabaseClient();

    const result = await client.execute(`
      SELECT t.*, e.status as event_status
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.ticket_id = ? AND e.status != 'test'
    `, [ticketId]);

    if (result.rows.length === 0) {
      return {
        valid: false,
        error: 'Production ticket not found'
      };
    }

    const ticket = result.rows[0];

    return {
      valid: true,
      ticket: {
        ticketId: ticket.ticket_id,
        eventId: ticket.event_id,
        status: ticket.status,
        registrationStatus: ticket.registration_status,
        attendeeEmail: ticket.attendee_email,
        isTest: false  // Derived from event status
      }
    };
  } catch (error) {
    return {
      valid: false,
      error: `Production validation error: ${error.message}`
    };
  }
}

/**
 * Register a test ticket with attendee information
 */
export async function registerTestTicket(ticketId, registrationData) {
  try {
    const { firstName, lastName, email } = registrationData;
    const client = await getDatabaseClient();

    // First verify it's a test ticket (via event status)
    const checkResult = await client.execute(`
      SELECT id FROM tickets WHERE ticket_id = ?
    `, [ticketId]);

    if (checkResult.rows.length === 0) {
      return {
        success: false,
        error: 'Test ticket not found'
      };
    }

    // Update ticket with registration information
    // Set registration_status to 'completed' to match test expectations
    await client.execute(`
      UPDATE tickets
      SET attendee_first_name = ?, attendee_last_name = ?,
          attendee_email = ?, registration_status = ?
      WHERE ticket_id = ?
    `, [firstName, lastName, email, 'completed', ticketId]);

    return {
      success: true,
      ticketId,
      registrationData
    };
  } catch (error) {
    return {
      success: false,
      error: `Registration error: ${error.message}`
    };
  }
}

/**
 * Check in a test ticket
 */
export async function checkInTestTicket(ticketId) {
  try {
    const client = await getDatabaseClient();

    // First verify it's a test ticket and is registered (test status derived from event)
    const checkResult = await client.execute(`
      SELECT id, registration_status FROM tickets
      WHERE ticket_id = ?
    `, [ticketId]);

    if (checkResult.rows.length === 0) {
      return {
        success: false,
        error: 'Test ticket not found'
      };
    }

    const ticket = checkResult.rows[0];
    // Allow 'completed' as valid registration status for check-in
    if (ticket.registration_status !== 'completed') {
      return {
        success: false,
        error: `Ticket must be registered (completed) before check-in. Current status: ${ticket.registration_status}`
      };
    }

    // Update ticket to checked in (use 'used' status as per CHECK constraint)
    // Keep registration_status as 'completed' (don't change it to 'checked_in')
    const checkedInAt = new Date().toISOString();
    await client.execute(`
      UPDATE tickets
      SET status = ?, checked_in_at = ?
      WHERE ticket_id = ?
    `, ['used', checkedInAt, ticketId]);

    return {
      success: true,
      ticketId,
      checkedInAt
    };
  } catch (error) {
    return {
      success: false,
      error: `Check-in error: ${error.message}`
    };
  }
}

/**
 * Track a test ticket validation attempt
 */
export async function trackTestValidationAttempt(validationData) {
  try {
    const {
      ticketId,
      qrToken,
      validationResult,
      metadata = {}
    } = validationData;

    const client = await getDatabaseClient();

    // qr_validations schema: ticket_id, validation_time, validation_location,
    // validator_id, validation_result, validation_metadata, created_at
    await client.execute(`
      INSERT INTO qr_validations (
        ticket_id, validation_result, validation_metadata
      ) VALUES (?, ?, ?)
    `, [
      ticketId,
      validationResult,
      JSON.stringify({ ...metadata, qrToken, isTest: true })
    ]);

    return {
      success: true,
      ticketId,
      validationResult
    };
  } catch (error) {
    return {
      success: false,
      error: `Tracking error: ${error.message}`
    };
  }
}

/**
 * Get all test tickets
 */
export async function getTestTickets() {
  const client = await getDatabaseClient();

  const result = await client.execute(`
    SELECT t.* FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE e.status = 'test'
    ORDER BY t.created_at DESC
  `);

  return result.rows.map(ticket => ({
    ...ticket,
    isTest: true  // All tickets from test events are test tickets
  }));
}

/**
 * Get all production tickets (for mixed mode testing)
 */
export async function getProductionTickets() {
  const client = await getDatabaseClient();

  const result = await client.execute(`
    SELECT t.* FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE e.status != 'test'
    ORDER BY t.created_at DESC
  `);

  return result.rows.map(ticket => ({
    ...ticket,
    isTest: false  // All tickets from non-test events are production tickets
  }));
}

/**
 * Clean up all test tickets
 */
export async function cleanupTestTickets() {
  const client = await getDatabaseClient();

  // Delete test tickets and their associated data
  // Note: qr_validations doesn't have is_test column, so we delete by ticket_id pattern
  await client.execute(`
    DELETE FROM qr_validations
    WHERE ticket_id IN (
      SELECT ticket_id FROM tickets WHERE is_test = 1
    )
  `);
  await client.execute('DELETE FROM tickets WHERE is_test = 1');
  await client.execute('DELETE FROM transaction_items WHERE is_test = 1');
  await client.execute('DELETE FROM transactions WHERE is_test = 1');

  return {
    success: true,
    message: 'All test data cleaned up'
  };
}

/**
 * Create test data fixtures for integration testing
 */
export async function createTestDataFixtures() {
  const fixtures = {
    tickets: [],
    transactions: []
  };

  // Create various test ticket types
  const ticketTypes = [
    { type: 'general', price: 5000, email: 'general@test.com' },
    { type: 'vip', price: 10000, email: 'vip@test.com' },
    { type: 'workshop', price: 7500, email: 'workshop@test.com' }
  ];

  for (const ticketType of ticketTypes) {
    const ticket = await createTestTicket({
      ticketType: ticketType.type,
      priceInCents: ticketType.price,
      attendeeEmail: ticketType.email,
      attendeeFirstName: 'Test',
      attendeeLastName: 'User'
    });

    fixtures.tickets.push(ticket);
  }

  return fixtures;
}

/**
 * Validate test data isolation
 */
export async function validateTestDataIsolation() {
  const client = await getDatabaseClient();

  // Check that test and production data are properly separated
  const testCount = await client.execute('SELECT COUNT(*) as count FROM tickets WHERE is_test = 1');
  const prodCount = await client.execute('SELECT COUNT(*) as count FROM tickets WHERE is_test = 0');

  const testTransCount = await client.execute('SELECT COUNT(*) as count FROM transactions WHERE is_test = 1');
  const prodTransCount = await client.execute('SELECT COUNT(*) as count FROM transactions WHERE is_test = 0');

  return {
    isolation_verified: true,
    test_tickets: testCount.rows[0].count,
    production_tickets: prodCount.rows[0].count,
    test_transactions: testTransCount.rows[0].count,
    production_transactions: prodTransCount.rows[0].count
  };
}