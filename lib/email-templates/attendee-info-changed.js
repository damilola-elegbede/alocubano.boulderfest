/**
 * Attendee Information Changed Notification Template
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
 * Format a field name for display
 * @param {string} fieldName - Field name (e.g., 'attendee_first_name')
 * @returns {string} Formatted field name (e.g., 'First Name')
 */
function formatFieldName(fieldName) {
  const fieldMap = {
    'attendee_first_name': 'First Name',
    'attendee_last_name': 'Last Name',
    'attendee_email': 'Email Address'
  };
  return fieldMap[fieldName] || fieldName;
}

/**
 * Build the HTML for an attendee information changed notification email
 * @param {Object} data - Email data
 * @param {string} data.ticketId - Ticket identifier
 * @param {string} data.ticketType - Type of ticket
 * @param {string} data.eventDate - Formatted event date
 * @param {Array<Object>} data.changes - Array of changes made
 * @param {string} data.changes[].field - Field that was changed
 * @param {string} data.changes[].oldValue - Previous value
 * @param {string} data.changes[].newValue - New value
 * @param {string} data.changedAt - Formatted timestamp of change
 * @param {string} data.changedByEmail - Email of user who made the change
 * @param {boolean} data.isRecipient - True if this email is going to the new email address
 * @returns {string} Complete HTML email content wrapped in the base site layout
 */
export function generateAttendeeInfoChangedEmail(data) {
  const {
    ticketId,
    ticketType,
    eventDate,
    changes = [],
    changedAt,
    changedByEmail,
    isRecipient = false
  } = data;

  // Build changes table
  const changesRows = changes.map(change => `
    <tr>
      <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; background: #f9f9f9;">
        ${escapeHtml(formatFieldName(change.field))}
      </td>
      <td style="padding: 10px; border: 1px solid #e0e0e0; color: #777; text-decoration: line-through;">
        ${escapeHtml(change.oldValue || '(empty)')}
      </td>
      <td style="padding: 10px; border: 1px solid #e0e0e0; color: #4caf50; font-weight: bold;">
        ${escapeHtml(change.newValue || '(empty)')}
      </td>
    </tr>
  `).join('');

  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">
        ${isRecipient ? 'Ticket Information Updated' : 'Ticket Transferred to New Email'}
      </h1>

      <p style="margin: 0 0 15px 0;">
        ${isRecipient
          ? 'Your ticket information has been updated.'
          : 'A ticket previously registered to your email has been transferred to a new email address.'}
      </p>

      <!-- Security Notice Banner -->
      <div style="background: ${isRecipient ? '#e3f2fd' : '#fff3e0'}; border-left: 4px solid ${isRecipient ? '#2196f3' : '#ff9800'}; padding: 12px; margin: 0 0 30px 0; border-radius: 4px;">
        <p style="margin: 0; color: ${isRecipient ? '#0d47a1' : '#e65100'}; font-size: 14px;">
          ${isRecipient
            ? '✅ <strong>Confirmation</strong> — Changes made successfully'
            : '⚠️ <strong>Security Alert</strong> — Ticket no longer accessible from this email'}
        </p>
      </div>

      <!-- Ticket Details -->
      <h2 style="margin: 30px 0 15px 0; color: #333; font-size: 20px;">Ticket Details</h2>

      <div style="background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 15px; margin: 0 0 30px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #555;">Ticket ID:</td>
            <td style="padding: 8px 0; color: #333;">${escapeHtml(ticketId)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #555;">Ticket Type:</td>
            <td style="padding: 8px 0; color: #333;">${escapeHtml(ticketType)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #555;">Event Date:</td>
            <td style="padding: 8px 0; color: #333;">${escapeHtml(eventDate)}</td>
          </tr>
        </table>
      </div>

      <!-- Changes Made -->
      <h2 style="margin: 30px 0 15px 0; color: #333; font-size: 20px;">Changes Made</h2>

      <table style="width: 100%; border-collapse: collapse; margin: 0 0 30px 0;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px; border: 1px solid #e0e0e0; text-align: left; font-weight: bold; color: #555;">Field</th>
            <th style="padding: 10px; border: 1px solid #e0e0e0; text-align: left; font-weight: bold; color: #555;">Previous Value</th>
            <th style="padding: 10px; border: 1px solid #e0e0e0; text-align: left; font-weight: bold; color: #555;">New Value</th>
          </tr>
        </thead>
        <tbody>
          ${changesRows}
        </tbody>
      </table>

      <!-- Change Metadata -->
      <div style="background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 15px; margin: 0 0 30px 0;">
        <p style="margin: 0 0 8px 0; color: #555; font-size: 13px;">
          <strong>Changed At:</strong> ${escapeHtml(changedAt)}
        </p>
        <p style="margin: 0; color: #555; font-size: 13px;">
          <strong>Changed By:</strong> ${escapeHtml(changedByEmail)}
        </p>
      </div>

      ${isRecipient ? `
        <!-- Next Steps for Recipient -->
        <h2 style="margin: 30px 0 15px 0; color: #333; font-size: 20px;">What's Next?</h2>

        <p style="margin: 0 0 15px 0; color: #555;">
          Your ticket is ready! You can view, download, or add it to your mobile wallet.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.BASE_URL || 'https://alocubanoboulderfest.com'}/my-tickets"
             style="display: inline-block; padding: 12px 30px; background-color: #d32f2f; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
            View My Tickets
          </a>
        </div>
      ` : `
        <!-- Security Notice for Previous Owner -->
        <div style="background: #fce4ec; border-left: 4px solid #e91e63; padding: 12px; margin: 0 0 30px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #880e4f;">
            🔒 Security Notice
          </p>
          <p style="margin: 0; color: #880e4f; font-size: 13px;">
            This ticket has been transferred to a new email address. You will no longer be able to access this ticket from your account.
          </p>
        </div>
      `}

      <!-- Didn't Make This Change? -->
      <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 12px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #e65100;">
          Didn't make this change?
        </p>
        <p style="margin: 0; color: #e65100; font-size: 13px;">
          If you didn't authorize this change, please contact us immediately at
          <a href="mailto:alocubanoboulderfest@gmail.com" style="color: #d32f2f; text-decoration: none;">alocubanoboulderfest@gmail.com</a>
        </p>
      </div>

      <!-- Footer Info -->
      <div style="margin-top: 40px; padding: 20px; background: #f9f9f9; border-radius: 4px; text-align: center;">
        <p style="margin: 0 0 10px 0; color: #555; font-size: 13px;">
          Need help? Contact us at <a href="mailto:alocubanoboulderfest@gmail.com" style="color: #d32f2f; text-decoration: none;">alocubanoboulderfest@gmail.com</a>
        </p>
        <p style="margin: 0; color: #999; font-size: 12px;">
          A Lo Cubano Boulder Fest — May 15-17, 2026 — Avalon Ballroom, Boulder, CO
        </p>
      </div>
    </div>
  `;

  return wrapInBaseLayout(content, 'Ticket Information Changed');
}
