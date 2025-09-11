import jwt from 'jsonwebtoken';
import { getDatabaseClient } from '../../lib/database.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader("Allow", "GET, OPTIONS");    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // Verify JWT token strictly with the registration secret
    const secret = process.env.REGISTRATION_JWT_SECRET;
    if (!secret) {
      console.error('Missing REGISTRATION_JWT_SECRET');
      return res.status(503).json({ error: 'Service misconfigured' });
    }
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    
    if (!decoded.transactionId) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

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
        WHERE stripe_payment_intent = ?
      `,
      args: [decoded.transactionId]
    });

    if (!tickets.rows || tickets.rows.length === 0) {
      return res.status(404).json({ error: 'No tickets found for this transaction' });
    }

    // Update expired tickets if needed
    const expiredTickets = tickets.rows.filter(t => 
      t.current_status === 'expired' && t.registration_status !== 'expired'
    );
    
    if (expiredTickets.length > 0) {
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
      transactionId: decoded.transactionId,
      purchaserEmail: decoded.purchaserEmail,
      deadline: tickets.rows[0].registration_deadline,
      tickets: tickets.rows.map(ticket => ({
        ticketId: ticket.ticket_id,
        ticketType: ticket.ticket_type,
        status: ticket.current_status,
        registeredAt: ticket.registered_at,
        hoursRemaining: Math.max(0, ticket.hours_remaining || 0),
        attendee: ticket.attendee_first_name ? {
          firstName: ticket.attendee_first_name,
          lastName: ticket.attendee_last_name,
          email: ticket.attendee_email
        } : null
      }))
    };

    res.status(200).json(response);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    console.error('Registration status error:', error);
    res.status(500).json({ error: 'Failed to fetch registration status' });
  }
}