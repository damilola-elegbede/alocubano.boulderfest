import ticketService from "./ticket-service.js";
import { formatTicketType } from "./ticket-config.js";
import { getQRTokenService } from "./qr-token-service.js";
import { getBrevoService } from "./brevo-service.js";
import { getDatabaseClient } from "./database.js";
import { processDatabaseResult } from "./bigint-serializer.js";
import timeUtils from "./time-utils.js";
import {
  isTestMode,
  getTestModeFlag,
  logTestModeOperation
} from "./test-mode-utils.js";
import { generateOrderConfirmationEmail } from "./email-templates/order-confirmation.js";
import { generateRegistrationReminderEmail } from "./email-templates/registration-reminder.js";
import { generateAttendeeConfirmationEmail } from "./email-templates/attendee-confirmation.js";
import { getBaseUrl } from "./url-utils.js";
import { generateEmailCard } from "./email-format-utils.js";

export class TicketEmailService {
  constructor() {
    // Use centralized base URL utility
    this.baseUrl = getBaseUrl();
    this.eventDatesDisplay =
      process.env.EVENT_DATES_DISPLAY || "May 15-17, 2026";
    this.venueName = process.env.VENUE_NAME || "Avalon Ballroom";
    this.venueAddress =
      process.env.VENUE_ADDRESS || "6185 Arapahoe Road, Boulder, CO 80303";
    this.templateId =
      parseInt(process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID);
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
    const ticketId = ticket.ticket_id || '';
    if (!ticket.ticket_id) {
      console.error('[TicketEmailService] Missing ticket_id field, cannot detect test ticket reliably', { ticket });
    }
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
   * @param {Object} transaction - Transaction record from database
   */
  async sendTicketConfirmation(transaction) {
    // CRITICAL: Log entry with full context for debugging
    // FIX: Add null safety for timestamp and BigInt fields to prevent toISOString() errors
    console.log('🎫 [TicketEmail] sendTicketConfirmation called:', {
      transactionId: transaction.id,
      transactionUuid: transaction.uuid,
      customerEmail: transaction.customer_email,
      customerName: transaction.customer_name,
      orderNumber: transaction.order_number,
      totalAmount: transaction.total_amount,
      paymentProcessor: transaction.payment_processor,
      // Log transaction object type for BigInt debugging with null safety
      transactionIdType: typeof transaction.id,
      totalAmountType: typeof transaction.total_amount,
      // Add safe timestamp logging (guard against null/undefined)
      createdAt: transaction.created_at || null,
      completedAt: transaction.completed_at || null
    });

    let fullTickets = null; // Declare outside try block for error handling
    try {
      // Initialize Brevo if needed
      console.log('🔵 [TicketEmail] Step 1: Initializing Brevo service...');
      const brevo = await this.initializeBrevo();
      console.log('✅ [TicketEmail] Brevo initialized successfully');

      // Get full ticket details from database by transaction ID
      console.log(`🔵 [TicketEmail] Step 2: Fetching tickets for transaction ID ${transaction.id}...`);
      fullTickets = await this.getTicketsByTransactionId(transaction.id);
      console.log(`✅ [TicketEmail] Retrieved ${fullTickets?.length || 0} tickets from database`);
      if (process.env.NODE_ENV !== 'production') {
        console.log('📋 [TicketEmail] Retrieved tickets:', {
          ticketCount: fullTickets?.length || 0,
          ticketIds: fullTickets?.map(t => t.ticket_id).slice(0, 3)
        });
      }

      // Get donations for this transaction
      console.log(`🔵 [TicketEmail] Step 3: Fetching donations for transaction ID ${transaction.id}...`);
      const donations = await this.getDonationsByTransactionId(transaction.id);
      console.log(`✅ [TicketEmail] Retrieved ${donations?.length || 0} donations from database`);

      if ((!fullTickets || fullTickets.length === 0) && (!donations || donations.length === 0)) {
        const errorMsg = `No tickets or donations found for transaction ${transaction.uuid || transaction.id}`;
        console.error(`❌ [TicketEmail] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Detect test mode from transaction, tickets, and donations
      const isTest = this.isTestTransaction(transaction) ||
                     (fullTickets && fullTickets.some(ticket => this.isTestTicket(ticket))) ||
                     (donations && donations.some(d => d.is_test === 1));

      // Determine payment processor and format transaction ID
      const paymentProcessor = transaction.payment_processor || (transaction.stripe_session_id ? 'stripe' : transaction.paypal_order_id ? 'paypal' : 'stripe');
      const processorTransactionId = transaction.paypal_order_id || transaction.stripe_session_id || transaction.uuid;

      // Detect manual entry
      const isManualEntry = transaction.source === 'manual_entry' || transaction.manual_entry_id;
      const isCompTicket = paymentProcessor === 'comp';

      // Log test mode operation
      logTestModeOperation(
        `Sending ticket confirmation email to ${transaction.customer_email}`,
        isTest,
        {
          transactionId: transaction.uuid,
          ticketCount: fullTickets ? fullTickets.length : 0,
          donationCount: donations ? donations.length : 0,
          paymentProcessor,
          operation: 'ticket_confirmation_email'
        }
      );

      // Generate access token for secure ticket viewing
      console.log(`🔵 [TicketEmail] Step 4: Generating access token for transaction...`);
      const accessToken = await ticketService.generateAccessToken(
        transaction.id,
        transaction.customer_email,
      );
      console.log(`✅ [TicketEmail] Access token generated successfully`);

      // Format ticket details for email
      console.log(`🔵 [TicketEmail] Step 5: Formatting ${fullTickets?.length || 0} tickets for email display...`);
      const ticketDetails = fullTickets && fullTickets.length > 0
        ? await this.formatTicketsForEmail(fullTickets)
        : [];
      console.log(`✅ [TicketEmail] Formatted ${ticketDetails.length} ticket details (includes QR tokens)`);

      // Format tickets HTML
      const ticketsHtml = ticketDetails.length > 0
        ? this.formatTicketDetailsForEmail(ticketDetails, true)
        : '';

      // Format donations HTML (starting numbering after tickets)
      const donationsHtml = donations && donations.length > 0
        ? this.formatDonationsForEmail(donations, true, ticketDetails.length + 1)
        : '';

      // DEBUG: Log email items rendering (development only)
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email rendering for transaction:', {
          transactionId: transaction.uuid,
          transactionInternalId: transaction.id,
          ticketCount: fullTickets?.length || 0,
          donationCount: donations?.length || 0,
          ticketsHtmlLength: ticketsHtml.length,
          donationsHtmlLength: donationsHtml.length,
          donations: donations?.map(d => ({
            name: d.item_name,
            price_cents: d.total_price_cents
          }))
        });
      }

      // Combine tickets and donations into single list
      const combinedItemsList = ticketsHtml + donationsHtml;

      // Generate QR code for the first ticket (main QR for entry)
      const mainQRToken = ticketDetails[0]?.qrToken;
      const firstTicketId = fullTickets && fullTickets.length > 0 ? fullTickets[0]?.ticket_id : null;


      // Generate manual entry notice for email
      const manualEntryNotice = isManualEntry ? `
        <div style="background: linear-gradient(135deg, rgba(91, 107, 181, 0.1) 0%, rgba(204, 41, 54, 0.1) 100%); border-left: 4px solid #5b6bb5; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #333; font-weight: 600;">
            ✏️ <strong>Manually Created Ticket</strong>
          </p>
          <p style="margin: 8px 0 0 0; color: #666; font-size: 14px;">
            This ticket was created manually by festival staff${isCompTicket ? ' as a complimentary ticket' : ''}.
          </p>
        </div>
      ` : '';

      // Generate comp ticket notice for email
      const compTicketNotice = isCompTicket ? `
        <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%); border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #333; font-weight: 600;">
            🎁 <strong>Complimentary Ticket</strong>
          </p>
          <p style="margin: 8px 0 0 0; color: #666; font-size: 14px;">
            No payment required - This ticket has been provided complimentary. Enjoy the festival!
          </p>
        </div>
      ` : '';

      // Normalize display values for receipt
      const displayTotalAmount = isCompTicket
        ? '0.00'
        : (Number(transaction.total_amount) / 100).toFixed(2);
      const displayPaymentMethod = this.formatPaymentMethod(transaction, paymentProcessor);
      const displayTransactionId = isCompTicket ? 'N/A' : processorTransactionId;

      // Generate HTML email using template
      console.log(`🔵 [TicketEmail] Step 6: Generating HTML email content from template...`);
      const htmlContent = generateOrderConfirmationEmail({
        customerName: transaction.customer_name || "Valued Customer",
        orderNumber: transaction.order_number || `ALO-${new Date().getFullYear()}-${String(transaction.id).padStart(4, '0')}`,
        orderDate: this.formatPurchaseDate(transaction.completed_at || transaction.created_at),
        totalTickets: fullTickets ? fullTickets.length : 0,
        totalDonations: donations ? donations.length : 0,
        totalItems: (fullTickets?.length || 0) + (donations?.length || 0),
        ticketsList: combinedItemsList, // Combined tickets + donations
        registrationUrl: transaction.registration_token ?
          `${this.baseUrl}/register-tickets?token=${transaction.registration_token}` :
          `${this.baseUrl}/view-tickets?token=${accessToken}`,
        registrationDeadline: this.formatRegistrationDeadline(),

        // Payment/Receipt data (comp-safe)
        totalAmount: displayTotalAmount,
        paymentMethod: displayPaymentMethod,
        transactionId: displayTransactionId,
        paymentDate: this.formatPurchaseDate(transaction.completed_at || transaction.created_at),
        billingEmail: transaction.customer_email,

        // Manual entry and comp ticket notices
        manualEntryNotice: manualEntryNotice,
        compTicketNotice: compTicketNotice
      });
      console.log(`✅ [TicketEmail] HTML content generated (${htmlContent.length} chars)`);

      // Prepare Brevo transactional email parameters
      console.log(`🔵 [TicketEmail] Step 7: Preparing email parameters for Brevo API...`);
      const emailParams = {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || "noreply@alocubano.com",
          name: "A Lo Cubano Boulder Fest"
        },
        replyTo: {
          email: process.env.BREVO_REPLY_TO || "alocubanoboulderfest@gmail.com",
          name: "A Lo Cubano Boulder Fest"
        },
        to: [
          {
            email: transaction.customer_email,
            name: transaction.customer_name,
          },
        ],
        subject: `Your Ticket Order - ${transaction.order_number || 'Confirmation'}`,
        htmlContent: htmlContent,
        // Track this email with test mode indicators
        headers: {
          "X-Mailin-Tag": isTest ? "ticket-confirmation-test" : "ticket-confirmation",
          "X-Transaction-ID": transaction.uuid,
          "X-Payment-Processor": paymentProcessor,
          "X-Processor-Transaction-ID": processorTransactionId,
          "X-Test-Mode": isTest ? "true" : "false",
        },
      };

      // Only add attachment field if we have attachments
      const attachments = this.generateTicketAttachment(transaction, ticketDetails);
      if (attachments && attachments.length > 0) {
        emailParams.attachment = attachments;
      }
      console.log(`✅ [TicketEmail] Email parameters prepared (attachments: ${attachments?.length || 0})`);

      // Log email parameters before sending (operational logging)
      console.log('📤 [TicketEmail] Step 8: Sending email via Brevo API:', {
        to: emailParams.to[0].email,
        subject: emailParams.subject,
        hasHtmlContent: !!emailParams.htmlContent,
        htmlContentLength: emailParams.htmlContent?.length || 0,
        attachmentCount: emailParams.attachment?.length || 0,
        headers: emailParams.headers
      });

      // Send via Brevo API - CRITICAL POINT: This is where email actually sends
      console.log(`🔵 [TicketEmail] Making Brevo API request to /smtp/email...`);
      const response = await brevo.makeRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify(emailParams),
      });
      console.log(`✅ [TicketEmail] Brevo API request completed, response received:`, {
        messageId: response?.messageId,
        status: response?.status
      });

      // Log success without exposing customer email (keep operational logging)
      console.log("✅ [TicketEmail] Ticket confirmation email sent:", {
        transactionId: transaction.uuid,
        paymentProcessor,
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
      // Production: redact PII from error logs
      // Development: full debugging info
      if (process.env.NODE_ENV === 'production') {
        console.error("❌ [TicketEmail] Failed to send ticket confirmation:", {
          error: error.message,
          stack: error.stack,
          transactionId: transaction.uuid,
          ticketCount: fullTickets?.length || 0
        });
      } else {
        console.error("❌ [TicketEmail] Failed to send ticket confirmation:", {
          error: error.message,
          stack: error.stack,
          transactionId: transaction.uuid,
          customerEmail: transaction.customer_email,
          ticketCount: fullTickets?.length || 0
        });
      }

      // Fallback: Log email details for manual sending (development only - avoid exposing customer email)
      if (process.env.NODE_ENV !== 'production') {
        console.log("📧 [TicketEmail] Email details for manual sending:", {
          to: transaction.customer_email,
          transactionId: transaction.uuid,
          ticketCount: fullTickets?.length || 0,
        });
      }

      throw error;
    }
  }

  /**
   * Format event schedule for email
   */
  formatEventSchedule() {
    return `
      <p><strong>Friday, May 15:</strong> 8pm - 2am</p>
      <p><strong>Saturday, May 16:</strong> 8pm - 2am</p>
      <p><strong>Sunday, May 17:</strong> 2pm - 8pm</p>
    `;
  }

  /**
   * Format purchase date for email in Mountain Time
   */
  formatPurchaseDate(dateString) {
    if (!dateString) {
      return timeUtils.formatDateTime(new Date());
    }
    return timeUtils.formatDateTime(dateString);
  }

  /**
   * Format payment method for receipt display
   * @param {Object} transaction - Transaction object
   * @param {string} processor - Payment processor ('stripe' or 'paypal')
   * @returns {string} Formatted payment method string
   */
  formatPaymentMethod(transaction, processor) {
    if (processor === 'comp') {
      return 'Complimentary';
    }
    if (processor === 'cash') {
      return 'Cash (Manual)';
    }
    if (processor === 'card_terminal') {
      return 'Card Terminal';
    }
    if (processor === 'venmo') {
      return 'Venmo';
    }
    if (processor === 'paypal') {
      return `PayPal (${transaction.customer_email})`;
    }

    // Stripe payment method formatting
    const wallet = transaction.payment_wallet; // 'apple_pay', 'google_pay', 'link', or null
    const brand = transaction.card_brand || 'Card';
    const last4 = transaction.card_last4 || '••••';

    // Capitalize first letter of brand
    const brandDisplay = brand.charAt(0).toUpperCase() + brand.slice(1);

    if (wallet === 'apple_pay') {
      return `Apple Pay (${brandDisplay} ••${last4})`;
    } else if (wallet === 'google_pay') {
      return `Google Pay (${brandDisplay} ••${last4})`;
    } else if (wallet === 'link') {
      return 'Link';
    } else {
      return `${brandDisplay} ••${last4}`;
    }
  }

  /**
   * Format registration deadline for email
   */
  formatRegistrationDeadline() {
    // Calculate deadline as 72 hours from now
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 72);

    return deadline.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: 'America/Denver'
    });
  }

  /**
   * Format ticket details for email (rich HTML format with card-style layout)
   * @param {Array} ticketDetails - Array of ticket detail objects
   * @param {boolean} includePricing - Whether to include pricing (true for receipts, false for reminders)
   */
  formatTicketDetailsForEmail(ticketDetails, includePricing = false) {
    if (!ticketDetails || ticketDetails.length === 0) return "No tickets found";

    return ticketDetails
      .map((ticket, index) => 
        generateEmailCard({
          index: index + 1,
          title: ticket.type,
          price: includePricing && ticket.price ? parseFloat(ticket.price) * 100 : null, // Convert dollars to cents
          includePricing,
          details: [
            { label: 'Event:', value: ticket.eventName },
            { label: 'Date:', value: ticket.date },
            { label: 'Venue:', value: ticket.location }
          ],
          borderColor: '#5b6bb5', // Cuban blue
          badgeColor: '#5b6bb5'
        })
      )
      .join('');
  }

  /**
   * Format donation details for email (green-themed card layout)
   * @param {Array} donations - Array of donation objects from transaction_items
   * @param {boolean} includePricing - Whether to include pricing
   * @param {number} startingIndex - Starting number for donation badges (continues from ticket count)
   */
  formatDonationsForEmail(donations, includePricing = false, startingIndex = 1) {
    if (!donations || donations.length === 0) return "";

    return donations
      .map((donation, index) => {
        const displayIndex = startingIndex + index;
        const donationName = donation.item_name || 'Festival Support';

        return generateEmailCard({
          index: displayIndex,
          title: donationName,
          price: donation.total_price_cents,
          includePricing,
          details: [
            { 
              label: '', 
              value: 'Your generous donation brings more amazing instructors and events to our Boulder community. Thank you!' 
            }
          ],
          borderColor: '#10b981', // Green for donations
          badgeColor: '#10b981'
        });
      })
      .join('');
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
   * Get tickets by transaction ID
   * @param {number} transactionId - Transaction ID to query tickets for
   * @returns {Promise<Array>} Full ticket records from database
   */
  async getTicketsByTransactionId(transactionId) {
    if (!transactionId) {
      return [];
    }

    try {
      const db = await getDatabaseClient();
      const result = await db.execute({
        sql: `SELECT
          t.ticket_id,
          t.ticket_type,
          COALESCE(tt.name, t.ticket_type) as ticket_type_name,
          t.event_id,
          t.event_date,
          t.attendee_first_name,
          t.attendee_last_name,
          t.price_cents,
          e.name as event_name,
          COALESCE(e.venue_name, 'TBA') || ', ' || COALESCE(e.venue_city, 'Boulder') || ', ' || COALESCE(e.venue_state, 'CO') as event_location,
          t.is_test,
          t.transaction_id,
          t.created_at
        FROM tickets t
        LEFT JOIN events e ON t.event_id = e.id
        LEFT JOIN ticket_types tt ON t.ticket_type = tt.id
        WHERE t.transaction_id = ?
        ORDER BY t.created_at`,
        args: [transactionId]
      });

      // BIGINT FIX: Sanitize database result to prevent BigInt serialization errors in email templates
      return processDatabaseResult(result.rows) || [];
    } catch (error) {
      console.error('Failed to get tickets by transaction ID:', error);
      return [];
    }
  }


  /**
   * Get donations by transaction ID
   * @param {number} transactionId - Transaction ID to query donations for
   * @returns {Promise<Array>} Donation records from transaction_items table
   */
  async getDonationsByTransactionId(transactionId) {
    if (!transactionId) {
      return [];
    }

    try {
      const db = await getDatabaseClient();
      const result = await db.execute({
        sql: `SELECT
          item_type,
          item_name,
          total_price_cents,
          is_test
        FROM transaction_items
        WHERE transaction_id = ?
          AND item_type = 'donation'
        ORDER BY created_at ASC`,
        args: [transactionId]
      });

      // BIGINT FIX: Sanitize database result to prevent BigInt serialization errors in email templates
      return processDatabaseResult(result.rows) || [];
    } catch (error) {
      console.error('Error fetching donations for transaction:', error);
      return [];
    }
  }

  /**
   * Format tickets for email display
   */
  async formatTicketsForEmail(tickets) {
    const qrService = getQRTokenService();

    return Promise.all(
      tickets.map(async (ticket) => {
        // Convert BigInt ticket_id to string for QR token generation
        const qrToken = await qrService.getOrCreateToken(String(ticket.ticket_id));

        return {
          ticketId: ticket.ticket_id,
          type: ticket.ticket_type_name,
          price: ticket.price_cents ? (Number(ticket.price_cents) / 100).toFixed(2) : '0.00',
          attendee:
            `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim() ||
            "Guest",
          date: this.formatEventDate(ticket.event_date),
          eventName: ticket.event_name,
          location: ticket.event_location,
          qrToken: qrToken,
          qrCodeUrl: `${this.baseUrl}/api/qr/generate?token=${qrToken}`,
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
   * Format event date for display in Mountain Time
   */
  formatEventDate(date) {
    if (!date) return this.eventDatesDisplay;

    // Use time-utils to format in Mountain Time
    return timeUtils.formatEventTime(date, {
      includeTime: false,
      includeTimezone: false,
      longFormat: true
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
        timeZoneName: "short",
        timeZone: "America/Denver"
      });

      // Create registration URL
      const registrationUrl = `${this.baseUrl}/register-tickets?token=${registrationToken}`;


      // Prepare email parameters
      const emailParams = {
        to: [
          {
            email: customerEmail,
            name: customerName || "Valued Customer",
          },
        ],
        templateId: parseInt(process.env.BREVO_REGISTRATION_INVITATION_TEMPLATE_ID),
        params: {
          ORDER_NUMBER: options.orderNumber || transactionId, // Add order number with fallback
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
          TICKET_TYPES: this.formatTicketTypesForEmail(tickets)
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

      // Log success without exposing customer email
      console.log("Registration invitation email sent:", {
        transactionId,
        paymentProcessor,
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

      // Fallback: Log email details for manual sending (development only - avoid exposing customer email)
      if (process.env.NODE_ENV !== 'production') {
        console.log("Registration invitation details for manual sending:", {
          to: customerEmail,
          transactionId,
          ticketCount,
          registrationToken,
        });
      }

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
      ticket,  // Add ticket object to options for test mode detection
      orderDate  // Add order date for email display
    } = options;

    // Convert BigInt values to strings to avoid JSON serialization errors
    const ticketIdStr = ticketId ? String(ticketId) : null;
    const transactionIdStr = transactionId ? String(transactionId) : null;

    try {
      // Initialize Brevo if needed
      const brevo = await this.initializeBrevo();

      // Get full ticket details for the transaction
      const fullTickets = await this.getTicketsByTransactionId(transactionId);

      // Filter to only unregistered tickets (missing name OR email)
      const unregisteredTickets = fullTickets.filter(t =>
        !t.attendee_first_name || !t.attendee_last_name || !t.attendee_email
      );

      // Format tickets for email display
      const ticketDetails = await this.formatTicketsForEmail(unregisteredTickets);
      const ticketsList = this.formatTicketDetailsForEmail(ticketDetails, false); // includePricing = false for reminders

      // Calculate tickets remaining from actual unregistered count to ensure consistency
      const ticketsRemainingNum = unregisteredTickets.length;

      // Detect test mode from ticket or fallback to email pattern
      const isTest = (ticket && this.isTestTicket(ticket)) || this.isTestEmail(customerEmail);

      // Log test mode operation
      logTestModeOperation(
        `Sending registration reminder (${reminderType}) email to ${customerEmail}`,
        isTest,
        {
          ticketId: ticketIdStr,
          transactionId: transactionIdStr,
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
        timeZoneName: "short",
        timeZone: "America/Denver"
      });

      // Calculate time remaining
      const now = new Date();
      const hoursRemaining = Math.max(0, Math.floor((deadlineDate - now) / (1000 * 60 * 60)));

      // Create registration URL
      const registrationUrl = `${this.baseUrl}/register-tickets?token=${registrationToken}`;

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

      // Generate HTML email using template
      const htmlContent = generateRegistrationReminderEmail({
        customerName: customerName || "Valued Customer",
        orderNumber: options.orderNumber || transactionIdStr,
        orderDate: orderDate ? this.formatPurchaseDate(orderDate) : this.formatPurchaseDate(new Date()),
        totalTickets: ticketsRemainingNum,
        ticketsList: ticketsList,
        viewTicketsUrl: `${this.baseUrl}/view-tickets?token=${registrationToken}`,
        registrationDeadline: deadlineDisplay
      });

      // Prepare email parameters
      const emailParams = {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || "noreply@alocubano.com",
          name: "A Lo Cubano Boulder Fest"
        },
        replyTo: {
          email: process.env.BREVO_REPLY_TO || "alocubanoboulderfest@gmail.com",
          name: "A Lo Cubano Boulder Fest"
        },
        to: [
          {
            email: customerEmail,
            name: customerName || "Valued Customer",
          },
        ],
        subject: `Registration Reminder - ${options.orderNumber || transactionIdStr}`,
        htmlContent: htmlContent,
        headers: {
          "X-Mailin-Tag": isTest ? `registration-reminder-${reminderType}-test` : `registration-reminder-${reminderType}`,
          "X-Transaction-ID": transactionIdStr,
          "X-Ticket-ID": ticketIdStr,
          "X-Test-Mode": isTest ? "true" : "false",
        },
      };

      // Send via Brevo API
      const response = await brevo.makeRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify(emailParams),
      });

      // Log success without exposing customer email
      console.log(`Registration reminder (${reminderType}) email sent:`, {
        transactionId: transactionIdStr,
        ticketId: ticketIdStr,
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
