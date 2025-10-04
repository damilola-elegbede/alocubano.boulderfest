import { getDatabaseClient } from "./database.js";
import { generateOrderNumber } from "./order-number-generator.js";
import {
  extractTestModeFromStripeSession,
  getTestModeFlag,
  generateTestAwareTransactionId,
  createTestModeMetadata,
  logTestModeOperation,
  extractTestModeFromPayPalOrder,
} from "./test-mode-utils.js";

export class TransactionService {
  constructor() {
    // ✅ NEW WORKING PATTERN: Use getDatabaseClient() directly per operation
    // No longer store database instance in constructor to prevent hanging
  }

  /**
   * Ensure service is initialized (for API consistency)
   * Note: getDatabaseClient() handles initialization internally
   */
  async ensureInitialized() {
    // getDatabaseClient() handles initialization internally
    await getDatabaseClient();
    return this;
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
   * Create batch operation for transaction insertion
   * @param {Object} transactionData - Transaction data
   * @returns {Object} Batch operation object
   */
  createTransactionBatchOperation(transactionData) {
    const {
      uuid, type, orderData, cartData = null, amountCents, currency,
      stripeSessionId = null, stripePaymentIntentId = null,
      paypalOrderId = null, paypalCaptureId = null, paypalPayerId = null,
      paymentProcessor = 'stripe', referenceId = null, paymentMethodType,
      customerEmail, customerName, billingAddress, status, completedAt, isTest,
      orderNumber
    } = transactionData;

    return {
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, order_data, cart_data, amount_cents, total_amount, currency,
        stripe_session_id, stripe_payment_intent_id,
        paypal_order_id, paypal_capture_id, paypal_payer_id,
        payment_processor, reference_id, payment_method_type,
        customer_email, customer_name, billing_address,
        status, completed_at, is_test, order_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuid, uuid, type, orderData, cartData, amountCents, amountCents, currency,
        stripeSessionId, stripePaymentIntentId,
        paypalOrderId, paypalCaptureId, paypalPayerId,
        paymentProcessor, referenceId, paymentMethodType,
        customerEmail, customerName, billingAddress,
        status, completedAt, isTest, orderNumber
      ]
    };
  }

  /**
   * Create batch operation for transaction item insertion
   * @param {Object} itemData - Transaction item data
   * @returns {Object} Batch operation object
   */
  createTransactionItemBatchOperation(itemData) {
    const {
      transactionUuid, itemType, itemName, itemDescription, quantity,
      unitPriceCents, totalPriceCents, ticketType, eventId, productMetadata, isTest
    } = itemData;

    return {
      sql: `INSERT INTO transaction_items (
        transaction_id, item_type, item_name, item_description,
        quantity, unit_price_cents, total_price_cents,
        ticket_type, event_id, product_metadata, is_test
      ) VALUES ((SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transactionUuid, itemType, itemName, itemDescription, quantity,
        unitPriceCents, totalPriceCents, ticketType, eventId, productMetadata, isTest
      ]
    };
  }

  /**
   * Create batch operation for payment event logging
   * @param {Object} eventData - Payment event data
   * @returns {Object} Batch operation object
   */
  createPaymentEventBatchOperation(eventData) {
    const {
      transactionId, eventType, source, sourceId, eventData: data,
      previousStatus, newStatus, processedAt
    } = eventData;

    return {
      sql: `INSERT INTO payment_events (
        transaction_id, event_type, source, source_id,
        event_data, previous_status, new_status, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transactionId, eventType, source, sourceId,
        data, previousStatus, newStatus, processedAt
      ]
    };
  }

  /**
   * Create a new transaction from Stripe checkout session using batch operations
   * @param {Object} session - Stripe checkout session
   * @param {Object} req - Optional request object
   * @param {boolean} inTransaction - Whether we're already in a transaction (deprecated - now uses batch operations)
   */
  async createFromStripeSession(session, paymentMethodData = null, req = null, inTransaction = false) {
    try {
      const baseUuid = this.generateTransactionUUID();

      // Extract test mode information from Stripe session and environment
      const testModeInfo = extractTestModeFromStripeSession(session);
      const envTestMode = getTestModeFlag(req);

      // Use the highest test mode indicator (Stripe test mode or environment test mode)
      const isTest = Math.max(testModeInfo.is_test, envTestMode);

      // Generate test-aware transaction UUID
      const uuid = generateTestAwareTransactionId(baseUuid, req);

      // Generate user-friendly order number (ALO-YYYY-NNNN)
      const orderNumber = await generateOrderNumber();
      console.log(`Generated order number: ${orderNumber} for transaction ${uuid}`);

      // Log test mode operation for debugging
      logTestModeOperation('transaction_creation', {
        uuid,
        orderNumber,
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
      // CRITICAL: For completed payments, amount_total must not be NULL or 0
      const amountCents = session.amount_total ?? 0;
      if (amountCents === 0 && session.payment_status === 'paid') {
        console.error('CRITICAL: Stripe session has payment_status=paid but amount_total is 0 or NULL', {
          session_id: session.id,
          amount_total: session.amount_total,
          payment_status: session.payment_status
        });
        throw new Error('Invalid payment: amount_total is 0 for paid session');
      }
      const currency = (session.currency || "usd").toUpperCase();

      // Extract event_id from session metadata
      // CRITICAL: This ensures every transaction is attributed to an event
      const eventId = session.metadata?.event_id ||
                      session.metadata?.eventId ||
                      process.env.DEFAULT_EVENT_ID ||
                      'boulder-fest-2026';

      // Validate event_id exists
      if (!eventId || eventId === '') {
        console.warn('CRITICAL: Transaction missing event_id', {
          session_id: session.id,
          metadata: session.metadata
        });
      }

      // Prepare batch operations
      const batchOperations = [];

      // 1. Insert transaction with test mode flag, order number, payment method data, and event_id
      batchOperations.push({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, order_data, amount_cents, total_amount, currency,
          stripe_session_id, stripe_payment_intent_id, payment_method_type,
          customer_email, customer_name, billing_address,
          status, completed_at, is_test, order_number,
          card_brand, card_last4, payment_wallet, payment_processor, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuid, // Use UUID as transaction_id for backward compatibility
          uuid,
          transactionType,
          orderData,
          amountCents, // Keep in cents as stored in DB
          amountCents, // total_amount same as amount_cents for receipts
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
          orderNumber, // Add order number
          paymentMethodData?.card_brand || null,
          paymentMethodData?.card_last4 || null,
          paymentMethodData?.payment_wallet || null,
          'stripe', // Payment processor
          eventId, // CRITICAL: Add event_id for transaction attribution
        ]
      });

      // 2. Prepare transaction items operations
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

        batchOperations.push({
          sql: `INSERT INTO transaction_items (
            transaction_id, item_type, item_name, item_description,
            quantity, unit_price_cents, total_price_cents,
            ticket_type, event_id, product_metadata, is_test
          ) VALUES ((SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            uuid, // Reference the transaction UUID
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
          ]
        });

        // Log transaction item creation in test mode
        logTestModeOperation('transaction_item_created', {
          uuid: uuid,
          item_type: itemType,
          quantity,
          unit_price_cents: unitPriceCents,
          is_test: isTest
        }, req);
      }

      // Execute all operations atomically using Turso batch
      const db = await getDatabaseClient();
      const results = await db.batch(batchOperations);

      // Get the inserted transaction
      const transaction = await this.getByUUID(uuid);

      if (!transaction) {
        throw new Error(
          `Failed to retrieve created transaction with UUID: ${uuid}`,
        );
      }

      // Log successful transaction creation
      logTestModeOperation('transaction_created', {
        transaction_id: transaction.id,
        uuid: transaction.uuid,
        amount_cents: transaction.amount_cents,
        is_test: transaction.is_test
      }, req);

      return transaction;
    } catch (error) {
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
   * Create transaction items from line items using batch operations
   */
  async createTransactionItems(transactionId, session, isTest = 0, req = null) {
    const lineItems = session.line_items?.data || [];

    if (lineItems.length === 0) {
      return; // No items to create
    }

    // Prepare batch operations for all items
    const batchOperations = [];

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

      batchOperations.push({
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

    // Execute all item insertions atomically
    const db = await getDatabaseClient();
    await db.batch(batchOperations);
  }

  /**
   * Determine item type from line item
   * Checks metadata first (most reliable), then falls back to description
   */
  determineItemType(item) {
    // Primary: Check product metadata (most reliable source)
    const meta = item.price?.product?.metadata || {};
    if (meta.type === 'donation' || meta.donation_category) {
      return "donation";
    }

    // Fallback: Check description for legacy/edge cases
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
    const db = await getDatabaseClient();
    const result = await db.execute({
      sql: "SELECT * FROM transactions WHERE uuid = ?",
      args: [uuid],
    });
    return result.rows[0];
  }

  /**
   * Get transaction by Stripe session ID
   */
  async getByStripeSessionId(sessionId) {
    const db = await getDatabaseClient();
    const result = await db.execute({
      sql: `SELECT
        id, transaction_id, uuid, type, order_data, amount_cents,
        currency, stripe_session_id, stripe_payment_intent_id,
        paypal_order_id, paypal_capture_id, payment_method_type,
        customer_email, customer_name, billing_address,
        status, completed_at, created_at, updated_at,
        registration_token, is_test, order_number
        FROM transactions WHERE stripe_session_id = ?`,
      args: [sessionId],
    });

    if (!result.rows[0]) return null;

    const row = result.rows[0];
    // Map array to object with named properties
    return {
      id: row[0],
      transaction_id: row[1],
      uuid: row[2],
      type: row[3],
      order_data: row[4],
      amount_cents: row[5],
      total_amount: row[5],  // Add alias for email service compatibility
      currency: row[6],
      stripe_session_id: row[7],
      stripe_payment_intent_id: row[8],
      paypal_order_id: row[9],
      paypal_capture_id: row[10],
      payment_method_type: row[11],
      customer_email: row[12],
      customer_name: row[13],
      billing_address: row[14],
      status: row[15],
      completed_at: row[16],
      created_at: row[17],
      updated_at: row[18],
      registration_token: row[19],
      is_test: row[20],
      order_number: row[21]
    };
  }

  /**
   * Update transaction status using batch operations
   */
  async updateStatus(uuid, status, metadata = {}) {
    // Use parameterized timestamp for database-agnostic compatibility
    const updatedAt = new Date().toISOString();

    // Get existing transaction for status change logging
    const transaction = await this.getByUUID(uuid);
    if (!transaction) {
      throw new Error(`Transaction ${uuid} not found`);
    }

    // Safely stringify metadata
    let eventData;
    try {
      eventData = JSON.stringify({ metadata });
    } catch (e) {
      eventData = "{}";
    }

    // Prepare batch operations for atomic update and logging
    const batchOperations = [
      // 1. Update transaction status
      {
        sql: `UPDATE transactions
              SET status = ?, updated_at = ?
              WHERE uuid = ?`,
        args: [status, updatedAt, uuid],
      },
      // 2. Log status change event
      {
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
          status,
          updatedAt,
        ],
      }
    ];

    // Execute both operations atomically
    const db = await getDatabaseClient();
    await db.batch(batchOperations);
  }

  /**
   * Log transaction status change (deprecated - now integrated into batch operations)
   * @deprecated Use updateStatus() or updatePayPalCapture() which include logging atomically
   */
  async logStatusChange(uuid, newStatus, metadata) {
    console.warn('logStatusChange is deprecated - use updateStatus() or updatePayPalCapture() for atomic operations');

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

    const db = await getDatabaseClient();
    await db.execute({
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
    const db = await getDatabaseClient();
    const result = await db.execute({
      sql: "SELECT * FROM transactions WHERE stripe_payment_intent_id = ?",
      args: [paymentIntentId],
    });
    return result.rows[0];
  }

  /**
   * Get customer transaction history
   */
  async getCustomerTransactions(email) {
    const db = await getDatabaseClient();
    const result = await db.execute({
      sql: `SELECT * FROM transactions
            WHERE customer_email = ?
            ORDER BY created_at DESC`,
      args: [email],
    });
    return result.rows;
  }

  /**
   * Get all transactions
   */
  async getAllTransactions(options = {}) {
    const {
      limit = 100,
      offset = 0,
      status = null
    } = options;

    let sql = `SELECT * FROM transactions WHERE 1=1`;
    const args = [];

    if (status) {
      sql += ` AND status = ?`;
      args.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const db = await getDatabaseClient();
    const result = await db.execute({
      sql,
      args
    });

    return result.rows;
  }

  /**
   * Get transaction statistics with test mode breakdown
   */
  async getTransactionStatistics(req = null) {
    const db = await getDatabaseClient();
    const result = await db.execute({
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

  /**
   * Create a new transaction from PayPal order using batch operations
   */
  async createFromPayPalOrder(paypalOrder, req = null) {
    try {
      const baseUuid = this.generateTransactionUUID();

      // Extract test mode information from PayPal order and environment
      const testModeInfo = extractTestModeFromPayPalOrder(paypalOrder);
      const envTestMode = getTestModeFlag(req);

      // Use the highest test mode indicator (PayPal test mode or environment test mode)
      const isTest = Math.max(testModeInfo.is_test, envTestMode);

      // Generate test-aware transaction UUID
      const uuid = generateTestAwareTransactionId(baseUuid, req);

      // Generate user-friendly order number (ALO-YYYY-NNNN)
      const orderNumber = await generateOrderNumber();
      console.log(`Generated order number: ${orderNumber} for PayPal transaction ${uuid}`);

      // Log test mode operation for debugging
      logTestModeOperation('paypal_transaction_creation', {
        uuid,
        orderNumber,
        paypal_test_mode: testModeInfo.paypal_test_mode,
        metadata_test_mode: testModeInfo.metadata_test_mode,
        env_test_mode: envTestMode === 1,
        final_test_mode: isTest === 1
      }, req);

      // Extract PayPal order details
      const paypalOrderId = paypalOrder.id;
      const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
      const paypalCaptureId = capture?.id || null;
      const paypalPayerId = paypalOrder.payer?.payer_id || null;

      // Calculate amount from PayPal order
      const amountCents = Math.round(parseFloat(capture?.amount?.value || paypalOrder.purchase_units?.[0]?.amount?.value || 0) * 100);
      const currency = (capture?.amount?.currency_code || paypalOrder.purchase_units?.[0]?.amount?.currency_code || "USD").toUpperCase();

      // Determine transaction type from PayPal order
      const transactionType = this.determineTransactionTypeFromPayPal(paypalOrder);

      // Safely prepare order data with test mode metadata
      let orderData;
      try {
        const baseOrderData = {
          paypal_order: paypalOrder,
          purchase_units: paypalOrder.purchase_units || [],
          payer: paypalOrder.payer || {},
          payment_source: paypalOrder.payment_source || {},
          status: paypalOrder.status
        };

        // Add test mode information to order data
        const testModeMetadata = createTestModeMetadata(req, {
          paypal_test_mode: testModeInfo.paypal_test_mode,
          metadata_test_mode: testModeInfo.metadata_test_mode
        });

        orderData = JSON.stringify({
          ...baseOrderData,
          test_mode_info: testModeMetadata
        });
      } catch (e) {
        console.warn("Failed to stringify PayPal order data, using minimal data");
        orderData = JSON.stringify({
          error: "Could not serialize PayPal order data",
          test_mode: isTest === 1,
          paypal_order_id: paypalOrderId
        });
      }

      // Safely prepare cart data from PayPal items
      let cartData;
      try {
        const items = [];
        for (const unit of paypalOrder.purchase_units || []) {
          if (unit.items) {
            items.push(...unit.items.map(item => ({
              name: item.name,
              quantity: parseInt(item.quantity) || 1,
              unit_amount: parseFloat(item.unit_amount?.value) || 0,
              currency: item.unit_amount?.currency_code || 'USD',
              description: item.description || ''
            })));
          }
        }
        cartData = JSON.stringify({ items });
      } catch (e) {
        cartData = JSON.stringify({ error: "Could not serialize cart data", test_mode: isTest === 1 });
      }

      // Safely prepare billing address from payer info
      let billingAddress;
      try {
        billingAddress = JSON.stringify(
          paypalOrder.payer?.address || {}
        );
      } catch (e) {
        billingAddress = "{}";
      }

      // Generate reference ID for PayPal orders
      const referenceId = `ALCBF-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Prepare batch operations
      const batchOperations = [];

      // 1. Insert transaction with PayPal data and order number
      batchOperations.push({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, order_data, cart_data, amount_cents, total_amount, currency,
          paypal_order_id, paypal_capture_id, paypal_payer_id, payment_processor,
          reference_id, payment_method_type,
          customer_email, customer_name, billing_address,
          status, completed_at, is_test, order_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuid, // Use UUID as transaction_id for backward compatibility
          uuid,
          transactionType,
          orderData,
          cartData,
          amountCents, // Keep in cents as stored in DB
          amountCents, // total_amount same as amount_cents for receipts
          currency,
          paypalOrderId,
          paypalCaptureId,
          paypalPayerId,
          'paypal',
          referenceId,
          'paypal',
          paypalOrder.payer?.email_address || null,
          this.formatPayPalCustomerName(paypalOrder.payer?.name),
          billingAddress,
          capture ? "completed" : "pending",
          capture ? new Date().toISOString() : null,
          isTest, // Add test mode flag
          orderNumber, // Add order number
        ]
      });

      // 2. Prepare PayPal transaction items operations
      const purchaseUnits = paypalOrder.purchase_units || [];
      for (const unit of purchaseUnits) {
        const items = unit.items || [];

        for (const item of items) {
          const itemType = this.determineItemTypeFromPayPal(item);
          const quantity = parseInt(item.quantity) || 1;

          // PayPal amounts are in dollars - convert to cents
          const unitPriceCents = Math.round((parseFloat(item.unit_amount?.value) || 0) * 100);
          const totalPriceCents = unitPriceCents * quantity;

          // Safely stringify metadata with test mode information
          let metadata;
          try {
            const baseMetadata = {
              paypal_item: item,
              sku: item.sku || null,
              category: item.category || null
            };
            const testModeMetadata = createTestModeMetadata(req, baseMetadata);
            metadata = JSON.stringify(testModeMetadata);
          } catch (e) {
            metadata = JSON.stringify({ test_mode: isTest === 1 });
          }

          batchOperations.push({
            sql: `INSERT INTO transaction_items (
              transaction_id, item_type, item_name, item_description,
              quantity, unit_price_cents, total_price_cents,
              ticket_type, event_id, product_metadata, is_test
            ) VALUES ((SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              uuid, // Reference the transaction UUID
              itemType,
              item.name || "Unknown Item",
              item.description || null,
              quantity,
              unitPriceCents, // Keep in cents
              totalPriceCents, // Keep in cents
              this.extractTicketTypeFromPayPal(item), // ticket_type
              process.env.DEFAULT_EVENT_ID || "boulder-fest-2026", // event_id
              metadata, // product_metadata with test mode info
              isTest, // Add test mode flag
            ]
          });

          // Log transaction item creation in test mode
          logTestModeOperation('paypal_transaction_item_created', {
            uuid: uuid,
            item_type: itemType,
            quantity,
            unit_price_cents: unitPriceCents,
            is_test: isTest
          }, req);
        }
      }

      // Execute all operations atomically using Turso batch
      const results = await this.db.batch(batchOperations);

      // Get the inserted transaction
      const transaction = await this.getByUUID(uuid);

      if (!transaction) {
        throw new Error(
          `Failed to retrieve created PayPal transaction with UUID: ${uuid}`,
        );
      }

      // Log successful transaction creation
      logTestModeOperation('paypal_transaction_created', {
        transaction_id: transaction.id,
        uuid: transaction.uuid,
        amount_cents: transaction.amount_cents,
        paypal_order_id: paypalOrderId,
        is_test: transaction.is_test
      }, req);

      return transaction;
    } catch (error) {
      console.error("Failed to create PayPal transaction:", error);
      throw error;
    }
  }

  /**
   * Determine transaction type from PayPal order data
   */
  determineTransactionTypeFromPayPal(paypalOrder) {
    // Check purchase units for type indicators
    const purchaseUnits = paypalOrder.purchase_units || [];

    for (const unit of purchaseUnits) {
      if (unit.description?.toLowerCase().includes("donation")) {
        return "donation";
      }
      if (unit.items) {
        for (const item of unit.items) {
          if (item.name?.toLowerCase().includes("donation")) {
            return "donation";
          }
          if (item.description?.toLowerCase().includes("donation")) {
            return "donation";
          }
        }
      }
    }

    // Default to tickets for PayPal orders
    return "tickets";
  }

  /**
   * Format PayPal customer name for storage
   */
  formatPayPalCustomerName(paypalName) {
    if (!paypalName || typeof paypalName !== 'object') {
      return null;
    }

    const firstName = paypalName.given_name || '';
    const lastName = paypalName.surname || '';

    return `${firstName} ${lastName}`.trim() || null;
  }

  /**
   * Create transaction items from PayPal order items using batch operations
   */
  async createPayPalTransactionItems(transactionId, paypalOrder, isTest = 0, req = null) {
    const purchaseUnits = paypalOrder.purchase_units || [];

    // Prepare batch operations for all items
    const batchOperations = [];

    for (const unit of purchaseUnits) {
      const items = unit.items || [];

      for (const item of items) {
        const itemType = this.determineItemTypeFromPayPal(item);
        const quantity = parseInt(item.quantity) || 1;

        // PayPal amounts are in dollars - convert to cents
        const unitPriceCents = Math.round((parseFloat(item.unit_amount?.value) || 0) * 100);
        const totalPriceCents = unitPriceCents * quantity;

        // Safely stringify metadata with test mode information
        let metadata;
        try {
          const baseMetadata = {
            paypal_item: item,
            sku: item.sku || null,
            category: item.category || null
          };
          const testModeMetadata = createTestModeMetadata(req, baseMetadata);
          metadata = JSON.stringify(testModeMetadata);
        } catch (e) {
          metadata = JSON.stringify({ test_mode: isTest === 1 });
        }

        batchOperations.push({
          sql: `INSERT INTO transaction_items (
            transaction_id, item_type, item_name, item_description,
            quantity, unit_price_cents, total_price_cents,
            ticket_type, event_id, product_metadata, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            transactionId,
            itemType,
            item.name || "Unknown Item",
            item.description || null,
            quantity,
            unitPriceCents, // Keep in cents
            totalPriceCents, // Keep in cents
            this.extractTicketTypeFromPayPal(item), // ticket_type
            process.env.DEFAULT_EVENT_ID || "boulder-fest-2026", // event_id
            metadata, // product_metadata with test mode info
            isTest, // Add test mode flag
          ],
        });

        // Log transaction item creation in test mode
        logTestModeOperation('paypal_transaction_item_created', {
          transaction_id: transactionId,
          item_type: itemType,
          quantity,
          unit_price_cents: unitPriceCents,
          is_test: isTest
        }, req);
      }
    }

    // Execute all item insertions atomically if there are operations
    if (batchOperations.length > 0) {
      await this.db.batch(batchOperations);
    }
  }

  /**
   * Determine item type from PayPal item
   */
  determineItemTypeFromPayPal(item) {
    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();
    const category = (item.category || "").toLowerCase();

    if (name.includes("donation") || description.includes("donation") || category.includes("donation")) {
      return "donation";
    }
    if (name.includes("ticket") || name.includes("pass") || description.includes("ticket") || description.includes("pass")) {
      return "ticket";
    }
    if (name.includes("merchandise") || name.includes("merch") || category.includes("merchandise")) {
      return "merchandise";
    }
    return "ticket"; // Default
  }

  /**
   * Extract ticket type from PayPal item
   */
  extractTicketTypeFromPayPal(item) {
    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();
    const sku = (item.sku || "").toLowerCase();

    if (name.includes("vip") || description.includes("vip") || sku.includes("vip")) {
      return "vip";
    }
    if (name.includes("weekend") || description.includes("weekend") || sku.includes("weekend")) {
      return "weekend-pass";
    }
    if (name.includes("day") || description.includes("day") || sku.includes("day")) {
      return "day-pass";
    }
    if (name.includes("workshop") || description.includes("workshop") || sku.includes("workshop")) {
      return "workshop";
    }
    return "general";
  }

  /**
   * Get transaction by PayPal order ID
   */
  async getByPayPalOrderId(paypalOrderId) {
    const result = await this.db.execute({
      sql: "SELECT * FROM transactions WHERE paypal_order_id = ?",
      args: [paypalOrderId],
    });
    return result.rows[0];
  }

  /**
   * Get transaction by PayPal capture ID
   */
  async getByPayPalCaptureId(paypalCaptureId) {
    const result = await this.db.execute({
      sql: "SELECT * FROM transactions WHERE paypal_capture_id = ?",
      args: [paypalCaptureId],
    });
    return result.rows[0];
  }

  /**
   * Update PayPal capture details using batch operations
   */
  async updatePayPalCapture(uuid, captureId, status) {
    const updatedAt = new Date().toISOString();

    // Get existing transaction for status change logging
    const transaction = await this.getByUUID(uuid);
    if (!transaction) {
      throw new Error(`Transaction ${uuid} not found`);
    }

    // Safely stringify metadata
    let eventData;
    try {
      eventData = JSON.stringify({
        metadata: { paypal_capture_id: captureId },
        paypal_capture_id: captureId
      });
    } catch (e) {
      eventData = JSON.stringify({ paypal_capture_id: captureId });
    }

    // Prepare batch operations for atomic update and logging
    const batchOperations = [
      // 1. Update PayPal capture details
      {
        sql: `UPDATE transactions
              SET paypal_capture_id = ?, status = ?,
                  completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
                  updated_at = ?
              WHERE uuid = ?`,
        args: [captureId, status, status, updatedAt, updatedAt, uuid],
      },
      // 2. Log status change event
      {
        sql: `INSERT INTO payment_events (
          transaction_id, event_type, source, source_id,
          event_data, previous_status, new_status, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transaction.id,
          "status_change",
          "paypal",
          `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          eventData,
          transaction.status,
          status,
          updatedAt,
        ],
      }
    ];

    // Execute both operations atomically
    const db = await getDatabaseClient();
    await db.batch(batchOperations);
  }
}

export default new TransactionService();
