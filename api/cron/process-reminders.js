/**
 * Cron job to process and send registration reminder emails
 * Runs every 10 minutes to send reminders for unregistered tickets
 */

import { getDatabaseClient } from '../../lib/database.js';
import { getTicketEmailService } from '../../lib/ticket-email-service-brevo.js';

export default async function handler(req, res) {
  console.log('[CRON] Starting registration reminder processing at', new Date().toISOString());

  try {
    const db = await getDatabaseClient();
    const emailService = getTicketEmailService();

    // For testing: Get ANY pending (unregistered) tickets that need reminders
    // This will send reminders every 10 minutes regardless of deadline timing
    const pendingTickets = await db.execute({
      sql: `
        SELECT DISTINCT
          t.ticket_id,
          t.transaction_id,
          t.attendee_email,
          t.attendee_first_name,
          t.attendee_last_name,
          t.registration_deadline,
          t.ticket_type,
          tx.order_number,
          tx.customer_email,
          tx.customer_name,
          tx.registration_token,
          tx.uuid as transaction_uuid,
          -- Calculate hours until deadline
          CAST((julianday(t.registration_deadline) - julianday('now')) * 24 AS INTEGER) as hours_remaining
        FROM tickets t
        JOIN transactions tx ON t.transaction_id = tx.id
        WHERE t.registration_status = 'pending'
        AND t.registration_deadline > datetime('now')
        AND tx.customer_email IS NOT NULL
        -- Exclude tickets that got a reminder in the last 9 minutes to avoid spam
        AND NOT EXISTS (
          SELECT 1 FROM registration_reminders r
          WHERE r.ticket_id = t.ticket_id
          AND r.status = 'sent'
          AND r.updated_at > datetime('now', '-9 minutes')
        )
        LIMIT 10
      `,
      args: []
    });

    console.log(`[CRON] Found ${pendingTickets.rows.length} pending tickets needing reminders`);

    let sent = 0;
    let failed = 0;

    for (const ticket of pendingTickets.rows) {
      try {
        console.log(`[CRON] Processing reminder for ticket ${ticket.ticket_id}`);

        // Determine reminder type based on hours remaining
        let reminderType = 'standard';
        if (ticket.hours_remaining <= 2) {
          reminderType = 'final';
        } else if (ticket.hours_remaining <= 24) {
          reminderType = '24hr';
        } else if (ticket.hours_remaining <= 48) {
          reminderType = '48hr';
        } else if (ticket.hours_remaining <= 72) {
          reminderType = '72hr';
        }

        console.log(`[CRON] Sending ${reminderType} reminder for ticket ${ticket.ticket_id} to ${ticket.customer_email}`);

        // Send the reminder email
        await emailService.sendRegistrationReminder({
          ticketId: ticket.ticket_id,
          transactionId: ticket.transaction_uuid,
          customerEmail: ticket.customer_email,
          customerName: ticket.customer_name,
          reminderType: reminderType,
          registrationToken: ticket.registration_token,
          orderNumber: ticket.order_number,
          hoursRemaining: ticket.hours_remaining,
          ticketsRemaining: 1 // For now, sending individual reminders
        });

        // Record that we sent this reminder
        await db.execute({
          sql: `
            INSERT OR REPLACE INTO registration_reminders (
              ticket_id,
              reminder_type,
              scheduled_at,
              status,
              sent_at,
              updated_at
            ) VALUES (?, ?, datetime('now'), 'sent', datetime('now'), datetime('now'))
          `,
          args: [ticket.ticket_id, reminderType]
        });

        sent++;
        console.log(`[CRON] Successfully sent reminder for ticket ${ticket.ticket_id}`);

      } catch (error) {
        console.error(`[CRON] Failed to send reminder for ticket ${ticket.ticket_id}:`, error);
        failed++;

        // Record the failure
        await db.execute({
          sql: `
            INSERT OR REPLACE INTO registration_reminders (
              ticket_id,
              reminder_type,
              scheduled_at,
              status,
              error_message,
              updated_at
            ) VALUES (?, 'failed', datetime('now'), 'failed', ?, datetime('now'))
          `,
          args: [ticket.ticket_id, error.message]
        });
      }
    }

    console.log(`[CRON] Reminder processing complete. Sent: ${sent}, Failed: ${failed}`);

    res.json({
      success: true,
      processed: pendingTickets.rows.length,
      sent,
      failed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CRON] Critical error in reminder processing:', error);
    res.status(500).json({
      error: 'Failed to process reminders',
      message: error.message
    });
  }
}