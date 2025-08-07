import ticketService from '../lib/ticket-service.js';
import tokenService from '../lib/token-service.js';
import { TOKEN_ACTIONS } from '../lib/ticket-config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { ticketId, actionToken, newAttendee } = req.body;

    if (!ticketId || !actionToken || !newAttendee) {
      return res.status(400).json({ 
        error: 'ticketId, actionToken, and newAttendee are required' 
      });
    }

    if (!newAttendee.email || !newAttendee.firstName) {
      return res.status(400).json({ 
        error: 'New attendee must have email and firstName' 
      });
    }

    // Validate action token
    const tokenValidation = await tokenService.validateActionToken(
      actionToken, 
      TOKEN_ACTIONS.TRANSFER, 
      ticketId
    );

    if (!tokenValidation.valid) {
      return res.status(401).json({ error: tokenValidation.error });
    }

    // Perform transfer
    const transferredTicket = await ticketService.transferTicket(ticketId, {
      firstName: newAttendee.firstName,
      lastName: newAttendee.lastName || '',
      email: newAttendee.email,
      phone: newAttendee.phone || null
    });

    return res.status(200).json({ 
      success: true,
      ticket: transferredTicket,
      message: 'Ticket successfully transferred'
    });

  } catch (error) {
    console.error('Ticket transfer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}