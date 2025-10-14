/**
 * Payment Field Sanitization Utility
 *
 * Provides sanitization functions for payment processor fields (Stripe, PayPal)
 * to prevent XSS, injection attacks, and ensure compliance with field length limits.
 */

/**
 * Sanitize payment field for safe usage with payment processors
 *
 * Removes:
 * - HTML angle brackets (XSS prevention)
 * - Control characters (formatting issues)
 * - Normalizes whitespace
 *
 * @param {string|null|undefined} value - Value to sanitize
 * @param {number} maxLength - Maximum length (default: 500)
 * @returns {string} Sanitized string (empty string if input is null/undefined)
 */
export function sanitizePaymentField(value, maxLength = 500) {
    if (!value) return '';

    return String(value)
        .replace(/[<>]/g, '') // Remove angle brackets (XSS prevention)
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/[\r\n\t]/g, ' ') // Normalize whitespace to spaces
        .trim()
        .substring(0, maxLength);
}

/**
 * Sanitize product name for payment processors
 * @param {string} name - Product name
 * @returns {string} Sanitized name (max 250 chars for Stripe)
 */
export function sanitizeProductName(name) {
    return sanitizePaymentField(name, 250);
}

/**
 * Sanitize product description for payment processors
 * @param {string} description - Product description
 * @param {string} processor - Payment processor ('stripe' or 'paypal')
 * @returns {string} Sanitized description with processor-specific limits
 */
export function sanitizeProductDescription(description, processor = 'stripe') {
    // PayPal has stricter 127 char limit, Stripe allows 500
    const maxLength = processor === 'paypal' ? 127 : 500;
    return sanitizePaymentField(description, maxLength);
}
