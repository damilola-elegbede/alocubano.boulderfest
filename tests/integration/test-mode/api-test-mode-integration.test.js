/**
 * @vitest-environment node
 *
 * NOTE: These tests are currently SKIPPED because they were incorrectly written as HTTP fetch() tests
 * in an integration test suite. Integration tests should test code integration directly, not via HTTP.
 *
 * These tests need to be either:
 * 1. Rewritten as proper integration tests (testing services/handlers directly)
 * 2. Moved to E2E test suite (if HTTP testing is required)
 * 3. Updated to test actual API endpoints that exist (many test non-existent endpoints)
 *
 * Current issues:
 * - Tests use fetch() which requires a running server (not available in integration tests)
 * - Many endpoints tested don't exist (e.g., /api/admin/test-cart/enable, /api/tickets/create)
 * - Tests should use direct handler imports or service calls instead of HTTP
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../../lib/database.js';
import { cleanupTestTickets } from '../../helpers/ticket-test-helpers.js';
import { createTestEvent } from '../handler-test-helper.js';

describe.skip('API Test Mode Integration (SKIPPED - needs rewrite)', () => {
  let client;
  let baseUrl;
  let testEventId;

  beforeEach(async () => {
    client = await getDatabaseClient();
    baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

    // Create test event for foreign key constraint
    testEventId = await createTestEvent(client, {
      slug: 'api-test-mode-event',
      name: 'API Test Mode Event'
    });
  });

  afterEach(async () => {
    await cleanupTestTickets();
    // Don't close the client - it's managed by the worker-level TestIsolationManager
    // Closing it here causes CLIENT_CLOSED errors in subsequent tests
  });

  describe('Payment API Test Mode', () => {
    it('should create test checkout session with test mode flag', async () => {
      const checkoutData = {
        items: [
          {
            name: 'General Admission',
            price: 50,
            quantity: 2
          }
        ],
        customerEmail: 'test@example.com',
        testMode: true
      };

      const response = await fetch(`${baseUrl}/api/payments/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(checkoutData)
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.testMode).toBe(true);

      // Verify test transaction was created in database
      const transaction = await client.execute(`
        SELECT * FROM transactions WHERE customer_email = ? AND is_test = 1
        ORDER BY created_at DESC LIMIT 1
      `, ['test@example.com']);

      expect(transaction.rows).toHaveLength(1);
      expect(transaction.rows[0].is_test).toBe(1);
      expect(transaction.rows[0].amount_cents).toBe(10000); // 50 * 2 * 100
    });

    it('should handle Stripe webhook in test mode', async () => {
      // First create a test transaction
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, stripe_session_id, order_data, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEST-WEBHOOK-123',
        'tickets',
        'pending',
        5000,
        'USD',
        'webhook@test.com',
        'cs_test_webhook_123',
        JSON.stringify({ test: true, webhookTest: true }),
        1
      ]);

      // Mock Stripe webhook payload for test mode
      const webhookPayload = {
        id: 'evt_test_webhook',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_webhook_123',
            payment_status: 'paid',
            amount_total: 5000,
            currency: 'usd',
            customer_details: {
              email: 'webhook@test.com'
            },
            metadata: {
              test_mode: 'true'
            }
          }
        }
      };

      const response = await fetch(`${baseUrl}/api/payments/stripe-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'test_signature'
        },
        body: JSON.stringify(webhookPayload)
      });

      expect(response.ok).toBe(true);

      // Verify transaction was updated
      const updatedTransaction = await client.execute(`
        SELECT * FROM transactions WHERE stripe_session_id = ? AND is_test = 1
      `, ['cs_test_webhook_123']);

      expect(updatedTransaction.rows).toHaveLength(1);
      expect(updatedTransaction.rows[0].status).toBe('completed');
    });
  });

  describe('Ticket API Test Mode', () => {
    it('should create test tickets through API', async () => {
      // First create a test transaction
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, order_data, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEST-API-TICKET-123',
        'tickets',
        'completed',
        5000,
        'USD',
        'ticket-api@test.com',
        JSON.stringify({ test: true, apiTest: true }),
        1
      ]);

      const transResult = await client.execute(`
        SELECT id FROM transactions WHERE transaction_id = 'TEST-API-TICKET-123'
      `);
      const transactionId = transResult.rows[0].id;

      const ticketData = {
        transactionId: transactionId,
        ticketType: 'general',
        eventId: testEventId,
        priceInCents: 5000,
        attendeeEmail: 'ticket-api@test.com',
        testMode: true
      };

      const response = await fetch(`${baseUrl}/api/tickets/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ticketData)
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.ticket.ticketId).toMatch(/^TEST-/);
      expect(result.ticket.qrToken).toBeDefined();
      expect(result.ticket.isTest).toBe(true);
    });

    it('should validate test tickets through API', async () => {
      // Create test ticket first
      const ticketId = `TEST-API-VALIDATE-${Date.now()}`;
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, order_data, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEST-VALIDATE-TRANS',
        'tickets',
        'completed',
        5000,
        'USD',
        'validate@test.com',
        JSON.stringify({ test: true, validateTest: true }),
        1
      ]);

      const transResult = await client.execute(`
        SELECT id FROM transactions WHERE transaction_id = 'TEST-VALIDATE-TRANS'
      `);
      const transactionId = transResult.rows[0].id;

      await client.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, status, registration_status, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        ticketId,
        transactionId,
        'general',
        testEventId,
        5000,
        'validate@test.com',
        'valid',
        'pending',
        1
      ]);

      // Generate QR token for validation
      const qrToken = `TEST-QR-${ticketId}-${Date.now()}`;

      const response = await fetch(`${baseUrl}/api/tickets/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          qrToken: qrToken,
          testMode: true
        })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.valid).toBe(true);
      expect(result.ticket.isTest).toBe(true);
      expect(result.ticket.ticketId).toBe(ticketId);
    });

    it('should register test tickets through API', async () => {
      // Create test ticket first
      const ticketId = `TEST-API-REGISTER-${Date.now()}`;
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, order_data, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEST-REGISTER-TRANS',
        'tickets',
        'completed',
        5000,
        'USD',
        'register@test.com',
        JSON.stringify({ test: true, registerTest: true }),
        1
      ]);

      const transResult = await client.execute(`
        SELECT id FROM transactions WHERE transaction_id = 'TEST-REGISTER-TRANS'
      `);
      const transactionId = transResult.rows[0].id;

      await client.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, status, registration_status, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        ticketId,
        transactionId,
        'general',
        testEventId,
        5000,
        'register@test.com',
        'valid',
        'pending',
        1
      ]);

      const registrationData = {
        ticketId: ticketId,
        firstName: 'API',
        lastName: 'Test',
        email: 'register@test.com',
        testMode: true
      };

      const response = await fetch(`${baseUrl}/api/tickets/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registrationData)
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.ticket.registrationStatus).toBe('registered');

      // Verify in database
      const updatedTicket = await client.execute(`
        SELECT * FROM tickets WHERE ticket_id = ?
      `, [ticketId]);

      expect(updatedTicket.rows[0].registration_status).toBe('registered');
      expect(updatedTicket.rows[0].attendee_first_name).toBe('API');
      expect(updatedTicket.rows[0].attendee_last_name).toBe('Test');
    });
  });

  describe('Email API Test Mode', () => {
    it('should handle newsletter subscription in test mode', async () => {
      const subscriptionData = {
        email: 'newsletter@test.com',
        firstName: 'Newsletter',
        lastName: 'Test',
        testMode: true
      };

      const response = await fetch(`${baseUrl}/api/email/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscriptionData)
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      // In test mode, this should use mock Brevo responses
      expect(result.contact).toBeDefined();
    });

    it('should send transactional emails in test mode', async () => {
      const emailData = {
        to: 'transactional@test.com',
        templateId: 1,
        params: {
          ticketId: 'TEST-EMAIL-123',
          customerName: 'Email Test'
        },
        testMode: true
      };

      const response = await fetch(`${baseUrl}/api/email/send-transactional`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.messageId).toMatch(/^mock-message-/);
    });
  });

  describe('Admin API Test Mode', () => {
    it('should provide test mode dashboard data', async () => {
      // Create some test data
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, order_data, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEST-ADMIN-DASH-123',
        'tickets',
        'completed',
        5000,
        'USD',
        'admin-dash@test.com',
        JSON.stringify({ test: true, adminDashTest: true }),
        1
      ]);

      const response = await fetch(`${baseUrl}/api/admin/dashboard?testMode=true`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-admin-token'
        }
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.testMode).toBe(true);
      expect(result.stats.testTransactions).toBeGreaterThanOrEqual(1);
      expect(result.stats.productionTransactions).toBeGreaterThanOrEqual(0);
      expect(result.testDataSummary).toBeDefined();
    });

    it('should enable test cart mode through admin API', async () => {
      const response = await fetch(`${baseUrl}/api/admin/test-cart/enable`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-admin-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          testItems: [
            {
              type: 'ticket',
              name: 'TEST - General Admission',
              price: 50,
              quantity: 1
            }
          ]
        })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.testCartEnabled).toBe(true);
      expect(result.testItems).toHaveLength(1);
      expect(result.testItems[0].name).toContain('TEST -');
    });

    it('should disable test cart mode through admin API', async () => {
      const response = await fetch(`${baseUrl}/api/admin/test-cart/disable`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-admin-token'
        }
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.testCartEnabled).toBe(false);
    });
  });

  describe('Health Check API Test Mode', () => {
    it('should report test mode status in health check', async () => {
      const response = await fetch(`${baseUrl}/api/health/check?includeTestMode=true`);

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.status).toBe('healthy');
      expect(result.testMode).toBeDefined();
      expect(result.testMode.enabled).toBeDefined();
      expect(result.testMode.environment).toBeDefined();
    });

    it('should provide test data statistics in health check', async () => {
      // Create test data
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, order_data, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEST-HEALTH-123',
        'tickets',
        'completed',
        5000,
        'USD',
        'health@test.com',
        JSON.stringify({ test: true, healthTest: true }),
        1
      ]);

      const response = await fetch(`${baseUrl}/api/health/test-data`);

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.status).toBe('healthy');
      expect(result.testData).toBeDefined();
      expect(result.testData.transactions).toBeGreaterThanOrEqual(1);
      expect(result.testData.isolation).toBe('verified');
    });
  });

  describe('Error Handling in Test Mode', () => {
    it('should handle invalid test mode requests gracefully', async () => {
      const response = await fetch(`${baseUrl}/api/payments/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [],
          testMode: 'invalid' // Should be boolean
        })
      });

      expect(response.status).toBe(400);
      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid test mode parameter');
    });

    it('should prevent test operations in production mode', async () => {
      const response = await fetch(`${baseUrl}/api/admin/test-cart/enable`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-admin-token',
          'X-Force-Production-Mode': 'true'
        }
      });

      expect(response.status).toBe(403);
      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test operations not allowed in production');
    });

    it('should validate test ticket permissions', async () => {
      const response = await fetch(`${baseUrl}/api/tickets/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          qrToken: 'INVALID-TEST-TOKEN',
          testMode: true
        })
      });

      expect(response.status).toBe(404);
      const result = await response.json();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Test ticket not found');
    });
  });

  describe('Test Mode Security', () => {
    it('should require authentication for admin test mode operations', async () => {
      const response = await fetch(`${baseUrl}/api/admin/test-cart/enable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
        // No authorization header
      });

      expect(response.status).toBe(401);
      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication required');
    });

    it('should validate test mode permissions', async () => {
      const response = await fetch(`${baseUrl}/api/admin/test-cart/enable`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(403);
      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid authentication');
    });

    it('should audit test mode operations', async () => {
      const response = await fetch(`${baseUrl}/api/admin/test-cart/enable`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-admin-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          testItems: [{ type: 'ticket', name: 'Test Item', price: 25 }]
        })
      });

      expect(response.ok).toBe(true);

      // Check audit log
      const auditLogs = await client.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'test_cart_enabled'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      expect(auditLogs.rows).toHaveLength(1);
      const auditEntry = auditLogs.rows[0];
      expect(auditEntry.admin_user).toBeDefined();
      expect(auditEntry.action).toBe('test_cart_enabled');
    });
  });
});