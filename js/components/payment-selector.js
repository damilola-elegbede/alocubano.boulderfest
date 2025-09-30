/**
 * Payment Method Selector Component
 * Allows users to choose between different payment methods (Stripe, PayPal)
 * with beautiful UI and smooth animations
 */

import { getStripePaymentHandler } from '../lib/stripe-integration.js';
import { getPayPalSDKLoader } from '../lib/paypal-sdk-loader.js';

class PaymentSelector {
    constructor() {
        this.selectedMethod = null;
        this.modal = null;
        this.isOpen = false;
        this.onSelectCallback = null;
        this.cartManager = null;
        this.cssLoaded = false;
        this.eventListeners = new Map(); // Track event listeners for cleanup
        this.eventDate = null; // No default - must be explicitly set
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
            <div class="payment-selector-modal" role="dialog" aria-modal="true" aria-labelledby="payment-selector-title" aria-describedby="payment-selector-description">
                <div class="payment-selector-backdrop"></div>
                <div class="payment-selector-content">
                    <!-- ARIA Live Region for Screen Reader Announcements -->
                    <div aria-live="polite" aria-atomic="true" class="sr-only" id="payment-status-announcer">
                        Payment method selector ready
                    </div>

                    <button class="payment-selector-close" aria-label="Close payment selector and return to checkout">
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z"/>
                        </svg>
                    </button>

                    <div class="payment-selector-header">
                        <h2 id="payment-selector-title">Select Payment Method</h2>
                        <p id="payment-selector-description" class="sr-only">Choose your preferred payment method to complete your purchase securely.</p>
                    </div>

                    <div class="payment-methods" role="group" aria-labelledby="payment-selector-title">
                        <!-- Credit Cards & Digital Wallets Option -->
                        <!-- Payment logos sourced from: https://github.com/payrexx/payment-logos -->
                        <button class="payment-method-option"
                                data-method="stripe"
                                aria-label="Pay with credit card, Apple Pay, or Google Pay - opens Stripe secure checkout"
                                aria-describedby="stripe-description">
                            <div class="payment-card-icons">
                                <img src="/images/payment-icons/card_visa.svg" alt="Visa" class="card-icon visa-icon">
                                <img src="/images/payment-icons/card_mastercard.svg" alt="Mastercard" class="card-icon mastercard-icon">
                                <img src="/images/payment-icons/apple-pay.svg" alt="Apple Pay" class="card-icon apple-pay-icon">
                                <img src="/images/payment-icons/card_google-pay.svg" alt="Google Pay" class="card-icon google-pay-icon">
                            </div>
                            <span id="stripe-description" class="sr-only">Secure payment processing with Stripe. Supports all major credit cards, Apple Pay, and Google Pay.</span>
                        </button>

                        <!-- PayPal Option -->
                        <!-- Payment logo sourced from: https://github.com/payrexx/payment-logos -->
                        <button class="payment-method-option"
                                data-method="paypal"
                                aria-label="Pay with PayPal - redirects to PayPal secure website"
                                aria-describedby="paypal-description"
                                id="paypal-payment-option">
                            <img src="/images/payment-icons/card_paypal.svg" alt="PayPal" class="paypal-icon">
                            <div class="payment-method-status" data-status="loading" style="display: none;" aria-live="polite">
                                <span class="status-text">Checking PayPal availability...</span>
                            </div>
                            <span id="paypal-description" class="sr-only">Pay securely using your PayPal account or PayPal guest checkout. You will be redirected to PayPal to complete payment.</span>
                        </button>
                    </div>

                    <div class="payment-selector-footer">
                        <div class="security-badges" role="img" aria-label="Security information">
                            <svg class="lock-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                            </svg>
                            <span>Secure Payment Processing</span>
                        </div>
                        <p class="payment-note">All transactions are encrypted and secure. Your payment information is protected.</p>
                    </div>
                </div>
            </div>
        `;

        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.querySelector('.payment-selector-modal');

        // Set up event listeners
        this.setupModalEventListeners();

        // Check PayPal availability
        this.checkPayPalAvailability();
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
   * Check PayPal availability and update UI accordingly
   */
    async checkPayPalAvailability() {
        const paypalOption = this.modal?.querySelector('#paypal-payment-option');
        if (!paypalOption) {
            return;
        }

        // Check if PayPal configuration is available
        if (!window.PAYPAL_CONFIG) {
            this.updatePayPalStatus(paypalOption, 'unavailable', 'PayPal not configured');
            return;
        }

        // Show loading state
        this.updatePayPalStatus(paypalOption, 'loading', 'Checking availability...');

        try {
            // Test PayPal configuration by attempting to load SDK
            const sdkLoader = getPayPalSDKLoader();
            const result = await sdkLoader.loadSDK();

            if (result.success) {
                this.updatePayPalStatus(paypalOption, 'available', '');
            } else {
                this.updatePayPalStatus(paypalOption, 'error', result.error || 'PayPal unavailable');
            }
        } catch {
            // Error handled by status update
            this.updatePayPalStatus(paypalOption, 'error', 'PayPal service error');
        }
    }

    /**
   * Update PayPal option status in UI
   * @param {HTMLElement} paypalOption - PayPal option element
   * @param {string} status - Status ('loading', 'available', 'error', 'unavailable')
   * @param {string} message - Status message
   */
    updatePayPalStatus(paypalOption, status, message) {
        if (!paypalOption) {
            return;
        }

        const statusDiv = paypalOption.querySelector('.payment-method-status');
        const statusText = statusDiv?.querySelector('.status-text');

        paypalOption.setAttribute('data-paypal-status', status);

        if (status === 'available') {
            paypalOption.disabled = false;
            paypalOption.setAttribute('aria-disabled', 'false');
            if (statusDiv) {
                statusDiv.style.display = 'none';
            }
        } else {
            if (statusDiv && statusText) {
                statusDiv.style.display = 'block';
                statusText.textContent = message;
                statusDiv.setAttribute('data-status', status);
            }

            if (status === 'unavailable' || status === 'error') {
                paypalOption.disabled = true;
                paypalOption.setAttribute('aria-disabled', 'true');
                paypalOption.classList.add('disabled');
            }
        }
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

        // Start checkout session timer (15 minute timeout)
        await this.cartManager.startCheckoutSession();

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
            // End checkout session if failed
            await this.cartManager.endCheckoutSession(false);
            throw new Error(result.error || 'Unable to create checkout session');
        }
    }

    /**
   * Process PayPal payment with mobile optimizations and accessibility
   */
    async processPayPalPayment() {
        const cartState = this.cartManager.getState();

        if (cartState.isEmpty) {
            throw new Error('Cart is empty');
        }

        try {
            // Start checkout session timer (15 minute timeout)
            await this.cartManager.startCheckoutSession();

            // Announce PayPal processing start
            this.announceToScreenReader('Starting PayPal payment process...');

            // Load PayPal SDK if not already loaded
            const sdkLoader = getPayPalSDKLoader();
            const sdkResult = await sdkLoader.loadSDK();

            if (!sdkResult.success) {
                // Handle fallback to Stripe if PayPal fails
                if (sdkResult.fallbackToStripe) {
                    // PayPal SDK loading failed, fall back to Stripe silently
                    this.announceToScreenReader('PayPal unavailable, switching to credit card payment...');
                    return this.processStripePayment();
                }
                throw new Error(sdkResult.error || 'PayPal SDK loading failed');
            }

            // Update processing message for PayPal
            this.updateProcessingMessage('Connecting to PayPal...');

            // Prepare cart items
            const cartItems = this.prepareCartItems(cartState);

            // Get customer info from form if available
            const customerInfo = this.getCustomerInfo();

            // Mobile-specific: Add device info for PayPal optimization
            const deviceInfo = this.getDeviceInfo();

            // Create PayPal order with mobile context
            const response = await fetch('/api/payments/paypal/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cartItems,
                    customerInfo,
                    deviceInfo
                })
            });

            const data = await response.json();

            if (!response.ok) {
                // eslint-disable-next-line no-console
                console.error('PayPal order creation failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: data.error,
                    data: data
                });
                // Mobile-friendly error handling
                if (data.fallbackUrl && this.isMobileDevice()) {
                    this.showMobileFallbackOptions(data);
                    return;
                }
                throw new Error(data.error || 'Failed to create PayPal order');
            }

            // Update processing message for redirect
            this.updateProcessingMessage('Redirecting to PayPal...');

            // Announce redirect to users
            this.announceToScreenReader('Redirecting to PayPal website for secure payment...');

            // Mobile-optimized redirect handling
            if (data.approvalUrl) {
                this.handleMobilePayPalRedirect(data.approvalUrl);
            } else {
                throw new Error('No PayPal approval URL received');
            }
        } catch (error) {
            // End checkout session if PayPal fails
            await this.cartManager.endCheckoutSession(false);
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
            // Require eventDate to be set explicitly - no defaults
            if (!ticket.eventDate && !this.eventDate) {
                throw new Error(`Event date is required for ticket: ${ticket.name}`);
            }

            cartItems.push({
                type: 'ticket',
                ticketType: ticket.ticketType,
                name: ticket.name,
                price: ticket.price,
                quantity: ticket.quantity,
                eventDate: ticket.eventDate || this.eventDate,  // Use ticket-specific date or fallback
                eventId: ticket.eventId || this.eventId,        // Include event ID
                venue: ticket.venue || this.venue                // Include venue
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

            // Add loading overlay with accessibility features
            const loadingHTML = `
                <div class="payment-processing-overlay" role="status" aria-live="assertive">
                    <div class="payment-processing-spinner" aria-hidden="true"></div>
                    <p aria-describedby="payment-status-announcer">Preparing secure checkout...</p>
                </div>
            `;
            content.insertAdjacentHTML('beforeend', loadingHTML);

            // Announce to screen readers
            this.announceToScreenReader('Preparing secure checkout, please wait...');
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
   * @param {Object} options - Options for error display
   * @param {boolean} options.html - Whether to render HTML content (default: false)
   */
    showError(message, options = {}) {
        if (!this.modal) {
            return;
        }

        const errorHTML = `
            <div class="payment-selector-error" role="alert" aria-live="assertive" tabindex="0">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <span>${options.html ? message : this.escapeHtml(message)}</span>
            </div>
        `;

        const content = this.modal.querySelector('.payment-selector-content');
        const existingError = this.modal.querySelector('.payment-selector-error');

        if (existingError) {
            existingError.remove();
        }

        content?.insertAdjacentHTML('afterbegin', errorHTML);

        // Focus the error for screen readers
        const errorElement = this.modal.querySelector('.payment-selector-error');
        if (errorElement) {
            setTimeout(() => errorElement.focus(), 100);
        }

        // Announce error to screen readers
        this.announceToScreenReader(`Error: ${message}`);

        // Auto-remove error after 8 seconds (increased for accessibility)
        setTimeout(() => {
            const error = this.modal?.querySelector('.payment-selector-error');
            if (error) {
                error.classList.add('fade-out');
                setTimeout(() => error.remove(), 300);
            }
        }, 8000);
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
        if (method === 'stripe') {
            return !!window.STRIPE_PUBLISHABLE_KEY;
        }

        if (method === 'paypal') {
            return !!window.PAYPAL_CONFIG && !!window.PAYPAL_CONFIG.clientId;
        }

        return false;
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
   * Get device information for PayPal mobile optimization
   * @returns {Object} Device info
   */
    getDeviceInfo() {
        return {
            isMobile: this.isMobileDevice(),
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
            platform: navigator.platform,
            userAgent: navigator.userAgent.substring(0, 200), // Truncate for safety
            connectionType: this.getConnectionType(),
            touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0
        };
    }

    /**
   * Detect if user is on mobile device
   * @returns {boolean}
   */
    isMobileDevice() {
        return window.innerWidth <= 768 ||
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
   * Get connection type for performance optimization
   * @returns {string}
   */
    getConnectionType() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            return connection.effectiveType || connection.type || 'unknown';
        }
        return 'unknown';
    }

    /**
   * Handle mobile-optimized PayPal redirect
   * @param {string} approvalUrl - PayPal approval URL
   */
    handleMobilePayPalRedirect(approvalUrl) {
        // Mobile-specific: Check if PayPal app is available
        const isMobile = this.isMobileDevice();
        // Remove unused variable - app detection not needed for redirect
        // const isInApp = window.navigator.standalone ||
        //                window.matchMedia('(display-mode: standalone)').matches ||
        //                document.referrer.includes('android-app://') ||
        //                /iPhone|iPad|iPod/i.test(navigator.userAgent) && window.navigator.standalone;

        // Add mobile-friendly parameters
        const url = new URL(approvalUrl);

        if (isMobile) {
            // Optimize for mobile experience
            url.searchParams.set('useraction', 'commit');
            url.searchParams.set('flowtype', 'mobile');

            // Try to detect and prefer PayPal app
            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                // iOS: Try to open PayPal app if available
                const paypalAppUrl = approvalUrl.replace('https://www.paypal.com', 'paypal://');

                // Create a fallback mechanism
                const fallbackTimer = setTimeout(() => {
                    // If app doesn't open, redirect to mobile web version
                    window.location.href = url.toString();
                }, 2500);

                // Attempt to open PayPal app
                window.location.href = paypalAppUrl;

                // Clean up timer if page unloads (app opened successfully)
                window.addEventListener('beforeunload', () => {
                    clearTimeout(fallbackTimer);
                });

                return;
            }
        }

        // Default redirect for all other cases
        window.location.href = url.toString();
    }

    /**
   * Show mobile-friendly fallback options
   * @param {Object} data - Error response data
   */
    showMobileFallbackOptions(data) {
        const errorMessage = `
            <div class="mobile-payment-fallback">
                <h3>Payment Method Temporarily Unavailable</h3>
                <p>${data.message || 'PayPal is temporarily unavailable on mobile.'}</p>
                <div class="fallback-actions">
                    <button onclick="this.closest('.payment-selector-modal').querySelector('[data-method=\\"stripe\\"]').click()"
                            class="fallback-btn primary">
                        Try Credit Card Instead
                    </button>
                    <button onclick="window.location.reload()"
                            class="fallback-btn secondary">
                        Retry PayPal
                    </button>
                </div>
            </div>
        `;

        this.showError(errorMessage, { html: true });
    }

    /**
   * Announce message to screen reader users
   * @param {string} message - Message to announce
   */
    announceToScreenReader(message) {
        const announcer = this.modal?.querySelector('#payment-status-announcer');
        if (announcer) {
            announcer.textContent = message;
        }
    }

    /**
   * Update processing message during payment flow
   * @param {string} message - Processing message
   */
    updateProcessingMessage(message) {
        const overlay = this.modal?.querySelector('.payment-processing-overlay p');
        if (overlay) {
            overlay.textContent = message;
        }
        this.announceToScreenReader(message);
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
