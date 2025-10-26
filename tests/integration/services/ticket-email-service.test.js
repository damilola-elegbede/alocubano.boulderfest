/**
 * Ticket Email Service Integration Tests
 * Tests the Brevo email service for ticket confirmation, reminders, and multi-item orders
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { generateTestEmail } from '../handler-test-helper.js';
import { getTicketEmailService } from '../../../lib/ticket-email-service-brevo.js';
import { getBrevoService, resetBrevoService } from '../../../lib/brevo-service.js';
import timeUtils from '../../../lib/time-utils.js';

describe('Ticket Email Service Integration', () => {
  let dbClient;
  let testEmail;
  let emailService;
  let brevoService;
  let mockEmailResponses = [];

  beforeEach(async () => {
    testEmail = generateTestEmail();
    dbClient = await getDbClient();
    emailService = getTicketEmailService();
    brevoService = getBrevoService();

    // Clear mock responses
    mockEmailResponses = [];

    // Mock Brevo API calls to capture email data without sending
    vi.spyOn(brevoService, 'makeRequest').mockImplementation(async (endpoint, options) => {
      const mockResponse = {
        messageId: `mock-message-${Date.now()}-${Math.random()}`,
        status: 'queued'
      };

      // Capture email for verification
      if (endpoint === '/smtp/email' && options.method === 'POST') {
        const emailData = JSON.parse(options.body);
        mockEmailResponses.push({
          endpoint,
          method: options.method,
          data: emailData,
          response: mockResponse
        });
      }

      return mockResponse;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to create test transaction with tickets
  async function createTestTransaction(config = {}) {
    const {
      tickets = [],
      donations = [],
      customerName = 'Test Customer',
      customerEmail = testEmail,
      isTest = true
    } = config;

    const totalAmount = [...tickets, ...donations].reduce(
      (sum, item) => sum + (item.price_cents || item.amount_cents || 0),
      0
    );

    // Create event first (required for tickets foreign key)
    const eventResult = await dbClient.execute({
      sql: `INSERT INTO events (
        slug, name, type, start_date, end_date, venue_name, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        'boulder-fest-2026',
        'A Lo Cubano Boulder Fest 2026',
        'festival',
        '2026-05-15',
        '2026-05-17',
        'Avalon Ballroom',
        'active'
      ]
    }).catch(() => {
      // Event might already exist, that's okay
      return { lastInsertRowid: null };
    });

    // Get event ID
    const eventLookup = await dbClient.execute({
      sql: 'SELECT id FROM events WHERE slug = ?',
      args: ['boulder-fest-2026']
    });
    const eventDbId = eventLookup.rows[0]?.id;

    // Create transaction
    const registrationToken = `reg-token-${Date.now()}`;
    const registrationTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days from now
    const transactionExternalId = `txn-${Date.now()}-${Math.random()}`;
    const orderData = JSON.stringify({
      tickets: tickets.map(t => ({ type: t.ticket_type, price: t.price_cents })),
      donations: donations.map(d => ({ name: d.item_name, amount: d.amount_cents }))
    });

    const transactionResult = await dbClient.execute({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, amount_cents, order_data, customer_email, customer_name,
        total_amount, status, stripe_session_id, order_number, registration_token,
        registration_token_expires, is_test, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        transactionExternalId,
        `uuid-${Date.now()}-${Math.random()}`,
        tickets.length > 0 ? 'tickets' : 'donation',
        totalAmount,
        orderData,
        customerEmail,
        customerName,
        totalAmount,
        'completed',
        `cs_test_${Date.now()}`,
        `ALO-2026-${Date.now()}`,
        registrationToken,
        registrationTokenExpires,
        isTest ? 1 : 0
      ]
    });

    const transactionId = Number(transactionResult.lastInsertRowid);

    // Create tickets
    for (const ticket of tickets) {
      await dbClient.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          qr_token, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          `ticket-${Date.now()}-${Math.random()}`,
          transactionId,
          ticket.ticket_type || 'Weekend Pass',
          eventDbId,
          ticket.price_cents || 12500,
          `qr-${Date.now()}-${Math.random()}`,
          isTest ? 1 : 0
        ]
      });
    }

    // Create donations as transaction items
    for (const donation of donations) {
      const donationAmount = donation.amount_cents || 5000;
      await dbClient.execute({
        sql: `INSERT INTO transaction_items (
          transaction_id, item_type, item_name, unit_price_cents, total_price_cents,
          is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          transactionId,
          'donation',
          donation.item_name || 'Festival Support',
          donationAmount,
          donationAmount,
          isTest ? 1 : 0
        ]
      });
    }

    // Fetch complete transaction
    const result = await dbClient.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    return result.rows[0];
  }

  describe('Single Ticket Confirmation', () => {
    test('should send confirmation for single ticket', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      const result = await emailService.sendTicketConfirmation(transaction);

      expect(result.success).toBe(true);
      expect(result.email).toBe(testEmail);
      expect(result.messageId).toBeDefined();
      expect(result.accessToken).toBeDefined();

      // Verify email was captured
      expect(mockEmailResponses).toHaveLength(1);
      const emailData = mockEmailResponses[0].data;

      expect(emailData.to[0].email).toBe(testEmail);
      // [TEST] prefix removed from subject lines per implementation update
      expect(emailData.subject).toContain('Your Ticket Order');
      expect(emailData.htmlContent).toContain('Weekend Pass');
      expect(emailData.htmlContent).toContain('$125.00');
    });

    test('should tag test tickets correctly in headers', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'VIP Package', price_cents: 25000 }],
        isTest: true
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      // [TEST] prefix removed from subject lines, but test mode tracked in headers
      expect(emailData.headers['X-Test-Mode']).toBe('true');
      expect(emailData.headers['X-Mailin-Tag']).toBe('ticket-confirmation-test');
    });

    test('should tag production tickets correctly in headers', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }],
        isTest: false
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      // Subject line should not contain [TEST] for production tickets
      expect(emailData.headers['X-Test-Mode']).toBe('false');
      expect(emailData.headers['X-Mailin-Tag']).toBe('ticket-confirmation');
    });
  });

  describe('Multiple Tickets Confirmation', () => {
    test('should send confirmation for 2 tickets', async () => {
      const transaction = await createTestTransaction({
        tickets: [
          { ticket_type: 'Weekend Pass', price_cents: 12500 },
          { ticket_type: 'VIP Package', price_cents: 25000 }
        ]
      });

      const result = await emailService.sendTicketConfirmation(transaction);

      expect(result.success).toBe(true);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('Weekend Pass');
      expect(emailData.htmlContent).toContain('VIP Package');
      expect(emailData.htmlContent).toContain('$125.00');
      expect(emailData.htmlContent).toContain('$250.00');
    });

    test('should send confirmation for 10 tickets', async () => {
      const tickets = Array.from({ length: 10 }, (_, i) => ({
        ticket_type: i % 2 === 0 ? 'Weekend Pass' : 'Single Day',
        price_cents: i % 2 === 0 ? 12500 : 5000
      }));

      const transaction = await createTestTransaction({ tickets });

      const result = await emailService.sendTicketConfirmation(transaction);

      expect(result.success).toBe(true);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('Weekend Pass');
      expect(emailData.htmlContent).toContain('Single Day');
    });
  });

  describe('Donations Only', () => {
    test('should send confirmation for single donation', async () => {
      const transaction = await createTestTransaction({
        donations: [{ item_name: 'Festival Support', amount_cents: 5000 }]
      });

      const result = await emailService.sendTicketConfirmation(transaction);

      expect(result.success).toBe(true);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('Festival Support');
      expect(emailData.htmlContent).toContain('$50.00');
      expect(emailData.htmlContent).toContain('generous donation');
    });

    test('should send confirmation for multiple donations', async () => {
      const transaction = await createTestTransaction({
        donations: [
          { item_name: 'Artist Fund', amount_cents: 10000 },
          { item_name: 'Venue Support', amount_cents: 7500 }
        ]
      });

      const result = await emailService.sendTicketConfirmation(transaction);

      expect(result.success).toBe(true);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('Artist Fund');
      expect(emailData.htmlContent).toContain('Venue Support');
      expect(emailData.htmlContent).toContain('$100.00');
      expect(emailData.htmlContent).toContain('$75.00');
    });
  });

  describe('Mixed Cart (Tickets + Donations)', () => {
    test('should send confirmation for mixed cart', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }],
        donations: [{ item_name: 'Festival Support', amount_cents: 5000 }]
      });

      const result = await emailService.sendTicketConfirmation(transaction);

      expect(result.success).toBe(true);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('Weekend Pass');
      expect(emailData.htmlContent).toContain('$125.00');
      expect(emailData.htmlContent).toContain('Festival Support');
      expect(emailData.htmlContent).toContain('$50.00');
    });

    test('should number items sequentially (tickets first, donations after)', async () => {
      const transaction = await createTestTransaction({
        tickets: [
          { ticket_type: 'Weekend Pass', price_cents: 12500 },
          { ticket_type: 'VIP Package', price_cents: 25000 }
        ],
        donations: [
          { item_name: 'Artist Fund', amount_cents: 10000 },
          { item_name: 'Venue Support', amount_cents: 5000 }
        ]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      const html = emailData.htmlContent;

      // Verify sequential numbering (tickets: 1-2, donations: 3-4)
      const badge1Index = html.indexOf('>1<');
      const badge2Index = html.indexOf('>2<');
      const badge3Index = html.indexOf('>3<');
      const badge4Index = html.indexOf('>4<');

      expect(badge1Index).toBeGreaterThan(0);
      expect(badge2Index).toBeGreaterThan(badge1Index);
      expect(badge3Index).toBeGreaterThan(badge2Index);
      expect(badge4Index).toBeGreaterThan(badge3Index);
    });
  });

  describe('QR Code Generation', () => {
    test('should generate QR token for ticket', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      const result = await emailService.sendTicketConfirmation(transaction);

      expect(result.success).toBe(true);

      // QR code generation happens during email formatting
      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toBeDefined();
    });
  });

  describe('Mountain Time Formatting', () => {
    test('should format dates in Mountain Time', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      const html = emailData.htmlContent;

      // Should contain Mountain Time timezone indicators
      expect(html).toMatch(/MST|MDT|MT/);
    });

    test('should format registration deadline in Mountain Time', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      const html = emailData.htmlContent;

      // Registration deadline should be in Mountain Time
      expect(html).toContain('Registration deadline:');
      expect(html).toMatch(/MST|MDT|MT/);
    });
  });

  describe('Payment Method Formatting', () => {
    test('should format Stripe card payment method', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      // Add card details
      await dbClient.execute({
        sql: `UPDATE transactions
              SET card_brand = ?, card_last4 = ?
              WHERE id = ?`,
        args: ['visa', '4242', transaction.id]
      });

      const updatedTxn = await dbClient.execute({
        sql: 'SELECT * FROM transactions WHERE id = ?',
        args: [transaction.id]
      });

      await emailService.sendTicketConfirmation(updatedTxn.rows[0]);

      const emailData = mockEmailResponses[0].data;
      const html = emailData.htmlContent;

      expect(html).toContain('Visa');
      expect(html).toContain('••4242');
    });

    test('should format Apple Pay payment method', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await dbClient.execute({
        sql: `UPDATE transactions
              SET payment_wallet = ?, card_brand = ?, card_last4 = ?
              WHERE id = ?`,
        args: ['apple_pay', 'visa', '4242', transaction.id]
      });

      const updatedTxn = await dbClient.execute({
        sql: 'SELECT * FROM transactions WHERE id = ?',
        args: [transaction.id]
      });

      await emailService.sendTicketConfirmation(updatedTxn.rows[0]);

      const emailData = mockEmailResponses[0].data;
      const html = emailData.htmlContent;

      expect(html).toContain('Apple Pay');
    });

    test('should format Google Pay payment method', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await dbClient.execute({
        sql: `UPDATE transactions
              SET payment_wallet = ?, card_brand = ?, card_last4 = ?
              WHERE id = ?`,
        args: ['google_pay', 'mastercard', '5555', transaction.id]
      });

      const updatedTxn = await dbClient.execute({
        sql: 'SELECT * FROM transactions WHERE id = ?',
        args: [transaction.id]
      });

      await emailService.sendTicketConfirmation(updatedTxn.rows[0]);

      const emailData = mockEmailResponses[0].data;
      const html = emailData.htmlContent;

      expect(html).toContain('Google Pay');
      expect(html).toContain('Mastercard');
    });
  });

  describe('Error Handling', () => {
    test('should handle empty transaction (no tickets or donations)', async () => {
      const transaction = await createTestTransaction({ tickets: [], donations: [] });

      await expect(
        emailService.sendTicketConfirmation(transaction)
      ).rejects.toThrow('No tickets or donations found');
    });

    test('should handle Brevo API failure gracefully', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      // Mock API failure
      brevoService.makeRequest.mockRejectedValueOnce(new Error('Brevo API error'));

      await expect(
        emailService.sendTicketConfirmation(transaction)
      ).rejects.toThrow('Brevo API error');
    });

    test('should log email details on failure for manual sending', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      brevoService.makeRequest.mockRejectedValueOnce(new Error('API timeout'));

      try {
        await emailService.sendTicketConfirmation(transaction);
      } catch (error) {
        // Expected to fail
      }

      // Calculate expected masked email format: first 2 chars + '***@' + domain
      // Example: "test.123.abc@example.com" -> "te***@example.com"
      const expectedMaskedEmail = testEmail.slice(0, 2) + '***@' + testEmail.split('@')[1];

      expect(consoleSpy).toHaveBeenCalledWith(
        '📧 [TicketEmail] Email details for manual sending:',
        expect.objectContaining({
          to: expectedMaskedEmail, // Validate exact masked format to catch email logging bugs
          transactionId: expect.any(String),
          ticketCount: 1 // Exact count validation - we created 1 ticket
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Email Content Validation', () => {
    test('should include customer name in email', async () => {
      const transaction = await createTestTransaction({
        customerName: 'John Doe',
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('John Doe');
    });

    test('should include order number in email', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain(transaction.order_number);
    });

    test('should include total amount in email', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('$125.00');
    });

    test('should include registration URL in email', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.htmlContent).toContain('/register-tickets?token=');
    });
  });

  describe('Template Variable Interpolation', () => {
    test('should correctly interpolate all template variables', async () => {
      const transaction = await createTestTransaction({
        customerName: 'Jane Smith',
        customerEmail: testEmail,
        tickets: [
          { ticket_type: 'Weekend Pass', price_cents: 12500 },
          { ticket_type: 'VIP Package', price_cents: 25000 }
        ],
        donations: [
          { item_name: 'Artist Fund', amount_cents: 5000 }
        ]
      });

      await emailService.sendTicketConfirmation(transaction);

      expect(mockEmailResponses).toHaveLength(1);
      const emailData = mockEmailResponses[0].data;
      const htmlContent = emailData.htmlContent;

      // Verify customer details interpolation
      expect(htmlContent).toContain('Jane Smith');
      expect(htmlContent).toContain(testEmail);

      // Verify order details interpolation
      expect(htmlContent).toContain(transaction.order_number);

      // Verify ticket details interpolation
      expect(htmlContent).toContain('Weekend Pass');
      expect(htmlContent).toContain('VIP Package');
      expect(htmlContent).toContain('$125.00');
      expect(htmlContent).toContain('$250.00');

      // Verify donation details interpolation
      expect(htmlContent).toContain('Artist Fund');
      expect(htmlContent).toContain('$50.00');

      // Verify total amount interpolation
      expect(htmlContent).toContain('$425.00');

      // Verify registration token interpolation
      expect(htmlContent).toContain(transaction.registration_token);
    });

    test('should interpolate special characters correctly', async () => {
      const transaction = await createTestTransaction({
        customerName: "O'Connor & Associates",
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      const htmlContent = emailData.htmlContent;

      // Verify special characters are preserved
      expect(htmlContent).toContain("O'Connor & Associates");
    });

    test('should interpolate numeric values with proper formatting', async () => {
      const transaction = await createTestTransaction({
        tickets: [
          { ticket_type: 'Weekend Pass', price_cents: 12500 },
          { ticket_type: 'Single Day', price_cents: 5000 }
        ]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      const htmlContent = emailData.htmlContent;

      // Verify currency formatting
      expect(htmlContent).toContain('$125.00');
      expect(htmlContent).toContain('$50.00');
      expect(htmlContent).toContain('$175.00'); // Total

      // Should NOT contain unformatted cents values
      expect(htmlContent).not.toContain('12500');
      expect(htmlContent).not.toContain('5000');
    });

    test('should interpolate dates in Mountain Time format', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      const htmlContent = emailData.htmlContent;

      // Verify Mountain Time timezone is present
      expect(htmlContent).toMatch(/MST|MDT|MT/);

      // Verify date format is human-readable
      expect(htmlContent).toMatch(/\w+\s+\d{1,2},\s+\d{4}/); // e.g., "Jan 15, 2026"
    });

    test('should interpolate empty or missing optional fields gracefully', async () => {
      const transaction = await createTestTransaction({
        customerName: 'Test User',
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      // Remove card details (optional fields)
      await dbClient.execute({
        sql: `UPDATE transactions
              SET card_brand = NULL, card_last4 = NULL, payment_wallet = NULL
              WHERE id = ?`,
        args: [transaction.id]
      });

      const updatedTxn = await dbClient.execute({
        sql: 'SELECT * FROM transactions WHERE id = ?',
        args: [transaction.id]
      });

      await emailService.sendTicketConfirmation(updatedTxn.rows[0]);

      const emailData = mockEmailResponses[0].data;
      const htmlContent = emailData.htmlContent;

      // Email should still be valid without optional fields
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain('Test User');
      expect(htmlContent).toContain('Weekend Pass');

      // Should not contain undefined or null text
      expect(htmlContent).not.toContain('undefined');
      expect(htmlContent).not.toContain('null');
    });

    test('should interpolate multiple items with correct sequential numbering', async () => {
      const transaction = await createTestTransaction({
        tickets: [
          { ticket_type: 'Ticket A', price_cents: 10000 },
          { ticket_type: 'Ticket B', price_cents: 20000 },
          { ticket_type: 'Ticket C', price_cents: 30000 }
        ],
        donations: [
          { item_name: 'Donation X', amount_cents: 5000 },
          { item_name: 'Donation Y', amount_cents: 7500 }
        ]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      const htmlContent = emailData.htmlContent;

      // Verify all items are present
      expect(htmlContent).toContain('Ticket A');
      expect(htmlContent).toContain('Ticket B');
      expect(htmlContent).toContain('Ticket C');
      expect(htmlContent).toContain('Donation X');
      expect(htmlContent).toContain('Donation Y');

      // Verify sequential numbering (1-5)
      for (let i = 1; i <= 5; i++) {
        expect(htmlContent).toContain(`>${i}<`);
      }
    });
  });

  describe('Email Headers', () => {
    test('should include transaction ID in headers', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.headers['X-Transaction-ID']).toBe(transaction.uuid);
    });

    test('should include payment processor in headers', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }]
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.headers['X-Payment-Processor']).toBe('stripe');
    });

    test('should tag test emails correctly', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }],
        isTest: true
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.headers['X-Mailin-Tag']).toBe('ticket-confirmation-test');
      expect(emailData.headers['X-Test-Mode']).toBe('true');
    });
  });
});
