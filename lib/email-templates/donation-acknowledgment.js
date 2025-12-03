/**
 * Donation acknowledgment email template
 * Sent to donors with tax receipt information
 */

import { wrapInBaseLayout } from './base-layout.js';
import { generateEmailCard, formatPrice } from '../email-format-utils.js';

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
 * Format date for display (Mountain Time)
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Denver',
    timeZoneName: 'short'
  });
}

/**
 * Generate donation acknowledgment email
 * @param {object} data - Donation data
 * @param {string} data.donorName - Donor's name
 * @param {string} data.donorEmail - Donor's email
 * @param {number} data.donationAmount - Total donation amount in cents
 * @param {string} data.paymentMethod - Payment method description
 * @param {string} data.transactionId - Transaction ID
 * @param {string} data.transactionDate - Transaction date/time
 * @param {Array<object>} data.donations - Array of donation items
 * @param {boolean} data.hasTickets - Whether this transaction includes tickets
 * @returns {string} Complete HTML email
 */
export function generateDonationAcknowledgmentEmail(data) {
  const {
    donorName = 'Valued Supporter',
    donorEmail,
    donationAmount,
    paymentMethod = 'Credit Card',
    transactionId,
    transactionDate,
    donations = [],
    hasTickets = false
  } = data;

  // Get EIN from environment or use placeholder
  const ein = process.env.ORGANIZATION_EIN || 'XX-XXXXXXX';

  const content = `
    <!-- Cuban Flag Gradient Header -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation">
      <tr>
        <td style="background: linear-gradient(135deg, #5b6bb5 0%, #cc2936 100%); border-radius: 8px; padding: 25px; text-align: center;">
          <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold; line-height: 1.3;">
            💙 Thank You for Your Donation! ❤️
          </h1>
        </td>
      </tr>
    </table>

    <!-- Success Banner -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
      <tr>
        <td style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; border-radius: 4px;">
          <p style="margin: 0; color: #2e7d32; font-size: 16px; line-height: 1.5;">
            ✓ <strong>Donation Received</strong> — Your generous contribution has been successfully processed.
          </p>
        </td>
      </tr>
    </table>

    <!-- Personal Message -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 25px;">
      <tr>
        <td>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Dear <strong>${escapeHtml(donorName)}</strong>,
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            On behalf of everyone at <strong>A Lo Cubano Boulder Fest</strong>, thank you for your incredible generosity! Your donation directly supports our mission to bring world-class salsa instructors, live music, and authentic cultural experiences to the Boulder dance community.
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 10px 0;">
            Your support makes it possible for us to:
          </p>
          <ul style="font-size: 16px; line-height: 1.8; margin: 10px 0; padding-left: 25px;">
            <li>Bring internationally renowned instructors to Boulder</li>
            <li>Keep ticket prices accessible to our community</li>
            <li>Provide support for dancers in need</li>
            <li>Support DJs, artists, and venues</li>
          </ul>
        </td>
      </tr>
    </table>

    <!-- Donation Receipt -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 25px;">
      <tr>
        <td style="background: #f9f9f9; border: 2px solid #10b981; padding: 20px; border-radius: 4px;">
          <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2D3D;">Donation Receipt</h2>
          <table width="100%" cellspacing="0" cellpadding="5" border="0" role="presentation">
            <tr>
              <td style="font-size: 14px; color: #666; padding: 8px 0;"><strong>Donation Amount:</strong></td>
              <td style="font-size: 16px; color: #10b981; font-weight: bold; text-align: right; padding: 8px 0;">$${formatPrice(donationAmount)}</td>
            </tr>
            <tr>
              <td style="font-size: 14px; color: #666; padding: 8px 0; border-top: 1px solid #e0e0e0;"><strong>Transaction Date:</strong></td>
              <td style="font-size: 14px; color: #3b3f44; text-align: right; padding: 8px 0; border-top: 1px solid #e0e0e0;">${formatDate(transactionDate)}</td>
            </tr>
            <tr>
              <td style="font-size: 14px; color: #666; padding: 8px 0;"><strong>Payment Method:</strong></td>
              <td style="font-size: 14px; color: #3b3f44; text-align: right; padding: 8px 0;">${escapeHtml(paymentMethod)}</td>
            </tr>
            <tr>
              <td style="font-size: 14px; color: #666; padding: 8px 0;"><strong>Transaction ID:</strong></td>
              <td style="font-size: 12px; color: #999; text-align: right; padding: 8px 0; font-family: 'Courier New', monospace;">${escapeHtml(transactionId)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Tax Information -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
      <tr>
        <td style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; border-radius: 4px;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #e65100;">Tax Deductible Information:</h3>
          <p style="margin: 0; font-size: 14px; color: #3b3f44; line-height: 1.6;">
            <strong>A Lo Cubano Boulder Fest</strong> is a registered 501(c)(3) nonprofit organization.<br>
            <strong>EIN:</strong> ${escapeHtml(ein)}<br><br>
            Your donation is tax-deductible to the extent allowed by law. No goods or services were provided in exchange for this contribution. Please retain this receipt for your tax records.
          </p>
        </td>
      </tr>
    </table>

    <!-- Impact Message -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
      <tr>
        <td style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; border-radius: 4px;">
          <p style="margin: 0; color: #1565c0; font-size: 14px; line-height: 1.6;">
            💃 <strong>Your Impact:</strong> Donations like yours have helped us grow year over year, attracting over 300 dancers annually and supporting 15+ artists each year. Together, we're building a vibrant, inclusive dance community in Boulder!
          </p>
        </td>
      </tr>
    </table>

    ${!hasTickets ? `
    <!-- Call to Action (only for standalone donations) -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 30px;">
      <tr>
        <td align="center">
          <p style="font-size: 16px; margin: 0 0 20px 0;">
            Haven't registered for the festival yet?
          </p>
          <table cellspacing="0" cellpadding="0" border="0" role="presentation" align="center">
            <tr>
              <td align="center" style="border-radius: 4px;" bgcolor="#000000">
                <a href="https://alocubanoboulderfest.org/tickets.html"
                   style="background: #000000; border: 15px solid #000000; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 4px; font-weight: bold;"
                   target="_blank">
                  <span style="color: #ffffff;">Get Your Tickets</span>
                </a>
              </td>
            </tr>
          </table>
          <p style="font-size: 14px; color: #666; margin: 15px 0 0 0;">
            May 15-17, 2026 • Avalon Ballroom, Boulder, CO
          </p>
        </td>
      </tr>
    </table>
    ` : ''}

    <!-- Closing Message -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 30px;">
      <tr>
        <td>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            With deep gratitude,
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin: 0; font-weight: bold;">
            The A Lo Cubano Boulder Fest Team
          </p>
        </td>
      </tr>
    </table>

    <!-- Tax Receipt Footer -->
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 30px;">
      <tr>
        <td style="padding: 15px; background: #f9f9f9; border-radius: 4px;">
          <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">
            <strong>A Lo Cubano Boulder Fest</strong><br>
            Boulder, Colorado
          </p>
          <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
            This is your official receipt for tax purposes. Please retain this email for your records.
          </p>
        </td>
      </tr>
    </table>
  `;

  return wrapInBaseLayout(content, 'Thank You for Your Donation - A Lo Cubano Boulder Fest');
}
