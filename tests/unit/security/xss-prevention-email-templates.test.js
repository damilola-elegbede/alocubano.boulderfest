/**
 * XSS Prevention Tests for Email Templates
 * 
 * SECURITY REQUIREMENT: All user-supplied data must be HTML-escaped before
 * being inserted into email templates to prevent XSS attacks.
 * 
 * Attack Vectors Tested:
 * - Script injection: <script>alert('xss')</script>
 * - Event handlers: <img src=x onerror="alert(1)">
 * - HTML tags: <iframe>, <object>, <embed>
 * - Special characters: & < > " '
 */

import { describe, it, expect } from 'vitest';
import { generateVolunteerAcknowledgementEmail } from '../../../lib/email-templates/volunteer-acknowledgement.js';
import { generateAttendeeConfirmationEmail } from '../../../lib/email-templates/attendee-confirmation.js';
import { generateOrderConfirmationEmail } from '../../../lib/email-templates/order-confirmation.js';
import { wrapInBaseLayout } from '../../../lib/email-templates/base-layout.js';

describe('XSS Prevention in Email Templates', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror="alert(1)">',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<svg onload="alert(1)">',
    '"><script>alert(String.fromCharCode(88,83,83))</script>',
    '<body onload="alert(1)">',
    '<object data="javascript:alert(1)">',
    '<embed src="data:text/html,<script>alert(1)</script>">'
  ];

  describe('Volunteer Acknowledgement Email', () => {
    it('should escape XSS payloads in firstName', () => {
      xssPayloads.forEach(payload => {
        const html = generateVolunteerAcknowledgementEmail({
          firstName: payload,
          lastName: 'Test',
          email: 'test@example.com',
          areasOfInterest: [],
          availability: []
        });

        expect(html).not.toContain(payload);
        expect(html).toContain('&lt;');
        expect(html).toContain('&gt;');
      });
    });

    it('should escape XSS payloads in areas of interest', () => {
      const html = generateVolunteerAcknowledgementEmail({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        areasOfInterest: ['<script>alert(1)</script>'],
        availability: []
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape XSS payloads in availability', () => {
      const html = generateVolunteerAcknowledgementEmail({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: ['<img src=x onerror=alert(1)>']
      });

      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;img');
    });
  });

  describe('Attendee Confirmation Email', () => {
    const baseData = {
      firstName: 'John',
      lastName: 'Doe',
      ticketId: 'TKT-123',
      ticketType: 'General Admission',
      orderNumber: 'ORD-123',
      eventName: 'Test Event',
      eventLocation: 'Test Location',
      eventDate: 'Jan 1, 2026',
      qrCodeUrl: 'https://example.com/qr.png',
      walletPassUrl: 'https://example.com/wallet',
      googleWalletUrl: 'https://example.com/google',
      appleWalletButtonUrl: 'https://example.com/apple-btn.png',
      googleWalletButtonUrl: 'https://example.com/google-btn.png',
      viewTicketUrl: 'https://example.com/view'
    };

    it('should escape XSS payloads in all user-supplied fields', () => {
      xssPayloads.forEach(payload => {
        const html = generateAttendeeConfirmationEmail({
          ...baseData,
          firstName: payload,
          lastName: payload,
          ticketId: payload,
          eventName: payload
        });

        // Count how many times the raw payload appears (should be 0)
        const matches = html.match(new RegExp(payload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
        expect(matches).toBeNull();

        // Verify escaping happened
        expect(html).toContain('&lt;');
        expect(html).toContain('&gt;');
      });
    });
  });

  describe('Order Confirmation Email', () => {
    const baseData = {
      customerName: 'John Doe',
      orderNumber: 'ORD-123',
      orderDate: 'Jan 1, 2026',
      totalTickets: 2,
      totalDonations: 0,
      totalItems: 2,
      ticketsList: '<div>Tickets</div>',
      registrationUrl: 'https://example.com/register',
      registrationDeadline: 'Jan 8, 2026',
      totalAmount: '100.00',
      paymentMethod: 'Visa ••4242',
      transactionId: 'txn_123',
      paymentDate: 'Jan 1, 2026',
      billingEmail: 'test@example.com'
    };

    it('should escape XSS in customer-supplied fields', () => {
      const html = generateOrderConfirmationEmail({
        ...baseData,
        customerName: '<script>alert("xss")</script>',
        orderNumber: '<img src=x onerror=alert(1)>',
        billingEmail: 'test@example.com<script>alert(1)</script>'
      });

      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img');
    });
  });

  describe('Base Layout Title Escaping', () => {
    it('should escape XSS in title parameter', () => {
      const html = wrapInBaseLayout('Content', '<script>alert("xss")</script>');

      expect(html).not.toContain('<title><script>alert("xss")</script></title>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape special characters in title', () => {
      const html = wrapInBaseLayout('Content', 'Order & Receipt > $100');

      expect(html).toContain('&amp;');
      expect(html).toContain('&gt;');
    });
  });

  describe('Special Character Handling', () => {
    it('should properly escape all dangerous characters', () => {
      const dangerousChars = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };

      Object.entries(dangerousChars).forEach(([char, escaped]) => {
        const html = generateVolunteerAcknowledgementEmail({
          firstName: `Test${char}Name`,
          lastName: 'Doe',
          email: 'test@example.com',
          areasOfInterest: [],
          availability: []
        });

        expect(html).toContain(escaped);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined safely', () => {
      const html = generateVolunteerAcknowledgementEmail({
        firstName: null,
        lastName: undefined,
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      });

      expect(html).not.toContain('null');
      expect(html).not.toContain('undefined');
    });

    it('should handle empty strings', () => {
      const html = generateVolunteerAcknowledgementEmail({
        firstName: '',
        lastName: '',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      });

      expect(html).toBeTruthy();
    });

    it('should handle mixed content with XSS and legitimate special characters', () => {
      const html = generateOrderConfirmationEmail({
        customerName: "O'Brien & <script>alert('xss')</script> Sons",
        orderNumber: 'ORD-123',
        orderDate: 'Jan 1, 2026',
        totalTickets: 1,
        totalDonations: 0,
        totalItems: 1,
        ticketsList: '<div>Tickets</div>',
        registrationUrl: 'https://example.com/register',
        registrationDeadline: 'Jan 8, 2026',
        totalAmount: '100.00',
        paymentMethod: 'Visa ••4242',
        transactionId: 'txn_123',
        paymentDate: 'Jan 1, 2026',
        billingEmail: 'test@example.com'
      });

      // Script tag should be escaped
      expect(html).not.toContain('<script>alert(\'xss\')</script>');
      expect(html).toContain('&lt;script&gt;');

      // Legitimate characters should also be escaped
      expect(html).toContain('O&#039;Brien');
      expect(html).toContain('&amp;');
    });
  });
});
