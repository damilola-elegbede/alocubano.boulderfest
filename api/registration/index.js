import jwt from 'jsonwebtoken';
import { getDatabaseClient } from "../../lib/database.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getTicketColorService } from "../../lib/ticket-color-service.js";

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');    return res.status(405).json({ error: 'Method not allowed' });
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
    console.log('[REG_STATUS] Registration status check for token:', token?.substring(0, 20) + '...');

    // Verify JWT token strictly with the registration secret
    const secret = process.env.REGISTRATION_SECRET;
    if (!secret) {
      console.error('[REG_STATUS] Missing REGISTRATION_SECRET');
      return res.status(503).json({ error: 'Service misconfigured' });
    }
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

    console.log('[REG_STATUS] Decoded JWT:', {
      tid: decoded.tid,
      txn: decoded.txn,
      transactionId: decoded.transactionId,
      type: decoded.type,
      exp: new Date(decoded.exp * 1000).toISOString()
    });

    // Handle both old format (transactionId) and new format (txn)
    const transactionId = decoded.transactionId || decoded.txn;
    if (!transactionId) {
      console.error('[REG_STATUS] Invalid token format - missing transaction ID');
      return res.status(400).json({ error: 'Invalid token format - missing transaction ID' });
    }

    console.log('[REG_STATUS] Looking up tickets for transaction ID:', transactionId);

    const db = await getDatabaseClient();

    // Fetch all tickets for the transaction along with purchase timestamp
    const tickets = await db.execute({
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
          CASE
            WHEN t.registration_status = 'completed' THEN 'completed'
            WHEN datetime('now') > t.registration_deadline THEN 'expired'
            ELSE t.registration_status
          END as current_status,
          CAST((julianday(t.registration_deadline) - julianday('now')) * 24 AS INTEGER) as hours_remaining
        FROM tickets t
        LEFT JOIN transactions tx ON t.transaction_id = tx.id
        WHERE t.transaction_id = ?
      `,
      args: [transactionId]
    });

    if (!tickets.rows || tickets.rows.length === 0) {
      console.log('[REG_STATUS] No tickets found for transaction ID:', transactionId);
      return res.status(404).json({ error: 'No tickets found for this transaction' });
    }

    // Process database result to handle BigInt values
    const processedTickets = processDatabaseResult(tickets);
    console.log('[REG_STATUS] Raw database results:', processedTickets.rows);

    console.log('[REG_STATUS] Found tickets:', processedTickets.rows.map(t => ({
      id: t.ticket_id,
      type: t.ticket_type,
      registration_status: t.registration_status,
      current_status: t.current_status,
      has_attendee: !!(t.attendee_first_name || t.attendee_email),
      attendee_name: `${t.attendee_first_name || 'NONE'} ${t.attendee_last_name || 'NONE'}`,
      deadline: t.registration_deadline,
      registered_at: t.registered_at
    })));

    // Update expired tickets if needed
    const expiredTickets = processedTickets.rows.filter(t =>
      t.current_status === 'expired' && t.registration_status !== 'expired'
    );

    if (expiredTickets.length > 0) {
      console.log('[REG_STATUS] Updating expired tickets:', expiredTickets.map(t => t.ticket_id));
      await db.execute({
        sql: `
          UPDATE tickets
          SET registration_status = 'expired'
          WHERE ticket_id IN (${expiredTickets.map(() => '?').join(',')})
        `,
        args: expiredTickets.map(t => t.ticket_id)
      });
    }

    // Format response with Mountain Time information and color data
    const colorService = getTicketColorService();
    const enhancedTickets = await Promise.all(processedTickets.rows.map(async (ticket) => {
      // Get color for this ticket type
      const ticketColor = await colorService.getColorForTicketType(ticket.ticket_type);

      const baseTicket = {
        ticketId: ticket.ticket_id,
        ticketType: ticket.ticket_type,
        color_name: ticketColor.name,
        color_rgb: ticketColor.rgb,
        status: ticket.current_status,
        registeredAt: ticket.registered_at,
        hoursRemaining: Math.max(0, Number(ticket.hours_remaining || 0)),
        scan_count: ticket.scan_count || 0,
        max_scan_count: ticket.max_scan_count || 10,
        scans_remaining: Math.max(0, (ticket.max_scan_count || 10) - (ticket.scan_count || 0)),
        attendee: ticket.attendee_first_name ? {
          firstName: ticket.attendee_first_name,
          lastName: ticket.attendee_last_name,
          email: ticket.attendee_email
        } : null,
        registration_deadline: ticket.registration_deadline
      };

      // Add Mountain Time fields
      return timeUtils.enhanceApiResponse(baseTicket, ['registeredAt', 'registration_deadline']);
    }));

    const response = {
      transactionId: transactionId,
      purchaserEmail: decoded.purchaserEmail,
      purchaseDate: processedTickets.rows[0].purchase_date,
      purchaseDate_mt: timeUtils.toMountainTime(processedTickets.rows[0].purchase_date),
      deadline: processedTickets.rows[0].registration_deadline,
      deadline_mt: timeUtils.toMountainTime(processedTickets.rows[0].registration_deadline),
      tickets: enhancedTickets,
      timezone: 'America/Denver',
      currentTime: timeUtils.getCurrentTime()
    };

    console.log('[REG_STATUS] Returning response with', response.tickets.length, 'tickets');
    console.log('[REG_STATUS] Ticket statuses:', response.tickets.map(t => `${t.ticketId}: ${t.status}`));

    res.status(200).json(response);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    console.error('Registration status error:', error);
    res.status(500).json({ error: 'Failed to fetch registration status' });
  }
}