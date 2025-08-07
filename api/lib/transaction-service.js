import { getDatabase } from './database.js';

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
    try {
      const uuid = this.generateTransactionUUID();
      
      // Determine transaction type from line items or metadata
      const orderType = this.determineTransactionType(session);
      
      // Prepare order details
      const orderDetails = {
        line_items: session.line_items?.data || [],
        metadata: session.metadata || {},
        mode: session.mode,
        payment_status: session.payment_status
      };
      
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
          JSON.stringify(orderDetails),
          session.amount_total,
          session.currency.toUpperCase(),
          session.id,
          session.payment_intent,
          session.payment_method_types?.[0] || 'card',
          session.customer_details?.email || session.customer_email,
          session.customer_details?.name || null,
          JSON.stringify(session.customer_details?.address || {}),
          'paid',
          new Date().toISOString()
        ]
      });

      // Get the inserted transaction
      const transaction = await this.getByUUID(uuid);
      
      // Create transaction items
      await this.createTransactionItems(transaction.id, session);
      
      return transaction;
      
    } catch (error) {
      console.error('Failed to create transaction:', error);
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
    if (lineItems.some(item => item.description?.toLowerCase().includes('donation'))) {
      return 'donation';
    }
    if (lineItems.some(item => item.description?.toLowerCase().includes('ticket'))) {
      return 'tickets';
    }
    
    // Default to tickets for now
    return 'tickets';
  }

  /**
   * Create transaction items from line items
   */
  async createTransactionItems(transactionId, session) {
    const lineItems = session.line_items?.data || [];
    
    for (const item of lineItems) {
      const itemType = this.determineItemType(item);
      const unitPrice = item.price?.unit_amount || item.amount_total;
      const quantity = item.quantity || 1;
      const totalPrice = item.amount_total;
      const finalPrice = totalPrice; // No discount for now
      
      await this.db.execute({
        sql: `INSERT INTO transaction_items (
          transaction_id, item_type, item_name, item_description,
          quantity, unit_price, total_price, final_price,
          event_name, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionId,
          itemType,
          item.description || 'Unknown Item',
          item.price?.product?.description || null,
          quantity,
          unitPrice,
          totalPrice,
          finalPrice,
          session.metadata?.event_name || 'Boulder Fest 2026',
          JSON.stringify(item.price?.product?.metadata || {})
        ]
      });
    }
  }

  /**
   * Determine item type from line item
   */
  determineItemType(item) {
    const description = (item.description || '').toLowerCase();
    if (description.includes('donation')) return 'donation';
    if (description.includes('ticket') || description.includes('pass')) return 'ticket';
    if (description.includes('merchandise') || description.includes('merch')) return 'merchandise';
    return 'ticket'; // Default
  }

  /**
   * Extract ticket type from line item
   */
  extractTicketType(item) {
    const description = (item.description || '').toLowerCase();
    if (description.includes('vip')) return 'vip';
    if (description.includes('weekend')) return 'weekend-pass';
    if (description.includes('day')) return 'day-pass';
    if (description.includes('workshop')) return 'workshop';
    return 'general';
  }

  /**
   * Get transaction by UUID
   */
  async getByUUID(uuid) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM transactions WHERE uuid = ?',
      args: [uuid]
    });
    return result.rows[0];
  }

  /**
   * Get transaction by Stripe session ID
   */
  async getByStripeSessionId(sessionId) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM transactions WHERE stripe_checkout_session_id = ?',
      args: [sessionId]
    });
    return result.rows[0];
  }

  /**
   * Update transaction status
   */
  async updateStatus(uuid, status, metadata = {}) {
    await this.db.execute({
      sql: `UPDATE transactions 
            SET status = ?, updated_at = datetime('now') 
            WHERE uuid = ?`,
      args: [status, uuid]
    });
    
    // Log the status change
    await this.logStatusChange(uuid, status, metadata);
  }

  /**
   * Log transaction status change
   */
  async logStatusChange(uuid, newStatus, metadata) {
    const transaction = await this.getByUUID(uuid);
    
    await this.db.execute({
      sql: `INSERT INTO payment_events (
        transaction_id, event_type, source, source_id,
        event_data, previous_status, new_status, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transaction.id,
        'status_change',
        'system',
        `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        JSON.stringify({ metadata }),
        transaction.status,
        newStatus,
        new Date().toISOString()
      ]
    });
  }

  /**
   * Get customer transaction history
   */
  async getCustomerTransactions(email) {
    const result = await this.db.execute({
      sql: `SELECT * FROM transactions 
            WHERE customer_email = ? 
            ORDER BY created_at DESC`,
      args: [email]
    });
    return result.rows;
  }
}

export default new TransactionService();