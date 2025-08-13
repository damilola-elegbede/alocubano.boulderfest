/**
 * Stripe Payment Integration
 * Handles client-side payment processing with Stripe Elements
 */

// Stripe v3 doesn't support ES modules, so we need to load it globally

class StripePaymentHandler {
    constructor() {
        this.stripe = null;
        this.elements = null;
        this.card = null;
        this.isInitialized = false;
        this.publishableKey = null;
        this.initPromise = null;
    }

    async init() {
    // If already initializing, return the existing promise
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._performInit();
        return this.initPromise;
    }

    async _performInit() {
        try {
            // Wait for the publishable key to be available
            if (!this.publishableKey) {
                this.publishableKey = await this.waitForPublishableKey();
            }

            // Wait for Stripe.js to load
            await this.waitForStripe();

            // Initialize Stripe
            this.stripe = window.Stripe(this.publishableKey);

            if (!this.stripe) {
                throw new Error('Failed to initialize Stripe');
            }

            // Create Stripe Elements instance
            this.elements = this.stripe.elements({
                fonts: [
                    {
                        cssSrc:
              'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
                    }
                ]
            });

            this.isInitialized = true;
        } catch (error) {
            throw new Error(`Stripe initialization failed: ${error.message}`);
        }
    }

    async waitForPublishableKey(maxAttempts = 20, delay = 250) {
        for (let i = 0; i < maxAttempts; i++) {
            if (window.STRIPE_PUBLISHABLE_KEY) {
                return window.STRIPE_PUBLISHABLE_KEY;
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        throw new Error(
            'Stripe publishable key not found. Payment system may not be configured.'
        );
    }

    async waitForStripe(maxAttempts = 20, delay = 250) {
        for (let i = 0; i < maxAttempts; i++) {
            if (window.Stripe) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        throw new Error(
            'Stripe.js failed to load. Please check your internet connection.'
        );
    }

    /**
   * Create and setup card element
   */
    async setupCardElement() {
        if (!this.isInitialized) {
            await this.init();
        }

        // Card element styling to match site design
        const style = {
            base: {
                fontSize: '16px',
                fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                color: '#000000',
                fontWeight: '300',
                '::placeholder': {
                    color: '#999999',
                    fontWeight: '300'
                }
            },
            invalid: {
                color: '#e74c3c',
                iconColor: '#e74c3c'
            }
        };

        // Create card element
        this.card = this.elements.create('card', {
            style: style,
            hidePostalCode: false, // Show postal code field
            iconStyle: 'solid',
            disableLink: true // Disable Stripe Link for simpler checkout
        });

        return this.card;
    }

    /**
   * Mount card element to container
   * @param {string} containerId - ID of the container element
   */
    async mountCardElement(containerId) {
        if (!this.card) {
            await this.setupCardElement();
        }

        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container element #${containerId} not found`);
        }

        this.card.mount(`#${containerId}`);

        // Handle real-time validation errors
        this.card.on('change', (event) => {
            const displayError = document.getElementById('card-errors');
            if (displayError) {
                if (event.error) {
                    displayError.textContent = event.error.message;
                    displayError.style.display = 'block';
                } else {
                    displayError.textContent = '';
                    displayError.style.display = 'none';
                }
            }
        });

        // Handle focus/blur for better UX
        this.card.on('focus', () => {
            const container = document.getElementById(containerId);
            if (container) {
                container.classList.add('focused');
            }
        });

        this.card.on('blur', () => {
            const container = document.getElementById(containerId);
            if (container) {
                container.classList.remove('focused');
            }
        });
    }

    /**
   * Create payment intent on the server
   * @param {Object} orderData - Order information
   * @returns {Promise<Object>} Payment intent response
   */
    async createPaymentIntent(orderData) {
        try {
            const response = await fetch('/api/payments/create-payment-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create payment intent');
            }

            return data;
        } catch (error) {
            throw error;
        }
    }

    /**
   * Create Stripe Checkout Session
   * @param {Object} checkoutData - Checkout information including cart items and customer info
   * @returns {Promise<Object>} Checkout session response
   */
    async createCheckoutSession(checkoutData) {
        try {
            const response = await fetch('/api/payments/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(checkoutData)
            });

            const data = await response.json();

            if (!response.ok) {
                // Log the actual error response for debugging
                // eslint-disable-next-line no-console
                console.error('Stripe checkout error response:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: data.error,
                    message: data.message,
                    fullResponse: data
                });

                return {
                    success: false,
                    error:
            data.error || data.message || 'Failed to create checkout session'
                };
            }

            return {
                success: true,
                checkoutUrl: data.checkoutUrl,
                sessionId: data.sessionId,
                orderId: data.orderId
            };
        } catch (error) {
            // Log error in development mode only
            if (
                typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1')
            ) {
                // eslint-disable-next-line no-console
                console.error('Checkout session creation error:', error);
            }
            return {
                success: false,
                error: error.message || 'Network error occurred. Please try again.'
            };
        }
    }

    /**
   * Process payment with customer information
   * @param {Object} orderData - Order details
   * @param {Object} customerInfo - Customer information
   * @returns {Promise<Object>} Payment result
   */
    async processPayment(orderData, customerInfo) {
        try {
            if (!this.card) {
                throw new Error('Card element not initialized');
            }

            // Show loading state
            this.setPaymentLoading(true);

            // Create payment intent first
            const { clientSecret, orderId } = await this.createPaymentIntent({
                ...orderData,
                customerInfo
            });

            // Confirm card payment
            const result = await this.stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: this.card,
                    billing_details: {
                        name: `${customerInfo.firstName} ${customerInfo.lastName}`,
                        email: customerInfo.email,
                        phone: customerInfo.phone || null,
                        address: {
                            postal_code: customerInfo.postalCode || null
                        }
                    }
                }
            });

            // Hide loading state
            this.setPaymentLoading(false);

            if (result.error) {
                // Show error to customer
                return {
                    success: false,
                    error: result.error.message
                };
            }

            // Payment succeeded
            return {
                success: true,
                paymentIntent: result.paymentIntent,
                orderId: orderId
            };
        } catch (error) {
            this.setPaymentLoading(false);
            return {
                success: false,
                error: error.message || 'Payment processing failed'
            };
        }
    }

    /**
   * Set payment loading state
   * @param {boolean} isLoading - Loading state
   */
    setPaymentLoading(isLoading) {
        const submitButton = document.getElementById('submit-payment');
        const cardElement = document.getElementById('card-element');
        const form = document.getElementById('payment-form');

        if (submitButton) {
            submitButton.disabled = isLoading;
            if (isLoading) {
                submitButton.setAttribute(
                    'data-original-text',
                    submitButton.textContent
                );
                submitButton.innerHTML = '<span class="spinner"></span> Processing...';
            } else {
                const originalText = submitButton.getAttribute('data-original-text');
                if (originalText) {
                    submitButton.textContent = originalText;
                }
            }
        }

        if (cardElement) {
            cardElement.style.opacity = isLoading ? '0.6' : '1';
        }

        if (form) {
            const inputs = form.querySelectorAll('input');
            inputs.forEach((input) => {
                input.disabled = isLoading;
            });
        }
    }

    /**
   * Validate customer information
   * @param {Object} customerInfo - Customer information to validate
   * @returns {Object} Validation result
   */
    validateCustomerInfo(customerInfo) {
        const errors = {};

        // Required fields
        if (!customerInfo.firstName?.trim()) {
            errors.firstName = 'First name is required';
        }

        if (!customerInfo.lastName?.trim()) {
            errors.lastName = 'Last name is required';
        }

        if (!customerInfo.email?.trim()) {
            errors.email = 'Email is required';
        } else {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(customerInfo.email)) {
                errors.email = 'Please enter a valid email address';
            }
        }

        // Optional phone validation
        if (customerInfo.phone) {
            const phoneRegex = /^[\d\s\-\+\(\)]+$/;
            if (!phoneRegex.test(customerInfo.phone)) {
                errors.phone = 'Please enter a valid phone number';
            }
        }

        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }

    /**
   * Clear card element
   */
    clearCard() {
        if (this.card) {
            this.card.clear();
        }
    }

    /**
   * Destroy Stripe elements
   */
    destroy() {
        if (this.card) {
            this.card.destroy();
            this.card = null;
        }
        this.elements = null;
        this.stripe = null;
        this.isInitialized = false;
    }
}

// Export singleton instance
let stripeHandlerInstance = null;

export function getStripePaymentHandler() {
    if (!stripeHandlerInstance) {
        stripeHandlerInstance = new StripePaymentHandler();
    }
    return stripeHandlerInstance;
}

export { StripePaymentHandler };
