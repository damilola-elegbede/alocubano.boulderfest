import ticketService from "./ticket-service.js";
import { formatTicketType } from "./ticket-config.js";
import { getQRTokenService } from "./qr-token-service.js";
import { getBrevoService } from "./brevo-service.js";

export class TicketEmailService {
  constructor() {
    this.baseUrl = process.env.BASE_URL || "https://alocubano.com";
    this.eventDatesDisplay =
      process.env.EVENT_DATES_DISPLAY || "May 15-17, 2026";
    this.venueName = process.env.VENUE_NAME || "Avalon Ballroom";
    this.venueAddress =
      process.env.VENUE_ADDRESS || "6185 Arapahoe Road, Boulder, CO 80303";
  }
  /**
   * Send ticket confirmation email
   */
  async sendTicketConfirmation(transaction, tickets) {
    try {
      // Generate access token for secure ticket viewing
      const accessToken = await ticketService.generateAccessToken(
        transaction.id,
        transaction.customer_email,
      );

      // Format ticket details for email
      const ticketDetails = await this.formatTicketsForEmail(tickets);

      // Prepare email data with access token and order number
      const orderNumber = transaction.order_number || transaction.uuid;
      const emailData = {
        to: transaction.customer_email,
        subject: `Your A Lo Cubano Boulder Fest Tickets - Order #${orderNumber}`,
        html: this.generateTicketEmailHtml(
          transaction,
          tickets,
          ticketDetails,
          accessToken,
        ),
        text: this.generateTicketEmailText(
          transaction,
          tickets,
          ticketDetails,
          accessToken,
        ),
      };

      // Send email via Brevo if API key is configured
      if (process.env.BREVO_API_KEY) {
        try {
          const brevoService = await getBrevoService().ensureInitialized();

          // Use Brevo's transactional email API
          const result = await brevoService.sendTransactionalEmail({
            to: [{ email: emailData.to }],
            subject: emailData.subject,
            htmlContent: emailData.html,
            textContent: emailData.text,
            sender: {
              email: process.env.BREVO_SENDER_EMAIL || "noreply@alocubano.com",
              name: "A Lo Cubano Boulder Fest"
            },
            replyTo: {
              email: process.env.BREVO_REPLY_TO || "alocubanoboulderfest@gmail.com"
            }
          });

          console.log("Ticket confirmation email sent via Brevo:", {
            to: emailData.to,
            messageId: result.messageId
          });
        } catch (error) {
          console.error("Failed to send email via Brevo:", error);
          // Don't throw - allow purchase to complete even if email fails
        }
      } else {
        // Fallback: just log the email if Brevo is not configured
        console.log("Brevo not configured. Email content:", {
          to: emailData.to,
          subject: emailData.subject
        });
      }

      return { success: true, email: emailData.to, accessToken };
    } catch (error) {
      console.error("Failed to send ticket confirmation:", error);
      throw error;
    }
  }

  /**
   * Format tickets for email display
   */
  async formatTicketsForEmail(tickets) {
    const qrService = getQRTokenService();

    return Promise.all(
      tickets.map(async (ticket) => {
        const qrToken = await qrService.getOrCreateToken(ticket.ticket_id);
        const qrDataUrl = await qrService.generateQRImage(qrToken);

        return {
          ticketId: ticket.ticket_id,
          type: this.formatTicketType(ticket.ticket_type),
          attendee:
            `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim() ||
            "Guest",
          date: this.formatEventDate(ticket.event_date),
          qrCodeImage: qrDataUrl,
          qrToken: qrToken,
          webTicketUrl: `${this.baseUrl}/pages/my-ticket?id=${ticket.ticket_id}&token=${qrToken}`,
        };
      }),
    );
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
    if (!date) return this.eventDatesDisplay;

    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
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
          .ticket { background: #f8f9fa; border: 2px solid #CE1126; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .ticket-id { font-size: 12px; color: #666; }
          .ticket-type { font-weight: bold; color: #333; font-size: 18px; }
          .qr-container { text-align: center; margin: 20px 0; padding: 20px; background: white; border-radius: 8px; }
          .qr-code { width: 200px; height: 200px; padding: 10px; background: white; border: 1px solid #ddd; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .wallet-buttons { text-align: center; margin: 15px 0; }
          .wallet-button { display: inline-block; margin: 5px; }
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
            <p>Hello ${transaction.customer_name || "Dance Enthusiast"},</p>

            <p>Thank you for your purchase! Your tickets for A Lo Cubano Boulder Fest are confirmed.</p>

            <h2>Order Details</h2>
            <p><strong>Order Number:</strong> ${transaction.order_number || transaction.uuid}</p>
            <p><strong>Total Amount:</strong> $${(transaction.total_amount / 100).toFixed(2)}</p>

            <h2>Your Tickets</h2>
            ${ticketDetails
              .map(
                (ticket) => `
              <div class="ticket">
                <div class="ticket-type">${ticket.type}</div>
                <div class="ticket-id">Ticket ID: ${ticket.ticketId}</div>
                <div>Attendee: ${ticket.attendee}</div>
                <div>Date: ${ticket.date}</div>

                <!-- QR Code -->
                <div class="qr-container">
                  <img src="${ticket.qrCodeImage}" alt="QR Code" class="qr-code" />
                  <p style="font-size: 14px; color: #666; margin-top: 10px;">
                    Show this QR code at the event entrance
                  </p>
                  <a href="${ticket.webTicketUrl}"
                     style="display: inline-block; margin-top: 10px; color: #002868; text-decoration: underline;">
                    View ticket online →
                  </a>
                </div>

                <!-- Wallet buttons -->
                <div class="wallet-buttons">
                  <p style="margin-bottom: 10px; font-size: 14px;">Add to your phone's wallet:</p>
                  <div class="wallet-button">
                    <a href="${this.baseUrl}/api/tickets/apple-wallet/${ticket.ticketId}">
                      <img src="https://developer.apple.com/wallet/add-to-apple-wallet-badge.svg"
                           alt="Add to Apple Wallet" height="40" />
                    </a>
                  </div>
                  <div class="wallet-button">
                    <a href="${this.baseUrl}/api/tickets/google-wallet/${ticket.ticketId}">
                      <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                           alt="Add to Google Wallet" height="60" />
                    </a>
                  </div>
                </div>
              </div>
            `,
              )
              .join("")}

            <h2>Event Information</h2>
            <p><strong>Venue:</strong> ${this.venueName}</p>
            <p><strong>Address:</strong> ${this.venueAddress}</p>
            <p><strong>Dates:</strong> ${this.eventDatesDisplay}</p>

            <p style="text-align: center;">
              <a href="${this.baseUrl}/my-tickets?token=${encodeURIComponent(accessToken)}" class="button">
                View My Tickets
              </a>
            </p>

            <h2>How to Use Your Tickets</h2>
            <ul>
              <li><strong>Option 1:</strong> Show this email with QR codes at the entrance</li>
              <li><strong>Option 2:</strong> Add tickets to Apple/Google Wallet for easy access</li>
              <li><strong>Option 3:</strong> Screenshot or print the QR codes</li>
              <li><strong>Option 4:</strong> View tickets online using the link above</li>
            </ul>

            <h2>What to Bring</h2>
            <ul>
              <li>Your ticket QR code (email, wallet, or printed)</li>
              <li>Valid photo ID (21+ event)</li>
              <li>Dancing shoes!</li>
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

Hello ${transaction.customer_name || "Dance Enthusiast"},

Thank you for your purchase! Your tickets for A Lo Cubano Boulder Fest are confirmed.

ORDER DETAILS
Order Number: ${transaction.order_number || transaction.uuid}
Total Amount: $${(transaction.total_amount / 100).toFixed(2)}

YOUR TICKETS
${ticketDetails
  .map(
    (ticket) => `
- ${ticket.type}
  Ticket ID: ${ticket.ticketId}
  Attendee: ${ticket.attendee}
  Date: ${ticket.date}
`,
  )
  .join("\n")}

EVENT INFORMATION
Venue: ${this.venueName}
Address: ${this.venueAddress}
Dates: ${this.eventDatesDisplay}

View your tickets online:
${this.baseUrl}/my-tickets?token=${encodeURIComponent(accessToken)}

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
