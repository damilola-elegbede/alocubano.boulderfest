import { getDatabase } from './database.js';

export class TicketService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Generate a unique ticket ID
   */
  generateTicketId() {
    const prefix = process.env.TICKET_PREFIX || 'TKT';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create tickets from a transaction
   */
  async createTicketsFromTransaction(transaction, lineItems = []) {
    const tickets = [];
    
    try {
      // Parse order data to get cart items
      const orderData = JSON.parse(transaction.order_details || '{}');
      const cartItems = orderData.line_items || lineItems || [];
      
      for (const item of cartItems) {
        // Only create tickets for ticket items
        if (!this.isTicketItem(item)) {
          console.log(`Skipping non-ticket item: ${item.description}`);
          continue;
        }
        
        // Determine quantity
        const quantity = item.quantity || 1;
        
        // Create individual tickets for each quantity
        for (let i = 0; i < quantity; i++) {
          const ticket = await this.createSingleTicket(transaction, item, i + 1, quantity);
          tickets.push(ticket);
        }
      }
      
      console.log(`Created ${tickets.length} tickets for transaction ${transaction.uuid}`);
      return tickets;
      
    } catch (error) {
      console.error('Failed to create tickets:', error);
      throw error;
    }
  }

  /**
   * Check if a line item is a ticket
   */
  isTicketItem(item) {
    const description = (item.description || item.price?.product?.name || '').toLowerCase();
    return description.includes('ticket') || 
           description.includes('pass') || 
           description.includes('workshop') ||
           description.includes('registration');
  }

  /**
   * Create a single ticket
   */
  async createSingleTicket(transaction, item, index, total) {
    const ticketId = this.generateTicketId();
    const ticketType = this.extractTicketType(item);
    const eventId = transaction.event_id || 'boulder-fest-2026';
    const eventDate = this.getEventDate(eventId, ticketType);
    
    // Parse customer name
    const names = this.parseCustomerName(transaction.customer_name);
    
    // Create ticket record
    const result = await this.db.execute({
      sql: `INSERT INTO tickets (
        ticket_id, transaction_id, ticket_type, event_id, event_date,
        price_cents, attendee_first_name, attendee_last_name,
        attendee_email, status, ticket_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ticketId,
        transaction.id,
        ticketType,
        eventId,
        eventDate,
        item.price?.unit_amount || item.amount_total || 0,
        names.firstName,
        names.lastName,
        transaction.customer_email,
        'valid',
        JSON.stringify({
          item_description: item.description,
          item_index: index,
          total_quantity: total,
          product_id: item.price?.product?.id,
          product_metadata: item.price?.product?.metadata
        })
      ]
    });
    
    // Return the created ticket
    const ticket = await this.getByTicketId(ticketId);
    return ticket;
  }

  /**
   * Parse customer name into first and last
   */
  parseCustomerName(fullName) {
    if (!fullName) {
      return { firstName: '', lastName: '' };
    }
    
    const parts = fullName.trim().split(/\s+/);
    
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }
    
    // Assume last word is last name, everything else is first name
    const lastName = parts.pop();
    const firstName = parts.join(' ');
    
    return { firstName, lastName };
  }

  /**
   * Extract ticket type from line item
   */
  extractTicketType(item) {
    const description = (item.description || item.price?.product?.name || '').toLowerCase();
    
    // Check for specific ticket types
    if (description.includes('vip')) return 'vip-pass';
    if (description.includes('weekend')) return 'weekend-pass';
    if (description.includes('friday')) return 'friday-pass';
    if (description.includes('saturday')) return 'saturday-pass';
    if (description.includes('sunday')) return 'sunday-pass';
    if (description.includes('workshop')) {
      if (description.includes('beginner')) return 'workshop-beginner';
      if (description.includes('intermediate')) return 'workshop-intermediate';
      if (description.includes('advanced')) return 'workshop-advanced';
      return 'workshop';
    }
    if (description.includes('social')) return 'social-dance';
    
    return 'general-admission';
  }

  /**
   * Get event date based on event ID and ticket type
   */
  getEventDate(eventId, ticketType) {
    // Boulder Fest 2026 dates
    if (eventId === 'boulder-fest-2026') {
      if (ticketType.includes('friday')) return '2026-05-15';
      if (ticketType.includes('saturday')) return '2026-05-16';
      if (ticketType.includes('sunday')) return '2026-05-17';
      return '2026-05-15'; // Default to first day
    }
    
    // Return null for unknown events
    return null;
  }

  /**
   * Get ticket by ticket ID
   */
  async getByTicketId(ticketId) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
      args: [ticketId]
    });
    return result.rows[0];
  }

  /**
   * Get all tickets for a transaction
   */
  async getTransactionTickets(transactionId) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ? ORDER BY created_at',
      args: [transactionId]
    });
    return result.rows;
  }

  /**
   * Update attendee information
   */
  async updateAttendeeInfo(ticketId, attendeeInfo) {
    const updates = [];
    const args = [];
    
    if (attendeeInfo.firstName !== undefined) {
      updates.push('attendee_first_name = ?');
      args.push(attendeeInfo.firstName);
    }
    
    if (attendeeInfo.lastName !== undefined) {
      updates.push('attendee_last_name = ?');
      args.push(attendeeInfo.lastName);
    }
    
    if (attendeeInfo.email !== undefined) {
      updates.push('attendee_email = ?');
      args.push(attendeeInfo.email);
    }
    
    if (attendeeInfo.phone !== undefined) {
      updates.push('attendee_phone = ?');
      args.push(attendeeInfo.phone);
    }
    
    if (updates.length === 0) {
      return null;
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    args.push(ticketId);
    
    await this.db.execute({
      sql: `UPDATE tickets SET ${updates.join(', ')} WHERE ticket_id = ?`,
      args
    });
    
    return this.getByTicketId(ticketId);
  }

  /**
   * Get tickets by email
   */
  async getTicketsByEmail(email) {
    const result = await this.db.execute({
      sql: `SELECT t.*, tr.uuid as order_number
            FROM tickets t
            JOIN transactions tr ON t.transaction_id = tr.id
            WHERE t.attendee_email = ? OR tr.customer_email = ?
            ORDER BY t.created_at DESC`,
      args: [email, email]
    });
    return result.rows;
  }

  /**
   * Cancel a ticket
   */
  async cancelTicket(ticketId, reason = null) {
    await this.db.execute({
      sql: `UPDATE tickets 
            SET status = 'cancelled', 
                updated_at = CURRENT_TIMESTAMP,
                ticket_metadata = json_patch(ticket_metadata, '{"cancellation_reason": "' || ? || '"}')
            WHERE ticket_id = ?`,
      args: [reason || 'Customer request', ticketId]
    });
    
    return this.getByTicketId(ticketId);
  }

  /**
   * Transfer a ticket to another person
   */
  async transferTicket(ticketId, newAttendee) {
    const ticket = await this.getByTicketId(ticketId);
    
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // Store original attendee info in metadata
    const metadata = JSON.parse(ticket.ticket_metadata || '{}');
    metadata.transferred_from = {
      first_name: ticket.attendee_first_name,
      last_name: ticket.attendee_last_name,
      email: ticket.attendee_email,
      transferred_at: new Date().toISOString()
    };
    
    // Update ticket with new attendee
    await this.db.execute({
      sql: `UPDATE tickets 
            SET attendee_first_name = ?,
                attendee_last_name = ?,
                attendee_email = ?,
                attendee_phone = ?,
                status = 'transferred',
                ticket_metadata = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE ticket_id = ?`,
      args: [
        newAttendee.firstName,
        newAttendee.lastName,
        newAttendee.email,
        newAttendee.phone || null,
        JSON.stringify(metadata),
        ticketId
      ]
    });
    
    return this.getByTicketId(ticketId);
  }
}

export default new TicketService();