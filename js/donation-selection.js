/**
 * Donation Selection and Dynamic Total
 * Handles donation amount selection with card-based interface
 */

class DonationSelection {
    constructor() {
        this.selectedAmount = null;
        this.customAmount = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateDisplay();
    }

    bindEvents() {
    // Donation card click events and keyboard accessibility
        document.querySelectorAll('.donation-card').forEach((card) => {
            // Make cards keyboard accessible
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            card.setAttribute('aria-pressed', 'false');

            // Click events
            card.addEventListener('click', (e) => {
                this.handleDonationCardClick(e);
            });

            // Keyboard events for accessibility
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.handleDonationCardClick(e);
                }
            });
        });

        // Custom amount input (in-card)
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('custom-amount-input')) {
                this.handleCustomAmountChange(e);
            }
        });

        // Donate button
        const donateBtn = document.getElementById('donate-button');
        if (donateBtn) {
            donateBtn.addEventListener('click', () => this.handleDonate());
        }
    }

    handleDonationCardClick(event) {
    // Don't handle clicks on the input field itself
        if (event.target.classList.contains('custom-amount-input')) {
            return;
        }

        const card = event.currentTarget;
        const amount = card.dataset.amount;
        const isCurrentlySelected = card.classList.contains('selected');

        // Clear all selections and reset custom input
        document.querySelectorAll('.donation-card').forEach((c) => {
            c.classList.remove('selected');
            c.setAttribute('aria-pressed', 'false');
            const donationAmount = c.querySelector('.donation-amount');
            if (c.dataset.amount === 'custom' && donationAmount) {
                donationAmount.innerHTML = 'CUSTOM';
            }
        });

        // If the clicked card was already selected, unselect it (toggle behavior)
        if (isCurrentlySelected) {
            this.selectedAmount = null;
            this.customAmount = null;
        } else {
            // Select clicked card
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');

            if (amount === 'custom') {
                this.selectedAmount = 'custom';
                const donationAmount = card.querySelector('.donation-amount');
                if (donationAmount) {
                    donationAmount.innerHTML =
            '<span class="custom-amount-wrapper"><span class="dollar-sign">$</span><input type="number" class="custom-amount-input" min="1" step="1"></span>';
                    const input = donationAmount.querySelector('.custom-amount-input');
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
        const card = customInput.closest('.donation-card');
        const donationAmount = card.querySelector('.donation-amount');

        if (value === 0 || !event.target.value) {
            donationAmount.innerHTML = 'CUSTOM';
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
            this.selectedAmount = null;
            this.customAmount = null;
        }

        this.updateDisplay();
    }

    updateDisplay() {
        const donateBtn = document.getElementById('donate-button');

        let displayAmount = 0;

        if (this.selectedAmount === 'custom') {
            displayAmount = this.customAmount || 0;
        } else if (this.selectedAmount) {
            displayAmount = this.selectedAmount;
        }

        if (donateBtn) {
            donateBtn.disabled = displayAmount === 0;
            donateBtn.textContent =
        displayAmount > 0 ? `ADD TO CART - $${displayAmount}` : 'ADD TO CART';
        }
    }

    handleDonate() {
        const amount =
      this.selectedAmount === 'custom'
          ? this.customAmount
          : this.selectedAmount;

        if (!amount || amount <= 0) {
            this.showMessage('Please select or enter a donation amount.', 'error');
            return;
        }

        // Add donation to cart
        document.dispatchEvent(
            new CustomEvent('donation-amount-changed', {
                detail: { amount: amount, isTest: false }
            })
        );

        // Show celebratory animation
        this.showCelebratoryAnimation(amount);

        // Reset the form
        this.selectedAmount = null;
        this.customAmount = null;
        document.querySelectorAll('.donation-card').forEach((c) => {
            c.classList.remove('selected');
            c.setAttribute('aria-pressed', 'false');
            const donationAmount = c.querySelector('.donation-amount');
            if (c.dataset.amount === 'custom' && donationAmount) {
                donationAmount.innerHTML = 'CUSTOM';
            }
        });
        this.updateDisplay();
    }

    showCelebratoryAnimation(amount) {
    // Add celebration animation to the donate button
        const donateBtn = document.getElementById('donate-button');
        if (donateBtn) {
            donateBtn.classList.add('donation-celebration');
            setTimeout(() => donateBtn.classList.remove('donation-celebration'), 600);
        }

        // Create confetti celebration
        this.createConfetti();

        // Create celebration message
        const celebrationMessage = document.createElement('div');
        celebrationMessage.className = 'celebration-message';
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
            '#FF0080', // Hot pink
            '#00FF00', // Lime green
            '#FF4500', // Orange red
            '#FFD700', // Gold
            '#00CED1', // Dark turquoise
            '#FF1493', // Deep pink
            '#0000FF', // Pure blue
            '#FF00FF' // Magenta
        ];
        const confettiCount = 150; // Much more dense

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            confetti.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = Math.random() * 120 + 'vw'; // Spread wider than screen
            confetti.style.animationDelay = Math.random() * 2 + 's'; // Staggered for performance
            confetti.style.animationDuration = Math.random() * 2 + 3 + 's'; // Longer duration

            document.body.appendChild(confetti);

            // Remove confetti piece after animation
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.parentNode.removeChild(confetti);
                }
            }, 6000);
        }
    }

    showMessage(message, type = 'info') {
    // Simple message display without blocking alert
        const messageDiv = document.createElement('div');
        messageDiv.className = `donation-message ${type}`;
        messageDiv.textContent = message;
        document.body.appendChild(messageDiv);

        setTimeout(() => messageDiv.classList.add('show'), 10);
        setTimeout(() => {
            messageDiv.classList.add('fade-out');
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.donation-selection')) {
        new DonationSelection();
    }
});
