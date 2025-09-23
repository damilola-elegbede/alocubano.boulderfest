import { getDatabase } from "./database.js";
import {
  extractTestModeFromStripeSession,
  getTestModeFlag,
  generateTestAwareTransactionId,
  createTestModeMetadata,
  logTestModeOperation,
  createTestModeFilter
} from "./test-mode-utils.js";

export class TransactionService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Generate a unique transaction UUID
   */
  generateTransactionUUID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Create a new transaction from Stripe checkout session
   */
  async createFromStripeSession(session, req = null) {
    // Start transaction with immediate write-lock to prevent race conditions
    await this.db.execute("BEGIN IMMEDIATE");

    try {
      const baseUuid = this.generateTransactionUUID();

      // Extract test mode information from Stripe session and environment
      const testModeInfo = extractTestModeFromStripeSession(session);
      const envTestMode = getTestModeFlag(req);

      // Use the highest test mode indicator (Stripe test mode or environment test mode)
      const isTest = Math.max(testModeInfo.is_test, envTestMode);

      // Generate test-aware transaction UUID
      const uuid = generateTestAwareTransactionId(baseUuid, req);

      // Log test mode operation for debugging
      logTestModeOperation('transaction_creation', {
        uuid,
        stripe_test_mode: testModeInfo.stripe_test_mode,
        metadata_test_mode: testModeInfo.metadata_test_mode,
        env_test_mode: envTestMode === 1,
        final_test_mode: isTest === 1
      }, req);

      // Determine transaction type from line items or metadata
      const transactionType = this.determineTransactionType(session);

      // Safely prepare order data with test mode metadata
      let orderData;
      try {
        const baseOrderData = {
          line_items: session.line_items?.data || [],
          metadata: session.metadata || {},
          mode: session.mode,
          payment_status: session.payment_status,
        };

        // Add test mode information to order data
        const testModeMetadata = createTestModeMetadata(req, {
          stripe_test_mode: testModeInfo.stripe_test_mode,
          metadata_test_mode: testModeInfo.metadata_test_mode
        });

        orderData = JSON.stringify({
          ...baseOrderData,
          test_mode_info: testModeMetadata
        });
      } catch (e) {
        console.warn("Failed to stringify order data, using minimal data");
        orderData = JSON.stringify({
          error: "Could not serialize order data",
          test_mode: isTest === 1
        });
      }

      // Safely prepare billing address
      let billingAddress;
      try {
        billingAddress = JSON.stringify(
          session.customer_details?.address || {},
        );
      } catch (e) {
        billingAddress = "{}";
      }

      // Null-safe amount access (Stripe amounts are in cents)
      const amountCents = session.amount_total ?? 0;
      const currency = (session.currency || "usd").toUpperCase();

      // Insert transaction with test mode flag
      const result = await this.db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, order_data, amount_cents, currency,
          stripe_session_id, stripe_payment_intent_id, payment_method_type,
          customer_email, customer_name, billing_address,
          status, completed_at, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuid, // Use UUID as transaction_id for backward compatibility
          uuid,
          transactionType,
          orderData,
          amountCents, // Keep in cents as stored in DB
          currency,
          session.id,
          session.payment_intent || null,
          session.payment_method_types?.[0] || "card",
          session.customer_details?.email || session.customer_email || null,
          session.customer_details?.name || null,
          billingAddress,
          "completed",
          new Date().toISOString(),
          isTest, // Add test mode flag
        ],
      });

      // Get the inserted transaction
      const transaction = await this.getByUUID(uuid);

      if (!transaction) {
        throw new Error(
          `Failed to retrieve created transaction with UUID: ${uuid}`,
        );
      }

      // Create transaction items with test mode support
      await this.createTransactionItems(transaction.id, session, isTest, req);

      // Commit transaction
      await this.db.execute("COMMIT");

      // Log successful transaction creation
      logTestModeOperation('transaction_created', {
        transaction_id: transaction.id,
        uuid: transaction.uuid,
        amount_cents: transaction.amount_cents,
        is_test: transaction.is_test
      }, req);

      return transaction;
    } catch (error) {
      // Rollback on error
      await this.db.execute("ROLLBACK");
      console.error("Failed to create transaction:", error);
      throw error;
    }
  }

  /**
   * Determine transaction type from session data
   */
  determineTransactionType(session) {
    // Check metadata first
    if (session.metadata?.type) {
      return session.metadata.type;
    }

    // Check line items
    const lineItems = session.line_items?.data || [];
    if (
      lineItems.some((item) =>
        item.description?.toLowerCase().includes("donation"),
      )
    ) {
      return "donation";
    }
    if (
      lineItems.some((item) =>
        item.description?.toLowerCase().includes("ticket"),
      )
    ) {
      return "tickets";
    }

    // Default to tickets for now
    return "tickets";
  }

  /**
   * Create transaction items from line items
   */
  async createTransactionItems(transactionId, session, isTest = 0, req = null) {
    const lineItems = session.line_items?.data || [];

    for (const item of lineItems) {
      const itemType = this.determineItemType(item);
      const quantity = item.quantity || 1;

      // Stripe amounts are in cents - keep them as cents in DB
      const unitPriceCents = item.price?.unit_amount || item.amount_total || 0;
      const totalPriceCents = item.amount_total || 0;

      // Safely stringify metadata with test mode information
      let metadata;
      try {
        const baseMetadata = item.price?.product?.metadata || {};
        const testModeMetadata = createTestModeMetadata(req, baseMetadata);
        metadata = JSON.stringify(testModeMetadata);
      } catch (e) {
        metadata = JSON.stringify({ test_mode: isTest === 1 });
      }

      await this.db.execute({
        sql: `INSERT INTO transaction_items (
          transaction_id, item_type, item_name, item_description,
          quantity, unit_price_cents, total_price_cents,
          ticket_type, event_id, product_metadata, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionId,
          itemType,
          item.description || "Unknown Item",
          item.price?.product?.description || null,
          quantity,
          unitPriceCents, // Keep in cents
          totalPriceCents, // Keep in cents
          this.extractTicketType(item), // ticket_type
          session.metadata?.event_id || "boulder-fest-2026", // event_id
          metadata, // product_metadata with test mode info
          isTest, // Add test mode flag
        ],
      });

      // Log transaction item creation in test mode
      logTestModeOperation('transaction_item_created', {
        transaction_id: transactionId,
        item_type: itemType,
        quantity,
        unit_price_cents: unitPriceCents,
        is_test: isTest
      }, req);
    }
  }

  /**
   * Determine item type from line item
   */
  determineItemType(item) {
    const description = (item.description || "").toLowerCase();
    if (description.includes("donation")) return "donation";
    if (description.includes("ticket") || description.includes("pass"))
      return "ticket";
    if (description.includes("merchandise") || description.includes("merch"))
      return "merchandise";
    return "ticket"; // Default
  }

  /**
   * Extract ticket type from line item
   */
  extractTicketType(item) {
    const description = (item.description || "").toLowerCase();
    if (description.includes("vip")) return "vip";
    if (description.includes("weekend")) return "weekend-pass";
    if (description.includes("day")) return "day-pass";
    if (description.includes("workshop")) return "workshop";
    return "general";
  }

  /**
   * Get transaction by UUID
   */
  async getByUUID(uuid) {
    const result = await this.db.execute({
      sql: "SELECT * FROM transactions WHERE uuid = ?",
      args: [uuid],
    });
    return result.rows[0];
  }

  /**
   * Get transaction by Stripe session ID
   */
  async getByStripeSessionId(sessionId) {
    const result = await this.db.execute({
      sql: "SELECT * FROM transactions WHERE stripe_session_id = ?",
      args: [sessionId],
    });
    return result.rows[0];
  }

  /**
   * Update transaction status
   */
  async updateStatus(uuid, status, metadata = {}) {
    // Use parameterized timestamp for database-agnostic compatibility
    const updatedAt = new Date().toISOString();

    await this.db.execute({
      sql: `UPDATE transactions
            SET status = ?, updated_at = ?
            WHERE uuid = ?`,
      args: [status, updatedAt, uuid],
    });

    // Log the status change
    await this.logStatusChange(uuid, status, metadata);
  }

  /**
   * Log transaction status change
   */
  async logStatusChange(uuid, newStatus, metadata) {
    const transaction = await this.getByUUID(uuid);

    // Check if transaction exists
    if (!transaction) {
      console.error(`Cannot log status change: transaction ${uuid} not found`);
      return;
    }

    // Safely stringify metadata
    let eventData;
    try {
      eventData = JSON.stringify({ metadata });
    } catch (e) {
      eventData = "{}";
    }

    await this.db.execute({
      sql: `INSERT INTO payment_events (
        transaction_id, event_type, source, source_id,
        event_data, previous_status, new_status, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transaction.id,
        "status_change",
        "system",
        `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        eventData,
        transaction.status,
        newStatus,
        new Date().toISOString(),
      ],
    });
  }

  /**
   * Get transaction by Stripe payment intent ID
   */
  async getByPaymentIntentId(paymentIntentId) {
    const result = await this.db.execute({
      sql: "SELECT * FROM transactions WHERE stripe_payment_intent_id = ?",
      args: [paymentIntentId],
    });
    return result.rows[0];
  }

  /**
   * Get customer transaction history with test mode filtering
   */
  async getCustomerTransactions(email, req = null) {
    // Apply test mode filtering
    const testFilter = createTestModeFilter('', null, req);

    const result = await this.db.execute({
      sql: `SELECT * FROM transactions
            WHERE customer_email = ?${testFilter.sql}
            ORDER BY created_at DESC`,
      args: [email, ...testFilter.args],
    });
    return result.rows;
  }

  /**
   * Get all transactions with test mode filtering
   */
  async getAllTransactions(options = {}, req = null) {
    const {
      limit = 100,
      offset = 0,
      status = null,
      includeTestData = null
    } = options;

    // Apply test mode filtering
    const testFilter = createTestModeFilter('', includeTestData, req);

    let sql = `SELECT * FROM transactions WHERE 1=1${testFilter.sql}`;
    const args = [...testFilter.args];

    if (status) {
      sql += ` AND status = ?`;
      args.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const result = await this.db.execute({
      sql,
      args
    });

    return result.rows;
  }

  /**
   * Get transaction statistics with test mode breakdown
   */
  async getTransactionStatistics(req = null) {
    const result = await this.db.execute({
      sql: `SELECT
              COUNT(*) as total_transactions,
              SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_transactions,
              SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_transactions,
              SUM(CASE WHEN is_test = 0 THEN amount_cents ELSE 0 END) as production_amount_cents,
              SUM(CASE WHEN is_test = 1 THEN amount_cents ELSE 0 END) as test_amount_cents,
              AVG(CASE WHEN is_test = 0 THEN amount_cents ELSE NULL END) as avg_production_amount_cents,
              MIN(created_at) as earliest_transaction,
              MAX(created_at) as latest_transaction
            FROM transactions`,
      args: []
    });

    return result.rows[0] || {};
  }
}

export default new TransactionService();
