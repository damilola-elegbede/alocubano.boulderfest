/**
 * Checkout Form Component
 * Creates a customer information form for ticket purchases
 */

export function createCheckoutForm() {
    const formHTML = `
        <div class="checkout-form-container" data-testid="customer-form">
            <form class="checkout-form" id="checkoutForm" data-testid="checkout-form">
                <div class="form-section">
                    <h3>Customer Information</h3>

                    <div class="form-group">
                        <label for="customerName" class="form-label">Full Name *</label>
                        <input
                            type="text"
                            id="customerName"
                            name="customerName"
                            required
                            autocomplete="name"
                            data-testid="customer-name"
                            class="form-input"
                        />
                        <div class="form-error" data-testid="name-error"></div>
                    </div>

                    <div class="form-group">
                        <label for="customerEmail" class="form-label">Email Address *</label>
                        <input
                            type="email"
                            id="customerEmail"
                            name="customerEmail"
                            required
                            autocomplete="email"
                            data-testid="customer-email"
                            class="form-input"
                        />
                        <div class="form-error" data-testid="email-error"></div>
                    </div>

                    <div class="form-group">
                        <label for="customerPhone" class="form-label">Phone Number</label>
                        <input
                            type="tel"
                            id="customerPhone"
                            name="customerPhone"
                            autocomplete="tel"
                            data-testid="customer-phone"
                            class="form-input"
                        />
                        <div class="form-error" data-testid="phone-error"></div>
                    </div>
                </div>

                <div class="form-section">
                    <h3>Order Summary</h3>
                    <div class="order-summary" data-testid="order-summary"></div>
                </div>

                <div class="form-actions">
                    <button
                        type="submit"
                        class="checkout-submit-btn"
                        data-testid="proceed-to-payment"
                    >
                        Proceed to Payment
                    </button>
                    <button
                        type="button"
                        class="checkout-cancel-btn"
                        data-testid="cancel-checkout"
                        onclick="cancelCheckout()"
                    >
                        Cancel
                    </button>
                </div>

                <div class="form-error general-error" data-testid="payment-error" style="display: none;"></div>
            </form>
        </div>
    `;

    return formHTML;
}

export function showCheckoutForm(cartItems) {
    const existingForm = document.querySelector('.checkout-form-container');
    if (existingForm) {
        existingForm.remove();
    }

    const formHTML = createCheckoutForm();
    document.body.insertAdjacentHTML('beforeend', formHTML);

    // Populate order summary
    populateOrderSummary(cartItems);

    // Show form
    const formContainer = document.querySelector('.checkout-form-container');
    formContainer.style.display = 'block';

    // Focus first input
    const firstInput = document.getElementById('customerName');
    if (firstInput) {
        firstInput.focus();
    }

    // Set up form validation
    setupFormValidation();
}

function populateOrderSummary(cartItems) {
    const summaryContainer = document.querySelector(
        '[data-testid="order-summary"]'
    );
    if (!summaryContainer) {
        return;
    }

    let html = '';
    let total = 0;

    Object.values(cartItems).forEach((item) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        html += `
            <div class="order-item">
                <span class="item-name">${escapeHtml(item.name)}</span>
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
}

function setupFormValidation() {
    const form = document.getElementById('checkoutForm');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async(event) => {
        event.preventDefault();

        const isValid = validateForm();
        if (!isValid) {
            return;
        }

        // Proceed with payment processing
        await processPayment(getFormData());
    });

    // Real-time validation
    const inputs = form.querySelectorAll('input[required]');
    inputs.forEach((input) => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => clearFieldError(input));
    });
}

function validateForm() {
    let isValid = true;

    const nameInput = document.getElementById('customerName');
    const emailInput = document.getElementById('customerEmail');

    if (!nameInput.value.trim()) {
        showFieldError(nameInput, 'Name is required');
        isValid = false;
    }

    if (!emailInput.value.trim()) {
        showFieldError(emailInput, 'Email is required');
        isValid = false;
    } else if (!isValidEmail(emailInput.value)) {
        showFieldError(emailInput, 'Please enter a valid email address');
        isValid = false;
    }

    return isValid;
}

function validateField(input) {
    const value = input.value.trim();

    switch (input.id) {
    case 'customerName':
        if (!value) {
            showFieldError(input, 'Name is required');
            return false;
        }
        break;

    case 'customerEmail':
        if (!value) {
            showFieldError(input, 'Email is required');
            return false;
        } else if (!isValidEmail(value)) {
            showFieldError(input, 'Please enter a valid email address');
            return false;
        }
        break;
    }

    clearFieldError(input);
    return true;
}

function showFieldError(input, message) {
    const errorTestId =
    input.getAttribute('data-testid').replace('customer-', '') + '-error';
    const errorElement = document.querySelector(`[data-testid="${errorTestId}"]`);

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }

    input.classList.add('error');
}

function clearFieldError(input) {
    const errorTestId =
    input.getAttribute('data-testid').replace('customer-', '') + '-error';
    const errorElement = document.querySelector(`[data-testid="${errorTestId}"]`);

    if (errorElement) {
        errorElement.style.display = 'none';
    }

    input.classList.remove('error');
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function getFormData() {
    return {
        name: document.getElementById('customerName').value.trim(),
        email: document.getElementById('customerEmail').value.trim(),
        phone: document.getElementById('customerPhone').value.trim()
    };
}

async function processPayment(customerData) {
    const paymentErrorElement = document.querySelector(
        '[data-testid="payment-error"]'
    );

    try {
    // Show loading state
        const submitButton = document.querySelector(
            '[data-testid="proceed-to-payment"]'
        );
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Processing...';
        submitButton.disabled = true;

        // Create checkout session
        const response = await fetch('/api/payments/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customerData,
                cartItems: getCartItems() // This would come from cart manager
            })
        });

        if (!response.ok) {
            throw new Error('Payment processing failed');
        }

        const { url } = await response.json();

        if (url) {
            // Redirect to Stripe checkout
            window.location.href = url;
        } else {
            throw new Error('Invalid payment response');
        }
    } catch (error) {
    // Show error
        paymentErrorElement.textContent =
      error.message || 'Payment processing temporarily unavailable';
        paymentErrorElement.style.display = 'block';

        // Reset submit button
        const submitButton = document.querySelector(
            '[data-testid="proceed-to-payment"]'
        );
        submitButton.textContent = 'Proceed to Payment';
        submitButton.disabled = false;
    }
}

function getCartItems() {
    // This would integrate with the cart manager
    // For now, return empty object
    return {};
}

function cancelCheckout() {
    const formContainer = document.querySelector('.checkout-form-container');
    if (formContainer) {
        formContainer.remove();
    }
}

// Utility function for HTML escaping
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Export for global use
window.showCheckoutForm = showCheckoutForm;
window.cancelCheckout = cancelCheckout;
