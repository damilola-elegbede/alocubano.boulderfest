/**
 * Fraud Detection Service for Manual Ticket Entries
 * Simple fraud detection with configurable alerts
 */

import { getDatabaseClient } from "./database.js";
// Note: Email service not used yet - logFraudAlert only logs to console
// TODO: Import and use email service when sendFraudAlertEmail is implemented

export class FraudDetectionService {
  constructor() {
    // Promise-Based Lazy Singleton pattern
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;

    // Fraud detection thresholds
    this.RATE_LIMIT_THRESHOLD = 20; // tickets
    this.RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Ensure service is initialized (Promise-Based Lazy Singleton pattern)
   * Prevents race conditions by caching the initialization promise
   * @returns {Promise<FraudDetectionService>}
   */
  async ensureInitialized() {
    if (this.initialized && this.db) {
      return this; // Fast path
    }

    if (this.initializationPromise) {
      return this.initializationPromise; // Wait for existing
    }

    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      this.initializationPromise = null; // Enable retry
      throw error;
    }
  }

  /**
   * Perform initialization (private method)
   * @private
   */
  async _performInitialization() {
    try {
      // Initialize database client to verify connection
      this.db = await getDatabaseClient();

      if (!this.db) {
        throw new Error('Failed to get database client - db is null');
      }

      this.initialized = true;
      return this;
    } catch (error) {
      console.error('FraudDetectionService initialization failed:', error);
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Check for suspicious manual ticket creation patterns
   * @returns {Promise<{alert: boolean, count: number, message: string}>}
   */
  async checkManualTicketRateLimit() {
    try {
      await this.ensureInitialized();

      const windowStart = new Date(Date.now() - this.RATE_LIMIT_WINDOW_MS);

      // Count manual tickets created in the last 15 minutes
      const result = await this.db.execute({
        sql: `SELECT COUNT(*) as ticket_count
              FROM tickets t
              JOIN transactions tx ON t.transaction_id = tx.id
              WHERE tx.payment_processor IN ('cash', 'card_terminal', 'venmo', 'comp')
                AND t.created_at > ?`,
        args: [windowStart.toISOString()]
      });

      const ticketCount = Number(result.rows?.[0]?.ticket_count ?? 0);

      if (ticketCount >= this.RATE_LIMIT_THRESHOLD) {
        const message = `FRAUD ALERT: ${ticketCount} manual tickets created in ${this.RATE_LIMIT_WINDOW_MS / 60000} minutes`;

        // Log fraud alert (email sending not yet implemented)
        await this.logFraudAlert({
          ticketCount,
          windowMinutes: this.RATE_LIMIT_WINDOW_MS / 60000,
          threshold: this.RATE_LIMIT_THRESHOLD
        });

        return {
          alert: true,
          count: ticketCount,
          message
        };
      }

      return {
        alert: false,
        count: ticketCount,
        message: `${ticketCount} manual tickets in last ${this.RATE_LIMIT_WINDOW_MS / 60000} minutes (threshold: ${this.RATE_LIMIT_THRESHOLD})`
      };

    } catch (error) {
      console.error('Fraud detection check failed:', error);
      // Don't block transaction on fraud detection failure
      return {
        alert: false,
        count: 0,
        message: 'Fraud detection unavailable'
      };
    }
  }

  /**
   * Log fraud alert to console (email sending not yet implemented)
   * @param {Object} alertData - Alert details
   */
  async logFraudAlert(alertData) {
    const { ticketCount, windowMinutes, threshold } = alertData;

    const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_ALERT_EMAIL;

    // Log the alert to console (primary action)
    console.error(`
========================================
🚨 FRAUD ALERT 🚨
========================================
Suspicious manual ticket creation detected!

Tickets Created: ${ticketCount}
Time Window: ${windowMinutes} minutes
Threshold: ${threshold} tickets

This may indicate:
- Bulk fraudulent ticket creation
- Staff error (accidental duplicate submissions)
- Legitimate high-volume sales period

ACTION REQUIRED:
1. Check cash shift reconciliation
2. Review recent manual transactions
3. Verify all tickets with customers

Admin Email: ${adminEmail || 'NOT CONFIGURED'}
Timestamp: ${new Date().toISOString()}
========================================
    `);

    // TODO: Implement actual email sending via Brevo
    // This would require adding a sendFraudAlertEmail method to ticket-email-service.js
  }

  /**
   * Get fraud detection statistics
   * @returns {Promise<Object>} Statistics about manual ticket creation
   */
  async getStatistics() {
    try {
      await this.ensureInitialized();

      const stats = await this.db.execute({
        sql: `SELECT
                COUNT(*) as total_manual_tickets,
                COUNT(DISTINCT tx.id) as total_manual_transactions,
                SUM(t.price_cents) as total_revenue_cents,
                MIN(t.created_at) as first_ticket,
                MAX(t.created_at) as last_ticket
              FROM tickets t
              JOIN transactions tx ON t.transaction_id = tx.id
              WHERE tx.payment_processor IN ('cash', 'card_terminal', 'venmo', 'comp')`,
        args: []
      });

      if (stats.rows && stats.rows[0]) {
        const data = stats.rows[0];
        return {
          totalTickets: data.total_manual_tickets || 0,
          totalTransactions: data.total_manual_transactions || 0,
          totalRevenueCents: data.total_revenue_cents || 0,
          firstTicket: data.first_ticket,
          lastTicket: data.last_ticket
        };
      }

      return {
        totalTickets: 0,
        totalTransactions: 0,
        totalRevenueCents: 0,
        firstTicket: null,
        lastTicket: null
      };

    } catch (error) {
      console.error('Failed to get fraud detection statistics:', error);
      throw error;
    }
  }
}

// Lazy singleton instance and initialization promise
let _fraudDetectionInstance = null;
let _fraudDetectionInitPromise = null;

/**
 * Get the FraudDetectionService singleton instance
 * Implements lazy initialization to avoid instantiation on module load
 * @returns {FraudDetectionService}
 */
export function getFraudDetectionService() {
  if (!_fraudDetectionInstance) {
    _fraudDetectionInstance = new FraudDetectionService();
  }

  if (!_fraudDetectionInstance.initialized && !_fraudDetectionInitPromise) {
    _fraudDetectionInitPromise = _fraudDetectionInstance.ensureInitialized().catch(error => {
      _fraudDetectionInstance.initialized = false;
      _fraudDetectionInitPromise = null;
      throw error;
    });
  }

  return _fraudDetectionInstance;
}

/**
 * Reset the FraudDetectionService singleton instance
 * Used in tests to ensure a fresh instance with new database connection
 * @returns {void}
 */
export function resetFraudDetectionService() {
  if (_fraudDetectionInstance) {
    _fraudDetectionInstance.initialized = false;
    _fraudDetectionInstance.initializationPromise = null;
    _fraudDetectionInstance.db = null;
  }
  _fraudDetectionInstance = null;
  _fraudDetectionInitPromise = null;
}

// Export getter as default for backward compatibility
export default getFraudDetectionService;
