#!/usr/bin/env node
/**
 * Generate Email Templates Script
 *
 * Generates formatted HTML email templates for copying to Brevo.
 * Uses Brevo template variable syntax ({{ params.variableName }})
 * Output: .tmp/ directory with prettified HTML files
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import {
  generateBrevoOrderConfirmationEmail,
  generateBrevoAttendeeConfirmationEmail,
  generateBrevoRegistrationReminderEmail
} from '../lib/email-templates/brevo-templates.js';

// Ensure .tmp directory exists
mkdirSync('.tmp', { recursive: true });

console.log('🎨 Generating Email Templates with Brevo Variables...\n');

// Generate templates with Brevo variable syntax ({{ params.* }})
// No sample data needed - templates use Brevo variables directly
const templates = [
  {
    name: 'brevo-order-confirmation-email.html',
    content: generateBrevoOrderConfirmationEmail()
  },
  {
    name: 'brevo-attendee-confirmation-email.html',
    content: generateBrevoAttendeeConfirmationEmail()
  },
  {
    name: 'brevo-registration-reminder-email.html',
    content: generateBrevoRegistrationReminderEmail()
  }
];

/* REMOVED: Sample data no longer needed for Brevo templates
const orderData = {
  customerName: 'John Doe',
  orderNumber: 'ORD-2026-001',
  orderDate: 'January 15, 2026',
  totalTickets: 2,
  totalDonations: 1,
  totalItems: 3,
  ticketsList: `
<table style="width: 100%; border-collapse: collapse; background: #f5f5f5; border-left: 4px solid #d32f2f; margin-bottom: 15px;">
  <tr>
    <td style="width: 40px; padding: 15px 10px; vertical-align: top; text-align: center;">
      <span style="background: #d32f2f; color: white; border-radius: 50%; width: 28px; height: 28px; display: inline-block; text-align: center; line-height: 28px; font-weight: bold;">1</span>
    </td>
    <td style="padding: 15px 15px 15px 5px;">
      <div style="font-weight: bold; color: #1F2D3D; font-size: 16px; margin-bottom: 8px;">
        Full Festival Pass - $75.00
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #666; font-size: 14px; padding: 3px 0; width: 60px;"><strong>Event:</strong></td>
          <td style="color: #666; font-size: 14px; padding: 3px 0;">A Lo Cubano Boulder Fest 2026</td>
        </tr>
        <tr>
          <td style="color: #666; font-size: 14px; padding: 3px 0;"><strong>Dates:</strong></td>
          <td style="color: #666; font-size: 14px; padding: 3px 0;">May 15-17, 2026</td>
        </tr>
        <tr>
          <td style="color: #666; font-size: 14px; padding: 3px 0;"><strong>Venue:</strong></td>
          <td style="color: #666; font-size: 14px; padding: 3px 0;">Avalon Ballroom, Boulder, CO</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<table style="width: 100%; border-collapse: collapse; background: #f5f5f5; border-left: 4px solid #d32f2f; margin-bottom: 15px;">
  <tr>
    <td style="width: 40px; padding: 15px 10px; vertical-align: top; text-align: center;">
      <span style="background: #d32f2f; color: white; border-radius: 50%; width: 28px; height: 28px; display: inline-block; text-align: center; line-height: 28px; font-weight: bold;">2</span>
    </td>
    <td style="padding: 15px 15px 15px 5px;">
      <div style="font-weight: bold; color: #1F2D3D; font-size: 16px; margin-bottom: 8px;">
        Single Day Pass - $50.00
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #666; font-size: 14px; padding: 3px 0; width: 60px;"><strong>Event:</strong></td>
          <td style="color: #666; font-size: 14px; padding: 3px 0;">A Lo Cubano Boulder Fest 2026</td>
        </tr>
        <tr>
          <td style="color: #666; font-size: 14px; padding: 3px 0;"><strong>Date:</strong></td>
          <td style="color: #666; font-size: 14px; padding: 3px 0;">May 16, 2026</td>
        </tr>
        <tr>
          <td style="color: #666; font-size: 14px; padding: 3px 0;"><strong>Venue:</strong></td>
          <td style="color: #666; font-size: 14px; padding: 3px 0;">Avalon Ballroom, Boulder, CO</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<table style="width: 100%; border-collapse: collapse; background: #f5f5f5; border-left: 4px solid #10b981; margin-bottom: 15px;">
  <tr>
    <td style="width: 40px; padding: 15px 10px; vertical-align: top; text-align: center;">
      <span style="background: #10b981; color: white; border-radius: 50%; width: 28px; height: 28px; display: inline-block; text-align: center; line-height: 28px; font-weight: bold;">3</span>
    </td>
    <td style="padding: 15px 15px 15px 5px;">
      <div style="font-weight: bold; color: #1F2D3D; font-size: 16px; margin-bottom: 8px;">
        Festival Support - $25.00
      </div>
      <div style="color: #666; font-size: 14px; padding: 3px 0;">
        Your generous donation brings more amazing instructors and events to our Boulder community. Thank you!
      </div>
    </td>
  </tr>
</table>
`,
  registrationUrl: 'https://www.alocubanoboulderfest.org/register-tickets?token=abc123def456',
  registrationDeadline: 'May 1, 2026',
  totalAmount: '150.00',
  paymentMethod: 'Visa ••4242',
  transactionId: 'ch_3AbCdEfGhIjKlMnO',
  paymentDate: 'January 15, 2026, 10:30 AM MST',
  billingEmail: 'john.doe@example.com'
};

// Sample data for attendee confirmation
const attendeeData = {
  firstName: 'John',
  lastName: 'Doe',
  ticketId: 'TKT-2026-001',
  ticketType: 'Full Festival Pass',
  orderNumber: 'ORD-2026-001',
  eventName: 'A Lo Cubano Boulder Fest 2026',
  eventLocation: 'Avalon Ballroom, Boulder, CO',
  eventDate: 'May 15-17, 2026',
  qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TKT-2026-001',
  walletPassUrl: 'https://www.alocubanoboulderfest.org/api/tickets/apple-wallet/TKT-2026-001',
  googleWalletUrl: 'https://www.alocubanoboulderfest.org/api/tickets/google-wallet/TKT-2026-001',
  appleWalletButtonUrl: 'https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/images/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg',
  googleWalletButtonUrl: 'https://developers.google.com/pay/passes/guides/get-started/implementing-the-api/save-to-google-pay-button'
};

// Sample data for registration reminder
const reminderData = {
  customerName: 'John Doe',
  orderNumber: 'ORD-2026-001',
  orderDate: 'January 15, 2026',
  totalTickets: 2,
  ticketsList: `
<table style="width: 100%; border-collapse: collapse; background: #f5f5f5; border-left: 4px solid #d32f2f; margin-bottom: 15px;">
  <tr>
    <td style="padding: 15px;">
      <div style="font-weight: bold; color: #1F2D3D; font-size: 16px; margin-bottom: 5px;">Full Festival Pass</div>
      <div style="color: #666; font-size: 14px;">Status: Pending Registration</div>
    </td>
  </tr>
</table>
<table style="width: 100%; border-collapse: collapse; background: #f5f5f5; border-left: 4px solid #d32f2f; margin-bottom: 15px;">
  <tr>
    <td style="padding: 15px;">
      <div style="font-weight: bold; color: #1F2D3D; font-size: 16px; margin-bottom: 5px;">Single Day Pass</div>
      <div style="color: #666; font-size: 14px;">Status: Pending Registration</div>
    </td>
  </tr>
</table>
`,
  viewTicketsUrl: 'https://www.alocubanoboulderfest.org/register-tickets?token=abc123def456',
  registrationDeadline: 'May 1, 2026'
};
*/

// Write unformatted files first
templates.forEach(({ name, content }) => {
  const filePath = `.tmp/${name}`;
  writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Generated: ${name}`);
});

console.log('\n🎨 Formatting with Prettier...\n');

// Format all HTML files with prettier
try {
  execSync('npx prettier --write .tmp/*.html --parser html', {
    stdio: 'inherit',
    encoding: 'utf8'
  });
  console.log('\n✨ All templates formatted successfully!');
  console.log('\n📂 Templates available in .tmp/ directory:');
  console.log('   - brevo-order-confirmation-email.html');
  console.log('   - brevo-attendee-confirmation-email.html');
  console.log('   - brevo-registration-reminder-email.html');
  console.log('\n📋 Ready to copy-paste into Brevo!\n');
} catch (error) {
  console.error('Error formatting templates:', error.message);
  process.exit(1);
}
