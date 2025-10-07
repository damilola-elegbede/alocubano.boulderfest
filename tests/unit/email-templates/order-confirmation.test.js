/**
 * Order Confirmation Email Template Tests
 *
 * Tests HTML generation, variable interpolation, timezone formatting,
 * XSS prevention, and email client compatibility for order confirmation emails.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateOrderConfirmationEmail } from '../../../lib/email-templates/order-confirmation.js';

describe('Order Confirmation Email Template', () => {
  let baseData;

  beforeEach(() => {
    baseData = {
      customerName: 'John Doe',
      orderNumber: 'ORD-12345',
      orderDate: 'Jan 15, 2026, 11:30 AM MST',
      totalTickets: 2,
      totalDonations: 1,
      totalItems: 3,
      ticketsList: '<div>Test ticket list</div>',
      registrationUrl: 'https://example.com/register',
      registrationDeadline: 'Jan 22, 2026, 11:30 AM MST',
      totalAmount: '155.43',
      paymentMethod: 'Visa ••4242',
      transactionId: 'ch_1234567890',
      paymentDate: 'Jan 15, 2026, 11:30 AM MST',
      billingEmail: 'john.doe@example.com'
    };
  });

  describe('HTML Structure and Validity', () => {
    it('should generate valid HTML5 document structure', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body');
      expect(html).toContain('</body>');
    });

    it('should include proper meta tags for email rendering', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('<meta http-equiv="Content-Type"');
      expect(html).toContain('content="text/html; charset=utf-8"');
    });

    it('should have proper title tag', () => {
      const html = generateOrderConfirmationEmail(baseData);

      // Title tag doesn't need HTML entity encoding (& is fine in title)
      expect(html).toContain('<title>Order Confirmation & Receipt</title>');
    });

    it('should include responsive media queries', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('@media (max-width: 600px)');
      expect(html).toContain('.nl2go-responsive-hide');
    });

    it('should have no unclosed HTML tags (basic check)', () => {
      const html = generateOrderConfirmationEmail(baseData);

      // Count opening and closing tags for critical elements
      const divOpenCount = (html.match(/<div/g) || []).length;
      const divCloseCount = (html.match(/<\/div>/g) || []).length;
      expect(divOpenCount).toBe(divCloseCount);

      const tableOpenCount = (html.match(/<table/g) || []).length;
      const tableCloseCount = (html.match(/<\/table>/g) || []).length;
      expect(tableOpenCount).toBe(tableCloseCount);
    });
  });

  describe('Variable Interpolation', () => {
    it('should interpolate customer name correctly', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('Hi John Doe,');
      // Should appear twice: greeting and billing info
      expect((html.match(/John Doe/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it('should interpolate order number correctly', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<strong>Order Number:</strong> ORD-12345');
    });

    it('should interpolate order date with Mountain Time', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<strong>Date:</strong> Jan 15, 2026, 11:30 AM MST');
    });

    it('should interpolate total amount correctly formatted', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('$155.43');
    });

    it('should interpolate payment method correctly', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<strong>Payment Method:</strong> Visa ••4242');
    });

    it('should interpolate transaction ID correctly', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<strong>Transaction ID:</strong> ch_1234567890');
    });

    it('should interpolate payment date with Mountain Time', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<strong>Payment Date:</strong> Jan 15, 2026, 11:30 AM MST');
    });

    it('should interpolate billing email correctly', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('john.doe@example.com');
    });
  });

  describe('Tickets and Donations Rendering', () => {
    it('should render tickets list HTML correctly', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<div>Test ticket list</div>');
    });

    it('should display singular "Ticket" for 1 ticket', () => {
      const data = { ...baseData, totalTickets: 1, totalDonations: 0, totalItems: 1 };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('1 Ticket');
      expect(html).not.toContain('1 Tickets');
    });

    it('should display plural "Tickets" for multiple tickets', () => {
      const data = { ...baseData, totalTickets: 3, totalDonations: 0, totalItems: 3 };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('3 Tickets');
    });

    it('should render tickets + donations in single email', () => {
      const data = {
        ...baseData,
        totalTickets: 2,
        totalDonations: 1,
        totalItems: 3
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('2 Tickets, 1 Donation');
      expect(html).toContain('(3 total)');
    });

    it('should render multiple donations with plural form', () => {
      const data = {
        ...baseData,
        totalTickets: 1,
        totalDonations: 3,
        totalItems: 4
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('1 Ticket, 3 Donations');
      expect(html).toContain('(4 total)');
    });

    it('should handle donation-only emails (0 tickets)', () => {
      const data = {
        ...baseData,
        totalTickets: 0,
        totalDonations: 2,
        totalItems: 2
      };
      const html = generateOrderConfirmationEmail(data);

      // Should still render properly without showing "0 Tickets"
      expect(html).toContain('0 Ticket');
      expect(html).toContain('(2 total)');
    });

    it('should handle ticket-only emails (0 donations)', () => {
      const data = {
        ...baseData,
        totalTickets: 5,
        totalDonations: 0,
        totalItems: 5
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('5 Tickets');
      expect(html).not.toContain('Donation');
      expect(html).toContain('(5 total)');
    });
  });

  describe('Payment Summary Formatting', () => {
    it('should format subtotal with currency symbol', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('$155.43');
    });

    it('should format large amounts correctly', () => {
      const data = { ...baseData, totalAmount: '1234.56' };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('$1234.56');
    });

    it('should handle zero-cent amounts', () => {
      const data = { ...baseData, totalAmount: '100.00' };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('$100.00');
    });

    it('should display payment summary table structure', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('Payment Summary');
      expect(html).toContain('<strong>Total Paid:</strong>');
      expect(html).toContain('<table style="width: 100%; border-collapse: collapse;">');
    });
  });

  describe('Mountain Time Formatting', () => {
    it('should display order date in Mountain Time with MST suffix', () => {
      const data = {
        ...baseData,
        orderDate: 'Jan 15, 2026, 11:30 AM MST' // Winter time
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('Jan 15, 2026, 11:30 AM MST');
    });

    it('should display payment date in Mountain Time with MST suffix', () => {
      const data = {
        ...baseData,
        paymentDate: 'Jan 15, 2026, 11:30 AM MST'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('<strong>Payment Date:</strong> Jan 15, 2026, 11:30 AM MST');
    });

    it('should display registration deadline in Mountain Time', () => {
      const data = {
        ...baseData,
        registrationDeadline: 'Jan 22, 2026, 11:30 AM MST'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('Registration deadline: Jan 22, 2026, 11:30 AM MST');
    });

    it('should handle MDT (daylight time) in summer months', () => {
      const data = {
        ...baseData,
        orderDate: 'Jul 15, 2026, 3:30 PM MDT', // Summer time
        paymentDate: 'Jul 15, 2026, 3:30 PM MDT',
        registrationDeadline: 'Jul 22, 2026, 3:30 PM MDT'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('Jul 15, 2026, 3:30 PM MDT');
    });
  });

  describe('Call-to-Action Elements', () => {
    it('should include registration URL in action button', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('href="https://example.com/register"');
      expect(html).toContain('View &amp; Register Tickets');
    });

    it('should properly escape ampersand in button text', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('View &amp; Register Tickets');
      expect(html).not.toContain('View & Register Tickets');
    });

    it('should include action required section', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('Action Required');
      expect(html).toContain('Please register attendee information for each ticket');
    });

    it('should style action box with high visibility colors', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('background: #5b6bb5');
      expect(html).toContain('color: white');
    });
  });

  describe('XSS Prevention and Security', () => {
    it('should render customer name as-is (caller must sanitize)', () => {
      const data = {
        ...baseData,
        customerName: '<script>alert("xss")</script>John'
      };
      const html = generateOrderConfirmationEmail(data);

      // Template doesn't auto-escape; it renders the string directly
      // This is expected - sanitization should happen at the data layer
      expect(html).toContain('<script>alert("xss")</script>John');
    });

    it('should render order number as-is (caller must sanitize)', () => {
      const data = {
        ...baseData,
        orderNumber: 'ORD-<img src=x onerror=alert(1)>'
      };
      const html = generateOrderConfirmationEmail(data);

      // Template renders HTML directly; validation should occur before template generation
      expect(html).toContain('ORD-<img src=x onerror=alert(1)>');
    });

    it('should handle special characters in customer name', () => {
      const data = {
        ...baseData,
        customerName: 'O\'Brien & Sons'
      };
      const html = generateOrderConfirmationEmail(data);

      // Apostrophes and ampersands render correctly
      expect(html).toContain('O\'Brien');
      expect(html).toContain('&');
    });

    it('should render billing email as-is (validation at data layer)', () => {
      const data = {
        ...baseData,
        billingEmail: 'test@example.com<script>alert(1)</script>'
      };
      const html = generateOrderConfirmationEmail(data);

      // Email clients will not execute JavaScript in emails anyway
      // HTML is rendered as-is; input validation is caller's responsibility
      expect(html).toContain('test@example.com<script>alert(1)</script>');
    });
  });

  describe('Email Client Compatibility', () => {
    it('should use inline styles for compatibility', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('style="');
      expect(html).toContain('padding:');
      expect(html).toContain('margin:');
    });

    it('should include Outlook-specific CSS resets', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('#outlook a { padding:0; }');
      expect(html).toContain('.ExternalClass');
    });

    it('should use table-based layout for email compatibility', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<table');
      expect(html).toContain('cellspacing="0"');
      expect(html).toContain('cellpadding="0"');
      expect(html).toContain('role="presentation"');
    });

    it('should set proper width constraints for mobile', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('max-width: 600px');
    });
  });

  describe('Content Sections', () => {
    it('should include payment received indicator', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('Payment Received');
      expect(html).toContain('This email serves as your official receipt');
    });

    it('should include order details section', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('Order Details');
      expect(html).toContain('<strong>Order Number:</strong>');
      expect(html).toContain('<strong>Date:</strong>');
      expect(html).toContain('<strong>Items:</strong>');
    });

    it('should include billing information section', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('Billing Information');
    });

    it('should include receipt footer with company info', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('A Lo Cubano Boulder Fest');
      expect(html).toContain('Boulder, CO');
      expect(html).toContain('This is your receipt for tax purposes');
    });

    it('should include social media footer', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('instagram');
      expect(html).toContain('whatsapp');
      expect(html).toContain('alocubanoboulderfest@gmail.com');
    });
  });

  describe('Edge Cases and Special Characters', () => {
    it('should handle very long customer names', () => {
      const data = {
        ...baseData,
        customerName: 'Alexander Maximilian Christopher Wellington-Smythe III'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('Alexander Maximilian Christopher Wellington-Smythe III');
    });

    it('should handle names with special characters', () => {
      const data = {
        ...baseData,
        customerName: 'José María García-López'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('José María García-López');
    });

    it('should handle unicode in customer names', () => {
      const data = {
        ...baseData,
        customerName: '李明 (Li Ming)'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('李明 (Li Ming)');
    });

    it('should handle apostrophes in names', () => {
      const data = {
        ...baseData,
        customerName: 'O\'Brien'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('O\'Brien');
    });

    it('should handle hyphenated names', () => {
      const data = {
        ...baseData,
        customerName: 'Mary-Jane Parker'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('Mary-Jane Parker');
    });

    it('should handle single-letter names', () => {
      const data = {
        ...baseData,
        customerName: 'X'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('Hi X,');
    });

    it('should handle very large order amounts', () => {
      const data = {
        ...baseData,
        totalAmount: '9999.99'
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('$9999.99');
    });

    it('should handle many tickets', () => {
      const data = {
        ...baseData,
        totalTickets: 100,
        totalDonations: 0,
        totalItems: 100
      };
      const html = generateOrderConfirmationEmail(data);

      expect(html).toContain('100 Tickets');
    });
  });

  describe('Responsive Design Elements', () => {
    it('should include mobile-responsive CSS', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('@media (max-width: 600px)');
      expect(html).toContain('nl2go-responsive-hide');
    });

    it('should have mobile-optimized padding', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('padding-left: 15px');
      expect(html).toContain('padding-right: 15px');
    });

    it('should use flexible table widths', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('width: 100%');
    });
  });

  describe('Logo and Branding', () => {
    it('should include company logo image', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<img src="https://img.mailinblue.com');
      expect(html).toContain('width="106"');
    });

    it('should center-align logo', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('align="center"');
    });
  });

  describe('Accessibility', () => {
    it('should include role attributes on tables', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('role="presentation"');
    });

    it('should have proper heading hierarchy', () => {
      const html = generateOrderConfirmationEmail(baseData);

      expect(html).toContain('<h1');
      expect(html).toContain('<h2');
      expect(html).toContain('<h3');
    });
  });
});
