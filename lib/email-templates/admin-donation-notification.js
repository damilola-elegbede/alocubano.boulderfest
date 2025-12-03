/**
 * Admin donation notification email template
 * PII-FREE: Contains NO donor email, name, or personal information
 * Follows security alert service pattern
 */

import { formatPrice } from '../email-format-utils.js';

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
 * Generate minimal admin footer (no social icons)
 * @returns {string} HTML footer
 */
function generateAdminFooter() {
  return `
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px; border-top: 2px solid #e0e0e0; padding-top: 20px;">
      <tr>
        <td align="center">
          <p style="font-size: 12px; color: #999; margin: 0;">
            <strong>A Lo Cubano Boulder Fest</strong> Admin Notifications<br>
            <a href="mailto:alocubanoboulderfest@gmail.com" style="color: #3f4799; text-decoration: underline;">alocubanoboulderfest@gmail.com</a>
          </p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Generate admin donation notification email (PII-FREE)
 * @param {object} data - Donation data (NO DONOR PII)
 * @param {number} data.donationAmount - Total donation amount in cents
 * @param {string} data.paymentProcessor - Payment processor (e.g., 'stripe', 'paypal', 'venmo')
 * @param {string} data.transactionType - Type (e.g., 'Standalone Donation', 'Bundled with Tickets')
 * @param {string} data.transactionDate - Transaction date/time
 * @param {string} data.transactionId - Transaction ID
 * @param {object} [data.todayStats] - Optional aggregated stats
 * @param {number} [data.todayStats.count] - Total donations today
 * @param {number} [data.todayStats.amount] - Total amount today in cents
 * @returns {string} Complete HTML email (NO DONOR PII)
 */
export function generateAdminDonationNotificationEmail(data) {
  const {
    donationAmount,
    paymentProcessor = 'Unknown',
    transactionType = 'Standalone Donation',
    transactionDate,
    transactionId,
    todayStats = null
  } = data;

  // Format payment processor for display
  const processorDisplay = {
    'stripe': 'Stripe',
    'paypal': 'PayPal',
    'venmo': 'Venmo',
    'cash': 'Cash',
    'card_terminal': 'Card Terminal',
    'comp': 'Comp'
  }[paymentProcessor] || escapeHtml(paymentProcessor);

  const content = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>New Donation Received - Admin Notification</title>
    <style type="text/css">
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f0f0f0; }
        table { border-collapse: collapse; }
        .email-container { max-width: 600px; margin: 0 auto; background: white; }
    </style>
</head>
<body>
    <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="background-color: #f0f0f0; padding: 20px;">
      <tr>
        <td>
          <table width="600" cellspacing="0" cellpadding="0" border="0" role="presentation" align="center" class="email-container" style="background: white; max-width: 600px; margin: 0 auto;">
            <tr>
              <td style="padding: 20px;">

                <!-- Logo -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation">
                  <tr>
                    <td align="center" style="padding-bottom: 20px;">
                      <img src="https://img.mailinblue.com/9670291/images/content_library/original/68a6c02f3da913a8d57a0190.png"
                           alt="A Lo Cubano Boulder Fest"
                           width="106"
                           style="display: block; margin: 0 auto;">
                    </td>
                  </tr>
                </table>

                <!-- Header -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation">
                  <tr>
                    <td style="background: #5b6bb5; border: 2px solid #4a5a9c; border-radius: 8px; padding: 20px; text-align: center;">
                      <h1 style="margin: 0; color: white; font-size: 24px; font-weight: bold; line-height: 1.3;">
                        💰 New Donation Received
                      </h1>
                    </td>
                  </tr>
                </table>

                <!-- Success Banner -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
                  <tr>
                    <td style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; border-radius: 4px;">
                      <p style="margin: 0; color: #2e7d32; font-size: 16px; line-height: 1.5;">
                        ✓ <strong>Payment Processed Successfully</strong> — A new donation has been received and processed.
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- PII Compliance Notice -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
                  <tr>
                    <td style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; border-radius: 4px;">
                      <p style="margin: 0; color: #1565c0; font-size: 13px; line-height: 1.5;">
                        🔒 <strong>Privacy Notice:</strong> This notification contains no personally identifiable information (PII). View full donor details securely in the admin dashboard.
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- Donation Metrics (PII-FREE) -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 25px;">
                  <tr>
                    <td style="background: #f9f9f9; border: 2px solid #10b981; padding: 20px; border-radius: 4px;">
                      <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2D3D;">Donation Summary</h2>
                      <table width="100%" cellspacing="0" cellpadding="5" border="0" role="presentation">
                        <tr>
                          <td style="font-size: 14px; color: #666; padding: 8px 0;"><strong>Donation Amount:</strong></td>
                          <td style="font-size: 18px; color: #10b981; font-weight: bold; text-align: right; padding: 8px 0;">$${formatPrice(donationAmount)}</td>
                        </tr>
                        <tr>
                          <td style="font-size: 14px; color: #666; padding: 8px 0; border-top: 1px solid #e0e0e0;"><strong>Payment Processor:</strong></td>
                          <td style="font-size: 14px; color: #3b3f44; text-align: right; padding: 8px 0; border-top: 1px solid #e0e0e0;">${processorDisplay}</td>
                        </tr>
                        <tr>
                          <td style="font-size: 14px; color: #666; padding: 8px 0;"><strong>Transaction Type:</strong></td>
                          <td style="font-size: 14px; color: #3b3f44; text-align: right; padding: 8px 0;">${escapeHtml(transactionType)}</td>
                        </tr>
                        <tr>
                          <td style="font-size: 14px; color: #666; padding: 8px 0;"><strong>Transaction Date:</strong></td>
                          <td style="font-size: 14px; color: #3b3f44; text-align: right; padding: 8px 0;">${formatDate(transactionDate)}</td>
                        </tr>
                        <tr>
                          <td style="font-size: 14px; color: #666; padding: 8px 0;"><strong>Transaction ID:</strong></td>
                          <td style="font-size: 12px; color: #999; text-align: right; padding: 8px 0; font-family: 'Courier New', monospace;">${escapeHtml(transactionId)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                ${todayStats ? `
                <!-- Today's Stats -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
                  <tr>
                    <td style="background: #f5f5f5; padding: 15px; border-radius: 4px;">
                      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #1F2D3D;">Today's Donation Stats</h3>
                      <table width="100%" cellspacing="0" cellpadding="3" border="0" role="presentation">
                        <tr>
                          <td style="font-size: 14px; color: #666; padding: 5px 0;">Total Donations Today:</td>
                          <td style="font-size: 14px; color: #3b3f44; text-align: right; padding: 5px 0; font-weight: bold;">${todayStats.count} donation${todayStats.count !== 1 ? 's' : ''}</td>
                        </tr>
                        <tr>
                          <td style="font-size: 14px; color: #666; padding: 5px 0;">Total Amount Today:</td>
                          <td style="font-size: 14px; color: #10b981; text-align: right; padding: 5px 0; font-weight: bold;">$${formatPrice(todayStats.amount)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                ` : ''}

                <!-- Action Required -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 25px;">
                  <tr>
                    <td style="background: #5b6bb5; border: 2px solid #4a5a9c; padding: 20px; border-radius: 4px; text-align: center;">
                      <h3 style="margin: 0 0 10px 0; color: white; font-size: 18px;">View Full Details</h3>
                      <p style="margin: 0 0 20px 0; color: white; font-size: 14px;">
                        Access the admin dashboard to view complete donor information, transaction details, and send personalized thank you messages.
                      </p>

                      <table cellspacing="0" cellpadding="0" border="0" role="presentation" align="center">
                        <tr>
                          <td align="center" style="border-radius: 4px;" bgcolor="#000000">
                            <a href="https://alocubanoboulderfest.org/admin/donations.html"
                               style="background: #000000; border: 15px solid #000000; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 4px; font-weight: bold;"
                               target="_blank">
                              <span style="color: #ffffff;">Open Admin Dashboard</span>
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 15px 0 0 0; color: white; font-size: 12px;">
                        <small>Secure access with your admin credentials</small>
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- Recommended Actions -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
                  <tr>
                    <td style="background: #fff9c4; border-left: 4px solid #fbc02d; padding: 15px; border-radius: 4px;">
                      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #f57f17;">Recommended Actions:</h3>
                      <ul style="margin: 5px 0; padding-left: 20px; font-size: 14px; color: #3b3f44; line-height: 1.8;">
                        <li>Review donation details in admin dashboard</li>
                        <li>Verify tax receipt was sent to donor</li>
                        <li>Update donation tracking spreadsheet (if applicable)</li>
                        <li>Send personalized thank you note (optional)</li>
                      </ul>
                    </td>
                  </tr>
                </table>

                <!-- System Info -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 30px;">
                  <tr>
                    <td style="padding: 15px; background: #f9f9f9; border-radius: 4px;">
                      <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">
                        <strong>A Lo Cubano Boulder Fest Admin System</strong>
                      </p>
                      <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">
                        This is an automated notification. Donor received a separate tax-deductible receipt via email.
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- PII Compliance Footer -->
                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin-top: 20px;">
                  <tr>
                    <td style="padding: 15px; background: #e3f2fd; border-radius: 4px;">
                      <p style="margin: 0; font-size: 13px; color: #1565c0; line-height: 1.6;">
                        <strong>🔒 PII Compliance:</strong> This notification contains no donor names, email addresses, or personally identifiable information. All donor details are securely accessible only through the authenticated admin dashboard, ensuring compliance with GDPR and privacy best practices.
                      </p>
                    </td>
                  </tr>
                </table>

                ${generateAdminFooter()}

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
</body>
</html>
  `;

  return content;
}
