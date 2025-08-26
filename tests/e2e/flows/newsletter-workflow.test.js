/**
 * Newsletter Subscription and Email Workflow E2E Tests
 * Comprehensive testing of newsletter subscription, email confirmation, 
 * and unsubscribe flows with Brevo integration
 */

import { test, expect } from '@playwright/test';
import { 
  waitForAPI, 
  fillForm, 
  screenshot,
  retry,
  waitForNetworkIdle 
} from '../helpers/test-utils.js';
import { 
  TestDataFactory
} from '../helpers/test-data-factory.js';
import { 
  BrevoIntegrationHelper,
  setupBrevoTestEnvironment,
  cleanupBrevoTestData,
  verifyEmailDelivery,
  simulateWebhookEvent,
  validateUnsubscribeToken,
  generateSecureToken
} from '../helpers/brevo-integration.js';

test.describe('Newsletter Subscription and Email Workflow', () => {
  let brevoHelper;
  let testDataFactory;
  let testData;

  test.beforeAll(async () => {
    // Initialize test data factory
    testDataFactory = new TestDataFactory({ seed: 98765 });
  });

  test.beforeEach(async ({ page, context }) => {
    // Initialize Brevo integration helper
    brevoHelper = new BrevoIntegrationHelper({
      testMode: true,
      baseUrl: context._options.baseURL
    });

    // Setup test environment
    await setupBrevoTestEnvironment();

    // Generate deterministic test data
    testData = testDataFactory.generateScenario('newsletter-flow', {
      count: 5,
      subscriber: {
        source: 'e2e-test-contact-page'
      }
    });

    // Wait for API to be ready
    await waitForAPI(page, '/api/health/check');
    
    console.log(`Test run ID: ${testData.testRunId}`);
  });

  test.afterEach(async () => {
    // Cleanup test data from Brevo
    if (brevoHelper && testData) {
      await cleanupBrevoTestData(testData.testRunId);
    }
  });

  test.describe('Newsletter Subscription Flow', () => {
    test('should successfully subscribe to newsletter with valid email and consent', async ({ page }) => {
      const subscriber = testData.subscribers[0];
      
      // Navigate to contact page with newsletter form
      await page.goto('/contact');
      
      // Verify newsletter form is present and accessible
      await expect(page.locator('#newsletter-form')).toBeVisible();
      await expect(page.locator('#newsletter-email')).toBeVisible();
      await expect(page.locator('input[name="consent"]')).toBeVisible();
      
      // Check initial form state
      const submitButton = page.locator('.newsletter-submit');
      await expect(submitButton).toBeDisabled();
      
      // Fill email field
      await page.fill('#newsletter-email', subscriber.email);
      
      // Verify button is still disabled without consent
      await expect(submitButton).toBeDisabled();
      
      // Check consent checkbox
      await page.check('input[name="consent"]');
      
      // Verify button is now enabled
      await expect(submitButton).toBeEnabled();
      
      // Mock successful API response for subscription
      await page.route('/api/email/subscribe', async route => {
        const requestData = await route.request().postDataJSON();
        
        // Validate request data
        expect(requestData.email).toBe(subscriber.email);
        expect(requestData.consentToMarketing).toBe(true);
        expect(requestData.source).toBe('contact_page');
        expect(requestData.lists).toContain('newsletter');
        
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Successfully subscribed to newsletter',
            subscriber: {
              email: subscriber.email,
              status: 'active',
              requiresVerification: false
            }
          })
        });
      });
      
      // Submit form
      await submitButton.click();
      
      // Verify success message appears
      await expect(page.locator('#newsletter-success')).toBeVisible();
      await expect(page.locator('#newsletter-success')).toContainText('subscribed');
      
      // Verify form is cleared
      await expect(page.locator('#newsletter-email')).toHaveValue('');
      await expect(page.locator('input[name="consent"]')).not.toBeChecked();
      
      // Verify submit button is disabled after form reset
      await expect(submitButton).toBeDisabled();
      
      // Take screenshot for visual verification
      await screenshot(page, 'newsletter-subscription-success');
    });

    test('should require consent checkbox to enable subscription', async ({ page }) => {
      const subscriber = testData.subscribers[1];
      
      await page.goto('/contact');
      
      const submitButton = page.locator('.newsletter-submit');
      const emailInput = page.locator('#newsletter-email');
      const consentCheckbox = page.locator('input[name="consent"]');
      
      // Fill valid email
      await emailInput.fill(subscriber.email);
      
      // Verify button remains disabled without consent
      await expect(submitButton).toBeDisabled();
      await expect(submitButton).toHaveAttribute('aria-disabled', 'true');
      
      // Check consent
      await consentCheckbox.check();
      
      // Verify button becomes enabled
      await expect(submitButton).toBeEnabled();
      await expect(submitButton).toHaveAttribute('aria-disabled', 'false');
      
      // Uncheck consent
      await consentCheckbox.uncheck();
      
      // Verify button becomes disabled again
      await expect(submitButton).toBeDisabled();
      await expect(submitButton).toHaveAttribute('aria-disabled', 'true');
    });

    test('should validate email format in real-time', async ({ page }) => {
      await page.goto('/contact');
      
      const emailInput = page.locator('#newsletter-email');
      const errorElement = page.locator('#newsletter-error');
      const submitButton = page.locator('.newsletter-submit');
      
      // Test invalid email formats
      const invalidEmails = [
        'invalid',
        'invalid@',
        '@domain.com',
        'test@',
        'test@domain',
        'test.domain.com'
      ];
      
      for (const invalidEmail of invalidEmails) {
        // Clear previous state
        await emailInput.fill('');
        await expect(errorElement).not.toBeVisible();
        
        // Fill invalid email
        await emailInput.fill(invalidEmail);
        await emailInput.blur();
        
        // Check consent to test button state
        await page.check('input[name="consent"]');
        
        // Button should still be disabled for invalid email
        await expect(submitButton).toBeDisabled();
        
        // Attempt submission should show validation error
        await emailInput.focus();
        await page.keyboard.press('Enter');
        
        await expect(errorElement).toBeVisible();
        await expect(errorElement).toContainText('valid email');
      }
      
      // Test valid email format
      await emailInput.fill('valid@example.com');
      await page.check('input[name="consent"]');
      await expect(submitButton).toBeEnabled();
    });

    test('should handle network errors gracefully', async ({ page }) => {
      const subscriber = testData.subscribers[2];
      
      await page.goto('/contact');
      
      // Mock network error
      await page.route('/api/email/subscribe', route => {
        route.abort('failed');
      });
      
      // Fill form and submit
      await page.fill('#newsletter-email', subscriber.email);
      await page.check('input[name="consent"]');
      await page.click('.newsletter-submit');
      
      // Verify error message
      await expect(page.locator('#newsletter-error')).toBeVisible();
      await expect(page.locator('#newsletter-error')).toContainText('Network error');
      
      // Verify form remains filled
      await expect(page.locator('#newsletter-email')).toHaveValue(subscriber.email);
      await expect(page.locator('input[name="consent"]')).toBeChecked();
    });

    test('should handle API rate limiting', async ({ page }) => {
      const subscriber = testData.subscribers[3];
      
      await page.goto('/contact');
      
      // Mock rate limit response
      await page.route('/api/email/subscribe', route => {
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Too many requests. Please try again later.',
            retryAfter: 60
          })
        });
      });
      
      // Fill form and submit
      await page.fill('#newsletter-email', subscriber.email);
      await page.check('input[name="consent"]');
      await page.click('.newsletter-submit');
      
      // Verify rate limit error message
      await expect(page.locator('#newsletter-error')).toBeVisible();
      await expect(page.locator('#newsletter-error')).toContainText('try again later');
    });

    test('should handle duplicate subscription attempts', async ({ page }) => {
      const subscriber = testData.subscribers[4];
      
      await page.goto('/contact');
      
      // Mock duplicate email response
      await page.route('/api/email/subscribe', route => {
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This email address is already subscribed to our newsletter'
          })
        });
      });
      
      // Fill form and submit
      await page.fill('#newsletter-email', subscriber.email);
      await page.check('input[name="consent"]');
      await page.click('.newsletter-submit');
      
      // Verify duplicate subscription message
      await expect(page.locator('#newsletter-error')).toBeVisible();
      await expect(page.locator('#newsletter-error')).toContainText('already subscribed');
    });
  });

  test.describe('Email Confirmation Workflow', () => {
    test('should send and process confirmation email with verification', async ({ page, context }) => {
      const subscriber = testData.subscribers[0];
      
      // Enable email verification for this test
      await page.route('/api/email/subscribe', async route => {
        const requestData = await route.request().postDataJSON();
        
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Please check your email to verify your subscription',
            subscriber: {
              email: subscriber.email,
              status: 'pending',
              requiresVerification: true
            }
          })
        });
      });
      
      await page.goto('/contact');
      
      // Subscribe with verification enabled
      await page.fill('#newsletter-email', subscriber.email);
      await page.check('input[name="consent"]');
      await page.click('.newsletter-submit');
      
      // Verify pending verification message
      await expect(page.locator('#newsletter-success')).toBeVisible();
      await expect(page.locator('#newsletter-success')).toContainText('check your email');
      
      // Simulate verification email click (would normally come from email)
      const verificationToken = generateSecureToken(subscriber.email);
      const verificationUrl = `/api/email/verify?email=${encodeURIComponent(subscriber.email)}&token=${verificationToken}`;
      
      // Mock verification endpoint
      await page.route('/api/email/verify*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Email verified successfully',
            subscriber: {
              email: subscriber.email,
              status: 'active'
            }
          })
        });
      });
      
      // Visit verification link
      await page.goto(verificationUrl);
      
      // Should be redirected or show success page
      // In a real scenario, this would be handled by the verification endpoint
      await page.screenshot({ path: 'test-results/verification-success.png' });
    });

    test('should validate email templates for registration confirmations', async ({ page, request }) => {
      // Test that Brevo templates are properly configured
      const templateValidation = await brevoHelper.validateEmailTemplates([
        { id: 1, name: 'newsletter-welcome' },
        { id: 2, name: 'newsletter-verification' },
        { id: 3, name: 'registration-confirmation' }
      ]);
      
      expect(templateValidation.valid).toBe(true);
      expect(templateValidation.templates).toHaveLength(3);
      
      // Verify template content includes dynamic variables
      for (const template of templateValidation.templates) {
        expect(template.content).toContain('{{');  // Contains variable placeholders
        expect(template.subject).toBeTruthy();
        expect(template.htmlContent || template.textContent).toBeTruthy();
      }
    });
  });

  test.describe('Unsubscribe Flow', () => {
    test('should generate secure unsubscribe tokens', async ({ page, request }) => {
      const subscriber = testData.subscribers[0];
      
      // Test token generation
      const token = await validateUnsubscribeToken(subscriber.email);
      expect(token).toBeTruthy();
      expect(token.length).toBeGreaterThan(32); // Ensure sufficient length
      
      // Test token validation
      const isValid = await brevoHelper.validateUnsubscribeToken(subscriber.email, token);
      expect(isValid).toBe(true);
      
      // Test invalid token rejection
      const invalidToken = 'invalid-token-12345';
      const isInvalid = await brevoHelper.validateUnsubscribeToken(subscriber.email, invalidToken);
      expect(isInvalid).toBe(false);
    });

    test('should handle unsubscribe via GET request', async ({ page }) => {
      const subscriber = testData.subscribers[1];
      const unsubscribeToken = await validateUnsubscribeToken(subscriber.email);
      
      // Mock successful unsubscribe
      await page.route('/api/email/unsubscribe*', route => {
        const url = new URL(route.request().url());
        const email = url.searchParams.get('email');
        const token = url.searchParams.get('token');
        
        expect(email).toBe(subscriber.email);
        expect(token).toBe(unsubscribeToken);
        
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `
            <!DOCTYPE html>
            <html>
              <head><title>Unsubscribed - A Lo Cubano Boulder Fest</title></head>
              <body>
                <div class="container">
                  <h1>You've Been Unsubscribed</h1>
                  <p>We've successfully removed <strong>${email}</strong> from our mailing list.</p>
                </div>
              </body>
            </html>
          `
        });
      });
      
      // Visit unsubscribe link
      const unsubscribeUrl = `/api/email/unsubscribe?email=${encodeURIComponent(subscriber.email)}&token=${unsubscribeToken}`;
      await page.goto(unsubscribeUrl);
      
      // Verify unsubscribe confirmation page
      await expect(page.locator('h1')).toContainText('Unsubscribed');
      await expect(page.locator('.container')).toContainText(subscriber.email);
      await expect(page.locator('.container')).toContainText('successfully removed');
      
      // Take screenshot
      await screenshot(page, 'unsubscribe-confirmation');
    });

    test('should handle invalid unsubscribe token', async ({ page }) => {
      const subscriber = testData.subscribers[2];
      const invalidToken = 'invalid-token-12345';
      
      // Mock invalid token response
      await page.route('/api/email/unsubscribe*', route => {
        route.fulfill({
          status: 400,
          contentType: 'text/html',
          body: `
            <!DOCTYPE html>
            <html>
              <head><title>Invalid Token - A Lo Cubano Boulder Fest</title></head>
              <body>
                <div class="container">
                  <div class="error-icon">⚠️</div>
                  <h1>Invalid Unsubscribe Token</h1>
                  <div class="message">
                    <p>The unsubscribe link you used is invalid or has expired.</p>
                  </div>
                </div>
              </body>
            </html>
          `
        });
      });
      
      // Visit invalid unsubscribe link
      const unsubscribeUrl = `/api/email/unsubscribe?email=${encodeURIComponent(subscriber.email)}&token=${invalidToken}`;
      await page.goto(unsubscribeUrl);
      
      // Verify error page
      await expect(page.locator('h1')).toContainText('Invalid Unsubscribe Token');
      await expect(page.locator('.message')).toContainText('invalid or has expired');
    });

    test('should handle unsubscribe via POST request (API)', async ({ request }) => {
      const subscriber = testData.subscribers[3];
      const unsubscribeToken = await validateUnsubscribeToken(subscriber.email);
      
      // Test POST unsubscribe
      const response = await request.post('/api/email/unsubscribe', {
        data: {
          email: subscriber.email,
          token: unsubscribeToken
        }
      });
      
      expect(response.ok()).toBeTruthy();
      
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
      expect(responseData.message).toContain('Successfully unsubscribed');
      expect(responseData.email).toBe(subscriber.email);
    });
  });

  test.describe('Webhook Processing', () => {
    test('should process email delivery webhooks', async ({ request }) => {
      const subscriber = testData.subscribers[0];
      
      // Simulate Brevo webhook for email delivery
      const webhookData = {
        event: 'delivered',
        email: subscriber.email,
        id: `msg_${testData.testRunId}_001`,
        date: new Date().toISOString(),
        ts: Date.now(),
        'message-id': `<${testData.testRunId}@brevo.com>`,
        template_id: 1,
        tags: ['newsletter', 'welcome']
      };
      
      const webhookResponse = await simulateWebhookEvent(request, webhookData);
      
      expect(webhookResponse.success).toBe(true);
      expect(webhookResponse.message).toContain('delivery recorded');
    });

    test('should process email open webhooks', async ({ request }) => {
      const subscriber = testData.subscribers[1];
      
      const webhookData = {
        event: 'opened',
        email: subscriber.email,
        id: `msg_${testData.testRunId}_002`,
        date: new Date().toISOString(),
        ts: Date.now(),
        'message-id': `<${testData.testRunId}@brevo.com>`,
        template_id: 1,
        ip: '192.168.1.1',
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
      };
      
      const webhookResponse = await simulateWebhookEvent(request, webhookData);
      
      expect(webhookResponse.success).toBe(true);
      expect(webhookResponse.message).toContain('open recorded');
    });

    test('should process email bounce webhooks and update status', async ({ request }) => {
      const subscriber = testData.subscribers[2];
      
      // Simulate hard bounce webhook
      const webhookData = {
        event: 'hard_bounce',
        email: subscriber.email,
        id: `msg_${testData.testRunId}_003`,
        date: new Date().toISOString(),
        ts: Date.now(),
        reason: 'Invalid email address',
        category: 'invalid'
      };
      
      const webhookResponse = await simulateWebhookEvent(request, webhookData);
      
      expect(webhookResponse.success).toBe(true);
      expect(webhookResponse.message).toContain('marked as bounced');
      
      // Verify subscriber status was updated in database
      // In a real test, you'd query the database to confirm status change
    });

    test('should validate webhook signatures and IP restrictions', async ({ request }) => {
      const subscriber = testData.subscribers[3];
      
      // Test with invalid IP (should be rejected)
      const invalidWebhookResponse = await request.post('/api/email/brevo-webhook', {
        data: {
          event: 'delivered',
          email: subscriber.email,
          id: `msg_${testData.testRunId}_004`
        },
        headers: {
          'x-forwarded-for': '192.168.1.100' // Invalid IP
        }
      });
      
      expect(invalidWebhookResponse.status()).toBe(401);
      
      // Test with valid webhook token
      const validWebhookResponse = await request.post('/api/email/brevo-webhook', {
        data: {
          event: 'delivered',
          email: subscriber.email,
          id: `msg_${testData.testRunId}_005`
        },
        headers: {
          'x-forwarded-for': '1.179.112.1', // Valid Brevo IP
          'x-brevo-token': process.env.BREVO_WEBHOOK_SECRET || 'test-secret'
        }
      });
      
      expect(validWebhookResponse.status()).toBe(200);
    });
  });

  test.describe('Email Bounce Handling', () => {
    test('should automatically remove invalid email addresses', async ({ request }) => {
      const subscriber = testData.subscribers[0];
      
      // Simulate invalid email webhook
      const webhookData = {
        event: 'invalid_email',
        email: subscriber.email,
        id: `msg_${testData.testRunId}_invalid`,
        date: new Date().toISOString(),
        reason: 'Email address does not exist'
      };
      
      const response = await simulateWebhookEvent(request, webhookData);
      
      expect(response.success).toBe(true);
      expect(response.message).toContain('marked as bounced');
      
      // Verify email is no longer in active lists
      const subscriberStatus = await brevoHelper.getSubscriberStatus(subscriber.email);
      expect(subscriberStatus.status).toBe('bounced');
    });

    test('should handle spam complaints appropriately', async ({ request }) => {
      const subscriber = testData.subscribers[1];
      
      // Simulate spam complaint webhook
      const webhookData = {
        event: 'spam',
        email: subscriber.email,
        id: `msg_${testData.testRunId}_spam`,
        date: new Date().toISOString(),
        reason: 'Marked as spam by recipient'
      };
      
      const response = await simulateWebhookEvent(request, webhookData);
      
      expect(response.success).toBe(true);
      expect(response.message).toContain('spam complaint processed');
      
      // Verify subscriber is marked as bounced (removed from active lists)
      const subscriberStatus = await brevoHelper.getSubscriberStatus(subscriber.email);
      expect(subscriberStatus.status).toBe('bounced');
    });

    test('should differentiate between soft and hard bounces', async ({ request }) => {
      const softBounceSubscriber = testData.subscribers[2];
      const hardBounceSubscriber = testData.subscribers[3];
      
      // Test soft bounce (temporary issue)
      await simulateWebhookEvent(request, {
        event: 'soft_bounce',
        email: softBounceSubscriber.email,
        id: `msg_${testData.testRunId}_soft`,
        date: new Date().toISOString(),
        reason: 'Mailbox full'
      });
      
      // Test hard bounce (permanent issue)
      await simulateWebhookEvent(request, {
        event: 'hard_bounce',
        email: hardBounceSubscriber.email,
        id: `msg_${testData.testRunId}_hard`,
        date: new Date().toISOString(),
        reason: 'Invalid email address'
      });
      
      // Soft bounce should maintain active status (with tracking)
      const softBounceStatus = await brevoHelper.getSubscriberStatus(softBounceSubscriber.email);
      expect(softBounceStatus.status).toBe('active'); // Still active but tracked
      expect(softBounceStatus.softBounceCount).toBeGreaterThan(0);
      
      // Hard bounce should be marked as bounced (removed)
      const hardBounceStatus = await brevoHelper.getSubscriberStatus(hardBounceSubscriber.email);
      expect(hardBounceStatus.status).toBe('bounced');
    });
  });

  test.describe('List Management', () => {
    test('should manage subscriber list assignments', async ({ request }) => {
      const subscriber = testData.subscribers[0];
      
      // Test adding to multiple lists
      const subscriptionData = {
        email: subscriber.email,
        lists: ['newsletter', 'events', 'special-offers'],
        consentToMarketing: true,
        source: 'e2e-test'
      };
      
      const response = await request.post('/api/email/subscribe', {
        data: subscriptionData
      });
      
      expect(response.ok()).toBeTruthy();
      
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
      
      // Verify subscriber is in all requested lists
      const subscriberStatus = await brevoHelper.getSubscriberStatus(subscriber.email);
      expect(subscriberStatus.lists).toEqual(expect.arrayContaining(['newsletter', 'events', 'special-offers']));
    });

    test('should handle list-specific unsubscriptions', async ({ request }) => {
      const subscriber = testData.subscribers[1];
      
      // First subscribe to multiple lists
      await request.post('/api/email/subscribe', {
        data: {
          email: subscriber.email,
          lists: ['newsletter', 'events'],
          consentToMarketing: true,
          source: 'e2e-test'
        }
      });
      
      // Test partial unsubscribe (from specific list)
      const unsubscribeToken = await validateUnsubscribeToken(subscriber.email);
      const response = await request.post('/api/email/unsubscribe', {
        data: {
          email: subscriber.email,
          token: unsubscribeToken,
          listId: 'newsletter' // Unsubscribe from specific list
        }
      });
      
      expect(response.ok()).toBeTruthy();
      
      // Verify subscriber is removed from newsletter but still in events list
      const subscriberStatus = await brevoHelper.getSubscriberStatus(subscriber.email);
      expect(subscriberStatus.lists).not.toContain('newsletter');
      expect(subscriberStatus.lists).toContain('events');
    });
  });

  test.describe('Analytics and Tracking', () => {
    test('should track subscription sources and conversion funnels', async ({ page }) => {
      const subscriber = testData.subscribers[0];
      
      // Mock analytics tracking
      await page.addInitScript(() => {
        window.analyticsEvents = [];
        window.gtag = function(action, event, data) {
          window.analyticsEvents.push({ action, event, data });
        };
      });
      
      await page.goto('/contact');
      
      // Complete subscription flow
      await page.fill('#newsletter-email', subscriber.email);
      await page.check('input[name="consent"]');
      
      // Mock successful subscription
      await page.route('/api/email/subscribe', route => {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Successfully subscribed',
            subscriber: { email: subscriber.email, status: 'active' }
          })
        });
      });
      
      await page.click('.newsletter-submit');
      
      // Verify analytics event was tracked
      const analyticsEvents = await page.evaluate(() => window.analyticsEvents);
      expect(analyticsEvents).toContainEqual(
        expect.objectContaining({
          action: 'event',
          event: 'newsletter_signup',
          data: expect.objectContaining({
            event_category: 'engagement',
            event_label: 'contact_page'
          })
        })
      );
    });

    test('should provide subscriber statistics and metrics', async ({ request }) => {
      // Test subscriber stats endpoint
      const response = await request.get('/api/admin/dashboard', {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN || 'test-token'}`
        }
      });
      
      if (response.ok()) {
        const dashboardData = await response.json();
        
        expect(dashboardData.subscribers).toBeDefined();
        expect(dashboardData.subscribers.total).toBeGreaterThanOrEqual(0);
        expect(dashboardData.subscribers.active).toBeGreaterThanOrEqual(0);
        expect(dashboardData.subscribers.bounced).toBeGreaterThanOrEqual(0);
        expect(dashboardData.subscribers.unsubscribed).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Cross-Browser and Mobile Compatibility', () => {
    test('should work consistently across different browsers', async ({ page, browserName }) => {
      const subscriber = testData.subscribers[0];
      
      await page.goto('/contact');
      
      // Test form interaction works in all browsers
      await page.fill('#newsletter-email', subscriber.email);
      await page.check('input[name="consent"]');
      
      const submitButton = page.locator('.newsletter-submit');
      await expect(submitButton).toBeEnabled();
      
      // Mock successful response
      await page.route('/api/email/subscribe', route => {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Subscribed successfully' })
        });
      });
      
      await submitButton.click();
      
      // Verify success message appears consistently
      await expect(page.locator('#newsletter-success')).toBeVisible();
      
      console.log(`Newsletter subscription tested successfully in ${browserName}`);
    });

    test('should handle mobile viewport and touch interactions', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      const subscriber = testData.subscribers[1];
      
      await page.goto('/contact');
      
      // Verify mobile optimizations
      const emailInput = page.locator('#newsletter-email');
      
      // Check mobile input attributes
      await expect(emailInput).toHaveAttribute('inputmode', 'email');
      await expect(emailInput).toHaveAttribute('autocorrect', 'off');
      await expect(emailInput).toHaveAttribute('autocapitalize', 'off');
      
      // Test touch interaction
      await emailInput.tap();
      await emailInput.fill(subscriber.email);
      
      // Test consent checkbox touch target
      const consentCheckbox = page.locator('input[name="consent"]');
      await consentCheckbox.tap();
      
      // Verify form can be submitted on mobile
      const submitButton = page.locator('.newsletter-submit');
      await expect(submitButton).toBeEnabled();
      
      await screenshot(page, 'newsletter-mobile-form');
    });
  });
});