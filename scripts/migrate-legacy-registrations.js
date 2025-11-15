#!/usr/bin/env node

/**
 * Legacy Registration Migration Script
 *
 * This script handles the transition from post-purchase registration to inline registration.
 * It identifies tickets with pending registration status and:
 * 1. Sends one final notification email to purchasers
 * 2. Provides a 48-hour grace period for registration
 * 3. After grace period, marks unregistered tickets as expired
 *
 * Run this BEFORE deploying the inline registration migration.
 *
 * Usage:
 *   node scripts/migrate-legacy-registrations.js [--dry-run] [--send-emails] [--expire-now]
 *
 * Options:
 *   --dry-run      Show what would happen without making changes
 *   --send-emails  Send final notification emails to purchasers
 *   --expire-now   Immediately expire pending tickets (skip grace period)
 */

import { getDatabaseClient } from '../lib/database.js';
import { sendEmail } from '../lib/ticket-email-service-brevo.js';

const GRACE_PERIOD_HOURS = 48;

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sendEmails = args.includes('--send-emails');
const expireNow = args.includes('--expire-now');

/**
 * Find all transactions with pending registrations
 */
async function findPendingRegistrations(client) {
  const query = `
    SELECT
      t.id as transaction_db_id,
      t.transaction_id,
      t.order_number,
      t.customer_email,
      t.customer_name,
      t.created_at,
      COUNT(tk.id) as total_tickets,
      SUM(CASE WHEN tk.registration_status = 'pending' THEN 1 ELSE 0 END) as pending_tickets,
      SUM(CASE WHEN tk.registration_status = 'completed' THEN 1 ELSE 0 END) as completed_tickets
    FROM transactions t
    INNER JOIN tickets tk ON tk.transaction_id = t.id
    WHERE tk.registration_status = 'pending'
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `;

  const result = await client.execute(query);
  return result.rows;
}

/**
 * Get ticket details for a transaction
 */
async function getTransactionTickets(client, transactionDbId) {
  const query = `
    SELECT
      ticket_id,
      ticket_type,
      registration_status,
      registration_deadline
    FROM tickets
    WHERE transaction_id = ?
    ORDER BY created_at
  `;

  const result = await client.execute({
    sql: query,
    args: [transactionDbId]
  });

  return result.rows;
}

/**
 * Send final notification email to purchaser
 */
async function sendFinalNotification(transaction, tickets) {
  const pendingTickets = tickets.filter(t => t.registration_status === 'pending');

  if (pendingTickets.length === 0) {
    return { success: true, skipped: true };
  }

  const ticketListHtml = pendingTickets.map(t =>
    `<li><strong>${t.ticket_type}</strong> - Ticket ID: ${t.ticket_id}</li>`
  ).join('');

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a5490;">Important: Complete Your Ticket Registration</h2>

      <p>Hi ${transaction.customer_name || 'there'},</p>

      <p>We're upgrading our registration system and noticed you have <strong>${pendingTickets.length} ticket(s)</strong>
      that still need attendee information.</p>

      <div style="background: #f0f8ff; padding: 15px; border-left: 4px solid #1a5490; margin: 20px 0;">
        <p style="margin: 0;"><strong>Order Number:</strong> ${transaction.order_number}</p>
        <p style="margin: 10px 0 0 0;"><strong>Pending Tickets:</strong></p>
        <ul style="margin: 10px 0 0 0;">
          ${ticketListHtml}
        </ul>
      </div>

      <p><strong>Action Required:</strong> Please complete registration within the next 48 hours.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.VERCEL_URL || 'https://alocubanoboulderfest.com'}/pages/core/register-tickets.html?token=${transaction.registration_token}"
           style="background: #1a5490; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Complete Registration Now
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        <strong>What's changing?</strong><br>
        Starting soon, registration will happen automatically during checkout.
        This is a one-time notification to help you complete any pending registrations.
      </p>

      <p style="color: #666; font-size: 14px;">
        Questions? Email us at <a href="mailto:alocubanoboulderfest@gmail.com">alocubanoboulderfest@gmail.com</a>
      </p>

      <p>See you on the dance floor!<br>
      A Lo Cubano Boulder Fest Team</p>
    </div>
  `;

  try {
    await sendEmail({
      to: transaction.customer_email,
      subject: 'Complete Your Ticket Registration - Action Required',
      html: emailHtml,
      from: {
        email: 'alocubanoboulderfest@gmail.com',
        name: 'A Lo Cubano Boulder Fest'
      }
    });

    return { success: true, skipped: false };
  } catch (error) {
    console.error(`Failed to send email to ${transaction.customer_email}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mark pending tickets as expired
 */
async function expireTickets(client, transactionDbId, ticketIds) {
  if (ticketIds.length === 0) {
    return 0;
  }

  const placeholders = ticketIds.map(() => '?').join(',');
  const query = `
    UPDATE tickets
    SET registration_status = 'expired',
        updated_at = CURRENT_TIMESTAMP
    WHERE transaction_id = ?
      AND ticket_id IN (${placeholders})
      AND registration_status = 'pending'
  `;

  const result = await client.execute({
    sql: query,
    args: [transactionDbId, ...ticketIds]
  });

  return result.rowsAffected || 0;
}

/**
 * Main migration logic
 */
async function runMigration() {
  console.log('\n========================================');
  console.log('Legacy Registration Migration');
  console.log('========================================\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (expireNow) {
    console.log('⚠️  EXPIRE NOW MODE - Tickets will be expired immediately\n');
  }

  const client = await getDatabaseClient();

  try {
    // Step 1: Find all pending registrations
    console.log('Step 1: Finding pending registrations...');
    const pendingTransactions = await findPendingRegistrations(client);

    console.log(`Found ${pendingTransactions.length} transaction(s) with pending registrations\n`);

    if (pendingTransactions.length === 0) {
      console.log('✅ No pending registrations found. Nothing to migrate.');
      return;
    }

    // Step 2: Process each transaction
    let emailsSent = 0;
    let emailsFailed = 0;
    let emailsSkipped = 0;
    let ticketsExpired = 0;

    for (const transaction of pendingTransactions) {
      console.log(`\nProcessing: ${transaction.order_number}`);
      console.log(`  Customer: ${transaction.customer_email}`);
      console.log(`  Pending: ${transaction.pending_tickets}/${transaction.total_tickets} tickets`);

      // Get ticket details
      const tickets = await getTransactionTickets(client, transaction.transaction_db_id);
      const pendingTickets = tickets.filter(t => t.registration_status === 'pending');

      // Send email if requested
      if (sendEmails && !dryRun) {
        const emailResult = await sendFinalNotification(transaction, tickets);

        if (emailResult.skipped) {
          emailsSkipped++;
          console.log('  ⏭️  Email skipped (no pending tickets)');
        } else if (emailResult.success) {
          emailsSent++;
          console.log('  ✅ Email sent successfully');
        } else {
          emailsFailed++;
          console.log(`  ❌ Email failed: ${emailResult.error}`);
        }
      } else if (sendEmails && dryRun) {
        console.log('  📧 Would send email (dry run)');
      }

      // Expire tickets if requested
      if (expireNow && !dryRun) {
        const pendingTicketIds = pendingTickets.map(t => t.ticket_id);
        const expired = await expireTickets(client, transaction.transaction_db_id, pendingTicketIds);
        ticketsExpired += expired;
        console.log(`  🔒 Expired ${expired} ticket(s)`);
      } else if (expireNow && dryRun) {
        console.log(`  🔒 Would expire ${pendingTickets.length} ticket(s) (dry run)`);
        ticketsExpired += pendingTickets.length; // For summary
      }
    }

    // Step 3: Summary
    console.log('\n========================================');
    console.log('Migration Summary');
    console.log('========================================\n');
    console.log(`Transactions processed: ${pendingTransactions.length}`);

    if (sendEmails) {
      console.log(`\nEmails:`);
      console.log(`  ✅ Sent: ${emailsSent}`);
      console.log(`  ❌ Failed: ${emailsFailed}`);
      console.log(`  ⏭️  Skipped: ${emailsSkipped}`);
    }

    if (expireNow) {
      console.log(`\nTickets expired: ${ticketsExpired}`);
    }

    // Recommendations
    console.log('\n========================================');
    console.log('Next Steps');
    console.log('========================================\n');

    if (!sendEmails) {
      console.log('💡 Run with --send-emails to notify customers');
    } else if (!expireNow) {
      console.log('💡 Wait 48 hours, then run with --expire-now to expire pending tickets');
      console.log('💡 Or run with both flags to do everything at once');
    } else {
      console.log('✅ Migration complete!');
      console.log('✅ Ready to deploy inline registration system');
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Done.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
