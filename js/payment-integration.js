/**
 * Frontend Payment Integration for A Lo Cubano Boulder Fest
 * Comprehensive Stripe integration with analytics, error handling, and accessibility
 */

import { AnalyticsTracker } from './lib/analytics-tracker.js';
// CartManager is available globally via window.CartManager
import { PaymentFormValidator } from './lib/payment-form-validator.js';
import { InventoryChecker } from './lib/inventory-checker.js';
import { LoadingStateManager } from './lib/loading-state-manager.js';

class PaymentIntegration {
    constructor() {
        this.stripe = null;
        this.elements = null;
        this.paymentElement = null;
        this.analytics = new AnalyticsTracker();
        this.cartManager = new CartManager();
        this.validator = new PaymentFormValidator();
        this.inventory = new InventoryChecker();
        this.loadingManager = new LoadingStateManager();

        this.state = {
            isProcessing: false,
            currentStep: 'tickets', // tickets, customer-info, payment, processing, success, error
            customerInfo: {},
            paymentIntent: null,
            sessionId: null,
            orderId: null,
            reservationId: null
        };

        this.config = {
            stripePublishableKey: this.getStripePublishableKey(),
            apiBaseUrl: '/api',
            appearance: this.getStripeAppearance(),
            checkoutOptions: {
                mode: 'payment',
                currency: 'usd',
                automatic_tax: { enabled: false }
            }
        };

        this.init();
    }

    getStripePublishableKey() {
    // In production, this would come from environment variables or server config
        return window.STRIPE_PUBLISHABLE_KEY || 'pk_test_...'; // Replace with actual key
    }

    getStripeAppearance() {
        return {
            theme: 'flat',
            variables: {
                colorPrimary: '#CC2936', // Festival red color
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
                    border: '2px solid #5B6BB5', // Festival blue
                    boxShadow: '0 0 0 3px rgba(91, 107, 181, 0.1)'
                },
                '.Label': {
                    fontWeight: '600',
                    marginBottom: '8px',
                    color: '#000000'
                }
            }
        };
    }

    async init() {
        try {
            await this.initializeStripe();
            this.bindEvents();
            this.initializeComponents();
            this.analytics.track('payment_integration_initialized');
            console.log('Payment integration initialized successfully');
        } catch (error) {
            console.error('Payment integration initialization failed:', error);
            this.handleError('Payment system initialization failed');
        }
    }

    async initializeStripe() {
        if (!this.config.stripePublishableKey) {
            throw new Error('Stripe publishable key not configured');
        }

        this.stripe = Stripe(this.config.stripePublishableKey);

        if (!this.stripe) {
            throw new Error('Failed to initialize Stripe');
        }

        console.log('Stripe initialized successfully');
    }

    initializeComponents() {
    // Initialize cart manager with existing ticket selection
        this.cartManager.syncWithTicketSelection();

        // Initialize inventory checker
        this.inventory.startPeriodicCheck();

        // Set up form validation
        this.validator.initialize();

        // Update display
        this.updateUI();
    }

    bindEvents() {
    // Checkout button
        const checkoutBtn = document.getElementById('checkout-button');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', (e) => this.handleCheckoutClick(e));
        }

        // Step navigation
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-payment-action]')) {
                this.handlePaymentAction(e);
            }
        });

        // Form submission
        document.addEventListener('submit', (e) => {
            if (e.target.matches('#customer-info-form')) {
                this.handleCustomerInfoSubmit(e);
            }
            if (e.target.matches('#payment-form')) {
                this.handlePaymentSubmit(e);
            }
        });

        // Real-time validation
        document.addEventListener('input', (e) => {
            if (e.target.matches('[data-validate]')) {
                this.validator.validateField(e.target);
            }
        });

        // Inventory updates
        this.inventory.on('availability-changed', (data) => {
            this.handleInventoryUpdate(data);
        });

        // Cart updates
        this.cartManager.on('cart-updated', (data) => {
            this.handleCartUpdate(data);
        });

        // Window events
        window.addEventListener('beforeunload', (e) => {
            if (this.state.isProcessing) {
                e.preventDefault();
                e.returnValue = 'Payment is being processed. Are you sure you want to leave?';
            }
        });

        // Accessibility: Escape key handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.state.currentStep !== 'processing') {
                this.handleEscapeKey(e);
            }
        });
    }

    async handleCheckoutClick(event) {
        event.preventDefault();

        if (this.state.isProcessing) {
            return;
        }

        try {
            this.analytics.track('checkout_button_clicked');

            // Validate cart
            const cartItems = this.cartManager.getItems();
            if (!cartItems.length) {
                this.showError('Please select at least one ticket before checking out.');
                return;
            }

            // Check inventory availability
            const availability = await this.inventory.checkAvailability(cartItems);
            if (!availability.available) {
                this.handleInventoryUnavailable(availability);
                return;
            }

            // Proceed to customer information step
            this.setState({ currentStep: 'customer-info' });
            this.showCustomerInfoForm();

        } catch (error) {
            console.error('Checkout initiation failed:', error);
            this.handleError('Failed to start checkout process');
        }
    }

    showCustomerInfoForm() {
        this.hideAllSteps();
        this.createCustomerInfoForm();
        this.focusFirstField();
        this.analytics.track('customer_info_step_shown');
    }

    createCustomerInfoForm() {
        const container = document.getElementById('payment-container') || this.createPaymentContainer();

        container.innerHTML = `
      <div class="payment-step customer-info-step" aria-live="polite">
        <div class="step-header">
          <button type="button" class="back-btn" data-payment-action="back-to-tickets" aria-label="Back to ticket selection">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M19 12H5"></path>
              <path d="M12 19L5 12L12 5"></path>
            </svg>
            Back to Tickets
          </button>
          <h2 class="step-title">Customer Information</h2>
          <div class="step-progress" aria-label="Step 1 of 3">
            <span class="progress-indicator">1 / 3</span>
          </div>
        </div>

        <form id="customer-info-form" class="customer-form" novalidate>
          <div class="form-group">
            <label for="customer-name" class="form-label">Full Name *</label>
            <input 
              type="text" 
              id="customer-name" 
              name="name" 
              class="form-input"
              required 
              aria-required="true"
              data-validate="name"
              autocomplete="name"
              maxlength="100"
            >
            <div class="field-error" role="alert" aria-live="polite"></div>
          </div>

          <div class="form-group">
            <label for="customer-email" class="form-label">Email Address *</label>
            <input 
              type="email" 
              id="customer-email" 
              name="email" 
              class="form-input"
              required 
              aria-required="true"
              data-validate="email"
              autocomplete="email"
              maxlength="254"
            >
            <div class="field-error" role="alert" aria-live="polite"></div>
            <div class="field-help">You'll receive order confirmation and event updates at this email.</div>
          </div>

          <div class="form-group">
            <label for="customer-phone" class="form-label">Phone Number</label>
            <input 
              type="tel" 
              id="customer-phone" 
              name="phone" 
              class="form-input"
              data-validate="phone"
              autocomplete="tel"
              maxlength="20"
              placeholder="(555) 123-4567"
            >
            <div class="field-error" role="alert" aria-live="polite"></div>
            <div class="field-help">Optional. For urgent event updates only.</div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary continue-btn">
              Continue to Payment
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M5 12H19"></path>
                <path d="M12 5L19 12L12 19"></path>
              </svg>
            </button>
          </div>
        </form>

        <div class="order-summary-sidebar">
          <h3>Order Summary</h3>
          <div id="customer-step-cart-items"></div>
          <div class="total-amount">
            Total: <span id="customer-step-total">$0</span>
          </div>
        </div>
      </div>
    `;

        this.updateOrderSummary('customer-step-cart-items', 'customer-step-total');
    }

    async handleCustomerInfoSubmit(event) {
        event.preventDefault();

        if (this.state.isProcessing) {
            return;
        }

        const form = event.target;
        const formData = new FormData(form);

        // Validate form
        const validationResult = this.validator.validateCustomerForm(formData);
        if (!validationResult.valid) {
            this.showFormErrors(validationResult.errors);
            this.focusFirstError();
            return;
        }

        // Store customer info
        this.state.customerInfo = {
            name: formData.get('name').trim(),
            email: formData.get('email').trim().toLowerCase(),
            phone: formData.get('phone')?.trim() || ''
        };

        this.analytics.track('customer_info_submitted', {
            has_phone: !!this.state.customerInfo.phone
        });

        // Proceed to payment step
        this.setState({ currentStep: 'payment' });
        await this.showPaymentForm();
    }

    async showPaymentForm() {
        try {
            this.loadingManager.show('Preparing payment form...');

            // Create checkout session
            const sessionData = await this.createCheckoutSession();

            this.hideAllSteps();
            await this.createPaymentForm(sessionData);
            this.focusPaymentElement();

            this.loadingManager.hide();
            this.analytics.track('payment_form_shown');

        } catch (error) {
            this.loadingManager.hide();
            console.error('Failed to show payment form:', error);
            this.handleError('Failed to prepare payment form');
        }
    }

    async createCheckoutSession() {
        const cartItems = this.cartManager.getItems();

        const response = await fetch(`${this.config.apiBaseUrl}/payment/create-checkout-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cartItems,
                customerInfo: this.state.customerInfo
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create checkout session');
        }

        const sessionData = await response.json();

        // Store session info
        this.state.sessionId = sessionData.sessionId;
        this.state.orderId = sessionData.orderId;
        this.state.reservationId = sessionData.reservationId;

        return sessionData;
    }

    async createPaymentForm(sessionData) {
        const container = document.getElementById('payment-container');

        container.innerHTML = `
      <div class="payment-step payment-form-step" aria-live="polite">
        <div class="step-header">
          <button type="button" class="back-btn" data-payment-action="back-to-customer-info" aria-label="Back to customer information">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M19 12H5"></path>
              <path d="M12 19L5 12L12 5"></path>
            </svg>
            Back
          </button>
          <h2 class="step-title">Payment Information</h2>
          <div class="step-progress" aria-label="Step 2 of 3">
            <span class="progress-indicator">2 / 3</span>
          </div>
        </div>

        <div class="payment-content">
          <div class="payment-form-container">
            <form id="payment-form" class="payment-form" novalidate>
              <div class="customer-info-display">
                <h3>Customer Information</h3>
                <p><strong>${this.state.customerInfo.name}</strong></p>
                <p>${this.state.customerInfo.email}</p>
                ${this.state.customerInfo.phone ? `<p>${this.state.customerInfo.phone}</p>` : ''}
                <button type="button" class="edit-info-btn" data-payment-action="back-to-customer-info">
                  Edit Information
                </button>
              </div>

              <div class="payment-element-container">
                <h3>Payment Method</h3>
                <div id="payment-element" class="payment-element" role="group" aria-label="Payment method">
                  <!-- Stripe Elements will mount here -->
                </div>
                <div id="payment-element-errors" class="field-error" role="alert" aria-live="polite"></div>
              </div>

              <div class="payment-policies">
                <div class="policy-item">
                  <p class="policy-text">
                    <strong>No Refunds:</strong> All ticket sales are final. Please review your order carefully.
                  </p>
                </div>
                <div class="policy-item">
                  <p class="policy-text">
                    By completing your purchase, you agree to our 
                    <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and 
                    <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
                  </p>
                </div>
              </div>

              <div class="form-actions">
                <button type="submit" id="payment-submit-btn" class="btn btn-primary payment-submit-btn">
                  <span class="btn-text">Complete Payment</span>
                  <span class="btn-amount">$${this.cartManager.getTotal()}</span>
                  <div class="btn-spinner" style="display: none;">
                    <div class="spinner"></div>
                  </div>
                </button>
              </div>
            </form>
          </div>

          <div class="order-summary-sidebar">
            <h3>Order Summary</h3>
            <div class="order-details">
              <div class="order-number">
                Order #${sessionData.orderNumber || 'Processing...'}
              </div>
              <div id="payment-step-cart-items"></div>
              <div class="total-amount">
                Total: <span id="payment-step-total">$${sessionData.totalAmount || this.cartManager.getTotal()}</span>
              </div>
            </div>
            
            <div class="security-badges">
              <div class="security-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <circle cx="12" cy="16" r="1"></circle>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                SSL Secured
              </div>
              <div class="security-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M9 12l2 2 4-4"></path>
                  <path d="M21 12c0 1.66-1.34 3-3 3h-3"></path>
                  <path d="M3 12c0-1.66 1.34-3 3-3h3"></path>
                </svg>
                Stripe Secure
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

        // Initialize Stripe Elements
        await this.initializeStripeElements();
        this.updateOrderSummary('payment-step-cart-items', 'payment-step-total');
    }

    async initializeStripeElements() {
        try {
            // Create Elements instance
            this.elements = this.stripe.elements({
                appearance: this.config.appearance,
                clientSecret: null // We'll use direct payment instead of setup intent
            });

            // Create Payment Element
            this.paymentElement = this.elements.create('payment', {
                layout: 'tabs',
                fields: {
                    billingDetails: {
                        name: 'auto',
                        email: 'auto',
                        phone: 'auto',
                        address: {
                            country: 'auto',
                            line1: 'auto',
                            line2: 'auto',
                            city: 'auto',
                            state: 'auto',
                            postalCode: 'auto'
                        }
                    }
                },
                defaultValues: {
                    billingDetails: {
                        name: this.state.customerInfo.name,
                        email: this.state.customerInfo.email,
                        phone: this.state.customerInfo.phone
                    }
                }
            });

            // Mount Payment Element
            const paymentElementContainer = document.getElementById('payment-element');
            if (paymentElementContainer) {
                this.paymentElement.mount('#payment-element');
            } else {
                throw new Error('Payment element container not found');
            }

            // Listen for errors
            this.paymentElement.on('change', (event) => {
                const errorElement = document.getElementById('payment-element-errors');
                if (event.error) {
                    errorElement.textContent = event.error.message;
                    this.analytics.track('payment_element_error', { error: event.error.message });
                } else {
                    errorElement.textContent = '';
                }
            });

            console.log('Stripe Elements initialized successfully');

        } catch (error) {
            console.error('Failed to initialize Stripe Elements:', error);
            throw error;
        }
    }

    async handlePaymentSubmit(event) {
        event.preventDefault();

        if (this.state.isProcessing) {
            return;
        }

        this.setState({ isProcessing: true });
        this.setPaymentButtonLoading(true);

        try {
            this.analytics.track('payment_submit_attempted');

            // Instead of processing payment directly, redirect to Stripe Checkout
            // This is the recommended approach for the checkout session we created
            window.location.href = `https://checkout.stripe.com/pay/${this.state.sessionId}`;

        } catch (error) {
            console.error('Payment submission failed:', error);
            this.handlePaymentError(error);
            this.setState({ isProcessing: false });
            this.setPaymentButtonLoading(false);
        }
    }

    setPaymentButtonLoading(loading) {
        const button = document.getElementById('payment-submit-btn');
        if (!button) {
            return;
        }

        const text = button.querySelector('.btn-text');
        const spinner = button.querySelector('.btn-spinner');

        if (loading) {
            button.disabled = true;
            text.textContent = 'Processing...';
            spinner.style.display = 'inline-block';
            button.setAttribute('aria-busy', 'true');
        } else {
            button.disabled = false;
            text.textContent = 'Complete Payment';
            spinner.style.display = 'none';
            button.setAttribute('aria-busy', 'false');
        }
    }

    handlePaymentAction(event) {
        const action = event.target.dataset.paymentAction;

        switch (action) {
        case 'back-to-tickets':
            this.setState({ currentStep: 'tickets' });
            this.showTicketSelection();
            break;

        case 'back-to-customer-info':
            this.setState({ currentStep: 'customer-info' });
            this.showCustomerInfoForm();
            break;

        default:
            console.warn('Unknown payment action:', action);
        }
    }

    showTicketSelection() {
        this.hideAllSteps();
        const ticketSection = document.querySelector('.ticket-selection');
        if (ticketSection) {
            ticketSection.style.display = 'block';
            ticketSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        this.analytics.track('returned_to_ticket_selection');
    }

    handleInventoryUpdate(data) {
        if (!data.available) {
            this.showInventoryAlert(data.unavailable);
        }
    }

    handleInventoryUnavailable(availability) {
        const unavailableItems = availability.unavailable;
        let message = 'Some items in your cart are no longer available:\n\n';

        unavailableItems.forEach(item => {
            message += `• ${item.name}: ${item.requested} requested, ${item.available} available\n`;
        });

        message += '\nPlease adjust your selection and try again.';

        this.showError(message);
        this.analytics.track('inventory_unavailable', { unavailable_items: unavailableItems });
    }

    handleCartUpdate(data) {
    // Update all order summaries
        this.updateOrderSummary('order-items', 'final-total');
        this.updateOrderSummary('customer-step-cart-items', 'customer-step-total');
        this.updateOrderSummary('payment-step-cart-items', 'payment-step-total');
    }

    updateOrderSummary(itemsElementId, totalElementId) {
        const itemsEl = document.getElementById(itemsElementId);
        const totalEl = document.getElementById(totalElementId);

        if (!itemsEl || !totalEl) {
            return;
        }

        const items = this.cartManager.getItems();
        const total = this.cartManager.getTotal();

        // Update items
        itemsEl.innerHTML = items.map(item => `
      <div class="order-item">
        <span class="item-details">${item.name} × ${item.quantity}</span>
        <span class="item-amount">$${item.price * item.quantity}</span>
      </div>
    `).join('');

        // Update total
        totalEl.textContent = `$${total}`;
    }

    createPaymentContainer() {
        const existingContainer = document.getElementById('payment-container');
        if (existingContainer) {
            return existingContainer;
        }

        const container = document.createElement('div');
        container.id = 'payment-container';
        container.className = 'payment-container';

        const ticketSection = document.querySelector('.ticket-selection');
        if (ticketSection) {
            ticketSection.parentNode.insertBefore(container, ticketSection.nextSibling);
        } else {
            document.querySelector('main').appendChild(container);
        }

        return container;
    }

    hideAllSteps() {
        const steps = document.querySelectorAll('.payment-step');
        steps.forEach(step => step.style.display = 'none');

        const ticketSection = document.querySelector('.ticket-selection');
        if (ticketSection) {
            ticketSection.style.display = 'none';
        }
    }

    showFormErrors(errors) {
        Object.entries(errors).forEach(([field, message]) => {
            const input = document.querySelector(`[name="${field}"]`);
            if (input) {
                const errorEl = input.parentNode.querySelector('.field-error');
                if (errorEl) {
                    errorEl.textContent = message;
                }
                input.classList.add('error');
                input.setAttribute('aria-invalid', 'true');
            }
        });
    }

    focusFirstError() {
        const firstError = document.querySelector('.form-input.error');
        if (firstError) {
            firstError.focus();
        }
    }

    focusFirstField() {
        const firstInput = document.querySelector('.form-input');
        if (firstInput) {
            firstInput.focus();
        }
    }

    focusPaymentElement() {
    // Stripe Elements handles focus automatically
        this.paymentElement?.focus();
    }

    handleEscapeKey(event) {
        if (this.state.currentStep === 'customer-info') {
            this.setState({ currentStep: 'tickets' });
            this.showTicketSelection();
        } else if (this.state.currentStep === 'payment') {
            this.setState({ currentStep: 'customer-info' });
            this.showCustomerInfoForm();
        }
    }

    handleError(message) {
        this.showError(message);
        this.analytics.track('payment_error', { error: message });
    }

    handlePaymentError(error) {
        let message = 'Payment failed. Please try again.';

        if (error.type === 'card_error') {
            message = error.message;
        } else if (error.type === 'validation_error') {
            message = 'Please check your payment information and try again.';
        }

        this.showError(message);
        this.analytics.track('payment_failed', {
            error_type: error.type,
            error_message: error.message
        });
    }

    showError(message) {
    // Create or update error display
        let errorEl = document.getElementById('payment-error-display');

        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'payment-error-display';
            errorEl.className = 'payment-error-display';
            errorEl.setAttribute('role', 'alert');
            errorEl.setAttribute('aria-live', 'assertive');

            const container = document.getElementById('payment-container') || document.querySelector('main');
            container.insertBefore(errorEl, container.firstChild);
        }

        errorEl.innerHTML = `
      <div class="error-content">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <div class="error-message">${message}</div>
        <button type="button" class="error-dismiss" aria-label="Dismiss error">×</button>
      </div>
    `;

        errorEl.style.display = 'block';
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (errorEl) {
                errorEl.style.display = 'none';
            }
        }, 10000);

        // Handle dismiss button
        const dismissBtn = errorEl.querySelector('.error-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                errorEl.style.display = 'none';
            });
        }
    }

    showInventoryAlert(unavailableItems) {
        const message = `Some tickets are no longer available. Please adjust your selection:\n\n${
            unavailableItems.map(item => `• ${item.name}: ${item.available} remaining`).join('\n')
        }`;

        this.showError(message);
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.updateUI();
    }

    updateUI() {
    // Update any UI elements that depend on state
        const checkoutBtn = document.getElementById('checkout-button');
        if (checkoutBtn) {
            checkoutBtn.disabled = this.state.isProcessing || this.cartManager.getItems().length === 0;
        }
    }

    // Public API for external integrations
    getState() {
        return { ...this.state };
    }

    resetPayment() {
        this.state = {
            ...this.state,
            isProcessing: false,
            currentStep: 'tickets',
            customerInfo: {},
            paymentIntent: null,
            sessionId: null,
            orderId: null,
            reservationId: null
        };

        this.hideAllSteps();
        this.showTicketSelection();
        this.analytics.track('payment_reset');
    }

    destroy() {
    // Clean up event listeners and resources
        this.inventory.stopPeriodicCheck();

        if (this.paymentElement) {
            this.paymentElement.destroy();
        }

        if (this.elements) {
            this.elements = null;
        }

        this.analytics.track('payment_integration_destroyed');
    }
}

// Initialize payment integration when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.ticket-selection')) {
        window.paymentIntegration = new PaymentIntegration();
    }
});

export { PaymentIntegration };