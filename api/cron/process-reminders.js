/**
 * Cron job to process and send registration reminder emails
 * Runs every 10 minutes to send scheduled reminders from registration_reminders table
 */

import { getReminderScheduler } from '../../lib/reminder-scheduler.js';
import { getTicketEmailService } from '../../lib/ticket-email-service-brevo.js';

export default async function handler(req, res) {
  console.log('[CRON] Starting registration reminder processing at', new Date().toISOString());

  try {
    const scheduler = getReminderScheduler();
    await scheduler.ensureInitialized();
    const emailService = getTicketEmailService();

    // Get pending reminders that are due to be sent (scheduled_at <= now)
    const pendingReminders = await scheduler.getPendingReminders(10); // Process 10 at a time

    console.log(`[CRON] Found ${pendingReminders.length} pending reminders to send`);

    let sent = 0;
    let failed = 0;

    for (const reminder of pendingReminders) {
      try {
        console.log(`[CRON] Processing ${reminder.reminder_type} reminder for ticket ${reminder.ticket_id}`);

        // Calculate hours until deadline for email context
        const deadline = new Date(reminder.registration_deadline);
        const now = new Date();
        const hoursRemaining = Math.max(0, Math.floor((deadline - now) / (1000 * 60 * 60)));

        console.log(`[CRON] Sending ${reminder.reminder_type} reminder for ticket ${reminder.ticket_id} to ${reminder.customer_email}`);

        // Send the reminder email using the reminder_type from the database
        await emailService.sendRegistrationReminder({
          ticketId: reminder.ticket_id,
          transactionId: reminder.transaction_id,
          customerEmail: reminder.customer_email,
          customerName: reminder.customer_name,
          reminderType: reminder.reminder_type, // Use type from scheduled reminder
          registrationToken: reminder.registration_token,
          orderNumber: reminder.order_number || 'N/A',
          hoursRemaining: hoursRemaining,
          ticketsRemaining: 1 // For now, sending individual reminders
        });

        // Mark reminder as sent
        await scheduler.markReminderSent(reminder.id, true, null);

        sent++;
        console.log(`[CRON] Successfully sent ${reminder.reminder_type} reminder for ticket ${reminder.ticket_id}`);

      } catch (error) {
        console.error(`[CRON] Failed to send reminder for ticket ${reminder.ticket_id}:`, error);
        failed++;

        // Mark reminder as failed
        try {
          await scheduler.markReminderSent(reminder.id, false, error.message);
        } catch (markError) {
          console.error(`[CRON] Failed to mark reminder as failed:`, markError);
        }
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