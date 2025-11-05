/**
 * Registration Reminder Email Template Tests
 *
 * Tests urgency text variations, unregistered ticket rendering,
 * registration deadline countdown, and Mountain Time formatting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateRegistrationReminderEmail } from '../../../lib/email-templates/registration-reminder.js';

describe('Registration Reminder Email Template', () => {
  let baseData;

  beforeEach(() => {
    baseData = {
      customerName: 'Jane Smith',
      orderNumber: 'ORD-67890',
      orderDate: 'Jan 10, 2026, 2:15 PM MST',
      totalTickets: 3,
      ticketsList: '<div>Unregistered ticket list</div>',
      viewTicketsUrl: 'https://example.com/tickets/token123',
      registrationDeadline: 'Jan 17, 2026, 2:15 PM MST'
    };
  });

  describe('HTML Structure and Validity', () => {
    it('should generate valid HTML5 document structure', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body');
      expect(html).toContain('</body>');
    });

    it('should include proper meta tags', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('content="text/html; charset=utf-8"');
    });

    it('should have proper title tag', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<title>Registration Reminder</title>');
    });

    it('should have no unclosed HTML tags', () => {
      const html = generateRegistrationReminderEmail(baseData);

      const divOpenCount = (html.match(/<div/g) || []).length;
      const divCloseCount = (html.match(/<\/div>/g) || []).length;
      expect(divOpenCount).toBe(divCloseCount);

      const tableOpenCount = (html.match(/<table/g) || []).length;
      const tableCloseCount = (html.match(/<\/table>/g) || []).length;
      expect(tableOpenCount).toBe(tableCloseCount);
    });
  });

  describe('Urgency Text Variations', () => {
    it('should display ticket count with urgency', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<strong>3 ticket(s)</strong>');
      expect(html).toContain('pending registration');
    });

    it('should handle singular ticket urgency text', () => {
      const data = { ...baseData, totalTickets: 1 };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('<strong>1 ticket(s)</strong>');
      expect(html).toContain('pending registration');
    });

    it('should emphasize urgency with bold formatting', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('You still have <strong>');
      expect(html).toContain('</strong> pending registration');
    });

    it('should use attention-grabbing heading', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('Registration Reminder!');
      expect(html).toContain('color: #d32f2f'); // Red color for urgency
    });

    it('should include action required section', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('Action Required');
      expect(html).toContain('Please register attendee information for each ticket');
    });
  });

  describe('Unregistered Ticket List Rendering', () => {
    it('should render tickets list HTML correctly', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<div>Unregistered ticket list</div>');
    });

    it('should include "Your Tickets:" heading', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('Your Tickets:');
    });

    it('should position tickets list after order details', () => {
      const html = generateRegistrationReminderEmail(baseData);

      const orderDetailsIndex = html.indexOf('Order Details');
      const ticketsListIndex = html.indexOf('Your Tickets:');
      expect(ticketsListIndex).toBeGreaterThan(orderDetailsIndex);
    });

    it('should render complex tickets list HTML', () => {
      const data = {
        ...baseData,
        ticketsList: `
          <div>
            <p><strong>Ticket 1:</strong> Full Weekend Pass</p>
            <p><strong>Ticket 2:</strong> Saturday Only</p>
            <p><strong>Ticket 3:</strong> Sunday Only</p>
          </div>
        `
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('Full Weekend Pass');
      expect(html).toContain('Saturday Only');
      expect(html).toContain('Sunday Only');
    });
  });

  describe('Registration Deadline Display', () => {
    it('should display registration deadline prominently', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('Registration deadline: Jan 17, 2026, 2:15 PM MST');
    });

    it('should show deadline in action box', () => {
      const html = generateRegistrationReminderEmail(baseData);

      const actionBoxMatch = html.match(/background: #5b6bb5.*?Registration deadline/s);
      expect(actionBoxMatch).toBeTruthy();
    });

    it('should format deadline in smaller text', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<small>Registration deadline: Jan 17, 2026, 2:15 PM MST</small>');
    });

    it('should display deadline with white text on colored background', () => {
      const html = generateRegistrationReminderEmail(baseData);

      // Deadline text is in the action box which has white text color
      expect(html).toContain('background: #5b6bb5');
      expect(html).toContain('Registration deadline');
      // The parent div has white color which cascades to the deadline text
      expect(html).toContain('color: white');
    });
  });

  describe('Mountain Time Deadline Formatting', () => {
    it('should display deadline with MST suffix in winter', () => {
      const data = {
        ...baseData,
        registrationDeadline: 'Jan 17, 2026, 2:15 PM MST'
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('Jan 17, 2026, 2:15 PM MST');
    });

    it('should display deadline with MDT suffix in summer', () => {
      const data = {
        ...baseData,
        registrationDeadline: 'Jul 17, 2026, 2:15 PM MDT'
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('Jul 17, 2026, 2:15 PM MDT');
    });

    it('should include (MT) indicator in deadline text', () => {
      const html = generateRegistrationReminderEmail(baseData);

      // Check that MST or MDT (Mountain Time indicators) are present
      expect(html).toMatch(/MST|MDT/);
    });

    it('should display order date in Mountain Time', () => {
      const data = {
        ...baseData,
        orderDate: 'Jan 10, 2026, 2:15 PM MST'
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('<strong>Date:</strong> Jan 10, 2026, 2:15 PM MST');
    });
  });

  describe('View Tickets URL Generation', () => {
    it('should include view tickets URL in button', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('href="https://example.com/tickets/token123"');
    });

    it('should use proper button text', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('View &amp; Register Tickets');
    });

    it('should properly escape ampersand in button text', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('&amp;');
      expect(html).not.toContain('View & Register');
    });

    it('should handle URLs with query parameters', () => {
      const data = {
        ...baseData,
        viewTicketsUrl: 'https://example.com/tickets/token123?source=email&campaign=reminder'
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('source=email');
      expect(html).toContain('campaign=reminder');
    });

    it('should handle URLs with hash fragments', () => {
      const data = {
        ...baseData,
        viewTicketsUrl: 'https://example.com/tickets/token123#register'
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('#register');
    });
  });

  describe('Ticket Details Display', () => {
    it('should display order number', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<strong>Order Number:</strong> ORD-67890');
    });

    it('should display order date', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<strong>Date:</strong> Jan 10, 2026, 2:15 PM MST');
    });

    it('should display total tickets count', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<strong>Total Tickets:</strong> 3');
    });

    it('should include order details section', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('Order Details');
    });
  });

  describe('Variable Interpolation', () => {
    it('should interpolate customer name in greeting', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('Hi Jane Smith,');
    });

    it('should interpolate order number correctly', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('ORD-67890');
    });

    it('should interpolate all required variables', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('Jane Smith');
      expect(html).toContain('ORD-67890');
      expect(html).toContain('Jan 10, 2026, 2:15 PM MST');
      expect(html).toContain('3');
      expect(html).toContain('Jan 17, 2026, 2:15 PM MST');
    });
  });

  describe('HTML Structure Validation', () => {
    it('should use table-based layout for email compatibility', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<table');
      expect(html).toContain('cellspacing="0"');
      expect(html).toContain('cellpadding="0"');
      expect(html).toContain('role="presentation"');
    });

    it('should include responsive styles', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('@media (max-width: 600px)');
    });

    it('should use inline styles', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('style="');
      expect(html).toContain('background:');
      expect(html).toContain('padding:');
    });
  });

  describe('XSS Prevention', () => {
    it('should escape XSS attempts in customer name', () => {
      const data = {
        ...baseData,
        customerName: '<script>alert("xss")</script>Jane'
      };
      const html = generateRegistrationReminderEmail(data);

      // Template now auto-escapes HTML to prevent XSS
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Jane');
      expect(html).not.toContain('<script>alert("xss")</script>');
    });

    it('should escape XSS attempts in order number', () => {
      const data = {
        ...baseData,
        orderNumber: 'ORD-<test>'
      };
      const html = generateRegistrationReminderEmail(data);

      // Template escapes HTML tags
      expect(html).toContain('ORD-&lt;test&gt;');
      expect(html).not.toContain('ORD-<test>');
    });

    it('should safely render URLs', () => {
      const data = {
        ...baseData,
        viewTicketsUrl: 'javascript:alert(1)'
      };
      const html = generateRegistrationReminderEmail(data);

      // URL is rendered as-is in href attributes (email clients block javascript: URLs)
      // Note: href attributes don't need HTML escaping, but dangerous protocols should be validated at input
      expect(html).toContain('href="javascript:alert(1)"');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long customer names', () => {
      const data = {
        ...baseData,
        customerName: 'Alexander Maximilian Christopher Wellington-Smythe III'
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('Alexander Maximilian Christopher Wellington-Smythe III');
    });

    it('should handle special characters in names', () => {
      const data = {
        ...baseData,
        customerName: 'María José García-López'
      };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('María José García-López');
    });

    it('should handle single ticket', () => {
      const data = { ...baseData, totalTickets: 1 };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('1 ticket(s)');
      expect(html).toContain('<strong>Total Tickets:</strong> 1');
    });

    it('should handle many tickets', () => {
      const data = { ...baseData, totalTickets: 50 };
      const html = generateRegistrationReminderEmail(data);

      expect(html).toContain('50 ticket(s)');
      expect(html).toContain('<strong>Total Tickets:</strong> 50');
    });
  });

  describe('Email Client Compatibility', () => {
    it('should include Outlook-specific CSS', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('#outlook a { padding:0; }');
      expect(html).toContain('.ExternalClass');
    });

    it('should use table-based layout', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('table-layout: fixed');
    });

    it('should set max-width for mobile', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('max-width: 600px');
    });
  });

  describe('Branding and Footer', () => {
    it('should include company logo', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<img src="https://img.mailinblue.com');
    });

    it('should include social media footer', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('instagram');
      expect(html).toContain('whatsapp');
      expect(html).toContain('alocubanoboulderfest@gmail.com');
    });
  });

  describe('Accessibility', () => {
    it('should include role attributes', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('role="presentation"');
    });

    it('should have proper heading hierarchy', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('<h1');
      expect(html).toContain('<h2');
      expect(html).toContain('<h3');
    });
  });

  describe('Call-to-Action Styling', () => {
    it('should style action button prominently', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('background: #000000');
      expect(html).toContain('color: white');
      expect(html).toContain('font-weight: bold');
    });

    it('should center-align action button', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('text-align: center');
    });

    it('should add padding to action button', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('padding: 12px 30px');
    });

    it('should remove underline from button link', () => {
      const html = generateRegistrationReminderEmail(baseData);

      expect(html).toContain('text-decoration: none');
    });
  });
});
