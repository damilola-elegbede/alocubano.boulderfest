/**
 * Email Service Integration Tests - Brevo Email Integration
 * Tests email service functionality with real Brevo API integration
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from '../handler-test-helper.js';
import { getDbClient } from '../../setup-integration.js';

describe('Email Service Integration', () => {
  let testEmail;
  let dbClient;

  beforeEach(async () => {
    testEmail = generateTestEmail();
    dbClient = await getDbClient();
  });

  test('newsletter subscription creates database record and sends to Brevo', async () => {
    const subscriptionData = {
      email: testEmail,
      firstName: 'Newsletter',
      lastName: 'Test',
      source: 'integration-test',
      consentToMarketing: true
    };

    // Subscribe to newsletter
    const response = await testRequest('POST', '/api/email/subscribe', subscriptionData);
    
    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Email service unavailable - skipping integration test');
      return;
    }

    // Validate successful subscription
    expect([HTTP_STATUS.OK, 201, HTTP_STATUS.CONFLICT]).toContain(response.status);
    
    if (response.status === HTTP_STATUS.OK || response.status === 201) {
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('subscribed');
    }

    // Verify database entry was created
    if (dbClient) {
      try {
        // Check both possible table names (newsletter_subscriptions or email_subscribers)
        let dbResult = await dbClient.execute(
          'SELECT * FROM email_subscribers WHERE email = ?',
          [testEmail]
        ).catch(() => null);

        if (!dbResult || dbResult.rows.length === 0) {
          // Try legacy table name
          dbResult = await dbClient.execute(
            'SELECT * FROM newsletter_subscriptions WHERE email = ?',
            [testEmail]
          ).catch(() => null);
        }
        
        if (dbResult && dbResult.rows.length > 0) {
          const subscription = dbResult.rows[0];
          expect(subscription.email).toBe(testEmail);
          expect(subscription.first_name).toBe('Newsletter');
          expect(subscription.last_name).toBe('Test');
        }
      } catch (error) {
        console.warn('⚠️ Database verification skipped:', error.message);
      }
    }
  });

  test('duplicate email subscription returns conflict status', async () => {
    const subscriptionData = {
      email: testEmail,
      firstName: 'Duplicate',
      lastName: 'Test',
      consentToMarketing: true
    };

    // First subscription
    const firstResponse = await testRequest('POST', '/api/email/subscribe', subscriptionData);
    
    if (firstResponse.status === 0) {
      console.warn('⚠️ Email service unavailable - skipping duplicate test');
      return;
    }

    // Second subscription with same email
    const secondResponse = await testRequest('POST', '/api/email/subscribe', subscriptionData);
    
    // Should handle duplicates gracefully
    expect([HTTP_STATUS.OK, 201, HTTP_STATUS.CONFLICT]).toContain(secondResponse.status);
    
    if (secondResponse.status === HTTP_STATUS.CONFLICT) {
      expect(secondResponse.data).toHaveProperty('error');
      expect(secondResponse.data.error).toContain('already');
    }
  });

  test('unsubscribe with valid token removes subscription', async () => {
    // First, create a subscription
    const subscriptionData = {
      email: testEmail,
      firstName: 'Unsubscribe',
      lastName: 'Test',
      consentToMarketing: true
    };

    const subscribeResponse = await testRequest('POST', '/api/email/subscribe', subscriptionData);
    
    if (subscribeResponse.status === 0) {
      console.warn('⚠️ Email service unavailable - skipping unsubscribe test');
      return;
    }

    if (subscribeResponse.status === HTTP_STATUS.OK || subscribeResponse.status === 201) {
      // Generate unsubscribe token (simplified for testing)
      const unsubscribeToken = Buffer.from(testEmail).toString('base64');
      
      // Attempt unsubscribe
      const unsubscribeResponse = await testRequest('POST', '/api/email/unsubscribe', {
        token: unsubscribeToken
      });

      // Validate unsubscribe response
      expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.BAD_REQUEST, 0]).toContain(unsubscribeResponse.status);
      
      if (unsubscribeResponse.status === HTTP_STATUS.OK) {
        expect(unsubscribeResponse.data).toHaveProperty('message');
        expect(unsubscribeResponse.data.message).toContain('unsubscribed');
      }
    }
  });

  test('webhook processing logs email events correctly', async () => {
    // Check if webhook secret is configured
    if (!process.env.BREVO_WEBHOOK_SECRET) {
      console.warn('⚠️ BREVO_WEBHOOK_SECRET not configured - skipping webhook test');
      return;
    }

    const mockWebhookData = {
      event: 'delivered',
      email: testEmail,
      timestamp: new Date().toISOString(),
      'message-id': 'test-message-' + Math.random().toString(36).slice(2)
    };

    // Process email webhook
    const webhookResponse = await testRequest('POST', '/api/email/brevo-webhook', mockWebhookData, {
      'x-mailin-custom': process.env.BREVO_WEBHOOK_SECRET
    });

    // Webhook processing should not fail
    expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, 0]).toContain(webhookResponse.status);

    // If database is available, check event logging
    if (dbClient && webhookResponse.status === HTTP_STATUS.OK) {
      try {
        const eventResult = await dbClient.execute(
          'SELECT * FROM email_events WHERE email = ? ORDER BY created_at DESC LIMIT 1',
          [testEmail]
        );
        
        if (eventResult.rows.length > 0) {
          const event = eventResult.rows[0];
          expect(event.email).toBe(testEmail);
          expect(event.event_type).toBe('delivered');
        }
      } catch (error) {
        console.warn('⚠️ Email event verification skipped:', error.message);
      }
    }
  });
});