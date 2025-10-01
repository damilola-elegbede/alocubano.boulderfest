/**
 * Admin Test Data Create Ticket API
 * Endpoint for creating a single unregistered test ticket
 * Used for testing the registration deadline and reminder system
 * Requires admin authentication
 */

import jwt from 'jsonwebtoken';
import { setSecureCorsHeaders } from '../../../lib/cors-config.js';
import { getDatabaseClient } from '../../../lib/database.js';
import { generateTicketId } from '../../../lib/ticket-id-generator.js';
import { generateOrderNumber } from '../../../lib/order-number-generator.js';
import { RegistrationTokenService } from '../../../lib/registration-token-service.js';
import { scheduleRegistrationReminders } from '../../../lib/reminder-scheduler.js';
import timeUtils from '../../../lib/time-utils.js';

/**
 * Verify admin authentication
 * @param {Object} req - Request object
 * @returns {Object} Decoded admin user
 */
function verifyAdminAuth(req) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    throw new Error('Authentication service unavailable - ADMIN_SECRET not configured');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 5
    });
    if (!decoded.isAdmin) {
      throw new Error('Not an admin user');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired admin token');
  }
}

/**
 * Generate a unique transaction UUID
 */
function generateTransactionUUID() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `TEST-TXN-${timestamp}-${random}`;
}

export default async function handler(req, res) {
  console.log('=== Admin Test Ticket Creation Handler Started ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);

  // Set secure CORS headers
  setSecureCorsHeaders(req, res, {
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authentication
    const adminUser = verifyAdminAuth(req);
    console.log('Admin authenticated');

    // Get database client
    const db = await getDatabaseClient();

    // Test ticket details
    const ticketDetails = {
      attendee_first_name: 'John',
      attendee_last_name: 'Doe',
      attendee_email: 'damilola.elegbede@gmail.com',
      ticket_type: 'test-weekender-pass',
      event_id: -1, // Test Weekender
      event_date: '2024-12-01',
      price_cents: 7500 // $75.00
    };

    // Generate IDs
    const transactionUuid = generateTransactionUUID();
    const orderNumber = await generateOrderNumber();
    const ticketId = await generateTicketId();

    console.log('Generated IDs:', {
      transactionUuid,
      orderNumber,
      ticketId
    });

    // Calculate registration deadline: 7 days from now
    const now = new Date();
    const registrationDeadline = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

    console.log('Registration deadline calculated:', {
      now: now.toISOString(),
      deadline: registrationDeadline.toISOString()
    });

    // Prepare transaction data
    const orderData = JSON.stringify({
      test_mode: true,
      purpose: 'registration_deadline_testing',
      line_items: [{
        ticket_type: ticketDetails.ticket_type,
        quantity: 1,
        price_cents: ticketDetails.price_cents,
        event_id: ticketDetails.event_id
      }]
    });

    // Create transaction and ticket atomically
    const batchOperations = [];

    // Insert transaction
    batchOperations.push({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, order_data, amount_cents, currency,
        customer_email, customer_name, status, completed_at, is_test, order_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transactionUuid,
        transactionUuid,
        'tickets',
        orderData,
        ticketDetails.price_cents,
        'USD',
        ticketDetails.attendee_email,
        `${ticketDetails.attendee_first_name} ${ticketDetails.attendee_last_name}`,
        'completed',
        now.toISOString(),
        1, // is_test
        orderNumber
      ]
    });

    // Insert ticket
    batchOperations.push({
      sql: `INSERT INTO tickets (
        ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
        event_date, price_cents,
        attendee_first_name, attendee_last_name, attendee_email,
        registration_status, registration_deadline,
        status, created_at, is_test
      ) VALUES (?, (SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ticketId,
        transactionUuid,
        ticketDetails.ticket_type,
        ticketDetails.ticket_type,
        ticketDetails.event_id,
        ticketDetails.event_date,
        ticketDetails.price_cents,
        ticketDetails.attendee_first_name,
        ticketDetails.attendee_last_name,
        ticketDetails.attendee_email,
        'pending', // registration_status
        registrationDeadline.toISOString(),
        'valid', // ticket status
        now.toISOString(),
        1 // is_test
      ]
    });

    // Execute batch operations
    console.log('Executing batch operations...');
    await db.batch(batchOperations);
    console.log('Batch operations completed successfully');

    // Get the transaction ID for token generation and reminder scheduling
    const transactionResult = await db.execute({
      sql: `SELECT id FROM transactions WHERE uuid = ?`,
      args: [transactionUuid]
    });

    if (!transactionResult.rows || transactionResult.rows.length === 0) {
      throw new Error('Failed to retrieve created transaction');
    }

    const transactionId = transactionResult.rows[0].id;
    console.log('Transaction ID:', transactionId);

    // Generate registration token
    const tokenService = new RegistrationTokenService();
    await tokenService.ensureInitialized();
    const registrationToken = await tokenService.createToken(transactionId);
    console.log('Registration token generated');

    // Schedule test reminders (every 5 minutes for 30 minutes)
    const reminderCount = await scheduleRegistrationReminders(
      transactionId,
      registrationDeadline,
      true // isTestTransaction
    );
    console.log(`Scheduled ${reminderCount} test reminders`);

    // Format response with Mountain Time formatting
    const deadlineMT = timeUtils.formatDateTime(registrationDeadline);

    return res.status(200).json({
      success: true,
      message: 'Test ticket created successfully',
      data: {
        ticket_id: ticketId,
        order_number: orderNumber,
        transaction_uuid: transactionUuid,
        registration_deadline: registrationDeadline.toISOString(),
        registration_deadline_mt: deadlineMT,
        registration_token: registrationToken,
        reminders_scheduled: reminderCount,
        attendee: {
          first_name: ticketDetails.attendee_first_name,
          last_name: ticketDetails.attendee_last_name,
          email: ticketDetails.attendee_email
        },
        ticket_details: {
          type: ticketDetails.ticket_type,
          event_id: ticketDetails.event_id,
          event_date: ticketDetails.event_date,
          price_cents: ticketDetails.price_cents
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin test ticket creation error:', error);

    // Handle specific error types
    if (error.message.includes('authorization') ||
        error.message.includes('admin') ||
        error.message.includes('token')) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: error.message
      });
    }

    if (error.message.includes('Invalid') ||
        error.message.includes('required') ||
        error.message.includes('must be')) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.message
      });
    }

    // Generic error response
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create test ticket',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
