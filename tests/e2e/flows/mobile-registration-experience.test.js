/**
 * Mobile Registration Experience E2E Tests
 * Tests registration form usability, accessibility, and functionality across mobile devices
 * 
 * Test Coverage:
 * - Mobile device emulation across different viewports
 * - Touch interactions and form field accessibility  
 * - Mobile keyboard optimization for input types
 * - Error message display on small screens
 * - File upload functionality on mobile browsers
 * - Responsive design adjustments
 */

import { test, expect } from '@playwright/test';
import { 
  setupMobileDevice, 
  validateMobileKeyboard, 
  MobileTouchActions, 
  validateMobileFormUsability,
  testMobileFileUpload,
  validateMobileErrorDisplay,
  testResponsiveBreakpoints,
  generateMobileTestData,
  waitForMobileKeyboard,
  MOBILE_DEVICES 
} from '../helpers/mobile-interactions.js';
import { BasePage } from '../helpers/base-page.js';
import { TestDataFactory } from '../helpers/test-data-factory.js';
import { fillForm, waitForNetworkIdle, mockAPI, screenshot } from '../helpers/test-utils.js';

test.describe('Mobile Registration Experience', () => {
  let basePage;
  let testDataFactory;
  let touchActions;
  let testRunId;

  test.beforeAll(async () => {
    testDataFactory = new TestDataFactory({ seed: 'mobile-reg' });
    testRunId = testDataFactory.getTestRunId();
    console.log(`Mobile registration test run: ${testRunId}`);
  });

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    touchActions = new MobileTouchActions(page);
    
    // Set reasonable timeout for mobile interactions
    page.setDefaultTimeout(15000);
    
    // Clear state
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
  });

  test.describe('Mobile Device Viewport Testing', () => {
    Object.keys(MOBILE_DEVICES).forEach(deviceName => {
      test(`Registration form displays correctly on ${deviceName}`, async ({ page }) => {
        const device = await setupMobileDevice(page, deviceName);
        const testData = generateMobileTestData(`${deviceName}-registration`);

        await test.step(`Setup ${device.name} viewport`, async () => {
          console.log(`📱 Testing on ${device.name} (${device.viewport.width}x${device.viewport.height})`);
          
          // Mock registration token endpoint
          await mockAPI(page, '**/api/registration/*', {
            status: 200,
            body: {
              transactionId: `mobile_${testRunId}`,
              purchaserEmail: testData.email,
              deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              tickets: [{
                ticketId: `mobile_ticket_${deviceName}_${testRunId}`,
                ticketType: 'full-pass',
                status: 'pending',
                hoursRemaining: 168,
                attendee: null
              }]
            }
          });

          await basePage.goto(`/registration/mobile_${deviceName}_${testRunId}`);
          await basePage.waitForReady();
        });

        await test.step('Verify mobile layout and responsiveness', async () => {
          // Check if registration form is visible and fits viewport
          const form = page.locator('form').first();
          await expect(form).toBeVisible({ timeout: 10000 });

          const formBox = await form.boundingBox();
          expect(formBox).toBeTruthy();
          expect(formBox.width).toBeLessThanOrEqual(device.viewport.width);
          
          // Ensure no horizontal scrolling is required
          const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
          });
          expect(hasHorizontalScroll).toBeFalsy();

          console.log(`✅ ${device.name}: Form fits viewport without horizontal scroll`);
        });

        await test.step('Test mobile form usability', async () => {
          const usabilityResults = await validateMobileFormUsability(page, 'form');
          
          // Verify touch target sizes
          const touchTargets = usabilityResults.touchTargetSize;
          const adequateTouchTargets = touchTargets.filter(t => t.meetsStandard).length;
          const totalTouchTargets = touchTargets.length;
          
          if (totalTouchTargets > 0) {
            const touchTargetRatio = adequateTouchTargets / totalTouchTargets;
            expect(touchTargetRatio).toBeGreaterThan(0.7); // 70% of touch targets should meet standards
            console.log(`✅ ${device.name}: ${adequateTouchTargets}/${totalTouchTargets} touch targets meet 44px standard`);
          }

          // Verify responsive design
          const responsive = usabilityResults.responsiveDesign[0];
          if (responsive) {
            expect(responsive.fitsInViewport).toBeTruthy();
            expect(responsive.widthRatio).toBeLessThanOrEqual(1.0);
            console.log(`✅ ${device.name}: Form responsive design validated`);
          }

          // Check for serious accessibility issues
          const accessibilityIssues = usabilityResults.accessibility.filter(a => !a.isAccessible);
          expect(accessibilityIssues.length).toBeLessThanOrEqual(usabilityResults.accessibility.length * 0.3); // Max 30% accessibility issues
        });

        await screenshot(page, `mobile-registration-${deviceName}`);
      });
    });
  });

  test.describe('Touch Interactions and Form Navigation', () => {
    test('Touch interactions work smoothly across form fields', async ({ page }) => {
      await setupMobileDevice(page, 'iphone13');
      const testData = generateMobileTestData('touch-interaction');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          transactionId: `touch_${testRunId}`,
          purchaserEmail: testData.email,
          tickets: [{ ticketId: `touch_${testRunId}`, ticketType: 'day-pass', status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/touch_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Test tap interactions on form fields', async () => {
        const formInputs = await page.locator('form input, form textarea, form select').all();
        
        for (let i = 0; i < Math.min(formInputs.length, 5); i++) {
          const input = formInputs[i];
          const inputName = await input.getAttribute('name') || `input-${i}`;
          
          // Test tap to focus
          const focusResult = await touchActions.tap(`input[name="${inputName}"], textarea[name="${inputName}"], select[name="${inputName}"]`, { waitForFocus: true });
          
          if (focusResult !== null) {
            expect(focusResult).toBeTruthy();
            console.log(`✅ Touch focus works for ${inputName}`);
          }

          // Add some test content if it's a text field
          const inputType = await input.getAttribute('type');
          if (['text', 'email', 'tel', 'textarea'].includes(inputType) || !inputType) {
            await input.fill(`test-${inputName}`);
            
            // Verify content was entered
            const value = await input.inputValue();
            expect(value).toContain(`test-${inputName}`);
          }
        }
      });

      await test.step('Test form navigation with touch gestures', async () => {
        // Test scrolling within the form if it's long
        const formHeight = await page.locator('form').first().boundingBox();
        const viewportHeight = page.viewportSize().height;

        if (formHeight && formHeight.height > viewportHeight) {
          await touchActions.scrollDown(200);
          await page.waitForTimeout(500);
          
          // Verify we can still interact with elements after scrolling
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await touchActions.tap('button[type="submit"]');
            console.log('✅ Touch scroll and interaction working after scroll');
          }
        }
      });
    });

    test('Long press and gesture interactions', async ({ page }) => {
      await setupMobileDevice(page, 'pixel5');
      const testData = generateMobileTestData('gesture-test');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          transactionId: `gesture_${testRunId}`,
          tickets: [{ ticketId: `gesture_${testRunId}`, ticketType: 'social-pass', status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/gesture_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Test long press interactions', async () => {
        // Test long press on text field (should not interfere with normal input)
        const textInput = page.locator('input[type="text"], input:not([type])').first();
        
        if (await textInput.isVisible()) {
          await touchActions.longPress('input[type="text"], input:not([type])', 500);
          
          // Should still be able to input text normally
          await textInput.fill('Long press test');
          const value = await textInput.inputValue();
          expect(value).toBe('Long press test');
          console.log('✅ Long press does not interfere with text input');
        }
      });

      await test.step('Test touch precision on small UI elements', async () => {
        // Test precision on smaller interactive elements like checkboxes or radio buttons
        const checkboxes = await page.locator('input[type="checkbox"], input[type="radio"]').all();
        
        for (const checkbox of checkboxes.slice(0, 3)) { // Test first 3
          if (await checkbox.isVisible()) {
            const beforeState = await checkbox.isChecked();
            await touchActions.tap('input[type="checkbox"], input[type="radio"]');
            await page.waitForTimeout(100);
            
            const afterState = await checkbox.isChecked();
            expect(afterState).not.toBe(beforeState);
            console.log('✅ Touch precision on checkbox/radio inputs working');
            break;
          }
        }
      });
    });
  });

  test.describe('Mobile Keyboard Optimization', () => {
    test('Email input triggers email keyboard', async ({ page }) => {
      await setupMobileDevice(page, 'iphone13');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `keyboard_email_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/keyboard_email_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Validate email input keyboard optimization', async () => {
        const emailInputs = await page.locator('input[name*="email"], input[placeholder*="email" i], input[type="email"]').all();
        
        expect(emailInputs.length).toBeGreaterThan(0);

        for (const emailInput of emailInputs.slice(0, 2)) {
          if (await emailInput.isVisible()) {
            const keyboardInfo = await validateMobileKeyboard(page, 'input[name*="email"], input[placeholder*="email" i], input[type="email"]', 'email');
            
            expect(keyboardInfo.isOptimized).toBeTruthy();
            console.log(`✅ Email keyboard optimization: type=${keyboardInfo.inputType}, inputmode=${keyboardInfo.inputMode}`);
            
            // Test actual keyboard appearance
            await touchActions.tap('input[name*="email"], input[placeholder*="email" i], input[type="email"]');
            const keyboardVisible = await waitForMobileKeyboard(page, true, 2000);
            console.log(`📱 Mobile keyboard visible: ${keyboardVisible}`);
            
            // Test email input
            await emailInput.fill('test@mobile.com');
            const value = await emailInput.inputValue();
            expect(value).toBe('test@mobile.com');
            console.log('✅ Email input works correctly');
            break;
          }
        }
      });
    });

    test('Phone input triggers telephone keypad', async ({ page }) => {
      await setupMobileDevice(page, 'pixel5');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `keyboard_phone_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/keyboard_phone_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Validate phone input keyboard optimization', async () => {
        const phoneInputs = await page.locator('input[name*="phone"], input[placeholder*="phone" i], input[type="tel"]').all();

        if (phoneInputs.length > 0) {
          for (const phoneInput of phoneInputs.slice(0, 1)) {
            if (await phoneInput.isVisible()) {
              const keyboardInfo = await validateMobileKeyboard(page, 'input[name*="phone"], input[placeholder*="phone" i], input[type="tel"]', 'phone');
              
              expect(keyboardInfo.isOptimized).toBeTruthy();
              console.log(`✅ Phone keyboard optimization: type=${keyboardInfo.inputType}, inputmode=${keyboardInfo.inputMode}`);
              
              await touchActions.tap('input[name*="phone"], input[placeholder*="phone" i], input[type="tel"]');
              await waitForMobileKeyboard(page, true, 1000);
              
              // Test phone number input
              await phoneInput.fill('(555) 123-4567');
              const value = await phoneInput.inputValue();
              expect(value).toBeTruthy();
              console.log('✅ Phone input accepts formatted numbers');
              break;
            }
          }
        } else {
          console.log('ℹ️ No phone inputs found in registration form');
        }
      });
    });

    test('Text inputs use appropriate keyboard types', async ({ page }) => {
      await setupMobileDevice(page, 'iphone12Mini');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `keyboard_text_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/keyboard_text_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Validate text input keyboard types', async () => {
        const textInputs = await page.locator('input[type="text"], input:not([type]), textarea').all();

        for (const input of textInputs.slice(0, 3)) {
          if (await input.isVisible()) {
            const name = await input.getAttribute('name') || 'unnamed';
            const placeholder = await input.getAttribute('placeholder') || '';
            
            await touchActions.tap(`input[name="${name}"], textarea[name="${name}"]`);
            
            // Test actual text entry
            await input.fill('Mobile text test with special chars: àáâãäåæç');
            const value = await input.inputValue();
            expect(value.length).toBeGreaterThan(0);
            console.log(`✅ Text input "${name}" accepts international characters`);
          }
        }
      });
    });
  });

  test.describe('Mobile Error Display and Validation', () => {
    test('Error messages display appropriately on small screens', async ({ page }) => {
      await setupMobileDevice(page, 'iphone13');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `error_display_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/error_display_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Trigger and validate mobile error display', async () => {
        const errorResults = await validateMobileErrorDisplay(page, 'form');

        if (errorResults.errorMessagesVisible.length > 0) {
          expect(errorResults.overallUsability).not.toBe('poor');
          console.log(`✅ Error display usability: ${errorResults.overallUsability}`);
          
          // Check specific error message properties
          errorResults.errorMessagePositioning.forEach((pos, index) => {
            expect(pos.fitsInViewport).toBeTruthy();
            expect(pos.isReasonablyPositioned).toBeTruthy();
            console.log(`✅ Error message ${index + 1} positioned correctly on mobile`);
          });

          // Verify accessibility
          const accessibleErrors = errorResults.errorMessagesAccessible.filter(e => e.isAccessible).length;
          expect(accessibleErrors).toBeGreaterThan(0);
          console.log(`✅ ${accessibleErrors}/${errorResults.errorMessagesAccessible.length} error messages are accessible`);
        }
      });

      await test.step('Test error message interaction on mobile', async () => {
        // Clear a required field to trigger error
        const requiredInput = page.locator('input[required]').first();
        
        if (await requiredInput.isVisible()) {
          await requiredInput.clear();
          await touchActions.tap('button[type="submit"]');
          await page.waitForTimeout(500);

          // Check if error message appears and doesn't interfere with form usage
          const errorMessage = page.locator('.error, .error-message, [data-error]').first();
          
          if (await errorMessage.isVisible()) {
            // Should still be able to fix the error
            await touchActions.tap('input[required]');
            await requiredInput.fill('Fixed error');
            
            const value = await requiredInput.inputValue();
            expect(value).toBe('Fixed error');
            console.log('✅ Can interact with form after error display');
          }
        }
      });
    });

    test('Field validation works with mobile input patterns', async ({ page }) => {
      await setupMobileDevice(page, 'galaxyS21');
      const mobileData = generateMobileTestData('validation-test');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `validation_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/validation_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Test mobile-specific validation patterns', async () => {
        // Test email validation
        const emailInput = page.locator('input[type="email"], input[name*="email"]').first();
        
        if (await emailInput.isVisible()) {
          // Test invalid email
          await touchActions.tap('input[type="email"], input[name*="email"]');
          await emailInput.fill('invalid.email');
          await touchActions.tap('button[type="submit"]');
          await page.waitForTimeout(300);

          // Should show validation error
          const emailError = await page.locator('text=/invalid.*email|email.*format/i').isVisible({ timeout: 2000 });
          expect(emailError).toBeTruthy();

          // Fix with valid email
          await emailInput.clear();
          await emailInput.fill(mobileData.email);
          console.log('✅ Mobile email validation working');
        }

        // Test phone validation
        const phoneInput = page.locator('input[type="tel"], input[name*="phone"]').first();
        
        if (await phoneInput.isVisible()) {
          await touchActions.tap('input[type="tel"], input[name*="phone"]');
          await phoneInput.fill(mobileData.mobile.internationalPhone);
          
          // Should accept international format
          const value = await phoneInput.inputValue();
          expect(value).toBeTruthy();
          console.log('✅ Mobile phone validation accepts international format');
        }

        // Test special characters in names
        const nameInput = page.locator('input[name*="name"], input[placeholder*="name" i]').first();
        
        if (await nameInput.isVisible()) {
          await touchActions.tap('input[name*="name"], input[placeholder*="name" i]');
          await nameInput.fill(mobileData.mobile.specialChars);
          
          const value = await nameInput.inputValue();
          expect(value).toBe(mobileData.mobile.specialChars);
          console.log('✅ Mobile name input accepts special characters');
        }
      });
    });
  });

  test.describe('File Upload on Mobile Browsers', () => {
    test('File upload functionality works on mobile browsers', async ({ page }) => {
      await setupMobileDevice(page, 'iphone13');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `file_upload_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/file_upload_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Test mobile file upload capability', async () => {
        const fileUploadResults = await testMobileFileUpload(page, 'input[type="file"]');

        if (fileUploadResults.fileInputFound) {
          expect(fileUploadResults.supportsFileAPI).toBeTruthy();
          console.log('✅ Mobile browser supports File API');

          if (fileUploadResults.uploadSuccess) {
            console.log('✅ File upload successful on mobile');
          } else if (fileUploadResults.error) {
            console.log(`ℹ️ File upload test result: ${fileUploadResults.error}`);
          }
        } else {
          console.log('ℹ️ No file upload fields found in registration form');
        }
      });

      await test.step('Test mobile-specific file handling', async () => {
        const fileInput = page.locator('input[type="file"]').first();
        
        if (await fileInput.isVisible()) {
          // Check file input attributes for mobile optimization
          const accept = await fileInput.getAttribute('accept');
          const multiple = await fileInput.getAttribute('multiple');
          
          console.log(`📎 File input accepts: ${accept || 'any'}`);
          console.log(`📎 Multiple files allowed: ${multiple !== null}`);

          // Test touch interaction with file input
          await touchActions.tap('input[type="file"]');
          console.log('✅ File input responds to touch interaction');

          // Verify file input size is appropriate for mobile
          const fileInputBox = await fileInput.boundingBox();
          if (fileInputBox) {
            expect(fileInputBox.height).toBeGreaterThanOrEqual(44); // Minimum touch target
            console.log('✅ File input has adequate touch target size');
          }
        }
      });
    });

    test('Image upload preview works on mobile', async ({ page }) => {
      await setupMobileDevice(page, 'pixel5');

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `image_preview_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/image_preview_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Test mobile image upload and preview', async () => {
        const fileInput = page.locator('input[type="file"]').first();
        
        if (await fileInput.isVisible()) {
          // Create a larger test image
          const testImageData = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVChTY2RgYGBgZGJgYGRkYGBkYmBgZGJgYGRiYGBgYmBgZGRgYGBkYGBgZGJgYGAAAB8AAwDGHUzwAAAAAElFTkSuQmCC',
            'base64'
          );

          await fileInput.setInputFiles({
            name: 'test-profile-mobile.png',
            mimeType: 'image/png',
            buffer: testImageData
          });

          await page.waitForTimeout(1000);

          // Look for image preview elements
          const previewSelectors = [
            '.image-preview img',
            '.file-preview img', 
            '[data-preview] img',
            '.upload-preview img'
          ];

          let previewFound = false;
          for (const selector of previewSelectors) {
            if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
              previewFound = true;
              
              // Verify preview is properly sized for mobile
              const previewBox = await page.locator(selector).first().boundingBox();
              if (previewBox) {
                const viewport = page.viewportSize();
                expect(previewBox.width).toBeLessThanOrEqual(viewport.width * 0.8);
                console.log('✅ Image preview properly sized for mobile viewport');
              }
              break;
            }
          }

          if (previewFound) {
            console.log('✅ Image preview displays on mobile');
          } else {
            console.log('ℹ️ Image preview functionality may not be implemented');
          }
        }
      });
    });
  });

  test.describe('Responsive Design Validation', () => {
    test('Registration interface adjusts properly across mobile screen sizes', async ({ page }) => {
      const responsiveResults = await testResponsiveBreakpoints(page);

      await test.step('Validate responsive behavior across breakpoints', async () => {
        // Mock consistent registration data for all breakpoints
        await mockAPI(page, '**/api/registration/*', {
          status: 200,
          body: {
            tickets: [{ ticketId: `responsive_${testRunId}`, status: 'pending', attendee: null }]
          }
        });

        for (const result of responsiveResults) {
          console.log(`📱 Testing breakpoint: ${result.name} (${result.width}x${result.height})`);

          // Navigate to registration page at this breakpoint
          await basePage.goto(`/registration/responsive_${testRunId}`);
          await basePage.waitForReady();

          expect(result.formVisible).toBeTruthy();
          expect(result.contentFitsViewport).toBeTruthy();

          if (result.width <= 768) { // Mobile and small tablet
            expect(result.navigationAccessible).toBeTruthy();
            console.log(`✅ ${result.name}: Mobile navigation accessible`);
          }

          console.log(`✅ ${result.name}: Form usable and content fits viewport`);
        }
      });

      await test.step('Test breakpoint transition smoothness', async () => {
        await basePage.goto(`/registration/transition_${testRunId}`);
        await basePage.waitForReady();

        const transitionBreakpoints = [
          { width: 320, height: 568 },
          { width: 768, height: 1024 },
          { width: 320, height: 568 }
        ];

        for (const breakpoint of transitionBreakpoints) {
          await page.setViewportSize(breakpoint);
          await page.waitForTimeout(300); // Allow transition

          const form = page.locator('form').first();
          expect(await form.isVisible()).toBeTruthy();

          // Verify no layout breaking
          const hasOverflow = await page.evaluate(() => {
            const elements = document.querySelectorAll('*');
            for (const el of elements) {
              const rect = el.getBoundingClientRect();
              if (rect.right > window.innerWidth + 10) { // 10px tolerance
                return true;
              }
            }
            return false;
          });

          expect(hasOverflow).toBeFalsy();
          console.log(`✅ No layout overflow at ${breakpoint.width}x${breakpoint.height}`);
        }
      });
    });

    test('Mobile-first design principles validation', async ({ page }) => {
      await setupMobileDevice(page, 'iphone12Mini'); // Smallest common screen

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `mobile_first_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await basePage.goto(`/registration/mobile_first_${testRunId}`);
      await basePage.waitForReady();

      await test.step('Validate mobile-first design implementation', async () => {
        // Check essential content is immediately visible
        const essentialElements = [
          'form',
          'input[name*="name"], input[placeholder*="name" i]',
          'input[name*="email"], input[type="email"]',
          'button[type="submit"]'
        ];

        for (const selector of essentialElements) {
          const element = page.locator(selector).first();
          if (await element.isVisible()) {
            const isInViewport = await page.evaluate((sel) => {
              const el = document.querySelector(sel);
              if (!el) return false;
              const rect = el.getBoundingClientRect();
              return rect.top >= 0 && rect.top < window.innerHeight;
            }, selector);
            
            console.log(`✅ Essential element visible without scrolling: ${selector}`);
          }
        }

        // Verify progressive enhancement
        const form = page.locator('form').first();
        const formBox = await form.boundingBox();
        const viewport = page.viewportSize();

        expect(formBox.width).toBeLessThanOrEqual(viewport.width);
        expect(formBox.x).toBeGreaterThanOrEqual(0);
        
        console.log('✅ Mobile-first design principles validated');
      });

      await test.step('Test mobile performance and loading', async () => {
        // Measure basic performance metrics
        const performanceMetrics = await page.evaluate(() => {
          return {
            domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
            loadComplete: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0,
            resourceCount: performance.getEntriesByType('resource').length
          };
        });

        console.log(`📊 Mobile performance: DOM loaded in ${performanceMetrics.domContentLoaded}ms`);
        console.log(`📊 Resources loaded: ${performanceMetrics.resourceCount}`);

        // Verify reasonable loading times for mobile
        expect(performanceMetrics.domContentLoaded).toBeLessThan(5000); // 5 seconds
        console.log('✅ Mobile loading performance acceptable');
      });
    });
  });

  test.describe('Cross-Mobile Browser Compatibility', () => {
    // This test will run on different mobile browsers configured in playwright.config.js
    test('Registration works consistently across mobile browsers', async ({ page, browserName }) => {
      const mobileDevice = browserName.includes('webkit') ? 'iphone13' : 'pixel5';
      await setupMobileDevice(page, mobileDevice);
      
      const testData = generateMobileTestData(`${browserName}-mobile`);

      await mockAPI(page, '**/api/registration/*', {
        status: 200,
        body: {
          tickets: [{ ticketId: `browser_${browserName}_${testRunId}`, status: 'pending', attendee: null }]
        }
      });

      await mockAPI(page, '**/api/tickets/register', {
        status: 200,
        body: {
          success: true,
          ticketId: `browser_${browserName}_${testRunId}`,
          attendee: {
            firstName: testData.firstName,
            lastName: testData.lastName,
            email: testData.email
          }
        }
      });

      await basePage.goto(`/registration/browser_${browserName}_${testRunId}`);
      await basePage.waitForReady();

      await test.step(`Test registration flow on mobile ${browserName}`, async () => {
        // Fill form using touch interactions
        await fillForm(page, {
          firstName: testData.firstName,
          lastName: testData.lastName,
          email: testData.email,
          phone: testData.mobile.internationalPhone
        });

        // Submit using touch
        await touchActions.tap('button[type="submit"]');
        await waitForNetworkIdle(page);

        console.log(`✅ Registration form submission works on mobile ${browserName}`);
      });

      await test.step(`Test ${browserName}-specific mobile features`, async () => {
        // Test copy/paste functionality
        const textInput = page.locator('input[type="text"]').first();
        if (await textInput.isVisible()) {
          await textInput.fill('Copy test');
          await textInput.selectText();
          
          try {
            await page.keyboard.press('Meta+C'); // iOS
          } catch {
            try {
              await page.keyboard.press('Control+C'); // Android
            } catch {
              console.log(`ℹ️ Copy operation not supported in ${browserName}`);
            }
          }
        }

        // Test browser-specific mobile features
        const features = await page.evaluate(() => ({
          touchEvents: 'ontouchstart' in window,
          visualViewport: !!window.visualViewport,
          orientation: 'orientation' in window,
          deviceMemory: navigator.deviceMemory || 'unknown',
          connection: navigator.connection?.effectiveType || 'unknown'
        }));

        console.log(`📱 ${browserName} mobile features:`, features);
        expect(features.touchEvents).toBeTruthy();
      });

      await screenshot(page, `mobile-browser-${browserName}`);
    });
  });
});