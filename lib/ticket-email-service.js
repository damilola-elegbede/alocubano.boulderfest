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
import { generateAttendeeConfirmationEmail } from "./email-templates/attendee-confirmation.js";
import { generateTransferNotificationEmail } from "./email-templates/transfer-notification.js";
import { generateTransferConfirmationEmail } from "./email-templates/transfer-confirmation.js";
import { getBaseUrl } from "./url-utils.js";
import { buildQRCodeUrl, buildViewTicketsUrl, buildWalletPassUrls } from "./url-utils.js";
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
   * Mask email addresses to protect PII in logs
   * @param {string} email - Email address to mask
   * @returns {string} Masked email (e.g., "jo***@example.com")
   */
  maskEmail(email) {
    if (!email) return '';
    const parts = String(email).split('@');
    const user = parts[0];
    const domain = parts[1] || '';
    return user ? user.slice(0, 2) + '***@' + domain : '';
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
      // Log warning without full ticket object to prevent PII exposure
      console.warn('[TicketEmailService] Missing ticket_id field, cannot detect test ticket reliably', {
        hasEmail: !!ticket.attendee_email,
        hasFirstName: !!ticket.attendee_first_name
      });
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
      customerEmail: this.maskEmail(transaction.customer_email),
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
        `Sending ticket confirmation email to ${this.maskEmail(transaction.customer_email)}`,
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
        viewTicketsUrl: buildViewTicketsUrl(accessToken),

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
        subject: `Your Order Confirmation - ${transaction.order_number || 'A Lo Cubano Boulder Fest'}`,
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
        to: this.maskEmail(emailParams.to[0].email),
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
          customerEmail: this.maskEmail(transaction.customer_email),
          ticketCount: fullTickets?.length || 0
        });
      }

      // Fallback: Log email details for manual sending (development only - avoid exposing customer email)
      if (process.env.NODE_ENV !== 'production') {
        console.log("📧 [TicketEmail] Email details for manual sending:", {
          to: this.maskEmail(transaction.customer_email),
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
      return `PayPal (${this.maskEmail(transaction.customer_email)})`;
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
          qrCodeUrl: buildQRCodeUrl(qrToken),
          webTicketUrl: `${this.baseUrl}/pages/my-ticket?id=${encodeURIComponent(ticket.ticket_id)}&token=${encodeURIComponent(qrToken)}`,
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
   * Send transfer notification to NEW owner
   * @param {Object} params - Transfer notification parameters
   * @param {string} params.newOwnerName - New owner's full name
   * @param {string} params.newOwnerEmail - New owner's email address
   * @param {string} params.previousOwnerName - Previous owner's full name
   * @param {string} params.ticketId - Ticket ID
   * @param {string} params.ticketType - Ticket type name
   * @param {string} params.transferDate - Transfer date (formatted)
   * @param {string} params.transferReason - Optional reason for transfer
   * @param {string} params.transactionId - Transaction ID for registration link
   */
  async sendTransferNotification(params) {
    const {
      newOwnerName,
      newOwnerEmail,
      previousOwnerName,
      ticketId,
      ticketType,
      transferDate,
      transferReason = '',
      transactionId
    } = params;

    console.log('📧 [TicketEmail] Sending transfer notification to new owner:', {
      newOwnerEmail: this.maskEmail(newOwnerEmail),
      ticketId,
      ticketType
    });

    try {
      // Initialize Brevo
      const brevo = await this.initializeBrevo();

      // Fetch transaction to get registration token
      const db = await getDatabaseClient();
      const txResult = await db.execute({
        sql: 'SELECT registration_token FROM transactions WHERE id = ?',
        args: [transactionId]
      });

      const transaction = txResult.rows[0];

      // Fetch full ticket details with event info
      const ticketResult = await db.execute({
        sql: `SELECT
                t.ticket_id,
                t.ticket_type,
                t.event_id,
                e.name as event_name,
                e.venue_name,
                e.venue_city,
                e.venue_state,
                e.start_date,
                e.end_date
              FROM tickets t
              JOIN events e ON t.event_id = e.id
              WHERE t.ticket_id = ?`,
        args: [ticketId]
      });

      const ticketDetails = ticketResult.rows[0];
      if (!ticketDetails) {
        throw new Error(`Ticket ${ticketId} not found or missing event information while preparing transfer notification email`);
      }

      // Generate QR token for the ticket
      const qrService = getQRTokenService();
      const qrToken = await qrService.getOrCreateToken(ticketId);

      // Build all necessary URLs
      const walletUrls = buildWalletPassUrls(ticketId);
      const qrCodeUrl = buildQRCodeUrl(qrToken);

      // Build view ticket URL (use registration token if available, otherwise generate access token)
      let viewTicketUrl;
      if (transaction?.registration_token) {
        viewTicketUrl = buildViewTicketsUrl(transaction.registration_token, ticketId);
      } else {
        const accessToken = await ticketService.generateAccessToken(
          transactionId,
          newOwnerEmail
        );
        viewTicketUrl = buildViewTicketsUrl(accessToken);
      }

      // Generate email HTML
      const emailHtml = generateTransferNotificationEmail({
        newOwnerName,
        previousOwnerName,
        ticketType,
        ticketId,
        transferDate,
        transferReason,
        qrCodeUrl,
        walletPassUrl: walletUrls.apple,
        googleWalletUrl: walletUrls.google,
        appleWalletButtonUrl: `${this.baseUrl}/images/add-to-wallet-apple.png`,
        googleWalletButtonUrl: `${this.baseUrl}/images/add-to-wallet-google.png`,
        viewTicketUrl,
        eventName: ticketDetails.event_name,
        eventLocation: `${ticketDetails.venue_name}, ${ticketDetails.venue_city}, ${ticketDetails.venue_state}`,
        eventDate: timeUtils.formatEventTime(ticketDetails.start_date, ticketDetails.end_date)
      });

      // Detect test mode
      const isTest = this.isTestEmail(newOwnerEmail);

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
        to: [{ email: newOwnerEmail, name: newOwnerName }],
        subject: `Ticket Transferred to You - ${ticketType}`,
        htmlContent: emailHtml,
        headers: {
          "X-Mailin-Tag": isTest ? "ticket-transfer-notification-test" : "ticket-transfer-notification",
          "X-Transaction-ID": String(transactionId),
          "X-Ticket-ID": ticketId,
          "X-Test-Mode": isTest ? "true" : "false"
        }
      };

      // Send email via Brevo
      const response = await brevo.makeRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify(emailParams)
      });

      console.log('✅ [TicketEmail] Transfer notification sent successfully:', {
        newOwnerEmail: this.maskEmail(newOwnerEmail),
        messageId: response.messageId,
        isTestMode: isTest
      });
      return { success: true, messageId: response.messageId };
    } catch (error) {
      console.error('❌ [TicketEmail] Failed to send transfer notification:', {
        error: error.message,
        newOwnerEmail: this.maskEmail(newOwnerEmail),
        ticketId
      });
      throw error;
    }
  }

  /**
   * Send transfer confirmation to ORIGINAL owner
   * @param {Object} params - Transfer confirmation parameters
   * @param {string} params.originalOwnerName - Original owner's full name
   * @param {string} params.originalOwnerEmail - Original owner's email address
   * @param {string} params.newOwnerName - New owner's full name
   * @param {string} params.newOwnerEmail - New owner's email address
   * @param {string} params.ticketId - Ticket ID
   * @param {string} params.ticketType - Ticket type name
   * @param {string} params.transferDate - Transfer date (formatted)
   * @param {string} params.transferReason - Optional reason for transfer
   * @param {string} params.transferredBy - Name/ID of admin who processed transfer
   */
  async sendTransferConfirmation(params) {
    const {
      originalOwnerName,
      originalOwnerEmail,
      newOwnerName,
      newOwnerEmail,
      ticketId,
      ticketType,
      transferDate,
      transferReason = '',
      transferredBy = 'Admin'
    } = params;

    console.log('📧 [TicketEmail] Sending transfer confirmation to original owner:', {
      originalOwnerEmail: this.maskEmail(originalOwnerEmail),
      ticketId,
      ticketType
    });

    try {
      // Initialize Brevo
      const brevo = await this.initializeBrevo();

      // Fetch full ticket details with event info
      const db = await getDatabaseClient();
      const ticketResult = await db.execute({
        sql: `SELECT
                t.ticket_id,
                t.ticket_type,
                e.name as event_name,
                e.venue_name,
                e.venue_city,
                e.venue_state,
                e.start_date,
                e.end_date
              FROM tickets t
              JOIN events e ON t.event_id = e.id
              WHERE t.ticket_id = ?`,
        args: [ticketId]
      });

      const ticketDetails = ticketResult.rows[0];
      if (!ticketDetails) {
        throw new Error(`Ticket ${ticketId} not found or missing event information while preparing transfer confirmation email`);
      }

      // Generate email HTML
      const emailHtml = generateTransferConfirmationEmail({
        originalOwnerName,
        newOwnerName,
        newOwnerEmail,
        ticketType,
        ticketId,
        transferDate,
        transferReason,
        transferredBy,
        eventName: ticketDetails.event_name,
        eventLocation: `${ticketDetails.venue_name}, ${ticketDetails.venue_city}, ${ticketDetails.venue_state}`,
        eventDate: timeUtils.formatEventTime(ticketDetails.start_date, ticketDetails.end_date)
      });

      // Detect test mode
      const isTest = this.isTestEmail(originalOwnerEmail);

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
        to: [{ email: originalOwnerEmail, name: originalOwnerName }],
        subject: `Ticket Transfer Confirmation - ${ticketType}`,
        htmlContent: emailHtml,
        headers: {
          "X-Mailin-Tag": isTest ? "ticket-transfer-confirmation-test" : "ticket-transfer-confirmation",
          "X-Ticket-ID": ticketId,
          "X-Test-Mode": isTest ? "true" : "false"
        }
      };

      // Send email via Brevo
      const response = await brevo.makeRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify(emailParams)
      });

      console.log('✅ [TicketEmail] Transfer confirmation sent successfully:', {
        originalOwnerEmail: this.maskEmail(originalOwnerEmail),
        messageId: response.messageId,
        isTestMode: isTest
      });
      return { success: true, messageId: response.messageId };
    } catch (error) {
      console.error('❌ [TicketEmail] Failed to send transfer confirmation:', {
        error: error.message,
        originalOwnerEmail: this.maskEmail(originalOwnerEmail),
        ticketId
      });
      throw error;
    }
  }
}

// Singleton instance using lazy initialization
// Note: Both getTicketEmailService() and the default export return the SAME instance
// to ensure consistent behavior across the codebase
let ticketEmailServiceInstance = null;

/**
 * Get the singleton TicketEmailService instance (preferred)
 * @returns {TicketEmailService} Singleton instance
 */
export function getTicketEmailService() {
  if (!ticketEmailServiceInstance) {
    ticketEmailServiceInstance = new TicketEmailService();
  }
  return ticketEmailServiceInstance;
}

// Default export returns the same singleton instance
// This ensures `import service from` and `getTicketEmailService()` return the same object
export default getTicketEmailService();
