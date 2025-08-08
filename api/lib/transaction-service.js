import { getDatabase } from "./database.js";

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
  async createFromStripeSession(session) {
    // Start transaction for atomicity
    await this.db.execute("BEGIN");

    try {
      const uuid = this.generateTransactionUUID();

      // Determine transaction type from line items or metadata
      const orderType = this.determineTransactionType(session);

      // Safely prepare order details
      let orderDetails;
      try {
        orderDetails = JSON.stringify({
          line_items: session.line_items?.data || [],
          metadata: session.metadata || {},
          mode: session.mode,
          payment_status: session.payment_status,
        });
      } catch (e) {
        console.warn("Failed to stringify order details, using minimal data");
        orderDetails = '{"error": "Could not serialize order details"}';
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
      const totalAmount = session.amount_total ?? 0;
      const currency = (session.currency || "usd").toUpperCase();

      // Insert transaction
      const result = await this.db.execute({
        sql: `INSERT INTO transactions (
          uuid, order_type, order_details, total_amount, currency,
          stripe_checkout_session_id, stripe_payment_intent_id, payment_method,
          customer_email, customer_name, billing_address,
          status, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuid,
          orderType,
          orderDetails,
          totalAmount, // Keep in cents as stored in DB
          currency,
          session.id,
          session.payment_intent || null,
          session.payment_method_types?.[0] || "card",
          session.customer_details?.email || session.customer_email || null,
          session.customer_details?.name || null,
          billingAddress,
          "paid",
          new Date().toISOString(),
        ],
      });

      // Get the inserted transaction
      const transaction = await this.getByUUID(uuid);

      if (!transaction) {
        throw new Error(
          `Failed to retrieve created transaction with UUID: ${uuid}`,
        );
      }

      // Create transaction items
      await this.createTransactionItems(transaction.id, session);

      // Commit transaction
      await this.db.execute("COMMIT");

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
  async createTransactionItems(transactionId, session) {
    const lineItems = session.line_items?.data || [];

    for (const item of lineItems) {
      const itemType = this.determineItemType(item);
      const quantity = item.quantity || 1;

      // Stripe amounts are in cents - keep them as cents in DB
      const unitPrice = item.price?.unit_amount || item.amount_total || 0;
      const totalPrice = item.amount_total || 0;
      const finalPrice = totalPrice; // No discount for now

      // Safely stringify metadata
      let metadata;
      try {
        metadata = JSON.stringify(item.price?.product?.metadata || {});
      } catch (e) {
        metadata = "{}";
      }

      await this.db.execute({
        sql: `INSERT INTO transaction_items (
          transaction_id, item_type, item_name, item_description,
          quantity, unit_price, total_price, final_price,
          event_name, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionId,
          itemType,
          item.description || "Unknown Item",
          item.price?.product?.description || null,
          quantity,
          unitPrice, // Keep in cents
          totalPrice, // Keep in cents
          finalPrice, // Keep in cents
          session.metadata?.event_name || "Boulder Fest 2026",
          metadata,
        ],
      });
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
      sql: "SELECT * FROM transactions WHERE stripe_checkout_session_id = ?",
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
   * Get customer transaction history
   */
  async getCustomerTransactions(email) {
    const result = await this.db.execute({
      sql: `SELECT * FROM transactions 
            WHERE customer_email = ? 
            ORDER BY created_at DESC`,
      args: [email],
    });
    return result.rows;
  }
}

export default new TransactionService();
