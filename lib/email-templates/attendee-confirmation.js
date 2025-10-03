/**
 * Attendee Confirmation Email Template
 */

import { wrapInBaseLayout } from './base-layout.js';

/**
 * Generate attendee confirmation email HTML
 * @param {Object} data - Email data
 * @param {string} data.firstName - Attendee first name
 * @param {string} data.lastName - Attendee last name
 * @param {string} data.ticketId - Ticket ID
 * @param {string} data.ticketType - Ticket type
 * @param {string} data.orderNumber - Order number
 * @param {string} data.eventName - Event name
 * @param {string} data.eventLocation - Event location
 * @param {string} data.eventDate - Event date formatted
 * @param {string} data.qrCodeUrl - QR code image URL
 * @param {string} data.walletPassUrl - Apple Wallet pass URL
 * @param {string} data.googleWalletUrl - Google Wallet pass URL
 * @param {string} data.appleWalletButtonUrl - Apple Wallet button image URL
 * @param {string} data.googleWalletButtonUrl - Google Wallet button image URL
 * @returns {string} Complete HTML email
 */
export function generateAttendeeConfirmationEmail(data) {
  const {
    firstName,
    lastName,
    ticketId,
    ticketType,
    orderNumber,
    eventName,
    eventLocation,
    eventDate,
    qrCodeUrl,
    walletPassUrl,
    googleWalletUrl,
    appleWalletButtonUrl,
    googleWalletButtonUrl
  } = data;

  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="color: #d32f2f; text-align: center;">Your Ticket is Ready!</h1>

      <p style="margin: 15px 0;">Hi ${firstName},</p>

      <p style="margin: 15px 0;">Your registration is complete for ${eventName}!</p>

      <!-- Ticket Details Box -->
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
        <h2 style="margin-top: 0;">Ticket Details</h2>
        <p style="margin: 5px 0;"><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p style="margin: 5px 0;"><strong>Ticket ID:</strong> ${ticketId}</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${ticketType}</p>
        <p style="margin: 5px 0;"><strong>Order:</strong> ${orderNumber}</p>
        <p style="margin: 5px 0;"><strong>Location:</strong> ${eventLocation}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
      </div>

      <!-- QR Code Section -->
      <div style="background: #fff; border: 2px solid #e0e0e0; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px;">
        <h3 style="margin-top: 0; color: #333;">Your QR Code</h3>
        <p style="font-size: 14px; color: #666; margin-bottom: 15px;">Show this at the entrance</p>
        <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px; border: 1px solid #ddd; padding: 10px; background: white;">
      </div>

      <!-- Wallet Buttons Section -->
      <div style="background: #e8f5e9; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px;">
        <a href="${walletPassUrl}" style="display: inline-block; text-decoration: none; margin: 10px;">
          <img src="${appleWalletButtonUrl}" alt="Add to Apple Wallet" style="height: 48px;">
        </a>
        <a href="${googleWalletUrl}" style="display: inline-block; text-decoration: none; margin: 10px;">
          <img src="${googleWalletButtonUrl}" alt="Add to Google Wallet" style="height: 48px;">
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
