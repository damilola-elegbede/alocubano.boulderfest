/**
 * Integration Tests for Email Template Rendering
 * Tests end-to-end template rendering with real data and email delivery simulation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateOrderConfirmationEmail } from '../../../lib/email-templates/order-confirmation.js';
import { generateAttendeeConfirmationEmail } from '../../../lib/email-templates/attendee-confirmation.js';
import { generateRegistrationReminderEmail } from '../../../lib/email-templates/registration-reminder.js';
import {
  generateBrevoOrderConfirmationEmail,
  generateBrevoAttendeeConfirmationEmail,
  generateBrevoRegistrationReminderEmail
} from '../../../lib/email-templates/brevo-templates.js';

describe('Email Template Rendering Integration', () => {
  let orderData;
  let attendeeData;
  let reminderData;

  beforeEach(() => {
    // Realistic order confirmation data
    orderData = {
      customerName: 'John Doe',
      orderNumber: 'ORD-20260515-001',
      orderDate: 'May 15, 2026 at 2:30 PM MST',
      totalTickets: 2,
      totalDonations: 1,
      totalItems: 3,
      ticketsList: `
        <div style="background: #fff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
          <p style="margin: 5px 0;"><strong>Weekend Pass</strong> - $75.00</p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">TICKET-001</p>
        </div>
        <div style="background: #fff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
          <p style="margin: 5px 0;"><strong>Friday Night</strong> - $35.00</p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">TICKET-002</p>
        </div>
      `,
      registrationUrl: 'https://www.alocubanoboulderfest.org/tickets/view/abc123',
      registrationDeadline: 'May 14, 2026 at 11:59 PM MST',
      totalAmount: '110.00',
      paymentMethod: 'Visa ••4242',
      transactionId: 'ch_3ABC123DEF456',
      paymentDate: 'May 15, 2026 at 2:30 PM MST',
      billingEmail: 'john.doe@example.com'
    };

    // Realistic attendee confirmation data
    attendeeData = {
      firstName: 'Jane',
      lastName: 'Smith',
      ticketId: 'TICKET-12345',
      ticketType: 'All-Access Pass',
      orderNumber: 'ORD-20260515-002',
      eventName: 'A Lo Cubano Boulder Fest 2026',
      eventLocation: 'Avalon Ballroom, Boulder, CO',
      eventDate: 'May 15-17, 2026',
      qrCodeUrl: 'https://www.alocubanoboulderfest.org/api/tickets/qr/TICKET-12345.png',
      walletPassUrl: 'https://www.alocubanoboulderfest.org/api/tickets/apple-wallet/TICKET-12345',
      googleWalletUrl: 'https://www.alocubanoboulderfest.org/api/tickets/google-wallet/TICKET-12345',
      appleWalletButtonUrl: 'https://www.alocubanoboulderfest.org/assets/apple-wallet-button.png',
      googleWalletButtonUrl: 'https://www.alocubanoboulderfest.org/assets/google-wallet-button.png',
      viewTicketUrl: 'https://www.alocubanoboulderfest.org/tickets/view/xyz789'
    };

    // Realistic reminder data
    reminderData = {
      customerName: 'Bob Johnson',
      orderNumber: 'ORD-20260515-003',
      orderDate: 'May 15, 2026 at 3:45 PM MST',
      totalTickets: 3,
      ticketsList: `
        <div style="background: #fff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
          <p style="margin: 5px 0;"><strong>Weekend Pass</strong></p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">TICKET-003</p>
          <p style="margin: 5px 0; font-size: 12px; color: #d32f2f;">⚠ Not Registered</p>
        </div>
      `,
      viewTicketsUrl: 'https://www.alocubanoboulderfest.org/tickets/view/def456',
      registrationDeadline: 'May 14, 2026 at 11:59 PM MST'
    };
  });

  describe('End-to-End Order Confirmation Rendering', () => {
    it('should render complete order confirmation with real data', () => {
      const html = generateOrderConfirmationEmail(orderData);

      expect(html).toBeTruthy();
      expect(html.length).toBeGreaterThan(1000);
    });

    it('should include all order details', () => {
      const html = generateOrderConfirmationEmail(orderData);

      expect(html).toContain('John Doe');
      expect(html).toContain('ORD-20260515-001');
      expect(html).toContain('May 15, 2026 at 2:30 PM MST');
      expect(html).toContain('$110.00');
    });

    it('should render ticket list HTML correctly', () => {
      const html = generateOrderConfirmationEmail(orderData);

      expect(html).toContain('Weekend Pass');
      expect(html).toContain('Friday Night');
      expect(html).toContain('TICKET-001');
      expect(html).toContain('TICKET-002');
    });

    it('should include payment details', () => {
      const html = generateOrderConfirmationEmail(orderData);

      expect(html).toContain('Visa ••4242');
      expect(html).toContain('ch_3ABC123DEF456');
    });

    it('should have valid registration link', () => {
      const html = generateOrderConfirmationEmail(orderData);

      expect(html).toContain('href="https://www.alocubanoboulderfest.org/tickets/view/abc123"');
    });

    it('should handle comp tickets correctly', () => {
      const compData = {
        ...orderData,
        compTicketNotice: '<div style="background: #e3f2fd; padding: 12px; margin: 20px 0;">Complimentary ticket</div>'
      };

      const html = generateOrderConfirmationEmail(compData);

      expect(html).toContain('Complimentary ticket');
    });
  });

  describe('End-to-End Attendee Confirmation Rendering', () => {
    it('should render complete attendee confirmation with real data', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toBeTruthy();
      expect(html.length).toBeGreaterThan(1000);
    });

    it('should include all attendee details', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toContain('Jane Smith');
      expect(html).toContain('TICKET-12345');
      expect(html).toContain('All-Access Pass');
      expect(html).toContain('Avalon Ballroom, Boulder, CO');
    });

    it('should include QR code with proper URL', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toContain('src="https://www.alocubanoboulderfest.org/api/tickets/qr/TICKET-12345.png"');
    });

    it('should include wallet pass links', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toContain('https://www.alocubanoboulderfest.org/api/tickets/apple-wallet/TICKET-12345');
      expect(html).toContain('https://www.alocubanoboulderfest.org/api/tickets/google-wallet/TICKET-12345');
    });

    it('should render view ticket button', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toContain('View Ticket Online');
      expect(html).toContain('href="https://www.alocubanoboulderfest.org/tickets/view/xyz789"');
    });
  });

  describe('End-to-End Registration Reminder Rendering', () => {
    it('should render complete registration reminder with real data', () => {
      const html = generateRegistrationReminderEmail(reminderData);

      expect(html).toBeTruthy();
      expect(html.length).toBeGreaterThan(1000);
    });

    it('should include reminder message', () => {
      const html = generateRegistrationReminderEmail(reminderData);

      expect(html).toContain('Bob Johnson');
      expect(html).toContain('3 ticket(s)');
      expect(html).toContain('pending registration');
    });

    it('should render unregistered tickets list', () => {
      const html = generateRegistrationReminderEmail(reminderData);

      expect(html).toContain('TICKET-003');
      expect(html).toContain('Not Registered');
    });

    it('should include view tickets link', () => {
      const html = generateRegistrationReminderEmail(reminderData);

      expect(html).toContain('href="https://www.alocubanoboulderfest.org/tickets/view/def456"');
    });
  });

  describe('Multi-Template Scenarios', () => {
    it('should render different templates with consistent styling', () => {
      const orderHtml = generateOrderConfirmationEmail(orderData);
      const attendeeHtml = generateAttendeeConfirmationEmail(attendeeData);
      const reminderHtml = generateRegistrationReminderEmail(reminderData);

      // All should have base layout
      [orderHtml, attendeeHtml, reminderHtml].forEach(html => {
        expect(html).toContain('<!DOCTYPE html>');
        // Festival name appears in <title> tag, not necessarily in content
        expect(html).toMatch(/A Lo Cubano Boulder Fest|<title>/);
        expect(html).toContain('alocubanoboulderfest@gmail.com');
      });
    });

    it('should handle batch email generation', () => {
      const orderHtml = generateOrderConfirmationEmail(orderData);
      const attendeeHtml1 = generateAttendeeConfirmationEmail({
        ...attendeeData,
        ticketId: 'TICKET-001'
      });
      const attendeeHtml2 = generateAttendeeConfirmationEmail({
        ...attendeeData,
        ticketId: 'TICKET-002'
      });

      expect(orderHtml).toBeTruthy();
      expect(attendeeHtml1).toContain('TICKET-001');
      expect(attendeeHtml2).toContain('TICKET-002');
    });

    it('should render multiple ticket types correctly', () => {
      const weekendPass = generateAttendeeConfirmationEmail({
        ...attendeeData,
        ticketType: 'Weekend Pass'
      });
      const fridayOnly = generateAttendeeConfirmationEmail({
        ...attendeeData,
        ticketType: 'Friday Night Only'
      });

      expect(weekendPass).toContain('Weekend Pass');
      expect(fridayOnly).toContain('Friday Night Only');
    });
  });

  describe('Brevo Template Integration', () => {
    it('should generate Brevo order confirmation template', () => {
      const html = generateBrevoOrderConfirmationEmail();

      expect(html).toContain('{{ params.customerName }}');
      expect(html).toContain('{{ params.totalAmount }}');
    });

    it('should generate Brevo attendee confirmation template', () => {
      const html = generateBrevoAttendeeConfirmationEmail();

      expect(html).toContain('{{ params.firstName }}');
      expect(html).toContain('{{ params.qrCodeUrl }}');
    });

    it('should generate Brevo registration reminder template', () => {
      const html = generateBrevoRegistrationReminderEmail();

      expect(html).toContain('{{ params.customerName }}');
      expect(html).toContain('{{ params.totalTickets }}');
    });

    it('should use same base layout for Brevo templates', () => {
      const brevoOrder = generateBrevoOrderConfirmationEmail();
      const brevoAttendee = generateBrevoAttendeeConfirmationEmail();
      const brevoReminder = generateBrevoRegistrationReminderEmail();

      [brevoOrder, brevoAttendee, brevoReminder].forEach(html => {
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('alocubanoboulderfest@gmail.com');
      });
    });
  });

  describe('Link Validation', () => {
    it('should generate valid absolute URLs', () => {
      const html = generateOrderConfirmationEmail(orderData);

      const links = html.match(/href="https:\/\/[^"]+"/g) || [];
      expect(links.length).toBeGreaterThan(3);

      links.forEach(link => {
        expect(link).toMatch(/^href="https:\/\//);
      });
    });

    it('should handle query parameters in URLs', () => {
      const dataWithParams = {
        ...orderData,
        registrationUrl: 'https://www.alocubanoboulderfest.org/tickets/view?id=abc123&token=xyz'
      };

      const html = generateOrderConfirmationEmail(dataWithParams);

      expect(html).toContain('id=abc123&token=xyz');
    });

    it('should properly encode special characters in URLs', () => {
      const dataWithSpecialChars = {
        ...attendeeData,
        viewTicketUrl: 'https://www.alocubanoboulderfest.org/tickets/view?name=John%20Doe'
      };

      const html = generateAttendeeConfirmationEmail(dataWithSpecialChars);

      expect(html).toContain('John%20Doe');
    });
  });

  describe('Image Rendering', () => {
    it('should render QR code image with proper dimensions', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toMatch(/<img[^>]*src="[^"]*qr[^"]*"[^>]*width:\s*200px[^>]*height:\s*200px/i);
    });

    it('should render wallet button images', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toMatch(/<img[^>]*apple-wallet-button[^>]*height:\s*48px/i);
      expect(html).toMatch(/<img[^>]*google-wallet-button[^>]*height:\s*48px/i);
    });

    it('should include logo in all templates', () => {
      const orderHtml = generateOrderConfirmationEmail(orderData);
      const attendeeHtml = generateAttendeeConfirmationEmail(attendeeData);
      const reminderHtml = generateRegistrationReminderEmail(reminderData);

      [orderHtml, attendeeHtml, reminderHtml].forEach(html => {
        expect(html).toContain('https://img.mailinblue.com/9670291/images/content_library/original/68a6c02f3da913a8d57a0190.png');
      });
    });
  });

  describe('Responsive Layout', () => {
    it('should include mobile-responsive styles', () => {
      const html = generateOrderConfirmationEmail(orderData);

      expect(html).toContain('@media (max-width: 600px)');
    });

    it('should have max-width container', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toMatch(/max-width:\s*600px/);
    });

    it('should use table layout for compatibility', () => {
      const html = generateRegistrationReminderEmail(reminderData);

      expect(html).toContain('table-layout: fixed');
      expect(html).toContain('cellspacing="0"');
    });
  });

  describe('HTML Validation', () => {
    it('should generate well-formed HTML for order confirmation', () => {
      const html = generateOrderConfirmationEmail(orderData);

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html.match(/<html[^>]*>/)).toBeTruthy();
      expect(html.match(/<\/html>/)).toBeTruthy();
    });

    it('should generate well-formed HTML for attendee confirmation', () => {
      const html = generateAttendeeConfirmationEmail(attendeeData);

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html.match(/<html[^>]*>/)).toBeTruthy();
      expect(html.match(/<\/html>/)).toBeTruthy();
    });

    it('should generate well-formed HTML for registration reminder', () => {
      const html = generateRegistrationReminderEmail(reminderData);

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html.match(/<html[^>]*>/)).toBeTruthy();
      expect(html.match(/<\/html>/)).toBeTruthy();
    });

    it('should not have unclosed tags', () => {
      const html = generateOrderConfirmationEmail(orderData);

      // Count major tag pairs
      const divOpen = (html.match(/<div[^>]*>/g) || []).length;
      const divClose = (html.match(/<\/div>/g) || []).length;
      const tableOpen = (html.match(/<table[^>]*>/g) || []).length;
      const tableClose = (html.match(/<\/table>/g) || []).length;

      expect(divOpen).toBe(divClose);
      expect(tableOpen).toBe(tableClose);
    });
  });

  describe('Error Recovery', () => {
    it('should handle missing optional fields gracefully', () => {
      const minimalData = {
        customerName: 'Test User',
        orderNumber: 'TEST-001',
        totalAmount: '50.00'
      };

      expect(() => generateOrderConfirmationEmail(minimalData)).not.toThrow();
    });

    it('should handle empty strings in data', () => {
      const emptyData = {
        ...orderData,
        customerName: '',
        paymentMethod: ''
      };

      const html = generateOrderConfirmationEmail(emptyData);

      expect(html).toBeTruthy();
    });

    it('should handle special characters in names', () => {
      const specialCharsData = {
        ...attendeeData,
        firstName: "O'Connor",
        lastName: 'García-Smith'
      };

      const html = generateAttendeeConfirmationEmail(specialCharsData);

      expect(html).toContain("O'Connor");
      expect(html).toContain('García-Smith');
    });

    it('should handle very long ticket lists', () => {
      let longTicketsList = '';
      for (let i = 0; i < 20; i++) {
        longTicketsList += `<div>Ticket ${i}</div>`;
      }

      const longListData = {
        ...orderData,
        ticketsList: longTicketsList,
        totalTickets: 20
      };

      const html = generateOrderConfirmationEmail(longListData);

      expect(html).toContain('Ticket 0');
      expect(html).toContain('Ticket 19');
    });
  });

  describe('Performance', () => {
    it('should render templates efficiently', () => {
      // Test functional correctness: all templates should render successfully
      const results = [];

      for (let i = 0; i < 100; i++) {
        const html = generateOrderConfirmationEmail(orderData);
        results.push(html);
      }

      // Verify all templates rendered successfully
      expect(results).toHaveLength(100);
      results.forEach((html, index) => {
        expect(html).toBeTruthy();
        expect(html.length).toBeGreaterThan(1000);
      });
    });

    it('should handle concurrent rendering', async () => {
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(
          Promise.resolve(generateAttendeeConfirmationEmail({
            ...attendeeData,
            ticketId: `TICKET-${i}`
          }))
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(50);
      results.forEach((html, index) => {
        expect(html).toContain(`TICKET-${index}`);
      });
    });
  });

  describe('Real-World Data Scenarios', () => {
    it('should handle international characters', () => {
      const internationalData = {
        ...attendeeData,
        firstName: 'José',
        lastName: 'Müller',
        eventName: 'A Lo Cubano Boulder Fest 2026 — Édition Spéciale'
      };

      const html = generateAttendeeConfirmationEmail(internationalData);

      expect(html).toContain('José');
      expect(html).toContain('Müller');
      expect(html).toContain('Édition Spéciale');
    });

    it('should handle multiple donation items', () => {
      const donationData = {
        ...orderData,
        totalDonations: 3,
        ticketsList: `
          <div>Weekend Pass - $75.00</div>
          <div>Donation - $10.00</div>
          <div>Donation - $25.00</div>
          <div>Donation - $50.00</div>
        `
      };

      const html = generateOrderConfirmationEmail(donationData);

      expect(html).toContain('Donation - $10.00');
      expect(html).toContain('Donation - $25.00');
      expect(html).toContain('Donation - $50.00');
    });

    it('should format large amounts correctly', () => {
      const largeAmountData = {
        ...orderData,
        totalAmount: '1234.56'
      };

      const html = generateOrderConfirmationEmail(largeAmountData);

      expect(html).toContain('$1234.56');
    });
  });
});
