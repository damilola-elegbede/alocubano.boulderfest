/**
 * Email Validator Domain Service
 * Handles all email-related validation logic
 */

export class EmailValidator {
  /**
   * Email validation regex - RFC 5322 compliant basic validation
   */
  static EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Name validation regex (letters, spaces, hyphens, apostrophes, 2-100 chars)
   */
  static NAME_REGEX = /^[\p{L}\s\-']{2,100}$/u;

  /**
   * Phone validation regex (digits, spaces, dashes, parentheses, plus, dots)
   */
  static PHONE_REGEX = /^[\d\s\-\(\)\+\.]{10,}$/;

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @returns {Object} Validation result
   */
  static validateEmail(email) {
    const errors = [];

    if (email === null || email === undefined) {
      errors.push('Email address is required');
      return { valid: false, errors, sanitized: null };
    }

    if (typeof email !== 'string') {
      errors.push('Email must be a string');
      return { valid: false, errors, sanitized: null };
    }

    const sanitized = email.toLowerCase().trim();

    if (sanitized.length === 0) {
      errors.push('Email address cannot be empty');
    } else if (sanitized.length > 254) {
      errors.push('Email address too long (maximum 254 characters)');
    } else if (!this.EMAIL_REGEX.test(sanitized)) {
      errors.push('Please enter a valid email address');
    } else if (sanitized.includes('..')) {
      errors.push('Email address cannot contain consecutive dots');
    } else if (sanitized.startsWith('.') || sanitized.endsWith('.')) {
      errors.push('Email address cannot start or end with a dot');
    } else if (sanitized.includes('@.') || sanitized.includes('.@')) {
      errors.push('Invalid email format around @ symbol');
    }

    // Check for common typos in domains
    const commonTypos = this.checkCommonEmailTypos(sanitized);
    if (commonTypos.length > 0) {
      errors.push(...commonTypos);
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      sanitized: sanitized
    };
  }

  /**
   * Check for common email typos
   * @param {string} email - Email to check
   * @returns {Array} Array of warning messages
   */
  static checkCommonEmailTypos(email) {
    const warnings = [];
    const domain = email.split('@')[1];

    if (!domain) return warnings;

    const commonDomains = {
      'gmail.com': ['gmai.com', 'gmial.com', 'gmaill.com', 'gmail.co'],
      'yahoo.com': ['yaho.com', 'yahooo.com', 'yahoo.co'],
      'hotmail.com': ['hotmai.com', 'hotmial.com', 'hotmil.com'],
      'outlook.com': ['outlok.com', 'outloo.com'],
      'aol.com': ['ao.com', 'aoll.com']
    };

    Object.keys(commonDomains).forEach(correctDomain => {
      if (commonDomains[correctDomain].includes(domain)) {
        warnings.push(`Did you mean ${email.replace(domain, correctDomain)}?`);
      }
    });

    return warnings;
  }

  /**
   * Validate marketing consent
   * @param {boolean} consentToMarketing - Consent flag
   * @returns {Object} Validation result
   */
  static validateMarketingConsent(consentToMarketing) {
    const errors = [];

    if (consentToMarketing === undefined || consentToMarketing === null) {
      errors.push('Marketing consent is required');
    } else if (typeof consentToMarketing !== 'boolean') {
      errors.push('Marketing consent must be true or false');
    } else if (consentToMarketing !== true) {
      errors.push('Marketing consent is required to subscribe');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate subscriber name
   * @param {string} name - Name to validate
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {Object} Validation result
   */
  static validateName(name, fieldName = 'Name', required = false) {
    const errors = [];

    if (!name || (typeof name === 'string' && name.trim().length === 0)) {
      if (required) {
        errors.push(`${fieldName} is required`);
      }
      return {
        valid: !required,
        errors: errors,
        sanitized: null
      };
    }

    if (typeof name !== 'string') {
      errors.push(`${fieldName} must be a string`);
      return { valid: false, errors, sanitized: null };
    }

    const sanitized = name.trim();

    if (sanitized.length < 2) {
      errors.push(`${fieldName} must be at least 2 characters`);
    } else if (sanitized.length > 100) {
      errors.push(`${fieldName} too long (maximum 100 characters)`);
    } else if (!this.NAME_REGEX.test(sanitized)) {
      errors.push(`${fieldName} can only contain letters, spaces, hyphens, and apostrophes`);
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      sanitized: sanitized
    };
  }

  /**
   * Validate phone number
   * @param {string} phone - Phone number to validate
   * @param {boolean} required - Whether field is required
   * @returns {Object} Validation result
   */
  static validatePhone(phone, required = false) {
    const errors = [];

    if (!phone || (typeof phone === 'string' && phone.trim().length === 0)) {
      if (required) {
        errors.push('Phone number is required');
      }
      return {
        valid: !required,
        errors: errors,
        sanitized: null
      };
    }

    if (typeof phone !== 'string') {
      errors.push('Phone number must be a string');
      return { valid: false, errors, sanitized: null };
    }

    const sanitized = phone.trim();

    if (sanitized.length > 50) {
      errors.push('Phone number too long (maximum 50 characters)');
    } else if (sanitized.length > 0 && !this.PHONE_REGEX.test(sanitized)) {
      errors.push('Invalid phone number format');
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      sanitized: sanitized
    };
  }

  /**
   * Validate source/origin
   * @param {string} source - Source to validate
   * @returns {Object} Validation result
   */
  static validateSource(source) {
    if (!source || typeof source !== 'string') {
      return {
        valid: true,
        sanitized: 'website'
      };
    }

    const sanitized = source.trim().slice(0, 100);

    return {
      valid: true,
      sanitized: sanitized || 'website'
    };
  }

  /**
   * Validate subscription attributes
   * @param {Object} attributes - Attributes object
   * @returns {Object} Validation result
   */
  static validateAttributes(attributes) {
    const errors = [];
    const sanitized = {};

    if (!attributes) {
      return { valid: true, errors: [], sanitized: {} };
    }

    if (typeof attributes !== 'object' || Array.isArray(attributes)) {
      errors.push('Attributes must be an object');
      return { valid: false, errors, sanitized: {} };
    }

    // Limit number of attributes
    const keys = Object.keys(attributes);
    if (keys.length > 20) {
      errors.push('Too many attributes (maximum 20)');
    }

    keys.forEach(key => {
      if (typeof key !== 'string' || key.length > 100) {
        errors.push(`Invalid attribute key: ${key}`);
        return;
      }

      const value = attributes[key];

      if (typeof value === 'string') {
        sanitized[key] = value.trim().slice(0, 500);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else {
        errors.push(`Invalid attribute value for ${key}: must be string, number, or boolean`);
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      sanitized: sanitized
    };
  }

  /**
   * Validate list IDs
   * @param {Array} listIds - Array of list IDs
   * @returns {Object} Validation result
   */
  static validateListIds(listIds) {
    const errors = [];

    if (!listIds) {
      return {
        valid: true,
        errors: [],
        sanitized: [1] // Default to newsletter list
      };
    }

    if (!Array.isArray(listIds)) {
      errors.push('List IDs must be an array');
      return { valid: false, errors, sanitized: [1] };
    }

    if (listIds.length === 0) {
      return {
        valid: true,
        errors: [],
        sanitized: [1] // Default to newsletter list
      };
    }

    if (listIds.length > 10) {
      errors.push('Too many lists (maximum 10)');
    }

    const sanitized = [];
    listIds.forEach((id, index) => {
      if (!Number.isInteger(id) || id < 1) {
        errors.push(`Invalid list ID at position ${index + 1}: must be a positive integer`);
      } else {
        sanitized.push(id);
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      sanitized: sanitized.length > 0 ? sanitized : [1]
    };
  }

  /**
   * Validate complete subscription request
   * @param {Object} subscriptionData - Subscription data to validate
   * @returns {Object} Validation result with sanitized data
   */
  static validateSubscriptionRequest(subscriptionData) {
    const errors = [];
    const sanitized = {};

    if (!subscriptionData || typeof subscriptionData !== 'object') {
      errors.push('Subscription data must be an object');
      return { valid: false, errors, sanitized: null };
    }

    // Validate email (required)
    const emailValidation = this.validateEmail(subscriptionData.email);
    if (!emailValidation.valid) {
      errors.push(...emailValidation.errors);
    } else {
      sanitized.email = emailValidation.sanitized;
    }

    // Validate marketing consent (required)
    const consentValidation = this.validateMarketingConsent(subscriptionData.consentToMarketing);
    if (!consentValidation.valid) {
      errors.push(...consentValidation.errors);
    } else {
      sanitized.consentToMarketing = subscriptionData.consentToMarketing;
    }

    // Validate first name (optional)
    const firstNameValidation = this.validateName(subscriptionData.firstName, 'First name', false);
    if (!firstNameValidation.valid) {
      errors.push(...firstNameValidation.errors);
    } else if (firstNameValidation.sanitized) {
      sanitized.firstName = firstNameValidation.sanitized;
    }

    // Validate last name (optional)
    const lastNameValidation = this.validateName(subscriptionData.lastName, 'Last name', false);
    if (!lastNameValidation.valid) {
      errors.push(...lastNameValidation.errors);
    } else if (lastNameValidation.sanitized) {
      sanitized.lastName = lastNameValidation.sanitized;
    }

    // Validate phone (optional)
    const phoneValidation = this.validatePhone(subscriptionData.phone, false);
    if (!phoneValidation.valid) {
      errors.push(...phoneValidation.errors);
    } else if (phoneValidation.sanitized) {
      sanitized.phone = phoneValidation.sanitized;
    }

    // Validate source (optional)
    const sourceValidation = this.validateSource(subscriptionData.source);
    sanitized.source = sourceValidation.sanitized;

    // Validate attributes (optional)
    const attributesValidation = this.validateAttributes(subscriptionData.attributes);
    if (!attributesValidation.valid) {
      errors.push(...attributesValidation.errors);
    } else {
      sanitized.attributes = attributesValidation.sanitized;
    }

    // Validate list IDs (optional)
    const listValidation = this.validateListIds(subscriptionData.lists);
    if (!listValidation.valid) {
      errors.push(...listValidation.errors);
    } else {
      sanitized.lists = listValidation.sanitized;
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      sanitized: sanitized
    };
  }

  /**
   * Check if email is from a temporary/disposable email provider
   * @param {string} email - Email to check
   * @returns {boolean} True if disposable email
   */
  static isDisposableEmail(email) {
    if (!email || typeof email !== 'string') return false;

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    // Common disposable email domains
    const disposableDomains = [
      '10minutemail.com',
      'guerrillamail.com',
      'mailinator.com',
      'temp-mail.org',
      'throwaway.email',
      'yopmail.com'
    ];

    return disposableDomains.includes(domain);
  }

  /**
   * Validate unsubscribe token
   * @param {string} email - Email address
   * @param {string} token - Unsubscribe token
   * @returns {Object} Validation result
   */
  static validateUnsubscribeToken(email, token) {
    const errors = [];

    if (!email) {
      errors.push('Email is required');
    }

    if (!token) {
      errors.push('Unsubscribe token is required');
    } else if (typeof token !== 'string') {
      errors.push('Token must be a string');
    } else if (token.length !== 64) { // SHA-256 hex length
      errors.push('Invalid token format');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}