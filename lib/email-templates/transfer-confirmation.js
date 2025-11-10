/**
 * Transfer Confirmation Email Template
 * Sent to the ORIGINAL owner when they transfer a ticket to someone else
 */

import { wrapInBaseLayout } from './base-layout.js';
import { generateEmailCard } from '../email-format-utils.js';

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
 * Generate transfer confirmation email for the original ticket owner
 * @param {Object} data - Email data
 * @param {string} data.originalOwnerName - Original owner's full name
 * @param {string} data.newOwnerName - New owner's full name
 * @param {string} data.newOwnerEmail - New owner's email
 * @param {string} data.ticketType - Type of ticket transferred
 * @param {string} data.ticketId - Ticket ID
 * @param {string} data.transferDate - Formatted transfer date
 * @param {string} data.transferReason - Reason for transfer (optional)
 * @param {string} data.transferredBy - Name/ID of admin who processed transfer
 * @param {string} data.eventName - Event name
 * @param {string} data.eventLocation - Event location
 * @param {string} data.eventDate - Formatted event date
 * @returns {string} Complete HTML email content
 */
export function generateTransferConfirmationEmail(data) {
  const {
    originalOwnerName,
    newOwnerName,
    newOwnerEmail,
    ticketType,
    ticketId,
    transferDate,
    transferReason = '',
    transferredBy = 'Admin',
    eventName,
    eventLocation,
    eventDate
  } = data;

  // Generate ticket card
  const ticketCard = generateEmailCard({
    index: 1,
    title: ticketType,
    price: null, // No pricing for transfers
    includePricing: false,
    borderColor: '#d32f2f', // Red for transferred ticket
    details: [
      { label: 'Ticket ID:', value: escapeHtml(ticketId) },
      { label: 'Event:', value: escapeHtml(eventName) },
      { label: 'Location:', value: escapeHtml(eventLocation) },
      { label: 'Date:', value: escapeHtml(eventDate) },
      { label: 'Transferred:', value: escapeHtml(transferDate) }
    ]
  });

  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">✅ Ticket Transfer Complete</h1>

      <p style="margin: 0 0 15px 0;">Hi ${escapeHtml(originalOwnerName)},</p>

      <p style="margin: 0 0 20px 0;">
        This confirms that your ticket for <strong>${escapeHtml(eventName)}</strong> has been successfully transferred to <strong>${escapeHtml(newOwnerName)}</strong>.
      </p>

      <!-- Transfer Complete Banner -->
      <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1565c0; font-size: 14px;">
          ℹ️ <strong>Transfer Confirmed</strong> — This ticket is no longer associated with your account.
        </p>
      </div>

      <!-- New Owner Information -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px;">Transferred To:</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Name:</strong> ${escapeHtml(newOwnerName)}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(newOwnerEmail)}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Date:</strong> ${escapeHtml(transferDate)}</p>
      </div>

      ${transferReason ? `
      <!-- Transfer Reason -->
      <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #e65100;">
          <strong>Transfer Note:</strong> ${escapeHtml(transferReason)}
        </p>
      </div>
      ` : ''}

      <h3 style="margin: 20px 0 10px 0; font-size: 18px;">Transferred Ticket:</h3>

      <!-- Ticket Card -->
      <div style="margin: 15px 0;">
        ${ticketCard}
      </div>

      <!-- Transfer Details -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px;">Transfer Record:</h3>
        <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8; font-size: 14px; color: #666;">
          <li>Original Owner: ${escapeHtml(originalOwnerName)}</li>
          <li>New Owner: ${escapeHtml(newOwnerName)} (${escapeHtml(newOwnerEmail)})</li>
          <li>Transfer Date: ${escapeHtml(transferDate)}</li>
          <li>Processed By: ${escapeHtml(transferredBy)}</li>
        </ul>
      </div>

      <!-- What This Means -->
      <div style="background: #fff9c4; border-left: 4px solid #fbc02d; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #f57f17;">What This Means:</h3>
        <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8; font-size: 14px; color: #666;">
          <li>This ticket is <strong>no longer valid</strong> under your name</li>
          <li>The new owner will receive a confirmation email with registration instructions</li>
          <li>You will not be able to access or use this ticket</li>
          <li>This transfer is <strong>permanent</strong> and cannot be reversed</li>
        </ul>
      </div>

      <!-- Support Section -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px;">Need Help?</h3>
        <p style="margin: 5px 0; font-size: 14px; color: #666;">
          If you have any questions about this transfer or need assistance, please contact us at
          <a href="mailto:alocubanoboulderfest@gmail.com" style="color: #3f4799; text-decoration: underline;">alocubanoboulderfest@gmail.com</a>
        </p>
      </div>

      <!-- Event Details Footer -->
      <div style="margin: 20px 0 2px 0; padding: 15px; background: #f9f9f9; border-radius: 4px; font-size: 12px; color: #666;">
        <p style="margin: 0 0 5px 0;">
          <strong>A Lo Cubano Boulder Fest</strong><br>
          ${escapeHtml(eventLocation)}
        </p>
        <p style="margin: 10px 0 0 0;">
          Thank you for supporting our event! 🎉
        </p>
      </div>

    </div>
  `;

  return wrapInBaseLayout(content, 'Ticket Transfer Confirmation');
}
