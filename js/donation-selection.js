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

    // Custom amount input
    const customInput = document.getElementById('custom-amount');
    if (customInput) {
      customInput.addEventListener('input', (e) => {
        this.handleCustomAmountChange(e);
      });
    }

    // Donate button
    const donateBtn = document.getElementById('donate-button');
    if (donateBtn) {
      donateBtn.addEventListener('click', () => this.handleDonate());
    }
  }

  handleDonationCardClick(event) {
    const card = event.currentTarget;
    const amount = card.dataset.amount;
    const isCurrentlySelected = card.classList.contains('selected');
    
    // Clear all selections
    document.querySelectorAll('.donation-card').forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-pressed', 'false');
    });
    
    // If the clicked card was already selected, unselect it (toggle behavior)
    if (isCurrentlySelected) {
      this.selectedAmount = null;
      this.customAmount = null;
      this.hideCustomInput();
    } else {
      // Select clicked card
      card.classList.add('selected');
      card.setAttribute('aria-pressed', 'true');
      
      if (amount === 'custom') {
        this.selectedAmount = 'custom';
        this.showCustomInput();
      } else {
        this.selectedAmount = parseInt(amount);
        this.customAmount = null;
        this.hideCustomInput();
      }
    }
    
    this.updateDisplay();
    
    // Emit event for cart system integration
    const finalAmount = this.selectedAmount === 'custom' ? (this.customAmount || 0) : (this.selectedAmount || 0);
    document.dispatchEvent(new CustomEvent('donation-amount-changed', {
      detail: { amount: finalAmount }
    }));
  }

  handleCustomAmountChange(event) {
    const value = parseFloat(event.target.value) || 0;
    this.customAmount = value > 0 ? value : null;
    this.updateDisplay();
    
    // Emit event for cart system integration
    const finalAmount = this.selectedAmount === 'custom' ? (this.customAmount || 0) : (this.selectedAmount || 0);
    document.dispatchEvent(new CustomEvent('donation-amount-changed', {
      detail: { amount: finalAmount }
    }));
  }

  showCustomInput() {
    const customDiv = document.querySelector('.custom-amount');
    if (customDiv) {
      customDiv.style.display = 'block';
      const input = document.getElementById('custom-amount');
      if (input) {
        input.focus();
      }
    }
  }

  hideCustomInput() {
    const customDiv = document.querySelector('.custom-amount');
    if (customDiv) {
      customDiv.style.display = 'none';
      const input = document.getElementById('custom-amount');
      if (input) {
        input.value = '';
      }
    }
  }

  updateDisplay() {
    const totalEl = document.getElementById('donation-total');
    const donateBtn = document.getElementById('donate-button');
    
    let displayAmount = 0;
    
    if (this.selectedAmount === 'custom') {
      displayAmount = this.customAmount || 0;
    } else if (this.selectedAmount) {
      displayAmount = this.selectedAmount;
    }
    
    if (totalEl) {
      totalEl.textContent = displayAmount;
    }
    
    if (donateBtn) {
      donateBtn.disabled = displayAmount === 0;
      donateBtn.textContent = displayAmount > 0 ? `DONATE $${displayAmount}` : 'SELECT AMOUNT';
    }
  }

  handleDonate() {
    const amount = this.selectedAmount === 'custom' ? this.customAmount : this.selectedAmount;
    
    if (!amount || amount <= 0) {
      alert('Please select or enter a donation amount.');
      return;
    }
    
    // Get form data
    const form = document.getElementById('donation-form');
    const formData = new FormData(form);
    
    const firstName = formData.get('first-name') || '';
    const lastName = formData.get('last-name') || '';
    const email = formData.get('email') || '';
    const message = formData.get('message') || '';
    
    // Create email body similar to ticket system
    const emailBody = `Donation Request - A Lo Cubano Boulder Fest

Name: ${firstName} ${lastName}
Email: ${email}
Donation Amount: $${amount}

Message:
${message}

---
Thank you for supporting A Lo Cubano Boulder Fest!
Please reply with payment instructions and confirmation details.
Sent from A Lo Cubano Boulder Fest website`;
    
    // Create mailto URL
    const subject = encodeURIComponent('Donation - A Lo Cubano Boulder Fest');
    const body = encodeURIComponent(emailBody);
    const mailtoUrl = `mailto:alocubanoboulderfest@gmail.com?subject=${subject}&body=${body}`;
    
    // Open email client
    window.location.href = mailtoUrl;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.donation-selection')) {
    new DonationSelection();
  }
});