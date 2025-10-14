import { getDatabaseClient } from "../../lib/database.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getTicketColorService } from "../../lib/ticket-color-service.js";

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  // Set no-cache headers to prevent stale data issues
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  try {
    console.log('[BY_QR] Fetching ticket by QR token:', token?.substring(0, 20) + '...');

    const db = await getDatabaseClient();

    // Look up ticket ID from QR token
    const qrTokenResult = await db.execute({
      sql: `SELECT ticket_id, created_at, expires_at FROM qr_tokens WHERE token = ?`,
      args: [token]
    });

    if (!qrTokenResult.rows || qrTokenResult.rows.length === 0) {
      console.log('[BY_QR] QR token not found:', token?.substring(0, 20) + '...');
      return res.status(404).json({ error: 'Invalid or expired QR token' });
    }

    const qrTokenData = qrTokenResult.rows[0];
    const ticketId = qrTokenData.ticket_id;

    // Check if QR token has expired (if expires_at is set)
    if (qrTokenData.expires_at) {
      const expiresAt = new Date(qrTokenData.expires_at);
      if (expiresAt < new Date()) {
        console.log('[BY_QR] QR token expired:', token?.substring(0, 20) + '...');
        return res.status(401).json({ error: 'QR token has expired' });
      }
    }

    console.log('[BY_QR] Looking up ticket:', ticketId);

    // Fetch ticket details
    const ticketResult = await db.execute({
      sql: `
        SELECT
          t.ticket_id,
          t.ticket_type,
          t.attendee_first_name,
          t.attendee_last_name,
          t.attendee_email,
          t.registration_status,
          t.registered_at,
          t.registration_deadline,
          t.scan_count,
          t.max_scan_count,
          t.created_at as ticket_created_at,
          tx.created_at as purchase_date,
          tx.customer_email as purchaser_email,
          CASE
            WHEN t.registration_status = 'completed' THEN 'completed'
            WHEN datetime('now') > t.registration_deadline THEN 'expired'
            ELSE t.registration_status
          END as current_status,
          CAST((julianday(t.registration_deadline) - julianday('now')) * 24 AS INTEGER) as hours_remaining
        FROM tickets t
        LEFT JOIN transactions tx ON t.transaction_id = tx.id
        WHERE t.ticket_id = ?
      `,
      args: [ticketId]
    });

    if (!ticketResult.rows || ticketResult.rows.length === 0) {
      console.log('[BY_QR] Ticket not found:', ticketId);
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Process database result to handle BigInt values
    const processedTicket = processDatabaseResult(ticketResult);
    const ticket = processedTicket.rows[0];

    console.log('[BY_QR] Found ticket:', {
      id: ticket.ticket_id,
      type: ticket.ticket_type,
      registration_status: ticket.registration_status,
      current_status: ticket.current_status,
      has_attendee: !!(ticket.attendee_first_name || ticket.attendee_email)
    });

    // Update expired status if needed
    if (ticket.current_status === 'expired' && ticket.registration_status !== 'expired') {
      console.log('[BY_QR] Updating expired ticket status:', ticket.ticket_id);
      await db.execute({
        sql: `UPDATE tickets SET registration_status = 'expired' WHERE ticket_id = ?`,
        args: [ticket.ticket_id]
      });
    }

    // Get color for this ticket type
    const colorService = getTicketColorService();
    const ticketColor = await colorService.getColorForTicketType(ticket.ticket_type);

    // Format response with Mountain Time information and color data
    const enhancedTicket = {
      ticketId: ticket.ticket_id,
      ticketType: ticket.ticket_type,
      color_name: ticketColor.name,
      color_rgb: ticketColor.rgb,
      status: ticket.current_status,
      registeredAt: ticket.registered_at,
      hoursRemaining: Math.max(0, Number(ticket.hours_remaining || 0)),
      scan_count: ticket.scan_count || 0,
      max_scan_count: ticket.max_scan_count || 3,
      scans_remaining: Math.max(0, (ticket.max_scan_count || 3) - (ticket.scan_count || 0)),
      attendee: ticket.attendee_first_name ? {
        firstName: ticket.attendee_first_name,
        lastName: ticket.attendee_last_name,
        email: ticket.attendee_email
      } : null,
      registration_deadline: ticket.registration_deadline
    };

    // Add Mountain Time fields
    const enhancedWithTime = timeUtils.enhanceApiResponse(enhancedTicket, ['registeredAt', 'registration_deadline']);

    const response = {
      purchaserEmail: ticket.purchaser_email,
      purchaseDate: ticket.purchase_date,
      purchaseDate_mt: timeUtils.toMountainTime(ticket.purchase_date),
      deadline: ticket.registration_deadline,
      deadline_mt: timeUtils.toMountainTime(ticket.registration_deadline),
      tickets: [enhancedWithTime], // Return as array for consistency with /api/registration
      timezone: 'America/Denver',
      currentTime: timeUtils.getCurrentTime()
    };

    console.log('[BY_QR] Returning single ticket, status:', response.tickets[0].status);

    res.status(200).json(response);
  } catch (error) {
    console.error('[BY_QR] Error fetching ticket by QR token:', error);
    res.status(500).json({ error: 'Failed to fetch ticket details' });
  }
}
