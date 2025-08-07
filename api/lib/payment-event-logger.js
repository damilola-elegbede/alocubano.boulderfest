import { getDatabase } from './database.js';

export class PaymentEventLogger {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Log a Stripe webhook event
   */
  async logStripeEvent(event, transactionId = null) {
    try {
      const sourceId = `STRIPE-${event.id}`;
      
      // Check if event was already processed (idempotency)
      const existing = await this.db.execute({
        sql: 'SELECT id FROM payment_events WHERE source_id = ?',
        args: [sourceId]
      });
      
      if (existing.rows.length > 0) {
        console.log(`Event ${sourceId} already processed`);
        return { status: 'already_processed', eventId: sourceId };
      }
      
      // Log the event
      await this.db.execute({
        sql: `INSERT INTO payment_events (
          transaction_id, event_type, event_data, source, source_id,
          processed_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          transactionId,
          event.type,
          JSON.stringify(event.data.object),
          'stripe',
          sourceId,
          new Date().toISOString()
        ]
      });
      
      return { status: 'logged', eventId: sourceId };
      
    } catch (error) {
      console.error('Failed to log payment event:', error);
      
      // Try to log the error
      await this.logError(event, error);
      throw error;
    }
  }

  /**
   * Log an error that occurred during event processing
   */
  async logError(event, error) {
    try {
      const sourceId = `ERROR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      await this.db.execute({
        sql: `INSERT INTO payment_events (
          event_type, source, source_id,
          event_data, error_message
        ) VALUES (?, ?, ?, ?, ?)`,
        args: [
          event?.type || 'unknown',
          'stripe',
          sourceId,
          JSON.stringify(event || {}),
          error.message
        ]
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  /**
   * Mark an event for retry
   */
  async markForRetry(eventId) {
    await this.db.execute({
      sql: `UPDATE payment_events 
            SET retry_count = retry_count + 1, 
                last_retry_at = CURRENT_TIMESTAMP 
            WHERE event_id = ?`,
      args: [eventId]
    });
  }

  /**
   * Get unprocessed events for retry
   */
  async getUnprocessedEvents(limit = 10) {
    const result = await this.db.execute({
      sql: `SELECT * FROM payment_events 
            WHERE processing_status = 'pending' 
              AND retry_count < 5 
            ORDER BY created_at ASC 
            LIMIT ?`,
      args: [limit]
    });
    return result.rows;
  }
}

export default new PaymentEventLogger();