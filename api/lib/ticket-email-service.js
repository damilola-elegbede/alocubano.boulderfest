import ticketService from './ticket-service.js';
import { formatTicketType } from './ticket-config.js';

export class TicketEmailService {
  /**
   * Send ticket confirmation email
   */
  async sendTicketConfirmation(transaction, tickets) {
    try {
      // Generate access token for secure ticket viewing
      const accessToken = await ticketService.generateAccessToken(
        transaction.id,
        transaction.customer_email
      );

      // Format ticket details for email
      const ticketDetails = this.formatTicketsForEmail(tickets);
      
      // Prepare email data with access token
      const emailData = {
        to: transaction.customer_email,
        subject: 'Your A Lo Cubano Boulder Fest Tickets',
        html: this.generateTicketEmailHtml(transaction, tickets, ticketDetails, accessToken),
        text: this.generateTicketEmailText(transaction, tickets, ticketDetails, accessToken)
      };
      
      // TODO: In production, integrate with Brevo
      // For now, log the email
      console.log('Ticket confirmation email:', emailData);
      
      return { success: true, email: emailData.to, accessToken };
      
    } catch (error) {
      console.error('Failed to send ticket confirmation:', error);
      throw error;
    }
  }

  /**
   * Format tickets for email display
   */
  formatTicketsForEmail(tickets) {
    return tickets.map(ticket => ({
      ticketId: ticket.ticket_id,
      type: this.formatTicketType(ticket.ticket_type),
      attendee: `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim() || 'Guest',
      date: this.formatEventDate(ticket.event_date)
    }));
  }

  /**
   * Format ticket type for display
   */
  formatTicketType(type) {
    return formatTicketType(type);
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
   * Generate HTML email content
   */
  generateTicketEmailHtml(transaction, tickets, ticketDetails, accessToken) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px; }
          .ticket { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; }
          .ticket-id { font-size: 12px; color: #666; }
          .ticket-type { font-weight: bold; color: #333; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Your Tickets Are Confirmed!</h1>
            <p>A Lo Cubano Boulder Fest 2026</p>
          </div>
          
          <div class="content">
            <p>Hello ${transaction.customer_name || 'Dance Enthusiast'},</p>
            
            <p>Thank you for your purchase! Your tickets for A Lo Cubano Boulder Fest are confirmed.</p>
            
            <h2>Order Details</h2>
            <p><strong>Order Number:</strong> ${transaction.uuid}</p>
            <p><strong>Total Amount:</strong> $${(transaction.total_amount / 100).toFixed(2)}</p>
            
            <h2>Your Tickets</h2>
            ${ticketDetails.map(ticket => `
              <div class="ticket">
                <div class="ticket-type">${ticket.type}</div>
                <div class="ticket-id">Ticket ID: ${ticket.ticketId}</div>
                <div>Attendee: ${ticket.attendee}</div>
                <div>Date: ${ticket.date}</div>
                
                <!-- Add wallet buttons -->
                <div style="text-align: center; margin: 20px 0;">
                  <a href="${this.baseUrl}/api/tickets/apple-wallet/${ticket.ticketId}"
                     style="display: inline-block; margin: 5px; padding: 10px 20px; 
                            background: #000; color: white; text-decoration: none; 
                            border-radius: 5px; font-size: 14px;">
                    📱 Add to Apple Wallet
                  </a>
                  <a href="${this.baseUrl}/api/tickets/google-wallet/${ticket.ticketId}"
                     style="display: inline-block; margin: 5px; padding: 10px 20px; 
                            background: #4285f4; color: white; text-decoration: none; 
                            border-radius: 5px; font-size: 14px;">
                    📱 Add to Google Wallet
                  </a>
                </div>
              </div>
            `).join('')}
            
            <h2>Event Information</h2>
            <p><strong>Venue:</strong> Avalon Ballroom</p>
            <p><strong>Address:</strong> 6185 Arapahoe Road, Boulder, CO 80303</p>
            <p><strong>Dates:</strong> May 15-17, 2026</p>
            
            <p style="text-align: center;">
              <a href="https://alocubano.com/my-tickets?token=${encodeURIComponent(accessToken)}" class="button">
                View My Tickets
              </a>
            </p>
            
            <h2>What's Next?</h2>
            <ul>
              <li>Save this email for your records</li>
              <li>Each ticket has a unique ID for entry</li>
              <li>Tickets will be scanned at the door</li>
              <li>Bring a valid photo ID</li>
            </ul>
            
            <p>Questions? Reply to this email or contact us at alocubanoboulderfest@gmail.com</p>
            
            <p>We can't wait to see you on the dance floor!</p>
            
            <p>Warm regards,<br>
            The A Lo Cubano Team</p>
          </div>
          
          <div class="footer">
            <p>A Lo Cubano Boulder Fest | Boulder, Colorado</p>
            <p>© 2026 All rights reserved</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate plain text email content
   */
  generateTicketEmailText(transaction, tickets, ticketDetails, accessToken) {
    return `
Your Tickets Are Confirmed!
A Lo Cubano Boulder Fest 2026

Hello ${transaction.customer_name || 'Dance Enthusiast'},

Thank you for your purchase! Your tickets for A Lo Cubano Boulder Fest are confirmed.

ORDER DETAILS
Order Number: ${transaction.uuid}
Total Amount: $${(transaction.total_amount / 100).toFixed(2)}

YOUR TICKETS
${ticketDetails.map(ticket => `
- ${ticket.type}
  Ticket ID: ${ticket.ticketId}
  Attendee: ${ticket.attendee}
  Date: ${ticket.date}
`).join('\n')}

EVENT INFORMATION
Venue: Avalon Ballroom
Address: 6185 Arapahoe Road, Boulder, CO 80303
Dates: May 15-17, 2026

View your tickets online:
https://alocubano.com/my-tickets?token=${encodeURIComponent(accessToken)}

WHAT'S NEXT?
- Save this email for your records
- Each ticket has a unique ID for entry
- Tickets will be scanned at the door
- Bring a valid photo ID

Questions? Reply to this email or contact us at alocubanoboulderfest@gmail.com

We can't wait to see you on the dance floor!

Warm regards,
The A Lo Cubano Team
    `;
  }
}

export default new TicketEmailService();