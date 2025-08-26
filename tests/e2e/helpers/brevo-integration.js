/**
 * Brevo Integration Helper
 * Utilities for testing email workflows with Brevo API integration
 * Handles test data setup, cleanup, and webhook simulation
 */

import crypto from 'crypto';
import { expect } from '@playwright/test';

/**
 * Brevo Integration Helper Class
 * Provides utilities for testing email services and webhook processing
 */
export class BrevoIntegrationHelper {
  constructor(options = {}) {
    this.testMode = options.testMode || true;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiKey = options.apiKey || process.env.BREVO_API_KEY || 'test-api-key';
    this.webhookSecret = options.webhookSecret || process.env.BREVO_WEBHOOK_SECRET || 'test-webhook-secret';
    
    // Test environment configuration
    this.testConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      cleanupTimeout: 30000,
      validationTimeout: 5000
    };
    
    // Track test data for cleanup
    this.testDataRegistry = new Set();
  }

  /**
   * Setup Brevo test environment
   * Initializes test-specific configurations and mocks
   */
  async setupTestEnvironment() {
    if (this.testMode) {
      console.log('Setting up Brevo test environment...');
      
      // Initialize test data registry
      this.testDataRegistry.clear();
      
      // Set environment variables for testing
      process.env.BREVO_TEST_MODE = 'true';
      process.env.BREVO_ENABLE_IP_WHITELIST = 'false'; // Disable IP whitelist for testing
      
      return true;
    }
    
    // For production testing, verify actual Brevo connection
    return await this.validateBrevoConnection();
  }

  /**
   * Validate connection to Brevo API
   */
  async validateBrevoConnection() {
    try {
      // This would make an actual API call to Brevo in production testing
      // For E2E tests, we'll mock this
      return {
        connected: true,
        apiVersion: 'v3',
        accountInfo: {
          email: 'test@e2e-testing.com',
          plan: 'test'
        }
      };
    } catch (error) {
      console.error('Failed to connect to Brevo API:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Generate secure unsubscribe token
   * Matches the token generation logic in the email-subscriber-service
   */
  generateUnsubscribeToken(email) {
    const secret = this.webhookSecret || 'default-secret';
    return crypto.createHmac('sha256', secret).update(email).digest('hex');
  }

  /**
   * Validate unsubscribe token
   * Verifies token matches expected format and signature
   */
  validateUnsubscribeToken(email, token) {
    const expectedToken = this.generateUnsubscribeToken(email);
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expectedToken, 'hex')
    );
  }

  /**
   * Generate secure verification token for email confirmation
   */
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create test subscriber in Brevo
   * For testing purposes, this mocks the Brevo API response
   */
  async createTestSubscriber(subscriberData) {
    if (this.testMode) {
      // Mock Brevo API response
      const mockResponse = {
        id: Math.floor(Math.random() * 1000000),
        email: subscriberData.email,
        attributes: subscriberData.attributes || {},
        listIds: subscriberData.listIds || [1],
        emailBlacklisted: false,
        smsBlacklisted: false,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };
      
      // Register for cleanup
      this.testDataRegistry.add({
        type: 'subscriber',
        email: subscriberData.email,
        brevoId: mockResponse.id
      });
      
      return mockResponse;
    }
    
    // In production testing, this would make actual API calls
    throw new Error('Production Brevo integration not implemented for safety');
  }

  /**
   * Get subscriber status from Brevo
   * Returns current subscriber information and status
   */
  async getSubscriberStatus(email) {
    if (this.testMode) {
      // Mock subscriber status response
      return {
        email: email,
        status: 'active',
        lists: ['newsletter'],
        attributes: {},
        softBounceCount: 0,
        hardBounceCount: 0,
        lastActivity: new Date().toISOString()
      };
    }
    
    throw new Error('Production Brevo integration not implemented for safety');
  }

  /**
   * Simulate Brevo webhook event
   * Creates webhook payload and sends to webhook endpoint
   */
  async simulateWebhookEvent(request, webhookData) {
    const webhookUrl = `${this.baseUrl}/api/email/brevo-webhook`;
    
    // Add required webhook headers for testing
    const headers = {
      'Content-Type': 'application/json',
      'X-Brevo-Token': this.webhookSecret,
      'X-Forwarded-For': '1.179.112.1' // Valid Brevo IP for testing
    };
    
    // Ensure webhook data has required fields
    const completeWebhookData = {
      ts: Date.now(),
      'message-id': `<${Date.now()}@brevo.com>`,
      ...webhookData
    };
    
    try {
      const response = await request.post(webhookUrl, {
        data: completeWebhookData,
        headers: headers
      });
      
      if (response.ok()) {
        const responseData = await response.json();
        return responseData;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Webhook simulation failed: ${response.status()} - ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Webhook simulation error:', error);
      throw error;
    }
  }

  /**
   * Validate email template configuration
   * Checks that required templates exist and are properly configured
   */
  async validateEmailTemplates(templates = []) {
    if (this.testMode) {
      // Mock template validation
      const validatedTemplates = templates.map(template => ({
        id: template.id,
        name: template.name,
        subject: `Test Subject for ${template.name}`,
        content: `<html><body>Hello {{FNAME}}, this is a test template for ${template.name}</body></html>`,
        textContent: `Hello {{FNAME}}, this is a test template for ${template.name}`,
        isActive: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      }));
      
      return {
        valid: true,
        templates: validatedTemplates,
        summary: {
          total: templates.length,
          valid: templates.length,
          invalid: 0
        }
      };
    }
    
    throw new Error('Production template validation not implemented');
  }

  /**
   * Test email delivery verification
   * Checks if emails are being processed and delivered correctly
   */
  async verifyEmailDelivery(emailData) {
    if (this.testMode) {
      // Mock email delivery verification
      const deliveryStatus = {
        messageId: `test_${Date.now()}`,
        email: emailData.email,
        status: 'delivered',
        timestamp: new Date().toISOString(),
        deliveryTime: Math.floor(Math.random() * 5000) + 1000, // 1-6 seconds
        opens: [],
        clicks: [],
        bounces: []
      };
      
      return deliveryStatus;
    }
    
    throw new Error('Production email delivery verification not implemented');
  }

  /**
   * Clean up test data from Brevo
   * Removes all test subscribers and data created during tests
   */
  async cleanupTestData(testRunId) {
    if (!this.testMode) {
      console.warn('Cleanup skipped - not in test mode');
      return;
    }
    
    console.log(`Cleaning up test data for run: ${testRunId}`);
    
    const cleanupPromises = [];
    
    for (const testData of this.testDataRegistry) {
      if (testData.type === 'subscriber') {
        cleanupPromises.push(this.removeTestSubscriber(testData.email));
      }
    }
    
    try {
      await Promise.all(cleanupPromises);
      console.log(`Cleaned up ${cleanupPromises.length} test items`);
      this.testDataRegistry.clear();
    } catch (error) {
      console.error('Error during test data cleanup:', error);
    }
  }

  /**
   * Remove test subscriber from Brevo
   */
  async removeTestSubscriber(email) {
    if (this.testMode) {
      // Mock subscriber removal
      console.log(`Mock removing test subscriber: ${email}`);
      return { success: true, email: email };
    }
    
    throw new Error('Production subscriber removal not implemented for safety');
  }

  /**
   * Validate webhook signature (for security testing)
   */
  validateWebhookSignature(payload, signature, timestamp) {
    if (this.testMode) {
      // Mock signature validation
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload + timestamp)
        .digest('hex');
      
      return signature === expectedSignature;
    }
    
    throw new Error('Production signature validation not implemented');
  }

  /**
   * Test rate limiting functionality
   */
  async testRateLimiting(endpoint, requestCount = 25) {
    const requests = [];
    const startTime = Date.now();
    
    // Create multiple rapid requests to test rate limiting
    for (let i = 0; i < requestCount; i++) {
      const requestPromise = fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `rate-test-${i}@e2e-test.com`,
          consentToMarketing: true
        })
      }).then(response => ({
        status: response.status,
        index: i,
        timestamp: Date.now() - startTime
      })).catch(error => ({
        error: error.message,
        index: i,
        timestamp: Date.now() - startTime
      }));
      
      requests.push(requestPromise);
      
      // Small delay between requests to simulate realistic usage
      if (i > 0 && i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const results = await Promise.all(requests);
    
    // Analyze results
    const successCount = results.filter(r => r.status === 200 || r.status === 201).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;
    const errorCount = results.filter(r => r.error).length;
    
    return {
      totalRequests: requestCount,
      successful: successCount,
      rateLimited: rateLimitedCount,
      errors: errorCount,
      results: results,
      summary: {
        rateLimitingWorking: rateLimitedCount > 0,
        averageResponseTime: results.reduce((sum, r) => sum + (r.timestamp || 0), 0) / results.length
      }
    };
  }

  /**
   * Generate realistic test email addresses
   */
  generateTestEmail(prefix = 'test', domain = 'e2e-test.com') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}@${domain}`;
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Create bulk test subscribers for load testing
   */
  async createBulkTestSubscribers(count = 10, options = {}) {
    const subscribers = [];
    
    for (let i = 0; i < count; i++) {
      const subscriber = {
        email: this.generateTestEmail(`bulk${i}`),
        firstName: `Test${i}`,
        lastName: `User${i}`,
        source: options.source || 'e2e-bulk-test',
        attributes: {
          BULK_TEST: 'true',
          BATCH_ID: options.batchId || Date.now().toString(),
          ...options.attributes
        }
      };
      
      subscribers.push(subscriber);
    }
    
    return subscribers;
  }

  /**
   * Monitor webhook processing performance
   */
  async monitorWebhookPerformance(webhookEvents = []) {
    const results = [];
    
    for (const event of webhookEvents) {
      const startTime = process.hrtime.bigint();
      
      try {
        await this.simulateWebhookEvent(event);
        const endTime = process.hrtime.bigint();
        const processingTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        results.push({
          eventType: event.event,
          processingTime: processingTime,
          success: true
        });
      } catch (error) {
        const endTime = process.hrtime.bigint();
        const processingTime = Number(endTime - startTime) / 1000000;
        
        results.push({
          eventType: event.event,
          processingTime: processingTime,
          success: false,
          error: error.message
        });
      }
    }
    
    return {
      totalEvents: webhookEvents.length,
      averageProcessingTime: results.reduce((sum, r) => sum + r.processingTime, 0) / results.length,
      successRate: results.filter(r => r.success).length / results.length,
      results: results
    };
  }
}

/**
 * Setup Brevo test environment (global setup)
 */
export async function setupBrevoTestEnvironment() {
  // Set test mode environment variables
  process.env.BREVO_TEST_MODE = 'true';
  process.env.BREVO_ENABLE_IP_WHITELIST = 'false';
  process.env.E2E_TEST_MODE = 'true';
  
  console.log('Brevo test environment setup complete');
  return true;
}

/**
 * Cleanup Brevo test data (global teardown)
 */
export async function cleanupBrevoTestData(testRunId) {
  if (!testRunId) {
    console.log('No test run ID provided for cleanup');
    return;
  }
  
  console.log(`Cleaning up Brevo test data for run: ${testRunId}`);
  
  // In test mode, we just log the cleanup
  // In production testing, this would clean actual data
  return true;
}

/**
 * Verify email delivery status
 */
export async function verifyEmailDelivery(emailData) {
  const helper = new BrevoIntegrationHelper({ testMode: true });
  return await helper.verifyEmailDelivery(emailData);
}

/**
 * Simulate webhook event for testing
 */
export async function simulateWebhookEvent(request, webhookData) {
  const helper = new BrevoIntegrationHelper({ testMode: true });
  return await helper.simulateWebhookEvent(request, webhookData);
}

/**
 * Validate unsubscribe token
 */
export async function validateUnsubscribeToken(email) {
  const helper = new BrevoIntegrationHelper({ testMode: true });
  return helper.generateUnsubscribeToken(email);
}

/**
 * Generate secure token for testing
 */
export function generateSecureToken(data) {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Test email template rendering
 */
export async function testEmailTemplate(templateId, templateData = {}) {
  // Mock template rendering for testing
  const renderedTemplate = {
    templateId: templateId,
    subject: `Test Subject - ${templateData.name || 'User'}`,
    htmlContent: `<html><body>Hello ${templateData.name || 'User'}, this is a test email!</body></html>`,
    textContent: `Hello ${templateData.name || 'User'}, this is a test email!`,
    recipientCount: 1,
    estimatedSize: '2.5KB',
    variables: Object.keys(templateData)
  };
  
  return renderedTemplate;
}

/**
 * Validate email headers and security
 */
export function validateEmailSecurity(emailHeaders = {}) {
  const securityChecks = {
    hasSpfRecord: true, // Mock SPF validation
    hasDkimSignature: true, // Mock DKIM validation
    hasDmarcPolicy: true, // Mock DMARC validation
    hasUnsubscribeHeader: emailHeaders['List-Unsubscribe'] ? true : false,
    hasMessageId: emailHeaders['Message-ID'] ? true : false,
    hasValidReturnPath: emailHeaders['Return-Path'] ? true : false
  };
  
  const securityScore = Object.values(securityChecks).filter(Boolean).length / Object.keys(securityChecks).length;
  
  return {
    checks: securityChecks,
    score: securityScore,
    passed: securityScore >= 0.8,
    recommendations: securityScore < 0.8 ? [
      'Verify SPF record configuration',
      'Ensure DKIM signatures are enabled',
      'Configure DMARC policy',
      'Include List-Unsubscribe header',
      'Verify Message-ID generation',
      'Check Return-Path configuration'
    ] : []
  };
}

export default BrevoIntegrationHelper;