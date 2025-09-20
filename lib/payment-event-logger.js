import { getDatabase } from "./database.js";

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
        sql: "SELECT id FROM payment_events WHERE source_id = ?",
        args: [sourceId],
      });

      if (existing.rows.length > 0) {
        console.log(`Event ${sourceId} already processed`);
        return { status: "already_processed", eventId: sourceId };
      }

      // Safely stringify event data
      let eventData;
      try {
        eventData = JSON.stringify(event.data.object);
      } catch (e) {
        console.warn("Failed to stringify event data, using fallback");
        eventData = '{"error": "Could not serialize event data"}';
      }

      // Use event timestamp if available, otherwise use current time
      const timestamp = event.created
        ? new Date(event.created * 1000).toISOString()
        : new Date().toISOString();

      // Log the event with initial processing status
      await this.db.execute({
        sql: `INSERT INTO payment_events (
          transaction_id, event_type, event_data, source, source_id,
          processing_status, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionId,
          event.type,
          eventData,
          "stripe",
          sourceId,
          "pending",
          timestamp,
        ],
      });

      return { status: "logged", eventId: sourceId };
    } catch (error) {
      console.error("Failed to log payment event:", error);

      // Try to log the error with recursion flag
      await this.logError(event, error, true);
      throw error;
    }
  }

  /**
   * Update the transaction ID for an existing event
   */
  async updateEventTransactionId(eventId, transactionId) {
    try {
      const sourceId = `STRIPE-${eventId}`;
      await this.db.execute({
        sql: "UPDATE payment_events SET transaction_id = ? WHERE source_id = ?",
        args: [transactionId, sourceId],
      });
      console.log(`Updated transaction ID for event ${sourceId}`);
    } catch (error) {
      console.error("Failed to update event transaction ID:", error);
      throw error;
    }
  }

  /**
   * Log an error that occurred during event processing
   */
  async logError(event, error, isRecursive = false) {
    // Prevent infinite recursion
    if (isRecursive) {
      console.error("Error logging failed recursively:", error);
      return;
    }

    try {
      const sourceId = `ERROR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Safe serialization with circular reference handling
      const seen = new WeakSet();
      const safeStringify = (obj) => {
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return "[Circular Reference]";
            }
            seen.add(value);
          }
          return value;
        });
      };

      let eventData;
      try {
        eventData = safeStringify(event || {});
      } catch (e) {
        eventData = '{"error": "Could not serialize event"}';
      }

      await this.db.execute({
        sql: `INSERT INTO payment_events (
          event_type, source, source_id,
          event_data, error_message, processing_status
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          event?.type || "unknown",
          "stripe",
          sourceId,
          eventData,
          error.message,
          "failed",
        ],
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }
  }

  /**
   * Mark an event for retry
   */
  async markForRetry(eventId) {
    await this.db.execute({
      sql: `UPDATE payment_events
            SET retry_count = retry_count + 1,
                processed_at = ?
            WHERE source_id = ?`,
      args: [new Date().toISOString(), eventId],
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
      args: [limit],
    });
    return result.rows;
  }
}

export default new PaymentEventLogger();
