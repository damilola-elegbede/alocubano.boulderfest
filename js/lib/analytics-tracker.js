/**
 * Analytics Tracker for Payment Events
 * Tracks conversion funnel and payment analytics
 */

class AnalyticsTracker {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.events = [];
        this.startTime = Date.now();

        // Initialize tracking services
        this.initializeServices();
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2);
    }

    initializeServices() {
    // Google Analytics 4 (if available)
        if (typeof gtag !== 'undefined') {
            this.hasGA4 = true;
        }

        // Facebook Pixel (if available)
        if (typeof fbq !== 'undefined') {
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

        // Send to analytics services
        this.sendToServices(eventName, eventData);

        // Send to custom endpoint (async, non-blocking)
        this.sendToCustomEndpoint(eventData).catch(error => {
            console.warn('Analytics tracking failed:', error);
        });

        console.log('Analytics:', eventName, properties);
    }

    sendToServices(eventName, data) {
    // Google Analytics 4
        if (this.hasGA4) {
            try {
                gtag('event', eventName, {
                    custom_parameter_1: data.sessionId,
                    value: data.value || 0,
                    currency: data.currency || 'USD',
                    ...data
                });
            } catch (error) {
                console.warn('GA4 tracking failed:', error);
            }
        }

        // Facebook Pixel
        if (this.hasFacebookPixel) {
            try {
                const fbEventMap = {
                    'checkout_button_clicked': 'InitiateCheckout',
                    'customer_info_submitted': 'AddPaymentInfo',
                    'payment_submit_attempted': 'Purchase',
                    'payment_completed': 'Purchase'
                };

                const fbEvent = fbEventMap[eventName];
                if (fbEvent) {
                    fbq('track', fbEvent, {
                        value: data.value || 0,
                        currency: data.currency || 'USD',
                        content_ids: data.items?.map(item => item.id) || [],
                        content_type: 'product',
                        num_items: data.items?.length || 0
                    });
                }
            } catch (error) {
                console.warn('Facebook Pixel tracking failed:', error);
            }
        }
    }

    async sendToCustomEndpoint(eventData) {
        try {
            const response = await fetch(this.analyticsEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventData)
            });

            if (!response.ok) {
                throw new Error(`Analytics API responded with ${response.status}`);
            }
        } catch (error) {
            // Fail silently for analytics
            console.debug('Custom analytics failed:', error);
        }
    }

    // E-commerce specific tracking methods
    trackPurchaseStart(items, totalValue) {
        this.track('purchase_started', {
            items: items.map(item => ({
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
            items: orderData.items.map(item => ({
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

    trackPaymentMethod(method) {
        this.track('payment_method_selected', {
            payment_method: method
        });
    }

    trackError(errorType, errorMessage, context = {}) {
        this.track('error_occurred', {
            error_type: errorType,
            error_message: errorMessage,
            context: context
        });
    }

    trackTiming(category, variable, value) {
        this.track('timing_complete', {
            timing_category: category,
            timing_var: variable,
            timing_value: value
        });
    }

    // Conversion funnel analysis
    getConversionFunnel() {
        const funnelSteps = [
            'payment_integration_initialized',
            'checkout_button_clicked',
            'customer_info_step_shown',
            'customer_info_submitted',
            'payment_form_shown',
            'payment_submit_attempted',
            'payment_completed'
        ];

        const funnel = {};
        funnelSteps.forEach(step => {
            funnel[step] = this.events.filter(event => event.event === step).length;
        });

        return funnel;
    }

    // Session summary
    getSessionSummary() {
        const sessionDuration = Date.now() - this.startTime;
        const eventCounts = {};

        this.events.forEach(event => {
            eventCounts[event.event] = (eventCounts[event.event] || 0) + 1;
        });

        return {
            sessionId: this.sessionId,
            duration: sessionDuration,
            totalEvents: this.events.length,
            eventCounts,
            startTime: this.startTime,
            endTime: Date.now()
        };
    }

    // Performance tracking
    trackPerformanceMetric(metric, value) {
        this.track('performance_metric', {
            metric_name: metric,
            metric_value: value,
            timestamp: Date.now()
        });
    }

    trackWebVital(name, value, rating) {
        this.track('web_vital', {
            name,
            value,
            rating
        });
    }

    // A/B Testing support
    trackExperiment(experimentName, variant) {
        this.track('experiment_exposure', {
            experiment_name: experimentName,
            variant: variant
        });
    }

    // Batch send events (for performance)
    async flushEvents() {
        if (this.events.length === 0) {
            return;
        }

        try {
            const response = await fetch(`${this.analyticsEndpoint}/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    events: this.events
                })
            });

            if (response.ok) {
                this.events = []; // Clear sent events
            }
        } catch (error) {
            console.debug('Batch analytics flush failed:', error);
        }
    }

    // Clean up on page unload
    beforeUnload() {
        const sessionSummary = this.getSessionSummary();
        this.track('session_ended', sessionSummary);

        // Try to send final events
        navigator.sendBeacon?.(
            this.analyticsEndpoint,
            JSON.stringify({
                event: 'session_ended',
                sessionId: this.sessionId,
                ...sessionSummary
            })
        );
    }
}

// Auto-flush events periodically
let globalAnalytics = null;

// Set up global analytics instance
function initializeGlobalAnalytics() {
    if (!globalAnalytics) {
        globalAnalytics = new AnalyticsTracker();

        // Flush events every 30 seconds
        setInterval(() => {
            globalAnalytics.flushEvents();
        }, 30000);

        // Flush on page unload
        window.addEventListener('beforeunload', () => {
            globalAnalytics.beforeUnload();
        });

        // Track web vitals if available
        if (typeof web - vitals !== 'undefined') {
            getCLS(globalAnalytics.trackWebVital);
            getFID(globalAnalytics.trackWebVital);
            getFCP(globalAnalytics.trackWebVital);
            getLCP(globalAnalytics.trackWebVital);
            getTTFB(globalAnalytics.trackWebVital);
        }
    }

    return globalAnalytics;
}

export { AnalyticsTracker, initializeGlobalAnalytics };