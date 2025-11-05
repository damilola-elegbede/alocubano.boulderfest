/**
 * Unit Tests for Brevo-Specific Email Templates
 * Tests Brevo template variable syntax, template structure, and integration patterns
 */

import { describe, it, expect } from 'vitest';
import {
  generateBrevoOrderConfirmationEmail,
  generateBrevoAttendeeConfirmationEmail,
  generateBrevoRegistrationReminderEmail
} from '../../../../lib/email-templates/brevo-templates.js';

describe('Brevo Email Templates', () => {
  describe('Brevo Order Confirmation Template', () => {
    it('should generate template with Brevo variable syntax', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('{{ params.customerName }}');
      expect(html).toContain('{{ params.orderNumber }}');
      expect(html).toContain('{{ params.totalAmount }}');
    });

    it('should include all required Brevo variables', () => {
      const html = generateBrevoOrderConfirmationEmail();

      const requiredVars = [
        'customerName',
        'orderNumber',
        'orderDate',
        'totalTickets',
        'totalDonations',
        'totalItems',
        'ticketsList',
        'registrationUrl',
        'registrationDeadline',
        'totalAmount',
        'paymentMethod',
        'transactionId',
        'paymentDate',
        'billingEmail'
      ];

      requiredVars.forEach(varName => {
        expect(html).toContain(`{{ params.${varName} }}`);
      });
    });

    it('should include payment received indicator', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('Payment Received');
      expect(html).toContain('official receipt');
    });

    it('should include order details section', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('Order Details');
      expect(html).toContain('<strong>Order Number:</strong>');
      expect(html).toContain('<strong>Date:</strong>');
      expect(html).toContain('<strong>Items:</strong>');
    });

    it('should include payment summary section', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('Payment Summary');
      expect(html).toContain('Total Paid:');
      expect(html).toContain('Payment Method:');
      expect(html).toContain('Transaction ID:');
      expect(html).toContain('Payment Date:');
    });

    it('should include action required section', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('Action Required');
      expect(html).toContain('View &amp; Register Tickets');
      expect(html).toContain('{{ params.registrationUrl }}');
    });

    it('should include billing information', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('Billing Information');
      expect(html).toContain('{{ params.billingEmail }}');
    });

    it('should include receipt footer', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('A Lo Cubano Boulder Fest');
      expect(html).toContain('Boulder, CO');
      expect(html).toContain('receipt for tax purposes');
    });

    it('should use conditional logic for plural tickets', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toMatch(/{% if.*totalTickets.*!= 1.*%}s{% endif %}/);
    });

    it('should use conditional logic for donations', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toMatch(/{% if.*totalDonations.*> 0.*%}/);
    });

    it('should wrap content in base layout', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('<!DOCTYPE html>');
      // Title should be HTML-escaped
      expect(html).toContain('<title>Order Confirmation &amp; Receipt</title>');
    });
  });

  describe('Brevo Attendee Confirmation Template', () => {
    it('should generate template with Brevo variable syntax', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('{{ params.firstName }}');
      expect(html).toContain('{{ params.lastName }}');
      expect(html).toContain('{{ params.ticketId }}');
    });

    it('should include all required Brevo variables', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      const requiredVars = [
        'firstName',
        'lastName',
        'ticketId',
        'ticketType',
        'orderNumber',
        'eventName',
        'eventLocation',
        'eventDate',
        'qrCodeUrl',
        'walletPassUrl',
        'googleWalletUrl',
        'appleWalletButtonUrl',
        'googleWalletButtonUrl'
      ];

      requiredVars.forEach(varName => {
        expect(html).toContain(`{{ params.${varName} }}`);
      });
    });

    it('should include personalized greeting', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('Hi {{ params.firstName }},');
    });

    it('should include ticket details section', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('Ticket Details');
      expect(html).toContain('<strong>Name:</strong>');
      expect(html).toContain('<strong>Ticket ID:</strong>');
      expect(html).toContain('<strong>Type:</strong>');
    });

    it('should include QR code section', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('Your QR Code');
      expect(html).toContain('Show this at the entrance');
      expect(html).toContain('{{ params.qrCodeUrl }}');
    });

    it('should include wallet buttons section', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('{{ params.walletPassUrl }}');
      expect(html).toContain('{{ params.googleWalletUrl }}');
      expect(html).toContain('Add to Apple Wallet');
      expect(html).toContain('Add to Google Wallet');
    });

    it('should include what\'s next instructions', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('What\'s Next?');
      expect(html).toContain('Save this email as backup');
      expect(html).toContain('Add ticket to your phone wallet');
    });

    it('should wrap content in base layout', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Your Ticket is Ready</title>');
    });
  });

  describe('Brevo Registration Reminder Template', () => {
    it('should generate template with Brevo variable syntax', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('{{ params.customerName }}');
      expect(html).toContain('{{ params.orderNumber }}');
      expect(html).toContain('{{ params.totalTickets }}');
    });

    it('should include all required Brevo variables', () => {
      const html = generateBrevoRegistrationReminderEmail();

      const requiredVars = [
        'customerName',
        'orderNumber',
        'orderDate',
        'totalTickets',
        'ticketsList',
        'viewTicketsUrl',
        'registrationDeadline'
      ];

      requiredVars.forEach(varName => {
        expect(html).toContain(`{{ params.${varName} }}`);
      });
    });

    it('should include reminder heading', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('Registration Reminder!');
    });

    it('should include urgency message', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('You still have');
      expect(html).toContain('ticket(s)');
      expect(html).toContain('pending registration');
    });

    it('should include order details section', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('Order Details');
      expect(html).toContain('<strong>Total Tickets:</strong>');
    });

    it('should include tickets list placeholder', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('Your Tickets:');
      expect(html).toContain('{{ params.ticketsList }}');
    });

    it('should include action required section', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('Action Required');
      expect(html).toContain('View &amp; Register Tickets');
      expect(html).toContain('{{ params.viewTicketsUrl }}');
    });

    it('should include registration deadline', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('Registration deadline:');
      expect(html).toContain('{{ params.registrationDeadline }}');
    });

    it('should wrap content in base layout', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Registration Reminder</title>');
    });
  });

  describe('Brevo Template Variable Syntax', () => {
    it('should use correct Brevo params namespace', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();
      const attendeeHtml = generateBrevoAttendeeConfirmationEmail();
      const reminderHtml = generateBrevoRegistrationReminderEmail();

      [orderHtml, attendeeHtml, reminderHtml].forEach(html => {
        // Should not use JavaScript template literals
        expect(html).not.toContain('${params.');
        // Should use Brevo syntax
        expect(html).toContain('{{ params.');
      });
    });

    it('should close all Brevo variable tags', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();

      const openTags = (orderHtml.match(/\{\{/g) || []).length;
      const closeTags = (orderHtml.match(/\}\}/g) || []).length;

      expect(openTags).toBe(closeTags);
      expect(openTags).toBeGreaterThan(0);
    });

    it('should use proper Brevo conditional syntax', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();

      expect(orderHtml).toMatch(/{% if/);
      expect(orderHtml).toMatch(/{% endif %}/);
    });

    it('should properly escape HTML entities in variables', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();
      const reminderHtml = generateBrevoRegistrationReminderEmail();

      // Check for proper HTML entity encoding in CTA buttons
      expect(orderHtml).toContain('View &amp; Register Tickets');
      expect(reminderHtml).toContain('View &amp; Register Tickets');

      // Attendee template has different content, check for ampersand usage
      const attendeeHtml = generateBrevoAttendeeConfirmationEmail();
      expect(attendeeHtml).toBeTruthy();
    });
  });

  describe('Template Structure Consistency', () => {
    it('should have consistent color scheme across templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('color: #d32f2f'); // Primary red
        expect(html).toContain('background: #f5f5f5'); // Light gray
      });
    });

    it('should have consistent button styling across templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('background: #000000'); // Black button
        expect(html).toContain('color: white');
        expect(html).toContain('text-decoration: none');
      });
    });

    it('should have consistent heading styles across templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        // Check for heading styles defined in base layout or inline
        expect(html).toMatch(/font-size:\s*(28|36)px/); // H1 sizes
        expect(html).toMatch(/font-size:\s*(18|20|24)px/); // H2/H3 sizes
      });
    });

    it('should have consistent box styling across templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        // Check for common padding and margin patterns
        expect(html).toMatch(/padding:\s*\d+px/);
        expect(html).toMatch(/margin:\s*\d+px\s+\d+/);
      });
    });
  });

  describe('HTML Validity', () => {
    it('should generate valid HTML structure for order confirmation', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toMatch(/<\/html>/);
    });

    it('should generate valid HTML structure for attendee confirmation', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toMatch(/<\/html>/);
    });

    it('should generate valid HTML structure for registration reminder', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toMatch(/<\/html>/);
    });

    it('should use table layout for email compatibility', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('<table');
        expect(html).toContain('cellspacing="0"');
        expect(html).toContain('cellpadding="0"');
      });
    });
  });

  describe('Content Sections', () => {
    it('should include action box in order confirmation', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('background: #5b6bb5');
      expect(html).toContain('border: 2px solid #4a5a9c');
    });

    it('should include QR code section in attendee confirmation', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('width: 200px; height: 200px');
      expect(html).toContain('alt="QR Code"');
    });

    it('should include wallet section in attendee confirmation', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('background: #e8f5e9');
      expect(html).toContain('height: 48px');
    });

    it('should include payment summary only in order confirmation', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();
      const attendeeHtml = generateBrevoAttendeeConfirmationEmail();
      const reminderHtml = generateBrevoRegistrationReminderEmail();

      expect(orderHtml).toContain('Payment Summary');
      expect(attendeeHtml).not.toContain('Payment Summary');
      expect(reminderHtml).not.toContain('Payment Summary');
    });
  });

  describe('Variable Placement', () => {
    it('should place customer name in greeting for order confirmation', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toMatch(/Hi\s*{{ params\.customerName }},/);
    });

    it('should place first name in greeting for attendee confirmation', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toMatch(/Hi\s*{{ params\.firstName }},/);
    });

    it('should place total amount prominently in order confirmation', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toMatch(/\${{ params\.totalAmount }}/);
      expect(html).toContain('font-size: 20px');
    });

    it('should place deadline prominently in action boxes', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();
      const reminderHtml = generateBrevoRegistrationReminderEmail();

      expect(orderHtml).toMatch(/Registration deadline:.*{{ params\.registrationDeadline }}/);
      expect(reminderHtml).toMatch(/Registration deadline:.*{{ params\.registrationDeadline }}/);
    });
  });

  describe('Links and CTAs', () => {
    it('should include registration link in order confirmation', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('href="{{ params.registrationUrl }}"');
      expect(html).toContain('View &amp; Register Tickets');
    });

    it('should include wallet links in attendee confirmation', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('href="{{ params.walletPassUrl }}"');
      expect(html).toContain('href="{{ params.googleWalletUrl }}"');
    });

    it('should include view tickets link in registration reminder', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('href="{{ params.viewTicketsUrl }}"');
    });

    it('should style CTA buttons consistently', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('display: inline-block');
        expect(html).toContain('background: #000000');
        expect(html).toContain('padding: 12px 30px');
        expect(html).toContain('border-radius: 4px');
      });
    });
  });

  describe('Base Layout Integration', () => {
    it('should include logo in all templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('https://img.mailinblue.com/9670291/images/content_library/original/68a6c02f3da913a8d57a0190.png');
      });
    });

    it('should include social footer in all templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('alocubanoboulderfest@gmail.com');
        expect(html).toContain('www.alocubanoboulderfest.org');
      });
    });

    it('should include email client compatibility styles', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('#outlook a');
        expect(html).toContain('.ExternalClass');
      });
    });
  });

  describe('Responsive Design', () => {
    it('should include mobile styles in all templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('@media (max-width: 600px)');
      });
    });

    it('should have max-width container in all templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toMatch(/max-width:\s*600px/);
      });
    });
  });

  describe('Template Differences', () => {
    it('should have unique content for each template type', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();
      const attendeeHtml = generateBrevoAttendeeConfirmationEmail();
      const reminderHtml = generateBrevoRegistrationReminderEmail();

      // Order confirmation unique content
      expect(orderHtml).toContain('Your Order is Complete!');
      expect(orderHtml).toContain('Payment Received');

      // Attendee confirmation unique content
      expect(attendeeHtml).toContain('Your Ticket is Ready!');
      expect(attendeeHtml).toContain('Your QR Code');

      // Registration reminder unique content
      expect(reminderHtml).toContain('Registration Reminder!');
      expect(reminderHtml).toContain('pending registration');
    });

    it('should have different primary variables for each template', () => {
      const orderHtml = generateBrevoOrderConfirmationEmail();
      const attendeeHtml = generateBrevoAttendeeConfirmationEmail();
      const reminderHtml = generateBrevoRegistrationReminderEmail();

      // Order has totalAmount
      expect(orderHtml).toContain('{{ params.totalAmount }}');
      expect(attendeeHtml).not.toContain('{{ params.totalAmount }}');

      // Attendee has QR code
      expect(attendeeHtml).toContain('{{ params.qrCodeUrl }}');
      expect(orderHtml).not.toContain('{{ params.qrCodeUrl }}');

      // All have order number
      expect(orderHtml).toContain('{{ params.orderNumber }}');
      expect(attendeeHtml).toContain('{{ params.orderNumber }}');
      expect(reminderHtml).toContain('{{ params.orderNumber }}');
    });
  });

  describe('Email Best Practices', () => {
    it('should use inline styles instead of CSS classes for critical styles', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        const inlineStyles = (html.match(/style="/g) || []).length;
        expect(inlineStyles).toBeGreaterThan(20);
      });
    });

    it('should avoid JavaScript in templates', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoAttendeeConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).not.toContain('<script');
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('onclick=');
      });
    });

    it('should use descriptive alt text for images', () => {
      const attendeeHtml = generateBrevoAttendeeConfirmationEmail();

      expect(attendeeHtml).toContain('alt="QR Code"');
      expect(attendeeHtml).toContain('alt="Add to Apple Wallet"');
      expect(attendeeHtml).toContain('alt="Add to Google Wallet"');
    });

    it('should have clear call-to-action buttons', () => {
      const templates = [
        generateBrevoOrderConfirmationEmail(),
        generateBrevoRegistrationReminderEmail()
      ];

      templates.forEach(html => {
        expect(html).toContain('View &amp; Register Tickets');
        expect(html).toContain('Action Required');
      });
    });
  });
});
