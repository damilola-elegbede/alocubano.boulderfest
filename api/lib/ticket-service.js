import { getDatabase } from './database.js';
import tokenService from './token-service.js';
import {
  TICKET_TYPE_MAP,
  TICKET_STATUS,
  formatTicketType,
  getEventDate,
  isTicketItem,
  extractTicketType
} from './ticket-config.js';
import appleWalletService from './apple-wallet-service.js';
import googleWalletService from './google-wallet-service.js';

export class TicketService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Generate a unique ticket ID using cryptographically secure random
   */
  generateTicketId() {
    return tokenService.generateTicketId();
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
    return isTicketItem(item);
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
    
    // Generate wallet passes if enabled
    if (process.env.WALLET_ENABLE_GENERATION !== 'false') {
      // Generate Apple Wallet pass
      if (appleWalletService.isConfigured()) {
        try {
          await appleWalletService.generatePass(ticketId);
          console.log(`Generated Apple Wallet pass for ticket ${ticketId}`);
        } catch (error) {
          console.error(`Failed to generate Apple Wallet pass for ticket ${ticketId}:`, error);
        }
      }
      
      // Generate Google Wallet pass
      if (googleWalletService.isConfigured()) {
        try {
          await googleWalletService.generatePass(ticketId);
          console.log(`Generated Google Wallet pass for ticket ${ticketId}`);
        } catch (error) {
          console.error(`Failed to generate Google Wallet pass for ticket ${ticketId}:`, error);
        }
      }
    }
    
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
    return extractTicketType(item);
  }

  /**
   * Get event date based on event ID and ticket type
   */
  getEventDate(eventId, ticketType) {
    return getEventDate(eventId, ticketType);
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
   * Cancel a ticket with secure parameter handling
   */
  async cancelTicket(ticketId, reason = null) {
    const ticket = await this.getByTicketId(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // Parse existing metadata safely
    const metadata = JSON.parse(ticket.ticket_metadata || '{}');
    metadata.cancellation_reason = reason || 'Customer request';
    metadata.cancelled_at = new Date().toISOString();

    await this.db.execute({
      sql: `UPDATE tickets 
            SET status = ?, 
                updated_at = CURRENT_TIMESTAMP,
                ticket_metadata = ?
            WHERE ticket_id = ?`,
      args: [TICKET_STATUS.CANCELLED, JSON.stringify(metadata), ticketId]
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
                status = ?,
                ticket_metadata = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE ticket_id = ?`,
      args: [
        newAttendee.firstName,
        newAttendee.lastName,
        newAttendee.email,
        newAttendee.phone || null,
        TICKET_STATUS.TRANSFERRED,
        JSON.stringify(metadata),
        ticketId
      ]
    });
    
    return this.getByTicketId(ticketId);
  }

  /**
   * Generate and store QR code data for ticket validation
   */
  async generateQRCode(ticketId) {
    const ticket = await this.getByTicketId(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const validation = tokenService.generateValidationToken(
      ticket.ticket_id,
      ticket.event_id,
      ticket.attendee_email
    );

    await this.db.execute({
      sql: `UPDATE tickets 
            SET validation_signature = ?, qr_code_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE ticket_id = ?`,
      args: [validation.signature, validation.qr_data, ticketId]
    });

    return {
      ticketId: ticket.ticket_id,
      qrData: validation.qr_data,
      signature: validation.signature
    };
  }

  /**
   * Validate QR code and mark ticket as used
   */
  async validateAndCheckIn(qrData, checkInLocation = null, checkInBy = null) {
    const validation = tokenService.validateQRCode(qrData);
    
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const ticket = await this.getByTicketId(validation.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    if (ticket.status === TICKET_STATUS.USED) {
      return { 
        success: false, 
        error: 'Ticket already used',
        checkedInAt: ticket.checked_in_at 
      };
    }

    if (ticket.status !== TICKET_STATUS.VALID) {
      return { 
        success: false, 
        error: `Cannot check in ${ticket.status} ticket` 
      };
    }

    // Mark ticket as used
    await this.db.execute({
      sql: `UPDATE tickets 
            SET status = ?, 
                checked_in_at = CURRENT_TIMESTAMP,
                checked_in_by = ?,
                check_in_location = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE ticket_id = ?`,
      args: [TICKET_STATUS.USED, checkInBy, checkInLocation, ticket.ticket_id]
    });

    const updatedTicket = await this.getByTicketId(ticket.ticket_id);
    
    return {
      success: true,
      ticket: updatedTicket,
      attendee: `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
      ticketType: formatTicketType(ticket.ticket_type)
    };
  }

  /**
   * Get tickets by access token
   */
  async getTicketsByAccessToken(accessToken) {
    const tokenValidation = await tokenService.validateAccessToken(accessToken);
    
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }

    const tickets = await this.getTransactionTickets(tokenValidation.transactionId);
    
    // Enrich with formatted data
    return tickets.map(ticket => ({
      ...ticket,
      formatted_type: formatTicketType(ticket.ticket_type),
      formatted_date: this.formatEventDate(ticket.event_date)
    }));
  }

  /**
   * Format event date for display
   */
  formatEventDate(date) {
    if (!date) return 'May 15-17, 2026';
    
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  /**
   * Generate access token for ticket viewing
   */
  async generateAccessToken(transactionId, email) {
    return await tokenService.generateAccessToken(transactionId, email);
  }

  /**
   * Generate action token for secure operations
   */
  async generateActionToken(action, targetId, email) {
    return await tokenService.generateActionToken(action, targetId, email);
  }
}

export default new TicketService();