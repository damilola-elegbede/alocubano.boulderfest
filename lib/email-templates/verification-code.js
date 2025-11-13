/**
 * Email Verification Code Template
 */

import { wrapInBaseLayout } from './base-layout.js';
import { escapeHtml } from '../volunteer-helpers.js';

/**
 * Build the HTML for a verification code email
 * @param {Object} data - Email data
 * @param {string} data.code - 6-digit verification code
 * @param {number} data.expiryMinutes - Minutes until code expires (default: 5)
 * @returns {string} Complete HTML email content wrapped in the base site layout
 */
export function generateVerificationCodeEmail(data) {
  const {
    code,
    expiryMinutes = 5
  } = data;

  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #d32f2f; font-size: 28px;">Your Verification Code</h1>

      <p style="margin: 0 0 15px 0;">You requested to view your tickets for A Lo Cubano Boulder Fest.</p>

      <p style="margin: 0 0 30px 0;">Enter this verification code to access your tickets:</p>

      <!-- Verification Code Display -->
      <div style="background: #f5f5f5; border: 2px solid #d32f2f; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 30px 0;">
        <div style="font-size: 36px; font-weight: bold; color: #d32f2f; letter-spacing: 8px; font-family: 'Courier New', monospace;">
          ${escapeHtml(code)}
        </div>
      </div>

      <!-- Expiry Notice -->
      <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 12px; margin: 0 0 30px 0; border-radius: 4px;">
        <p style="margin: 0; color: #e65100; font-size: 14px;">
          ⏱️ <strong>Expires in ${expiryMinutes} minutes</strong> — Use this code right away
        </p>
      </div>

      <!-- Security Notice -->
      <div style="background: #fce4ec; border-left: 4px solid #e91e63; padding: 12px; margin: 0 0 30px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #880e4f;">
          🔒 Security Notice
        </p>
        <p style="margin: 0; color: #880e4f; font-size: 13px;">
          We'll never ask you for this code via phone or email. Don't share this code with anyone.
        </p>
      </div>

      <!-- What's Next -->
      <h2 style="margin: 30px 0 15px 0; color: #333; font-size: 20px;">What's Next?</h2>

      <ol style="margin: 0 0 30px 0; padding-left: 20px; color: #555; line-height: 1.6;">
        <li style="margin-bottom: 10px;">Return to the My Tickets page</li>
        <li style="margin-bottom: 10px;">Enter the 6-digit code above</li>
        <li style="margin-bottom: 10px;">View, manage, and download your tickets</li>
      </ol>

      <!-- Didn't Request This? -->
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; font-size: 13px; color: #777;">
          Didn't request this code? You can safely ignore this email. The code will expire automatically.
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

  return wrapInBaseLayout(content, 'Verification Code');
}
