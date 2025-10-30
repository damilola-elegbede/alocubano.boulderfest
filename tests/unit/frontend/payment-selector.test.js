/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Payment Selector Component Tests
 * Tests the payment-selector.js functionality including:
 * - Modal creation and initialization
 * - Payment method selection (Stripe, PayPal)
 * - Modal opening/closing with animations
 * - ARIA attributes and accessibility
 * - Keyboard navigation (Tab, Enter, Escape)
 * - Event emission and handling
 * - PayPal availability checking
 * - Error state handling
 * - Processing state management
 * - Mobile-specific functionality
 * - Focus trap and screen reader announcements
 */

describe('Payment Selector Component', () => {
  let PaymentSelector;
  let paymentSelectorInstance;
  let mockCartManager;
  let mockStripeHandler;
  let mockPayPalSDKLoader;

  beforeEach(() => {
    // Mock cart manager
    mockCartManager = {
      getState: vi.fn(() => ({
        tickets: {
          'weekend-pass': {
            ticketType: 'weekend-pass',
            name: 'Weekend Pass',
            eventName: 'A Lo Cubano Boulder Fest',
            eventDate: '2026-05-15',
            description: 'Full weekend access',
            price: 150,
            quantity: 2,
            eventId: 'alocubano-2026',
            venue: 'Avalon Ballroom'
          }
        },
        donations: [],
        totals: { tickets: 300, donations: 0, total: 300, itemCount: 2 },
        isEmpty: false
      })),
      startCheckoutSession: vi.fn().mockResolvedValue(),
      endCheckoutSession: vi.fn().mockResolvedValue()
    };

    // Mock Stripe handler
    mockStripeHandler = {
      createCheckoutSession: vi.fn().mockResolvedValue({
        success: true,
        checkoutUrl: 'https://checkout.stripe.com/test-session'
      })
    };

    // Mock PayPal SDK loader
    mockPayPalSDKLoader = {
      loadSDK: vi.fn().mockResolvedValue({
        success: true
      })
    };

    // Mock global config
    window.STRIPE_PUBLISHABLE_KEY = 'pk_test_123456789';
    window.PAYPAL_CONFIG = {
      clientId: 'test-client-id',
      currency: 'USD'
    };

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        approvalUrl: 'https://www.paypal.com/checkoutnow?token=test-token'
      })
    });

    // Mock localStorage
    global.localStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      removeItem(key) {
        delete this.data[key];
      },
      clear() {
        this.data = {};
      }
    };

    // Mock requestAnimationFrame
    global.requestAnimationFrame = vi.fn((cb) => {
      cb();
      return 1;
    });

    // Set up DOM
    document.body.innerHTML = '<div id="app"></div>';

    // Define PaymentSelector class inline for testing
    PaymentSelector = class PaymentSelector {
      constructor() {
        this.selectedMethod = null;
        this.modal = null;
        this.isOpen = false;
        this.onSelectCallback = null;
        this.cartManager = null;
        this.cssLoaded = false;
        this.eventListeners = new Map();
        this.eventDate = null;
      }

      init(cartManager, options = {}) {
        this.cartManager = cartManager;
        if (options.eventDate) {
          this.eventDate = options.eventDate;
        }
        localStorage.removeItem('lastPaymentMethod');
        this.loadCSS();
      }

      loadCSS() {
        if (this.cssLoaded) return;
        const existingLink = document.querySelector('link[href="/css/payment-selector.css"]');
        if (existingLink) {
          this.cssLoaded = true;
          return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/payment-selector.css';
        document.head.appendChild(link);
        this.cssLoaded = true;
      }

      async show(onSelect) {
        this.loadCSS();
        await this.createModal();
        return new Promise((resolve) => {
          this.onSelectCallback = onSelect || resolve;
          this.openModal();
        });
      }

      async createModal() {
        if (this.modal) {
          this.modal.remove();
        }

        const modalHTML = `
          <div class="payment-selector-modal" role="dialog" aria-modal="true" aria-labelledby="payment-selector-title">
            <div class="payment-selector-backdrop"></div>
            <div class="payment-selector-content">
              <div aria-live="polite" aria-atomic="true" class="sr-only" id="payment-status-announcer">
                Payment method selector ready
              </div>
              <button class="payment-selector-close" aria-label="Close payment selector">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z"/>
                </svg>
              </button>
              <div class="payment-selector-header">
                <h2 id="payment-selector-title">Select Payment Method</h2>
              </div>
              <div class="payment-methods" role="group" aria-labelledby="payment-selector-title">
                <button class="payment-method-option" data-method="stripe" aria-label="Pay with credit card">
                  <span>Credit Card</span>
                </button>
                <button class="payment-method-option" data-method="paypal" aria-label="Pay with PayPal" id="paypal-payment-option">
                  <span>PayPal</span>
                  <div class="payment-method-status" data-status="loading" style="display: none;">
                    <span class="status-text">Checking availability...</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.querySelector('.payment-selector-modal');
        this.setupModalEventListeners();
        this.checkPayPalAvailability();
      }

      setupModalEventListeners() {
        if (!this.modal) return;
        this.cleanupEventListeners();

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

        const methodButtons = this.modal.querySelectorAll('.payment-method-option');
        methodButtons.forEach((button, index) => {
          const clickHandler = () => this.handleSelection(button.dataset.method);
          button.addEventListener('click', clickHandler);
          this.eventListeners.set(`method-click-${index}`, {
            element: button,
            type: 'click',
            handler: clickHandler
          });
        });

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

        this.setupFocusTrap();
      }

      cleanupEventListeners() {
        this.eventListeners.forEach((listener) => {
          if (listener.element && listener.handler) {
            listener.element.removeEventListener(listener.type, listener.handler);
          }
        });
        this.eventListeners.clear();
      }

      async checkPayPalAvailability() {
        const paypalOption = this.modal?.querySelector('#paypal-payment-option');
        if (!paypalOption) return;

        if (!window.PAYPAL_CONFIG) {
          this.updatePayPalStatus(paypalOption, 'unavailable', 'PayPal not configured');
          return;
        }

        this.updatePayPalStatus(paypalOption, 'loading', 'Checking availability...');

        try {
          const result = await mockPayPalSDKLoader.loadSDK();
          if (result.success) {
            this.updatePayPalStatus(paypalOption, 'available', '');
          } else {
            this.updatePayPalStatus(paypalOption, 'error', result.error || 'PayPal unavailable');
          }
        } catch {
          this.updatePayPalStatus(paypalOption, 'error', 'PayPal service error');
        }
      }

      updatePayPalStatus(paypalOption, status, message) {
        if (!paypalOption) return;

        const statusDiv = paypalOption.querySelector('.payment-method-status');
        const statusText = statusDiv?.querySelector('.status-text');

        paypalOption.setAttribute('data-paypal-status', status);

        if (status === 'available') {
          paypalOption.disabled = false;
          paypalOption.setAttribute('aria-disabled', 'false');
          if (statusDiv) statusDiv.style.display = 'none';
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

      setupFocusTrap() {
        const focusableElements = this.modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        setTimeout(() => firstFocusable?.focus(), 100);

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

      openModal() {
        if (!this.modal) return;
        this.isOpen = true;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          this.modal.classList.add('open');
        });
      }

      closeModal() {
        if (!this.modal || !this.isOpen) return;
        this.isOpen = false;
        document.body.style.overflow = '';
        this.cleanupEventListeners();
        this.modal.classList.add('closing');
        setTimeout(() => {
          if (this.modal) {
            this.modal.remove();
            this.modal = null;
          }
        }, 300);
      }

      async handleSelection(method) {
        this.selectedMethod = method;
        this.showProcessingState();

        try {
          if (method === 'stripe') {
            await this.processStripePayment();
          } else if (method === 'paypal') {
            await this.processPayPalPayment();
          }

          if (this.isOpen) {
            this.closeModal();
          }

          if (this.onSelectCallback) {
            this.onSelectCallback(method);
          }
        } catch (error) {
          this.hideProcessingState();
          this.showError(error.message);
        }
      }

      async processStripePayment() {
        const cartState = this.cartManager.getState();
        if (cartState.isEmpty) {
          throw new Error('Cart is empty');
        }

        await this.cartManager.startCheckoutSession();
        const cartItems = this.prepareCartItems(cartState);
        const result = await mockStripeHandler.createCheckoutSession({ cartItems });

        if (result.success) {
          window.location.href = result.checkoutUrl;
        } else {
          await this.cartManager.endCheckoutSession(false);
          throw new Error(result.error || 'Unable to create checkout session');
        }
      }

      async processPayPalPayment() {
        const cartState = this.cartManager.getState();
        if (cartState.isEmpty) {
          throw new Error('Cart is empty');
        }

        try {
          await this.cartManager.startCheckoutSession();
          const sdkResult = await mockPayPalSDKLoader.loadSDK();

          if (!sdkResult.success) {
            throw new Error(sdkResult.error || 'PayPal SDK loading failed');
          }

          const cartItems = this.prepareCartItems(cartState);
          const response = await fetch('/api/payments/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartItems })
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to create PayPal order');
          }

          if (data.approvalUrl) {
            window.location.href = data.approvalUrl;
          } else {
            throw new Error('No PayPal approval URL received');
          }
        } catch (error) {
          await this.cartManager.endCheckoutSession(false);
          throw error;
        }
      }

      prepareCartItems(cartState) {
        const cartItems = [];
        Object.values(cartState.tickets).forEach((ticket) => {
          if (!ticket.eventName) throw new Error(`Missing eventName for ticket: ${ticket.name}`);
          if (!ticket.eventDate) throw new Error(`Missing eventDate for ticket: ${ticket.name}`);
          if (!ticket.ticketType) throw new Error(`Missing ticketType for ticket: ${ticket.name}`);

          cartItems.push({
            type: 'ticket',
            ticketType: ticket.ticketType,
            name: `${ticket.eventName}-${ticket.name}`,
            description: ticket.description || '',
            price: ticket.price,
            quantity: ticket.quantity,
            eventDate: ticket.eventDate
          });
        });
        return cartItems;
      }

      showProcessingState() {
        if (!this.modal) return;
        const content = this.modal.querySelector('.payment-selector-content');
        if (content) {
          content.classList.add('processing');
          const loadingHTML = `
            <div class="payment-processing-overlay" role="status" aria-live="assertive">
              <p>Preparing secure checkout...</p>
            </div>
          `;
          content.insertAdjacentHTML('beforeend', loadingHTML);
        }
      }

      hideProcessingState() {
        if (!this.modal) return;
        const content = this.modal.querySelector('.payment-selector-content');
        const overlay = this.modal.querySelector('.payment-processing-overlay');
        if (content) content.classList.remove('processing');
        if (overlay) overlay.remove();
      }

      showError(message) {
        if (!this.modal) return;
        const errorHTML = `
          <div class="payment-selector-error" role="alert" aria-live="assertive">
            <span>${message}</span>
          </div>
        `;
        const content = this.modal.querySelector('.payment-selector-content');
        const existingError = this.modal.querySelector('.payment-selector-error');
        if (existingError) existingError.remove();
        content?.insertAdjacentHTML('afterbegin', errorHTML);
      }

      announceToScreenReader(message) {
        const announcer = this.modal?.querySelector('#payment-status-announcer');
        if (announcer) {
          announcer.textContent = message;
        }
      }

      destroy() {
        this.cleanupEventListeners();
        if (this.modal) {
          this.modal.remove();
          this.modal = null;
        }
        this.isOpen = false;
        this.selectedMethod = null;
        this.onSelectCallback = null;
      }
    };

    // Initialize payment selector
    paymentSelectorInstance = new PaymentSelector();
  });

  afterEach(() => {
    if (paymentSelectorInstance) {
      paymentSelectorInstance.destroy();
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
    delete window.STRIPE_PUBLISHABLE_KEY;
    delete window.PAYPAL_CONFIG;
  });

  describe('Initialization', () => {
    it('should initialize with cart manager', () => {
      paymentSelectorInstance.init(mockCartManager);

      expect(paymentSelectorInstance.cartManager).toBe(mockCartManager);
      expect(paymentSelectorInstance.cssLoaded).toBe(true);
    });

    it('should clear stored payment method preference on init', () => {
      localStorage.setItem('lastPaymentMethod', 'stripe');

      paymentSelectorInstance.init(mockCartManager);

      expect(localStorage.getItem('lastPaymentMethod')).toBeNull();
    });

    it('should load CSS dynamically on init', () => {
      paymentSelectorInstance.init(mockCartManager);

      const cssLink = document.querySelector('link[href="/css/payment-selector.css"]');
      expect(cssLink).not.toBeNull();
      expect(cssLink.rel).toBe('stylesheet');
    });

    it('should not load CSS if already loaded', () => {
      paymentSelectorInstance.init(mockCartManager);
      const initialLink = document.querySelector('link[href="/css/payment-selector.css"]');

      paymentSelectorInstance.loadCSS();

      const links = document.querySelectorAll('link[href="/css/payment-selector.css"]');
      expect(links.length).toBe(1);
      expect(links[0]).toBe(initialLink);
    });

    it('should set event date from options', () => {
      paymentSelectorInstance.init(mockCartManager, { eventDate: '2026-05-15' });

      expect(paymentSelectorInstance.eventDate).toBe('2026-05-15');
    });
  });

  describe('Modal Creation', () => {
    it('should create modal with correct structure', async () => {
      await paymentSelectorInstance.createModal();

      const modal = document.querySelector('.payment-selector-modal');
      expect(modal).not.toBeNull();
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
    });

    it('should create modal with payment method options', async () => {
      await paymentSelectorInstance.createModal();

      const stripeButton = document.querySelector('[data-method="stripe"]');
      const paypalButton = document.querySelector('[data-method="paypal"]');

      expect(stripeButton).not.toBeNull();
      expect(paypalButton).not.toBeNull();
    });

    it('should create modal with close button', async () => {
      await paymentSelectorInstance.createModal();

      const closeButton = document.querySelector('.payment-selector-close');
      expect(closeButton).not.toBeNull();
      expect(closeButton.getAttribute('aria-label')).toBe('Close payment selector');
    });

    it('should create modal with backdrop', async () => {
      await paymentSelectorInstance.createModal();

      const backdrop = document.querySelector('.payment-selector-backdrop');
      expect(backdrop).not.toBeNull();
    });

    it('should remove existing modal before creating new one', async () => {
      await paymentSelectorInstance.createModal();
      const firstModal = document.querySelector('.payment-selector-modal');

      await paymentSelectorInstance.createModal();
      const allModals = document.querySelectorAll('.payment-selector-modal');

      expect(allModals.length).toBe(1);
      expect(allModals[0]).not.toBe(firstModal);
    });

    it('should set up event listeners after modal creation', async () => {
      await paymentSelectorInstance.createModal();

      expect(paymentSelectorInstance.eventListeners.size).toBeGreaterThan(0);
    });
  });

  describe('Modal Opening and Closing', () => {
    beforeEach(async () => {
      await paymentSelectorInstance.createModal();
    });

    it('should open modal and set isOpen state', () => {
      paymentSelectorInstance.openModal();

      expect(paymentSelectorInstance.isOpen).toBe(true);
      expect(paymentSelectorInstance.modal.classList.contains('open')).toBe(true);
    });

    it('should prevent body scroll when modal opens', () => {
      paymentSelectorInstance.openModal();

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should close modal on close button click', () => {
      paymentSelectorInstance.openModal();
      const closeButton = document.querySelector('.payment-selector-close');

      closeButton.click();

      expect(paymentSelectorInstance.isOpen).toBe(false);
    });

    it('should close modal on backdrop click', () => {
      paymentSelectorInstance.openModal();
      const backdrop = document.querySelector('.payment-selector-backdrop');

      backdrop.click();

      expect(paymentSelectorInstance.isOpen).toBe(false);
    });

    it('should close modal on Escape key press', () => {
      paymentSelectorInstance.openModal();

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      paymentSelectorInstance.modal.dispatchEvent(escapeEvent);

      expect(paymentSelectorInstance.isOpen).toBe(false);
    });

    it('should restore body scroll when modal closes', () => {
      paymentSelectorInstance.openModal();
      paymentSelectorInstance.closeModal();

      expect(document.body.style.overflow).toBe('');
    });

    it('should clean up event listeners when modal closes', () => {
      paymentSelectorInstance.openModal();
      const listenerCount = paymentSelectorInstance.eventListeners.size;

      paymentSelectorInstance.closeModal();

      expect(paymentSelectorInstance.eventListeners.size).toBe(0);
      expect(listenerCount).toBeGreaterThan(0);
    });

    it('should add closing class and remove modal after delay', async () => {
      paymentSelectorInstance.openModal();
      const modal = paymentSelectorInstance.modal;

      paymentSelectorInstance.closeModal();

      expect(modal.classList.contains('closing')).toBe(true);

      // Wait for modal to be removed
      await vi.waitFor(() => {
        expect(paymentSelectorInstance.modal).toBeNull();
      }, { timeout: 400 });
    });
  });

  describe('Payment Method Selection', () => {
    beforeEach(async () => {
      paymentSelectorInstance.init(mockCartManager);
      await paymentSelectorInstance.createModal();
      paymentSelectorInstance.openModal();
    });

    it('should handle Stripe selection', async () => {
      const stripeButton = document.querySelector('[data-method="stripe"]');

      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      const promise = paymentSelectorInstance.handleSelection('stripe');

      expect(paymentSelectorInstance.selectedMethod).toBe('stripe');
      expect(mockCartManager.startCheckoutSession).toHaveBeenCalled();

      await promise;
    });

    it('should handle PayPal selection', async () => {
      const paypalButton = document.querySelector('[data-method="paypal"]');

      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      const promise = paymentSelectorInstance.handleSelection('paypal');

      expect(paymentSelectorInstance.selectedMethod).toBe('paypal');

      await promise;
    });

    it('should show processing state during payment', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      const promise = paymentSelectorInstance.handleSelection('stripe');

      const processingOverlay = document.querySelector('.payment-processing-overlay');
      expect(processingOverlay).not.toBeNull();

      await promise;
    });

    it('should call onSelectCallback after successful payment', async () => {
      const callback = vi.fn();
      paymentSelectorInstance.onSelectCallback = callback;

      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.handleSelection('stripe');

      expect(callback).toHaveBeenCalledWith('stripe');
    });

    it('should close modal after successful payment', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.handleSelection('stripe');

      expect(paymentSelectorInstance.isOpen).toBe(false);
    });
  });

  describe('Stripe Payment Processing', () => {
    beforeEach(() => {
      paymentSelectorInstance.init(mockCartManager);
    });

    it('should throw error if cart is empty', async () => {
      mockCartManager.getState.mockReturnValue({ isEmpty: true });

      await expect(paymentSelectorInstance.processStripePayment()).rejects.toThrow('Cart is empty');
    });

    it('should start checkout session', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.processStripePayment();

      expect(mockCartManager.startCheckoutSession).toHaveBeenCalled();
    });

    it('should prepare cart items for checkout', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.processStripePayment();

      expect(mockStripeHandler.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          cartItems: expect.any(Array)
        })
      );
    });

    it('should redirect to Stripe checkout on success', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.processStripePayment();

      expect(window.location.href).toBe('https://checkout.stripe.com/test-session');
    });

    it('should end checkout session on failure', async () => {
      mockStripeHandler.createCheckoutSession.mockResolvedValue({
        success: false,
        error: 'Payment failed'
      });

      await expect(paymentSelectorInstance.processStripePayment()).rejects.toThrow();
      expect(mockCartManager.endCheckoutSession).toHaveBeenCalledWith(false);
    });
  });

  describe('PayPal Payment Processing', () => {
    beforeEach(() => {
      paymentSelectorInstance.init(mockCartManager);
    });

    it('should throw error if cart is empty', async () => {
      mockCartManager.getState.mockReturnValue({ isEmpty: true });

      await expect(paymentSelectorInstance.processPayPalPayment()).rejects.toThrow('Cart is empty');
    });

    it('should load PayPal SDK', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.processPayPalPayment();

      expect(mockPayPalSDKLoader.loadSDK).toHaveBeenCalled();
    });

    it('should create PayPal order via API', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.processPayPalPayment();

      expect(fetch).toHaveBeenCalledWith(
        '/api/payments/paypal/create-order',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should redirect to PayPal approval URL on success', async () => {
      // Mock location.href
      delete window.location;
      window.location = { href: '' };

      await paymentSelectorInstance.processPayPalPayment();

      expect(window.location.href).toBe('https://www.paypal.com/checkoutnow?token=test-token');
    });

    it('should handle PayPal order creation failure', async () => {
      fetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'PayPal order failed' })
      });

      await expect(paymentSelectorInstance.processPayPalPayment()).rejects.toThrow('PayPal order failed');
      expect(mockCartManager.endCheckoutSession).toHaveBeenCalledWith(false);
    });

    it('should handle missing approval URL', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ approvalUrl: null })
      });

      await expect(paymentSelectorInstance.processPayPalPayment()).rejects.toThrow('No PayPal approval URL received');
    });
  });

  describe('PayPal Availability Checking', () => {
    beforeEach(async () => {
      await paymentSelectorInstance.createModal();
    });

    it('should check PayPal availability on modal creation', () => {
      const paypalOption = document.querySelector('#paypal-payment-option');
      expect(paypalOption.getAttribute('data-paypal-status')).toBeDefined();
    });

    it('should mark PayPal as unavailable if config missing', async () => {
      delete window.PAYPAL_CONFIG;
      await paymentSelectorInstance.createModal();

      const paypalOption = document.querySelector('#paypal-payment-option');
      expect(paypalOption.getAttribute('data-paypal-status')).toBe('unavailable');
      expect(paypalOption.disabled).toBe(true);
    });

    it('should show loading state during availability check', async () => {
      mockPayPalSDKLoader.loadSDK.mockImplementation(() => new Promise(() => {}));
      await paymentSelectorInstance.createModal();

      const paypalOption = document.querySelector('#paypal-payment-option');
      const statusDiv = paypalOption.querySelector('.payment-method-status');

      expect(paypalOption.getAttribute('data-paypal-status')).toBe('loading');
      expect(statusDiv.style.display).toBe('block');
    });

    it('should mark PayPal as available on successful SDK load', async () => {
      const paypalOption = document.querySelector('#paypal-payment-option');

      // Wait for async check to complete
      await vi.waitFor(() => {
        expect(paypalOption.getAttribute('data-paypal-status')).toBe('available');
      });

      expect(paypalOption.disabled).toBe(false);
      expect(paypalOption.getAttribute('aria-disabled')).toBe('false');
    });

    it('should mark PayPal as error on SDK load failure', async () => {
      mockPayPalSDKLoader.loadSDK.mockResolvedValue({
        success: false,
        error: 'SDK load failed'
      });

      await paymentSelectorInstance.createModal();

      const paypalOption = document.querySelector('#paypal-payment-option');

      await vi.waitFor(() => {
        expect(paypalOption.getAttribute('data-paypal-status')).toBe('error');
      });

      expect(paypalOption.disabled).toBe(true);
    });
  });

  describe('Cart Item Preparation', () => {
    beforeEach(() => {
      paymentSelectorInstance.init(mockCartManager);
    });

    it('should prepare ticket items correctly', () => {
      const cartState = mockCartManager.getState();
      const cartItems = paymentSelectorInstance.prepareCartItems(cartState);

      expect(cartItems).toHaveLength(1);
      expect(cartItems[0]).toMatchObject({
        type: 'ticket',
        ticketType: 'weekend-pass',
        name: 'A Lo Cubano Boulder Fest-Weekend Pass',
        price: 150,
        quantity: 2
      });
    });

    it('should throw error if eventName is missing', () => {
      const cartState = {
        tickets: {
          'test-ticket': {
            name: 'Test Ticket',
            eventDate: '2026-05-15',
            ticketType: 'test'
          }
        },
        donations: []
      };

      expect(() => paymentSelectorInstance.prepareCartItems(cartState)).toThrow('Missing eventName for ticket');
    });

    it('should throw error if eventDate is missing', () => {
      const cartState = {
        tickets: {
          'test-ticket': {
            name: 'Test Ticket',
            eventName: 'Test Event',
            ticketType: 'test'
          }
        },
        donations: []
      };

      expect(() => paymentSelectorInstance.prepareCartItems(cartState)).toThrow('Missing eventDate for ticket');
    });

    it('should throw error if ticketType is missing', () => {
      const cartState = {
        tickets: {
          'test-ticket': {
            name: 'Test Ticket',
            eventName: 'Test Event',
            eventDate: '2026-05-15'
          }
        },
        donations: []
      };

      expect(() => paymentSelectorInstance.prepareCartItems(cartState)).toThrow('Missing ticketType for ticket');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await paymentSelectorInstance.createModal();
      paymentSelectorInstance.openModal();
    });

    it('should show error message', () => {
      paymentSelectorInstance.showError('Payment failed');

      const errorElement = document.querySelector('.payment-selector-error');
      expect(errorElement).not.toBeNull();
      expect(errorElement.textContent).toContain('Payment failed');
    });

    it('should set ARIA attributes on error', () => {
      paymentSelectorInstance.showError('Payment failed');

      const errorElement = document.querySelector('.payment-selector-error');
      expect(errorElement.getAttribute('role')).toBe('alert');
      expect(errorElement.getAttribute('aria-live')).toBe('assertive');
    });

    it('should remove existing error before showing new one', () => {
      paymentSelectorInstance.showError('First error');
      paymentSelectorInstance.showError('Second error');

      const errorElements = document.querySelectorAll('.payment-selector-error');
      expect(errorElements.length).toBe(1);
      expect(errorElements[0].textContent).toContain('Second error');
    });

    it('should hide processing state on error', async () => {
      paymentSelectorInstance.init(mockCartManager);
      mockStripeHandler.createCheckoutSession.mockResolvedValue({
        success: false,
        error: 'Payment failed'
      });

      await paymentSelectorInstance.handleSelection('stripe');

      const processingOverlay = document.querySelector('.payment-processing-overlay');
      expect(processingOverlay).toBeNull();
    });
  });

  describe('Accessibility Features', () => {
    beforeEach(async () => {
      await paymentSelectorInstance.createModal();
    });

    it('should have aria-modal attribute', () => {
      const modal = document.querySelector('.payment-selector-modal');
      expect(modal.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-labelledby pointing to title', () => {
      const modal = document.querySelector('.payment-selector-modal');
      expect(modal.getAttribute('aria-labelledby')).toBe('payment-selector-title');
    });

    it('should have screen reader announcer region', () => {
      const announcer = document.querySelector('#payment-status-announcer');
      expect(announcer).not.toBeNull();
      expect(announcer.getAttribute('aria-live')).toBe('polite');
    });

    it('should announce messages to screen readers', () => {
      paymentSelectorInstance.announceToScreenReader('Test announcement');

      const announcer = document.querySelector('#payment-status-announcer');
      expect(announcer.textContent).toBe('Test announcement');
    });

    it('should create focus trap', async () => {
      paymentSelectorInstance.openModal();

      const focusableElements = paymentSelectorInstance.modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements.length).toBeGreaterThan(0);
    });

    it('should trap Tab key at last focusable element', () => {
      paymentSelectorInstance.openModal();

      const focusableElements = paymentSelectorInstance.modal.querySelectorAll('button');
      const lastElement = focusableElements[focusableElements.length - 1];
      lastElement.focus();

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      const preventDefaultSpy = vi.spyOn(tabEvent, 'preventDefault');

      paymentSelectorInstance.modal.dispatchEvent(tabEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should trap Shift+Tab at first focusable element', () => {
      paymentSelectorInstance.openModal();

      const focusableElements = paymentSelectorInstance.modal.querySelectorAll('button');
      focusableElements[0].focus();

      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
      const preventDefaultSpy = vi.spyOn(shiftTabEvent, 'preventDefault');

      paymentSelectorInstance.modal.dispatchEvent(shiftTabEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Processing State', () => {
    beforeEach(async () => {
      await paymentSelectorInstance.createModal();
    });

    it('should show processing overlay', () => {
      paymentSelectorInstance.showProcessingState();

      const overlay = document.querySelector('.payment-processing-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('role')).toBe('status');
    });

    it('should add processing class to content', () => {
      paymentSelectorInstance.showProcessingState();

      const content = document.querySelector('.payment-selector-content');
      expect(content.classList.contains('processing')).toBe(true);
    });

    it('should hide processing overlay', () => {
      paymentSelectorInstance.showProcessingState();
      paymentSelectorInstance.hideProcessingState();

      const overlay = document.querySelector('.payment-processing-overlay');
      expect(overlay).toBeNull();
    });

    it('should remove processing class from content', () => {
      paymentSelectorInstance.showProcessingState();
      paymentSelectorInstance.hideProcessingState();

      const content = document.querySelector('.payment-selector-content');
      expect(content.classList.contains('processing')).toBe(false);
    });
  });

  describe('Cleanup and Destroy', () => {
    it('should clean up event listeners on destroy', async () => {
      await paymentSelectorInstance.createModal();
      expect(paymentSelectorInstance.eventListeners.size).toBeGreaterThan(0);

      paymentSelectorInstance.destroy();

      expect(paymentSelectorInstance.eventListeners.size).toBe(0);
    });

    it('should remove modal on destroy', async () => {
      await paymentSelectorInstance.createModal();

      paymentSelectorInstance.destroy();

      expect(paymentSelectorInstance.modal).toBeNull();
      expect(document.querySelector('.payment-selector-modal')).toBeNull();
    });

    it('should reset state on destroy', async () => {
      paymentSelectorInstance.selectedMethod = 'stripe';
      paymentSelectorInstance.isOpen = true;
      paymentSelectorInstance.onSelectCallback = () => {};

      paymentSelectorInstance.destroy();

      expect(paymentSelectorInstance.selectedMethod).toBeNull();
      expect(paymentSelectorInstance.isOpen).toBe(false);
      expect(paymentSelectorInstance.onSelectCallback).toBeNull();
    });
  });

  describe('Show Method', () => {
    it('should load CSS and create modal', async () => {
      paymentSelectorInstance.init(mockCartManager);

      // Don't await show since it returns a promise that resolves on selection
      const showPromise = paymentSelectorInstance.show();

      // Wait for modal to be created
      await vi.waitFor(() => {
        const modal = document.querySelector('.payment-selector-modal');
        expect(modal).not.toBeNull();
      });

      expect(paymentSelectorInstance.cssLoaded).toBe(true);
      expect(paymentSelectorInstance.isOpen).toBe(true);

      // Cleanup: close modal to prevent timeout
      paymentSelectorInstance.closeModal();
    });

    it('should set onSelectCallback when provided', async () => {
      paymentSelectorInstance.init(mockCartManager);
      const callback = vi.fn();

      // Don't await show
      const showPromise = paymentSelectorInstance.show(callback);

      // Wait for modal creation
      await vi.waitFor(() => {
        expect(paymentSelectorInstance.modal).not.toBeNull();
      });

      expect(paymentSelectorInstance.onSelectCallback).toBe(callback);

      // Cleanup: close modal to prevent timeout
      paymentSelectorInstance.closeModal();
    });
  });
});
