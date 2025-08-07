import { getDatabase } from '../lib/database.js';
import ticketService from '../lib/ticket-service.js';

export default async function handler(req, res) {
  const db = getDatabase();

  try {
    if (req.method === 'GET') {
      const { email, ticket_id, transaction_id } = req.query;
      
      if (ticket_id) {
        // Get single ticket
        const ticket = await ticketService.getByTicketId(ticket_id);
        
        if (!ticket) {
          return res.status(404).json({ error: 'Ticket not found' });
        }
        
        return res.status(200).json({ ticket });
      }
      
      if (email) {
        // Get tickets by email
        const tickets = await ticketService.getTicketsByEmail(email);
        return res.status(200).json({ tickets });
      }
      
      if (transaction_id) {
        // Get tickets for a transaction
        const result = await db.execute({
          sql: 'SELECT id FROM transactions WHERE uuid = ?',
          args: [transaction_id]
        });
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Transaction not found' });
        }
        
        const tickets = await ticketService.getTransactionTickets(result.rows[0].id);
        return res.status(200).json({ tickets });
      }
      
      return res.status(400).json({ error: 'Email, ticket_id, or transaction_id required' });
      
    } else if (req.method === 'PUT') {
      // Update ticket attendee information
      const { ticket_id } = req.query;
      const { firstName, lastName, email, phone } = req.body;
      
      if (!ticket_id) {
        return res.status(400).json({ error: 'Ticket ID required' });
      }
      
      const updatedTicket = await ticketService.updateAttendeeInfo(ticket_id, {
        firstName,
        lastName,
        email,
        phone
      });
      
      if (!updatedTicket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      
      return res.status(200).json({ ticket: updatedTicket });
      
    } else if (req.method === 'POST') {
      // Handle ticket actions
      const { action, ticket_id } = req.body;
      
      if (!ticket_id) {
        return res.status(400).json({ error: 'Ticket ID required' });
      }
      
      switch (action) {
        case 'cancel': {
          const { reason } = req.body;
          const cancelledTicket = await ticketService.cancelTicket(ticket_id, reason);
          return res.status(200).json({ ticket: cancelledTicket });
        }
        
        case 'transfer': {
          const { firstName, lastName, email, phone } = req.body;
          
          if (!email) {
            return res.status(400).json({ error: 'New attendee email required' });
          }
          
          const transferredTicket = await ticketService.transferTicket(ticket_id, {
            firstName,
            lastName,
            email,
            phone
          });
          
          return res.status(200).json({ ticket: transferredTicket });
        }
        
        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
      
    } else {
      res.setHeader('Allow', ['GET', 'PUT', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    
  } catch (error) {
    console.error('Ticket API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}