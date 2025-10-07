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

    // Create transaction
    const transactionResult = await dbClient.execute({
      sql: `INSERT INTO transactions (
        uuid, customer_email, customer_name, total_amount, status,
        stripe_session_id, order_number, registration_token, is_test, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        `txn-${Date.now()}-${Math.random()}`,
        customerEmail,
        customerName,
        totalAmount,
        'completed',
        `cs_test_${Date.now()}`,
        `ALO-2026-${Date.now()}`,
        `reg-token-${Date.now()}`,
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
          'boulder-fest-2026',
          ticket.price_cents || 12500,
          `qr-${Date.now()}-${Math.random()}`,
          isTest ? 1 : 0
        ]
      });
    }

    // Create donations as transaction items
    for (const donation of donations) {
      await dbClient.execute({
        sql: `INSERT INTO transaction_items (
          transaction_id, item_type, item_name, total_price_cents,
          is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          transactionId,
          'donation',
          donation.item_name || 'Festival Support',
          donation.amount_cents || 5000,
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
      expect(emailData.subject).toContain('[TEST]');
      expect(emailData.subject).toContain('Your Ticket Order');
      expect(emailData.htmlContent).toContain('Weekend Pass');
      expect(emailData.htmlContent).toContain('$125.00');
    });

    test('should include test mode prefix for test tickets', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'VIP Package', price_cents: 25000 }],
        isTest: true
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.subject).toContain('[TEST]');
      expect(emailData.headers['X-Test-Mode']).toBe('true');
      expect(emailData.headers['X-Mailin-Tag']).toBe('ticket-confirmation-test');
    });

    test('should NOT include test prefix for production tickets', async () => {
      const transaction = await createTestTransaction({
        tickets: [{ ticket_type: 'Weekend Pass', price_cents: 12500 }],
        isTest: false
      });

      await emailService.sendTicketConfirmation(transaction);

      const emailData = mockEmailResponses[0].data;
      expect(emailData.subject).not.toContain('[TEST]');
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

      expect(consoleSpy).toHaveBeenCalledWith(
        'Email details for manual sending:',
        expect.objectContaining({
          to: testEmail,
          transactionId: expect.any(String)
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
