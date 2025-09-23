import ticketService from "./ticket-service.js";
import { formatTicketType } from "./ticket-config.js";
import { getQRTokenService } from "./qr-token-service.js";
import { getBrevoService } from "./brevo-service.js";
import {
  isTestMode,
  getTestModeFlag,
  logTestModeOperation
} from "./test-mode-utils.js";

export class TicketEmailService {
  constructor() {
    this.baseUrl = process.env.BASE_URL || "https://alocubanoboulderfest.com";
    this.eventDatesDisplay =
      process.env.EVENT_DATES_DISPLAY || "May 15-17, 2026";
    this.venueName = process.env.VENUE_NAME || "Avalon Ballroom";
    this.venueAddress =
      process.env.VENUE_ADDRESS || "6185 Arapahoe Road, Boulder, CO 80303";
    this.templateId =
      parseInt(process.env.BREVO_TICKET_CONFIRMATION_TEMPLATE_ID) || 2;
    this.brevoService = null;
  }

  /**
   * Detect if a ticket is a test ticket
   */
  isTestTicket(ticket) {
    if (!ticket) return false;

    // Primary check: is_test field
    if (typeof ticket.is_test === 'number') {
      return ticket.is_test === 1;
    }

    // Fallback: check patterns in ticket ID
    const ticketId = ticket.ticket_id || ticket.id || '';
    return /test[_-]?ticket|^TEST[_-]|[_-]TEST$/i.test(ticketId);
  }

  /**
   * Detect if a transaction is a test transaction
   */
  isTestTransaction(transaction) {
    if (!transaction) return false;

    // Primary check: is_test field
    if (typeof transaction.is_test === 'number') {
      return transaction.is_test === 1;
    }

    // Fallback: check patterns in transaction ID or email
    const transactionId = transaction.transaction_id || transaction.id || '';
    const email = transaction.customer_email || '';
    return /test[_-]?transaction|^TEST[_-]|[_-]TEST$/i.test(transactionId) ||
           this.isTestEmail(email);
  }

  /**
   * Detect if an email is a test email
   */
  isTestEmail(email) {
    if (!email) return false;

    const testPatterns = [
      'test.com', 'example.com', 'mailinator.com',
      /test[._-]/i, /demo[._-]/i, /\+test@/i
    ];

    return testPatterns.some(pattern =>
      typeof pattern === 'string' ? email.includes(pattern) : pattern.test(email)
    );
  }

  /**
   * Get test mode prefix for email subjects
   */
  getTestModePrefix(isTest) {
    return isTest ? '[TEST] ' : '';
  }

  /**
   * Get test mode notice for email content
   */
  getTestModeNotice(isTest) {
    if (!isTest) return '';

    return `
⚠️ **TEST MODE NOTICE** ⚠️
This is a test email for development/testing purposes.
This ticket is not valid for actual event entry.
Test data may be automatically cleaned up periodically.
`;
  }

  /**
   * Initialize Brevo service
   */
  async initializeBrevo() {
    if (!this.brevoService) {
      this.brevoService = getBrevoService();
    }
    return this.brevoService;
  }

  /**
   * Send ticket confirmation email via Brevo
   */
  async sendTicketConfirmation(transaction, tickets) {
    try {
      // Initialize Brevo if needed
      const brevo = await this.initializeBrevo();

      // Detect test mode from transaction and tickets
      const isTest = this.isTestTransaction(transaction) || tickets.some(ticket => this.isTestTicket(ticket));

      // Determine payment processor and format transaction ID
      const paymentProcessor = transaction.payment_processor || (transaction.stripe_session_id ? 'stripe' : transaction.paypal_order_id ? 'paypal' : 'stripe');
      const processorTransactionId = transaction.paypal_order_id || transaction.stripe_session_id || transaction.uuid;
      const processorIcon = paymentProcessor === 'paypal' ? '💳' : '💰';

      // Log test mode operation
      logTestModeOperation(
        `Sending ticket confirmation email to ${transaction.customer_email}`,
        isTest,
        {
          transactionId: transaction.uuid,
          ticketCount: tickets.length,
          paymentProcessor,
          operation: 'ticket_confirmation_email'
        }
      );

      // Generate access token for secure ticket viewing
      const accessToken = await ticketService.generateAccessToken(
        transaction.id,
        transaction.customer_email,
      );

      // Format ticket details for email
      const ticketDetails = await this.formatTicketsForEmail(tickets);

      // Generate QR code for the first ticket (main QR for entry)
      const mainQRToken = ticketDetails[0]?.qrToken;
      const mainQRImage = ticketDetails[0]?.qrCodeImage;

      // Prepare test mode email content
      const testModePrefix = this.getTestModePrefix(isTest);
      const testModeNotice = this.getTestModeNotice(isTest);

      // Prepare Brevo transactional email parameters
      const emailParams = {
        to: [
          {
            email: transaction.customer_email,
            name: transaction.customer_name,
          },
        ],
        templateId: this.templateId,
        params: {
          CUSTOMER_NAME: transaction.customer_name || "Valued Customer",
          TRANSACTION_ID: transaction.uuid,
          PAYMENT_PROCESSOR: paymentProcessor.toUpperCase(),
          PAYMENT_PROCESSOR_ICON: processorIcon,
          PROCESSOR_TRANSACTION_ID: processorTransactionId,
          AMOUNT: (transaction.total_amount / 100).toFixed(2),
          TICKET_COUNT: tickets.length,
          EVENT_DATES: this.eventDatesDisplay,
          VENUE_NAME: this.venueName,
          VENUE_ADDRESS: this.venueAddress,
          TICKET_LINK: `${this.baseUrl}/pages/my-ticket?token=${accessToken}`,
          QR_CODE:
            mainQRImage ||
            `${this.baseUrl}/api/qr/generate?token=${mainQRToken}`,
          TICKET_DETAILS: this.formatTicketDetailsForEmail(ticketDetails),
          TEST_MODE_PREFIX: testModePrefix,
          TEST_MODE_NOTICE: testModeNotice,
          IS_TEST_MODE: isTest ? 'true' : 'false',
        },
        // Add tickets as attachment if needed
        attachment: this.generateTicketAttachment(transaction, ticketDetails),
        // Track this email with test mode indicators
        headers: {
          "X-Mailin-Tag": isTest ? "ticket-confirmation-test" : "ticket-confirmation",
          "X-Transaction-ID": transaction.uuid,
          "X-Payment-Processor": paymentProcessor,
          "X-Processor-Transaction-ID": processorTransactionId,
          "X-Test-Mode": isTest ? "true" : "false",
        },
      };

      // Send via Brevo API
      const response = await brevo.makeRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify(emailParams),
      });

      console.log("Ticket confirmation email sent:", {
        to: transaction.customer_email,
        transactionId: transaction.uuid,
        paymentProcessor,
        processorTransactionId,
        messageId: response.messageId,
        isTestMode: isTest,
        emailTag: isTest ? "ticket-confirmation-test" : "ticket-confirmation",
      });

      return {
        success: true,
        email: transaction.customer_email,
        accessToken,
        messageId: response.messageId,
      };
    } catch (error) {
      console.error("Failed to send ticket confirmation:", error);

      // Fallback: Log email details for manual sending if needed
      console.log("Email details for manual sending:", {
        to: transaction.customer_email,
        transactionId: transaction.uuid,
        ticketCount: tickets.length,
      });

      throw error;
    }
  }

  /**
   * Format ticket details as HTML table for email
   */
  formatTicketDetailsForEmail(ticketDetails) {
    if (!ticketDetails || ticketDetails.length === 0) return "";

    const rows = ticketDetails
      .map(
        (ticket) => `
      <tr>
        <td>${ticket.ticketId}</td>
        <td>${ticket.type}</td>
        <td>${ticket.attendee}</td>
        <td>${ticket.date}</td>
      </tr>
    `,
      )
      .join("");

    return `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding: 10px; text-align: left;">Ticket ID</th>
            <th style="padding: 10px; text-align: left;">Type</th>
            <th style="padding: 10px; text-align: left;">Attendee</th>
            <th style="padding: 10px; text-align: left;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  /**
   * Generate ticket PDF attachment (optional)
   */
  generateTicketAttachment(transaction, ticketDetails) {
    // Optional: Generate PDF attachment with all tickets
    // For now, return empty array (no attachments)
    return [];

    // Future implementation:
    // return [{
    //   name: `tickets_${transaction.uuid}.pdf`,
    //   content: base64EncodedPDF,
    // }];
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
   * Send registration invitation email for pending tickets
   */
  async sendRegistrationInvitation(options) {
    const {
      transactionId,
      customerEmail,
      customerName,
      ticketCount,
      registrationToken,
      registrationDeadline,
      tickets,
      paymentProcessor = 'stripe',
      processorTransactionId
    } = options;

    try {
      // Initialize Brevo if needed
      const brevo = await this.initializeBrevo();

      // Detect test mode from tickets
      const isTest = tickets && tickets.some(ticket => this.isTestTicket(ticket));

      // Log test mode operation
      logTestModeOperation(
        `Sending registration invitation email to ${customerEmail}`,
        isTest,
        {
          transactionId,
          ticketCount,
          paymentProcessor,
          operation: 'registration_invitation_email'
        }
      );

      // Format deadline for display
      const deadlineDate = new Date(registrationDeadline);
      const deadlineDisplay = deadlineDate.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      });

      // Create registration URL
      const registrationUrl = `${this.baseUrl}/pages/register-tickets?token=${registrationToken}`;

      // Prepare test mode content
      const testModePrefix = this.getTestModePrefix(isTest);
      const testModeNotice = this.getTestModeNotice(isTest);

      // Prepare email parameters
      const emailParams = {
        to: [
          {
            email: customerEmail,
            name: customerName || "Valued Customer",
          },
        ],
        templateId: parseInt(process.env.BREVO_REGISTRATION_INVITATION_TEMPLATE_ID) || 3,
        params: {
          CUSTOMER_NAME: customerName || "Valued Customer",
          TRANSACTION_ID: transactionId,
          PAYMENT_PROCESSOR: paymentProcessor.toUpperCase(),
          PROCESSOR_TRANSACTION_ID: processorTransactionId || transactionId,
          TICKET_COUNT: ticketCount,
          EVENT_DATES: this.eventDatesDisplay,
          VENUE_NAME: this.venueName,
          VENUE_ADDRESS: this.venueAddress,
          REGISTRATION_URL: registrationUrl,
          REGISTRATION_DEADLINE: deadlineDisplay,
          TICKET_TYPES: this.formatTicketTypesForEmail(tickets),
          TEST_MODE_PREFIX: testModePrefix,
          TEST_MODE_NOTICE: testModeNotice,
          IS_TEST_MODE: isTest ? 'true' : 'false',
        },
        headers: {
          "X-Mailin-Tag": isTest ? "registration-invitation-test" : "registration-invitation",
          "X-Transaction-ID": transactionId,
          "X-Payment-Processor": paymentProcessor,
          "X-Processor-Transaction-ID": processorTransactionId || transactionId,
          "X-Test-Mode": isTest ? "true" : "false",
        },
      };

      // Send via Brevo API
      const response = await brevo.makeRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify(emailParams),
      });

      console.log("Registration invitation email sent:", {
        to: customerEmail,
        transactionId,
        paymentProcessor,
        processorTransactionId: processorTransactionId || transactionId,
        messageId: response.messageId,
        isTestMode: isTest,
        emailTag: isTest ? "registration-invitation-test" : "registration-invitation",
      });

      return {
        success: true,
        email: customerEmail,
        messageId: response.messageId,
      };
    } catch (error) {
      console.error("Failed to send registration invitation:", error);

      // Fallback: Log email details for manual sending if needed
      console.log("Registration invitation details for manual sending:", {
        to: customerEmail,
        transactionId,
        ticketCount,
        registrationToken,
      });

      throw error;
    }
  }

  /**
   * Send registration reminder email
   */
  async sendRegistrationReminder(options) {
    const {
      ticketId,
      transactionId,
      customerEmail,
      customerName,
      reminderType,
      registrationToken,
      registrationDeadline,
      ticketsRemaining,
      ticket  // Add ticket object to options for test mode detection
    } = options;

    try {
      // Initialize Brevo if needed
      const brevo = await this.initializeBrevo();

      // Detect test mode from ticket or fallback to email pattern
      const isTest = (ticket && this.isTestTicket(ticket)) || this.isTestEmail(customerEmail);

      // Log test mode operation
      logTestModeOperation(
        `Sending registration reminder (${reminderType}) email to ${customerEmail}`,
        isTest,
        {
          ticketId,
          transactionId,
          reminderType,
          operation: 'registration_reminder_email'
        }
      );

      // Format deadline for display
      const deadlineDate = new Date(registrationDeadline);
      const deadlineDisplay = deadlineDate.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      });

      // Calculate time remaining
      const now = new Date();
      const hoursRemaining = Math.max(0, Math.floor((deadlineDate - now) / (1000 * 60 * 60)));

      // Create registration URL
      const registrationUrl = `${this.baseUrl}/pages/register-tickets?token=${registrationToken}`;

      // Determine reminder urgency text
      let urgencyText = "";
      switch (reminderType) {
        case "72hr":
          urgencyText = "You have 3 days to complete your registration";
          break;
        case "48hr":
          urgencyText = "Only 2 days left to register your tickets";
          break;
        case "24hr":
          urgencyText = "Last day to register - don't miss out!";
          break;
        case "final":
          urgencyText = "FINAL REMINDER: Only 2 hours left!";
          break;
      }

      // Prepare test mode content
      const testModePrefix = this.getTestModePrefix(isTest);
      const testModeNotice = this.getTestModeNotice(isTest);

      // Prepare email parameters
      const emailParams = {
        to: [
          {
            email: customerEmail,
            name: customerName || "Valued Customer",
          },
        ],
        templateId: parseInt(process.env.BREVO_REGISTRATION_REMINDER_TEMPLATE_ID) || 4,
        params: {
          CUSTOMER_NAME: customerName || "Valued Customer",
          TRANSACTION_ID: transactionId,
          URGENCY_TEXT: urgencyText,
          HOURS_REMAINING: hoursRemaining,
          TICKETS_REMAINING: ticketsRemaining,
          EVENT_DATES: this.eventDatesDisplay,
          VENUE_NAME: this.venueName,
          REGISTRATION_URL: registrationUrl,
          REGISTRATION_DEADLINE: deadlineDisplay,
          REMINDER_TYPE: reminderType,
          TEST_MODE_PREFIX: testModePrefix,
          TEST_MODE_NOTICE: testModeNotice,
          IS_TEST_MODE: isTest ? 'true' : 'false',
        },
        headers: {
          "X-Mailin-Tag": isTest ? `registration-reminder-${reminderType}-test` : `registration-reminder-${reminderType}`,
          "X-Transaction-ID": transactionId,
          "X-Ticket-ID": ticketId,
          "X-Test-Mode": isTest ? "true" : "false",
        },
      };

      // Send via Brevo API
      const response = await brevo.makeRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify(emailParams),
      });

      console.log(`Registration reminder (${reminderType}) email sent:`, {
        to: customerEmail,
        transactionId,
        ticketId,
        messageId: response.messageId,
        isTestMode: isTest,
        emailTag: isTest ? `registration-reminder-${reminderType}-test` : `registration-reminder-${reminderType}`,
      });

      return {
        success: true,
        email: customerEmail,
        messageId: response.messageId,
      };
    } catch (error) {
      console.error(`Failed to send registration reminder (${reminderType}):`, error);
      throw error;
    }
  }

  /**
   * Format ticket types for email display
   */
  formatTicketTypesForEmail(tickets) {
    if (!tickets || tickets.length === 0) return "";

    const typeCounts = {};
    for (const ticket of tickets) {
      const type = ticket.type || "General";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    return Object.entries(typeCounts)
      .map(([type, count]) => `${count}x ${this.formatTicketType(type)}`)
      .join(", ");
  }

  /**
   * Send ticket reminder email (24 hours before event)
   */
  async sendTicketReminder(transaction, tickets) {
    // TODO: Implement reminder email with different template
    console.log("Ticket reminder not yet implemented");
  }

  /**
   * Send ticket transfer notification
   */
  async sendTicketTransferNotification(originalEmail, newEmail, ticket) {
    // TODO: Implement transfer notification
    console.log("Ticket transfer notification not yet implemented");
  }
}

// Export singleton instance
let ticketEmailServiceInstance = null;

export function getTicketEmailService() {
  if (!ticketEmailServiceInstance) {
    ticketEmailServiceInstance = new TicketEmailService();
  }
  return ticketEmailServiceInstance;
}

export default new TicketEmailService();
