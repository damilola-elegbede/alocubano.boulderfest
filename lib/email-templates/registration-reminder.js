/**
 * Registration Reminder Email Template
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
 * Generate registration reminder email HTML
 * @param {Object} data - Email data
 * @param {string} data.customerName - Customer name
 * @param {string} data.orderNumber - Order number
 * @param {string} data.orderDate - Order date formatted
 * @param {number} data.totalTickets - Total number of tickets
 * @param {string} data.ticketsList - Pre-formatted HTML list of tickets
 * @param {string} data.viewTicketsUrl - View tickets URL
 * @param {string} data.registrationDeadline - Registration deadline formatted
 * @returns {string} Complete HTML email
 */
export function generateRegistrationReminderEmail(data) {
  const {
    customerName,
    orderNumber,
    orderDate,
    totalTickets,
    ticketsList,
    viewTicketsUrl,
    registrationDeadline
  } = data;

  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">Registration Reminder!</h1>

      <p style="margin: 0 0 15px 0;">Hi ${escapeHtml(customerName)},</p>

      <p style="margin: 0 0 20px 0;">You still have <strong>${totalTickets} ticket(s)</strong> pending registration. Please view the tickets below to register them today!</p>

      <!-- Order Details Box -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h2 style="margin: 0 0 10px 0; font-size: 20px;">Order Details</h2>
        <p style="margin: 5px 0;"><strong>Order Number:</strong> ${escapeHtml(orderNumber)}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${escapeHtml(orderDate)}</p>
        <p style="margin: 5px 0;"><strong>Total Tickets:</strong> ${totalTickets}</p>
      </div>

      <h3 style="margin: 20px 0 10px 0; font-size: 18px;">Your Tickets:</h3>

      <!-- Tickets List - Pre-formatted HTML -->
      <div style="margin: 15px 0;">
        ${ticketsList}
      </div>

      <!-- Action Box -->
      <div style="background: #5b6bb5; border: 2px solid #4a5a9c; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: white; font-size: 18px;">Action Required</h3>
        <p style="margin: 0 0 20px 0; color: white;">Please register attendee information for each ticket</p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${viewTicketsUrl}"
             style="display: inline-block; background: #000000; color: white; font-weight: bold; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-size: 16px;">
            View &amp; Register Tickets
          </a>
        </div>

        <p style="margin: 10px 0 0 0; color: white; font-size: 14px;">
          <small>Registration deadline: ${registrationDeadline}</small>
        </p>
      </div>

    </div>
  `;

  return wrapInBaseLayout(content, 'Registration Reminder');
}
