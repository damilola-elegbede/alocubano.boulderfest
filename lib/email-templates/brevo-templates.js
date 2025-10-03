/**
 * Brevo-Specific Email Templates
 *
 * These templates use Brevo's template variable syntax ({{ params.variableName }})
 * instead of JavaScript template literals. They're designed to be copied directly
 * into Brevo's template editor.
 */

import { wrapInBaseLayout } from './base-layout.js';

/**
 * Generate order confirmation email for Brevo with template variables
 * @returns {string} Complete HTML email with Brevo variable syntax
 */
export function generateBrevoOrderConfirmationEmail() {
  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">Your Order is Complete!</h1>

      <p style="margin: 0 0 15px 0;">Hi {{ params.customerName }},</p>

      <p style="margin: 0 0 20px 0;">Thank you for your purchase! Your tickets are ready for registration.</p>

      <!-- Payment Received Indicator -->
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #2e7d32; font-size: 14px;">
          ✓ <strong>Payment Received</strong> - This email serves as your official receipt.
        </p>
      </div>

      <!-- Order Details Box -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h2 style="margin: 0 0 10px 0; font-size: 20px;">Order Details</h2>
        <p style="margin: 5px 0;"><strong>Order Number:</strong> {{ params.orderNumber }}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> {{ params.orderDate }}</p>
        <p style="margin: 5px 0;"><strong>Items:</strong> {{ params.totalTickets }} Ticket{% if params.totalTickets != 1 %}s{% endif %}{% if params.totalDonations > 0 %}, {{ params.totalDonations }} Donation{% if params.totalDonations != 1 %}s{% endif %}{% endif %} ({{ params.totalItems }} total)</p>
      </div>

      <!-- Payment Summary Box -->
      <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 4px;">
        <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #1F2D3D;">Payment Summary</h2>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; font-size: 18px; border-top: 2px solid #ddd;">
              <strong>Total Paid:</strong>
            </td>
            <td style="padding: 12px 0; text-align: right; font-size: 20px; color: #d32f2f; border-top: 2px solid #ddd;">
              <strong>\${{ params.totalAmount }}</strong>
            </td>
          </tr>
        </table>

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
          <p style="margin: 5px 0; font-size: 14px; color: #666;">
            <strong>Payment Method:</strong> {{ params.paymentMethod }}
          </p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">
            <strong>Transaction ID:</strong> {{ params.transactionId }}
          </p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">
            <strong>Payment Date:</strong> {{ params.paymentDate }}
          </p>
        </div>
      </div>

      <h3 style="margin: 20px 0 10px 0; font-size: 18px;">Items Purchased:</h3>

      <!-- Tickets List - Pre-formatted HTML -->
      <div style="margin: 15px 0;">
        {{ params.ticketsList }}
      </div>

      <!-- Action Box -->
      <div style="background: #5b6bb5; border: 2px solid #4a5a9c; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: white; font-size: 18px;">Action Required</h3>
        <p style="margin: 0 0 20px 0; color: white;">Please register attendee information for each ticket</p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="{{ params.registrationUrl }}"
             style="display: inline-block; background: #000000; color: white; font-weight: bold; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-size: 16px;">
            View &amp; Register Tickets
          </a>
        </div>

        <p style="margin: 10px 0 0 0; color: white; font-size: 14px;">
          <small>Registration deadline: {{ params.registrationDeadline }}</small>
        </p>
      </div>

      <!-- Billing Information -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px;">Billing Information</h3>
        <p style="margin: 5px 0; font-size: 14px;">{{ params.customerName }}</p>
        <p style="margin: 5px 0; font-size: 14px;">{{ params.billingEmail }}</p>
      </div>

      <!-- Receipt Footer -->
      <div style="margin: 20px 0 2px 0; padding: 15px; background: #f9f9f9; border-radius: 4px; font-size: 12px; color: #666;">
        <p style="margin: 0 0 5px 0;">
          <strong>A Lo Cubano Boulder Fest</strong><br>
          Boulder, CO
        </p>
        <p style="margin: 10px 0 0 0;">
          This is your receipt for tax purposes. Please retain for your records.
        </p>
      </div>

    </div>
  `;

  return wrapInBaseLayout(content, 'Order Confirmation & Receipt');
}

/**
 * Generate attendee confirmation email for Brevo with template variables
 * @returns {string} Complete HTML email with Brevo variable syntax
 */
export function generateBrevoAttendeeConfirmationEmail() {
  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="color: #d32f2f; text-align: center;">Your Ticket is Ready!</h1>

      <p style="margin: 15px 0;">Hi {{ params.firstName }},</p>

      <p style="margin: 15px 0;">Your registration is complete for {{ params.eventName }}!</p>

      <!-- Ticket Details Box -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
        <h2 style="margin-top: 0;">Ticket Details</h2>
        <p style="margin: 5px 0;"><strong>Name:</strong> {{ params.firstName }} {{ params.lastName }}</p>
        <p style="margin: 5px 0;"><strong>Ticket ID:</strong> {{ params.ticketId }}</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> {{ params.ticketType }}</p>
        <p style="margin: 5px 0;"><strong>Order:</strong> {{ params.orderNumber }}</p>
        <p style="margin: 5px 0;"><strong>Location:</strong> {{ params.eventLocation }}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> {{ params.eventDate }}</p>
      </div>

      <!-- QR Code Section -->
      <div style="background: #fff; border: 2px solid #e0e0e0; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px;">
        <h3 style="margin-top: 0; color: #333;">Your QR Code</h3>
        <p style="font-size: 14px; color: #666; margin-bottom: 15px;">Show this at the entrance</p>
        <img src="{{ params.qrCodeUrl }}" alt="QR Code" style="width: 200px; height: 200px; border: 1px solid #ddd; padding: 10px; background: white;">
      </div>

      <!-- Wallet Buttons Section -->
      <div style="background: #e8f5e9; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px;">
        <a href="{{ params.walletPassUrl }}" style="display: inline-block; text-decoration: none; margin: 10px;">
          <img src="{{ params.appleWalletButtonUrl }}" alt="Add to Apple Wallet" style="height: 48px;">
        </a>
        <a href="{{ params.googleWalletUrl }}" style="display: inline-block; text-decoration: none; margin: 10px;">
          <img src="{{ params.googleWalletButtonUrl }}" alt="Add to Google Wallet" style="height: 48px;">
        </a>
      </div>

      <strong>What's Next?</strong>
      <ul style="margin: 10px 0; padding-left: 20px;">
        <li>Save this email as backup</li>
        <li>Add ticket to your phone wallet</li>
        <li>Show QR code at event entrance</li>
        <li>Arrive early and enjoy!</li>
      </ul>

      <p style="margin: 20px 0;">See you on the dance floor!</p>
    </div>
  `;

  return wrapInBaseLayout(content, 'Your Ticket is Ready');
}

/**
 * Generate registration reminder email for Brevo with template variables
 * @returns {string} Complete HTML email with Brevo variable syntax
 */
export function generateBrevoRegistrationReminderEmail() {
  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">Registration Reminder!</h1>

      <p style="margin: 0 0 15px 0;">Hi {{ params.customerName }},</p>

      <p style="margin: 0 0 20px 0;">You still have <strong>{{ params.totalTickets }} ticket(s)</strong> pending registration. Please view the tickets below to register them today!</p>

      <!-- Order Details Box -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h2 style="margin: 0 0 10px 0; font-size: 20px;">Order Details</h2>
        <p style="margin: 5px 0;"><strong>Order Number:</strong> {{ params.orderNumber }}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> {{ params.orderDate }}</p>
        <p style="margin: 5px 0;"><strong>Total Tickets:</strong> {{ params.totalTickets }}</p>
      </div>

      <h3 style="margin: 20px 0 10px 0; font-size: 18px;">Your Tickets:</h3>

      <!-- Tickets List - Pre-formatted HTML -->
      <div style="margin: 15px 0;">
        {{ params.ticketsList }}
      </div>

      <!-- Action Box -->
      <div style="background: #5b6bb5; border: 2px solid #4a5a9c; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: white; font-size: 18px;">Action Required</h3>
        <p style="margin: 0 0 20px 0; color: white;">Please register attendee information for each ticket</p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="{{ params.viewTicketsUrl }}"
             style="display: inline-block; background: #000000; color: white; font-weight: bold; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-size: 16px;">
            View &amp; Register Tickets
          </a>
        </div>

        <p style="margin: 10px 0 0 0; color: white; font-size: 14px;">
          <small>Registration deadline: {{ params.registrationDeadline }}</small>
        </p>
      </div>

    </div>
  `;

  return wrapInBaseLayout(content, 'Registration Reminder');
}
