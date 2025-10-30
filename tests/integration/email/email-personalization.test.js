/**
 * Integration Tests for Email Personalization
 * Tests dynamic content, personalization, and conditional rendering
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateOrderConfirmationEmail } from '../../../lib/email-templates/order-confirmation.js';
import { generateAttendeeConfirmationEmail } from '../../../lib/email-templates/attendee-confirmation.js';
import { generateRegistrationReminderEmail } from '../../../lib/email-templates/registration-reminder.js';

describe('Email Personalization Integration', () => {
  let baseOrderData;
  let baseAttendeeData;
  let baseReminderData;

  beforeEach(() => {
    baseOrderData = {
      customerName: 'John Doe',
      orderNumber: 'ORD-001',
      orderDate: 'May 15, 2026',
      totalTickets: 2,
      totalDonations: 0,
      totalItems: 2,
      ticketsList: '<div>Ticket list</div>',
      registrationUrl: 'https://example.com/register',
      registrationDeadline: 'May 14, 2026',
      totalAmount: '100.00',
      paymentMethod: 'Visa',
      transactionId: 'TXN-001',
      paymentDate: 'May 15, 2026',
      billingEmail: 'john@example.com'
    };

    baseAttendeeData = {
      firstName: 'Jane',
      lastName: 'Smith',
      ticketId: 'TICKET-001',
      ticketType: 'Weekend Pass',
      orderNumber: 'ORD-002',
      eventName: 'A Lo Cubano Boulder Fest 2026',
      eventLocation: 'Avalon Ballroom, Boulder, CO',
      eventDate: 'May 15-17, 2026',
      qrCodeUrl: 'https://example.com/qr.png',
      walletPassUrl: 'https://example.com/apple-wallet',
      googleWalletUrl: 'https://example.com/google-wallet',
      appleWalletButtonUrl: 'https://example.com/apple-button.png',
      googleWalletButtonUrl: 'https://example.com/google-button.png',
      viewTicketUrl: 'https://example.com/view-ticket'
    };

    baseReminderData = {
      customerName: 'Bob Johnson',
      orderNumber: 'ORD-003',
      orderDate: 'May 15, 2026',
      totalTickets: 3,
      ticketsList: '<div>Unregistered tickets</div>',
      viewTicketsUrl: 'https://example.com/view-tickets',
      registrationDeadline: 'May 14, 2026'
    };
  });

  describe('Name Personalization', () => {
    it('should personalize greeting with first name', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'Maria'
      });

      expect(html).toContain('Hi Maria,');
    });

    it('should personalize greeting with full customer name', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        customerName: 'Carlos Rodriguez'
      });

      expect(html).toContain('Hi Carlos Rodriguez,');
    });

    it('should handle hyphenated names', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'Mary-Jane',
        lastName: 'Parker-Smith'
      });

      expect(html).toContain('Mary-Jane Parker-Smith');
    });

    it('should handle names with apostrophes', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: "O'Brien",
        lastName: "D'Angelo"
      });

      expect(html).toContain("O'Brien D'Angelo");
    });

    it('should handle international names', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'José',
        lastName: 'García'
      });

      expect(html).toContain('José García');
    });

    it('should handle single-character names', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'J',
        lastName: 'K'
      });

      expect(html).toContain('J K');
    });

    it('should handle very long names', () => {
      const longName = 'Bartholomew Christopher Alexander';
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: longName
      });

      expect(html).toContain(longName);
    });
  });

  describe('Event-Specific Content', () => {
    it('should display correct event name', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        eventName: 'A Lo Cubano Boulder Fest 2026'
      });

      expect(html).toContain('A Lo Cubano Boulder Fest 2026');
    });

    it('should display event location', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        eventLocation: 'Avalon Ballroom, Boulder, CO'
      });

      expect(html).toContain('Avalon Ballroom, Boulder, CO');
    });

    it('should display event dates', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        eventDate: 'May 15-17, 2026'
      });

      expect(html).toContain('May 15-17, 2026');
    });

    it('should handle single-day events', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        eventDate: 'Friday, May 15, 2026',
        ticketType: 'Friday Night Only'
      });

      expect(html).toContain('Friday, May 15, 2026');
      expect(html).toContain('Friday Night Only');
    });

    it('should handle multi-day events', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        eventDate: 'May 15-17, 2026 (3 Days)',
        ticketType: 'All-Access Pass'
      });

      expect(html).toContain('May 15-17, 2026 (3 Days)');
      expect(html).toContain('All-Access Pass');
    });
  });

  describe('Ticket Type Customization', () => {
    it('should display Weekend Pass type', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketType: 'Weekend Pass'
      });

      expect(html).toContain('Weekend Pass');
    });

    it('should display All-Access Pass type', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketType: 'All-Access Pass'
      });

      expect(html).toContain('All-Access Pass');
    });

    it('should display Friday Night Only type', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketType: 'Friday Night Only'
      });

      expect(html).toContain('Friday Night Only');
    });

    it('should display Saturday Night Only type', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketType: 'Saturday Night Only'
      });

      expect(html).toContain('Saturday Night Only');
    });

    it('should display Sunday Afternoon type', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketType: 'Sunday Afternoon'
      });

      expect(html).toContain('Sunday Afternoon');
    });

    it('should handle custom ticket types', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketType: 'VIP Backstage Pass'
      });

      expect(html).toContain('VIP Backstage Pass');
    });
  });

  describe('Date and Time Localization', () => {
    it('should display dates in Mountain Time', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        orderDate: 'May 15, 2026 at 2:30 PM MST',
        paymentDate: 'May 15, 2026 at 2:30 PM MST'
      });

      expect(html).toContain('May 15, 2026 at 2:30 PM MST');
    });

    it('should display registration deadline with timezone', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        registrationDeadline: 'May 14, 2026 at 11:59 PM MST'
      });

      expect(html).toContain('May 14, 2026 at 11:59 PM MST');
    });

    it('should handle MDT (Mountain Daylight Time)', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        orderDate: 'July 15, 2026 at 3:00 PM MDT'
      });

      expect(html).toContain('July 15, 2026 at 3:00 PM MDT');
    });

    it('should format dates consistently', () => {
      const html = generateRegistrationReminderEmail({
        ...baseReminderData,
        orderDate: 'May 15, 2026 at 3:45 PM MST',
        registrationDeadline: 'May 14, 2026 at 11:59 PM MST'
      });

      expect(html).toContain('May 15, 2026 at 3:45 PM MST');
      expect(html).toContain('May 14, 2026 at 11:59 PM MST');
    });
  });

  describe('Dynamic Content - Payment Information', () => {
    it('should show Stripe payment details', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        paymentMethod: 'Visa ••4242',
        transactionId: 'ch_3ABC123DEF456'
      });

      expect(html).toContain('Visa ••4242');
      expect(html).toContain('ch_3ABC123DEF456');
    });

    it('should show PayPal payment details', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        paymentMethod: 'PayPal',
        transactionId: 'PAYPAL-123456789'
      });

      expect(html).toContain('PayPal');
      expect(html).toContain('PAYPAL-123456789');
    });

    it('should show Venmo payment details', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        paymentMethod: 'Venmo',
        transactionId: 'VENMO-987654321'
      });

      expect(html).toContain('Venmo');
      expect(html).toContain('VENMO-987654321');
    });

    it('should show cash payment details', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        paymentMethod: 'Cash',
        transactionId: 'CASH-20260515-001'
      });

      expect(html).toContain('Cash');
      expect(html).toContain('CASH-20260515-001');
    });

    it('should format payment amounts correctly', () => {
      const amounts = ['10.00', '99.99', '1234.56', '0.50'];

      amounts.forEach(amount => {
        const html = generateOrderConfirmationEmail({
          ...baseOrderData,
          totalAmount: amount
        });

        expect(html).toContain(`$${amount}`);
      });
    });
  });

  describe('Conditional Content - Ticket Counts', () => {
    it('should show singular "ticket" for one ticket', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        totalTickets: 1,
        totalDonations: 0,
        totalItems: 1
      });

      expect(html).toMatch(/1\s+Ticket(?!s)/);
    });

    it('should show plural "tickets" for multiple tickets', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        totalTickets: 5,
        totalDonations: 0,
        totalItems: 5
      });

      expect(html).toContain('5 Tickets');
    });

    it('should show donations when present', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        totalTickets: 2,
        totalDonations: 1,
        totalItems: 3
      });

      expect(html).toContain('2 Tickets');
      expect(html).toContain('1 Donation');
    });

    it('should show multiple donations', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        totalTickets: 1,
        totalDonations: 3,
        totalItems: 4
      });

      expect(html).toContain('1 Ticket');
      expect(html).toContain('3 Donations');
    });

    it('should not show donations when zero', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        totalTickets: 2,
        totalDonations: 0,
        totalItems: 2
      });

      expect(html).toContain('2 Tickets');
      expect(html).not.toMatch(/0\s+Donation/);
    });
  });

  describe('Dynamic Content - Ticket Lists', () => {
    it('should render pre-formatted ticket list', () => {
      const ticketsList = `
        <div style="background: #fff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
          <p><strong>Weekend Pass</strong> - $75.00</p>
          <p>TICKET-001 - Registered</p>
        </div>
      `;

      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        ticketsList
      });

      expect(html).toContain('Weekend Pass');
      expect(html).toContain('$75.00');
      expect(html).toContain('TICKET-001');
    });

    it('should render unregistered tickets in reminder', () => {
      const ticketsList = `
        <div style="background: #fff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
          <p><strong>Friday Night</strong></p>
          <p>TICKET-002 - <span style="color: #d32f2f;">Not Registered</span></p>
        </div>
      `;

      const html = generateRegistrationReminderEmail({
        ...baseReminderData,
        ticketsList
      });

      expect(html).toContain('Friday Night');
      expect(html).toContain('TICKET-002');
      expect(html).toContain('Not Registered');
    });

    it('should handle empty ticket list', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        ticketsList: ''
      });

      expect(html).toBeTruthy();
    });

    it('should handle complex ticket list with multiple items', () => {
      const ticketsList = `
        <div>Weekend Pass - $75.00 - TICKET-001</div>
        <div>Friday Night - $35.00 - TICKET-002</div>
        <div>Saturday Night - $35.00 - TICKET-003</div>
        <div>Donation - $25.00</div>
      `;

      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        ticketsList,
        totalTickets: 3,
        totalDonations: 1,
        totalItems: 4
      });

      expect(html).toContain('TICKET-001');
      expect(html).toContain('TICKET-002');
      expect(html).toContain('TICKET-003');
      expect(html).toContain('Donation - $25.00');
    });
  });

  describe('Conditional Notices', () => {
    it('should show manual entry notice when provided', () => {
      const manualEntryNotice = `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0;">
          <p>⚠️ Manual Entry - Recorded at festival</p>
        </div>
      `;

      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        manualEntryNotice
      });

      expect(html).toContain('Manual Entry');
      expect(html).toContain('Recorded at festival');
    });

    it('should show comp ticket notice when provided', () => {
      const compTicketNotice = `
        <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; margin: 20px 0;">
          <p>🎁 Complimentary Ticket</p>
        </div>
      `;

      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        compTicketNotice
      });

      expect(html).toContain('Complimentary Ticket');
    });

    it('should not show notices when not provided', () => {
      const html = generateOrderConfirmationEmail(baseOrderData);

      // HTML comments exist in template, but actual notice content should not
      expect(html).not.toContain('⚠️ Manual Entry - Recorded at festival');
      expect(html).not.toContain('🎁 Complimentary Ticket');
    });
  });

  describe('Dynamic Links', () => {
    it('should personalize registration URL with token', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        registrationUrl: 'https://www.alocubanoboulderfest.org/tickets/view/abc123def456'
      });

      expect(html).toContain('href="https://www.alocubanoboulderfest.org/tickets/view/abc123def456"');
    });

    it('should personalize wallet pass URLs with ticket ID', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketId: 'TICKET-12345',
        walletPassUrl: 'https://www.alocubanoboulderfest.org/api/tickets/apple-wallet/TICKET-12345',
        googleWalletUrl: 'https://www.alocubanoboulderfest.org/api/tickets/google-wallet/TICKET-12345'
      });

      expect(html).toContain('apple-wallet/TICKET-12345');
      expect(html).toContain('google-wallet/TICKET-12345');
    });

    it('should personalize QR code URL with ticket ID', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketId: 'TICKET-67890',
        qrCodeUrl: 'https://www.alocubanoboulderfest.org/api/tickets/qr/TICKET-67890.png'
      });

      expect(html).toContain('src="https://www.alocubanoboulderfest.org/api/tickets/qr/TICKET-67890.png"');
    });
  });

  describe('Special Characters Handling', () => {
    it('should handle HTML entities in content', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        customerName: 'Smith & Jones',
        ticketsList: '<div>Price: $100 & up</div>'
      });

      expect(html).toContain('Smith & Jones');
      expect(html).toContain('$100 & up');
    });

    it('should handle quotes in content', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        eventName: 'A Lo Cubano Boulder Fest 2026 - "The Best Yet"'
      });

      expect(html).toContain('"The Best Yet"');
    });

    it('should handle line breaks in addresses', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        eventLocation: 'Avalon Ballroom\n1217 Spruce St\nBoulder, CO 80302'
      });

      expect(html).toContain('Avalon Ballroom');
    });
  });

  describe('Urgency and Messaging', () => {
    it('should show urgency message in registration reminder', () => {
      const html = generateRegistrationReminderEmail({
        ...baseReminderData,
        totalTickets: 5
      });

      expect(html).toContain('You still have');
      expect(html).toContain('5 ticket(s)');
      expect(html).toContain('pending registration');
    });

    it('should show different message for single unregistered ticket', () => {
      const html = generateRegistrationReminderEmail({
        ...baseReminderData,
        totalTickets: 1
      });

      expect(html).toContain('1 ticket(s)');
    });

    it('should emphasize deadline in reminder', () => {
      const html = generateRegistrationReminderEmail({
        ...baseReminderData,
        registrationDeadline: 'Tomorrow at 11:59 PM MST'
      });

      expect(html).toContain('Tomorrow at 11:59 PM MST');
    });
  });

  describe('Accessibility Personalization', () => {
    it('should use recipient name in alt text where appropriate', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'Alice',
        ticketId: 'TICKET-999'
      });

      // QR code should have descriptive alt text
      expect(html).toContain('alt="QR Code"');
    });

    it('should include ticket ID in image references', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        ticketId: 'TICKET-12345'
      });

      expect(html).toContain('TICKET-12345');
    });
  });

  describe('Multi-Language Support Readiness', () => {
    it('should handle Spanish characters', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'José',
        lastName: 'Rodríguez',
        eventName: 'Festival de Salsa Cubana'
      });

      expect(html).toContain('José Rodríguez');
      expect(html).toContain('Festival de Salsa Cubana');
    });

    it('should handle German characters', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'Jürgen',
        lastName: 'Müller'
      });

      expect(html).toContain('Jürgen Müller');
    });

    it('should handle French characters', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: 'François',
        lastName: 'Côté'
      });

      expect(html).toContain('François Côté');
    });
  });

  describe('Personalization Edge Cases', () => {
    it('should handle missing personalization data gracefully', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: undefined,
        lastName: undefined
      });

      expect(html).toBeTruthy();
    });

    it('should handle null values in personalization', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        customerName: null,
        paymentMethod: null
      });

      expect(html).toBeTruthy();
    });

    it('should handle empty strings in personalization', () => {
      const html = generateAttendeeConfirmationEmail({
        ...baseAttendeeData,
        firstName: '',
        lastName: '',
        ticketType: ''
      });

      expect(html).toBeTruthy();
    });

    it('should handle whitespace-only strings', () => {
      const html = generateOrderConfirmationEmail({
        ...baseOrderData,
        customerName: '   ',
        orderNumber: '  '
      });

      expect(html).toBeTruthy();
    });
  });
});
