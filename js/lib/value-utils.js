/**
 * Value normalization utilities for explicit empty string handling.
 * Frontend version - mirrors lib/value-utils.js for backend.
 *
 * These utilities replace the problematic `value || null` pattern that silently
 * converts empty strings to null, hiding potential bugs.
 *
 * @module js/lib/value-utils
 */

/**
 * Normalize a value to null, with optional trimming.
 * Unlike `|| null`, this explicitly handles empty strings.
 *
 * @param {*} value - The value to normalize
 * @param {boolean} trim - Whether to trim string values (default: true)
 * @returns {*} The normalized value, or null if empty/undefined
 */
export function normalizeToNull(value, trim = true) {
    // Handle undefined/null
    if (value === undefined || value === null) {
        return null;
    }

    // Handle strings
    if (typeof value === 'string') {
        const normalized = trim ? value.trim() : value;
        return normalized === '' ? null : normalized;
    }

    // Return other values as-is (including falsy values like 0, false)
    return value;
}

/**
 * Normalize an optional field - explicit about empty string handling.
 * Preferred over `value || null` pattern.
 *
 * @param {*} value - The value to normalize
 * @returns {*} The normalized value, or null if empty/undefined
 */
export function optionalField(value) {
    return normalizeToNull(value, true);
}

/**
 * Check if a value is empty (null, undefined, or empty string after trim).
 *
 * @param {*} value - The value to check
 * @returns {boolean} True if the value is considered empty
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
 *
 * @param {*} value - The value to check
 * @returns {boolean} True if the value has meaningful content
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
 */
export function coalesce(...values) {
    for (const value of values) {
        if (isNotEmpty(value)) {
            return typeof value === 'string' ? value.trim() : value;
        }
    }
    return null;
}

// Default export for convenience
export default {
    normalizeToNull,
    optionalField,
    isEmpty,
    isNotEmpty,
    coalesce
};
