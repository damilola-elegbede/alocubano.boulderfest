/**
 * Analytics Tracker for Payment Events
 * Tracks conversion funnel and payment analytics
 */
export class AnalyticsTracker {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.events = [];
        this.startTime = Date.now();

        // Initialize tracking services
        this.initializeServices();
    }

    initializeServices() {
    // Google Analytics 4 (if available)
        if (typeof gtag !== 'undefined') {
            this.hasGA4 = true;
        }

        // Facebook Pixel (if available) - safer check using window object
        if (
            typeof window !== 'undefined' &&
      window.fbq &&
      (typeof window.fbq === 'function' || typeof window.fbq === 'object')
        ) {
            this.hasFacebookPixel = true;
        }

        // Custom analytics endpoint
        this.analyticsEndpoint = '/api/analytics/track';
    }

    track(eventName, properties = {}) {
        const eventData = {
            event: eventName,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            url: window.location.href,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            ...properties
        };

        // Store locally
        this.events.push(eventData);

        // Keep only last 100 events to prevent memory issues
        if (this.events.length > 100) {
            this.events = this.events.slice(-100);
        }

        // Send to analytics services
        this.sendToServices(eventName, eventData);

        // Send to custom endpoint (async, non-blocking)
        this.sendToCustomEndpoint(eventData).catch(() => {
            // Analytics tracking failed - silently continue in production
            // Error details are not logged to avoid console noise
        });
    }

    sendToServices(eventName, data) {
    // Google Analytics 4
        if (this.hasGA4 && typeof gtag === 'function') {
            try {
                gtag('event', eventName, {
                    custom_parameter_1: data.sessionId,
                    value: data.value || 0,
                    currency: data.currency || 'USD',
                    ...data
                });
            } catch {
                // GA4 tracking failed - continue silently
            }
        }

        // Facebook Pixel
        if (
            this.hasFacebookPixel &&
      typeof window !== 'undefined' &&
      typeof window.fbq === 'function'
        ) {
            try {
                const fbEventMap = {
                    checkout_button_clicked: 'InitiateCheckout',
                    customer_info_submitted: 'AddPaymentInfo',
                    payment_submit_attempted: 'Purchase',
                    payment_completed: 'Purchase'
                };

                const fbEvent = fbEventMap[eventName];
                if (fbEvent) {
                    window.fbq('track', fbEvent, {
                        value: data.value || 0,
                        currency: data.currency || 'USD',
                        content_ids: this._extractItems(data)?.map((item) => item.id) || [],
                        content_type: 'product',
                        num_items: this._extractItems(data)?.length || 0
                    });
                }
            } catch {
                // Facebook Pixel tracking failed - continue silently
            }
        }
    }

    async sendToCustomEndpoint(eventData) {
        try {
            // Create AbortController for timeout handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            await fetch(this.analyticsEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventData),
                signal: controller.signal
            });

            // Clear timeout if request completes successfully
            clearTimeout(timeoutId);
        } catch {
            // Custom endpoint failed - continue silently
            // Timeout or network errors are handled here
        }
    }

    // E-commerce specific tracking methods
    trackPurchaseStart(items, totalValue) {
        this.track('purchase_started', {
            items: items.map((item) => ({
                id: item.ticketType,
                name: item.name,
                category: 'ticket',
                quantity: item.quantity,
                price: item.price
            })),
            value: totalValue,
            currency: 'USD'
        });
    }

    trackPurchaseCompleted(orderData) {
        this.track('purchase_completed', {
            transaction_id: orderData.orderId,
            value: orderData.totalAmount,
            currency: 'USD',
            items: orderData.items.map((item) => ({
                id: item.ticketType,
                name: item.name,
                category: 'ticket',
                quantity: item.quantity,
                price: item.price
            }))
        });
    }

    trackCheckoutStep(step, stepName) {
        this.track('checkout_progress', {
            checkout_step: step,
            checkout_step_name: stepName,
            timestamp: Date.now()
        });
    }

    // Cart-specific tracking
    trackCartEvent(eventType, details) {
        const eventMap = {
            ticket_added: 'cart_ticket_added',
            ticket_removed: 'cart_ticket_removed',
            donation_updated: 'cart_donation_updated',
            cart_cleared: 'cart_cleared',
            cart_opened: 'cart_panel_opened',
            checkout_clicked: 'checkout_button_clicked'
        };

        const analyticsEvent = eventMap[eventType] || `cart_${eventType}`;
        this.track(analyticsEvent, details);
    }

    // Conversion funnel analysis
    getConversionFunnel() {
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
        funnelSteps.forEach((step) => {
            funnel[step] = this.events.filter((event) => event.event === step).length;
        });

        return funnel;
    }

    // Helper method to extract items from either structure
    _extractItems(data) {
        if (data.items) {
            return data.items;
        } else if (data.categories) {
            return Object.values(data.categories).flat();
        }
        return [];
    }

    // Performance tracking
    trackPerformance(metricName, value, unit = 'ms') {
        this.track('performance_metric', {
            metric: metricName,
            value: value,
            unit: unit,
            timestamp: Date.now()
        });
    }

    // Error tracking
    trackError(errorType, errorMessage, context = {}) {
        this.track('error_occurred', {
            error_type: errorType,
            error_message: errorMessage,
            context: context,
            timestamp: Date.now()
        });
    }

    // Session analytics
    getSessionData() {
        return {
            sessionId: this.sessionId,
            startTime: this.startTime,
            duration: Date.now() - this.startTime,
            eventCount: this.events.length,
            lastActivity:
        this.events.length > 0
            ? this.events[this.events.length - 1].timestamp
            : this.startTime
        };
    }

    // Utility methods
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    }

    // Debug methods
    getEvents() {
        return [...this.events];
    }

    clearEvents() {
        this.events = [];
    }

    // Environment detection for development-only features
    isDevelopment() {
        return (
            typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.port === '3000' ||
        window.location.port === '8080' ||
        window.location.search.includes('debug=true') ||
        localStorage.getItem('dev_mode') === 'true')
        );
    }

    // Event cleanup for page unload
    cleanup() {
    // Send any remaining events using sendBeacon for reliable transmission
        if (this.events.length > 0) {
            const sessionEndData = {
                type: 'session_end',
                sessionId: this.sessionId,
                recentEvents: this.events.slice(-10), // Last 10 events
                sessionDuration: Date.now() - this.startTime
            };

            // Use sendBeacon for reliable data transmission on page unload
            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                try {
                    const success = navigator.sendBeacon(
                        this.analyticsEndpoint,
                        JSON.stringify(sessionEndData)
                    );

                    // Fallback to async fetch if sendBeacon fails
                    if (!success) {
                        this.sendToCustomEndpoint(sessionEndData).catch(() => {
                            // Cleanup failed - continue silently
                        });
                    }
                } catch {
                    // sendBeacon failed, try async fetch
                    this.sendToCustomEndpoint(sessionEndData).catch(() => {
                        // Cleanup failed - continue silently
                    });
                }
            } else {
                // sendBeacon not supported, use async fetch as fallback
                this.sendToCustomEndpoint(sessionEndData).catch(() => {
                    // Cleanup failed - continue silently
                });
            }
        }
    }
}

// Singleton instance
let analyticsInstance = null;

export function getAnalyticsTracker() {
    if (!analyticsInstance) {
        analyticsInstance = new AnalyticsTracker();

        // Set up cleanup on page unload
        window.addEventListener('beforeunload', () => {
            analyticsInstance.cleanup();
        });
    }
    return analyticsInstance;
}
