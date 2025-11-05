/**
 * Centralized Form Validation Utilities
 *
 * Comprehensive validation for names, emails, and form submissions with:
 * - Spam pattern detection
 * - SQL injection prevention
 * - Disposable email blocking
 * - MX record verification
 * - International name support (Unicode)
 * - WCAG-compliant error messages
 */

import disposableDomains from 'disposable-email-domains' assert { type: 'json' };
import { promisify } from 'util';
import dns from 'dns';

const resolveMx = promisify(dns.resolveMx);

// ============================================================================
// VALIDATION RULES
// ============================================================================

export const VALIDATION_RULES = {
  name: {
    // Supports international names: José, François, 陳大文, أحمد
    // \p{L} = Unicode letters, \p{M} = combining marks (accents)
    pattern: /^[\p{L}\p{M}\s'\-\.]{2,100}$/u,
    minLength: 2,
    maxLength: 100
  },
  email: {
    // Basic RFC 5322 compliant pattern
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    maxLength: 254  // RFC 5321 limit
  },
  phone: {
    pattern: /^[\d\s\-\(\)\+\.]{10,}$/,
    maxLength: 50
  }
};

// ============================================================================
// SPAM DETECTION PATTERNS
// ============================================================================

const SPAM_PATTERNS = {
  // Common spam/test patterns for names
  name: [
    /^test$/i,                    // "test"
    /^asdf+$/i,                   // "asdf", "asdfasdf"
    /^qwerty$/i,                  // "qwerty"
    /^\d+$/,                      // All numbers: "12345"
    /^(.)\1{4,}$/,                // Repeated characters: "aaaaa"
    /^http/i,                     // URLs
    /[@<>]/,                      // Suspicious characters
    /<script/i,                   // XSS attempts
    /^(admin|root|system)$/i,     // System names
    /^(null|undefined|none)$/i    // Programming terms
  ],

  // SQL injection patterns
  sql: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/|\bOR\b.*=|\bAND\b.*=)/i,
    /(\bOR\b\s+\d+\s*=\s*\d+)/i,  // OR 1=1
    /(\bAND\b\s+\d+\s*=\s*\d+)/i  // AND 1=1
  ]
};

// Additional disposable email domains (top offenders not in main list)
const ADDITIONAL_DISPOSABLE_DOMAINS = [
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'temp-mail.org',
  'throwaway.email',
  'yopmail.com',
  'tempmail.com',
  'trashmail.com',
  'getnada.com',
  'maildrop.cc',
  'fakeinbox.com',
  'sharklasers.com',
  'guerrillamail.info',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.de',
  'mailnesia.com',
  'mintemail.com'
];

// Common email typo corrections (already in codebase, centralized here)
const COMMON_EMAIL_TYPOS = {
  'gmail.com': ['gmai.com', 'gmial.com', 'gmaill.com', 'gmail.co', 'gnail.com'],
  'yahoo.com': ['yaho.com', 'yahooo.com', 'yahoo.co', 'yhoo.com'],
  'hotmail.com': ['hotmai.com', 'hotmial.com', 'hotmil.com', 'hotmail.co'],
  'outlook.com': ['outlok.com', 'outloo.com', 'outlook.co'],
  'aol.com': ['ao.com', 'aoll.com'],
  'icloud.com': ['iclou.com', 'icloud.co'],
  'protonmail.com': ['protonmai.com', 'protonmail.co']
};

// ============================================================================
// NAME VALIDATION
// ============================================================================

/**
 * Validate a name field (first name, last name, full name)
 *
 * Features:
 * - Supports international names with Unicode (José, François, 陳大文)
 * - Blocks spam patterns (test, asdf, 12345)
 * - Prevents SQL injection attempts
 * - Handles edge cases (O'Brien, Mary-Jane, St. John)
 *
 * @param {string} name - The name to validate
 * @param {string} fieldName - Display name for error messages (default: 'Name')
 * @returns {Object} { valid: boolean, error?: string, value?: string }
 */
export function validateName(name, fieldName = 'Name') {
  // Required field check
  if (!name || typeof name !== 'string') {
    return {
      valid: false,
      error: `${fieldName} is required`
    };
  }

  const trimmed = name.trim();

  // Empty after trim
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: `${fieldName} is required`
    };
  }

  // Length validation
  if (trimmed.length < VALIDATION_RULES.name.minLength) {
    return {
      valid: false,
      error: `${fieldName} must be at least ${VALIDATION_RULES.name.minLength} characters`
    };
  }

  if (trimmed.length > VALIDATION_RULES.name.maxLength) {
    return {
      valid: false,
      error: `${fieldName} must not exceed ${VALIDATION_RULES.name.maxLength} characters`
    };
  }

  // Character pattern validation
  if (!VALIDATION_RULES.name.pattern.test(trimmed)) {
    return {
      valid: false,
      error: `${fieldName} can only contain letters, spaces, hyphens, apostrophes, and periods`
    };
  }

  // Spam detection
  for (const pattern of SPAM_PATTERNS.name) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: `Please enter a valid ${fieldName.toLowerCase()}`
      };
    }
  }

  // SQL injection detection
  for (const pattern of SPAM_PATTERNS.sql) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: `${fieldName} contains prohibited content`
      };
    }
  }

  // Normalize multiple spaces to single space
  const normalized = trimmed.replace(/\s+/g, ' ');

  return {
    valid: true,
    value: normalized
  };
}

// ============================================================================
// EMAIL VALIDATION
// ============================================================================

/**
 * Validate an email address
 *
 * Features:
 * - RFC 5322 format validation
 * - Disposable email domain blocking (~4,000 domains)
 * - Enhanced format checking (consecutive dots, invalid patterns)
 * - Typo detection and suggestions
 * - Optional MX record verification
 *
 * @param {string} email - The email address to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.checkDisposable - Block disposable email domains (default: true)
 * @param {boolean} options.suggestTypos - Suggest typo corrections (default: true)
 * @param {boolean} options.verifyMX - Verify MX records exist (default: false, adds latency)
 * @returns {Promise<Object>} { valid: boolean, error?: string, value?: string, warnings?: string[] }
 */
export async function validateEmail(email, options = {}) {
  const {
    checkDisposable = true,
    suggestTypos = true,
    verifyMX = false
  } = options;

  // Required field check
  if (!email || typeof email !== 'string') {
    return {
      valid: false,
      error: 'Email address is required'
    };
  }

  const sanitized = email.toLowerCase().trim();

  // Empty after trim
  if (sanitized.length === 0) {
    return {
      valid: false,
      error: 'Email address is required'
    };
  }

  // Length check
  if (sanitized.length > VALIDATION_RULES.email.maxLength) {
    return {
      valid: false,
      error: `Email address must not exceed ${VALIDATION_RULES.email.maxLength} characters`
    };
  }

  // Basic format validation
  if (!VALIDATION_RULES.email.pattern.test(sanitized)) {
    return {
      valid: false,
      error: 'Please enter a valid email address (e.g., name@example.com)'
    };
  }

  // Check for consecutive dots
  if (sanitized.includes('..')) {
    return {
      valid: false,
      error: 'Email address cannot contain consecutive dots'
    };
  }

  // Check for dots at start/end
  if (sanitized.startsWith('.') || sanitized.endsWith('.')) {
    return {
      valid: false,
      error: 'Email address cannot start or end with a dot'
    };
  }

  // Check for invalid dot placements around @
  if (sanitized.includes('@.') || sanitized.includes('.@')) {
    return {
      valid: false,
      error: 'Invalid email format around @ symbol'
    };
  }

  // Extract and validate domain
  const parts = sanitized.split('@');
  if (parts.length !== 2) {
    return {
      valid: false,
      error: 'Email address must contain exactly one @ symbol'
    };
  }

  const [localPart, domain] = parts;

  if (!localPart || localPart.length === 0) {
    return {
      valid: false,
      error: 'Email address must have content before @ symbol'
    };
  }

  if (!domain || domain.length === 0) {
    return {
      valid: false,
      error: 'Email address must contain a valid domain'
    };
  }

  // Validate domain has at least one dot
  if (!domain.includes('.')) {
    return {
      valid: false,
      error: 'Email domain must contain at least one dot (e.g., example.com)'
    };
  }

  const warnings = [];

  // Typo detection and suggestions
  if (suggestTypos) {
    for (const [correctDomain, typos] of Object.entries(COMMON_EMAIL_TYPOS)) {
      if (typos.includes(domain)) {
        const suggestion = sanitized.replace(domain, correctDomain);
        warnings.push(`Did you mean ${suggestion}?`);
        break;
      }
    }
  }

  // Disposable email check
  if (checkDisposable) {
    const isDisposable = disposableDomains.includes(domain) ||
                        ADDITIONAL_DISPOSABLE_DOMAINS.includes(domain);

    if (isDisposable) {
      return {
        valid: false,
        error: 'Disposable email addresses are not allowed. Please use a permanent email address.',
        isDisposable: true
      };
    }
  }

  // MX record verification (optional, adds 50-200ms latency)
  if (verifyMX) {
    try {
      const mxRecords = await resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          valid: false,
          error: 'Email domain does not appear to accept emails. Please check the domain.'
        };
      }
    } catch (error) {
      // DNS lookup failed - could be temporary network issue
      // Gracefully degrade: log warning but don't block submission
      console.warn(`MX record lookup failed for domain ${domain}:`, error.message);
      warnings.push('Unable to verify email domain. Proceeding anyway.');
    }
  }

  return {
    valid: true,
    value: sanitized,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ============================================================================
// PHONE VALIDATION (Optional Field)
// ============================================================================

/**
 * Validate a phone number (optional field)
 *
 * @param {string} phone - The phone number to validate
 * @returns {Object} { valid: boolean, error?: string, value?: string }
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    // Phone is optional, so null/undefined is valid
    return { valid: true, value: null };
  }

  const trimmed = phone.trim();

  if (trimmed.length === 0) {
    return { valid: true, value: null };
  }

  if (trimmed.length > VALIDATION_RULES.phone.maxLength) {
    return {
      valid: false,
      error: `Phone number must not exceed ${VALIDATION_RULES.phone.maxLength} characters`
    };
  }

  if (!VALIDATION_RULES.phone.pattern.test(trimmed)) {
    return {
      valid: false,
      error: 'Please enter a valid phone number'
    };
  }

  return {
    valid: true,
    value: trimmed
  };
}

// ============================================================================
// VOLUNTEER SUBMISSION VALIDATION
// ============================================================================

/**
 * Validate a complete volunteer submission
 *
 * Validates all required and optional fields with comprehensive checks:
 * - First name, last name (required, spam-resistant)
 * - Email (required, disposable blocking, MX verification)
 * - Phone (optional)
 * - Message (optional, length-limited)
 * - Areas of interest (optional array)
 * - Availability (optional array)
 *
 * @param {Object} data - The volunteer submission data
 * @param {Object} options - Validation options
 * @param {boolean} options.verifyMX - Verify email MX records (default: true)
 * @returns {Promise<Object>} { valid: boolean, errors: Array, sanitized?: Object, warnings?: Array }
 */
export async function validateVolunteerSubmission(data, options = {}) {
  const { verifyMX = true } = options;

  const errors = [];
  const warnings = [];
  const sanitized = {};

  // ========================================
  // First Name (Required)
  // ========================================
  const firstNameResult = validateName(data.firstName, 'First name');
  if (!firstNameResult.valid) {
    errors.push({
      field: 'firstName',
      message: firstNameResult.error
    });
  } else {
    sanitized.firstName = firstNameResult.value;
  }

  // ========================================
  // Last Name (Required)
  // ========================================
  const lastNameResult = validateName(data.lastName, 'Last name');
  if (!lastNameResult.valid) {
    errors.push({
      field: 'lastName',
      message: lastNameResult.error
    });
  } else {
    sanitized.lastName = lastNameResult.value;
  }

  // ========================================
  // Email (Required)
  // ========================================
  const emailResult = await validateEmail(data.email, {
    checkDisposable: true,
    suggestTypos: true,
    verifyMX
  });

  if (!emailResult.valid) {
    errors.push({
      field: 'email',
      message: emailResult.error
    });
  } else {
    sanitized.email = emailResult.value;

    // Collect email warnings (typo suggestions)
    if (emailResult.warnings) {
      warnings.push(...emailResult.warnings.map(w => ({ field: 'email', message: w })));
    }
  }

  // ========================================
  // Phone (Optional)
  // ========================================
  const phoneResult = validatePhone(data.phone);
  if (!phoneResult.valid) {
    errors.push({
      field: 'phone',
      message: phoneResult.error
    });
  } else if (phoneResult.value) {
    sanitized.phone = phoneResult.value;
  }

  // ========================================
  // Message (Optional, length-limited)
  // ========================================
  if (data.message && typeof data.message === 'string') {
    const messageTrimmed = data.message.trim();
    if (messageTrimmed.length > 0) {
      if (messageTrimmed.length > 1000) {
        errors.push({
          field: 'message',
          message: 'Message must not exceed 1000 characters'
        });
      } else {
        sanitized.message = messageTrimmed;
      }
    }
  }

  // ========================================
  // Areas of Interest (Optional array)
  // ========================================
  if (Array.isArray(data.areasOfInterest)) {
    sanitized.areasOfInterest = data.areasOfInterest
      .filter(area => typeof area === 'string' && area.trim().length > 0)
      .map(area => area.trim())
      .slice(0, 10);  // Max 10 areas
  } else {
    sanitized.areasOfInterest = [];
  }

  // ========================================
  // Availability (Optional array)
  // ========================================
  if (Array.isArray(data.availability)) {
    sanitized.availability = data.availability
      .filter(day => typeof day === 'string' && day.trim().length > 0)
      .map(day => day.trim())
      .slice(0, 10);  // Max 10 days
  } else {
    sanitized.availability = [];
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  validateName,
  validateEmail,
  validatePhone,
  validateVolunteerSubmission,
  VALIDATION_RULES,
  SPAM_PATTERNS
};
