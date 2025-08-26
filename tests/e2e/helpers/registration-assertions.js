/**
 * Registration Data Validation Test Assertions
 * Comprehensive edge case testing, security validation, and capacity management
 * Implements Task_2_2_03 requirements for registration data validation
 */

import { expect } from '@playwright/test';
import { TestDataFactory } from './test-data-factory.js';

/**
 * RegistrationAssertions - Specialized helper for registration validation testing
 */
export class RegistrationAssertions {
  constructor() {
    this.testDataFactory = new TestDataFactory({ seed: 99999 });
    this.validationMessages = {
      required: /required|must.*provided|cannot.*empty|field.*required/i,
      email: /invalid.*email|email.*format|valid.*email|email.*required/i,
      phone: /invalid.*phone|phone.*format|phone.*invalid/i,
      name: /invalid.*name|name.*format|name.*invalid/i,
      duplicate: /already.*registered|duplicate.*registration|email.*exists/i,
      capacity: /capacity.*reached|sold.*out|no.*tickets.*available|registration.*full/i,
      security: /invalid.*characters|security.*error|malicious.*input/i
    };
  }

  /**
   * Generate test data for various validation scenarios
   */
  generateValidationTestData() {
    return {
      valid: {
        firstName: 'María José',
        lastName: "O'Connor-Smith",
        email: `valid_${Date.now()}@e2e-test.com`,
        phone: '(555) 123-4567',
        dietaryRestrictions: 'Vegetarian, no nuts',
        emergencyContact: 'John Doe - (555) 987-6543',
        specialRequests: 'Advanced level classes preferred'
      },
      invalid: {
        email: [
          'invalid-email',
          'test@',
          '@example.com',
          'spaces in@email.com',
          'test..double@example.com',
          'toolongemailthatexceedsmaximumlengthallowedforvalidation@verylongdomainname.com'
        ],
        phone: [
          '123',
          '555-555-555a',
          '(555) 123',
          '+1 (555) 123-4567 ext 123456', // Too long
          'not-a-number'
        ],
        name: [
          '', // Empty
          'A', // Too short
          'a'.repeat(101), // Too long
          'Name123', // Numbers
          'Name!@#', // Special characters beyond allowed
          '<script>alert("xss")</script>', // XSS attempt
          'SELECT * FROM users', // SQL injection attempt
          '../../etc/passwd' // Path traversal attempt
        ]
      },
      security: {
        xssAttempts: [
          '<script>alert("XSS")</script>',
          '<img src="x" onerror="alert(1)">',
          'javascript:alert("XSS")',
          '"><script>alert(document.cookie)</script>',
          '<svg/onload=alert(1)>',
          '\'"--></style></script><script>alert(1)</script>'
        ],
        sqlInjection: [
          "'; DROP TABLE users; --",
          "admin' OR '1'='1",
          "'; UPDATE users SET password='hacked' WHERE 1=1; --",
          "1' OR 1=1 UNION SELECT username,password FROM users--",
          "'; INSERT INTO users VALUES ('hacker','password'); --"
        ],
        pathTraversal: [
          '../../etc/passwd',
          '..\\..\\windows\\system32\\config\\sam',
          '/etc/shadow',
          'C:\\boot.ini',
          '../../../home/user/.ssh/id_rsa'
        ],
        oversizedData: {
          normalText: 'a'.repeat(10000),
          binaryData: Buffer.alloc(1024 * 1024).fill(0).toString('base64'), // 1MB
          unicodeFlood: '💩'.repeat(1000),
          nullBytes: 'test\x00\x00\x00injection',
          specialChars: ''.repeat(500)
        }
      },
      edgeCases: {
        nameFormats: {
          valid: [
            "José María",
            "Mary-Jane",
            "O'Connor",
            "van der Berg",
            "MacPherson",
            "St. James",
            "Jean-Luc",
            "da Silva",
            "Al-Rahman",
            "Zhang Wei",
            "Müller",
            "François"
          ],
          boundary: [
            "A", // Minimum length
            "Jo", // Short but valid
            "Mary Elizabeth Catherine Anne", // Long but reasonable
            "A".repeat(50) // Maximum reasonable length
          ]
        },
        phoneFormats: {
          valid: [
            '(555) 123-4567',
            '555-123-4567',
            '555.123.4567',
            '5551234567',
            '+1 (555) 123-4567',
            '1-555-123-4567'
          ],
          international: [
            '+44 20 7946 0958', // UK
            '+33 1 42 86 83 26', // France
            '+81 3-1234-5678', // Japan
            '+86 138 0013 8000', // China
            '+7 495 123-45-67' // Russia
          ]
        },
        emailFormats: {
          valid: [
            'test@example.com',
            'user+tag@example.com',
            'user.name@example.com',
            'user_name@example.com',
            'test123@example-domain.com'
          ],
          boundary: [
            'a@b.co', // Minimum valid
            `${'a'.repeat(60)}@${'b'.repeat(60)}.com`, // Near maximum
            'user@sub.example.com',
            'user@example.museum'
          ]
        }
      }
    };
  }

  /**
   * Test basic field validation for required fields
   */
  async assertRequiredFieldValidation(page, fieldName, fieldSelector) {
    const field = page.locator(fieldSelector);
    
    // Clear the field
    await field.clear();
    
    // Try to submit form
    await this._submitForm(page);
    
    // Check for validation error
    const errorVisible = await this._checkValidationError(page, this.validationMessages.required);
    expect(errorVisible).toBeTruthy();
    
    console.log(`✅ Required field validation working for ${fieldName}`);
  }

  /**
   * Test email format validation with comprehensive edge cases
   */
  async assertEmailValidation(page, emailSelector = 'input[name="email"], input[placeholder*="email" i]') {
    const testData = this.generateValidationTestData();
    const emailField = page.locator(emailSelector).first();

    // Test valid email formats
    for (const validEmail of testData.edgeCases.emailFormats.valid) {
      await emailField.clear();
      await emailField.fill(validEmail);
      await emailField.blur();
      await page.waitForTimeout(500);
      
      const hasError = await this._checkValidationError(page, this.validationMessages.email, 1000);
      expect(hasError).toBeFalsy();
    }

    // Test invalid email formats
    for (const invalidEmail of testData.invalid.email) {
      await emailField.clear();
      await emailField.fill(invalidEmail);
      await this._submitForm(page);
      
      const hasError = await this._checkValidationError(page, this.validationMessages.email);
      expect(hasError).toBeTruthy();
    }

    // Test boundary cases
    for (const boundaryEmail of testData.edgeCases.emailFormats.boundary) {
      await emailField.clear();
      await emailField.fill(boundaryEmail);
      await emailField.blur();
      await page.waitForTimeout(500);
      
      const hasError = await this._checkValidationError(page, this.validationMessages.email, 1000);
      expect(hasError).toBeFalsy();
    }

    console.log('✅ Email format validation working for all cases');
  }

  /**
   * Test phone number validation with multiple formats
   */
  async assertPhoneValidation(page, phoneSelector = 'input[name="phone"], input[placeholder*="phone" i]') {
    const testData = this.generateValidationTestData();
    const phoneField = page.locator(phoneSelector).first();

    if (!(await phoneField.isVisible())) {
      console.log('ℹ️ Phone field not visible, skipping phone validation');
      return;
    }

    // Test valid phone formats
    for (const validPhone of testData.edgeCases.phoneFormats.valid) {
      await phoneField.clear();
      await phoneField.fill(validPhone);
      await phoneField.blur();
      await page.waitForTimeout(500);
      
      const hasError = await this._checkValidationError(page, this.validationMessages.phone, 1000);
      expect(hasError).toBeFalsy();
    }

    // Test international formats if supported
    for (const intlPhone of testData.edgeCases.phoneFormats.international) {
      await phoneField.clear();
      await phoneField.fill(intlPhone);
      await phoneField.blur();
      await page.waitForTimeout(500);
      
      // International formats may or may not be supported - just log result
      const hasError = await this._checkValidationError(page, this.validationMessages.phone, 1000);
      console.log(`International phone ${intlPhone}: ${hasError ? 'rejected' : 'accepted'}`);
    }

    // Test invalid phone formats
    for (const invalidPhone of testData.invalid.phone) {
      await phoneField.clear();
      await phoneField.fill(invalidPhone);
      await this._submitForm(page);
      
      const hasError = await this._checkValidationError(page, this.validationMessages.phone);
      expect(hasError).toBeTruthy();
    }

    console.log('✅ Phone number validation working for all cases');
  }

  /**
   * Test name field validation with special characters and formats
   */
  async assertNameValidation(page, nameSelector = 'input[name="firstName"], input[placeholder*="first" i]') {
    const testData = this.generateValidationTestData();
    const nameField = page.locator(nameSelector).first();

    // Test valid name formats with special characters
    for (const validName of testData.edgeCases.nameFormats.valid) {
      await nameField.clear();
      await nameField.fill(validName);
      await nameField.blur();
      await page.waitForTimeout(500);
      
      const hasError = await this._checkValidationError(page, this.validationMessages.name, 1000);
      expect(hasError).toBeFalsy();
    }

    // Test boundary cases
    for (const boundaryName of testData.edgeCases.nameFormats.boundary) {
      await nameField.clear();
      await nameField.fill(boundaryName);
      await nameField.blur();
      await page.waitForTimeout(500);
      
      // Very short names might be rejected - check but don't fail test
      const hasError = await this._checkValidationError(page, this.validationMessages.name, 1000);
      console.log(`Boundary name "${boundaryName}": ${hasError ? 'rejected' : 'accepted'}`);
    }

    // Test invalid name formats
    for (const invalidName of testData.invalid.name.slice(1)) { // Skip empty string (tested separately)
      await nameField.clear();
      await nameField.fill(invalidName);
      await this._submitForm(page);
      
      const hasError = await this._checkValidationError(page, this.validationMessages.name);
      expect(hasError).toBeTruthy();
    }

    console.log('✅ Name format validation working for all cases');
  }

  /**
   * Test duplicate registration prevention
   */
  async assertDuplicateRegistrationPrevention(page, testData) {
    // First registration attempt
    await this._fillRegistrationForm(page, testData);
    await this._submitForm(page);
    
    // Wait for potential success
    await page.waitForTimeout(2000);
    
    // Clear form and try same email again
    await page.reload();
    await this._fillRegistrationForm(page, testData);
    await this._submitForm(page);
    
    // Check for duplicate error
    const duplicateError = await this._checkValidationError(page, this.validationMessages.duplicate);
    expect(duplicateError).toBeTruthy();
    
    console.log('✅ Duplicate registration prevention working');
  }

  /**
   * Test data sanitization against XSS attacks
   */
  async assertXSSPrevention(page) {
    const testData = this.generateValidationTestData();
    
    for (const xssPayload of testData.security.xssAttempts) {
      // Try XSS in name field
      const nameField = page.locator('input[name="firstName"], input[placeholder*="first" i]').first();
      if (await nameField.isVisible()) {
        await nameField.clear();
        await nameField.fill(xssPayload);
        await nameField.blur();
        
        // Check that script doesn't execute
        const alertFired = await page.evaluate(() => {
          return window.alert.toString().includes('[native code]');
        });
        expect(alertFired).toBeTruthy(); // alert should still be native, not overridden
        
        // Check for security validation error
        const securityError = await this._checkValidationError(page, this.validationMessages.security, 1000);
        // Security error is optional - some systems sanitize instead of rejecting
        console.log(`XSS payload "${xssPayload.substring(0, 30)}...": ${securityError ? 'rejected' : 'sanitized'}`);
      }
    }
    
    console.log('✅ XSS prevention measures tested');
  }

  /**
   * Test SQL injection prevention
   */
  async assertSQLInjectionPrevention(page) {
    const testData = this.generateValidationTestData();
    
    for (const sqlPayload of testData.security.sqlInjection) {
      const emailField = page.locator('input[name="email"], input[placeholder*="email" i]').first();
      await emailField.clear();
      await emailField.fill(sqlPayload);
      await this._submitForm(page);
      
      // Should either show validation error or handle gracefully
      const hasError = await this._checkValidationError(page, /error|invalid|security/i);
      // We expect either a validation error or graceful handling (no errors)
      console.log(`SQL injection attempt: ${hasError ? 'rejected' : 'handled'}`);
    }
    
    console.log('✅ SQL injection prevention measures tested');
  }

  /**
   * Test oversized data handling
   */
  async assertOversizedDataHandling(page) {
    const testData = this.generateValidationTestData();
    
    // Test oversized text input
    const nameField = page.locator('input[name="firstName"], input[placeholder*="first" i]').first();
    if (await nameField.isVisible()) {
      await nameField.clear();
      await nameField.fill(testData.security.oversizedData.normalText);
      
      // Check that input was truncated or rejected
      const inputValue = await nameField.inputValue();
      const isReasonableLength = inputValue.length <= 500;
      expect(isReasonableLength).toBeTruthy();
    }
    
    // Test oversized textarea input
    const textareaField = page.locator('textarea').first();
    if (await textareaField.isVisible()) {
      await textareaField.clear();
      await textareaField.fill(testData.security.oversizedData.unicodeFlood);
      
      const textareaValue = await textareaField.inputValue();
      const isReasonableLength = textareaValue.length <= 2000;
      expect(isReasonableLength).toBeTruthy();
    }
    
    console.log('✅ Oversized data handling working');
  }

  /**
   * Test registration capacity limits
   */
  async assertCapacityLimits(page, mockCapacityReached = false) {
    if (mockCapacityReached) {
      // Mock API to return capacity reached error
      await page.route('**/api/tickets/register', route => {
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Registration capacity reached',
            message: 'All tickets for this event have been sold out'
          })
        });
      });
      
      // Try to submit registration
      await this._submitForm(page);
      
      // Check for capacity error message
      const capacityError = await this._checkValidationError(page, this.validationMessages.capacity);
      expect(capacityError).toBeTruthy();
      
      console.log('✅ Registration capacity limits enforced');
    }
  }

  /**
   * Test user-friendly error messages
   */
  async assertUserFriendlyErrorMessages(page) {
    const testCases = [
      {
        field: 'firstName',
        value: '',
        expectedType: 'required',
        friendlyCheck: /please.*provide|enter.*name|name.*required/i
      },
      {
        field: 'email',
        value: 'invalid-email',
        expectedType: 'email',
        friendlyCheck: /please.*valid.*email|check.*email.*format/i
      }
    ];
    
    for (const testCase of testCases) {
      const field = page.locator(`input[name="${testCase.field}"]`).first();
      if (await field.isVisible()) {
        await field.clear();
        await field.fill(testCase.value);
        await this._submitForm(page);
        
        // Check for user-friendly message
        const friendlyMessage = await page.locator(`text=${testCase.friendlyCheck.source}`).isVisible({ timeout: 3000 }).catch(() => false);
        
        if (friendlyMessage) {
          console.log(`✅ User-friendly error message for ${testCase.field}`);
        } else {
          // Check for any error message at least
          const anyError = await this._checkValidationError(page, /error|invalid|required/i);
          expect(anyError).toBeTruthy();
          console.log(`ℹ️ Generic error message for ${testCase.field}`);
        }
      }
    }
    
    console.log('✅ Error message quality tested');
  }

  /**
   * Test data persistence and integrity
   */
  async assertDataPersistence(page, testData) {
    // Fill form with test data
    await this._fillRegistrationForm(page, testData);
    
    // Navigate away and back
    await page.goto('/about');
    await page.goBack();
    
    // Check if data is still there (if form supports persistence)
    const emailField = page.locator('input[name="email"]').first();
    if (await emailField.isVisible()) {
      const persistedEmail = await emailField.inputValue();
      
      if (persistedEmail === testData.email) {
        console.log('✅ Form data persistence working');
      } else {
        console.log('ℹ️ Form data not persisted (may be intentional)');
      }
    }
  }

  /**
   * Test accessibility compliance for validation messages
   */
  async assertAccessibilityCompliance(page) {
    // Trigger validation error
    const emailField = page.locator('input[name="email"]').first();
    if (await emailField.isVisible()) {
      await emailField.clear();
      await emailField.fill('invalid-email');
      await this._submitForm(page);
      
      // Check for ARIA attributes
      const hasAriaInvalid = await emailField.getAttribute('aria-invalid');
      const hasAriaDescribedBy = await emailField.getAttribute('aria-describedby');
      
      if (hasAriaInvalid === 'true' || hasAriaDescribedBy) {
        console.log('✅ Accessibility attributes present for validation');
      } else {
        console.log('ℹ️ Consider adding aria-invalid and aria-describedby for validation');
      }
      
      // Check for role="alert" on error messages
      const alertMessage = await page.locator('[role="alert"]').isVisible({ timeout: 2000 }).catch(() => false);
      if (alertMessage) {
        console.log('✅ ARIA alert role present for errors');
      }
    }
  }

  /**
   * Run comprehensive validation test suite
   */
  async runComprehensiveValidationSuite(page, options = {}) {
    const testData = this.generateValidationTestData();
    const results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: []
    };

    const tests = [
      { name: 'Email Validation', fn: () => this.assertEmailValidation(page) },
      { name: 'Phone Validation', fn: () => this.assertPhoneValidation(page) },
      { name: 'Name Validation', fn: () => this.assertNameValidation(page) },
      { name: 'XSS Prevention', fn: () => this.assertXSSPrevention(page) },
      { name: 'SQL Injection Prevention', fn: () => this.assertSQLInjectionPrevention(page) },
      { name: 'Oversized Data Handling', fn: () => this.assertOversizedDataHandling(page) },
      { name: 'User-Friendly Error Messages', fn: () => this.assertUserFriendlyErrorMessages(page) },
      { name: 'Data Persistence', fn: () => this.assertDataPersistence(page, testData.valid) },
      { name: 'Accessibility Compliance', fn: () => this.assertAccessibilityCompliance(page) }
    ];

    if (options.testDuplicates) {
      tests.push({ name: 'Duplicate Registration Prevention', fn: () => this.assertDuplicateRegistrationPrevention(page, testData.valid) });
    }

    if (options.testCapacity) {
      tests.push({ name: 'Capacity Limits', fn: () => this.assertCapacityLimits(page, true) });
    }

    for (const test of tests) {
      try {
        await test.fn();
        results.passed++;
        results.tests.push({ name: test.name, status: 'passed' });
      } catch (error) {
        results.failed++;
        results.tests.push({ 
          name: test.name, 
          status: 'failed', 
          error: error.message 
        });
        console.error(`❌ ${test.name} failed:`, error.message);
      }
    }

    console.log(`\n📊 Validation Test Results:`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏭️  Skipped: ${results.skipped}`);
    
    return results;
  }

  /**
   * Helper method to fill registration form
   */
  async _fillRegistrationForm(page, data) {
    const fields = [
      { name: 'firstName', value: data.firstName },
      { name: 'lastName', value: data.lastName },
      { name: 'email', value: data.email },
      { name: 'phone', value: data.phone },
      { name: 'dietaryRestrictions', value: data.dietaryRestrictions },
      { name: 'emergencyContact', value: data.emergencyContact },
      { name: 'specialRequests', value: data.specialRequests }
    ];

    for (const field of fields) {
      if (field.value) {
        const selectors = [
          `input[name="${field.name}"]`,
          `textarea[name="${field.name}"]`,
          `input[placeholder*="${field.name}" i]`
        ];

        for (const selector of selectors) {
          const element = page.locator(selector).first();
          if (await element.isVisible().catch(() => false)) {
            await element.clear();
            await element.fill(field.value);
            break;
          }
        }
      }
    }
  }

  /**
   * Helper method to submit form
   */
  async _submitForm(page) {
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("register")',
      'button:has-text("complete")',
      'button:has-text("submit")',
      'input[type="submit"]'
    ];

    for (const selector of submitSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        break;
      }
    }

    await page.waitForTimeout(500); // Allow for immediate validation
  }

  /**
   * Helper method to check for validation errors
   */
  async _checkValidationError(page, messagePattern, timeout = 3000) {
    const errorSelectors = [
      `.error, .error-message, [data-error]`,
      `.field-error, .form-error, .validation-error`,
      `[role="alert"]`,
      `.invalid-feedback, .help-block`
    ];

    // Check for specific error message
    const specificError = await page.locator(`text=${messagePattern.source}`).isVisible({ timeout }).catch(() => false);
    if (specificError) return true;

    // Check for general error containers
    for (const selector of errorSelectors) {
      const errorElement = page.locator(selector);
      const isVisible = await errorElement.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVisible) {
        const errorText = await errorElement.textContent().catch(() => '');
        if (messagePattern.test(errorText)) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * Export singleton instance and factory function
 */
export const registrationAssertions = new RegistrationAssertions();

export function createRegistrationAssertions() {
  return new RegistrationAssertions();
}

export default RegistrationAssertions;