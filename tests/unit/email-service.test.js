/**
 * Unit tests for Email Service
 * Tests email functionality with mocked SendGrid
 */

import { jest } from '@jest/globals';
import { 
  createMockSendGrid, 
  mockSendGridResponses,
  mockEmailTemplates,
  mockSendGridWebhookEvents 
} from '../mocks/sendgrid.js';
import { 
  createTestOrder,
  cleanTestData,
  insertTestData 
} from '../config/testDatabase.js';

// Mock SendGrid
jest.unstable_mockModule('@sendgrid/mail', () => createMockSendGrid());

// Import email service after mocking
const emailService = await import('../../api/lib/email-service.js');

describe('Email Service', () => {
  let mockSendGrid;
  let testOrder;

  beforeEach(async () => {
    await cleanTestData();
    await insertTestData();
    
    mockSendGrid = createMockSendGrid();
    testOrder = await createTestOrder({
      customer_email: 'test@example.com',
      customer_name: 'Test Customer',
      total_amount: 30000
    });
    
    jest.clearAllMocks();
  });

  describe('Email Configuration', () => {
    test('initializes SendGrid with API key', () => {
      expect(mockSendGrid.setApiKey).toHaveBeenCalledWith(
        process.env.SENDGRID_API_KEY
      );
    });

    test('validates required environment variables', () => {
      const originalApiKey = process.env.SENDGRID_API_KEY;
      delete process.env.SENDGRID_API_KEY;
      
      expect(() => emailService.validateEmailConfig()).toThrow(
        'SendGrid API key is required'
      );
      
      process.env.SENDGRID_API_KEY = originalApiKey;
    });

    test('validates email templates configuration', () => {
      expect(emailService.validateTemplateConfig()).toBe(true);
      
      // Should have required templates
      const config = emailService.getTemplateConfig();
      expect(config.paymentConfirmation).toBeDefined();
      expect(config.paymentFailed).toBeDefined();
      expect(config.refundConfirmation).toBeDefined();
    });
  });

  describe('Payment Confirmation Emails', () => {
    test('sends payment confirmation email successfully', async () => {
      mockSendGrid.simulateSuccess();
      
      const result = await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: [
          {
            ticket_type: 'full-festival',
            quantity: 1,
            unit_price: 30000,
            total_price: 30000
          }
        ]
      });
      
      expect(result.success).toBe(true);
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          from: expect.objectContaining({
            email: 'alocubanoboulderfest@gmail.com',
            name: 'A Lo Cubano Boulder Fest'
          }),
          templateId: expect.any(String),
          dynamicTemplateData: expect.objectContaining({
            customer_name: 'Test Customer',
            order_number: expect.any(String),
            total_amount: '$300.00',
            event_name: 'A Lo Cubano Boulder Fest 2026',
            ticket_details: expect.arrayContaining([
              expect.objectContaining({
                name: expect.stringContaining('Full Festival Pass'),
                quantity: 1,
                price: '$300.00'
              })
            ])
          })
        })
      );
    });

    test('includes all order items in confirmation email', async () => {
      mockSendGrid.simulateSuccess();
      
      const orderItems = [
        {
          ticket_type: 'full-festival',
          quantity: 2,
          unit_price: 30000,
          total_price: 60000
        },
        {
          ticket_type: 'workshop-only',
          quantity: 1,
          unit_price: 15000,
          total_price: 15000
        }
      ];
      
      await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: orderItems
      });
      
      const emailCall = mockSendGrid.send.mock.calls[0][0];
      const ticketDetails = emailCall.dynamicTemplateData.ticket_details;
      
      expect(ticketDetails).toHaveLength(2);
      expect(ticketDetails[0]).toMatchObject({
        name: expect.stringContaining('Full Festival Pass'),
        quantity: 2,
        price: '$600.00'
      });
      expect(ticketDetails[1]).toMatchObject({
        name: expect.stringContaining('Workshop Only Pass'),
        quantity: 1,
        price: '$150.00'
      });
    });

    test('formats currency correctly in confirmation emails', async () => {
      mockSendGrid.simulateSuccess();
      
      await emailService.sendPaymentConfirmation({
        order: { ...testOrder, total_amount: 125000 }, // $1,250.00
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: [
          {
            ticket_type: 'full-festival',
            quantity: 4,
            unit_price: 30000,
            total_price: 120000
          }
        ]
      });
      
      const emailCall = mockSendGrid.send.mock.calls[0][0];
      expect(emailCall.dynamicTemplateData.total_amount).toBe('$1,250.00');
    });

    test('handles email sending failures gracefully', async () => {
      mockSendGrid.simulateFailure();
      
      const result = await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'invalid@example.com',
        customerName: 'Test Customer',
        orderItems: []
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not contain a valid address');
    });

    test('retries failed email sending with exponential backoff', async () => {
      // Simulate failure then success
      mockSendGrid.simulateFailure();
      mockSendGrid.simulateFailure();
      mockSendGrid.simulateSuccess();
      
      const result = await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: []
      }, { retries: 3 });
      
      expect(result.success).toBe(true);
      expect(mockSendGrid.send).toHaveBeenCalledTimes(3);
    });
  });

  describe('Payment Failed Emails', () => {
    test('sends payment failed email with retry information', async () => {
      mockSendGrid.simulateSuccess();
      
      const result = await emailService.sendPaymentFailed({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        failureReason: 'Your card was declined.',
        retryUrl: 'https://alocubanoboulderfest.com/tickets?retry=ORD-123'
      });
      
      expect(result.success).toBe(true);
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          templateId: expect.any(String),
          dynamicTemplateData: expect.objectContaining({
            customer_name: 'Test Customer',
            failure_reason: 'Your card was declined.',
            retry_url: 'https://alocubanoboulderfest.com/tickets?retry=ORD-123',
            support_email: 'alocubanoboulderfest@gmail.com'
          })
        })
      );
    });

    test('includes helpful retry instructions in failed payment emails', async () => {
      mockSendGrid.simulateSuccess();
      
      await emailService.sendPaymentFailed({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        failureReason: 'insufficient_funds'
      });
      
      const emailCall = mockSendGrid.send.mock.calls[0][0];
      const emailData = emailCall.dynamicTemplateData;
      
      expect(emailData.retry_instructions).toContain('try a different payment method');
      expect(emailData.expiration_warning).toContain('24 hours');
    });
  });

  describe('Refund Confirmation Emails', () => {
    test('sends refund confirmation email', async () => {
      mockSendGrid.simulateSuccess();
      
      const result = await emailService.sendRefundConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        refundAmount: 30000,
        processingTime: '5-10 business days'
      });
      
      expect(result.success).toBe(true);
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          templateId: expect.any(String),
          dynamicTemplateData: expect.objectContaining({
            customer_name: 'Test Customer',
            refund_amount: '$300.00',
            processing_time: '5-10 business days',
            original_order_number: expect.any(String)
          })
        })
      );
    });

    test('includes refund policy information', async () => {
      mockSendGrid.simulateSuccess();
      
      await emailService.sendRefundConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        refundAmount: 24000, // Partial refund
        processingTime: '5-10 business days'
      });
      
      const emailCall = mockSendGrid.send.mock.calls[0][0];
      const emailData = emailCall.dynamicTemplateData;
      
      expect(emailData.refund_policy).toContain('processing fee');
      expect(emailData.refund_amount).toBe('$240.00');
    });
  });

  describe('Bulk Email Operations', () => {
    test('sends bulk confirmation emails efficiently', async () => {
      mockSendGrid.simulateSuccess();
      
      const orders = await Promise.all(
        Array(10).fill().map((_, index) =>
          createTestOrder({
            customer_email: `bulk${index}@example.com`,
            customer_name: `Bulk Customer ${index}`,
            stripe_session_id: `cs_test_bulk_${index}`
          })
        )
      );
      
      const emailData = orders.map(order => ({
        order,
        customerEmail: order.customer_email,
        customerName: order.customer_name,
        orderItems: [
          {
            ticket_type: 'full-festival',
            quantity: 1,
            unit_price: 30000,
            total_price: 30000
          }
        ]
      }));
      
      const start = performance.now();
      const results = await emailService.sendBulkPaymentConfirmations(emailData);
      const duration = performance.now() - start;
      
      expect(results.successCount).toBe(10);
      expect(results.failureCount).toBe(0);
      expect(duration).toBeLessThan(2000); // 2 seconds for 10 emails
    });

    test('handles partial failures in bulk email sending', async () => {
      const orders = await Promise.all([
        createTestOrder({ 
          customer_email: 'valid1@example.com',
          stripe_session_id: 'cs_test_valid_1'
        }),
        createTestOrder({ 
          customer_email: 'invalid@',
          stripe_session_id: 'cs_test_invalid'
        }),
        createTestOrder({ 
          customer_email: 'valid2@example.com',
          stripe_session_id: 'cs_test_valid_2'
        })
      ]);
      
      // Mock mixed responses
      mockSendGrid.simulateSuccess();
      mockSendGrid.simulateFailure();
      mockSendGrid.simulateSuccess();
      
      const emailData = orders.map(order => ({
        order,
        customerEmail: order.customer_email,
        customerName: order.customer_name,
        orderItems: []
      }));
      
      const results = await emailService.sendBulkPaymentConfirmations(emailData);
      
      expect(results.successCount).toBe(2);
      expect(results.failureCount).toBe(1);
      expect(results.failures).toHaveLength(1);
      expect(results.failures[0].email).toBe('invalid@');
    });
  });

  describe('Email Templates', () => {
    test('validates template data before sending', async () => {
      await expect(
        emailService.sendPaymentConfirmation({
          order: null, // Invalid order
          customerEmail: 'test@example.com',
          orderItems: []
        })
      ).rejects.toThrow('Order data is required');
      
      await expect(
        emailService.sendPaymentConfirmation({
          order: testOrder,
          customerEmail: '', // Invalid email
          orderItems: []
        })
      ).rejects.toThrow('Customer email is required');
    });

    test('sanitizes template data to prevent injection', async () => {
      mockSendGrid.simulateSuccess();
      
      await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test <script>alert("xss")</script> Customer',
        orderItems: []
      });
      
      const emailCall = mockSendGrid.send.mock.calls[0][0];
      expect(emailCall.dynamicTemplateData.customer_name).toBe('Test  Customer');
    });

    test('includes proper unsubscribe links', async () => {
      mockSendGrid.simulateSuccess();
      
      await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: []
      });
      
      const emailCall = mockSendGrid.send.mock.calls[0][0];
      expect(emailCall.dynamicTemplateData.unsubscribe_url).toMatch(
        /^https:\/\/alocubanoboulderfest\.com\/unsubscribe\?token=/
      );
    });
  });

  describe('Email Rate Limiting', () => {
    test('handles SendGrid rate limiting gracefully', async () => {
      mockSendGrid.simulateRateLimit();
      
      const result = await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: []
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.retryAfter).toBe(60); // seconds
    });

    test('implements exponential backoff for rate limiting', async () => {
      // Simulate rate limit then success
      mockSendGrid.simulateRateLimit();
      
      // Wait for retry
      setTimeout(() => {
        mockSendGrid.simulateSuccess();
      }, 100);
      
      const start = performance.now();
      const result = await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: []
      }, { 
        retries: 1,
        backoffMs: 50 
      });
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect(duration).toBeGreaterThan(50); // Should have waited
    });
  });

  describe('Email Analytics', () => {
    test('tracks email delivery statistics', async () => {
      mockSendGrid.simulateSuccess();
      
      await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: []
      });
      
      const stats = await emailService.getEmailStats();
      expect(stats.sent).toBeGreaterThan(0);
      expect(stats.confirmations).toBeGreaterThan(0);
    });

    test('processes SendGrid webhook events for analytics', async () => {
      const deliveredEvent = mockSendGridWebhookEvents.delivered[0];
      
      const result = await emailService.processWebhookEvent(deliveredEvent);
      
      expect(result.processed).toBe(true);
      
      const stats = await emailService.getEmailStats();
      expect(stats.delivered).toBeGreaterThan(0);
    });

    test('tracks email open and click rates', async () => {
      const events = [
        mockSendGridWebhookEvents.delivered[0],
        mockSendGridWebhookEvents.opened[0],
        mockSendGridWebhookEvents.clicked[0]
      ];
      
      for (const event of events) {
        await emailService.processWebhookEvent(event);
      }
      
      const stats = await emailService.getEmailStats();
      expect(stats.openRate).toBeGreaterThan(0);
      expect(stats.clickRate).toBeGreaterThan(0);
    });
  });

  describe('Email Security', () => {
    test('validates email addresses before sending', async () => {
      const invalidEmails = [
        'invalid-email',
        'test@',
        '@example.com',
        'test..test@example.com',
        'test@localhost' // Should be rejected in production
      ];
      
      for (const email of invalidEmails) {
        await expect(
          emailService.sendPaymentConfirmation({
            order: testOrder,
            customerEmail: email,
            customerName: 'Test Customer',
            orderItems: []
          })
        ).rejects.toThrow('Invalid email address');
      }
    });

    test('prevents email header injection', async () => {
      const maliciousEmail = 'test@example.com\nBcc: evil@hacker.com';
      
      await expect(
        emailService.sendPaymentConfirmation({
          order: testOrder,
          customerEmail: maliciousEmail,
          customerName: 'Test Customer',
          orderItems: []
        })
      ).rejects.toThrow('Invalid email address');
    });

    test('enforces email sending limits per customer', async () => {
      mockSendGrid.simulateSuccess();
      
      // Send multiple emails to same customer
      const promises = Array(10).fill().map(() =>
        emailService.sendPaymentConfirmation({
          order: testOrder,
          customerEmail: 'test@example.com',
          customerName: 'Test Customer',
          orderItems: []
        })
      );
      
      const results = await Promise.all(promises.map(p => p.catch(e => ({ error: e.message }))));
      const errors = results.filter(r => r.error);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Rate limit exceeded for customer');
    });
  });

  describe('Email Performance', () => {
    test('sends single email under performance threshold', async () => {
      mockSendGrid.simulateSuccess();
      
      const start = performance.now();
      
      await emailService.sendPaymentConfirmation({
        order: testOrder,
        customerEmail: 'test@example.com',
        customerName: 'Test Customer',
        orderItems: []
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500); // 500ms threshold
    });

    test('handles large email batches efficiently', async () => {
      mockSendGrid.simulateSuccess();
      
      const orders = Array(100).fill().map((_, index) => ({
        order: { ...testOrder, id: index + 1 },
        customerEmail: `batch${index}@example.com`,
        customerName: `Batch Customer ${index}`,
        orderItems: []
      }));
      
      const start = performance.now();
      const results = await emailService.sendBulkPaymentConfirmations(orders, {
        batchSize: 10,
        concurrency: 5
      });
      const duration = performance.now() - start;
      
      expect(results.successCount).toBe(100);
      expect(duration).toBeLessThan(10000); // 10 seconds for 100 emails
    });
  });
});