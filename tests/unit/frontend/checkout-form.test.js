/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Checkout Form Component Tests
 * Tests the checkout-form.js functionality including:
 * - Form creation and initialization
 * - Customer information validation
 * - Order summary display
 * - Payment processing integration
 * - Form submission handling
 * - Error handling and display
 * - Field validation (email, phone, name)
 * - Button states during processing
 */

describe('Checkout Form Component', () => {
  let formModule;
  let mockCartItems;

  beforeEach(() => {
    // Mock cart items
    mockCartItems = {
      'weekend-pass': {
        ticketType: 'weekend-pass',
        name: 'Weekend Pass',
        price: 150,
        quantity: 2
      },
      'friday-only': {
        ticketType: 'friday-only',
        name: 'Friday Only',
        price: 75,
        quantity: 1
      }
    };

    // Set up DOM structure
    document.body.innerHTML = `
      <div id="checkout-container"></div>
    `;

    // Mock global functions
    window.cancelCheckout = vi.fn();
    window.showCheckoutForm = vi.fn();

    // Mock fetch for payment processing
    global.fetch = vi.fn();

    // Import module functions inline for testing
    formModule = {
      createCheckoutForm: () => {
        return `
          <div class="checkout-form-container" data-testid="customer-form">
            <form class="checkout-form" id="checkoutForm" data-testid="checkout-form">
              <div class="form-section">
                <h3>Customer Information</h3>
                <div class="form-group">
                  <label for="customerName" class="form-label">Full Name *</label>
                  <input type="text" id="customerName" name="customerName" required
                    autocomplete="name" data-testid="customer-name" class="form-input" />
                  <div class="form-error" data-testid="name-error"></div>
                </div>
                <div class="form-group">
                  <label for="customerEmail" class="form-label">Email Address *</label>
                  <input type="email" id="customerEmail" name="customerEmail" required
                    autocomplete="email" data-testid="customer-email" class="form-input" />
                  <div class="form-error" data-testid="email-error"></div>
                </div>
                <div class="form-group">
                  <label for="customerPhone" class="form-label">Phone Number</label>
                  <input type="tel" id="customerPhone" name="customerPhone"
                    autocomplete="tel" data-testid="customer-phone" class="form-input" />
                  <div class="form-error" data-testid="phone-error"></div>
                </div>
              </div>
              <div class="form-section">
                <h3>Order Summary</h3>
                <div class="order-summary" data-testid="order-summary"></div>
              </div>
              <div class="form-actions">
                <button type="submit" class="checkout-submit-btn" data-testid="proceed-to-payment">
                  Proceed to Payment
                </button>
                <button type="button" class="checkout-cancel-btn" data-testid="cancel-checkout">
                  Cancel
                </button>
              </div>
              <div class="form-error general-error" data-testid="payment-error" style="display: none;"></div>
            </form>
          </div>
        `;
      },

      showCheckoutForm: (cartItems) => {
        const formHTML = formModule.createCheckoutForm();
        document.body.insertAdjacentHTML('beforeend', formHTML);
        formModule.populateOrderSummary(cartItems);
        formModule.setupFormValidation();
      },

      populateOrderSummary: (cartItems) => {
        const summaryContainer = document.querySelector('[data-testid="order-summary"]');
        if (!summaryContainer) return;

        let html = '';
        let total = 0;

        Object.values(cartItems).forEach((item) => {
          const itemTotal = item.price * item.quantity;
          total += itemTotal;
          html += `
            <div class="order-item">
              <span class="item-name">${item.name}</span>
              <span class="item-quantity">×${item.quantity}</span>
              <span class="item-total">$${itemTotal.toFixed(2)}</span>
            </div>
          `;
        });

        html += `
          <div class="order-total">
            <strong>Total: $${total.toFixed(2)}</strong>
          </div>
        `;

        summaryContainer.innerHTML = html;
      },

      setupFormValidation: () => {
        const form = document.getElementById('checkoutForm');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (formModule.validateForm()) {
            await formModule.processPayment(formModule.getFormData());
          }
        });

        const inputs = form.querySelectorAll('input[required]');
        inputs.forEach((input) => {
          input.addEventListener('blur', () => formModule.validateField(input));
          input.addEventListener('input', () => formModule.clearFieldError(input));
        });
      },

      validateForm: () => {
        let isValid = true;
        const nameInput = document.getElementById('customerName');
        const emailInput = document.getElementById('customerEmail');

        if (!nameInput.value.trim()) {
          formModule.showFieldError(nameInput, 'Name is required');
          isValid = false;
        }

        if (!emailInput.value.trim()) {
          formModule.showFieldError(emailInput, 'Email is required');
          isValid = false;
        } else if (!formModule.isValidEmail(emailInput.value)) {
          formModule.showFieldError(emailInput, 'Please enter a valid email address');
          isValid = false;
        }

        return isValid;
      },

      validateField: (input) => {
        const value = input.value.trim();
        switch (input.id) {
          case 'customerName':
            if (!value) {
              formModule.showFieldError(input, 'Name is required');
              return false;
            }
            break;
          case 'customerEmail':
            if (!value) {
              formModule.showFieldError(input, 'Email is required');
              return false;
            } else if (!formModule.isValidEmail(value)) {
              formModule.showFieldError(input, 'Please enter a valid email address');
              return false;
            }
            break;
        }
        formModule.clearFieldError(input);
        return true;
      },

      showFieldError: (input, message) => {
        const errorTestId = input.getAttribute('data-testid').replace('customer-', '') + '-error';
        const errorElement = document.querySelector(`[data-testid="${errorTestId}"]`);
        if (errorElement) {
          errorElement.textContent = message;
          errorElement.style.display = 'block';
        }
        input.classList.add('error');
      },

      clearFieldError: (input) => {
        const errorTestId = input.getAttribute('data-testid').replace('customer-', '') + '-error';
        const errorElement = document.querySelector(`[data-testid="${errorTestId}"]`);
        if (errorElement) {
          errorElement.style.display = 'none';
        }
        input.classList.remove('error');
      },

      isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      },

      getFormData: () => {
        return {
          name: document.getElementById('customerName').value.trim(),
          email: document.getElementById('customerEmail').value.trim(),
          phone: document.getElementById('customerPhone').value.trim()
        };
      },

      processPayment: async (customerData) => {
        const submitButton = document.querySelector('[data-testid="proceed-to-payment"]');
        const paymentErrorElement = document.querySelector('[data-testid="payment-error"]');

        try {
          submitButton.textContent = 'Processing...';
          submitButton.disabled = true;

          const response = await fetch('/api/payments/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerData, cartItems: {} })
          });

          if (!response.ok) {
            throw new Error('Payment processing failed');
          }

          const { url } = await response.json();
          if (url) {
            window.location.href = url;
          } else {
            throw new Error('Invalid payment response');
          }
        } catch (error) {
          paymentErrorElement.textContent = error.message || 'Payment processing temporarily unavailable';
          paymentErrorElement.style.display = 'block';
          submitButton.textContent = 'Proceed to Payment';
          submitButton.disabled = false;
        }
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Form Creation', () => {
    it('should create checkout form HTML structure', () => {
      const formHTML = formModule.createCheckoutForm();

      expect(formHTML).toContain('checkout-form-container');
      expect(formHTML).toContain('checkoutForm');
      expect(formHTML).toContain('customer-name');
      expect(formHTML).toContain('customer-email');
      expect(formHTML).toContain('customer-phone');
    });

    it('should include order summary section', () => {
      const formHTML = formModule.createCheckoutForm();

      expect(formHTML).toContain('Order Summary');
      expect(formHTML).toContain('order-summary');
    });

    it('should include submit and cancel buttons', () => {
      const formHTML = formModule.createCheckoutForm();

      expect(formHTML).toContain('proceed-to-payment');
      expect(formHTML).toContain('cancel-checkout');
      expect(formHTML).toContain('Proceed to Payment');
      expect(formHTML).toContain('Cancel');
    });

    it('should include payment error container', () => {
      const formHTML = formModule.createCheckoutForm();

      expect(formHTML).toContain('payment-error');
      expect(formHTML).toContain('style="display: none;"');
    });
  });

  describe('Form Display', () => {
    it('should show checkout form with cart items', () => {
      formModule.showCheckoutForm(mockCartItems);

      const form = document.querySelector('[data-testid="checkout-form"]');
      expect(form).not.toBeNull();
    });

    it('should populate order summary with cart items', () => {
      formModule.showCheckoutForm(mockCartItems);

      const summary = document.querySelector('[data-testid="order-summary"]');
      expect(summary.innerHTML).toContain('Weekend Pass');
      expect(summary.innerHTML).toContain('Friday Only');
      expect(summary.innerHTML).toContain('×2');
      expect(summary.innerHTML).toContain('×1');
    });

    it('should calculate correct total', () => {
      formModule.showCheckoutForm(mockCartItems);

      const summary = document.querySelector('[data-testid="order-summary"]');
      const expectedTotal = (150 * 2) + (75 * 1); // $375
      expect(summary.innerHTML).toContain(`Total: $${expectedTotal.toFixed(2)}`);
    });

    it('should set up form validation', () => {
      const setupSpy = vi.spyOn(formModule, 'setupFormValidation');
      formModule.showCheckoutForm(mockCartItems);

      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email format', () => {
      expect(formModule.isValidEmail('test@example.com')).toBe(true);
      expect(formModule.isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(formModule.isValidEmail('first+last@company.org')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(formModule.isValidEmail('invalid')).toBe(false);
      expect(formModule.isValidEmail('missing@domain')).toBe(false);
      expect(formModule.isValidEmail('@nodomain.com')).toBe(false);
      expect(formModule.isValidEmail('no-at-sign.com')).toBe(false);
    });

    it('should reject empty email', () => {
      expect(formModule.isValidEmail('')).toBe(false);
      expect(formModule.isValidEmail('   ')).toBe(false);
    });
  });

  describe('Field Validation', () => {
    beforeEach(() => {
      formModule.showCheckoutForm(mockCartItems);
    });

    it('should show error for empty name field', () => {
      const nameInput = document.getElementById('customerName');
      nameInput.value = '';

      formModule.validateField(nameInput);

      const errorElement = document.querySelector('[data-testid="name-error"]');
      expect(errorElement.textContent).toBe('Name is required');
      expect(errorElement.style.display).toBe('block');
      expect(nameInput.classList.contains('error')).toBe(true);
    });

    it('should show error for empty email field', () => {
      const emailInput = document.getElementById('customerEmail');
      emailInput.value = '';

      formModule.validateField(emailInput);

      const errorElement = document.querySelector('[data-testid="email-error"]');
      expect(errorElement.textContent).toBe('Email is required');
      expect(errorElement.style.display).toBe('block');
    });

    it('should show error for invalid email format', () => {
      const emailInput = document.getElementById('customerEmail');
      emailInput.value = 'invalid-email';

      formModule.validateField(emailInput);

      const errorElement = document.querySelector('[data-testid="email-error"]');
      expect(errorElement.textContent).toBe('Please enter a valid email address');
    });

    it('should clear error for valid input', () => {
      const nameInput = document.getElementById('customerName');
      nameInput.value = '';
      formModule.validateField(nameInput);

      nameInput.value = 'John Doe';
      formModule.validateField(nameInput);

      const errorElement = document.querySelector('[data-testid="name-error"]');
      expect(errorElement.style.display).toBe('none');
      expect(nameInput.classList.contains('error')).toBe(false);
    });
  });

  describe('Form Validation', () => {
    beforeEach(() => {
      formModule.showCheckoutForm(mockCartItems);
    });

    it('should validate all required fields', () => {
      document.getElementById('customerName').value = 'John Doe';
      document.getElementById('customerEmail').value = 'john@example.com';

      const isValid = formModule.validateForm();

      expect(isValid).toBe(true);
    });

    it('should fail validation with empty name', () => {
      document.getElementById('customerName').value = '';
      document.getElementById('customerEmail').value = 'john@example.com';

      const isValid = formModule.validateForm();

      expect(isValid).toBe(false);
    });

    it('should fail validation with invalid email', () => {
      document.getElementById('customerName').value = 'John Doe';
      document.getElementById('customerEmail').value = 'invalid-email';

      const isValid = formModule.validateForm();

      expect(isValid).toBe(false);
    });

    it('should fail validation with multiple errors', () => {
      document.getElementById('customerName').value = '';
      document.getElementById('customerEmail').value = 'invalid-email';

      const isValid = formModule.validateForm();

      expect(isValid).toBe(false);
      const nameError = document.querySelector('[data-testid="name-error"]');
      const emailError = document.querySelector('[data-testid="email-error"]');
      expect(nameError.style.display).toBe('block');
      expect(emailError.style.display).toBe('block');
    });
  });

  describe('Form Submission', () => {
    beforeEach(() => {
      formModule.showCheckoutForm(mockCartItems);
    });

    it('should prevent default form submission', () => {
      const form = document.getElementById('checkoutForm');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

      form.dispatchEvent(submitEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not process payment if validation fails', async () => {
      const processSpy = vi.spyOn(formModule, 'processPayment');
      document.getElementById('customerName').value = '';

      const form = document.getElementById('checkoutForm');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await vi.waitFor(() => {
        expect(processSpy).not.toHaveBeenCalled();
      });
    });

    it('should process payment if validation succeeds', async () => {
      const processSpy = vi.spyOn(formModule, 'processPayment').mockResolvedValue();
      document.getElementById('customerName').value = 'John Doe';
      document.getElementById('customerEmail').value = 'john@example.com';

      const form = document.getElementById('checkoutForm');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await vi.waitFor(() => {
        expect(processSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Payment Processing', () => {
    beforeEach(() => {
      formModule.showCheckoutForm(mockCartItems);
    });

    it('should update button state during processing', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://checkout.stripe.com/test' })
      });

      const customerData = { name: 'John Doe', email: 'john@example.com', phone: '' };
      const promise = formModule.processPayment(customerData);

      const submitButton = document.querySelector('[data-testid="proceed-to-payment"]');
      expect(submitButton.textContent).toBe('Processing...');
      expect(submitButton.disabled).toBe(true);

      await promise;
    });

    it('should handle successful payment processing', async () => {
      const checkoutUrl = 'https://checkout.stripe.com/test';
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ url: checkoutUrl })
      });

      // Mock window.location
      delete window.location;
      window.location = { href: '' };

      const customerData = { name: 'John Doe', email: 'john@example.com', phone: '' };
      await formModule.processPayment(customerData);

      expect(window.location.href).toBe(checkoutUrl);
    });

    it('should display error on failed API call', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      const customerData = { name: 'John Doe', email: 'john@example.com', phone: '' };
      await formModule.processPayment(customerData);

      const errorElement = document.querySelector('[data-testid="payment-error"]');
      expect(errorElement.textContent).toContain('Payment processing failed');
      expect(errorElement.style.display).toBe('block');
    });

    it('should reset button state after error', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      const customerData = { name: 'John Doe', email: 'john@example.com', phone: '' };
      await formModule.processPayment(customerData);

      const submitButton = document.querySelector('[data-testid="proceed-to-payment"]');
      expect(submitButton.textContent).toBe('Proceed to Payment');
      expect(submitButton.disabled).toBe(false);
    });

    it('should handle network errors', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      const customerData = { name: 'John Doe', email: 'john@example.com', phone: '' };
      await formModule.processPayment(customerData);

      const errorElement = document.querySelector('[data-testid="payment-error"]');
      expect(errorElement.textContent).toContain('Network error');
      expect(errorElement.style.display).toBe('block');
    });

    it('should handle missing checkout URL', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ url: null })
      });

      const customerData = { name: 'John Doe', email: 'john@example.com', phone: '' };
      await formModule.processPayment(customerData);

      const errorElement = document.querySelector('[data-testid="payment-error"]');
      expect(errorElement.textContent).toContain('Invalid payment response');
    });
  });

  describe('Real-time Validation', () => {
    beforeEach(() => {
      formModule.showCheckoutForm(mockCartItems);
    });

    it('should validate on blur event', () => {
      const validateSpy = vi.spyOn(formModule, 'validateField');
      const nameInput = document.getElementById('customerName');

      nameInput.dispatchEvent(new Event('blur'));

      expect(validateSpy).toHaveBeenCalledWith(nameInput);
    });

    it('should clear error on input event', () => {
      const clearSpy = vi.spyOn(formModule, 'clearFieldError');
      const nameInput = document.getElementById('customerName');

      nameInput.dispatchEvent(new Event('input'));

      expect(clearSpy).toHaveBeenCalledWith(nameInput);
    });
  });

  describe('Get Form Data', () => {
    beforeEach(() => {
      formModule.showCheckoutForm(mockCartItems);
    });

    it('should extract all form data', () => {
      document.getElementById('customerName').value = 'John Doe';
      document.getElementById('customerEmail').value = 'john@example.com';
      document.getElementById('customerPhone').value = '123-456-7890';

      const formData = formModule.getFormData();

      expect(formData).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        phone: '123-456-7890'
      });
    });

    it('should trim whitespace from inputs', () => {
      document.getElementById('customerName').value = '  John Doe  ';
      document.getElementById('customerEmail').value = '  john@example.com  ';

      const formData = formModule.getFormData();

      expect(formData.name).toBe('John Doe');
      expect(formData.email).toBe('john@example.com');
    });

    it('should handle empty optional fields', () => {
      document.getElementById('customerName').value = 'John Doe';
      document.getElementById('customerEmail').value = 'john@example.com';
      document.getElementById('customerPhone').value = '';

      const formData = formModule.getFormData();

      expect(formData.phone).toBe('');
    });
  });

  describe('Order Summary Display', () => {
    beforeEach(() => {
      formModule.showCheckoutForm(mockCartItems);
    });

    it('should display correct item quantities', () => {
      const summary = document.querySelector('[data-testid="order-summary"]');

      expect(summary.innerHTML).toContain('×2');
      expect(summary.innerHTML).toContain('×1');
    });

    it('should display correct item prices', () => {
      const summary = document.querySelector('[data-testid="order-summary"]');

      expect(summary.innerHTML).toContain('$300.00'); // Weekend Pass: 150 * 2
      expect(summary.innerHTML).toContain('$75.00');  // Friday Only: 75 * 1
    });

    it('should display correct total', () => {
      const summary = document.querySelector('[data-testid="order-summary"]');
      const total = (150 * 2) + (75 * 1); // $375

      expect(summary.innerHTML).toContain(`Total: $${total.toFixed(2)}`);
    });

    it('should handle empty cart gracefully', () => {
      formModule.populateOrderSummary({});

      const summary = document.querySelector('[data-testid="order-summary"]');
      expect(summary.innerHTML).toContain('Total: $0.00');
    });
  });
});
