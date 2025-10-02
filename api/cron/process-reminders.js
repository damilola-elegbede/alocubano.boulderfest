/**
 * Cron job to process and send registration reminder emails
 * Runs every 10 minutes to send scheduled reminders from registration_reminders table
 */

import { getReminderScheduler } from '../../lib/reminder-scheduler.js';
import { getTicketEmailService } from '../../lib/ticket-email-service-brevo.js';

export default async function handler(req, res) {
  console.log('[CRON] Starting registration reminder processing at', new Date().toISOString());

  // Verify authorization for cron job
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${process.env.CRON_SECRET || ''}`;

  if (authHeader !== expectedAuth && process.env.NODE_ENV === 'production') {
    console.warn('[CRON] Unauthorized cron job access attempt');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization header'
    });
  }

  try {
    const scheduler = getReminderScheduler();
    await scheduler.ensureInitialized();
    const emailService = getTicketEmailService();

    // Get pending reminders that are due to be sent (scheduled_at <= now)
    const pendingReminders = await scheduler.getPendingReminders(10); // Process 10 at a time

    console.log(`[CRON] Found ${pendingReminders.length} pending reminders to send`);

    if (pendingReminders.length > 0) {
      console.log('[CRON] Pending reminders:', pendingReminders.map(r => ({
        id: r.id,
        transaction_id: r.transaction_id,
        reminder_type: r.reminder_type,
        scheduled_at: r.scheduled_at,
        registration_deadline: r.registration_deadline,
        customer_email: r.customer_email
      })));
    }

    let sent = 0;
    let failed = 0;

    for (const reminder of pendingReminders) {
      try {
        console.log(
          `[CRON] Processing reminder ID ${reminder.id}: ${reminder.reminder_type} reminder for transaction ${reminder.transaction_id} ` +
          `(${reminder.pending_tickets}/${reminder.total_tickets} tickets pending)`
        );

        // Calculate hours until deadline for email context
        const deadline = new Date(reminder.registration_deadline);
        const now = new Date();
        const hoursRemaining = Math.max(0, Math.floor((deadline - now) / (1000 * 60 * 60)));

        console.log(
          `[CRON] Reminder details - ID: ${reminder.id}, scheduled_at: ${reminder.scheduled_at}, ` +
          `deadline: ${reminder.registration_deadline}, hoursRemaining: ${hoursRemaining}, ` +
          `sending to: ${reminder.customer_email}`
        );

        // Send ONE email to the purchaser about all their pending tickets
        const emailResult = await emailService.sendRegistrationReminder({
          transactionId: reminder.transaction_id,
          customerEmail: reminder.customer_email,
          customerName: reminder.customer_name,
          reminderType: reminder.reminder_type,
          registrationToken: reminder.registration_token,
          registrationDeadline: reminder.registration_deadline,
          orderNumber: reminder.order_number || 'N/A',
          hoursRemaining: hoursRemaining,
          ticketsRemaining: reminder.pending_tickets,
          totalTickets: reminder.total_tickets
        });

        console.log(
          `[CRON] Email sent successfully - reminder ID: ${reminder.id}, messageId: ${emailResult.messageId}`
        );

        // Mark reminder as sent
        await scheduler.markReminderSent(reminder.id, true, null);

        console.log(`[CRON] Marked reminder ID ${reminder.id} as sent in database`);

        sent++;
        console.log(
          `[CRON] Successfully completed reminder ID ${reminder.id} (${reminder.reminder_type}) for transaction ${reminder.transaction_id} ` +
          `(${reminder.pending_tickets} tickets)`
        );

      } catch (error) {
        console.error(
          `[CRON] Failed to send reminder ID ${reminder.id} for transaction ${reminder.transaction_id}:`,
          {
            error: error.message,
            stack: error.stack,
            reminder_type: reminder.reminder_type,
            customer_email: reminder.customer_email,
            scheduled_at: reminder.scheduled_at
          }
        );
        failed++;

        // Mark reminder as failed
        try {
          await scheduler.markReminderSent(reminder.id, false, error.message);
          console.log(`[CRON] Marked reminder ID ${reminder.id} as failed in database`);
        } catch (markError) {
          console.error(`[CRON] Failed to mark reminder ID ${reminder.id} as failed:`, markError);
        }
      }
    }

    console.log(`[CRON] Reminder processing complete. Sent: ${sent}, Failed: ${failed}`);

    res.json({
      success: true,
      processed: pendingReminders.length,
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