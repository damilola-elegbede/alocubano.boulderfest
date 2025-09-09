/**
 * Pure Analytics Utility Functions
 *
 * Extracted from AnalyticsTracker for unit testing.
 * These functions handle analytics data formatting and validation.
 */

/**
 * Generate unique session ID
 * @returns {string} Unique session ID
 */
export function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

/**
 * Create base event data structure
 * @param {string} eventName - Name of the event
 * @param {Object} properties - Event properties
 * @param {Object} context - Additional context (url, referrer, etc.)
 * @returns {Object} Formatted event data
 */
export function createEventData(eventName, properties = {}, context = {}) {
    if (!eventName || typeof eventName !== 'string') {
        throw new Error('Event name is required and must be a string');
    }

    const eventData = {
        event: eventName,
        timestamp: Date.now(),
        sessionId: context.sessionId || generateSessionId(),
        url: context.url || (typeof window !== 'undefined' ? window.location.href : ''),
        referrer: context.referrer || (typeof document !== 'undefined' ? document.referrer : ''),
        ...context, // First merge context
        ...properties // Then properties override context
    };

    // Add viewport data if available
    if (typeof window !== 'undefined') {
        eventData.viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    return eventData;
}

/**
 * Validate event data structure
 * @param {Object} eventData - Event data to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateEventData(eventData) {
    const errors = [];

    if (!eventData || typeof eventData !== 'object') {
        errors.push('Event data must be an object');
        return { isValid: false, errors };
    }

    if (!eventData.event || typeof eventData.event !== 'string') {
        errors.push('Event name is required and must be a string');
    }

    if (typeof eventData.timestamp !== 'number') {
        errors.push('Timestamp must be a number');
    }

    if (!eventData.sessionId || typeof eventData.sessionId !== 'string') {
        errors.push('Session ID is required and must be a string');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Format cart event data for analytics
 * @param {string} eventType - Type of cart event
 * @param {Object} details - Event details
 * @returns {Object} Formatted cart event data
 */
export function formatCartEvent(eventType, details = {}) {
    const eventMap = {
        ticket_added: 'cart_ticket_added',
        ticket_removed: 'cart_ticket_removed',
        donation_updated: 'cart_donation_updated',
        cart_cleared: 'cart_cleared',
        cart_opened: 'cart_panel_opened',
        checkout_clicked: 'checkout_button_clicked'
    };

    const analyticsEvent = eventMap[eventType] || `cart_${eventType}`;

    return {
        event: analyticsEvent,
        category: 'cart',
        ...details
    };
}

/**
 * Format e-commerce event data for analytics platforms
 * @param {Array} items - Cart items
 * @param {number} totalValue - Total value
 * @param {string} currency - Currency code
 * @returns {Object} Formatted e-commerce event data
 */
export function formatEcommerceEvent(items = [], totalValue = 0, currency = 'USD') {
    return {
        items: items.map(item => ({
            id: item.ticketType || item.id,
            name: item.name,
            category: item.category || 'ticket',
            quantity: item.quantity || 1,
            price: item.price || item.amount || 0
        })),
        value: Math.round(totalValue * 100) / 100,
        currency: currency,
        num_items: items.length
    };
}

/**
 * Format Facebook Pixel event data
 * @param {string} eventName - Facebook event name
 * @param {Object} eventData - Event data
 * @returns {Object} Formatted Facebook Pixel event data
 */
export function formatFacebookPixelEvent(eventName, eventData) {
    const fbEventMap = {
        checkout_button_clicked: 'InitiateCheckout',
        customer_info_submitted: 'AddPaymentInfo',
        payment_submit_attempted: 'Purchase',
        payment_completed: 'Purchase'
    };

    const fbEvent = fbEventMap[eventName] || eventName;

    return {
        event: fbEvent,
        value: eventData.value || 0,
        currency: eventData.currency || 'USD',
        content_ids: eventData.items?.map(item => item.id) || [],
        content_type: 'product',
        num_items: eventData.items?.length || 0
    };
}

/**
 * Format Google Analytics 4 event data
 * @param {string} eventName - GA4 event name
 * @param {Object} eventData - Event data
 * @returns {Object} Formatted GA4 event data
 */
export function formatGA4Event(eventName, eventData) {
    const baseData = {
        custom_parameter_1: eventData.sessionId,
        value: eventData.value || 0,
        currency: eventData.currency || 'USD'
    };

    // Add e-commerce data if available
    if (eventData.items) {
        baseData.items = eventData.items.map(item => ({
            item_id: item.id,
            item_name: item.name,
            item_category: item.category,
            quantity: item.quantity,
            price: item.price
        }));
    }

    return baseData;
}

/**
 * Create conversion funnel data
 * @param {Array} events - Array of events
 * @returns {Object} Conversion funnel data
 */
export function createConversionFunnel(events = []) {
    const funnelSteps = [
        'payment_integration_initialized',
        'cart_ticket_added',
        'cart_panel_opened',
        'checkout_button_clicked',
        'customer_info_step_shown',
        'customer_info_submitted',
        'payment_form_shown',
        'payment_submit_attempted',
        'payment_completed'
    ];

    const funnel = {};
    funnelSteps.forEach(step => {
        funnel[step] = events.filter(event => event.event === step).length;
    });

    // Calculate conversion rates
    const totals = Object.values(funnel);
    const maxCount = Math.max(...totals);

    const funnelWithRates = {};
    funnelSteps.forEach((step, index) => {
        const count = funnel[step];
        const prevCount = index > 0 ? funnel[funnelSteps[index - 1]] : maxCount;

        funnelWithRates[step] = {
            count,
            rate: prevCount > 0 ? Math.round((count / prevCount) * 100) : 0
        };
    });

    return funnelWithRates;
}

/**
 * Detect if running in development environment
 * @param {Object} windowObj - Window object (for testing)
 * @returns {boolean} True if development environment
 */
export function isDevelopmentEnvironment(windowObj = typeof window !== 'undefined' ? window : {}) {
    if (!windowObj.location) {
        return false;
    }

    const { hostname, port, search } = windowObj.location;

    return (
        hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    port === '3000' ||
    port === '8080' ||
    (search && search.includes('debug=true')) ||
    (windowObj.localStorage && windowObj.localStorage.getItem('dev_mode') === 'true')
    );
}

/**
 * Sanitize event properties for analytics
 * @param {Object} properties - Raw event properties
 * @returns {Object} Sanitized properties
 */
export function sanitizeEventProperties(properties = {}) {
    const sanitized = {};

    Object.entries(properties).forEach(([key, value]) => {
    // Only include safe property types
        if (['string', 'number', 'boolean'].includes(typeof value)) {
            // Truncate long strings
            if (typeof value === 'string' && value.length > 100) {
                sanitized[key] = value.substring(0, 100) + '...';
            } else {
                sanitized[key] = value;
            }
        } else if (Array.isArray(value)) {
            // Handle arrays by converting to string or counting
            sanitized[key] = value.length <= 10 ? value : `Array(${value.length})`;
        }
    });

    return sanitized;
}

/**
 * Create performance event data
 * @param {string} metricName - Performance metric name
 * @param {number} value - Metric value
 * @param {string} unit - Value unit (ms, bytes, etc.)
 * @returns {Object} Performance event data
 */
export function createPerformanceEvent(metricName, value, unit = 'ms') {
    if (typeof metricName !== 'string' || !metricName) {
        throw new Error('Metric name is required and must be a string');
    }

    if (typeof value !== 'number' || isNaN(value)) {
        throw new Error('Metric value must be a valid number');
    }

    return {
        event: 'performance_metric',
        metric: metricName,
        value: Math.round(value * 100) / 100, // Round to 2 decimal places
        unit: unit,
        timestamp: Date.now()
    };
}

/**
 * Create error event data
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 * @param {Object} context - Error context
 * @returns {Object} Error event data
 */
export function createErrorEvent(errorType, errorMessage, context = {}) {
    if (typeof errorType !== 'string' || !errorType) {
        throw new Error('Error type is required and must be a string');
    }

    if (typeof errorMessage !== 'string' || !errorMessage) {
        throw new Error('Error message is required and must be a string');
    }

    return {
        event: 'error_occurred',
        error_type: errorType,
        error_message: errorMessage.substring(0, 200), // Limit message length
        context: sanitizeEventProperties(context),
        timestamp: Date.now()
    };
}

/**
 * Calculate session duration
 * @param {number} startTime - Session start timestamp
 * @param {number} endTime - Session end timestamp (defaults to now)
 * @returns {number} Session duration in milliseconds
 */
export function calculateSessionDuration(startTime, endTime = Date.now()) {
    if (typeof startTime !== 'number' || startTime <= 0) {
        return 0;
    }

    if (typeof endTime !== 'number' || endTime <= 0) {
        endTime = Date.now();
    }

    return Math.max(0, endTime - startTime);
}