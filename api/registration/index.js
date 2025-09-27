import jwt from 'jsonwebtoken';
import { getDatabaseClient } from "../../lib/database.js";

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

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

    // Fetch all tickets for the transaction
    const tickets = await db.execute({
      sql: `
        SELECT
          ticket_id,
          ticket_type,
          attendee_first_name,
          attendee_last_name,
          attendee_email,
          registration_status,
          registered_at,
          registration_deadline,
          CASE
            WHEN registration_status = 'completed' THEN 'completed'
            WHEN datetime('now') > registration_deadline THEN 'expired'
            ELSE registration_status
          END as current_status,
          CAST((julianday(registration_deadline) - julianday('now')) * 24 AS INTEGER) as hours_remaining
        FROM tickets
        WHERE transaction_id = ?
      `,
      args: [transactionId]
    });

    if (!tickets.rows || tickets.rows.length === 0) {
      console.log('[REG_STATUS] No tickets found for transaction ID:', transactionId);
      return res.status(404).json({ error: 'No tickets found for this transaction' });
    }

    console.log('[REG_STATUS] Raw database results:', tickets.rows);

    console.log('[REG_STATUS] Found tickets:', tickets.rows.map(t => ({
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
    const expiredTickets = tickets.rows.filter(t =>
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

    // Format response
    const response = {
      transactionId: transactionId,
      purchaserEmail: decoded.purchaserEmail,
      deadline: tickets.rows[0].registration_deadline,
      tickets: tickets.rows.map(ticket => ({
        ticketId: ticket.ticket_id,
        ticketType: ticket.ticket_type,
        status: ticket.current_status,
        registeredAt: ticket.registered_at,
        hoursRemaining: Math.max(0, Number(ticket.hours_remaining || 0)),
        attendee: ticket.attendee_first_name ? {
          firstName: ticket.attendee_first_name,
          lastName: ticket.attendee_last_name,
          email: ticket.attendee_email
        } : null
      }))
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