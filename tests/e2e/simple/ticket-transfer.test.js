/**
 * Simple Ticket Transfer E2E Test
 * Tests the complete ticket transfer workflow with TURSO_DATABASE_URL
 */

import { test, expect } from '@playwright/test';

test.describe('Ticket Transfer', () => {
  const testTransferEmail = 'transfer-recipient@e2e-test.com';
  const testTransferToken = 'e2e_transfer_token_123';

  test('can initiate ticket transfer', async ({ page }) => {
    // Mock token generation API
    await page.route('**/api/tokens/generate', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          token: testTransferToken,
          expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
        })
      });
    });

    await page.goto('/my-tickets?email=test@e2e-test.com');
    
    // Wait for tickets to load
    await page.waitForSelector('.ticket-card, .ticket-item', { timeout: 10000 });
    
    // Find first transfer button
    const transferButton = page.locator('button:has-text("Transfer"), .transfer-button').first();
    await expect(transferButton).toBeVisible();
    await transferButton.click();
    
    // Check transfer modal opens
    const transferModal = page.locator('#transferModal, .transfer-modal');
    await expect(transferModal).toBeVisible();
    
    console.log('✅ Transfer modal opened');
  });

  test('validates transfer email format', async ({ page }) => {
    await page.goto('/my-tickets?email=test@e2e-test.com');
    
    // Open transfer modal
    const transferButton = page.locator('button:has-text("Transfer")').first();
    await transferButton.click();
    
    // Enter invalid email
    await page.fill('#transferEmail', 'invalid-email');
    await page.fill('#transferFirstName', 'New');
    await page.fill('#transferLastName', 'Attendee');
    
    const submitButton = page.locator('#transferForm button[type="submit"], .transfer-submit');
    await submitButton.click();
    
    // Check HTML5 email validation or custom error
    const emailField = page.locator('#transferEmail');
    const isInvalid = await emailField.evaluate(el => !el.checkValidity());
    expect(isInvalid).toBe(true);
    
    console.log('✅ Email validation working');
  });

  test('can confirm ticket transfer', async ({ page }) => {
    // Mock successful token generation
    await page.route('**/api/tokens/generate', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          token: testTransferToken
        })
      });
    });

    // Mock successful transfer API
    await page.route('**/api/tickets/transfer', route => {
      const request = route.request();
      const postData = request.postDataJSON();
      
      // Validate transfer request structure
      expect(postData).toMatchObject({
        ticketId: expect.any(String),
        actionToken: testTransferToken,
        newAttendee: {
          email: testTransferEmail,
          firstName: expect.any(String)
        }
      });
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ticket: {
            id: postData.ticketId,
            status: 'active',
            attendee_email: testTransferEmail,
            attendee_first_name: postData.newAttendee.firstName
          },
          message: 'Ticket successfully transferred'
        })
      });
    });

    await page.goto('/my-tickets?email=test@e2e-test.com');
    
    // Initiate transfer
    const transferButton = page.locator('button:has-text("Transfer")').first();
    await transferButton.click();
    
    // Fill transfer form
    await page.fill('#transferEmail', testTransferEmail);
    await page.fill('#transferFirstName', 'Jane');
    await page.fill('#transferLastName', 'Doe');
    await page.fill('#transferPhone', '+1-555-0123');
    
    // Submit transfer
    const submitButton = page.locator('#transferForm button[type="submit"]');
    await submitButton.click();
    
    // Wait for success message
    await expect(page.locator('.success-message, .alert-success')).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Transfer completed successfully');
  });

  test('handles transfer notification mock', async ({ page }) => {
    // Mock email notification service
    await page.route('**/api/email/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          success: true, 
          messageId: 'mock-email-123' 
        })
      });
    });

    // Mock transfer with notification
    await page.route('**/api/tickets/transfer', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ticket: {
            id: 'test-ticket-123',
            status: 'transferred',
            attendee_email: testTransferEmail
          },
          notifications: {
            originalOwner: { sent: true, messageId: 'original-123' },
            newOwner: { sent: true, messageId: 'new-456' }
          },
          message: 'Ticket transferred and notifications sent'
        })
      });
    });

    await page.goto('/my-tickets?email=test@e2e-test.com');
    
    // Complete transfer process
    const transferButton = page.locator('button:has-text("Transfer")').first();
    await transferButton.click();
    
    await page.fill('#transferEmail', testTransferEmail);
    await page.fill('#transferFirstName', 'Notify');
    
    const submitButton = page.locator('#transferForm button[type="submit"]');
    await submitButton.click();
    
    // Verify success with notification confirmation
    const successMessage = page.locator('.success-message, .alert-success');
    await expect(successMessage).toBeVisible();
    
    console.log('✅ Transfer notifications mocked successfully');
  });
});