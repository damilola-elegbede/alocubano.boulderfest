/**
 * Payment Method Selector Component
 * Allows users to choose between different payment methods (Stripe, PayPal)
 * with beautiful UI and smooth animations
 */

import { getStripePaymentHandler } from '../lib/stripe-integration.js';

class PaymentSelector {
    constructor() {
        this.selectedMethod = null;
        this.modal = null;
        this.isOpen = false;
        this.onSelectCallback = null;
        this.cartManager = null;
        this.cssLoaded = false;
        this.eventListeners = new Map(); // Track event listeners for cleanup
        this.eventDate = '2026-05-15'; // Default event date
    }

    /**
   * Initialize the payment selector
   * @param {Object} cartManager - Cart manager instance
   * @param {Object} options - Configuration options
   */
    init(cartManager, options = {}) {
        this.cartManager = cartManager;

        // Set event date from options or use default
        if (options.eventDate) {
            this.eventDate = options.eventDate;
        }

        // Clear any stored payment method preference to ensure fresh choice
        localStorage.removeItem('lastPaymentMethod');

        // Load CSS if not already loaded
        this.loadCSS();
    }

    /**
   * Load the payment selector CSS dynamically
   */
    loadCSS() {
        if (this.cssLoaded) {
            return;
        }

        // Check if CSS is already in the document
        const existingLink = document.querySelector(
            'link[href="/css/payment-selector.css"]'
        );
        if (existingLink) {
            this.cssLoaded = true;
            return;
        }

        // Create and inject the CSS link
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/payment-selector.css';
        document.head.appendChild(link);
        this.cssLoaded = true;
    }

    /**
   * Show payment method selector modal
   * @param {Function} onSelect - Callback when payment method is selected
   * @returns {Promise} Resolves with selected payment method
   */
    show(onSelect) {
        return new Promise((resolve) => {
            this.onSelectCallback = onSelect || resolve;

            // Ensure CSS is loaded
            this.loadCSS();

            // Always show the modal to give users choice
            this.createModal();
            this.openModal();
        });
    }

    /**
   * Create the payment selector modal
   */
    createModal() {
    // Remove existing modal if present
        if (this.modal) {
            this.modal.remove();
        }

        const modalHTML = `
            <div class="payment-selector-modal" role="dialog" aria-modal="true" aria-labelledby="payment-selector-title">
                <div class="payment-selector-backdrop"></div>
                <div class="payment-selector-content">
                    <button class="payment-selector-close" aria-label="Close payment selector">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z"/>
                        </svg>
                    </button>

                    <div class="payment-selector-header">
                        <h2 id="payment-selector-title">Select Payment</h2>
                    </div>

                    <div class="payment-methods">
                        <!-- Credit Cards & Digital Wallets Option -->
                        <!-- Payment logos sourced from: https://github.com/payrexx/payment-logos -->
                        <button class="payment-method-option" data-method="stripe" aria-label="Pay with credit card, Apple Pay, or Google Pay">
                            <div class="payment-card-icons">
                                <img src="/images/payment-icons/card_visa.svg" alt="Visa" class="card-icon visa-icon">
                                <img src="/images/payment-icons/card_mastercard.svg" alt="Mastercard" class="card-icon mastercard-icon">
                                <img src="/images/payment-icons/apple-pay.svg" alt="Apple Pay" class="card-icon apple-pay-icon">
                                <img src="/images/payment-icons/card_google-pay.svg" alt="Google Pay" class="card-icon google-pay-icon">
                            </div>
                        </button>

                        <!-- PayPal Option -->
                        <!-- Payment logo sourced from: https://github.com/payrexx/payment-logos -->
                        <button class="payment-method-option" data-method="paypal" aria-label="Pay with PayPal">
                            <img src="/images/payment-icons/card_paypal.svg" alt="PayPal" class="paypal-icon">
                        </button>
                    </div>

                    <div class="payment-selector-footer">
                        <div class="security-badges">
                            <svg class="lock-icon" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                            </svg>
                            <span>Secure Payment Processing</span>
                        </div>
                        <p class="payment-note">All transactions are encrypted and secure</p>
                    </div>
                </div>
            </div>
        `;

        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.querySelector('.payment-selector-modal');

        // Set up event listeners
        this.setupModalEventListeners();
    }

    /**
   * Set up modal event listeners
   */
    setupModalEventListeners() {
        if (!this.modal) {
            return;
        }

        // Clear any existing listeners first
        this.cleanupEventListeners();

        // Close button handler
        const closeHandler = () => this.closeModal();
        const closeBtn = this.modal.querySelector('.payment-selector-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeHandler);
            this.eventListeners.set('close-button', {
                element: closeBtn,
                type: 'click',
                handler: closeHandler
            });
        }

        // Backdrop click handler
        const backdropHandler = () => this.closeModal();
        const backdrop = this.modal.querySelector('.payment-selector-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', backdropHandler);
            this.eventListeners.set('backdrop', {
                element: backdrop,
                type: 'click',
                handler: backdropHandler
            });
        }

        // Payment method buttons
        const methodButtons = this.modal.querySelectorAll('.payment-method-option');
        methodButtons.forEach((button, index) => {
            const clickHandler = () => {
                const method = button.dataset.method;
                this.handleSelection(method);
            };
            const mouseEnterHandler = () => button.classList.add('hovering');
            const mouseLeaveHandler = () => button.classList.remove('hovering');

            button.addEventListener('click', clickHandler);
            button.addEventListener('mouseenter', mouseEnterHandler);
            button.addEventListener('mouseleave', mouseLeaveHandler);

            // Store references for cleanup
            this.eventListeners.set(`method-click-${index}`, {
                element: button,
                type: 'click',
                handler: clickHandler
            });
            this.eventListeners.set(`method-enter-${index}`, {
                element: button,
                type: 'mouseenter',
                handler: mouseEnterHandler
            });
            this.eventListeners.set(`method-leave-${index}`, {
                element: button,
                type: 'mouseleave',
                handler: mouseLeaveHandler
            });
        });

        // Keyboard navigation handler
        const keydownHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        };
        this.modal.addEventListener('keydown', keydownHandler);
        this.eventListeners.set('modal-keydown', {
            element: this.modal,
            type: 'keydown',
            handler: keydownHandler
        });

        // Focus trap
        this.setupFocusTrap();
    }

    /**
   * Clean up all event listeners
   */
    cleanupEventListeners() {
        this.eventListeners.forEach((listener) => {
            if (listener.element && listener.handler) {
                listener.element.removeEventListener(listener.type, listener.handler);
            }
        });
        this.eventListeners.clear();
    }

    /**
   * Set up focus trap for accessibility
   */
    setupFocusTrap() {
        const focusableElements = this.modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        // Focus first element when modal opens
        setTimeout(() => firstFocusable?.focus(), 100);

        // Trap focus within modal
        this.modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable?.focus();
                } else if (!e.shiftKey && document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable?.focus();
                }
            }
        });
    }

    /**
   * Open the modal with animation
   */
    openModal() {
        if (!this.modal) {
            return;
        }

        this.isOpen = true;
        document.body.style.overflow = 'hidden';

        // Trigger animation
        requestAnimationFrame(() => {
            this.modal.classList.add('open');
        });
    }

    /**
   * Close the modal with animation
   */
    closeModal() {
        if (!this.modal || !this.isOpen) {
            return;
        }

        this.isOpen = false;
        document.body.style.overflow = '';

        // Clean up event listeners before removing modal
        this.cleanupEventListeners();

        this.modal.classList.add('closing');

        setTimeout(() => {
            this.modal.remove();
            this.modal = null;
        }, 300);
    }

    /**
   * Handle payment method selection
   * @param {string} method - Selected payment method
   */
    async handleSelection(method) {
        this.selectedMethod = method;

        // Show loading state
        this.showProcessingState();

        try {
            // Route to appropriate payment handler
            if (method === 'stripe') {
                await this.processStripePayment();
            } else if (method === 'paypal') {
                await this.processPayPalPayment();
            }

            // Close modal if still open
            if (this.isOpen) {
                this.closeModal();
            }

            // Call callback if provided
            if (this.onSelectCallback) {
                this.onSelectCallback(method);
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Payment processing error:', {
                method: method,
                error: error.message,
                stack: error.stack
            });
            this.hideProcessingState();
            this.showError(error.message);
        }
    }

    /**
   * Process Stripe payment
   */
    async processStripePayment() {
        const cartState = this.cartManager.getState();

        if (cartState.isEmpty) {
            throw new Error('Cart is empty');
        }

        // Prepare cart items for checkout
        const cartItems = this.prepareCartItems(cartState);

        // Get customer info
        const customerInfo = this.getCustomerInfo();

        // Create Stripe checkout session
        const stripeHandler = getStripePaymentHandler();
        const result = await stripeHandler.createCheckoutSession({
            cartItems,
            customerInfo
        });

        if (result.success) {
            // Redirect to Stripe Checkout
            window.location.href = result.checkoutUrl;
        } else {
            throw new Error(result.error || 'Unable to create checkout session');
        }
    }

    /**
   * Process PayPal payment
   */
    async processPayPalPayment() {
        const cartState = this.cartManager.getState();

        if (cartState.isEmpty) {
            throw new Error('Cart is empty');
        }

        // Prepare cart items
        const cartItems = this.prepareCartItems(cartState);

        try {
            // Get customer info from form if available
            const customerInfo = this.getCustomerInfo();

            // Create PayPal order
            const response = await fetch('/api/payments/paypal/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cartItems, customerInfo })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create PayPal order');
            }

            // Redirect to PayPal approval URL
            if (data.approvalUrl) {
                window.location.href = data.approvalUrl;
            } else {
                throw new Error('No PayPal approval URL received');
            }
        } catch (error) {
            throw new Error(error.message || 'PayPal checkout failed');
        }
    }

    /**
   * Get customer info from form or return empty object
   * @returns {Object} Customer information
   */
    getCustomerInfo() {
    // Try to get customer info from checkout form if it exists
        const form = document.querySelector('#checkoutForm');
        if (form) {
            return {
                firstName: form.querySelector('#firstName')?.value || '',
                lastName: form.querySelector('#lastName')?.value || '',
                email: form.querySelector('#email')?.value || '',
                phone: form.querySelector('#phone')?.value || ''
            };
        }
        return {};
    }

    /**
   * Prepare cart items for payment processing
   * @param {Object} cartState - Current cart state
   * @returns {Array} Formatted cart items
   */
    prepareCartItems(cartState) {
        const cartItems = [];

        // Add tickets
        Object.values(cartState.tickets).forEach((ticket) => {
            cartItems.push({
                type: 'ticket',
                ticketType: ticket.ticketType,
                name: ticket.name,
                price: ticket.price,
                quantity: ticket.quantity,
                eventDate: this.eventDate
            });
        });

        // Add donations
        if (cartState.donations && cartState.donations.length > 0) {
            cartState.donations.forEach((donation) => {
                cartItems.push({
                    type: 'donation',
                    name: donation.name || 'A Lo Cubano Boulder Fest Donation',
                    price: donation.amount,
                    quantity: 1,
                    category: 'general'
                });
            });
        }

        return cartItems;
    }

    /**
   * Show processing state in modal
   */
    showProcessingState() {
        if (!this.modal) {
            return;
        }

        const content = this.modal.querySelector('.payment-selector-content');
        if (content) {
            content.classList.add('processing');

            // Add loading overlay
            const loadingHTML = `
                <div class="payment-processing-overlay">
                    <div class="payment-processing-spinner"></div>
                    <p>Preparing secure checkout...</p>
                </div>
            `;
            content.insertAdjacentHTML('beforeend', loadingHTML);
        }
    }

    /**
   * Hide processing state
   */
    hideProcessingState() {
        if (!this.modal) {
            return;
        }

        const content = this.modal.querySelector('.payment-selector-content');
        const overlay = this.modal.querySelector('.payment-processing-overlay');

        if (content) {
            content.classList.remove('processing');
        }
        if (overlay) {
            overlay.remove();
        }
    }

    /**
   * Show error message
   * @param {string} message - Error message to display
   */
    showError(message) {
        if (!this.modal) {
            return;
        }

        const errorHTML = `
            <div class="payment-selector-error">
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <span>${this.escapeHtml(message)}</span>
            </div>
        `;

        const content = this.modal.querySelector('.payment-selector-content');
        const existingError = this.modal.querySelector('.payment-selector-error');

        if (existingError) {
            existingError.remove();
        }

        content?.insertAdjacentHTML('afterbegin', errorHTML);

        // Auto-remove error after 5 seconds
        setTimeout(() => {
            const error = this.modal?.querySelector('.payment-selector-error');
            if (error) {
                error.classList.add('fade-out');
                setTimeout(() => error.remove(), 300);
            }
        }, 5000);
    }

    /**
   * Escape HTML for security
   * @param {string} unsafe - Unsafe string
   * @returns {string} Escaped string
   */
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
   * Check if a payment method is available
   * @param {string} method - Payment method to check
   * @returns {boolean}
   */
    isMethodAvailable(method) {
    // In the future, this could check configuration or feature flags
        return ['stripe', 'paypal'].includes(method);
    }

    /**
   * Get display name for payment method
   * @param {string} method - Payment method
   * @returns {string} Display name
   */
    getMethodDisplayName(method) {
        const names = {
            stripe: 'Credit Card',
            paypal: 'PayPal'
        };
        return names[method] || method;
    }

    /**
   * Clean up and destroy the payment selector
   */
    destroy() {
    // Clean up event listeners
        this.cleanupEventListeners();

        // Remove modal if it exists
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }

        // Reset state
        this.isOpen = false;
        this.selectedMethod = null;
        this.onSelectCallback = null;
    }
}

// Export singleton instance
let paymentSelectorInstance = null;

export function getPaymentSelector() {
    if (!paymentSelectorInstance) {
        paymentSelectorInstance = new PaymentSelector();
    }
    return paymentSelectorInstance;
}

export { PaymentSelector };
