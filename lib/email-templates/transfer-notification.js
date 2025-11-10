/**
 * Transfer Notification Email Template
 * Sent to the NEW owner when they receive a transferred ticket
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
 * Generate transfer notification email for the new ticket owner
 * @param {Object} data - Email data
 * @param {string} data.newOwnerName - New owner's full name
 * @param {string} data.previousOwnerName - Previous owner's full name
 * @param {string} data.ticketType - Type of ticket transferred
 * @param {string} data.ticketId - Ticket ID
 * @param {string} data.transferDate - Formatted transfer date
 * @param {string} data.transferReason - Reason for transfer (optional)
 * @param {string} data.registrationUrl - URL where ticket can be registered
 * @param {string} data.registrationDeadline - Formatted registration deadline
 * @param {string} data.eventName - Event name
 * @param {string} data.eventLocation - Event location
 * @param {string} data.eventDate - Formatted event date
 * @returns {string} Complete HTML email content
 */
export function generateTransferNotificationEmail(data) {
  const {
    newOwnerName,
    previousOwnerName,
    ticketType,
    ticketId,
    transferDate,
    transferReason = '',
    registrationUrl,
    registrationDeadline,
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
    borderColor: '#5b6bb5', // Cuban blue
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
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">🎫 Ticket Transferred to You!</h1>

      <p style="margin: 0 0 15px 0;">Hi ${escapeHtml(newOwnerName)},</p>

      <p style="margin: 0 0 20px 0;">
        Great news! ${escapeHtml(previousOwnerName)} has transferred a ticket to you for <strong>${escapeHtml(eventName)}</strong>.
      </p>

      <!-- Transfer Notice Banner -->
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #2e7d32; font-size: 14px;">
          ✓ <strong>Transfer Complete</strong> — This ticket is now registered to you.
        </p>
      </div>

      ${transferReason ? `
      <!-- Transfer Reason -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #666;">
          <strong>Transfer Note:</strong> ${escapeHtml(transferReason)}
        </p>
      </div>
      ` : ''}

      <h3 style="margin: 20px 0 10px 0; font-size: 18px;">Your Transferred Ticket:</h3>

      <!-- Ticket Card -->
      <div style="margin: 15px 0;">
        ${ticketCard}
      </div>

      <!-- Action Box -->
      <div style="background: #5b6bb5; border: 2px solid #4a5a9c; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: white; font-size: 18px;">🎯 Action Required</h3>
        <p style="margin: 0 0 20px 0; color: white;">Please update your attendee information for this ticket</p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${registrationUrl}"
             style="display: inline-block; background: #000000; color: white; font-weight: bold; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-size: 16px;">
            Register Your Information
          </a>
        </div>

        <p style="margin: 10px 0 0 0; color: white; font-size: 14px;">
          <small>Registration deadline: ${registrationDeadline}</small>
        </p>
      </div>

      <!-- What's Next -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px;">What's Next?</h3>
        <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
          <li>Click the button above to register your information</li>
          <li>You'll receive a confirmation email with your QR code</li>
          <li>Add your ticket to Apple Wallet or Google Wallet</li>
          <li>Show your QR code at the entrance to receive your wristband</li>
        </ul>
      </div>

      <!-- Event Details Footer -->
      <div style="margin: 20px 0 2px 0; padding: 15px; background: #f9f9f9; border-radius: 4px; font-size: 12px; color: #666;">
        <p style="margin: 0 0 5px 0;">
          <strong>A Lo Cubano Boulder Fest</strong><br>
          ${escapeHtml(eventLocation)}
        </p>
        <p style="margin: 10px 0 0 0;">
          See you on the dance floor! 💃🕺
        </p>
      </div>

    </div>
  `;

  return wrapInBaseLayout(content, 'Ticket Transferred to You');
}
