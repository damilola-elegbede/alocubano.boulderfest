/**
 * Brevo Webhook Security Integration Tests
 * Tests IP whitelisting, Bearer token authentication, and event processing
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { generateTestEmail, testRequest } from '../handler-test-helper.js';

describe('Brevo Webhook Security', () => {
  let dbClient;
  let testEmail;
  let originalEnv;

  beforeEach(async () => {
    testEmail = generateTestEmail();
    dbClient = await getDbClient();

    // Store original env
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      BREVO_WEBHOOK_SECRET: process.env.BREVO_WEBHOOK_SECRET,
      BREVO_ENABLE_IP_WHITELIST: process.env.BREVO_ENABLE_IP_WHITELIST
    };
  });

  afterEach(() => {
    // Restore original env
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.BREVO_WEBHOOK_SECRET = originalEnv.BREVO_WEBHOOK_SECRET;
    process.env.BREVO_ENABLE_IP_WHITELIST = originalEnv.BREVO_ENABLE_IP_WHITELIST;
  });

  // Helper to create mock request
  function createMockRequest(config = {}) {
    const {
      method = 'POST',
      headers = {},
      body = {},
      ip = '127.0.0.1'
    } = config;

    return {
      method,
      headers: {
        'content-type': 'application/json',
        ...headers
      },
      socket: { remoteAddress: ip },
      setEncoding: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify(body));
        } else if (event === 'end') {
          callback();
        }
      })
    };
  }

  // Helper to create mock response
  function createMockResponse() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status: vi.fn(function(code) {
        this.statusCode = code;
        return this;
      }),
      json: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      setHeader: vi.fn(function(key, value) {
        this.headers[key] = value;
        return this;
      })
    };
    return res;
  }

  describe('IP Whitelisting', () => {
    test('should accept requests from valid Brevo IP range (1.179.112.0/20)', async () => {
      process.env.BREVO_ENABLE_IP_WHITELIST = 'true';
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.NODE_ENV = 'production';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        ip: '1.179.120.50',
        headers: {
          'authorization': 'Bearer test-secret-key'
        },
        body: {
          event: 'delivered',
          email: testEmail,
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should accept requests from valid Brevo IP range (172.246.240.0/20)', async () => {
      process.env.BREVO_ENABLE_IP_WHITELIST = 'true';
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.NODE_ENV = 'production';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        ip: '172.246.250.100',
        headers: {
          'authorization': 'Bearer test-secret-key'
        },
        body: {
          event: 'opened',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });

    test('should reject requests from invalid IP addresses', async () => {
      process.env.BREVO_ENABLE_IP_WHITELIST = 'true';
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.NODE_ENV = 'production';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        ip: '192.168.1.100', // Invalid IP
        headers: {
          'authorization': 'Bearer test-secret-key'
        },
        body: {
          event: 'delivered',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    test('should allow localhost in development mode', async () => {
      process.env.BREVO_ENABLE_IP_WHITELIST = 'true';
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.NODE_ENV = 'development';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        ip: '127.0.0.1',
        headers: {
          'authorization': 'Bearer test-secret-key'
        },
        body: {
          event: 'delivered',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });

    test('should allow localhost in test mode', async () => {
      process.env.BREVO_ENABLE_IP_WHITELIST = 'true';
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.NODE_ENV = 'test';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        ip: '::1', // IPv6 localhost
        headers: {
          'authorization': 'Bearer test-secret-key'
        },
        body: {
          event: 'clicked',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Bearer Token Authentication', () => {
    test('should accept valid Bearer token', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: {
          'authorization': 'Bearer test-secret-key'
        },
        body: {
          event: 'delivered',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject missing Authorization header', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: {}, // No authorization
        body: {
          event: 'delivered',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    test('should reject invalid Bearer token', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: {
          'authorization': 'Bearer wrong-token'
        },
        body: {
          event: 'delivered',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    test('should accept token via X-Brevo-Token header', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: {
          'x-brevo-token': 'test-secret-key'
        },
        body: {
          event: 'delivered',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });

    test('should accept token via X-Webhook-Token header', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: {
          'x-webhook-token': 'test-secret-key'
        },
        body: {
          event: 'delivered',
          email: testEmail
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Event Type Processing', () => {
    test('should process delivered event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'delivered',
          email: testEmail,
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('delivery recorded');
    });

    test('should process opened event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'opened',
          email: testEmail,
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('open recorded');
    });

    test('should process clicked event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'clicked',
          email: testEmail,
          link: 'https://example.com/link',
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('click recorded');
    });

    test('should process soft_bounce event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'soft_bounce',
          email: testEmail,
          reason: 'Mailbox full',
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Soft bounce recorded');
    });

    test('should process hard_bounce event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'hard_bounce',
          email: testEmail,
          reason: 'Invalid email address',
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Hard bounce processed');
    });

    test('should process spam event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'spam',
          email: testEmail,
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Spam complaint processed');
    });

    test('should process invalid_email event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const invalidEmail = 'invalid@';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [invalidEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'invalid_email',
          email: invalidEmail,
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Invalid email processed');
    });

    test('should process unsubscribed event', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'unsubscribed',
          email: testEmail,
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Unsubscribe processed');
    });

    test('should handle unknown event type gracefully', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      // Create email subscriber in database
      await dbClient.execute({
        sql: `INSERT INTO email_subscribers (email, status, source) VALUES (?, ?, ?)`,
        args: [testEmail, 'active', 'website']
      });

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'unknown_event_type',
          email: testEmail,
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Unknown event type');
    });
  });

  describe('Payload Validation', () => {
    test('should reject missing event field', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          email: testEmail // Missing 'event'
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Missing required webhook fields');
    });

    test('should reject missing email field', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'delivered' // Missing 'email'
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Missing required webhook fields');
    });

    test('should reject invalid JSON payload', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test-secret-key'
        },
        socket: { remoteAddress: '127.0.0.1' },
        setEncoding: vi.fn(),
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback('invalid json{');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid JSON');
    });
  });

  describe('HTTP Method Validation', () => {
    test('should reject GET requests', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        method: 'GET',
        headers: { 'authorization': 'Bearer test-secret-key' }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.body.error).toContain('Method not allowed');
    });

    test('should reject PUT requests', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        method: 'PUT',
        headers: { 'authorization': 'Bearer test-secret-key' }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(405);
    });

    test('should reject DELETE requests', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        method: 'DELETE',
        headers: { 'authorization': 'Bearer test-secret-key' }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('Test Mode Detection', () => {
    test('should detect test mode from email pattern', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test-secret-key';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false';

      const handler = (await import('../../../api/email/brevo-webhook.js')).default;

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer test-secret-key' },
        body: {
          event: 'delivered',
          email: 'test@example.com', // Test email pattern
          date: new Date().toISOString()
        }
      });

      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });
  });
});
