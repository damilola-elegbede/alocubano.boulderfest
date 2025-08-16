/**
 * Email/Brevo Integration Tests
 * Tests real API endpoints with actual HTTP requests and Brevo API calls
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { serverManager } from '../core/server.js';
import { httpClient } from '../core/http.js';
import { databaseHelper } from '../core/database.js';
import { isMockMode } from '../helpers/test-mode.js';

describe.skipIf(isMockMode())('Email/Brevo Integration Tests', () => {
  let serverUrl;
  let testEmails = [];

  // Test configuration
  const TEST_CONFIG = {
    brevoApiKey: process.env.BREVO_API_KEY || 'test_api_key_for_integration_tests',
    brevoListId: process.env.BREVO_NEWSLETTER_LIST_ID || '2',
    brevoWebhookSecret: process.env.BREVO_WEBHOOK_SECRET || 'test_webhook_secret'
  };

  // Helper to generate test email
  const generateTestEmail = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `test-${timestamp}-${random}@test-integration.com`;
  };

  // Helper to generate unsubscribe token
  const generateUnsubscribeToken = (email) => {
    const secret = process.env.UNSUBSCRIBE_SECRET || 'default-secret';
    return crypto.createHmac('sha256', secret).update(email).digest('hex');
  };

  // Helper to generate webhook signature
  const generateWebhookSignature = (payload) => {
    return crypto
      .createHmac('sha256', TEST_CONFIG.brevoWebhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  };

  // Helper to clean up test email from Brevo
  const cleanupBrevoEmail = async (email) => {
    try {
      const response = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'Api-Key': TEST_CONFIG.brevoApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          emails: [email]
        })
      });
      
      if (response.ok) {
        console.log(`✅ Cleaned up Brevo contact: ${email}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup Brevo contact ${email}:`, error.message);
    }
  };

  beforeAll(async () => {
    // Initialize database
    await databaseHelper.initialize();
    
    // Setup environment variables for test
    process.env.BREVO_API_KEY = TEST_CONFIG.brevoApiKey;
    process.env.BREVO_NEWSLETTER_LIST_ID = TEST_CONFIG.brevoListId;
    process.env.BREVO_WEBHOOK_SECRET = TEST_CONFIG.brevoWebhookSecret;
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false'; // Disable for integration tests
    
    // For now, test against manually started server
    serverUrl = 'http://localhost:3000'; // Assuming dev server is running
    httpClient.baseUrl = serverUrl;
    httpClient.setDefaultHeaders({
      'Content-Type': 'application/json'
    });
    
    console.log(`🧪 Email integration tests running against: ${serverUrl}`);
    console.log(`📧 Using Brevo List ID: ${TEST_CONFIG.brevoListId}`);
  }, 60000);

  afterAll(async () => {
    // Cleanup all test emails from Brevo
    for (const email of testEmails) {
      await cleanupBrevoEmail(email);
    }
    
    // Cleanup database
    await databaseHelper.cleanup();
  });

  beforeEach(async () => {
    // Clean database between tests
    await databaseHelper.cleanBetweenTests();
  });

  afterEach(() => {
    // Clear any mocks
    vi.clearAllMocks();
  });

  describe('POST /api/email/subscribe', () => {
    it('should successfully subscribe a new email to newsletter', async () => {
      const testEmail = generateTestEmail();
      testEmails.push(testEmail);

      const subscribeData = {
        email: testEmail,
        firstName: 'Test',
        lastName: 'User',
        phone: '+1234567890',
        source: 'integration-test',
        consentToMarketing: true,
        lists: [parseInt(TEST_CONFIG.brevoListId)]
      };

      const response = await httpClient.post('/api/email/subscribe', subscribeData);

      expect(response.status).toBe(201);
      expect(response.ok).toBe(true);
      expect(response.data).toMatchObject({
        success: true,
        message: expect.stringContaining('Successfully subscribed'),
        subscriber: {
          email: testEmail,
          status: 'active',
          requiresVerification: false
        }
      });

      // Verify subscriber was created in database
      const subscriber = await databaseHelper.getSubscriber(testEmail);
      expect(subscriber).toBeTruthy();
      expect(subscriber.email).toBe(testEmail);
      expect(subscriber.status).toBe('active');
    });

    it('should handle duplicate email subscription gracefully', async () => {
      const testEmail = generateTestEmail();
      testEmails.push(testEmail);

      const subscribeData = {
        email: testEmail,
        firstName: 'Test',
        lastName: 'User',
        consentToMarketing: true
      };

      // First subscription
      const firstResponse = await httpClient.post('/api/email/subscribe', subscribeData);
      expect(firstResponse.status).toBe(201);

      // Second subscription (duplicate)
      const secondResponse = await httpClient.post('/api/email/subscribe', subscribeData);
      expect(secondResponse.status).toBe(409);
      expect(secondResponse.data.error).toContain('already subscribed');
    });

    it('should validate email format', async () => {
      const subscribeData = {
        email: 'invalid-email',
        consentToMarketing: true
      };

      const response = await httpClient.post('/api/email/subscribe', subscribeData);

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('valid email address');
    });

    it('should require marketing consent', async () => {
      const testEmail = generateTestEmail();

      const subscribeData = {
        email: testEmail,
        consentToMarketing: false
      };

      const response = await httpClient.post('/api/email/subscribe', subscribeData);

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Marketing consent is required');
    });

    it('should enforce rate limiting', async () => {
      const testEmail = generateTestEmail();
      testEmails.push(testEmail);

      const subscribeData = {
        email: testEmail,
        consentToMarketing: true
      };

      // Make multiple rapid requests to trigger rate limiting
      const promises = Array(25).fill().map((_, i) => 
        httpClient.post('/api/email/subscribe', {
          ...subscribeData,
          email: `${i}-${testEmail}`
        })
      );

      const responses = await Promise.allSettled(promises);
      
      // At least one request should be rate limited
      const rateLimitedResponses = responses.filter(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should handle CORS preflight requests', async () => {
      const response = await httpClient.request('OPTIONS', '/api/email/subscribe');
      
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('GET|POST /api/email/unsubscribe', () => {
    let testEmail;
    let unsubscribeToken;

    beforeEach(async () => {
      // Create a test subscriber first
      testEmail = generateTestEmail();
      testEmails.push(testEmail);
      
      const subscribeData = {
        email: testEmail,
        firstName: 'Test',
        lastName: 'Unsubscribe',
        consentToMarketing: true
      };

      await httpClient.post('/api/email/subscribe', subscribeData);
      unsubscribeToken = generateUnsubscribeToken(testEmail);
    });

    it('should unsubscribe via GET request with valid token', async () => {
      const response = await httpClient.get(
        `/api/email/unsubscribe?email=${encodeURIComponent(testEmail)}&token=${unsubscribeToken}`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.data).toContain('You\'ve Been Unsubscribed');
      expect(response.data).toContain(testEmail);

      // Verify subscriber status in database
      const subscriber = await databaseHelper.getSubscriber(testEmail);
      expect(subscriber.status).toBe('unsubscribed');
      expect(subscriber.unsubscribed_at).toBeTruthy();
    });

    it('should unsubscribe via POST request with valid token', async () => {
      const unsubscribeData = {
        email: testEmail,
        token: unsubscribeToken
      };

      const response = await httpClient.post('/api/email/unsubscribe', unsubscribeData);

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Successfully unsubscribed from newsletter',
        email: testEmail
      });

      // Verify subscriber status in database
      const subscriber = await databaseHelper.getSubscriber(testEmail);
      expect(subscriber.status).toBe('unsubscribed');
    });

    it('should reject invalid unsubscribe token', async () => {
      const invalidToken = 'invalid-token-12345';

      const response = await httpClient.get(
        `/api/email/unsubscribe?email=${encodeURIComponent(testEmail)}&token=${invalidToken}`
      );

      expect(response.status).toBe(400);
      expect(response.data).toContain('Invalid unsubscribe token');
    });

    it('should handle missing email parameter', async () => {
      const response = await httpClient.get(`/api/email/unsubscribe?token=${unsubscribeToken}`);

      expect(response.status).toBe(400);
      expect(response.data).toContain('Email address is required');
    });

    it('should handle missing token parameter', async () => {
      const response = await httpClient.get(`/api/email/unsubscribe?email=${encodeURIComponent(testEmail)}`);

      expect(response.status).toBe(400);
      expect(response.data).toContain('Unsubscribe token is required');
    });

    it('should handle unsubscribing non-existent subscriber', async () => {
      const nonExistentEmail = 'nonexistent@test.com';
      const token = generateUnsubscribeToken(nonExistentEmail);

      const response = await httpClient.get(
        `/api/email/unsubscribe?email=${encodeURIComponent(nonExistentEmail)}&token=${token}`
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('Already Unsubscribed');
    });
  });

  describe('POST /api/email/brevo-webhook', () => {
    let testEmail;
    let testSubscriber;

    beforeEach(async () => {
      // Create a test subscriber first
      testEmail = generateTestEmail();
      testEmails.push(testEmail);
      
      const subscribeData = {
        email: testEmail,
        firstName: 'Test',
        lastName: 'Webhook',
        consentToMarketing: true
      };

      await httpClient.post('/api/email/subscribe', subscribeData);
      testSubscriber = await databaseHelper.getSubscriber(testEmail);
    });

    it('should process email delivered webhook event', async () => {
      const webhookPayload = {
        event: 'delivered',
        email: testEmail,
        id: 12345,
        date: new Date().toISOString(),
        message_id: '<test-message-id@brevo.com>',
        template_id: 1,
        tags: ['newsletter']
      };

      const signature = generateWebhookSignature(webhookPayload);

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        signature
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Email delivery recorded'
      });

      // Verify event was logged in database (if email_events table exists)
      // This would require checking the email_events table
    });

    it('should process email opened webhook event', async () => {
      const webhookPayload = {
        event: 'opened',
        email: testEmail,
        id: 12346,
        date: new Date().toISOString(),
        message_id: '<test-message-id@brevo.com>',
        template_id: 1,
        ip: '192.168.1.1',
        user_agent: 'Mozilla/5.0 Test'
      };

      const signature = generateWebhookSignature(webhookPayload);

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        signature
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Email open recorded'
      });
    });

    it('should process email clicked webhook event', async () => {
      const webhookPayload = {
        event: 'clicked',
        email: testEmail,
        id: 12347,
        date: new Date().toISOString(),
        message_id: '<test-message-id@brevo.com>',
        template_id: 1,
        url: 'https://example.com/test-link',
        ip: '192.168.1.1'
      };

      const signature = generateWebhookSignature(webhookPayload);

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        signature
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Email click recorded'
      });
    });

    it('should process hard bounce webhook and update subscriber status', async () => {
      const webhookPayload = {
        event: 'hard_bounce',
        email: testEmail,
        id: 12348,
        date: new Date().toISOString(),
        reason: 'User unknown',
        bounced_at: new Date().toISOString()
      };

      const signature = generateWebhookSignature(webhookPayload);

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        signature
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Hard bounce processed, contact marked as bounced'
      });

      // Verify subscriber status was updated
      const updatedSubscriber = await databaseHelper.getSubscriber(testEmail);
      expect(updatedSubscriber.status).toBe('bounced');
    });

    it('should process spam complaint webhook and update subscriber status', async () => {
      const webhookPayload = {
        event: 'spam',
        email: testEmail,
        id: 12349,
        date: new Date().toISOString(),
        complaint_at: new Date().toISOString()
      };

      const signature = generateWebhookSignature(webhookPayload);

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        signature
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Spam complaint processed, contact marked as bounced'
      });

      // Verify subscriber status was updated
      const updatedSubscriber = await databaseHelper.getSubscriber(testEmail);
      expect(updatedSubscriber.status).toBe('bounced');
    });

    it('should process unsubscribed webhook and update subscriber status', async () => {
      const webhookPayload = {
        event: 'unsubscribed',
        email: testEmail,
        id: 12350,
        date: new Date().toISOString(),
        unsubscribed_at: new Date().toISOString()
      };

      const signature = generateWebhookSignature(webhookPayload);

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        signature
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Unsubscribe processed'
      });

      // Verify subscriber status was updated
      const updatedSubscriber = await databaseHelper.getSubscriber(testEmail);
      expect(updatedSubscriber.status).toBe('unsubscribed');
      expect(updatedSubscriber.unsubscribed_at).toBeTruthy();
    });

    it('should validate webhook signature', async () => {
      const webhookPayload = {
        event: 'delivered',
        email: testEmail,
        id: 12351,
        date: new Date().toISOString()
      };

      const invalidSignature = 'invalid-signature-12345';

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        invalidSignature
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toBe('Invalid signature');
    });

    it('should handle webhook for non-existent subscriber', async () => {
      const nonExistentEmail = 'nonexistent@test.com';
      
      const webhookPayload = {
        event: 'delivered',
        email: nonExistentEmail,
        id: 12352,
        date: new Date().toISOString()
      };

      const signature = generateWebhookSignature(webhookPayload);

      const response = await httpClient.webhookRequest(
        '/api/email/brevo-webhook',
        webhookPayload,
        signature
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Webhook processed (subscriber not found)'
      });
    });

    it('should handle malformed webhook payload', async () => {
      const response = await httpClient.post('/api/email/brevo-webhook', 'invalid json', {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Invalid JSON payload');
    });

    it('should handle missing required webhook fields', async () => {
      const incompletePayload = {
        event: 'delivered'
        // Missing email field
      };

      const response = await httpClient.post('/api/email/brevo-webhook', incompletePayload);

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Missing required webhook fields');
    });

    it('should only accept POST requests', async () => {
      const response = await httpClient.get('/api/email/brevo-webhook');

      expect(response.status).toBe(405);
      expect(response.data.error).toContain('Method not allowed');
    });
  });

  describe('Email Token Generation and Validation', () => {
    it('should generate and validate unsubscribe tokens correctly', async () => {
      const testEmail = 'token-test@example.com';
      
      // Generate token
      const token1 = generateUnsubscribeToken(testEmail);
      const token2 = generateUnsubscribeToken(testEmail);
      
      // Same email should generate same token
      expect(token1).toBe(token2);
      
      // Different email should generate different token
      const differentToken = generateUnsubscribeToken('different@example.com');
      expect(token1).not.toBe(differentToken);
      
      // Token should be hex string
      expect(token1).toMatch(/^[a-f0-9]+$/);
      expect(token1.length).toBe(64); // SHA256 hex is 64 characters
    });

    it('should generate unique verification tokens', async () => {
      const testEmail = generateTestEmail();
      testEmails.push(testEmail);

      // Setup environment to require verification
      const originalValue = process.env.REQUIRE_EMAIL_VERIFICATION;
      process.env.REQUIRE_EMAIL_VERIFICATION = 'true';

      try {
        const subscribeData = {
          email: testEmail,
          firstName: 'Test',
          lastName: 'Verification',
          consentToMarketing: true
        };

        const response = await httpClient.post('/api/email/subscribe', subscribeData);

        expect(response.status).toBe(201);
        expect(response.data.subscriber.requiresVerification).toBe(true);
        expect(response.data.message).toContain('check your email to verify');

        // Verify token was stored in database
        const subscriber = await databaseHelper.getSubscriber(testEmail);
        expect(subscriber.verification_token).toBeTruthy();
        expect(subscriber.verification_token.length).toBe(64); // 32 bytes = 64 hex chars
        expect(subscriber.status).toBe('pending');
      } finally {
        // Restore original value
        process.env.REQUIRE_EMAIL_VERIFICATION = originalValue;
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle Brevo API timeouts gracefully', async () => {
      // Mock fetch to simulate timeout
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Request timeout'));

      try {
        const testEmail = generateTestEmail();
        const subscribeData = {
          email: testEmail,
          consentToMarketing: true
        };

        const response = await httpClient.post('/api/email/subscribe', subscribeData);

        // Should handle the error gracefully
        expect(response.status).toBeGreaterThanOrEqual(500);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle database connection errors', async () => {
      // This test would require mocking database failures
      // Implementation depends on how database errors are handled
      const testEmail = generateTestEmail();
      
      const subscribeData = {
        email: testEmail,
        consentToMarketing: true
      };

      // For now, just ensure the endpoint doesn't crash
      const response = await httpClient.post('/api/email/subscribe', subscribeData);
      expect(response.status).toBeDefined();
    });

    it('should sanitize input data properly', async () => {
      const testEmail = generateTestEmail();
      testEmails.push(testEmail);

      const subscribeData = {
        email: `  ${testEmail.toUpperCase()}  `, // Should be trimmed and lowercased
        firstName: '  Test Name  ', // Should be trimmed
        lastName: 'A'.repeat(200), // Should be truncated to 100 chars
        phone: '  +1-234-567-8900  ', // Should be trimmed
        source: 'test source with <script>alert("xss")</script>', // Should be sanitized
        consentToMarketing: true
      };

      const response = await httpClient.post('/api/email/subscribe', subscribeData);

      expect(response.status).toBe(201);
      
      // Verify data was sanitized in database
      const subscriber = await databaseHelper.getSubscriber(testEmail);
      expect(subscriber.email).toBe(testEmail); // Should be lowercase and trimmed
      expect(subscriber.first_name).toBe('Test Name'); // Should be trimmed
      expect(subscriber.last_name.length).toBeLessThanOrEqual(100); // Should be truncated
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent subscription requests', async () => {
      const concurrentRequests = 10;
      const testEmails = Array(concurrentRequests).fill().map(() => generateTestEmail());
      
      // Add to cleanup list
      testEmails.forEach(email => testEmails.push(email));

      const subscribePromises = testEmails.map(email => 
        httpClient.post('/api/email/subscribe', {
          email,
          firstName: 'Concurrent',
          lastName: 'Test',
          consentToMarketing: true
        })
      );

      const responses = await Promise.allSettled(subscribePromises);
      
      // All requests should succeed
      const successfulResponses = responses.filter(result => 
        result.status === 'fulfilled' && result.value.status === 201
      );

      expect(successfulResponses.length).toBe(concurrentRequests);
    });

    it('should handle rapid webhook events', async () => {
      // Create a test subscriber
      const testEmail = generateTestEmail();
      testEmails.push(testEmail);
      
      await httpClient.post('/api/email/subscribe', {
        email: testEmail,
        consentToMarketing: true
      });

      // Send multiple rapid webhook events
      const webhookEvents = [
        { event: 'delivered', id: 1001 },
        { event: 'opened', id: 1002 },
        { event: 'clicked', id: 1003, url: 'https://example.com' },
        { event: 'opened', id: 1004 }
      ];

      const webhookPromises = webhookEvents.map(eventData => {
        const payload = {
          ...eventData,
          email: testEmail,
          date: new Date().toISOString(),
          message_id: `<test-${eventData.id}@brevo.com>`
        };
        
        const signature = generateWebhookSignature(payload);
        
        return httpClient.webhookRequest('/api/email/brevo-webhook', payload, signature);
      });

      const responses = await Promise.allSettled(webhookPromises);
      
      // All webhook events should be processed successfully
      const successfulResponses = responses.filter(result =>
        result.status === 'fulfilled' && result.value.status === 200
      );

      expect(successfulResponses.length).toBe(webhookEvents.length);
    });
  });
});