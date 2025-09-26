/**
 * Email Retry Queue Processor
 * Processes failed emails from the retry queue
 * Can be called via cron job or manually
 */

import { getDatabaseClient } from "../../lib/database.js";
import { getTicketEmailService } from "../../lib/ticket-email-service-brevo.js";
import { getBrevoClient } from "../../lib/brevo-client.js";
import { setSecureCorsHeaders } from '../../lib/cors-config.js';

// Maximum number of retries before giving up
const MAX_RETRY_ATTEMPTS = 5;

// Exponential backoff calculation
function calculateNextRetryTime(attemptCount) {
  // Exponential backoff: 5min, 15min, 45min, 2hr, 6hr
  const baseDelay = 5 * 60 * 1000; // 5 minutes in milliseconds
  const delay = baseDelay * Math.pow(3, Math.min(attemptCount, 4));
  return new Date(Date.now() + delay);
}

export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);

  // Only allow POST requests (for manual trigger) or GET (for cron)
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: Add authentication for manual triggers
  const authKey = req.headers['x-internal-api-key'];
  if (req.method === 'POST' && authKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = await getDatabaseClient();
    const ticketEmailService = getTicketEmailService();
    const brevo = await getBrevoClient();

    // Get pending emails that are due for retry
    const pendingEmails = await db.execute({
      sql: `
        SELECT
          id, transaction_id, email_address, email_type,
          attempt_count, metadata, is_test
        FROM email_retry_queue
        WHERE status = 'pending'
          AND next_retry_at <= datetime('now')
          AND attempt_count < ?
        ORDER BY next_retry_at
        LIMIT 10
      `,
      args: [MAX_RETRY_ATTEMPTS]
    });

    if (!pendingEmails.rows || pendingEmails.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending emails to process',
        processed: 0
      });
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      abandoned: 0,
      details: []
    };

    // Process each pending email
    for (const row of pendingEmails.rows) {
      const email = {
        id: row.id,
        transaction_id: row.transaction_id,
        email_address: row.email_address,
        email_type: row.email_type,
        attempt_count: row.attempt_count,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        is_test: row.is_test
      };

      results.processed++;

      try {
        // Handle different email types
        if (email.email_type === 'ticket_confirmation') {
          // Fetch transaction details
          const transactionResult = await db.execute({
            sql: `
              SELECT
                id, uuid, customer_email, customer_name,
                amount_cents as total_amount, order_number
              FROM transactions
              WHERE uuid = ? OR id = ?
            `,
            args: [email.transaction_id, email.transaction_id]
          });

          if (!transactionResult.rows || transactionResult.rows.length === 0) {
            throw new Error(`Transaction not found: ${email.transaction_id}`);
          }

          const transaction = transactionResult.rows[0];

          // Fetch tickets for this transaction
          const ticketsResult = await db.execute({
            sql: `
              SELECT ticket_id, ticket_type, event_id
              FROM tickets
              WHERE transaction_id = ?
            `,
            args: [transaction.id]
          });

          const tickets = ticketsResult.rows.map(t => ({
            id: t.ticket_id,
            ticket_id: t.ticket_id,
            type: t.ticket_type
          }));

          // Send the email
          await ticketEmailService.sendTicketConfirmation(transaction, tickets);

          // Mark as successful
          await db.execute({
            sql: `
              UPDATE email_retry_queue
              SET status = 'sent',
                  sent_at = datetime('now'),
                  last_error = NULL
              WHERE id = ?
            `,
            args: [email.id]
          });

          results.succeeded++;
          results.details.push({
            id: email.id,
            status: 'sent',
            email: email.email_address,
            type: email.email_type
          });

        } else if (email.email_type === 'registration_confirmation') {
          // Handle registration confirmation emails
          const templateId = email.metadata.isPurchaser ?
            parseInt(process.env.BREVO_PURCHASER_CONFIRMATION_TEMPLATE_ID) :
            parseInt(process.env.BREVO_ATTENDEE_CONFIRMATION_TEMPLATE_ID);

          await brevo.sendTransactionalEmail({
            to: [{
              email: email.email_address,
              name: email.metadata.attendeeName || 'Guest'
            }],
            templateId: templateId,
            params: email.metadata.templateParams || {}
          });

          // Mark as successful
          await db.execute({
            sql: `
              UPDATE email_retry_queue
              SET status = 'sent',
                  sent_at = datetime('now'),
                  last_error = NULL
              WHERE id = ?
            `,
            args: [email.id]
          });

          results.succeeded++;
          results.details.push({
            id: email.id,
            status: 'sent',
            email: email.email_address,
            type: email.email_type
          });

        } else {
          throw new Error(`Unknown email type: ${email.email_type}`);
        }

      } catch (error) {
        console.error(`Failed to process email ${email.id}:`, error.message);

        const newAttemptCount = email.attempt_count + 1;

        if (newAttemptCount >= MAX_RETRY_ATTEMPTS) {
          // Mark as failed permanently
          await db.execute({
            sql: `
              UPDATE email_retry_queue
              SET status = 'failed',
                  attempt_count = ?,
                  last_error = ?
              WHERE id = ?
            `,
            args: [newAttemptCount, error.message, email.id]
          });

          results.abandoned++;
          results.details.push({
            id: email.id,
            status: 'abandoned',
            email: email.email_address,
            error: error.message,
            attempts: newAttemptCount
          });

        } else {
          // Schedule next retry with exponential backoff
          const nextRetryTime = calculateNextRetryTime(newAttemptCount);

          await db.execute({
            sql: `
              UPDATE email_retry_queue
              SET attempt_count = ?,
                  next_retry_at = ?,
                  last_error = ?
              WHERE id = ?
            `,
            args: [
              newAttemptCount,
              nextRetryTime.toISOString(),
              error.message,
              email.id
            ]
          });

          results.failed++;
          results.details.push({
            id: email.id,
            status: 'retry_scheduled',
            email: email.email_address,
            error: error.message,
            attempts: newAttemptCount,
            nextRetry: nextRetryTime.toISOString()
          });
        }
      }
    }

    // Log summary
    console.log('Email retry queue processing complete:', {
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed,
      abandoned: results.abandoned
    });

    return res.status(200).json({
      success: true,
      message: `Processed ${results.processed} emails`,
      results
    });

  } catch (error) {
    console.error('Email retry queue processor error:', error);
    return res.status(500).json({
      error: 'Failed to process email retry queue',
      message: error.message
    });
  }
}