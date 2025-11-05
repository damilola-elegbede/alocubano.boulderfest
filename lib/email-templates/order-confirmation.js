/**
 * Order Confirmation Email Template
 */

import { wrapInBaseLayout } from './base-layout.js';

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Build the HTML for an order confirmation email that also serves as a receipt.
 * @param {Object} data - Email data.
 * @param {string} data.customerName - Customer's full name to personalize the message and billing block.
 * @param {string} data.orderNumber - Order identifier shown in the order details.
 * @param {string} data.orderDate - Formatted order date displayed in the order details.
 * @param {number} data.totalTickets - Total number of tickets purchased.
 * @param {number} data.totalDonations - Total number of donations purchased.
 * @param {number} data.totalItems - Total number of items (tickets + donations).
 * @param {string} data.ticketsList - Pre-formatted HTML list of purchased tickets including pricing.
 * @param {string} data.registrationUrl - URL where attendees can be registered.
 * @param {string} data.registrationDeadline - Formatted registration deadline shown with the call-to-action.
 * @param {string} data.totalAmount - Total amount paid (e.g., "155.43") shown in the payment summary.
 * @param {string} data.paymentMethod - Payment method display (e.g., "Visa ••4242").
 * @param {string} data.transactionId - Transaction identifier for the payment.
 * @param {string} data.paymentDate - Formatted payment date shown in the payment summary.
 * @param {string} data.billingEmail - Billing email address displayed in billing information.
 * @returns {string} Complete HTML email content wrapped in the base site layout.
 */
export function generateOrderConfirmationEmail(data) {
  const {
    customerName,
    orderNumber,
    orderDate,
    totalTickets,
    totalDonations,
    totalItems,
    ticketsList,
    registrationUrl,
    registrationDeadline,
    totalAmount,
    paymentMethod,
    transactionId,
    paymentDate,
    billingEmail,
    manualEntryNotice = '',
    compTicketNotice = ''
  } = data;

  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">Your Order is Complete!</h1>

      <p style="margin: 0 0 15px 0;">Hi ${escapeHtml(customerName)},</p>

      <p style="margin: 0 0 20px 0;">Thank you for your purchase! Your tickets are ready for registration.</p>

      <!-- Payment Banner - Conditional based on ticket type -->
      ${compTicketNotice ? `
        <!-- Complimentary Ticket Banner -->
        <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #2e7d32; font-size: 14px;">
            🎁 <strong>Complimentary</strong> — No payment required
          </p>
        </div>
      ` : `
        <!-- Payment Received Banner -->
        <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #2e7d32; font-size: 14px;">
            ✓ <strong>Payment Received</strong> - This email serves as your official receipt.
          </p>
        </div>
      `}

      <!-- Manual Entry Notice -->
      ${manualEntryNotice}

      <!-- Comp Ticket Notice -->
      ${compTicketNotice}

      <!-- Order Details Box -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h2 style="margin: 0 0 10px 0; font-size: 20px;">Order Details</h2>
        <p style="margin: 5px 0;"><strong>Order Number:</strong> ${escapeHtml(orderNumber)}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${escapeHtml(orderDate)}</p>
        <p style="margin: 5px 0;"><strong>Items:</strong> ${totalTickets} Ticket${totalTickets !== 1 ? 's' : ''}${totalDonations > 0 ? `, ${totalDonations} Donation${totalDonations !== 1 ? 's' : ''}` : ''} (${totalItems} total)</p>
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
              <strong>$${totalAmount}</strong>
            </td>
          </tr>
        </table>

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
          <p style="margin: 5px 0; font-size: 14px; color: #666;">
            <strong>Payment Method:</strong> ${escapeHtml(paymentMethod)}
          </p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">
            <strong>Transaction ID:</strong> ${escapeHtml(transactionId)}
          </p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">
            <strong>Payment Date:</strong> ${escapeHtml(paymentDate)}
          </p>
        </div>
      </div>

      <h3 style="margin: 20px 0 10px 0; font-size: 18px;">Items Purchased:</h3>

      <!-- Tickets List - Pre-formatted HTML -->
      <div style="margin: 15px 0;">
        ${ticketsList}
      </div>

      <!-- Action Box -->
      <div style="background: #5b6bb5; border: 2px solid #4a5a9c; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: white; font-size: 18px;">Action Required</h3>
        <p style="margin: 0 0 20px 0; color: white;">Please register attendee information for each ticket</p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${registrationUrl}"
             style="display: inline-block; background: #000000; color: white; font-weight: bold; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-size: 16px;">
            View &amp; Register Tickets
          </a>
        </div>

        <p style="margin: 10px 0 0 0; color: white; font-size: 14px;">
          <small>Registration deadline: ${registrationDeadline}</small>
        </p>
      </div>

      <!-- Billing Information -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px;">Billing Information</h3>
        <p style="margin: 5px 0; font-size: 14px;">${escapeHtml(customerName)}</p>
        <p style="margin: 5px 0; font-size: 14px;">${escapeHtml(billingEmail)}</p>
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
