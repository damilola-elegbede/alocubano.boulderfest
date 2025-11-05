/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '../../../pages/core/about.html');

// Extract just the form HTML without external scripts to avoid loading issues
function extractFormHTML() {
  const fullHtml = readFileSync(htmlPath, 'utf-8');
  // Extract volunteer form section (simplified DOM for testing)
  const formMatch = fullHtml.match(/<form[^>]*id="volunteer-form"[\s\S]*?<\/form>/);

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body>
      ${formMatch ? formMatch[0] : '<form id="volunteer-form"></form>'}
    </body>
    </html>
  `;
}

describe('Volunteer Form Client-Side Validation', () => {
  let firstNameInput, lastNameInput, emailInput;
  let firstNameHint, lastNameHint, emailHint;
  let submitBtn;

  // Validation logic extracted from about.html (lines 830-1016)
  function initializeValidation() {
    const form = document.getElementById('volunteer-form');
    const submitBtn = document.getElementById('volunteerSubmitBtn');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');

    if (!form || !submitBtn || !firstNameInput || !lastNameInput || !emailInput) {
      return; // Elements not found
    }

    // Validation patterns
    const NAME_PATTERN = /^[\p{L}\p{M}\s'\-\.]{2,100}$/u;
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const SPAM_PATTERNS = [
      /^test$/i,
      /^asdf+$/i,
      /^qwerty$/i,
      /^\d+$/,
      /^(.)\1{4,}$/,
      /^http/i
    ];
    const DISPOSABLE_DOMAINS = [
      '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
      'temp-mail.org', 'throwaway.email', 'yopmail.com', 'tempmail.com',
      'trashmail.com', 'getnada.com', 'maildrop.cc'
    ];

    // Helper to show field error
    function showFieldError(fieldId, message) {
      const hintElement = document.getElementById(`${fieldId}-hint`);
      const fieldElement = document.getElementById(fieldId);
      if (hintElement && fieldElement) {
        hintElement.textContent = message;
        hintElement.style.display = 'block';
        hintElement.style.color = '#dc2626';
        fieldElement.style.borderColor = '#dc2626';
        fieldElement.setAttribute('aria-invalid', 'true');
      }
    }

    // Helper to clear field error
    function clearFieldError(fieldId) {
      const hintElement = document.getElementById(`${fieldId}-hint`);
      const fieldElement = document.getElementById(fieldId);
      if (hintElement && fieldElement) {
        hintElement.textContent = '';
        hintElement.style.display = 'none';
        fieldElement.style.borderColor = '';
        fieldElement.setAttribute('aria-invalid', 'false');
      }
    }

    // Validate name field
    function validateName(value, fieldName, fieldId) {
      const trimmed = value.trim();

      if (trimmed.length === 0) {
        return null; // Don't show error for empty field (required will handle it)
      }

      if (trimmed.length < 2) {
        return `${fieldName} must be at least 2 characters`;
      }

      if (trimmed.length > 100) {
        return `${fieldName} must not exceed 100 characters`;
      }

      if (!NAME_PATTERN.test(trimmed)) {
        return `${fieldName} can only contain letters, spaces, hyphens, apostrophes, and periods`;
      }

      // Check spam patterns
      for (const pattern of SPAM_PATTERNS) {
        if (pattern.test(trimmed)) {
          return `Please enter a valid ${fieldName.toLowerCase()}`;
        }
      }

      return null; // Valid
    }

    // Validate email field
    function validateEmailField(value) {
      const trimmed = value.toLowerCase().trim();

      if (trimmed.length === 0) {
        return null; // Don't show error for empty field
      }

      if (!EMAIL_PATTERN.test(trimmed)) {
        return 'Please enter a valid email address (e.g., name@example.com)';
      }

      if (trimmed.includes('..')) {
        return 'Email address cannot contain consecutive dots';
      }

      const domain = trimmed.split('@')[1];
      if (domain && DISPOSABLE_DOMAINS.includes(domain)) {
        return 'Disposable email addresses are not allowed. Please use a permanent email.';
      }

      // Check for common typos
      const typos = {
        'gmai.com': 'gmail.com',
        'gmial.com': 'gmail.com',
        'yaho.com': 'yahoo.com',
        'hotmai.com': 'hotmail.com',
        'outlok.com': 'outlook.com'
      };

      if (domain && typos[domain]) {
        return `Did you mean ${trimmed.replace(domain, typos[domain])}?`;
      }

      return null; // Valid
    }

    // Real-time validation on blur (when user leaves field)
    firstNameInput.addEventListener('blur', function() {
      const error = validateName(this.value, 'First name', 'firstName');
      if (error) {
        showFieldError('firstName', error);
      } else {
        clearFieldError('firstName');
      }
    });

    lastNameInput.addEventListener('blur', function() {
      const error = validateName(this.value, 'Last name', 'lastName');
      if (error) {
        showFieldError('lastName', error);
      } else {
        clearFieldError('lastName');
      }
    });

    emailInput.addEventListener('blur', function() {
      const error = validateEmailField(this.value);
      if (error) {
        showFieldError('email', error);
      } else {
        clearFieldError('email');
      }
    });

    // Clear errors as user types
    firstNameInput.addEventListener('input', function() {
      if (this.value.trim().length > 0) {
        clearFieldError('firstName');
      }
      checkMandatoryFields();
    });

    lastNameInput.addEventListener('input', function() {
      if (this.value.trim().length > 0) {
        clearFieldError('lastName');
      }
      checkMandatoryFields();
    });

    emailInput.addEventListener('input', function() {
      if (this.value.trim().length > 0) {
        clearFieldError('email');
      }
      checkMandatoryFields();
    });

    // Function to check if all mandatory fields are filled
    function checkMandatoryFields() {
      const firstName = firstNameInput.value.trim();
      const lastName = lastNameInput.value.trim();
      const email = emailInput.value.trim();

      // Enable button only if all three mandatory fields are filled
      if (firstName && lastName && email) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
      } else {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
      }
    }

    // Initial check on page load
    checkMandatoryFields();
  }

  beforeEach(() => {
    // Set up minimal DOM with form
    document.body.innerHTML = extractFormHTML();

    // Initialize validation logic
    initializeValidation();

    // Get form elements
    firstNameInput = document.getElementById('firstName');
    lastNameInput = document.getElementById('lastName');
    emailInput = document.getElementById('email');
    firstNameHint = document.getElementById('firstName-hint');
    lastNameHint = document.getElementById('lastName-hint');
    emailHint = document.getElementById('email-hint');
    submitBtn = document.getElementById('volunteerSubmitBtn');
  });

  describe('Name Validation', () => {
    it('should accept valid international names', () => {
      firstNameInput.value = 'María';
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('none');
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('false');
      expect(firstNameInput.style.borderColor).toBe('');
    });

    it('should accept names with apostrophes and hyphens', () => {
      firstNameInput.value = "O'Brien-Smith";
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('none');
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('false');
    });

    it('should reject spam pattern: test', () => {
      firstNameInput.value = 'test';
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('block');
      expect(firstNameHint.textContent).toContain('valid');
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('true');
      expect(firstNameHint.style.color).toBe('#dc2626');
    });

    it('should reject spam pattern: asdf', () => {
      lastNameInput.value = 'asdf';
      lastNameInput.dispatchEvent(new Event('blur'));

      expect(lastNameHint.style.display).toBe('block');
      expect(lastNameHint.textContent).toContain('valid');
      expect(lastNameInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('should reject spam pattern: numeric only', () => {
      firstNameInput.value = '12345';
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('block');
      // Numeric values fail the NAME_PATTERN test, so get a different error message
      expect(firstNameHint.textContent).toBeTruthy();
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('should reject spam pattern: repeated characters', () => {
      firstNameInput.value = 'aaaaa';
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('block');
      expect(firstNameHint.textContent).toContain('valid');
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('should reject spam pattern: qwerty', () => {
      lastNameInput.value = 'qwerty';
      lastNameInput.dispatchEvent(new Event('blur'));

      expect(lastNameHint.style.display).toBe('block');
      expect(lastNameHint.textContent).toContain('valid');
    });

    it('should reject names under 2 characters', () => {
      firstNameInput.value = 'A';
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('block');
      expect(firstNameHint.textContent).toContain('at least 2 characters');
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('should reject SQL injection attempts', () => {
      firstNameInput.value = "'; DROP TABLE users; --";
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('block');
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('should not show error for empty field on blur', () => {
      firstNameInput.value = '';
      firstNameInput.dispatchEvent(new Event('blur'));

      // Empty fields are handled by HTML5 required attribute, not JS validation
      expect(firstNameHint.style.display).toBe('none');
    });
  });

  describe('Email Validation', () => {
    it('should accept valid email formats', () => {
      const validEmails = [
        'test@gmail.com',
        'user.name@yahoo.com',
        'first+last@example.org',
        'email@subdomain.example.com'
      ];

      validEmails.forEach(email => {
        emailInput.value = email;
        emailInput.dispatchEvent(new Event('blur'));

        expect(emailHint.style.display).toBe('none');
        expect(emailInput.getAttribute('aria-invalid')).toBe('false');
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'test@',
        'test@.com',
        'test..user@example.com' // Caught by consecutive dots check
      ];

      invalidEmails.forEach(email => {
        emailInput.value = email;
        emailInput.dispatchEvent(new Event('blur'));

        expect(emailHint.style.display).toBe('block');
        expect(emailInput.getAttribute('aria-invalid')).toBe('true');
      });
    });

    it('should reject consecutive dots in email', () => {
      emailInput.value = 'test..user@example.com';
      emailInput.dispatchEvent(new Event('blur'));

      expect(emailHint.style.display).toBe('block');
      expect(emailHint.textContent).toContain('consecutive dots');
      expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('should reject disposable email domains', () => {
      const disposableEmails = [
        'test@10minutemail.com',
        'user@guerrillamail.com',
        'temp@mailinator.com',
        'throw@tempmail.com'
      ];

      disposableEmails.forEach(email => {
        emailInput.value = email;
        emailInput.dispatchEvent(new Event('blur'));

        expect(emailHint.style.display).toBe('block');
        expect(emailHint.textContent).toContain('Disposable email');
        expect(emailInput.getAttribute('aria-invalid')).toBe('true');
      });
    });

    it('should suggest corrections for common typos', () => {
      const typos = [
        { typo: 'test@gmai.com', suggestion: 'gmail.com' },
        { typo: 'test@gmial.com', suggestion: 'gmail.com' },
        { typo: 'test@yaho.com', suggestion: 'yahoo.com' }
      ];

      typos.forEach(({ typo, suggestion }) => {
        emailInput.value = typo;
        emailInput.dispatchEvent(new Event('blur'));

        expect(emailHint.style.display).toBe('block');
        expect(emailHint.textContent).toContain(suggestion);
        expect(emailInput.getAttribute('aria-invalid')).toBe('true');
      });
    });

    it('should not show error for empty email field on blur', () => {
      emailInput.value = '';
      emailInput.dispatchEvent(new Event('blur'));

      // Empty fields are handled by HTML5 required attribute
      expect(emailHint.style.display).toBe('none');
    });
  });

  describe('Error Display and Clearing', () => {
    it('should display error message when validation fails', () => {
      firstNameInput.value = 'test';
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('block');
      expect(firstNameHint.textContent).toBeTruthy();
      expect(firstNameHint.textContent.length).toBeGreaterThan(0);
    });

    it('should clear error message when validation passes', () => {
      // First, create an error
      firstNameInput.value = 'test';
      firstNameInput.dispatchEvent(new Event('blur'));
      expect(firstNameHint.style.display).toBe('block');

      // Then fix it
      firstNameInput.value = 'John';
      firstNameInput.dispatchEvent(new Event('blur'));

      expect(firstNameHint.style.display).toBe('none');
      expect(firstNameHint.textContent).toBe('');
    });

    it('should turn field border red on error', () => {
      emailInput.value = 'invalid-email';
      emailInput.dispatchEvent(new Event('blur'));

      expect(emailInput.style.borderColor).toBe('#dc2626');
    });

    it('should clear field border when error is resolved', () => {
      // Create error
      emailInput.value = 'invalid-email';
      emailInput.dispatchEvent(new Event('blur'));
      expect(emailInput.style.borderColor).toBe('#dc2626');

      // Fix error
      emailInput.value = 'valid@email.com';
      emailInput.dispatchEvent(new Event('blur'));

      expect(emailInput.style.borderColor).toBe('');
    });

    it('should set aria-invalid attribute correctly', () => {
      // Invalid state
      lastNameInput.value = 'A';
      lastNameInput.dispatchEvent(new Event('blur'));
      expect(lastNameInput.getAttribute('aria-invalid')).toBe('true');

      // Valid state
      lastNameInput.value = 'Smith';
      lastNameInput.dispatchEvent(new Event('blur'));
      expect(lastNameInput.getAttribute('aria-invalid')).toBe('false');
    });

    it('should clear error on input when field has content', () => {
      // Create error
      firstNameInput.value = 'test';
      firstNameInput.dispatchEvent(new Event('blur'));
      expect(firstNameHint.style.display).toBe('block');

      // Type new content
      firstNameInput.value = 'John';
      firstNameInput.dispatchEvent(new Event('input'));

      expect(firstNameHint.style.display).toBe('none');
    });
  });

  describe('Submit Button State Management', () => {
    it('should disable submit button when form is empty', () => {
      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.style.opacity).toBe('0.5');
      expect(submitBtn.style.cursor).toBe('not-allowed');
    });

    it('should enable submit button when all required fields are filled', () => {
      firstNameInput.value = 'John';
      firstNameInput.dispatchEvent(new Event('input'));

      lastNameInput.value = 'Doe';
      lastNameInput.dispatchEvent(new Event('input'));

      emailInput.value = 'john@example.com';
      emailInput.dispatchEvent(new Event('input'));

      expect(submitBtn.disabled).toBe(false);
      expect(submitBtn.style.opacity).toBe('1');
      expect(submitBtn.style.cursor).toBe('pointer');
    });

    it('should disable submit button when a required field becomes empty', () => {
      // Fill all fields
      firstNameInput.value = 'John';
      firstNameInput.dispatchEvent(new Event('input'));
      lastNameInput.value = 'Doe';
      lastNameInput.dispatchEvent(new Event('input'));
      emailInput.value = 'john@example.com';
      emailInput.dispatchEvent(new Event('input'));

      expect(submitBtn.disabled).toBe(false);

      // Empty a field
      firstNameInput.value = '';
      firstNameInput.dispatchEvent(new Event('input'));

      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.style.opacity).toBe('0.5');
    });

    it('should not enable button with only whitespace in fields', () => {
      firstNameInput.value = '   ';
      firstNameInput.dispatchEvent(new Event('input'));
      lastNameInput.value = '  ';
      lastNameInput.dispatchEvent(new Event('input'));
      emailInput.value = ' ';
      emailInput.dispatchEvent(new Event('input'));

      expect(submitBtn.disabled).toBe(true);
    });
  });

  describe('Form Field Interactions', () => {
    it('should trigger validation on blur event', () => {
      firstNameInput.value = 'test';

      // No error before blur
      expect(firstNameHint.style.display).toBe('none');

      // Trigger blur
      firstNameInput.dispatchEvent(new Event('blur'));

      // Error should appear
      expect(firstNameHint.style.display).toBe('block');
    });

    it('should not trigger validation on focus event', () => {
      firstNameInput.value = 'test';

      // Trigger focus
      firstNameInput.dispatchEvent(new Event('focus'));

      // No error should appear on focus
      expect(firstNameHint.style.display).toBe('none');
    });

    it('should validate independently for each field', () => {
      // Invalid first name
      firstNameInput.value = 'test';
      firstNameInput.dispatchEvent(new Event('blur'));

      // Valid last name
      lastNameInput.value = 'Smith';
      lastNameInput.dispatchEvent(new Event('blur'));

      // First name should have error
      expect(firstNameHint.style.display).toBe('block');
      expect(firstNameInput.getAttribute('aria-invalid')).toBe('true');

      // Last name should be valid
      expect(lastNameHint.style.display).toBe('none');
      expect(lastNameInput.getAttribute('aria-invalid')).toBe('false');
    });
  });
});
