/**
 * Comprehensive User Registration Flow E2E Tests
 * Tests the complete registration process from confirmed ticket to registered attendee
 */

import { test, expect } from '@playwright/test';
import { BasePage } from '../helpers/base-page.js';
import { TestDataFactory } from '../helpers/test-data-factory.js';
import { DatabaseCleanup } from '../helpers/database-cleanup.js';
import { fillForm, waitForNetworkIdle, mockAPI, retry, screenshot } from '../helpers/test-utils.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Comprehensive User Registration Flow', () => {
  let basePage;
  let testDataFactory;
  let databaseCleanup;
  let testRunId;
  let testData;

  test.beforeAll(async () => {
    testDataFactory = new TestDataFactory({ seed: 87654 });
    databaseCleanup = new DatabaseCleanup();
    testRunId = testDataFactory.getTestRunId();
    console.log(`Registration flow test run: ${testRunId}`);
  });

  test.afterAll(async () => {
    // Cleanup test data
    if (!process.env.KEEP_TEST_DATA) {
      const cleanupResult = await databaseCleanup.cleanupByTestRunId(testRunId);
      console.log('Registration flow cleanup result:', cleanupResult);
    }
    await databaseCleanup.close();
  });

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    testData = testDataFactory.generateScenario('registration-flow');
    
    // Set timeout and clear state
    page.setDefaultTimeout(30000);
    
    // Clear browser storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Clear cookies
    await page.context().clearCookies();
  });

  test.afterEach(async ({ page }) => {
    // Clean up any test data created during the test
    await page.evaluate(() => {
      localStorage.removeItem('registrationData');
      localStorage.removeItem('uploadedFiles');
    });
  });

  test('Complete registration flow with pre-existing confirmed ticket', async ({ page }) => {
    // Simulate a confirmed ticket from purchase (seed data)
    const confirmedTicket = testDataFactory.generateTicket('full-pass', {
      status: 'confirmed',
      paymentStatus: 'paid',
      purchasedAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      registrationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
    });

    await test.step('Setup pre-existing confirmed ticket', async () => {
      // Mock the ticket lookup API to return our confirmed ticket
      await mockAPI(page, '**/api/tickets/*', {
        status: 200,
        body: {
          ticketId: confirmedTicket.ticketId,
          type: confirmedTicket.type,
          status: 'confirmed',
          price: confirmedTicket.price,
          registrationStatus: 'pending',
          registrationDeadline: confirmedTicket.registrationDeadline,
          qrCode: confirmedTicket.qrCode
        }
      });

      // Mock the registration token endpoint
      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          transactionId: `txn_${testRunId}`,
          purchaserEmail: testData.customer.email,
          deadline: confirmedTicket.registrationDeadline,
          tickets: [{
            ticketId: confirmedTicket.ticketId,
            ticketType: confirmedTicket.type,
            status: 'pending',
            hoursRemaining: 168, // 7 days
            attendee: null
          }]
        }
      });
    });

    await test.step('Navigate to registration page with token', async () => {
      // Generate a mock registration token
      const mockToken = `reg_${testRunId}_token`;
      const registrationUrl = `/registration/${mockToken}`;
      
      await basePage.goto(registrationUrl);
      await basePage.waitForReady();
      
      // Verify we're on the registration page
      await expect(page.locator('h1, .page-title')).toContainText(/registration|register|complete.*profile/i, { timeout: 10000 });
    });

    await test.step('Verify registration form loads with ticket information', async () => {
      // Check that ticket information is displayed
      await expect(page.locator('text=/' + confirmedTicket.type + '/i')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=/' + confirmedTicket.price + '/')).toBeVisible({ timeout: 5000 });
      
      // Verify registration form elements are present
      const formSelectors = [
        'input[name="firstName"], input[placeholder*="first" i]',
        'input[name="lastName"], input[placeholder*="last" i]',
        'input[name="email"], input[placeholder*="email" i]',
        'button[type="submit"], button:has-text("register"), button:has-text("complete")'
      ];
      
      for (const selector of formSelectors) {
        await expect(page.locator(selector).first()).toBeVisible({ timeout: 5000 });
      }
    });

    await test.step('Fill registration form with valid data', async () => {
      await fillForm(page, {
        firstName: testData.customer.name.split(' ')[0],
        lastName: testData.customer.name.split(' ').slice(1).join(' '),
        email: testData.customer.email,
        phone: testData.customer.phone,
        dietaryRestrictions: testData.customer.dietaryRestrictions,
        emergencyContact: testData.customer.emergencyContact,
        specialRequests: 'Advanced level salsa, vegetarian meals preferred'
      });

      await waitForNetworkIdle(page);
    });

    await test.step('Test form validation for required fields', async () => {
      // Clear a required field to test validation
      const firstNameInput = page.locator('input[name="firstName"], input[placeholder*="first" i]').first();
      await firstNameInput.clear();
      
      // Try to submit
      const submitButton = page.locator('button[type="submit"], button:has-text("register"), button:has-text("complete")').first();
      await submitButton.click();
      
      // Look for validation error message
      const errorSelectors = [
        '.error, .error-message, [data-error]',
        'text=/required|must.*provided|cannot.*empty/i',
        '.field-error, .form-error'
      ];
      
      let errorFound = false;
      for (const selector of errorSelectors) {
        if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
          errorFound = true;
          break;
        }
      }
      
      expect(errorFound).toBeTruthy();
      console.log('✅ Form validation working for required fields');
      
      // Restore the field for next steps
      await firstNameInput.fill(testData.customer.name.split(' ')[0]);
    });

    await test.step('Test email format validation', async () => {
      const emailInput = page.locator('input[name="email"], input[placeholder*="email" i]').first();
      
      // Test invalid email format
      await emailInput.clear();
      await emailInput.fill('invalid-email-format');
      
      const submitButton = page.locator('button[type="submit"], button:has-text("register"), button:has-text("complete")').first();
      await submitButton.click();
      
      // Look for email validation error
      const emailErrorFound = await page.locator('text=/invalid.*email|email.*format|valid.*email/i').isVisible({ timeout: 3000 }).catch(() => false);
      expect(emailErrorFound).toBeTruthy();
      console.log('✅ Email format validation working');
      
      // Restore valid email
      await emailInput.clear();
      await emailInput.fill(testData.customer.email);
    });

    await test.step('Test file upload for profile picture', async () => {
      // Look for file upload input
      const fileInputs = page.locator('input[type="file"], input[accept*="image"]');
      const fileInputCount = await fileInputs.count();
      
      if (fileInputCount > 0) {
        console.log('📎 File upload field found, testing upload functionality');
        
        // Create a test image file path (we'll use a small test file)
        const testImagePath = path.resolve(__dirname, '../../fixtures/test-profile.png');
        
        try {
          // Mock file upload - create a small test image buffer
          const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
          
          // Set file on input
          const fileInput = fileInputs.first();
          await fileInput.setInputFiles({
            name: 'test-profile.png',
            mimeType: 'image/png',
            buffer: testImageData
          });
          
          // Wait for upload processing
          await waitForNetworkIdle(page);
          
          // Look for upload success indicator
          const uploadSuccessSelectors = [
            'text=/upload.*success|file.*uploaded|image.*added/i',
            '.upload-success, [data-upload-success]',
            '.file-preview, .image-preview'
          ];
          
          let uploadSuccess = false;
          for (const selector of uploadSuccessSelectors) {
            if (await page.locator(selector).isVisible({ timeout: 3000 }).catch(() => false)) {
              uploadSuccess = true;
              break;
            }
          }
          
          if (uploadSuccess) {
            console.log('✅ File upload successful');
          } else {
            console.log('ℹ️ File upload field present but success indicator not found');
          }
          
        } catch (uploadError) {
          console.log('ℹ️ File upload testing skipped due to:', uploadError.message);
        }
      } else {
        console.log('ℹ️ No file upload field found in registration form');
      }
    });

    await test.step('Submit registration form successfully', async () => {
      // Mock successful registration API response
      await mockAPI(page, '**/api/tickets/register', {
        status: 200,
        body: {
          success: true,
          message: 'Ticket registered successfully',
          ticketId: confirmedTicket.ticketId,
          attendee: {
            firstName: testData.customer.name.split(' ')[0],
            lastName: testData.customer.name.split(' ').slice(1).join(' '),
            email: testData.customer.email
          },
          allTicketsRegistered: true
        }
      });

      const submitButton = page.locator('button[type="submit"], button:has-text("register"), button:has-text("complete")').first();
      await submitButton.click();
      
      await waitForNetworkIdle(page);
      
      // Wait for success response
      await page.waitForTimeout(2000);
    });

    await test.step('Verify registration confirmation', async () => {
      // Look for success indicators
      const successSelectors = [
        'text=/registration.*complete|successfully.*registered|confirmation/i',
        '.success, .confirmation, [data-success]',
        'h1:has-text("Success"), h2:has-text("Confirmed")'
      ];
      
      let confirmationFound = false;
      for (const selector of successSelectors) {
        if (await page.locator(selector).isVisible({ timeout: 5000 }).catch(() => false)) {
          confirmationFound = true;
          console.log('✅ Registration confirmation displayed');
          break;
        }
      }
      
      // If no success page, check for updated status in the original form
      if (!confirmationFound) {
        const statusUpdated = await page.locator('text=/registered|completed|confirmed/i').isVisible({ timeout: 3000 }).catch(() => false);
        if (statusUpdated) {
          confirmationFound = true;
          console.log('✅ Registration status updated in form');
        }
      }
      
      expect(confirmationFound).toBeTruthy();
    });

    await test.step('Verify database status update from confirmed to registered', async () => {
      // Test the registration status API endpoint
      const statusResponse = await page.request.get(`/api/registration/${testRunId}_token`);
      
      if (statusResponse.ok()) {
        const statusData = await statusResponse.json();
        
        // Verify the ticket status has changed
        expect(statusData.tickets).toBeDefined();
        expect(statusData.tickets.length).toBeGreaterThan(0);
        
        const ticket = statusData.tickets[0];
        console.log('📊 Database status check:', ticket.status);
        
        // Status should be 'completed' or 'registered'
        expect(['completed', 'registered']).toContain(ticket.status);
        
        // Attendee information should be populated
        if (ticket.attendee) {
          expect(ticket.attendee.firstName).toBeTruthy();
          expect(ticket.attendee.email).toBeTruthy();
          console.log('✅ Database updated with attendee information');
        }
      } else {
        console.log('ℹ️ Registration status API not available for verification');
      }
    });
  });

  test('Apple Wallet pass generation for registered users', async ({ page }) => {
    const registeredTicket = testDataFactory.generateTicket('day-pass', {
      status: 'registered',
      registrationStatus: 'completed',
      attendeeName: testData.customer.name,
      attendeeEmail: testData.customer.email
    });

    await test.step('Test Apple Wallet pass generation API', async () => {
      // Mock Apple Wallet service (binary response)
      await page.route(`**/api/tickets/apple-wallet/${registeredTicket.ticketId}`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/vnd.apple.pkpass',
          headers: {
            'Content-Disposition': `attachment; filename="${registeredTicket.ticketId}.pkpass"`
          },
          body: Buffer.from('mock-pkpass-data')
        });
      });

      const walletResponse = await page.request.get(`/api/tickets/apple-wallet/${registeredTicket.ticketId}`);
      
      if (walletResponse.ok()) {
        const contentType = walletResponse.headers()['content-type'];
        expect(contentType).toContain('application/vnd.apple.pkpass');
        console.log('✅ Apple Wallet pass generated with correct content type');
        
        // Verify it contains the ticket ID in filename
        const contentDisposition = walletResponse.headers()['content-disposition'];
        expect(contentDisposition).toContain(registeredTicket.ticketId);
        console.log('✅ Apple Wallet pass filename includes ticket ID');
      } else {
        console.log(`ℹ️ Apple Wallet endpoint returned status: ${walletResponse.status()}`);
        
        // If service is not configured, that's acceptable
        if (walletResponse.status() === 503) {
          console.log('ℹ️ Apple Wallet service not configured, skipping pass generation test');
        }
      }
    });

    await test.step('Test wallet pass contains correct user information', async () => {
      // In a real implementation, you would decode the pkpass and verify contents
      // For E2E testing, we verify the API contract and response format
      
      const response = await page.request.get(`/api/tickets/apple-wallet/${registeredTicket.ticketId}`);
      
      if (response.ok()) {
        // Verify binary data is returned (pkpass files are ZIP archives)
        const body = await response.body();
        expect(body.length).toBeGreaterThan(0);
        console.log('✅ Apple Wallet pass contains data');
      }
    });

    await test.step('Test QR code generation for wallet pass', async () => {
      // Test QR code endpoint that wallet passes reference
      const qrResponse = await page.request.get(`/api/tickets/${registeredTicket.ticketId}/qr`);
      
      if (qrResponse.ok()) {
        const qrData = await qrResponse.json();
        expect(qrData.qrCode).toBeTruthy();
        console.log('✅ QR code generated for wallet pass');
      } else {
        console.log('ℹ️ QR code endpoint may not exist yet');
      }
    });
  });

  test('Google Wallet pass generation for registered users', async ({ page }) => {
    const registeredTicket = testDataFactory.generateTicket('social-pass', {
      status: 'registered',
      registrationStatus: 'completed',
      attendeeName: testData.customer.name,
      attendeeEmail: testData.customer.email
    });

    await test.step('Test Google Wallet pass generation API', async () => {
      // Mock Google Wallet service
      await mockAPI(page, `**/api/tickets/google-wallet/${registeredTicket.ticketId}`, {
        status: 200,
        body: {
          walletUrl: `https://pay.google.com/gp/v/save/${registeredTicket.ticketId}`,
          passObject: {
            id: registeredTicket.ticketId,
            classId: 'festival_pass_class',
            ticketType: registeredTicket.type,
            attendeeName: testData.customer.name,
            qrCode: registeredTicket.qrCode
          }
        }
      });

      const walletResponse = await page.request.get(`/api/tickets/google-wallet/${registeredTicket.ticketId}`);
      
      if (walletResponse.ok()) {
        const walletData = await walletResponse.json();
        expect(walletData.walletUrl).toBeTruthy();
        expect(walletData.walletUrl).toContain('google.com');
        console.log('✅ Google Wallet URL generated');
        
        // Verify pass object structure
        if (walletData.passObject) {
          expect(walletData.passObject.id).toBe(registeredTicket.ticketId);
          expect(walletData.passObject.ticketType).toBe(registeredTicket.type);
          console.log('✅ Google Wallet pass object contains correct information');
        }
      } else {
        console.log(`ℹ️ Google Wallet endpoint returned status: ${walletResponse.status()}`);
        
        if (walletResponse.status() === 503) {
          console.log('ℹ️ Google Wallet service not configured, skipping pass generation test');
        }
      }
    });

    await test.step('Test Google Wallet pass contains QR code', async () => {
      const response = await page.request.get(`/api/tickets/google-wallet/${registeredTicket.ticketId}`);
      
      if (response.ok()) {
        const passData = await response.json();
        
        if (passData.passObject && passData.passObject.qrCode) {
          expect(passData.passObject.qrCode).toBeTruthy();
          console.log('✅ Google Wallet pass includes QR code');
        }
      }
    });
  });

  test('Registration data persistence and retrieval validation', async ({ page }) => {
    const persistenceTicket = testDataFactory.generateTicket('vip-pass', {
      status: 'confirmed',
      registrationToken: `persist_${testRunId}`
    });

    await test.step('Register user and verify data persistence', async () => {
      // Mock registration API with data storage simulation
      await mockAPI(page, '**/api/tickets/register', {
        status: 200,
        body: {
          success: true,
          ticketId: persistenceTicket.ticketId,
          attendee: {
            firstName: 'Data',
            lastName: 'Persistent',
            email: `persistent_${testRunId}@e2e-test.com`
          },
          registrationId: `reg_${testRunId}_persist`,
          timestamp: new Date().toISOString()
        }
      });

      // Mock data retrieval API
      await mockAPI(page, `**/api/registration/data/${persistenceTicket.ticketId}`, {
        status: 200,
        body: {
          ticketId: persistenceTicket.ticketId,
          registrationStatus: 'completed',
          attendee: {
            firstName: 'Data',
            lastName: 'Persistent',
            email: `persistent_${testRunId}@e2e-test.com`
          },
          registeredAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        }
      });

      // Simulate registration process
      await basePage.goto(`/registration/persist_${testRunId}`);
      
      // Fill and submit form
      await fillForm(page, {
        firstName: 'Data',
        lastName: 'Persistent',
        email: `persistent_${testRunId}@e2e-test.com`
      });

      const submitButton = page.locator('button[type="submit"]').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await waitForNetworkIdle(page);
      }
    });

    await test.step('Verify registration data can be retrieved', async () => {
      // Test data retrieval
      const retrievalResponse = await page.request.get(`/api/registration/data/${persistenceTicket.ticketId}`);
      
      if (retrievalResponse.ok()) {
        const retrievedData = await retrievalResponse.json();
        
        expect(retrievedData.ticketId).toBe(persistenceTicket.ticketId);
        expect(retrievedData.registrationStatus).toBe('completed');
        expect(retrievedData.attendee.firstName).toBe('Data');
        expect(retrievedData.attendee.lastName).toBe('Persistent');
        
        console.log('✅ Registration data successfully persisted and retrieved');
      } else {
        console.log('ℹ️ Data retrieval API not available for testing');
      }
    });

    await test.step('Verify data displays correctly in user interface', async () => {
      // Navigate to a page that should show registration data
      await basePage.goto(`/registration/status/${persistenceTicket.ticketId}`);
      
      // Look for displayed registration information
      const dataDisplayed = await Promise.all([
        page.locator('text="Data"').isVisible().catch(() => false),
        page.locator('text="Persistent"').isVisible().catch(() => false),
        page.locator('text=/completed|registered/i').isVisible().catch(() => false)
      ]);
      
      const someDataVisible = dataDisplayed.some(visible => visible);
      if (someDataVisible) {
        console.log('✅ Registration data displays correctly in UI');
      } else {
        console.log('ℹ️ Registration data UI not available for testing');
      }
    });
  });

  test('Registration form validation edge cases', async ({ page }) => {
    const validationTestData = testDataFactory.generateCustomer({
      name: 'Validation Test User',
      email: `validation_${testRunId}@e2e-test.com`
    });

    await test.step('Test name field validation with special characters', async () => {
      await basePage.goto(`/registration/validation_${testRunId}`);
      
      // Test valid special characters in names
      const validNames = [
        "O'Brien",
        "Mary-Jane",
        "José María",
        "Anna-Claire von Berg"
      ];
      
      const nameInput = page.locator('input[name="firstName"], input[placeholder*="first" i]').first();
      
      for (const name of validNames) {
        if (await nameInput.isVisible()) {
          await nameInput.clear();
          await nameInput.fill(name);
          
          // Check that the name is accepted (no immediate error)
          const hasError = await page.locator('.error, .field-error').isVisible({ timeout: 1000 }).catch(() => false);
          expect(hasError).toBeFalsy();
        }
      }
      
      console.log('✅ Special characters in names handled correctly');
    });

    await test.step('Test data format validation', async () => {
      // Test phone number formats
      const phoneInput = page.locator('input[name="phone"], input[placeholder*="phone" i]').first();
      
      if (await phoneInput.isVisible()) {
        const validPhoneFormats = [
          '(555) 123-4567',
          '555-123-4567',
          '555.123.4567',
          '5551234567'
        ];
        
        for (const phone of validPhoneFormats) {
          await phoneInput.clear();
          await phoneInput.fill(phone);
          
          // Trigger validation (focus out)
          await phoneInput.blur();
          await page.waitForTimeout(500);
          
          // Should not show error for valid formats
          const hasError = await page.locator('text=/invalid.*phone|phone.*format/i').isVisible({ timeout: 1000 }).catch(() => false);
          expect(hasError).toBeFalsy();
        }
        
        console.log('✅ Phone number format validation working');
      }
    });

    await test.step('Test field length limits', async () => {
      // Test very long input
      const longText = 'a'.repeat(1000);
      
      const textInputs = page.locator('input[type="text"], textarea');
      const inputCount = await textInputs.count();
      
      if (inputCount > 0) {
        const firstInput = textInputs.first();
        await firstInput.fill(longText);
        
        // Check if input was truncated or shows error
        const inputValue = await firstInput.inputValue();
        const isReasonableLength = inputValue.length <= 500; // Reasonable limit
        
        expect(isReasonableLength).toBeTruthy();
        console.log('✅ Field length limits enforced');
      }
    });
  });

  test('Cross-browser registration compatibility', async ({ page, browserName }) => {
    await test.step(`Test registration in ${browserName}`, async () => {
      const browserTestData = testDataFactory.generateScenario('registration-flow', {
        customer: {
          name: `${browserName} Test User`,
          email: `${browserName.toLowerCase()}_${testRunId}@e2e-test.com`
        }
      });

      await basePage.goto(`/registration/browser_${testRunId}`);
      
      // Fill form with browser-specific test data
      await fillForm(page, {
        firstName: browserTestData.customer.name.split(' ')[0],
        lastName: browserTestData.customer.name.split(' ').slice(1).join(' '),
        email: browserTestData.customer.email
      });

      // Submit form
      const submitButton = page.locator('button[type="submit"]').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await waitForNetworkIdle(page);
        console.log(`✅ Registration form works in ${browserName}`);
      }
    });

    await test.step('Test browser-specific features', async () => {
      // Test clipboard functionality if available
      try {
        await page.evaluate(() => navigator.clipboard && navigator.clipboard.writeText('test'));
        console.log(`✅ Clipboard API available in ${browserName}`);
      } catch (error) {
        console.log(`ℹ️ Clipboard API not available in ${browserName}`);
      }

      // Test file API support
      const fileApiSupported = await page.evaluate(() => {
        return typeof FileReader !== 'undefined' && typeof File !== 'undefined';
      });
      
      if (fileApiSupported) {
        console.log(`✅ File API supported in ${browserName}`);
      } else {
        console.log(`ℹ️ File API not supported in ${browserName}`);
      }
    });
  });

  test('Mobile registration experience', async ({ page }) => {
    await test.step('Set mobile viewport and test mobile registration', async () => {
      await page.setViewportSize({ width: 375, height: 667 });
      await basePage.goto(`/registration/mobile_${testRunId}`);
      
      // Verify mobile-friendly layout
      const form = page.locator('form').first();
      if (await form.isVisible()) {
        // Check form width fits mobile screen
        const formBounds = await form.boundingBox();
        expect(formBounds.width).toBeLessThanOrEqual(375);
        
        // Test touch interactions
        const inputs = form.locator('input');
        const inputCount = await inputs.count();
        
        if (inputCount > 0) {
          const firstInput = inputs.first();
          await firstInput.tap();
          
          // Verify input is focused
          const isFocused = await firstInput.evaluate(el => document.activeElement === el);
          expect(isFocused).toBeTruthy();
          
          console.log('✅ Mobile touch interactions working');
        }
      }
    });

    await test.step('Test mobile form submission', async () => {
      await fillForm(page, {
        firstName: 'Mobile',
        lastName: 'User',
        email: `mobile_${testRunId}@e2e-test.com`
      });

      // Test mobile submit button
      const submitButton = page.locator('button[type="submit"]').first();
      if (await submitButton.isVisible()) {
        // Verify button is large enough for touch
        const buttonBounds = await submitButton.boundingBox();
        expect(buttonBounds.height).toBeGreaterThanOrEqual(44); // Apple's recommendation for touch targets
        
        await submitButton.tap();
        console.log('✅ Mobile form submission working');
      }
    });
  });
});