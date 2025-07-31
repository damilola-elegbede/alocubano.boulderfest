/**
 * Donation Selection with Cart Integration
 * Simplified donation amount selection that integrates with CartManager
 */

class DonationSelection {
    constructor() {
        this.selectedAmount = null;
        this.cartManager = null;
        this.init();
    }

    async init() {
        // Initialize CartManager integration
        this.cartManager = window.CartManager.getInstance();
        await this.cartManager.waitForLoad();
        
        this.bindEvents();
        this.updateAddToCartButton();
    }

    bindEvents() {
        // Donation card click events and keyboard accessibility
        document.querySelectorAll('.donation-card').forEach(card => {
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

        // Custom amount input (inline in the card)
        const customInput = document.querySelector('.custom-amount-input');
        if (customInput) {
            // Handle input events
            customInput.addEventListener('input', (e) => {
                this.handleCustomAmountChange(e);
            });
            
            // Prevent non-numeric input
            customInput.addEventListener('keypress', (e) => {
                // Allow backspace, delete, tab, escape, enter
                if ([8, 9, 27, 13].indexOf(e.keyCode) !== -1 ||
                    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                    (e.keyCode === 65 && e.ctrlKey === true) ||
                    (e.keyCode === 67 && e.ctrlKey === true) ||
                    (e.keyCode === 86 && e.ctrlKey === true) ||
                    (e.keyCode === 88 && e.ctrlKey === true)) {
                    return;
                }
                // Ensure that it is a number and stop the keypress
                if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                    e.preventDefault();
                }
            });
            
            // Handle paste events to ensure only numbers
            customInput.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = (e.clipboardData || window.clipboardData).getData('text');
                const numericValue = pastedData.replace(/[^0-9]/g, '');
                if (numericValue) {
                    customInput.value = numericValue;
                    this.handleCustomAmountChange({ target: customInput });
                }
            });
            
            // Stop propagation to prevent card click when clicking input
            customInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Add to cart button
        const addToCartBtn = document.getElementById('donate-button');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', () => this.addToCart());
        }
    }

    handleDonationCardClick(event) {
        const card = event.currentTarget;
        const amount = card.dataset.amount;
        const isCurrentlySelected = card.classList.contains('selected');

        // Clear all selections
        this.clearAllSelections();

        // If the clicked card was already selected, unselect it (toggle behavior)
        if (isCurrentlySelected) {
            this.selectedAmount = null;
            this.hideCustomInput();
        } else {
            // Select clicked card
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');

            if (amount === 'custom') {
                this.selectCustomCard();
            } else {
                this.selectPresetAmount(parseInt(amount));
            }
        }

        this.updateAddToCartButton();
    }

    selectPresetAmount(amount) {
        this.selectedAmount = amount;
        this.hideCustomInput();
    }

    handleCustomAmountChange(event) {
        const value = parseFloat(event.target.value) || 0;
        this.selectedAmount = value > 0 ? value : null;
        
        // Auto-select the custom card when user types
        const customCard = document.querySelector('.donation-card-custom');
        if (customCard && value > 0) {
            // Clear other selections
            this.clearAllSelections();
            // Select custom card
            customCard.classList.add('selected');
            customCard.setAttribute('aria-pressed', 'true');
        } else if (customCard && value <= 0) {
            // Deselect if no valid value
            customCard.classList.remove('selected');
            customCard.setAttribute('aria-pressed', 'false');
        }
        
        this.updateAddToCartButton();
    }

    selectCustomCard() {
        // Get current value from the inline input
        const customInput = document.querySelector('.custom-amount-input');
        if (customInput) {
            const value = parseFloat(customInput.value) || 0;
            this.selectedAmount = value > 0 ? value : null;
            customInput.focus();
        }
    }

    showCustomInput() {
        // Not needed with inline input - just focus it
        const customInput = document.querySelector('.custom-amount-input');
        if (customInput) {
            customInput.focus();
        }
    }

    hideCustomInput() {
        // Clear the inline input value
        const customInput = document.querySelector('.custom-amount-input');
        if (customInput) {
            customInput.value = '';
        }
    }

    async addToCart() {
        const amount = this.selectedAmount;

        if (!amount || amount <= 0) {
            this.showErrorMessage('Please select or enter a donation amount.');
            return;
        }

        try {
            // Add donation to cart using CartManager
            await this.cartManager.addDonation(
                amount, 
                `Donation $${amount}`, 
                '', 
                'boulder-fest-2026', 
                amount <= 100 ? 'preset' : 'custom'
            );
            
            // Show success message
            this.showSuccessMessage(`Donation of $${amount} added to cart!`);
            
            // Clear selection after successful add
            this.clearAllSelections();
            this.selectedAmount = null;
            this.hideCustomInput();
            this.updateAddToCartButton();
            
        } catch (error) {
            console.error('Failed to add donation to cart:', error);
            this.showErrorMessage('Failed to add donation to cart. Please try again.');
        }
    }

    updateAddToCartButton() {
        const btn = document.getElementById('donate-button');
        
        if (btn) {
            const hasValidAmount = this.selectedAmount && this.selectedAmount > 0;
            
            if (hasValidAmount) {
                // Active state: blue button, enabled, "ADD TO CART"
                btn.disabled = false;
                btn.classList.remove('button-inactive');
                btn.classList.add('button-active');
                btn.textContent = `ADD $${this.selectedAmount} TO CART`;
            } else {
                // Inactive state: black button, disabled, "SELECT AMOUNT"
                btn.disabled = true;
                btn.classList.remove('button-active');
                btn.classList.add('button-inactive');
                btn.textContent = 'SELECT AMOUNT';
            }
        }
    }

    clearAllSelections() {
        document.querySelectorAll('.donation-card').forEach(card => {
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
        });
    }

    showSuccessMessage(message) {
        // Create or update success message element
        let messageEl = document.getElementById('donation-success-message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'donation-success-message';
            messageEl.className = 'donation-message success-message';
            
            // Insert after the add to cart button
            const addToCartBtn = document.getElementById('donate-button');
            if (addToCartBtn && addToCartBtn.parentNode) {
                addToCartBtn.parentNode.insertBefore(messageEl, addToCartBtn.nextSibling);
            }
        }
        
        messageEl.textContent = message;
        messageEl.style.display = 'block';
        messageEl.style.color = '#28a745';
        messageEl.style.marginTop = '1rem';
        messageEl.style.fontWeight = 'bold';
        
        // Hide message after 3 seconds
        setTimeout(() => {
            if (messageEl) {
                messageEl.style.display = 'none';
            }
        }, 3000);
    }

    showErrorMessage(message) {
        // Create or update error message element
        let messageEl = document.getElementById('donation-error-message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'donation-error-message';
            messageEl.className = 'donation-message error-message';
            
            // Insert after the add to cart button
            const addToCartBtn = document.getElementById('donate-button');
            if (addToCartBtn && addToCartBtn.parentNode) {
                addToCartBtn.parentNode.insertBefore(messageEl, addToCartBtn.nextSibling);
            }
        }
        
        messageEl.textContent = message;
        messageEl.style.display = 'block';
        messageEl.style.color = '#dc3545';
        messageEl.style.marginTop = '1rem';
        messageEl.style.fontWeight = 'bold';
        
        // Hide message after 5 seconds
        setTimeout(() => {
            if (messageEl) {
                messageEl.style.display = 'none';
            }
        }, 5000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.donation-selection')) {
        new DonationSelection();
    }
});