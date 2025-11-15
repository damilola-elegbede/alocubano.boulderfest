/**
 * Checkout Registration Page
 * Handles inline registration during checkout before payment
 */

import { getCartManager } from './lib/cart-manager.js';
import errorNotifier from './lib/error-notifier.js';

// State management
let cartState = null;
let registrationData = {
  customerInfo: {},
  tickets: []
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Checkout registration page initializing...');

  try {
    // Initialize cart manager
    const cartManager = getCartManager();
    await cartManager.initialize();

    // Load cart state
    cartState = cartManager.getState();
    console.log('Cart state loaded:', cartState);

    // Validate cart has items
    if (cartState.isEmpty || Object.keys(cartState.tickets).length === 0) {
      console.warn('Cart is empty, redirecting to tickets page');
      showError('Your cart is empty. Please add tickets before proceeding.', () => {
        window.location.href = '/tickets';
      });
      return;
    }

    // Generate ticket forms
    generateTicketForms();

    // Setup event listeners
    setupEventListeners();

    console.log('Checkout registration initialized successfully');
  } catch (error) {
    console.error('Error initializing checkout registration:', error);
    showError('Failed to load registration form. Please try again.', () => {
      window.location.href = '/tickets';
    });
  }
});

/**
 * Generate ticket registration forms
 */
function generateTicketForms() {
  const container = document.getElementById('tickets-container');
  if (!container) return;

  container.innerHTML = '';

  const tickets = Object.values(cartState.tickets);
  let ticketIndex = 0;

  tickets.forEach((ticket) => {
    const { ticketType, name, price, quantity, eventName } = ticket;

    for (let i = 0; i < quantity; i++) {
      ticketIndex++;

      const ticketForm = createTicketFormHTML({
        ticketIndex,
        ticketType,
        ticketName: name,
        eventName,
        price
      });

      container.insertAdjacentHTML('beforeend', ticketForm);
    }
  });

  console.log(`Generated ${ticketIndex} ticket forms`);
}

/**
 * Create HTML for a single ticket form
 */
function createTicketFormHTML({ ticketIndex, ticketType, ticketName, eventName, price }) {
  return `
    <fieldset class="ticket-fieldset" data-ticket-index="${ticketIndex}" data-ticket-type="${ticketType}">
      <legend class="ticket-legend">
        <span class="ticket-number">Ticket ${ticketIndex}</span>
        <span class="ticket-info">${ticketName} - ${eventName || 'Event'}</span>
        <span class="ticket-price">$${parseFloat(price).toFixed(2)}</span>
      </legend>

      <div class="form-grid">
        <div class="form-group">
          <label for="ticket-${ticketIndex}-first-name" class="form-label">First Name *</label>
          <input
            type="text"
            id="ticket-${ticketIndex}-first-name"
            name="ticket-${ticketIndex}-first-name"
            class="form-input ticket-first-name"
            data-ticket-index="${ticketIndex}"
            required
            pattern="[a-zA-Z\\s'\\-]{1,50}"
            maxlength="50"
            autocomplete="given-name"
          />
          <span class="field-error" role="alert"></span>
        </div>

        <div class="form-group">
          <label for="ticket-${ticketIndex}-last-name" class="form-label">Last Name *</label>
          <input
            type="text"
            id="ticket-${ticketIndex}-last-name"
            name="ticket-${ticketIndex}-last-name"
            class="form-input ticket-last-name"
            data-ticket-index="${ticketIndex}"
            required
            pattern="[a-zA-Z\\s'\\-]{1,50}"
            maxlength="50"
            autocomplete="family-name"
          />
          <span class="field-error" role="alert"></span>
        </div>

        <div class="form-group form-group-full">
          <label for="ticket-${ticketIndex}-email" class="form-label">Email *</label>
          <input
            type="email"
            id="ticket-${ticketIndex}-email"
            name="ticket-${ticketIndex}-email"
            class="form-input ticket-email"
            data-ticket-index="${ticketIndex}"
            required
            autocomplete="email"
          />
          <span class="field-error" role="alert"></span>
        </div>
      </div>
    </fieldset>
  `;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Same info checkbox
  const sameInfoCheckbox = document.getElementById('same-info-checkbox');
  if (sameInfoCheckbox) {
    sameInfoCheckbox.addEventListener('change', handleSameInfoToggle);
  }

  // Customer info inputs
  const customerInputs = document.querySelectorAll('#customer-info-section input');
  customerInputs.forEach(input => {
    input.addEventListener('blur', validateCustomerInfo);
    input.addEventListener('input', handleCustomerInfoInput);
  });

  // Ticket inputs
  const ticketInputs = document.querySelectorAll('.ticket-fieldset input');
  ticketInputs.forEach(input => {
    input.addEventListener('blur', validateTicketField);
    input.addEventListener('input', checkFormValidity);
  });

  // Form submission
  const form = document.getElementById('registration-form');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  // Error dismiss
  const errorDismiss = document.querySelector('.error-dismiss');
  if (errorDismiss) {
    errorDismiss.addEventListener('click', hideError);
  }
}

/**
 * Handle "use same info" checkbox toggle
 */
function handleSameInfoToggle(event) {
  const isChecked = event.target.checked;
  const customerSection = document.getElementById('customer-info-section');
  const ticketFieldsets = document.querySelectorAll('.ticket-fieldset');

  if (isChecked) {
    // Show customer info section
    customerSection.style.display = 'block';

    // Hide all ticket fieldsets except the first
    ticketFieldsets.forEach((fieldset, index) => {
      if (index > 0) {
        fieldset.style.display = 'none';
      }
    });
  } else {
    // Hide customer info section
    customerSection.style.display = 'none';

    // Show all ticket fieldsets
    ticketFieldsets.forEach(fieldset => {
      fieldset.style.display = 'block';
    });

    // Clear customer info fields
    const customerInputs = customerSection.querySelectorAll('input');
    customerInputs.forEach(input => {
      input.value = '';
      clearFieldError(input);
    });
  }

  checkFormValidity();
}

/**
 * Handle customer info input (auto-fill tickets)
 */
function handleCustomerInfoInput() {
  const sameInfoCheckbox = document.getElementById('same-info-checkbox');
  if (!sameInfoCheckbox || !sameInfoCheckbox.checked) return;

  const firstName = document.getElementById('customer-first-name')?.value || '';
  const lastName = document.getElementById('customer-last-name')?.value || '';
  const email = document.getElementById('customer-email')?.value || '';

  // Fill all ticket forms with customer info
  const ticketFieldsets = document.querySelectorAll('.ticket-fieldset');
  ticketFieldsets.forEach((fieldset) => {
    const index = fieldset.dataset.ticketIndex;

    const firstNameInput = document.getElementById(`ticket-${index}-first-name`);
    const lastNameInput = document.getElementById(`ticket-${index}-last-name`);
    const emailInput = document.getElementById(`ticket-${index}-email`);

    if (firstNameInput) firstNameInput.value = firstName;
    if (lastNameInput) lastNameInput.value = lastName;
    if (emailInput) emailInput.value = email;
  });

  checkFormValidity();
}

/**
 * Validate customer info fields
 */
function validateCustomerInfo(event) {
  const input = event.target;
  const isValid = validateField(input);

  if (isValid) {
    handleCustomerInfoInput(); // Auto-fill tickets
  }

  checkFormValidity();
}

/**
 * Validate a single ticket field
 */
function validateTicketField(event) {
  validateField(event.target);
  checkFormValidity();
}

/**
 * Validate a field and show/hide error
 */
function validateField(input) {
  if (!input) return false;

  const value = input.value.trim();
  const errorSpan = input.parentElement.querySelector('.field-error');

  // Clear previous error
  clearFieldError(input);

  // Check required
  if (input.hasAttribute('required') && !value) {
    showFieldError(input, 'This field is required');
    return false;
  }

  // Check pattern
  if (input.pattern && value) {
    const pattern = new RegExp(input.pattern);
    if (!pattern.test(value)) {
      if (input.type === 'email') {
        showFieldError(input, 'Please enter a valid email address');
      } else {
        showFieldError(input, 'Please use only letters, spaces, hyphens, and apostrophes');
      }
      return false;
    }
  }

  // Email-specific validation
  if (input.type === 'email' && value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      showFieldError(input, 'Please enter a valid email address');
      return false;
    }
  }

  return true;
}

/**
 * Show field error
 */
function showFieldError(input, message) {
  input.classList.add('error');
  const errorSpan = input.parentElement.querySelector('.field-error');
  if (errorSpan) {
    errorSpan.textContent = message;
    errorSpan.style.display = 'block';
  }
}

/**
 * Clear field error
 */
function clearFieldError(input) {
  input.classList.remove('error');
  const errorSpan = input.parentElement.querySelector('.field-error');
  if (errorSpan) {
    errorSpan.textContent = '';
    errorSpan.style.display = 'none';
  }
}

/**
 * Check overall form validity and enable/disable continue button
 */
function checkFormValidity() {
  const continueButton = document.getElementById('continue-button');
  if (!continueButton) return;

  const sameInfoCheckbox = document.getElementById('same-info-checkbox');
  const usingSameInfo = sameInfoCheckbox && sameInfoCheckbox.checked;

  let allValid = true;

  if (usingSameInfo) {
    // Validate customer info fields
    const customerInputs = document.querySelectorAll('#customer-info-section input[required]');
    customerInputs.forEach(input => {
      if (!input.value.trim() || input.classList.contains('error')) {
        allValid = false;
      }
    });
  } else {
    // Validate all ticket fields
    const ticketInputs = document.querySelectorAll('.ticket-fieldset input[required]');
    ticketInputs.forEach(input => {
      if (!input.value.trim() || input.classList.contains('error')) {
        allValid = false;
      }
    });
  }

  continueButton.disabled = !allValid;
}

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  const continueButton = document.getElementById('continue-button');
  const buttonText = continueButton.querySelector('.button-text');
  const buttonSpinner = continueButton.querySelector('.button-spinner');

  try {
    // Show loading state
    continueButton.disabled = true;
    buttonText.style.display = 'none';
    buttonSpinner.style.display = 'inline-block';
    showLoadingOverlay();

    // Collect registration data
    const data = collectRegistrationData();
    console.log('Registration data collected:', data);

    // Create cart fingerprint for idempotency
    const cartFingerprint = await createCartFingerprint();
    console.log('Cart fingerprint:', cartFingerprint);

    // Call API to create pending transaction
    const response = await fetch('/api/checkout/create-pending-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cartItems: data.cartItems,
        customerInfo: data.customerInfo,
        registrations: data.registrations,
        cartFingerprint
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Pending transaction created:', result);

    // Save to localStorage for payment retry scenarios
    localStorage.setItem('pendingRegistration', JSON.stringify({
      ...data,
      cartFingerprint,
      transactionId: result.transactionId,
      createdAt: Date.now()
    }));

    // Hide loading state
    hideLoadingOverlay();

    // Show payment selector (existing modal)
    showPaymentSelector();

  } catch (error) {
    console.error('Error creating pending transaction:', error);

    // Hide loading state
    hideLoadingOverlay();
    buttonText.style.display = 'inline';
    buttonSpinner.style.display = 'none';
    continueButton.disabled = false;

    // Show error
    showError(
      error.message || 'Failed to process registration. Please try again.',
      null // No retry action - user can try submit again
    );
  }
}

/**
 * Collect registration data from form
 */
function collectRegistrationData() {
  const sameInfoCheckbox = document.getElementById('same-info-checkbox');
  const usingSameInfo = sameInfoCheckbox && sameInfoCheckbox.checked;

  // Customer info
  const customerInfo = {
    email: '',
    name: '',
    phone: ''
  };

  if (usingSameInfo) {
    const firstName = document.getElementById('customer-first-name')?.value.trim() || '';
    const lastName = document.getElementById('customer-last-name')?.value.trim() || '';
    customerInfo.email = document.getElementById('customer-email')?.value.trim() || '';
    customerInfo.name = `${firstName} ${lastName}`.trim();
    customerInfo.phone = document.getElementById('customer-phone')?.value.trim() || '';
  } else {
    // Use first ticket's info as customer info
    const firstTicketEmail = document.querySelector('[data-ticket-index="1"] .ticket-email')?.value.trim() || '';
    const firstTicketFirstName = document.querySelector('[data-ticket-index="1"] .ticket-first-name')?.value.trim() || '';
    const firstTicketLastName = document.querySelector('[data-ticket-index="1"] .ticket-last-name')?.value.trim() || '';

    customerInfo.email = firstTicketEmail;
    customerInfo.name = `${firstTicketFirstName} ${firstTicketLastName}`.trim();
    customerInfo.phone = '';
  }

  // Cart items
  const cartItems = [];
  Object.values(cartState.tickets).forEach(ticket => {
    cartItems.push({
      ticketTypeId: ticket.ticketType,
      quantity: ticket.quantity,
      price_cents: Math.round(ticket.price * 100)
    });
  });

  // Registrations
  const registrations = [];
  const ticketFieldsets = document.querySelectorAll('.ticket-fieldset');

  ticketFieldsets.forEach(fieldset => {
    const index = fieldset.dataset.ticketIndex;
    const ticketType = fieldset.dataset.ticketType;

    const firstName = document.getElementById(`ticket-${index}-first-name`)?.value.trim() || '';
    const lastName = document.getElementById(`ticket-${index}-last-name`)?.value.trim() || '';
    const email = document.getElementById(`ticket-${index}-email`)?.value.trim() || '';

    registrations.push({
      ticketTypeId: ticketType,
      firstName,
      lastName,
      email
    });
  });

  return {
    customerInfo,
    cartItems,
    registrations
  };
}

/**
 * Create cart fingerprint for idempotency
 */
async function createCartFingerprint() {
  const cartData = JSON.stringify({
    tickets: cartState.tickets,
    donations: cartState.donations,
    timestamp: Date.now()
  });

  // Simple hash using Web Crypto API
  if (window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(cartData);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      console.warn('Failed to create crypto hash, using fallback:', error);
    }
  }

  // Fallback: Simple string hash
  let hash = 0;
  for (let i = 0; i < cartData.length; i++) {
    const char = cartData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Show payment selector modal
 */
function showPaymentSelector() {
  // Dispatch event to open payment selector
  document.dispatchEvent(new CustomEvent('checkout:show-payment-selector'));

  // Fallback: Try to open floating cart with payment selector
  if (window.floatingCartAPI && typeof window.floatingCartAPI.open === 'function') {
    window.floatingCartAPI.open();
  }

  console.log('Payment selector opened');
}

/**
 * Show error message
 */
function showError(message, retryCallback = null) {
  const errorBanner = document.getElementById('error-message');
  const errorText = errorBanner?.querySelector('.error-message-text');

  if (errorBanner && errorText) {
    errorText.textContent = message;
    errorBanner.style.display = 'flex';

    // Scroll to error
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // If retry callback provided, add retry button
    if (retryCallback) {
      const errorContent = errorBanner.querySelector('.error-content');
      const existingRetry = errorBanner.querySelector('.error-retry');

      if (existingRetry) {
        existingRetry.remove();
      }

      const retryButton = document.createElement('button');
      retryButton.className = 'error-retry';
      retryButton.textContent = 'Retry';
      retryButton.addEventListener('click', retryCallback);
      errorContent.appendChild(retryButton);
    }
  }

  // Also show error notification
  errorNotifier.show(message, {
    type: 'system',
    duration: 5000,
    dismissible: true
  });
}

/**
 * Hide error message
 */
function hideError() {
  const errorBanner = document.getElementById('error-message');
  if (errorBanner) {
    errorBanner.style.display = 'none';
  }
}

/**
 * Show loading overlay
 */
function showLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

/**
 * Hide loading overlay
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}
