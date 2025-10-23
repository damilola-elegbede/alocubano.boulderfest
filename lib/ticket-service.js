import { getDatabaseClient } from "./database.js";
import tokenService from "./token-service.js";
import {
  TICKET_TYPE_MAP,
  TICKET_STATUS,
  formatTicketType,
  getEventDate,
  isTicketItem,
  extractTicketType,
} from "./ticket-config.js";
import appleWalletService from "./apple-wallet-service.js";
import googleWalletService from "./google-wallet-service.js";
import {
  getTestModeFlag,
  createTestModeMetadata,
  validateTestModeConsistency,
  logTestModeOperation
} from "./test-mode-utils.js";
import { safeStringify } from "./bigint-serializer.js";

export class TicketService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    // Fast path: already initialized with valid database connection
    if (this.initialized && this.db) {
      return this;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      // Clear promise on error to allow retry
      this.initializationPromise = null;
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      // getDatabaseClient() now handles test isolation mode automatically
      this.db = await getDatabaseClient();

      if (!this.db) {
        throw new Error('Failed to get database client - db is null');
      }

      this.initialized = true;
      return this;
    } catch (error) {
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Generate a unique ticket ID using cryptographically secure random
   */
  generateTicketId() {
    return tokenService.generateTicketId();
  }

  /**
   * Create tickets from a transaction with test mode support
   */
  async createTicketsFromTransaction(transaction, lineItems = [], req = null) {
    await this.ensureInitialized();

    const tickets = [];

    try {
      // Validate test mode consistency
      const envTestMode = getTestModeFlag(req);
      const transactionTestMode = transaction.is_test || 0;

      // Use transaction test mode as authoritative, but log if there's a mismatch
      if (envTestMode !== transactionTestMode) {
        logTestModeOperation('test_mode_mismatch_detected', {
          transaction_id: transaction.id,
          transaction_test_mode: transactionTestMode,
          env_test_mode: envTestMode,
          using_transaction_mode: true
        }, req);
      }

      // Parse order data to get cart items
      const orderData = JSON.parse(transaction.order_details || transaction.order_data || "{}");
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
          const ticket = await this.createSingleTicket(
            transaction,
            item,
            i + 1,
            quantity,
            req
          );
          tickets.push(ticket);
        }
      }

      logTestModeOperation('tickets_created_from_transaction', {
        transaction_id: transaction.id,
        transaction_uuid: transaction.uuid,
        tickets_created: tickets.length,
        is_test: transactionTestMode
      }, req);

      console.log(
        `Created ${tickets.length} tickets for transaction ${transaction.uuid}`,
      );
      return tickets;
    } catch (error) {
      console.error("Failed to create tickets:", error);
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
   * Create a single ticket with test mode support
   */
  async createSingleTicket(transaction, item, index, total, req = null) {
    const baseTicketId = this.generateTicketId();
    const transactionTestMode = transaction.is_test || 0;

    // Validate test mode consistency between transaction and environment
    validateTestModeConsistency(
      transactionTestMode,
      transactionTestMode, // Tickets inherit transaction test mode
      'transaction',
      'ticket'
    );

    // Use ticket ID directly (no TEST- prefix)
    const ticketId = baseTicketId;
    const ticketType = this.extractTicketType(item);
    const eventId = transaction.event_id || "boulder-fest-2026";
    const eventDate = this.getEventDate(eventId, ticketType);

    // Parse customer name
    const names = this.parseCustomerName(transaction.customer_name);

    // Create test-aware ticket metadata
    const ticketMetadata = createTestModeMetadata(req, {
      item_description: item.description,
      item_index: index,
      total_quantity: total,
      product_id: item.price?.product?.id,
      product_metadata: item.price?.product?.metadata,
      transaction_test_mode: transactionTestMode
    });

    // Create ticket record with test mode flag
    const result = await this.db.execute({
      sql: `INSERT INTO tickets (
        ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, event_date,
        price_cents, attendee_first_name, attendee_last_name,
        attendee_email, status, ticket_metadata, is_test
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ticketId,
        transaction.id,
        ticketType,
        ticketType,  // ticket_type_id uses same value (ticket_types.id is TEXT)
        eventId,
        eventDate,
        item.price?.unit_amount || item.amount_total || 0,
        names.firstName,
        names.lastName,
        transaction.customer_email,
        "valid",
        safeStringify(ticketMetadata),
        transactionTestMode, // Inherit test mode from transaction
      ],
    });

    // Generate wallet passes if enabled (skip for test tickets in production)
    const shouldGenerateWalletPasses =
      process.env.WALLET_ENABLE_GENERATION !== "false" &&
      (transactionTestMode === 0 || process.env.NODE_ENV === 'test');

    if (shouldGenerateWalletPasses) {
      // Generate Apple Wallet pass
      if (appleWalletService.isConfigured()) {
        try {
          await appleWalletService.generatePass(ticketId);
          logTestModeOperation('apple_wallet_pass_generated', {
            ticket_id: ticketId,
            is_test: transactionTestMode
          }, req);
          console.log(`Generated Apple Wallet pass for ticket ${ticketId}`);
        } catch (error) {
          console.error(
            `Failed to generate Apple Wallet pass for ticket ${ticketId}:`,
            error,
          );
        }
      }

      // Generate Google Wallet pass
      if (googleWalletService.isConfigured()) {
        try {
          await googleWalletService.generatePass(ticketId);
          logTestModeOperation('google_wallet_pass_generated', {
            ticket_id: ticketId,
            is_test: transactionTestMode
          }, req);
          console.log(`Generated Google Wallet pass for ticket ${ticketId}`);
        } catch (error) {
          console.error(
            `Failed to generate Google Wallet pass for ticket ${ticketId}:`,
            error,
          );
        }
      }
    } else {
      logTestModeOperation('wallet_pass_generation_skipped', {
        ticket_id: ticketId,
        is_test: transactionTestMode,
        reason: transactionTestMode === 1 ? 'test_ticket' : 'generation_disabled'
      }, req);
    }

    // Return the created ticket
    const ticket = await this.getByTicketId(ticketId);

    logTestModeOperation('ticket_created', {
      ticket_id: ticketId,
      transaction_id: transaction.id,
      ticket_type: ticketType,
      is_test: transactionTestMode
    }, req);

    return ticket;
  }

  /**
   * Parse customer name into first and last
   */
  parseCustomerName(fullName) {
    if (!fullName) {
      return { firstName: "", lastName: "" };
    }

    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "" };
    }

    // Assume last word is last name, everything else is first name
    const lastName = parts.pop();
    const firstName = parts.join(" ");

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
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: "SELECT * FROM tickets WHERE ticket_id = ?",
      args: [ticketId],
    });
    return processDatabaseResult(result.rows[0]);
  }

  /**
   * Get all tickets for a transaction
   */
  async getTransactionTickets(transactionId) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: "SELECT * FROM tickets WHERE transaction_id = ? ORDER BY created_at",
      args: [transactionId],
    });
    return processDatabaseResult(result.rows);
  }

  /**
   * Update attendee information
   */
  async updateAttendeeInfo(ticketId, attendeeInfo) {
    await this.ensureInitialized();

    const updates = [];
    const args = [];

    if (attendeeInfo.firstName !== undefined) {
      updates.push("attendee_first_name = ?");
      args.push(attendeeInfo.firstName);
    }

    if (attendeeInfo.lastName !== undefined) {
      updates.push("attendee_last_name = ?");
      args.push(attendeeInfo.lastName);
    }

    if (attendeeInfo.email !== undefined) {
      updates.push("attendee_email = ?");
      args.push(attendeeInfo.email);
    }

    if (attendeeInfo.phone !== undefined) {
      updates.push("attendee_phone = ?");
      args.push(attendeeInfo.phone);
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    args.push(ticketId);

    await this.db.execute({
      sql: `UPDATE tickets SET ${updates.join(", ")} WHERE ticket_id = ?`,
      args,
    });

    return this.getByTicketId(ticketId);
  }

  /**
   * Get tickets by email
   */
  async getTicketsByEmail(email) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: `SELECT t.*, tr.uuid as order_number
            FROM tickets t
            JOIN transactions tr ON t.transaction_id = tr.id
            WHERE (t.attendee_email = ? OR tr.customer_email = ?)
            ORDER BY t.created_at DESC`,
      args: [email, email],
    });
    return processDatabaseResult(result.rows);
  }

  /**
   * Cancel a ticket with secure parameter handling
   */
  async cancelTicket(ticketId, reason = null) {
    await this.ensureInitialized();

    const ticket = await this.getByTicketId(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    // Parse existing metadata safely
    const metadata = JSON.parse(ticket.ticket_metadata || "{}");
    metadata.cancellation_reason = reason || "Customer request";
    metadata.cancelled_at = new Date().toISOString();

    await this.db.execute({
      sql: `UPDATE tickets
            SET status = ?,
                updated_at = CURRENT_TIMESTAMP,
                ticket_metadata = ?
            WHERE ticket_id = ?`,
      args: [TICKET_STATUS.CANCELLED, safeStringify(metadata), ticketId],
    });

    return this.getByTicketId(ticketId);
  }

  /**
   * Transfer a ticket to another person
   */
  async transferTicket(ticketId, newAttendee) {
    await this.ensureInitialized();

    const ticket = await this.getByTicketId(ticketId);

    if (!ticket) {
      throw new Error("Ticket not found");
    }

    // Store original attendee info in metadata
    const metadata = JSON.parse(ticket.ticket_metadata || "{}");
    metadata.transferred_from = {
      first_name: ticket.attendee_first_name,
      last_name: ticket.attendee_last_name,
      email: ticket.attendee_email,
      transferred_at: new Date().toISOString(),
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
        safeStringify(metadata),
        ticketId,
      ],
    });

    return this.getByTicketId(ticketId);
  }

  /**
   * Generate and store QR code data for ticket validation
   */
  async generateQRCode(ticketId) {
    await this.ensureInitialized();

    const ticket = await this.getByTicketId(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const validation = tokenService.generateValidationToken(
      ticket.ticket_id,
      ticket.event_id,
      ticket.attendee_email,
    );

    await this.db.execute({
      sql: `UPDATE tickets
            SET validation_signature = ?, qr_code_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE ticket_id = ?`,
      args: [validation.signature, validation.qr_data, ticketId],
    });

    return {
      ticketId: ticket.ticket_id,
      qrData: validation.qr_data,
      signature: validation.signature,
    };
  }

  /**
   * Validate QR code and mark ticket as used
   */
  async validateAndCheckIn(qrData, checkInLocation = null, checkInBy = null) {
    await this.ensureInitialized();

    const validation = tokenService.validateQRCode(qrData);

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const ticket = await this.getByTicketId(validation.ticketId);
    if (!ticket) {
      return { success: false, error: "Ticket not found" };
    }

    if (ticket.status === TICKET_STATUS.USED) {
      return {
        success: false,
        error: "Ticket already used",
        checkedInAt: ticket.checked_in_at,
      };
    }

    if (ticket.status !== TICKET_STATUS.VALID) {
      return {
        success: false,
        error: `Cannot check in ${ticket.status} ticket`,
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
      args: [TICKET_STATUS.USED, checkInBy, checkInLocation, ticket.ticket_id],
    });

    const updatedTicket = await this.getByTicketId(ticket.ticket_id);

    return {
      success: true,
      ticket: updatedTicket,
      attendee:
        `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
      ticketType: formatTicketType(ticket.ticket_type),
    };
  }

  /**
   * Get tickets by access token
   */
  async getTicketsByAccessToken(accessToken) {
    await this.ensureInitialized();

    const tokenValidation = await tokenService.validateAccessToken(accessToken);

    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }

    const tickets = await this.getTransactionTickets(
      tokenValidation.transactionId,
    );

    // Enrich with formatted data
    return tickets.map((ticket) => ({
      ...ticket,
      formatted_type: formatTicketType(ticket.ticket_type),
      formatted_date: this.formatEventDate(ticket.event_date),
    }));
  }

  /**
   * Format event date for display
   */
  formatEventDate(date) {
    if (!date) return "May 15-17, 2026";

    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Denver"
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

  /**
   * Get ticket statistics with test mode breakdown
   */
  async getTicketStatistics() {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: `SELECT
              COUNT(*) as total_tickets,
              SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_tickets,
              SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_tickets,
              SUM(CASE WHEN is_test = 0 THEN price_cents ELSE 0 END) as production_value_cents,
              SUM(CASE WHEN is_test = 1 THEN price_cents ELSE 0 END) as test_value_cents,
              COUNT(DISTINCT CASE WHEN is_test = 0 THEN transaction_id ELSE NULL END) as production_transactions,
              COUNT(DISTINCT CASE WHEN is_test = 1 THEN transaction_id ELSE NULL END) as test_transactions,
              MIN(created_at) as earliest_ticket,
              MAX(created_at) as latest_ticket
            FROM tickets`,
      args: []
    });

    return processDatabaseResult(result.rows[0] || {});
  }

  /**
   * Get all tickets with pagination
   */
  async getAllTickets(options = {}) {
    await this.ensureInitialized();

    const {
      limit = 100,
      offset = 0,
      status = null,
      event_id = null
    } = options;

    let sql = `SELECT * FROM tickets WHERE 1=1`;
    const args = [];

    if (status) {
      sql += ` AND status = ?`;
      args.push(status);
    }

    if (event_id) {
      sql += ` AND event_id = ?`;
      args.push(event_id);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const result = await this.db.execute({
      sql,
      args
    });

    return processDatabaseResult(result.rows);
  }

  /**
   * Clean up test tickets (for scheduled cleanup operations)
   * This method is used by test data cleanup processes
   */
  async cleanupTestTickets(criteria = {}) {
    await this.ensureInitialized();

    const {
      max_age_days = 30,
      exclude_recent_hours = 24,
      max_records = 100,
      dry_run = false
    } = criteria;

    // First, get tickets that match cleanup criteria
    const selectResult = await this.db.execute({
      sql: `SELECT id, ticket_id, transaction_id, created_at, is_test
            FROM tickets
            WHERE is_test = 1
            AND created_at < datetime('now', '-${max_age_days} days')
            AND created_at < datetime('now', '-${exclude_recent_hours} hours')
            ORDER BY created_at ASC
            LIMIT ?`,
      args: [max_records]
    });

    const ticketsToCleanup = selectResult.rows;

    if (dry_run) {
      return {
        tickets_identified: ticketsToCleanup.length,
        tickets_deleted: 0,
        dry_run: true,
        tickets: ticketsToCleanup
      };
    }

    // Delete the tickets
    let deletedCount = 0;
    if (ticketsToCleanup.length > 0) {
      const ticketIds = ticketsToCleanup.map(t => t.id);
      const placeholders = ticketIds.map(() => '?').join(',');

      const deleteResult = await this.db.execute({
        sql: `DELETE FROM tickets WHERE id IN (${placeholders})`,
        args: ticketIds
      });

      deletedCount = deleteResult.changes || 0;
    }

    return {
      tickets_identified: ticketsToCleanup.length,
      tickets_deleted: deletedCount,
      dry_run: false
    };
  }
}

export default new TicketService();
