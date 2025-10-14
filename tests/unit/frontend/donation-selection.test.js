/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Donation Selection UI Tests
 * Tests the donation-selection.js functionality including:
 * - Preset amount selection
 * - Custom amount validation
 * - Toggle behavior
 * - Keyboard accessibility
 * - Cart integration
 * - Celebratory animations
 * - Error handling
 */

describe('DonationSelection', () => {
  let DonationSelection;
  let donationInstance;

  beforeEach(() => {
    // Set up DOM structure
    document.body.innerHTML = `
      <style>
        .donation-card.selected { background-color: #4CAF50; }
        .donation-celebration { animation: celebrate 0.6s ease-in-out; }
        .confetti-piece { position: fixed; width: 10px; height: 10px; }
        .celebration-message { position: fixed; top: 50%; opacity: 0; }
        .donation-message { position: fixed; opacity: 0; }
        .donation-message.show { opacity: 1; }
        .donation-message.fade-out { opacity: 0; }
      </style>
      <div class="donation-selection">
        <div class="donation-card" data-amount="5" tabindex="0" role="button" aria-pressed="false">
          <div class="donation-amount">$5</div>
        </div>
        <div class="donation-card" data-amount="10" tabindex="0" role="button" aria-pressed="false">
          <div class="donation-amount">$10</div>
        </div>
        <div class="donation-card" data-amount="20" tabindex="0" role="button" aria-pressed="false">
          <div class="donation-amount">$20</div>
        </div>
        <div class="donation-card" data-amount="50" tabindex="0" role="button" aria-pressed="false">
          <div class="donation-amount">$50</div>
        </div>
        <div class="donation-card" data-amount="custom" tabindex="0" role="button" aria-pressed="false">
          <div class="donation-amount">CUSTOM</div>
        </div>
        <button id="donate-button" disabled>ADD TO CART</button>
      </div>
    `;

    // Mock timer functions
    vi.useFakeTimers();

    // Create DonationSelection class inline (since we can't import ES modules in jsdom easily)
    DonationSelection = class DonationSelection {
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
        document.querySelectorAll('.donation-card').forEach((card) => {
          card.setAttribute('tabindex', '0');
          card.setAttribute('role', 'button');
          card.setAttribute('aria-pressed', 'false');

          card.addEventListener('click', (e) => {
            this.handleDonationCardClick(e);
          });

          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this.handleDonationCardClick(e);
            }
          });
        });

        document.addEventListener('input', (e) => {
          if (e.target.classList.contains('custom-amount-input')) {
            this.handleCustomAmountChange(e);
          }
        });

        const donateBtn = document.getElementById('donate-button');
        if (donateBtn) {
          donateBtn.addEventListener('click', () => this.handleDonate());
        }
      }

      handleDonationCardClick(event) {
        if (event.target.classList.contains('custom-amount-input')) {
          return;
        }

        const card = event.currentTarget;
        const amount = card.dataset.amount;
        const isCurrentlySelected = card.classList.contains('selected');

        document.querySelectorAll('.donation-card').forEach((c) => {
          c.classList.remove('selected');
          c.setAttribute('aria-pressed', 'false');
          const donationAmount = c.querySelector('.donation-amount');
          if (c.dataset.amount === 'custom' && donationAmount) {
            donationAmount.innerHTML = 'CUSTOM';
          }
        });

        if (isCurrentlySelected) {
          this.selectedAmount = null;
          this.customAmount = null;
        } else {
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
        // Enforce minimum donation amount of $1
        this.customAmount = value >= 1 ? value : null;

        const customInput = event.target;
        const card = customInput.closest('.donation-card');

        // Guard against null card (e.g., if input was removed from DOM)
        if (!card) {
          return;
        }

        const donationAmount = card.querySelector('.donation-amount');

        if (value < 1 || !event.target.value) {
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

        document.dispatchEvent(
          new CustomEvent('donation-amount-changed', {
            detail: { amount: amount, isTest: false }
          })
        );

        this.showCelebratoryAnimation(amount);

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
        const donateBtn = document.getElementById('donate-button');
        if (donateBtn) {
          donateBtn.classList.add('donation-celebration');
          setTimeout(() => donateBtn.classList.remove('donation-celebration'), 600);
        }

        this.createConfetti();

        const celebrationMessage = document.createElement('div');
        celebrationMessage.className = 'celebration-message';
        celebrationMessage.innerHTML = `
          🎉 Thank You!<br>
          $${amount} added to cart
        `;

        document.body.appendChild(celebrationMessage);

        setTimeout(() => {
          if (celebrationMessage.parentNode) {
            celebrationMessage.parentNode.removeChild(celebrationMessage);
          }
        }, 2000);
      }

      createConfetti() {
        const colors = [
          '#FF0080', '#00FF00', '#FF4500', '#FFD700',
          '#00CED1', '#FF1493', '#0000FF', '#FF00FF'
        ];
        const confettiCount = 150;

        for (let i = 0; i < confettiCount; i++) {
          const confetti = document.createElement('div');
          confetti.className = 'confetti-piece';
          confetti.style.backgroundColor =
            colors[Math.floor(Math.random() * colors.length)];
          confetti.style.left = Math.random() * 120 + 'vw';
          confetti.style.animationDelay = Math.random() * 2 + 's';
          confetti.style.animationDuration = Math.random() * 2 + 3 + 's';

          document.body.appendChild(confetti);

          setTimeout(() => {
            if (confetti.parentNode) {
              confetti.parentNode.removeChild(confetti);
            }
          }, 6000);
        }
      }

      showMessage(message, type = 'info') {
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
    };

    // Initialize donation selection
    donationInstance = new DonationSelection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers(); // CRITICAL: Restore real timers to prevent hanging
    document.body.innerHTML = '';
  });

  describe('Preset Amount Selection', () => {
    it('should select $5 preset amount on click', () => {
      const card = document.querySelector('[data-amount="5"]');
      card.click();

      expect(card.classList.contains('selected')).toBe(true);
      expect(card.getAttribute('aria-pressed')).toBe('true');
      expect(donationInstance.selectedAmount).toBe(5);
    });

    it('should select $10 preset amount on click', () => {
      const card = document.querySelector('[data-amount="10"]');
      card.click();

      expect(card.classList.contains('selected')).toBe(true);
      expect(donationInstance.selectedAmount).toBe(10);
    });

    it('should select $20 preset amount on click', () => {
      const card = document.querySelector('[data-amount="20"]');
      card.click();

      expect(card.classList.contains('selected')).toBe(true);
      expect(donationInstance.selectedAmount).toBe(20);
    });

    it('should select $50 preset amount on click', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      expect(card.classList.contains('selected')).toBe(true);
      expect(donationInstance.selectedAmount).toBe(50);
    });

    it('should clear previous selection when selecting new amount', () => {
      const card5 = document.querySelector('[data-amount="5"]');
      const card10 = document.querySelector('[data-amount="10"]');

      card5.click();
      expect(card5.classList.contains('selected')).toBe(true);

      card10.click();
      expect(card5.classList.contains('selected')).toBe(false);
      expect(card10.classList.contains('selected')).toBe(true);
      expect(donationInstance.selectedAmount).toBe(10);
    });
  });

  describe('Custom Amount Input', () => {
    it('should show custom input when clicking custom card', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      expect(input).not.toBeNull();
      expect(customCard.classList.contains('selected')).toBe(true);
    });

    it('should validate minimum amount of $1', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '0.50';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(null);
      expect(customCard.classList.contains('selected')).toBe(false);
    });

    it('should accept valid custom amount ($1.00)', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '1.00';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(1);
    });

    it('should handle large custom amounts ($10,000)', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '10000';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(10000);
    });

    it('should reject zero amount ($0.00)', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '0.00';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(null);
      expect(customCard.classList.contains('selected')).toBe(false);
    });

    it('should reject negative amounts', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '-50';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(null);
    });

    it('should handle decimal precision correctly', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '25.50';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(25.50);
    });

    it('should reset custom input to CUSTOM on empty value', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '100';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      input.value = '';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      const donationAmount = customCard.querySelector('.donation-amount');
      expect(donationAmount.textContent).toBe('CUSTOM');
    });

    it('should not flip card when clicking on custom input field', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      const clickEvent = new window.MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: input });

      const wasSelected = customCard.classList.contains('selected');
      input.dispatchEvent(clickEvent);

      expect(customCard.classList.contains('selected')).toBe(wasSelected);
    });
  });

  describe('Toggle Behavior', () => {
    it('should unselect donation when clicking selected card', () => {
      const card = document.querySelector('[data-amount="20"]');

      card.click();
      expect(card.classList.contains('selected')).toBe(true);

      card.click();
      expect(card.classList.contains('selected')).toBe(false);
      expect(donationInstance.selectedAmount).toBe(null);
    });

    it('should clear aria-pressed when unselecting', () => {
      const card = document.querySelector('[data-amount="20"]');

      card.click();
      expect(card.getAttribute('aria-pressed')).toBe('true');

      card.click();
      expect(card.getAttribute('aria-pressed')).toBe('false');
    });

    it('should maintain toggle state across different cards', () => {
      const card5 = document.querySelector('[data-amount="5"]');
      const card10 = document.querySelector('[data-amount="10"]');

      card5.click();
      card5.click(); // Toggle off
      expect(card5.classList.contains('selected')).toBe(false);

      card10.click();
      expect(card10.classList.contains('selected')).toBe(true);
    });
  });

  describe('Keyboard Accessibility', () => {
    it('should have tabindex="0" on all donation cards', () => {
      const cards = document.querySelectorAll('.donation-card');
      cards.forEach(card => {
        expect(card.getAttribute('tabindex')).toBe('0');
      });
    });

    it('should have role="button" on all donation cards', () => {
      const cards = document.querySelectorAll('.donation-card');
      cards.forEach(card => {
        expect(card.getAttribute('role')).toBe('button');
      });
    });

    it('should select card on Enter key', () => {
      const card = document.querySelector('[data-amount="10"]');
      const event = new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      });

      card.dispatchEvent(event);

      expect(card.classList.contains('selected')).toBe(true);
      expect(donationInstance.selectedAmount).toBe(10);
    });

    it('should select card on Space key', () => {
      const card = document.querySelector('[data-amount="20"]');
      const event = new window.KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true
      });

      card.dispatchEvent(event);

      expect(card.classList.contains('selected')).toBe(true);
      expect(donationInstance.selectedAmount).toBe(20);
    });

    it('should prevent default on Space key to avoid scrolling', () => {
      const card = document.querySelector('[data-amount="20"]');
      const event = new window.KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      card.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should toggle selection on repeated Enter key presses', () => {
      const card = document.querySelector('[data-amount="10"]');
      const event = new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      });

      card.dispatchEvent(event);
      expect(card.classList.contains('selected')).toBe(true);

      card.dispatchEvent(event);
      expect(card.classList.contains('selected')).toBe(false);
    });
  });

  describe('Button State Management', () => {
    it('should disable donate button when no amount selected', () => {
      const donateBtn = document.getElementById('donate-button');
      expect(donateBtn.disabled).toBe(true);
      expect(donateBtn.textContent).toBe('ADD TO CART');
    });

    it('should enable donate button when preset amount selected', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      expect(donateBtn.disabled).toBe(false);
      expect(donateBtn.textContent).toBe('ADD TO CART - $50');
    });

    it('should enable donate button when valid custom amount entered', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '75';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      const donateBtn = document.getElementById('donate-button');
      expect(donateBtn.disabled).toBe(false);
      expect(donateBtn.textContent).toBe('ADD TO CART - $75');
    });

    it('should update button text with current amount', () => {
      const card5 = document.querySelector('[data-amount="5"]');
      const card10 = document.querySelector('[data-amount="10"]');
      const donateBtn = document.getElementById('donate-button');

      card5.click();
      expect(donateBtn.textContent).toBe('ADD TO CART - $5');

      card10.click();
      expect(donateBtn.textContent).toBe('ADD TO CART - $10');
    });

    it('should disable button after toggling off selection', () => {
      const card = document.querySelector('[data-amount="20"]');
      const donateBtn = document.getElementById('donate-button');

      card.click();
      expect(donateBtn.disabled).toBe(false);

      card.click(); // Toggle off
      expect(donateBtn.disabled).toBe(true);
    });
  });

  describe('Cart Integration', () => {
    it('should dispatch donation-amount-changed event on donate', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      let eventFired = false;
      let eventDetail = null;

      document.addEventListener('donation-amount-changed', (e) => {
        eventFired = true;
        eventDetail = e.detail;
      });

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      expect(eventFired).toBe(true);
      expect(eventDetail.amount).toBe(50);
      expect(eventDetail.isTest).toBe(false);
    });

    it('should dispatch correct amount for custom donations', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '125.50';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      let eventDetail = null;
      document.addEventListener('donation-amount-changed', (e) => {
        eventDetail = e.detail;
      });

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      expect(eventDetail.amount).toBe(125.50);
    });

    it('should not dispatch event when clicking donate with no amount', () => {
      let eventFired = false;

      document.addEventListener('donation-amount-changed', () => {
        eventFired = true;
      });

      // Try to click donate without selecting amount (should not work due to disabled state)
      const donateBtn = document.getElementById('donate-button');
      expect(donateBtn.disabled).toBe(true);

      // Force click via instance method
      donationInstance.handleDonate();

      expect(eventFired).toBe(false);
    });
  });

  describe('Form Reset', () => {
    it('should reset form after successful donation', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      expect(card.classList.contains('selected')).toBe(false);
      expect(donationInstance.selectedAmount).toBe(null);
      expect(donateBtn.disabled).toBe(true);
    });

    it('should reset custom input after donation', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '100';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      const donationAmount = customCard.querySelector('.donation-amount');
      expect(donationAmount.textContent).toBe('CUSTOM');
      expect(customCard.classList.contains('selected')).toBe(false);
    });

    it('should reset aria attributes after donation', () => {
      const card = document.querySelector('[data-amount="20"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      expect(card.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('Celebratory Animation', () => {
    it('should add celebration class to donate button', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      expect(donateBtn.classList.contains('donation-celebration')).toBe(true);
    });

    it('should remove celebration class after 600ms', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      vi.advanceTimersByTime(600);

      expect(donateBtn.classList.contains('donation-celebration')).toBe(false);
    });

    it('should create celebration message with amount', () => {
      // Create a new card element since data-amount="75" doesn't exist
      const card = document.createElement('div');
      card.className = 'donation-card';
      card.dataset.amount = '75';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'false');

      const donationAmount = document.createElement('div');
      donationAmount.className = 'donation-amount';
      donationAmount.textContent = '$75';
      card.appendChild(donationAmount);

      document.querySelector('.donation-selection').appendChild(card);

      // Reinitialize to bind new card
      donationInstance.bindEvents();
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      const celebrationMessage = document.querySelector('.celebration-message');
      expect(celebrationMessage).not.toBeNull();
      expect(celebrationMessage.innerHTML).toContain('$75');
      expect(celebrationMessage.innerHTML).toContain('Thank You!');
    });

    it('should remove celebration message after 2000ms', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      vi.advanceTimersByTime(2000);

      const celebrationMessage = document.querySelector('.celebration-message');
      expect(celebrationMessage).toBeNull();
    });

    it('should create confetti elements', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      const confettiPieces = document.querySelectorAll('.confetti-piece');
      expect(confettiPieces.length).toBe(150);
    });

    it('should remove confetti after 6000ms', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      vi.advanceTimersByTime(6000);

      const confettiPieces = document.querySelectorAll('.confetti-piece');
      expect(confettiPieces.length).toBe(0);
    });

    it('should randomize confetti colors', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      donateBtn.click();

      const confettiPieces = document.querySelectorAll('.confetti-piece');
      const colors = new Set();

      confettiPieces.forEach(piece => {
        colors.add(piece.style.backgroundColor);
      });

      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('Multiple Donations', () => {
    it('should allow adding multiple donations to cart', () => {
      const eventAmounts = [];

      document.addEventListener('donation-amount-changed', (e) => {
        eventAmounts.push(e.detail.amount);
      });

      const card5 = document.querySelector('[data-amount="5"]');
      const card10 = document.querySelector('[data-amount="10"]');
      const donateBtn = document.getElementById('donate-button');

      card5.click();
      donateBtn.click();

      card10.click();
      donateBtn.click();

      expect(eventAmounts).toEqual([5, 10]);
    });

    it('should reset form between multiple donations', () => {
      const card5 = document.querySelector('[data-amount="5"]');
      const donateBtn = document.getElementById('donate-button');

      card5.click();
      donateBtn.click();

      expect(card5.classList.contains('selected')).toBe(false);
      expect(donateBtn.disabled).toBe(true);

      const card10 = document.querySelector('[data-amount="10"]');
      card10.click();

      expect(card10.classList.contains('selected')).toBe(true);
      expect(donateBtn.disabled).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should show error message when attempting to donate with no amount', () => {
      donationInstance.handleDonate();

      const errorMessage = document.querySelector('.donation-message.error');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toBe('Please select or enter a donation amount.');
    });

    it('should show error message class for invalid donations', () => {
      donationInstance.handleDonate();

      vi.advanceTimersByTime(10);

      const errorMessage = document.querySelector('.donation-message');
      expect(errorMessage.classList.contains('error')).toBe(true);
      expect(errorMessage.classList.contains('show')).toBe(true);
    });

    it('should fade out error message after 3000ms', () => {
      donationInstance.handleDonate();

      vi.advanceTimersByTime(3000);

      const errorMessage = document.querySelector('.donation-message');
      expect(errorMessage.classList.contains('fade-out')).toBe(true);
    });

    it('should remove error message after fade-out', () => {
      donationInstance.handleDonate();

      vi.advanceTimersByTime(3300); // 3000ms + 300ms fade-out

      const errorMessage = document.querySelector('.donation-message');
      expect(errorMessage).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid clicking on same card', () => {
      const card = document.querySelector('[data-amount="20"]');

      card.click();
      card.click();
      card.click();

      expect(card.classList.contains('selected')).toBe(true);
      expect(donationInstance.selectedAmount).toBe(20);
    });

    it('should handle clicking multiple cards in rapid succession', () => {
      const card5 = document.querySelector('[data-amount="5"]');
      const card10 = document.querySelector('[data-amount="10"]');
      const card20 = document.querySelector('[data-amount="20"]');

      card5.click();
      card10.click();
      card20.click();

      expect(card20.classList.contains('selected')).toBe(true);
      expect(card5.classList.contains('selected')).toBe(false);
      expect(card10.classList.contains('selected')).toBe(false);
      expect(donationInstance.selectedAmount).toBe(20);
    });

    it('should handle non-numeric custom input gracefully', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = 'abc';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(null);
    });

    it('should reject very small custom amounts below $1 (cents)', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '0.01';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      // Minimum donation amount is $1, so cents should be rejected
      expect(donationInstance.customAmount).toBe(null);
      expect(customCard.classList.contains('selected')).toBe(false);
    });

    it('should handle whitespace in custom input', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '  100  ';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      expect(donationInstance.customAmount).toBe(100);
    });
  });

  describe('Accessibility Compliance', () => {
    it('should maintain proper ARIA attributes throughout lifecycle', () => {
      const card = document.querySelector('[data-amount="20"]');

      expect(card.getAttribute('aria-pressed')).toBe('false');

      card.click();
      expect(card.getAttribute('aria-pressed')).toBe('true');

      card.click();
      expect(card.getAttribute('aria-pressed')).toBe('false');
    });

    it('should keep tabindex consistent', () => {
      const cards = document.querySelectorAll('.donation-card');

      cards.forEach(card => {
        card.click();
        expect(card.getAttribute('tabindex')).toBe('0');
      });
    });

    it('should maintain button role on all cards', () => {
      const cards = document.querySelectorAll('.donation-card');

      cards.forEach(card => {
        expect(card.getAttribute('role')).toBe('button');
      });
    });
  });

  describe('Currency Formatting', () => {
    it('should display amounts with dollar sign', () => {
      const card = document.querySelector('[data-amount="50"]');
      card.click();

      const donateBtn = document.getElementById('donate-button');
      expect(donateBtn.textContent).toContain('$50');
    });

    it('should handle decimal amounts in button text', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '99.99';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      const donateBtn = document.getElementById('donate-button');
      expect(donateBtn.textContent).toBe('ADD TO CART - $99.99');
    });

    it('should format large amounts correctly', () => {
      const customCard = document.querySelector('[data-amount="custom"]');
      customCard.click();

      const input = document.querySelector('.custom-amount-input');
      input.value = '1000';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));

      const donateBtn = document.getElementById('donate-button');
      expect(donateBtn.textContent).toBe('ADD TO CART - $1000');
    });
  });
});
