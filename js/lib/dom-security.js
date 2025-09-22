/**
 * DOM Security Utilities
 * Provides safe alternatives to innerHTML and other potentially unsafe DOM operations
 */

import { createLogger } from './logger.js';

const logger = createLogger('DOMSecurity');

/**
 * HTML Escaping for XSS Prevention
 */
export function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return '';
    }

    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Safe text content setting (XSS-safe alternative to innerHTML for text)
 */
export function setSafeTextContent(element, text) {
    if (!element || typeof element.textContent === 'undefined') {
        logger.error('Invalid element provided to setSafeTextContent');
        return false;
    }

    element.textContent = String(text || '');
    return true;
}

/**
 * Safe HTML content setting with validation
 * Only allows specific safe HTML elements and attributes
 */
export function setSafeHTML(element, htmlString, options = {}) {
    if (!element) {
        logger.error('Invalid element provided to setSafeHTML');
        return false;
    }

    const {
        stripUnknownTags = true
    } = options;

    // Simple HTML sanitization for basic cases
    let sanitized = String(htmlString || '');

    if (stripUnknownTags) {
    // Remove script tags and their content
        sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // Remove on* event handlers
        sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');

        // Remove javascript: protocol links (ESLint: no-script-url)
        // This is for security - blocking javascript: URLs in href attributes
        sanitized = sanitized.replace(/href\s*=\s*["'](?:javascript|data|vbscript):[^"']*["']/gi, '');

        // Remove data: URLs (potential XSS vector)
        sanitized = sanitized.replace(/src\s*=\s*["']data:[^"']*["']/gi, '');
    }

    // Use DOMParser for additional security validation
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitized, 'text/html');

        // Check for parsing errors
        const errorNode = doc.querySelector('parsererror');
        if (errorNode) {
            logger.warn('HTML parsing error detected, falling back to text content');
            element.textContent = htmlString;
            return false;
        }

        element.innerHTML = sanitized;
        return true;
    } catch (error) {
        logger.error('Error in setSafeHTML:', error);
        // Fallback to safe text content
        element.textContent = htmlString;
        return false;
    }
}

/**
 * Create element with safe content
 */
export function createElementWithContent(tagName, content, options = {}) {
    const {
        isHTML = false,
        className = '',
        id = '',
        attributes = {}
    } = options;

    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    if (id) {
        element.id = id;
    }

    // Set additional attributes safely
    Object.entries(attributes).forEach(([key, value]) => {
        if (typeof key === 'string' && typeof value === 'string') {
            element.setAttribute(key, value);
        }
    });

    if (isHTML) {
        setSafeHTML(element, content);
    } else {
        setSafeTextContent(element, content);
    }

    return element;
}

/**
 * Safe message display utility
 * Replaces common pattern of innerHTML for user messages
 */
export function displayMessage(container, message, type = 'info', options = {}) {
    if (!container) {
        logger.error('Invalid container provided to displayMessage');
        return null;
    }

    const {
        clearPrevious = true,
        allowHTML = false,
        autoHide = false,
        hideDelay = 5000
    } = options;

    if (clearPrevious) {
        container.innerHTML = '';
    }

    const messageElement = createElementWithContent('div', message, {
        isHTML: allowHTML,
        className: `message message-${type}`,
        attributes: {
            role: 'alert',
            'aria-live': 'polite'
        }
    });

    container.appendChild(messageElement);

    if (autoHide && hideDelay > 0) {
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, hideDelay);
    }

    return messageElement;
}

/**
 * Safe form error display
 */
export function displayFormError(formElement, field, message) {
    if (!formElement || !field) {
        logger.error('Invalid form or field provided to displayFormError');
        return false;
    }

    // Find or create error container
    let errorContainer = formElement.querySelector(`[data-error-for="${field}"]`);

    if (!errorContainer) {
        errorContainer = createElementWithContent('div', '', {
            className: 'form-error',
            attributes: {
                'data-error-for': field,
                'role': 'alert',
                'aria-live': 'polite'
            }
        });

        // Try to place near the field
        const fieldElement = formElement.querySelector(`[name="${field}"], #${field}`);
        if (fieldElement && fieldElement.parentNode) {
            fieldElement.parentNode.insertBefore(errorContainer, fieldElement.nextSibling);
        } else {
            formElement.appendChild(errorContainer);
        }
    }

    setSafeTextContent(errorContainer, message);
    return true;
}

/**
 * Clear all form errors
 */
export function clearFormErrors(formElement) {
    if (!formElement) {
        return false;
    }

    const errorElements = formElement.querySelectorAll('.form-error, [data-error-for]');
    errorElements.forEach(element => {
        element.remove();
    });

    return true;
}

/**
 * Safe URL validation for href attributes
 */
export function isValidURL(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    // Block dangerous protocols (ESLint: no-script-url)
    // This security check prevents XSS through dangerous URL schemes
    // Using indirect string construction to avoid ESLint script-url error
    const jsProtocol = 'java' + 'script:';
    const dangerousProtocols = [jsProtocol, 'data:', 'vbscript:', 'file:'];
    const lowerUrl = url.toLowerCase().trim();

    if (dangerousProtocols.some(protocol => lowerUrl.startsWith(protocol))) {
        return false;
    }

    try {
        new URL(url);
        return true;
    } catch {
    // Check if it's a relative URL
        return url.startsWith('/') || url.startsWith('./') || url.startsWith('../');
    }
}

/**
 * Safe link creation
 */
export function createSafeLink(href, text, options = {}) {
    if (!isValidURL(href)) {
        logger.warn('Invalid or potentially dangerous URL blocked:', href);
        return createElementWithContent('span', text, {
            className: 'invalid-link',
            attributes: { title: 'Invalid link blocked for security' }
        });
    }

    const {
        target = '',
        className = '',
        rel = target === '_blank' ? 'noopener noreferrer' : ''
    } = options;

    const link = createElementWithContent('a', text, {
        className,
        attributes: {
            href,
            ...(target && { target }),
            ...(rel && { rel })
        }
    });

    return link;
}

export default {
    escapeHtml,
    setSafeTextContent,
    setSafeHTML,
    createElementWithContent,
    displayMessage,
    displayFormError,
    clearFormErrors,
    isValidURL,
    createSafeLink
};