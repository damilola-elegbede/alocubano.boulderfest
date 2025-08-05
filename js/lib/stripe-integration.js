/**
 * Stripe Payment Integration
 * Handles client-side payment processing with Stripe Elements
 */

import { loadStripe } from 'https://js.stripe.com/v3/';

class StripePaymentHandler {
    constructor() {
        this.stripe = null;
        this.elements = null;
        this.card = null;
        this.isInitialized = false;
        this.publishableKey = window.STRIPE_PUBLISHABLE_KEY || null;

        if (this.publishableKey) {
            this.init();
        }
    }

    async init() {
        try {
            // Initialize Stripe
            this.stripe = await loadStripe(this.publishableKey);

            if (!this.stripe) {
                throw new Error('Failed to initialize Stripe');
            }

            // Create Stripe Elements instance
            this.elements = this.stripe.elements({
                fonts: [
                    {
                        cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
                    }
                ]
            });

            this.isInitialized = true;
        } catch (error) {
            throw new Error(`Stripe initialization failed: ${error.message}`);
        }
    }

    /**
     * Create and setup card element
     */
    setupCardElement() {
        if (!this.isInitialized) {
            throw new Error('Stripe not initialized');
        }

        // Card element styling to match site design
        const style = {
            base: {
                fontSize: '16px',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                color: '#333333',
                fontWeight: '400',
                '::placeholder': {
                    color: '#999999'
                },
                lineHeight: '24px'
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
            iconStyle: 'solid'
        });

        return this.card;
    }

    /**
     * Mount card element to container
     * @param {string} containerId - ID of the container element
     */
    mountCardElement(containerId) {
        if (!this.card) {
            this.setupCardElement();
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
                submitButton.setAttribute('data-original-text', submitButton.textContent);
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
            inputs.forEach(input => {
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