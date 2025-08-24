/**
 * DOM Sanitizer Utility
 *
 * Provides safe methods for manipulating DOM content to prevent XSS attacks.
 * Uses built-in browser APIs for secure HTML sanitization.
 *
 * @module DOMSanitizer
 * @since 1.0.0
 */

/**
 * Escapes HTML special characters to prevent XSS
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Creates DOM elements from HTML string safely
 *
 * @param {string} html - HTML string to parse
 * @returns {DocumentFragment} Safe document fragment
 */
export function createSafeHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    // Remove any script tags
    const scripts = template.content.querySelectorAll('script');
    scripts.forEach(script => script.remove());

    // Remove inline event handlers
    const elements = template.content.querySelectorAll('*');
    elements.forEach(el => {
    // Remove all on* attributes (onclick, onload, etc.)
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        });

        // Remove javascript: URLs
        if (el.hasAttribute('href')) {
            const href = el.getAttribute('href');
            // eslint-disable-next-line no-script-url
            if (href && href.trim().toLowerCase().startsWith('javascript:')) {
                el.removeAttribute('href');
            }
        }

        if (el.hasAttribute('src')) {
            const src = el.getAttribute('src');
            // eslint-disable-next-line no-script-url
            if (src && src.trim().toLowerCase().startsWith('javascript:')) {
                el.removeAttribute('src');
            }
        }
    });

    return template.content;
}

/**
 * Safely sets element content with HTML
 *
 * @param {HTMLElement} element - Target element
 * @param {string} html - HTML content to set
 */
export function setSafeHTML(element, html) {
    // Clear existing content
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }

    // Add sanitized content
    const safeContent = createSafeHTML(html);
    element.appendChild(safeContent);
}

/**
 * Sanitizes user input for display
 *
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return '';
    }

    // Remove any HTML tags
    const cleaned = input.replace(/<[^>]*>/g, '');

    // Escape remaining special characters
    return escapeHtml(cleaned);
}

/**
 * Creates a text node safely
 *
 * @param {string} text - Text content
 * @returns {Text} Text node
 */
export function createSafeText(text) {
    return document.createTextNode(text);
}

export default {
    escapeHtml,
    createSafeHTML,
    setSafeHTML,
    sanitizeInput,
    createSafeText
};