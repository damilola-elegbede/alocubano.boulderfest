import ticketService from '../lib/ticket-service.js';
import tokenService from '../lib/token-service.js';
import { TOKEN_ACTIONS } from '../lib/ticket-config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { ticketId, actionToken, reason } = req.body;

    if (!ticketId || !actionToken) {
      return res.status(400).json({ 
        error: 'ticketId and actionToken are required' 
      });
    }

    // Validate action token
    const tokenValidation = await tokenService.validateActionToken(
      actionToken, 
      TOKEN_ACTIONS.CANCEL, 
      ticketId
    );

    if (!tokenValidation.valid) {
      return res.status(401).json({ error: tokenValidation.error });
    }

    // Perform cancellation
    const cancelledTicket = await ticketService.cancelTicket(
      ticketId, 
      reason || 'Customer request'
    );

    return res.status(200).json({ 
      success: true,
      ticket: cancelledTicket,
      message: 'Ticket successfully cancelled'
    });

  } catch (error) {
    console.error('Ticket cancellation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}