/**
 * Value normalization utilities for explicit empty string handling.
 *
 * These utilities replace the problematic `value || null` pattern that silently
 * converts empty strings to null, hiding potential bugs.
 *
 * @module lib/value-utils
 * @see docs/CODE_STANDARDS.md for usage guidelines
 */

/**
 * Normalize a value to null, with optional logging for debugging.
 * Unlike `|| null`, this explicitly handles empty strings and can log when conversion happens.
 *
 * @param {*} value - The value to normalize
 * @param {string|null} fieldName - Optional field name for logging
 * @param {Object} options - Configuration options
 * @param {boolean} options.logEmpty - Whether to log when empty strings are converted (default: false)
 * @param {boolean} options.trim - Whether to trim string values (default: true)
 * @returns {*} The normalized value, or null if empty/undefined
 *
 * @example
 * normalizeToNull('  hello  ') // 'hello'
 * normalizeToNull('') // null
 * normalizeToNull('  ') // null (after trim)
 * normalizeToNull(undefined) // null
 * normalizeToNull(null) // null
 * normalizeToNull(0) // 0 (preserves falsy non-string values)
 * normalizeToNull(false) // false (preserves falsy non-string values)
 */
export function normalizeToNull(value, fieldName = null, options = {}) {
  const { logEmpty = false, trim = true } = options;

  // Handle undefined/null
  if (value === undefined || value === null) {
    return null;
  }

  // Handle strings
  if (typeof value === 'string') {
    const normalized = trim ? value.trim() : value;
    if (normalized === '') {
      if (logEmpty && fieldName) {
        console.debug(`[value-utils] Empty string converted to null: ${fieldName}`);
      }
      return null;
    }
    return normalized;
  }

  // Return other values as-is (including falsy values like 0, false)
  return value;
}

/**
 * Normalize an optional field - explicit about empty string handling.
 * Preferred over `value || null` pattern.
 *
 * This is the most common utility and should be used for:
 * - Optional form fields (phone, address, etc.)
 * - Optional API parameters
 * - Optional metadata fields
 *
 * @param {*} value - The value to normalize
 * @param {string|null} fieldName - Optional field name for debugging (not logged by default)
 * @returns {*} The normalized value, or null if empty/undefined
 *
 * @example
 * // In database insert:
 * phone: optionalField(customerInfo.phone)
 *
 * // With field name for debugging:
 * phone: optionalField(customerInfo.phone, 'phone')
 */
export function optionalField(value, fieldName = null) {
  return normalizeToNull(value, fieldName, { logEmpty: false, trim: true });
}

/**
 * Normalize a required field - logs warning if empty.
 * Use for fields that should have a value but are being stored as null.
 *
 * This utility:
 * - Logs a debug message when converting empty strings
 * - Logs a warning when the final result is null
 *
 * @param {*} value - The value to normalize
 * @param {string} fieldName - Field name (required for logging)
 * @returns {*} The normalized value, or null if empty/undefined
 *
 * @example
 * // In audit log:
 * adminUser: requiredField(sessionData.adminUser, 'adminUser')
 * // Logs warning if adminUser is empty/null
 */
export function requiredField(value, fieldName) {
  const result = normalizeToNull(value, fieldName, { logEmpty: true, trim: true });
  if (result === null && fieldName) {
    console.warn(`[value-utils] Required field is empty: ${fieldName}`);
  }
  return result;
}

/**
 * Check if a value is empty (null, undefined, or empty string after trim).
 * Useful for validation before processing.
 *
 * @param {*} value - The value to check
 * @returns {boolean} True if the value is considered empty
 *
 * @example
 * if (isEmpty(phone)) {
 *   // Handle missing phone
 * }
 */
export function isEmpty(value) {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return false;
}

/**
 * Check if a value is not empty (has meaningful content).
 * Inverse of isEmpty.
 *
 * @param {*} value - The value to check
 * @returns {boolean} True if the value has meaningful content
 *
 * @example
 * if (isNotEmpty(phone)) {
 *   // Process phone
 * }
 */
export function isNotEmpty(value) {
  return !isEmpty(value);
}

/**
 * Coalesce multiple values, returning the first non-empty one.
 * Unlike `a || b || null`, this correctly handles empty strings.
 *
 * @param {...*} values - Values to coalesce
 * @returns {*} The first non-empty value, or null if all are empty
 *
 * @example
 * const email = coalesce(
 *   customer.email,
 *   customer.alternateEmail,
 *   session.customerEmail
 * );
 */
export function coalesce(...values) {
  for (const value of values) {
    if (isNotEmpty(value)) {
      return typeof value === 'string' ? value.trim() : value;
    }
  }
  return null;
}

/**
 * Normalize an object's fields using optionalField for each.
 * Useful for bulk normalization of form data or API payloads.
 *
 * @param {Object} obj - The object to normalize
 * @param {string[]} fields - Array of field names to normalize
 * @returns {Object} New object with normalized fields
 *
 * @example
 * const normalized = normalizeFields(formData, ['firstName', 'lastName', 'phone']);
 */
export function normalizeFields(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    if (field in result) {
      result[field] = optionalField(result[field], field);
    }
  }
  return result;
}

// Default export for convenience
export default {
  normalizeToNull,
  optionalField,
  requiredField,
  isEmpty,
  isNotEmpty,
  coalesce,
  normalizeFields
};
