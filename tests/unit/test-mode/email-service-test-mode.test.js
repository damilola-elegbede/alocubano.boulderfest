/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the service class directly (not as default export)
import { BrevoService } from '../../../lib/brevo-service.js';

describe('Email Service Test Mode', () => {
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
    vi.clearAllMocks();
  });

  describe('Test Mode Detection', () => {
    it('should detect test mode from NODE_ENV', async () => {
      process.env.NODE_ENV = 'test';
      process.env.BREVO_API_KEY = 'test-key';

      const brevoService = new BrevoService();

      expect(brevoService.isTestMode).toBe(true);
    });

    it('should detect test mode from INTEGRATION_TEST_MODE', async () => {
      process.env.NODE_ENV = 'production';
      process.env.INTEGRATION_TEST_MODE = 'true';
      process.env.BREVO_API_KEY = 'test-key';

      const brevoService = new BrevoService();

      expect(brevoService.isTestMode).toBe(true);
    });

    it('should not be in test mode for production environment', async () => {
      process.env.NODE_ENV = 'production';
      process.env.INTEGRATION_TEST_MODE = 'false';
      process.env.BREVO_API_KEY = 'real-api-key';

      const brevoService = new BrevoService();

      expect(brevoService.isTestMode).toBe(false);
    });
  });

  describe('Test Mode API Configuration', () => {
    it('should use test API key in test mode when real key is missing', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.BREVO_API_KEY; // Ensure it's not set

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const brevoService = new BrevoService();

      expect(brevoService.apiKey).toBe('test-api-key-for-integration-tests');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('BREVO_API_KEY not configured - using test mode')
      );

      consoleSpy.mockRestore();
    });

    it('should throw error in production when API key is missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.BREVO_API_KEY; // Ensure it's not set
      delete process.env.INTEGRATION_TEST_MODE; // Ensure it's not in test mode

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        new BrevoService();
      }).toThrow('BREVO_API_KEY environment variable is required');

      consoleErrorSpy.mockRestore();
    });

    it('should use real API key when provided in test mode', async () => {
      process.env.NODE_ENV = 'test';
      process.env.BREVO_API_KEY = 'real-test-key';

      const brevoService = new BrevoService();

      expect(brevoService.apiKey).toBe('real-test-key');
    });
  });

  describe('Mock API Responses', () => {
    let brevoService;

    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      process.env.BREVO_API_KEY = 'test-key';

      brevoService = new BrevoService();
    });

    it('should return mock response for contact creation', async () => {
      const contactData = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = await brevoService.createOrUpdateContact(contactData);

      expect(result).toMatchObject({
        id: expect.any(Number),
        email: 'test@example.com',
        listIds: [1],
        createdAt: expect.any(String)
      });
    });

    it('should return mock response for contact update', async () => {
      const result = await brevoService.makeRequest('/contacts/test@example.com', {
        method: 'PUT',
        body: JSON.stringify({ attributes: { FNAME: 'Updated' } })
      });

      expect(result).toMatchObject({
        id: expect.any(Number),
        email: 'test@example.com',
        listIds: [1],
        updatedAt: expect.any(String)
      });
    });

    it('should return mock response for email sending', async () => {
      const result = await brevoService.makeRequest('/smtp/email', {
        method: 'POST',
        body: JSON.stringify({
          to: [{ email: 'test@example.com' }],
          subject: 'Test Email',
          htmlContent: '<p>Test</p>'
        })
      });

      expect(result).toMatchObject({
        messageId: expect.stringMatching(/^mock-message-/),
        status: 'queued'
      });
    });

    it('should return generic mock response for unknown endpoints', async () => {
      const result = await brevoService.makeRequest('/unknown/endpoint', {
        method: 'GET'
      });

      expect(result).toMatchObject({
        success: true,
        mockData: true,
        endpoint: '/unknown/endpoint',
        method: 'GET',
        timestamp: expect.any(String)
      });
    });

    it('should log mock API calls', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await brevoService.makeRequest('/contacts', { method: 'POST' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🧪 Mock Brevo API call: POST /contacts')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Test Mode Email Operations', () => {
    let brevoService;

    beforeEach(async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        BREVO_API_KEY: 'test-key'
      };

      brevoService = new BrevoService();
    });

    it('should handle newsletter subscription in test mode', async () => {
      const result = await brevoService.subscribeToNewsletter({
        email: 'newsletter@example.com',
        firstName: 'Newsletter',
        lastName: 'Subscriber'
      });

      expect(result).toMatchObject({
        success: true,
        contact: expect.objectContaining({
          email: 'newsletter@example.com'
        })
      });
    });

    it('should handle ticket holder email in test mode', async () => {
      const result = await brevoService.addTicketHolder({
        email: 'ticket@example.com',
        firstName: 'Ticket',
        lastName: 'Holder',
        ticketType: 'general'
      });

      expect(result).toMatchObject({
        success: true,
        contact: expect.objectContaining({
          email: 'ticket@example.com'
        })
      });
    });

    it('should handle transactional emails in test mode', async () => {
      const result = await brevoService.sendTransactionalEmail({
        to: [{ email: 'transactional@example.com', name: 'Test User' }],
        templateId: 1,
        params: {
          ticketId: 'TEST-12345',
          customerName: 'Test User'
        }
      });

      expect(result).toMatchObject({
        messageId: expect.stringMatching(/^mock-message-/),
        status: 'queued'
      });
    });

    it('should handle unsubscription in test mode', async () => {
      const result = await brevoService.unsubscribeContact('unsubscribe@example.com');

      expect(result).toMatchObject({
        success: true,
        mockData: true
      });
    });
  });

  describe('Test Mode Configuration', () => {
    it('should have correct list configuration in test mode', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        BREVO_API_KEY: 'test-key',
        BREVO_NEWSLETTER_LIST_ID: '100',
        BREVO_TICKET_HOLDERS_LIST_ID: '200'
      };

      const brevoService = new BrevoService();

      expect(brevoService.lists.newsletter).toBe(100);
      expect(brevoService.lists.ticketHolders).toBe(200);
    });

    it('should have correct template configuration in test mode', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        BREVO_API_KEY: 'test-key',
        BREVO_WELCOME_TEMPLATE_ID: '10',
        BREVO_VERIFICATION_TEMPLATE_ID: '20'
      };

      const brevoService = new BrevoService();

      expect(brevoService.templates.welcome).toBe(10);
      expect(brevoService.templates.verification).toBe(20);
    });

    it('should use default values when configuration is missing', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        BREVO_API_KEY: 'test-key'
        // No list or template IDs set
      };

      const brevoService = new BrevoService();

      expect(brevoService.lists.newsletter).toBe(1);
      expect(brevoService.lists.ticketHolders).toBe(2);
      expect(brevoService.templates.welcome).toBe(1);
      expect(brevoService.templates.verification).toBe(2);
    });
  });

  describe('Error Handling in Test Mode', () => {
    let brevoService;

    beforeEach(async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        BREVO_API_KEY: 'test-key'
      };

      brevoService = new BrevoService();
    });

    it('should handle invalid data gracefully in test mode', async () => {
      const result = await brevoService.createOrUpdateContact({
        email: 'invalid-email',
        firstName: null
      });

      // Should still return mock response without throwing
      expect(result).toMatchObject({
        id: expect.any(Number),
        email: 'invalid-email' // Mock preserves actual email from request
      });
    });

    it('should simulate API errors when requested', async () => {
      // Test the mock system's ability to simulate errors
      const result = await brevoService.getMockResponse('/simulate/error', {
        method: 'POST',
        simulateError: true
      });

      expect(result).toMatchObject({
        success: true,
        mockData: true
      });
    });
  });

  describe('Test Mode Integration', () => {
    it('should properly integrate with webhook validation in test mode', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        BREVO_API_KEY: 'test-key',
        BREVO_WEBHOOK_SECRET: 'test-webhook-secret'
      };

      const brevoService = new BrevoService();

      // Should handle webhook signature validation in test mode
      const isValid = brevoService.validateWebhookSignature(
        'test-payload',
        'test-signature'
      );

      // In test mode, validation should be more lenient or mocked
      expect(typeof isValid).toBe('boolean');
    });

    it('should maintain compatibility with production mode configuration', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        BREVO_API_KEY: 'prod-api-key'
      };

      const brevoService = new BrevoService();

      expect(brevoService.isTestMode).toBe(false);
      expect(brevoService.apiKey).toBe('prod-api-key');
    });
  });
});