import { getDatabaseClient } from "../../lib/database.js";
import { setSecureCorsHeaders } from "../../lib/cors-config.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getTicketColorService } from "../../lib/ticket-color-service.js";

/**
 * Ticket Details API Endpoint
 * Retrieves detailed information about a specific ticket with Mountain Time formatting
 */
export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ticketId } = req.query;

    // Validate ticket ID parameter
    if (!ticketId || typeof ticketId !== 'string') {
      return res.status(400).json({
        error: 'Invalid ticket ID',
        message: 'Valid ticket ID required'
      });
    }

    // Basic format validation for ticket ID
    if (!/^[A-Za-z0-9\-_]{8,64}$/.test(ticketId)) {
      return res.status(400).json({
        error: 'Invalid ticket ID format',
        message: 'Ticket ID contains invalid characters'
      });
    }

    const db = await getDatabaseClient();

    // Retrieve ticket with related transaction information
    const result = await db.execute({
      sql: `
        SELECT
          t.*,
          tr.customer_email as purchaser_email,
          tr.customer_name as purchaser_name,
          tr.order_number,
          tr.amount_cents as transaction_amount,
          tr.status as transaction_status,
          tr.payment_processor,
          tr.stripe_session_id,
          tr.created_at as transaction_created_at
        FROM tickets t
        LEFT JOIN transactions tr ON t.transaction_id = tr.id
        WHERE t.ticket_id = ?
      `,
      args: [ticketId]
    });

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        error: 'Ticket not found',
        message: 'No ticket found with the provided ID'
      });
    }

    // Process database result to handle BigInt values
    const processedResult = processDatabaseResult(result);
    const ticket = processedResult.rows[0];

    // Get color for ticket type
    const colorService = getTicketColorService();
    const ticketColor = await colorService.getColorForTicketType(ticket.ticket_type);

    // Calculate registration deadline (24 hours from ticket creation)
    const registrationDeadlineHours = 24;

    // Prepare base ticket response
    const baseTicketResponse = {
      ticket_id: ticket.ticket_id,
      ticket_type: ticket.ticket_type,
      status: ticket.status,
      validation_status: ticket.validation_status,

      // Attendee information
      attendee_first_name: ticket.attendee_first_name,
      attendee_last_name: ticket.attendee_last_name,
      attendee_email: ticket.attendee_email,

      // Registration information
      registration_status: ticket.registration_status,
      registered_at: ticket.registered_at,
      registration_deadline: ticket.registration_deadline,

      // Pricing
      price_cents: ticket.price_cents,
      currency: ticket.currency || 'USD',

      // QR and scanning
      qr_token: ticket.qr_token,
      qr_access_method: ticket.qr_access_method,
      scan_count: ticket.scan_count || 0,
      max_scan_count: ticket.max_scan_count || 10,
      first_scanned_at: ticket.first_scanned_at,
      last_scanned_at: ticket.last_scanned_at,

      // Check-in information
      checked_in_at: ticket.checked_in_at,
      checked_in_by: ticket.checked_in_by,

      // Timestamps
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,

      // Transaction information
      transaction: {
        order_number: ticket.order_number,
        amount_cents: ticket.transaction_amount,
        status: ticket.transaction_status,
        payment_processor: ticket.payment_processor,
        purchaser_email: ticket.purchaser_email,
        purchaser_name: ticket.purchaser_name,
        created_at: ticket.transaction_created_at
      }
    };

    // Add Mountain Time fields using timeUtils
    const enhancedTicket = timeUtils.enhanceApiResponse(
      baseTicketResponse,
      [
        'created_at',
        'updated_at',
        'registered_at',
        'registration_deadline',
        'first_scanned_at',
        'last_scanned_at',
        'checked_in_at'
      ],
      {
        includeDeadline: true,
        deadlineHours: registrationDeadlineHours
      }
    );

    // Enhance transaction timestamps
    if (enhancedTicket.transaction && enhancedTicket.transaction.created_at) {
      enhancedTicket.transaction = timeUtils.enhanceApiResponse(
        enhancedTicket.transaction,
        ['created_at']
      );
    }

    // Add calculated fields
    const response = {
      ...enhancedTicket,

      // Ticket color information
      color_name: ticketColor.name,
      color_rgb: ticketColor.rgb,

      // Calculated status information
      is_registered: ticket.registration_status === 'completed',
      is_expired: timeUtils.isExpired(ticket.registration_deadline),
      is_checked_in: !!ticket.checked_in_at,

      // Scanning status
      scans_remaining: Math.max(0, (ticket.max_scan_count || 10) - (ticket.scan_count || 0)),
      can_scan: ticket.status === 'valid' &&
                ticket.validation_status === 'active' &&
                (ticket.scan_count || 0) < (ticket.max_scan_count || 10),

      // Price formatting
      price_display: `$${((ticket.price_cents || 0) / 100).toFixed(2)}`,

      // Mountain Time metadata
      timezone: 'America/Denver',
      current_time: timeUtils.getCurrentTime()
    };

    // Set cache headers for reasonable caching while ensuring freshness
    res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
    res.setHeader('ETag', `"${ticket.ticket_id}-${ticket.updated_at}"`);

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error retrieving ticket details:', error);

    // Handle specific database errors
    if (error.message && error.message.includes('database')) {
      return res.status(503).json({
        error: 'Database error',
        message: 'Unable to retrieve ticket information at this time'
      });
    }

    // Generic error response
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve ticket details'
    });
  }
}