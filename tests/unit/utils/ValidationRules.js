/**
 * ValidationRules - Pure business logic for input validation
 * Extracted from API handlers for unit testing
 */

// Core validation regex patterns
export const NAME_REGEX = /^[\p{L}\s\-']{2,50}$/u; // Support Unicode letters
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[\+]?[1-9][\d]{3,15}$/; // Minimum 4 digits total

// Input length constraints
export const INPUT_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 50,
  EMAIL_MAX: 255,
  PHONE_MAX: 50,
  ATTRIBUTES_MAX: 500,
  BATCH_MAX: 10
};

/**
 * Validate name format and length
 */
export function validateName(name, fieldName = 'Name') {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }

  const trimmed = name.trim();

  if (trimmed.length < INPUT_LIMITS.NAME_MIN) {
    return { valid: false, error: `${fieldName} must be at least ${INPUT_LIMITS.NAME_MIN} characters` };
  }

  if (trimmed.length > INPUT_LIMITS.NAME_MAX) {
    return { valid: false, error: `${fieldName} must not exceed ${INPUT_LIMITS.NAME_MAX} characters` };
  }

  if (!NAME_REGEX.test(trimmed)) {
    return { valid: false, error: `${fieldName} can only contain letters, spaces, hyphens, and apostrophes` };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate email format and length
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > INPUT_LIMITS.EMAIL_MAX) {
    return { valid: false, error: `Email must not exceed ${INPUT_LIMITS.EMAIL_MAX} characters` };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate phone number format
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  // Remove all whitespace and common formatting characters
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.length > INPUT_LIMITS.PHONE_MAX) {
    return { valid: false, error: `Phone number must not exceed ${INPUT_LIMITS.PHONE_MAX} characters` };
  }

  if (!PHONE_REGEX.test(cleaned)) {
    return { valid: false, error: 'Invalid phone number format' };
  }

  return { valid: true, value: cleaned };
}

/**
 * Validate batch registration limits
 */
export function validateBatchSize(registrations) {
  if (!Array.isArray(registrations)) {
    return { valid: false, error: 'Registrations must be an array' };
  }

  if (registrations.length === 0) {
    return { valid: false, error: 'At least one registration is required' };
  }

  if (registrations.length > INPUT_LIMITS.BATCH_MAX) {
    return { valid: false, error: `Maximum ${INPUT_LIMITS.BATCH_MAX} registrations per batch` };
  }

  return { valid: true, count: registrations.length };
}

/**
 * Validate ticket ID format
 */
export function validateTicketId(ticketId) {
  if (!ticketId || typeof ticketId !== 'string') {
    return { valid: false, error: 'Ticket ID is required' };
  }

  const trimmed = ticketId.trim();

  // Ticket ID format: PREFIX-TIMESTAMP-RANDOM (e.g., TKT-1234567890-ABCDEF)
  const ticketIdRegex = /^[A-Z]{3}-[0-9A-Z]{6,}-[0-9A-F]{6,}$/;

  if (!ticketIdRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid ticket ID format' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate registration object structure
 */
export function validateRegistration(registration) {
  const errors = [];
  const sanitized = {};

  if (!registration || typeof registration !== 'object') {
    return { valid: false, errors: ['Registration must be an object'] };
  }

  // Validate ticket ID
  const ticketValidation = validateTicketId(registration.ticketId);
  if (!ticketValidation.valid) {
    errors.push(ticketValidation.error);
  } else {
    sanitized.ticketId = ticketValidation.value;
  }

  // Validate first name
  const firstNameValidation = validateName(registration.firstName, 'First name');
  if (!firstNameValidation.valid) {
    errors.push(firstNameValidation.error);
  } else {
    sanitized.firstName = firstNameValidation.value;
  }

  // Validate last name
  const lastNameValidation = validateName(registration.lastName, 'Last name');
  if (!lastNameValidation.valid) {
    errors.push(lastNameValidation.error);
  } else {
    sanitized.lastName = lastNameValidation.value;
  }

  // Validate email
  const emailValidation = validateEmail(registration.email);
  if (!emailValidation.valid) {
    errors.push(emailValidation.error);
  } else {
    sanitized.email = emailValidation.value;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate email subscription data
 */
export function validateSubscription(data) {
  const errors = [];
  const sanitized = {};

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Subscription data must be an object'] };
  }

  // Email is required
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.valid) {
    errors.push(emailValidation.error);
  } else {
    sanitized.email = emailValidation.value;
  }

  // Optional fields
  if (data.firstName) {
    const firstNameValidation = validateName(data.firstName, 'First name');
    if (!firstNameValidation.valid) {
      errors.push(firstNameValidation.error);
    } else {
      sanitized.firstName = firstNameValidation.value;
    }
  }

  if (data.lastName) {
    const lastNameValidation = validateName(data.lastName, 'Last name');
    if (!lastNameValidation.valid) {
      errors.push(lastNameValidation.error);
    } else {
      sanitized.lastName = lastNameValidation.value;
    }
  }

  if (data.phone) {
    const phoneValidation = validatePhone(data.phone);
    if (!phoneValidation.valid) {
      errors.push(phoneValidation.error);
    } else {
      sanitized.phone = phoneValidation.value;
    }
  }

  // Validate source field
  if (data.source) {
    if (typeof data.source !== 'string') {
      errors.push('Source must be a string');
    } else {
      const trimmed = data.source.trim().slice(0, 100);
      sanitized.source = trimmed;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}