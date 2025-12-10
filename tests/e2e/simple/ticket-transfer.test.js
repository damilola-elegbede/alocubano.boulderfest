/**
 * Ticket Transfer E2E Test
 * Tests the complete ticket transfer workflow with email verification flow
 *
 * Updated to work with the React-based my-tickets page that requires:
 * 1. Email entry → verification code sent
 * 2. Code verification → JWT token issued
 * 3. JWT used to fetch tickets
 */

import { test, expect } from '@playwright/test';

test.describe('Ticket Transfer', () => {
  const testEmail = 'test@e2e-test.com';
  const testTransferEmail = 'transfer-recipient@e2e-test.com';
  const testVerificationCode = '123456';
  const testAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAZS1lLXRlc3QuY29tIiwicHVycG9zZSI6InRpY2tldF92aWV3aW5nIiwiaWF0IjoxNzAyMzAwMDAwLCJleHAiOjE3MDIzODY0MDAsImlzcyI6ImFsb2N1YmFuby10aWNrZXRzIn0.mock-signature';
  const testTransferToken = 'e2e_transfer_token_123';

  // Helper to set up authentication mocks and complete verification flow
  async function setupAuthenticatedSession(page) {
    // Mock verification email API
    await page.route('**/api/tickets/verify-email', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Verification code sent',
          expiresIn: 300
        })
      });
    });

    // Mock code verification API - returns JWT token
    await page.route('**/api/tickets/verify-code', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          accessToken: testAccessToken,
          expiresIn: 3600
        })
      });
    });

    // Mock tickets API with JWT token
    await page.route('**/api/tickets?email=**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tickets: [
            {
              ticket_id: 'TKT-E2E-001',
              ticket_type: 'weekend-pass',
              formatted_type: 'Weekend Pass',
              status: 'valid',
              attendee_first_name: 'Test',
              attendee_last_name: 'User',
              attendee_email: testEmail,
              event_date: '2026-05-15',
              scan_count: 0,
              scans_remaining: 3
            },
            {
              ticket_id: 'TKT-E2E-002',
              ticket_type: 'friday-pass',
              formatted_type: 'Friday Pass',
              status: 'valid',
              attendee_first_name: 'Test',
              attendee_last_name: 'User',
              attendee_email: testEmail,
              event_date: '2026-05-15',
              scan_count: 1,
              scans_remaining: 2
            }
          ]
        })
      });
    });

    // Mock QR code images
    await page.route('**/api/tickets/qr-image**', route => {
      // Return a simple 1x1 transparent PNG
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pngBuffer
      });
    });

    // Navigate to my-tickets page
    await page.goto('/my-tickets');

    // Step 1: Enter email
    await page.waitForSelector('#emailInput', { timeout: 10000 });
    await page.fill('#emailInput', testEmail);
    await page.click('#emailForm button[type="submit"]');

    // Step 2: Wait for code step and enter verification code
    await page.waitForSelector('#codeStep:not([style*="display: none"])', { timeout: 5000 });
    await page.fill('#codeInput', testVerificationCode);
    await page.click('#codeForm button[type="submit"]');

    // Step 3: Wait for authenticated view and tickets to load
    await page.waitForSelector('#authenticatedView:not([style*="display: none"])', { timeout: 5000 });
    await page.waitForSelector('.ticket-card', { timeout: 10000 });
  }

  test('can complete full verification flow and see tickets', async ({ page }) => {
    await setupAuthenticatedSession(page);

    // Verify tickets are displayed
    const ticketCards = page.locator('.ticket-card');
    await expect(ticketCards).toHaveCount(2);

    // Verify ticket details are shown
    await expect(page.locator('text=Weekend Pass')).toBeVisible();
    await expect(page.locator('text=Friday Pass')).toBeVisible();

    console.log('✅ Verification flow completed and tickets displayed');
  });

  test('can initiate ticket transfer', async ({ page }) => {
    // Mock token generation API
    await page.route('**/api/tickets/action-token', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          actionToken: testTransferToken,
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        })
      });
    });

    await setupAuthenticatedSession(page);

    // Find first transfer button
    const transferButton = page.locator('.btn-transfer').first();
    await expect(transferButton).toBeVisible();
    await transferButton.click();

    // Check transfer modal opens
    const transferModal = page.locator('#transferModal');
    await expect(transferModal).toBeVisible();

    // Verify modal has required fields
    await expect(page.locator('#transferEmail')).toBeVisible();
    await expect(page.locator('#transferFirstName')).toBeVisible();
    await expect(page.locator('#transferLastName')).toBeVisible();

    console.log('✅ Transfer modal opened');
  });

  test('validates transfer email format', async ({ page }) => {
    await setupAuthenticatedSession(page);

    // Open transfer modal
    const transferButton = page.locator('.btn-transfer').first();
    await transferButton.click();

    // Wait for modal to be visible
    await expect(page.locator('#transferModal')).toBeVisible();

    // Enter invalid email
    await page.fill('#transferEmail', 'invalid-email');
    await page.fill('#transferFirstName', 'New');
    await page.fill('#transferLastName', 'Attendee');

    const submitButton = page.locator('#transferForm button[type="submit"]');
    await submitButton.click();

    // Check HTML5 email validation
    const emailField = page.locator('#transferEmail');
    const isInvalid = await emailField.evaluate(el => !el.checkValidity());
    expect(isInvalid).toBe(true);

    console.log('✅ Email validation working');
  });

  test('can confirm ticket transfer', async ({ page }) => {
    // Mock action token generation
    await page.route('**/api/tickets/action-token', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          actionToken: testTransferToken
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

    await setupAuthenticatedSession(page);

    // Initiate transfer
    const transferButton = page.locator('.btn-transfer').first();
    await transferButton.click();

    // Wait for modal
    await expect(page.locator('#transferModal')).toBeVisible();

    // Fill transfer form
    await page.fill('#transferEmail', testTransferEmail);
    await page.fill('#transferFirstName', 'Jane');
    await page.fill('#transferLastName', 'Doe');
    await page.fill('#transferPhone', '+1-555-0123');

    // Submit transfer
    const submitButton = page.locator('#transferForm button[type="submit"]');
    await submitButton.click();

    // Wait for success message or modal to close
    // The modal closes on submit, and tickets reload
    await expect(page.locator('#transferModal')).toBeHidden({ timeout: 5000 });

    console.log('✅ Transfer completed successfully');
  });

  test('handles transfer notification mock', async ({ page }) => {
    // Mock action token
    await page.route('**/api/tickets/action-token', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          actionToken: testTransferToken
        })
      });
    });

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
            id: 'TKT-E2E-001',
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

    await setupAuthenticatedSession(page);

    // Complete transfer process
    const transferButton = page.locator('.btn-transfer').first();
    await transferButton.click();

    await expect(page.locator('#transferModal')).toBeVisible();

    await page.fill('#transferEmail', testTransferEmail);
    await page.fill('#transferFirstName', 'Notify');
    await page.fill('#transferLastName', 'Recipient');

    const submitButton = page.locator('#transferForm button[type="submit"]');
    await submitButton.click();

    // Modal should close on successful transfer
    await expect(page.locator('#transferModal')).toBeHidden({ timeout: 5000 });

    console.log('✅ Transfer notifications mocked successfully');
  });

  test('can logout and return to email step', async ({ page }) => {
    await setupAuthenticatedSession(page);

    // Click logout button
    const logoutButton = page.locator('#logoutBtn');
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();

    // Should return to email step
    await expect(page.locator('#emailStep')).toBeVisible();
    await expect(page.locator('#authenticatedView')).toBeHidden();

    // Tickets should be cleared
    const ticketCards = page.locator('.ticket-card');
    await expect(ticketCards).toHaveCount(0);

    console.log('✅ Logout functionality working');
  });

  test('handles expired session gracefully', async ({ page }) => {
    // Set up initial authentication
    await page.route('**/api/tickets/verify-email', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, expiresIn: 300 })
      });
    });

    await page.route('**/api/tickets/verify-code', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          accessToken: testAccessToken,
          expiresIn: 3600
        })
      });
    });

    // First call succeeds, second call returns 401 (expired)
    let ticketCallCount = 0;
    await page.route('**/api/tickets?email=**', route => {
      ticketCallCount++;
      if (ticketCallCount === 1) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tickets: [{
              ticket_id: 'TKT-E2E-001',
              ticket_type: 'weekend-pass',
              formatted_type: 'Weekend Pass',
              status: 'valid',
              attendee_first_name: 'Test',
              attendee_last_name: 'User',
              attendee_email: testEmail,
              event_date: '2026-05-15',
              scan_count: 0,
              scans_remaining: 3
            }]
          })
        });
      } else {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Session expired' })
        });
      }
    });

    await page.route('**/api/tickets/qr-image**', route => {
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      route.fulfill({ status: 200, contentType: 'image/png', body: pngBuffer });
    });

    // Complete verification flow
    await page.goto('/my-tickets');
    await page.fill('#emailInput', testEmail);
    await page.click('#emailForm button[type="submit"]');
    await page.waitForSelector('#codeStep:not([style*="display: none"])');
    await page.fill('#codeInput', testVerificationCode);
    await page.click('#codeForm button[type="submit"]');
    await page.waitForSelector('.ticket-card', { timeout: 10000 });

    // Simulate action that triggers another API call with expired token
    // This would happen if user tries to transfer after session expires
    await page.route('**/api/tickets/action-token', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session expired' })
      });
    });

    console.log('✅ Session expiry handling setup complete');
  });
});
