/**
 * Fraud Detection Service for Manual Ticket Entries
 * Simple fraud detection with configurable alerts
 */

import { getDatabaseClient } from "./database.js";
import { getTicketEmailService } from "./ticket-email-service-brevo.js";

export class FraudDetectionService {
  constructor() {
    // Fraud detection thresholds
    this.RATE_LIMIT_THRESHOLD = 20; // tickets
    this.RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Check for suspicious manual ticket creation patterns
   * @returns {Promise<{alert: boolean, count: number, message: string}>}
   */
  async checkManualTicketRateLimit() {
    const db = await getDatabaseClient();

    const windowStart = new Date(Date.now() - this.RATE_LIMIT_WINDOW_MS);

    try {
      // Count manual tickets created in the last 15 minutes
      const result = await db.execute({
        sql: `SELECT COUNT(*) as ticket_count
              FROM tickets t
              JOIN transactions tx ON t.transaction_id = tx.id
              WHERE tx.payment_processor IN ('cash', 'card_terminal', 'venmo', 'comp')
                AND t.created_at > ?`,
        args: [windowStart.toISOString()]
      });

      const ticketCount = result.rows && result.rows[0] ? result.rows[0].ticket_count : 0;

      if (ticketCount >= this.RATE_LIMIT_THRESHOLD) {
        const message = `FRAUD ALERT: ${ticketCount} manual tickets created in ${this.RATE_LIMIT_WINDOW_MS / 60000} minutes`;

        // Send alert email
        await this.sendFraudAlert({
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
   * Send fraud alert email to admin
   * @param {Object} alertData - Alert details
   */
  async sendFraudAlert(alertData) {
    const { ticketCount, windowMinutes, threshold } = alertData;

    const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_ALERT_EMAIL;

    if (!adminEmail) {
      console.warn('No admin email configured for fraud alerts');
      return;
    }

    try {
      const emailService = getTicketEmailService();

      // Use the email service to send alert
      // Note: You may need to create a dedicated alert method in ticket-email-service-brevo.js
      // For now, we'll log the alert
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

Timestamp: ${new Date().toISOString()}
========================================
      `);

      // TODO: Implement actual email sending via Brevo
      // This would require adding a sendAlertEmail method to ticket-email-service-brevo.js

    } catch (error) {
      console.error('Failed to send fraud alert email:', error);
    }
  }

  /**
   * Get fraud detection statistics
   * @returns {Promise<Object>} Statistics about manual ticket creation
   */
  async getStatistics() {
    const db = await getDatabaseClient();

    try {
      const stats = await db.execute({
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

export default new FraudDetectionService();
