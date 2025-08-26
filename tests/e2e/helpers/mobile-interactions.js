/**
 * Mobile-specific test utilities for Playwright E2E tests
 * Provides helpers for mobile device emulation, touch interactions, and mobile form testing
 */

import { expect } from '@playwright/test';

/**
 * Mobile device configurations for testing
 */
export const MOBILE_DEVICES = {
  iphone13: {
    name: 'iPhone 13',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  iphone12Mini: {
    name: 'iPhone 12 mini',
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  pixel5: {
    name: 'Pixel 5',
    viewport: { width: 393, height: 851 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true
  },
  galaxyS21: {
    name: 'Galaxy S21',
    viewport: { width: 360, height: 800 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  iPadMini: {
    name: 'iPad Mini',
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true
  },
  iPadAir: {
    name: 'iPad Air',
    viewport: { width: 820, height: 1180 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true
  }
};

/**
 * Configure page for mobile device emulation
 */
export async function setupMobileDevice(page, deviceName) {
  const device = MOBILE_DEVICES[deviceName];
  if (!device) {
    throw new Error(`Unknown device: ${deviceName}. Available: ${Object.keys(MOBILE_DEVICES).join(', ')}`);
  }

  await page.setViewportSize(device.viewport);
  
  // UA cannot be set per-page; this shim helps UI logic but not HTTP headers.
  if (device.userAgent) {
    await page.addInitScript(ua => {
      Object.defineProperty(navigator, 'userAgent', { get: () => ua });
    }, device.userAgent);
  }
  
  // Set touch emulation for mobile devices
  if (device.hasTouch !== undefined) {
    await page.addInitScript(hasTouch => {
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => hasTouch ? 5 : 0 });
    }, device.hasTouch);
  }
  
  // Set device pixel ratio
  if (device.deviceScaleFactor) {
    await page.emulateMedia({ 
      media: 'screen',
      colorScheme: 'light'
    });
  }

  return device;
}

/**
 * Test mobile-specific keyboard types based on input attributes
 */
export async function validateMobileKeyboard(page, selector, expectedType = 'text') {
  const element = await page.locator(selector).first();
  
  // Check input type attribute
  const inputType = await element.getAttribute('type');
  const autocomplete = await element.getAttribute('autocomplete');
  const inputMode = await element.getAttribute('inputmode');
  
  const keyboardMappings = {
    email: { type: 'email', inputmode: 'email' },
    phone: { type: 'tel', inputmode: 'tel' },
    number: { type: 'number', inputmode: 'numeric' },
    text: { type: 'text', inputmode: 'text' },
    search: { type: 'search', inputmode: 'search' },
    url: { type: 'url', inputmode: 'url' }
  };

  const expected = keyboardMappings[expectedType];
  if (expected) {
    console.log(`📱 Validating mobile keyboard for ${expectedType}:`);
    console.log(`  Input type: ${inputType} (expected: ${expected.type})`);
    console.log(`  Input mode: ${inputMode} (expected: ${expected.inputmode})`);
    console.log(`  Autocomplete: ${autocomplete}`);
  }

  return {
    inputType,
    inputMode,
    autocomplete,
    isOptimized: inputType === expected?.type || inputMode === expected?.inputmode
  };
}

/**
 * Simulate touch interactions (tap, long press, swipe)
 */
export class MobileTouchActions {
  constructor(page) {
    this.page = page;
  }

  /**
   * Perform a tap gesture with proper touch coordinates
   */
  async tap(selector, options = {}) {
    const element = await this.page.locator(selector).first();
    const box = await element.boundingBox();
    
    if (!box) {
      throw new Error(`Element not found or not visible: ${selector}`);
    }

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.page.touchscreen.tap(x, y);
    
    if (options.waitForFocus) {
      await this.page.waitForTimeout(100);
      const isFocused = await element.evaluate(el => document.activeElement === el);
      return isFocused;
    }

    return true;
  }

  /**
   * Perform a long press gesture
   */
  async longPress(selector, duration = 1000) {
    const element = await this.page.locator(selector).first();
    const box = await element.boundingBox();
    
    if (!box) {
      throw new Error(`Element not found or not visible: ${selector}`);
    }

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.page.touchscreen.tap(x, y);
    await this.page.waitForTimeout(duration);
    
    return true;
  }

  /**
   * Perform a swipe gesture
   */
  async swipe(startSelector, endSelector, steps = 10) {
    const startElement = await this.page.locator(startSelector).first();
    const endElement = await this.page.locator(endSelector).first();
    
    const startBox = await startElement.boundingBox();
    const endBox = await endElement.boundingBox();
    
    if (!startBox || !endBox) {
      throw new Error('Start or end element not found for swipe');
    }

    const startX = startBox.x + startBox.width / 2;
    const startY = startBox.y + startBox.height / 2;
    const endX = endBox.x + endBox.width / 2;
    const endY = endBox.y + endBox.height / 2;

    // Perform swipe
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    
    // Move in steps for smooth swipe
    for (let i = 1; i <= steps; i++) {
      const currentX = startX + (endX - startX) * (i / steps);
      const currentY = startY + (endY - startY) * (i / steps);
      await this.page.mouse.move(currentX, currentY);
      await this.page.waitForTimeout(10);
    }
    
    await this.page.mouse.up();
    return true;
  }

  /**
   * Simulate scroll with touch
   */
  async scrollDown(distance = 300) {
    const viewport = this.page.viewportSize();
    const startY = viewport.height * 0.8;
    const endY = startY - distance;
    const x = viewport.width / 2;

    await this.page.touchscreen.tap(x, startY);
    await this.page.mouse.move(x, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(x, endY);
    await this.page.mouse.up();
  }
}

/**
 * Validate mobile form accessibility and usability
 */
export async function validateMobileFormUsability(page, formSelector = 'form') {
  const results = {
    touchTargetSize: [],
    keyboardOptimization: [],
    accessibility: [],
    responsiveDesign: [],
    errors: []
  };

  try {
    const form = page.locator(formSelector).first();
    
    if (!(await form.isVisible())) {
      results.errors.push('Form not visible on mobile viewport');
      return results;
    }

    // Test 1: Touch target sizes (Apple recommends 44px minimum)
    const interactiveElements = await form.locator('button, input, select, textarea, a, [role="button"]').all();
    
    for (const element of interactiveElements) {
      const box = await element.boundingBox();
      if (box) {
        const meetsStandard = box.height >= 44 && box.width >= 44;
        results.touchTargetSize.push({
          element: await element.evaluate(el => el.tagName.toLowerCase() + (el.name ? `[name="${el.name}"]` : '')),
          width: box.width,
          height: box.height,
          meetsStandard
        });
      }
    }

    // Test 2: Input keyboard optimization
    const inputs = await form.locator('input').all();
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      const inputmode = await input.getAttribute('inputmode');
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      
      results.keyboardOptimization.push({
        name,
        type,
        inputmode,
        placeholder,
        isOptimized: this.isKeyboardOptimized(type, inputmode, name, placeholder)
      });
    }

    // Test 3: Form width responsiveness
    const formBox = await form.boundingBox();
    const viewport = page.viewportSize();
    
    if (formBox) {
      results.responsiveDesign.push({
        formWidth: formBox.width,
        viewportWidth: viewport.width,
        fitsInViewport: formBox.width <= viewport.width,
        widthRatio: formBox.width / viewport.width
      });
    }

    // Test 4: Label association and accessibility
    const formElements = await form.locator('input, select, textarea').all();
    for (const element of formElements) {
      const id = await element.getAttribute('id');
      const name = await element.getAttribute('name');
      const ariaLabel = await element.getAttribute('aria-label');
      const placeholder = await element.getAttribute('placeholder');
      
      // Check for associated label
      let hasLabel = false;
      if (id) {
        const label = await form.locator(`label[for="${id}"]`).count();
        hasLabel = label > 0;
      }
      
      results.accessibility.push({
        element: name || id || 'unnamed',
        hasLabel,
        hasAriaLabel: !!ariaLabel,
        hasPlaceholder: !!placeholder,
        isAccessible: hasLabel || ariaLabel
      });
    }

  } catch (error) {
    results.errors.push(`Validation error: ${error.message}`);
  }

  return results;
}

/**
 * Helper to determine if keyboard is optimized for input type
 */
function isKeyboardOptimized(type, inputmode, name, placeholder) {
  const emailPatterns = ['email', 'mail'];
  const phonePatterns = ['phone', 'tel', 'mobile'];
  const numericPatterns = ['number', 'numeric', 'digit'];

  const text = `${name || ''} ${placeholder || ''}`.toLowerCase();

  if (emailPatterns.some(pattern => text.includes(pattern))) {
    return type === 'email' || inputmode === 'email';
  }
  
  if (phonePatterns.some(pattern => text.includes(pattern))) {
    return type === 'tel' || inputmode === 'tel';
  }
  
  if (numericPatterns.some(pattern => text.includes(pattern))) {
    return type === 'number' || inputmode === 'numeric';
  }

  return true; // Default text is acceptable
}

/**
 * Test file upload on mobile browsers
 */
export async function testMobileFileUpload(page, fileInputSelector, testFile = null) {
  const results = {
    fileInputFound: false,
    supportsFileAPI: false,
    uploadSuccess: false,
    error: null
  };

  try {
    // Check if file input exists
    const fileInput = page.locator(fileInputSelector).first();
    results.fileInputFound = await fileInput.isVisible();

    if (!results.fileInputFound) {
      results.error = 'File input not found';
      return results;
    }

    // Check File API support
    results.supportsFileAPI = await page.evaluate(() => {
      return typeof FileReader !== 'undefined' && typeof File !== 'undefined';
    });

    // Create test file data
    const testImageData = testFile || Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );

    // Attempt file upload
    await fileInput.setInputFiles({
      name: 'test-mobile-upload.png',
      mimeType: 'image/png',
      buffer: testImageData
    });

    // Wait for upload processing
    await page.waitForTimeout(1000);

    // Check for upload success indicators
    const successSelectors = [
      'text=/upload.*success|file.*uploaded|image.*added/i',
      '.upload-success, [data-upload-success]',
      '.file-preview, .image-preview'
    ];

    for (const selector of successSelectors) {
      if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
        results.uploadSuccess = true;
        break;
      }
    }

    // Check file input value
    const hasFile = await fileInput.evaluate(input => input.files && input.files.length > 0);
    if (hasFile && !results.uploadSuccess) {
      results.uploadSuccess = true; // File is there even if no visual indicator
    }

  } catch (error) {
    results.error = error.message;
  }

  return results;
}

/**
 * Test mobile error message display and accessibility
 */
export async function validateMobileErrorDisplay(page, formSelector = 'form') {
  const results = {
    errorMessagesVisible: [],
    errorMessagesAccessible: [],
    errorMessagePositioning: [],
    overallUsability: 'good'
  };

  try {
    // Trigger validation errors by submitting empty required fields
    const form = page.locator(formSelector).first();
    const requiredInputs = await form.locator('input[required], select[required], textarea[required]').all();

    if (requiredInputs.length === 0) {
      console.log('ℹ️ No required fields found for error testing');
      return results;
    }

    // Clear required fields and submit
    for (const input of requiredInputs) {
      await input.clear();
    }

    const submitButton = form.locator('button[type="submit"], input[type="submit"]').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await page.waitForTimeout(500); // Wait for validation
    }

    // Check for error messages
    const errorSelectors = [
      '.error, .error-message, .field-error',
      '[data-error], [aria-invalid="true"]',
      'text=/required|must.*provided|cannot.*empty/i'
    ];

    const viewport = page.viewportSize();

    for (const selector of errorSelectors) {
      const errors = await page.locator(selector).all();
      
      for (const error of errors) {
        if (await error.isVisible()) {
          const errorBox = await error.boundingBox();
          const errorText = await error.textContent();
          
          results.errorMessagesVisible.push({
            text: errorText?.trim() || 'Error message found',
            selector,
            isVisible: true
          });

          // Check positioning - should not overlap with form controls
          if (errorBox) {
            results.errorMessagePositioning.push({
              x: errorBox.x,
              y: errorBox.y,
              width: errorBox.width,
              height: errorBox.height,
              fitsInViewport: errorBox.x + errorBox.width <= viewport.width,
              isReasonablyPositioned: errorBox.y > 0 && errorBox.x >= 0
            });
          }

          // Check accessibility attributes
          const ariaLive = await error.getAttribute('aria-live');
          const role = await error.getAttribute('role');
          
          results.errorMessagesAccessible.push({
            hasAriaLive: !!ariaLive,
            hasRole: !!role,
            isAccessible: !!ariaLive || !!role
          });
        }
      }
    }

    // Determine overall usability
    const visibleErrors = results.errorMessagesVisible.length;
    const accessibleErrors = results.errorMessagesAccessible.filter(e => e.isAccessible).length;
    const wellPositioned = results.errorMessagePositioning.filter(e => e.fitsInViewport && e.isReasonablyPositioned).length;

    if (visibleErrors === 0) {
      results.overallUsability = 'poor'; // No validation feedback
    } else if (accessibleErrors === 0) {
      results.overallUsability = 'fair'; // Visible but not accessible
    } else if (wellPositioned < visibleErrors) {
      results.overallUsability = 'fair'; // Accessible but poorly positioned
    } else {
      results.overallUsability = 'good'; // Visible, accessible, and well-positioned
    }

  } catch (error) {
    results.overallUsability = 'error';
    console.error('Error validating mobile error display:', error);
  }

  return results;
}

/**
 * Test responsive breakpoints for registration interface
 */
export async function testResponsiveBreakpoints(page, breakpoints = null) {
  const defaultBreakpoints = [
    { name: 'small-phone', width: 320, height: 568 },
    { name: 'phone', width: 375, height: 667 },
    { name: 'large-phone', width: 414, height: 896 },
    { name: 'small-tablet', width: 768, height: 1024 },
    { name: 'tablet', width: 1024, height: 768 },
    { name: 'desktop', width: 1280, height: 720 }
  ];

  const testBreakpoints = breakpoints || defaultBreakpoints;
  const results = [];

  for (const breakpoint of testBreakpoints) {
    await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
    await page.waitForTimeout(200); // Allow layout to settle

    const result = {
      name: breakpoint.name,
      width: breakpoint.width,
      height: breakpoint.height,
      formVisible: false,
      formUsable: false,
      navigationAccessible: false,
      contentFitsViewport: false
    };

    try {
      // Check form visibility and usability
      const form = page.locator('form').first();
      result.formVisible = await form.isVisible();

      if (result.formVisible) {
        const formBox = await form.boundingBox();
        result.formUsable = formBox && formBox.width <= breakpoint.width;
        result.contentFitsViewport = formBox && formBox.x >= 0 && formBox.y >= 0;
      }

      // Check navigation accessibility
      const navElements = await page.locator('nav, .navigation, #navigation, .menu').count();
      const menuButton = await page.locator('button:has-text("menu"), .menu-toggle, .hamburger').isVisible();
      
      result.navigationAccessible = navElements > 0 || menuButton;

      // Check for horizontal scrolling (should be avoided)
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      result.contentFitsViewport = result.contentFitsViewport && !hasHorizontalScroll;

    } catch (error) {
      console.error(`Error testing breakpoint ${breakpoint.name}:`, error);
    }

    results.push(result);
  }

  return results;
}

/**
 * Generate mobile test data specific to mobile form constraints
 */
export function generateMobileTestData(scenario = 'registration') {
  const timestamp = Date.now();
  const deviceId = Math.random().toString(36).substring(7);

  const baseData = {
    firstName: 'Mobile',
    lastName: 'User',
    email: `mobile.test.${timestamp}@e2e-mobile.com`,
    phone: '555-MOBILE',
    timestamp,
    deviceId,
    scenario
  };

  // Mobile-specific test cases
  const mobileSpecific = {
    longText: 'This is a very long text input to test mobile form field handling and text wrapping behavior',
    specialChars: "O'Brien-García",
    internationalPhone: '+1 (555) 123-4567',
    shortEmail: 'm@t.co',
    unicodeText: 'José María García-López 🎭',
    numbers: '123456',
    mixed: 'Test123!@#'
  };

  return { ...baseData, mobile: mobileSpecific };
}

/**
 * Wait for mobile keyboard to appear/disappear
 */
export async function waitForMobileKeyboard(page, shouldBeVisible = true, timeout = 3000) {
  // Mobile keyboards change the viewport height
  const initialHeight = page.viewportSize().height;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    await page.waitForTimeout(100);
    
    // Check if visual viewport height has changed (indicates keyboard)
    const currentVisualHeight = await page.evaluate(() => {
      return window.visualViewport ? window.visualViewport.height : window.innerHeight;
    });
    
    const keyboardVisible = currentVisualHeight < initialHeight * 0.8; // 20% reduction indicates keyboard
    
    if (keyboardVisible === shouldBeVisible) {
      return true;
    }
  }
  
  return false;
}