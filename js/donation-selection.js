/**
 * Donation Selection and Dynamic Total
 * Handles donation amount selection with card-based interface
 */

import { getStripePaymentHandler } from './lib/stripe-integration.js';

class DonationSelection {
  constructor() {
    this.selectedAmount = null;
    this.customAmount = null;
    this.stripeHandler = null;
    this.paymentModal = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.updateDisplay();
  }

  bindEvents() {
    // Donation card click events and keyboard accessibility
    document.querySelectorAll(".donation-card").forEach((card) => {
      // Make cards keyboard accessible
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-pressed", "false");

      // Click events
      card.addEventListener("click", (e) => {
        this.handleDonationCardClick(e);
      });

      // Keyboard events for accessibility
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.handleDonationCardClick(e);
        }
      });
    });

    // Custom amount input (in-card)
    document.addEventListener("input", (e) => {
      if (e.target.classList.contains("custom-amount-input")) {
        this.handleCustomAmountChange(e);
      }
    });

    // Donate button
    const donateBtn = document.getElementById("donate-button");
    if (donateBtn) {
      donateBtn.addEventListener("click", () => this.handleDonate());
    }

    // Listen for checkout event from floating cart (for donations)
    document.addEventListener('cart:checkout', (event) => {
      // Check if cart contains donation
      const cartState = window.cartDebug?.getState() || {};
      if (cartState.donation && cartState.donation.amount > 0) {
        // Prevent the default redirect behavior
        event.preventDefault();
        this.handleDonationCheckout();
      }
    });
  }

  handleDonationCardClick(event) {
    // Don't handle clicks on the input field itself
    if (event.target.classList.contains("custom-amount-input")) {
      return;
    }

    const card = event.currentTarget;
    const amount = card.dataset.amount;
    const isCurrentlySelected = card.classList.contains("selected");

    // Clear all selections and reset custom input
    document.querySelectorAll(".donation-card").forEach((c) => {
      c.classList.remove("selected");
      c.setAttribute("aria-pressed", "false");
      const donationAmount = c.querySelector(".donation-amount");
      if (c.dataset.amount === "custom" && donationAmount) {
        donationAmount.innerHTML = "CUSTOM";
      }
    });

    // If the clicked card was already selected, unselect it (toggle behavior)
    if (isCurrentlySelected) {
      this.selectedAmount = null;
      this.customAmount = null;
    } else {
      // Select clicked card
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");

      if (amount === "custom") {
        this.selectedAmount = "custom";
        const donationAmount = card.querySelector(".donation-amount");
        if (donationAmount) {
          donationAmount.innerHTML =
            '<span class="custom-amount-wrapper"><span class="dollar-sign">$</span><input type="number" class="custom-amount-input" min="1" step="1"></span>';
          const input = donationAmount.querySelector(".custom-amount-input");
          if (input) {
            input.focus();
            input.select();
          }
        }
      } else {
        this.selectedAmount = parseInt(amount);
        this.customAmount = null;
      }
    }

    this.updateDisplay();
  }

  handleCustomAmountChange(event) {
    const value = parseFloat(event.target.value) || 0;
    this.customAmount = value > 0 ? value : null;

    // If value is 0 or empty, switch back to CUSTOM
    const customInput = event.target;
    const card = customInput.closest(".donation-card");
    const donationAmount = card.querySelector(".donation-amount");

    if (value === 0 || !event.target.value) {
      donationAmount.innerHTML = "CUSTOM";
      card.classList.remove("selected");
      card.setAttribute("aria-pressed", "false");
      this.selectedAmount = null;
      this.customAmount = null;
    }

    this.updateDisplay();
  }

  updateDisplay() {
    const donateBtn = document.getElementById("donate-button");

    let displayAmount = 0;

    if (this.selectedAmount === "custom") {
      displayAmount = this.customAmount || 0;
    } else if (this.selectedAmount) {
      displayAmount = this.selectedAmount;
    }

    if (donateBtn) {
      donateBtn.disabled = displayAmount === 0;
      donateBtn.textContent =
        displayAmount > 0 ? `ADD TO CART - $${displayAmount}` : "ADD TO CART";
    }
  }

  handleDonate() {
    const amount =
      this.selectedAmount === "custom"
        ? this.customAmount
        : this.selectedAmount;

    if (!amount || amount <= 0) {
      this.showMessage("Please select or enter a donation amount.", "error");
      return;
    }

    // Add donation to cart
    document.dispatchEvent(
      new CustomEvent("donation-amount-changed", {
        detail: { amount: amount },
      }),
    );

    // Show celebratory animation
    this.showCelebratoryAnimation(amount);

    // Reset the form
    this.selectedAmount = null;
    this.customAmount = null;
    document.querySelectorAll(".donation-card").forEach((c) => {
      c.classList.remove("selected");
      c.setAttribute("aria-pressed", "false");
      const donationAmount = c.querySelector(".donation-amount");
      if (c.dataset.amount === "custom" && donationAmount) {
        donationAmount.innerHTML = "CUSTOM";
      }
    });
    this.updateDisplay();
  }

  showCelebratoryAnimation(amount) {
    // Add celebration animation to the donate button
    const donateBtn = document.getElementById("donate-button");
    if (donateBtn) {
      donateBtn.classList.add("donation-celebration");
      setTimeout(() => donateBtn.classList.remove("donation-celebration"), 600);
    }

    // Create confetti celebration
    this.createConfetti();

    // Create celebration message
    const celebrationMessage = document.createElement("div");
    celebrationMessage.className = "celebration-message";
    celebrationMessage.innerHTML = `
      🎉 Thank You!<br>
      $${amount} added to cart
    `;

    document.body.appendChild(celebrationMessage);

    // Remove after animation completes
    setTimeout(() => {
      if (celebrationMessage.parentNode) {
        celebrationMessage.parentNode.removeChild(celebrationMessage);
      }
    }, 2000);
  }

  createConfetti() {
    const colors = [
      "#FF0080", // Hot pink
      "#00FF00", // Lime green
      "#FF4500", // Orange red
      "#FFD700", // Gold
      "#00CED1", // Dark turquoise
      "#FF1493", // Deep pink
      "#0000FF", // Pure blue
      "#FF00FF", // Magenta
    ];
    const confettiCount = 150; // Much more dense

    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti-piece";
      confetti.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = Math.random() * 120 + "vw"; // Spread wider than screen
      confetti.style.animationDelay = Math.random() * 2 + "s"; // Staggered for performance
      confetti.style.animationDuration = Math.random() * 2 + 3 + "s"; // Longer duration

      document.body.appendChild(confetti);

      // Remove confetti piece after animation
      setTimeout(() => {
        if (confetti.parentNode) {
          confetti.parentNode.removeChild(confetti);
        }
      }, 6000);
    }
  }

  showMessage(message, type = "info") {
    // Simple message display without blocking alert
    const messageDiv = document.createElement("div");
    messageDiv.className = `donation-message ${type}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => messageDiv.classList.add("show"), 10);
    setTimeout(() => {
      messageDiv.classList.add("fade-out");
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.parentNode.removeChild(messageDiv);
        }
      }, 300);
    }, 3000);
  }

  async handleDonationCheckout() {
    // Get cart state from cart manager
    const cartState = window.cartDebug?.getState() || {};
    const donation = cartState.donation || {};
    
    if (!donation.amount || donation.amount <= 0) {
      return;
    }

    // Build order data for donation
    const orderData = {
      amount: donation.amount,
      orderType: 'donation',
      orderDetails: {
        donationType: 'one-time',
        amount: donation.amount,
        purpose: 'A Lo Cubano Boulder Fest Support'
      }
    };

    // Show payment form modal
    await this.showPaymentModal(orderData);
  }

  async showPaymentModal(orderData) {
    // Create payment modal HTML
    const modalHTML = `
      <div id="payment-modal" class="payment-modal">
        <div class="payment-content">
          <h2>Complete Your Donation</h2>
          <div class="order-summary">
            <h3>Donation Summary</h3>
            <p>Thank you for supporting A Lo Cubano Boulder Fest!</p>
            <p style="font-weight: bold; margin-top: 1rem;">
              Donation Amount: $${orderData.amount.toFixed(2)}
            </p>
          </div>
          
          <form id="payment-form">
            <div class="customer-info">
              <input type="text" id="firstName" placeholder="First Name" required>
              <input type="text" id="lastName" placeholder="Last Name" required>
              <input type="email" id="email" placeholder="Email" required>
              <input type="tel" id="phone" placeholder="Phone (optional)">
            </div>
            
            <div id="card-element">
              <!-- Stripe card element will be mounted here -->
            </div>
            <div id="card-errors" role="alert"></div>
            
            <div class="payment-buttons">
              <button type="button" id="cancel-payment">Cancel</button>
              <button type="submit" id="submit-payment">Donate $${orderData.amount.toFixed(2)}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.paymentModal = document.getElementById('payment-modal');
    
    // Initialize Stripe handler if not already done
    if (!this.stripeHandler) {
      this.stripeHandler = getStripePaymentHandler();
    }
    
    // Mount Stripe card element
    await this.stripeHandler.mountCardElement('card-element');
    
    // Handle form submission
    document.getElementById('payment-form').addEventListener('submit', (e) => {
      this.handlePaymentSubmit(e, orderData);
    });
    
    // Handle cancel
    document.getElementById('cancel-payment').addEventListener('click', () => {
      this.closePaymentModal();
    });

    // Close modal on escape key
    document.addEventListener('keydown', this.handleEscapeKey = (e) => {
      if (e.key === 'Escape') {
        this.closePaymentModal();
      }
    });
  }

  async handlePaymentSubmit(event, orderData) {
    event.preventDefault();
    
    const errorElement = document.getElementById('card-errors');
    
    // Get customer info
    const customerInfo = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim()
    };
    
    // Validate customer info
    const validation = this.stripeHandler.validateCustomerInfo(customerInfo);
    if (!validation.isValid) {
      errorElement.textContent = Object.values(validation.errors)[0];
      errorElement.style.display = 'block';
      return;
    }
    
    // Process payment
    const result = await this.stripeHandler.processPayment(orderData, customerInfo);
    
    if (result.success) {
      this.showSuccessMessage(result.orderId);
      this.clearDonationFromCart();
      this.closePaymentModal();
    } else {
      errorElement.textContent = result.error;
      errorElement.style.display = 'block';
    }
  }

  closePaymentModal() {
    if (this.paymentModal) {
      this.paymentModal.remove();
      this.paymentModal = null;
    }
    
    // Remove escape key listener
    if (this.handleEscapeKey) {
      document.removeEventListener('keydown', this.handleEscapeKey);
      this.handleEscapeKey = null;
    }

    // Destroy Stripe elements to clean up
    if (this.stripeHandler) {
      this.stripeHandler.clearCard();
    }
  }

  showSuccessMessage(orderId) {
    const successHTML = `
      <div class="payment-modal">
        <div class="payment-content payment-success">
          <div class="success-icon"></div>
          <h3>Thank You for Your Donation!</h3>
          <p>Your support means the world to us. You will receive a confirmation email shortly.</p>
          <p style="color: #999; font-size: 0.9rem;">Order ID: ${orderId}</p>
          <button onclick="window.location.reload()" style="background: #333; color: white; padding: 0.875rem 2rem; border: none; border-radius: 6px; cursor: pointer;">
            Continue
          </button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', successHTML);
    
    // Auto-close after 5 seconds
    setTimeout(() => {
      document.querySelector('.payment-success').closest('.payment-modal').remove();
    }, 5000);
  }

  clearDonationFromCart() {
    // Clear donation from cart through event
    document.dispatchEvent(new CustomEvent('donation-amount-changed', {
      detail: { amount: 0 }
    }));
    
    // Update display
    this.updateDisplay();
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".donation-selection")) {
    new DonationSelection();
  }
});
