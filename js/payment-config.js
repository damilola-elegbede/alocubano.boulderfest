/**
 * Payment Integration Configuration
 * Central configuration for the A Lo Cubano Boulder Fest payment system
 */

window.PaymentConfig = {
    // Stripe Configuration
    stripe: {
        publishableKey: window.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
        apiVersion: '2023-10-16',
        appearance: {
            theme: 'flat',
            variables: {
                colorPrimary: '#CC2936',      // Festival red
                colorBackground: '#FFFFFF',
                colorText: '#000000',
                colorDanger: '#CC2936',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                spacingUnit: '4px',
                borderRadius: '8px'
            },
            rules: {
                '.Input': {
                    border: '2px solid #DDDDDD',
                    fontSize: '16px',
                    padding: '12px'
                },
                '.Input:focus': {
                    border: '2px solid #5B6BB5',
                    boxShadow: '0 0 0 3px rgba(91, 107, 181, 0.1)'
                },
                '.Label': {
                    fontWeight: '600',
                    marginBottom: '8px',
                    color: '#000000'
                }
            }
        }
    },

    // API Configuration
    api: {
        baseUrl: '/api',
        endpoints: {
            createCheckoutSession: '/payment/create-checkout-session',
            checkAvailability: '/inventory/check-availability',
            calculateTotal: '/payment/calculate-total',
            orderDetails: '/payment/order-details',
            analytics: '/analytics/track'
        },
        timeout: 10000, // 10 seconds
        retries: 3
    },

    // Cart Configuration
    cart: {
        expiryTime: 15 * 60 * 1000, // 15 minutes
        maxItems: 50,
        maxValue: 5000,
        storageKey: 'alocubano_cart',
        expiryKey: 'alocubano_cart_expiry'
    },

    // Validation Configuration
    validation: {
        realTimeValidation: true,
        debounceDelay: 300,
        rules: {
            name: {
                required: true,
                minLength: 2,
                maxLength: 100,
                pattern: /^[a-zA-Z\s\-\'\.]+$/,
                message: 'Please enter a valid full name'
            },
            email: {
                required: true,
                maxLength: 254,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address'
            },
            phone: {
                required: false,
                pattern: /^[\+]?[1-9][\d]{0,15}$/,
                message: 'Please enter a valid phone number'
            }
        }
    },

    // Inventory Configuration
    inventory: {
        checkInterval: 30000, // 30 seconds
        cacheExpiry: 60000,   // 1 minute
        retryAttempts: 3,
        backoffMultiplier: 2
    },

    // Analytics Configuration
    analytics: {
        enabled: true,
        trackConversions: true,
        trackErrors: true,
        trackPerformance: true,
        batchSize: 10,
        flushInterval: 30000, // 30 seconds
        services: {
            googleAnalytics: {
                enabled: typeof gtag !== 'undefined',
                trackingId: window.GA_TRACKING_ID || null
            },
            facebookPixel: {
                enabled: typeof fbq !== 'undefined',
                pixelId: window.FB_PIXEL_ID || null
            },
            customEndpoint: {
                enabled: true,
                endpoint: '/api/analytics/track'
            }
        }
    },

    // UI Configuration
    ui: {
        animations: {
            enabled: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            duration: 300,
            easing: 'ease-out'
        },
        loading: {
            minDisplayTime: 500,
            maxDisplayTime: 30000,
            showSpinner: true,
            showProgress: false
        },
        errors: {
            autoHide: true,
            autoHideDelay: 10000,
            position: 'top-right'
        },
        accessibility: {
            announceChanges: true,
            focusManagement: true,
            highContrast: window.matchMedia('(prefers-contrast: high)').matches
        }
    },

    // Security Configuration
    security: {
        enableXSSProtection: true,
        enableInputSanitization: true,
        validateOnServer: true,
        csrfProtection: true,
        sessionTimeout: 30 * 60 * 1000 // 30 minutes
    },

    // Feature Flags
    features: {
        realTimeInventory: true,
        cartPersistence: true,
        socialLogin: false,
        guestCheckout: true,
        savePaymentMethods: false,
        applePay: true,
        googlePay: true,
        autoFillDetection: true,
        progressiveEnhancement: true
    },

    // Error Messages
    messages: {
        errors: {
            generic: 'Something went wrong. Please try again.',
            network: 'Network error. Please check your connection.',
            validation: 'Please check your information and try again.',
            payment: 'Payment failed. Please try again.',
            inventory: 'Some items are no longer available.',
            session: 'Your session has expired. Please start over.',
            server: 'Server error. Please try again later.'
        },
        success: {
            paymentComplete: 'Payment successful! Check your email for confirmation.',
            orderCreated: 'Order created successfully.',
            emailSent: 'Confirmation email sent.',
            inventoryReserved: 'Tickets reserved for you.'
        },
        info: {
            processing: 'Processing your payment...',
            validating: 'Validating information...',
            loading: 'Loading...',
            checking: 'Checking availability...'
        }
    },

    // Ticket Configuration
    tickets: {
        types: {
            'early-bird-full': {
                name: 'Early Bird Full Pass',
                price: 100,
                category: 'full-pass',
                available: true,
                maxQuantity: 10
            },
            'regular-full': {
                name: 'Regular Full Pass',
                price: 125,
                category: 'full-pass',
                available: true,
                maxQuantity: 10
            },
            'friday-pass': {
                name: 'Friday Pass',
                price: 50,
                category: 'day-pass',
                available: true,
                maxQuantity: 10
            },
            'saturday-pass': {
                name: 'Saturday Pass',
                price: 85,
                category: 'day-pass',
                available: true,
                maxQuantity: 10
            },
            'sunday-pass': {
                name: 'Sunday Pass',
                price: 50,
                category: 'day-pass',
                available: true,
                maxQuantity: 10
            },
            'single-workshop': {
                name: 'Single Workshop',
                price: 30,
                category: 'individual',
                available: true,
                maxQuantity: 10
            },
            'single-social': {
                name: 'Single Social',
                price: 20,
                category: 'individual',
                available: true,
                maxQuantity: 10
            }
        }
    },

    // Environment Configuration
    environment: {
        isDevelopment: window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1'),
        isStaging: window.location.hostname.includes('staging') || window.location.hostname.includes('preview'),
        isProduction: window.location.hostname === 'alocubanoboulderfest.com',
        debugMode: localStorage.getItem('payment-debug') === 'true'
    },

    // Performance Configuration
    performance: {
        enableMetrics: true,
        trackWebVitals: true,
        logSlowOperations: true,
        slowOperationThreshold: 1000, // 1 second
        enablePrefetching: true,
        lazyLoadThreshold: 100 // pixels
    }
};

// Configuration validation
(function validateConfig() {
    const config = window.PaymentConfig;

    if (!config.stripe.publishableKey || config.stripe.publishableKey === 'pk_test_placeholder') {
        console.warn('Payment Config: Stripe publishable key not configured');
    }

    if (config.environment.isProduction && config.environment.debugMode) {
        console.warn('Payment Config: Debug mode enabled in production');
    }

    if (!config.analytics.services.googleAnalytics.trackingId && config.analytics.services.googleAnalytics.enabled) {
        console.warn('Payment Config: Google Analytics enabled but tracking ID not configured');
    }
})();

// Export configuration for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.PaymentConfig;
}