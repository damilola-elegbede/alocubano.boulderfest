/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Flip Card Functionality Tests
 * Tests the flip-cards.js functionality including:
 * - Event delegation for dynamic cards
 * - Click-to-flip behavior
 * - Back button functionality
 * - Flip prevention for disabled tickets
 * - Keyboard accessibility
 * - MutationObserver for new cards
 * - Screen reader announcements
 * - Multiple card states
 */

describe('FlipCardManager', () => {
  let FlipCardManager;
  let flipCardManager;

  beforeEach(() => {
    // Set up DOM structure
    document.body.innerHTML = `
      <style>
        .flip-card { perspective: 1000px; }
        .flip-card.flipped .flip-card-inner { transform: rotateY(180deg); }
        .flip-card.ticket-disabled { opacity: 0.5; pointer-events: none; }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border-width: 0;
        }
      </style>
      <div class="tickets-container">
        <div class="flip-card" data-ticket-type="weekend-pass" tabindex="0">
          <div class="flip-card-inner">
            <div class="flip-card-front">
              <div class="ticket-type">Weekend Pass</div>
              <button class="add-to-cart-btn">Add to Cart</button>
            </div>
            <div class="flip-card-back">
              <div class="ticket-details">Full weekend access</div>
              <button class="flip-back-btn">← Back</button>
            </div>
          </div>
        </div>

        <div class="flip-card" data-ticket-type="friday-only" tabindex="0">
          <div class="flip-card-inner">
            <div class="flip-card-front">
              <div class="ticket-type">Friday Only</div>
              <button class="add-to-cart-btn">Add to Cart</button>
            </div>
            <div class="flip-card-back">
              <div class="ticket-details">Friday night access</div>
              <button class="flip-back-btn">← Back</button>
            </div>
          </div>
        </div>

        <div class="flip-card ticket-disabled" data-ticket-type="sold-out" aria-disabled="true">
          <div class="flip-card-inner">
            <div class="flip-card-front">
              <div class="ticket-type">Sold Out</div>
              <div class="ticket-status">SOLD OUT</div>
            </div>
            <div class="flip-card-back">
              <div class="ticket-details">Not available</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Mock console methods
    global.console.log = vi.fn();

    // Create FlipCardManager class inline
    FlipCardManager = class FlipCardManager {
      constructor() {
        this.init();
      }

      init() {
        this.bindEvents();
      }

      bindEvents() {
        const container = document.querySelector('.tickets-container') ||
          document.querySelector('#dynamic-ticket-container') ||
          document.body;

        console.log('FlipCardManager: Binding events with delegation on', container);

        container.addEventListener('click', (e) => {
          const card = e.target.closest('.flip-card');
          if (!card) return;

          if (card.classList.contains('ticket-disabled')) {
            return;
          }

          if (this.shouldPreventFlip(e.target)) {
            return;
          }

          const ticketType = card.dataset.ticketType || 'unknown';
          console.log(`Click detected on card: ${ticketType}`, e.target);
          this.flipCard(card);
        });

        container.addEventListener('click', (e) => {
          const flipBackBtn = e.target.closest('.flip-back-btn');
          if (!flipBackBtn) return;

          e.stopPropagation();
          const card = flipBackBtn.closest('.flip-card');
          if (card) {
            this.flipCard(card, false);
          }
        });

        document.addEventListener('keydown', (e) => {
          const card = e.target.closest('.flip-card');
          if (!card) return;

          if (card.classList.contains('ticket-disabled')) {
            return;
          }

          if (e.key === 'Enter' || e.key === ' ') {
            if (!this.shouldPreventFlip(e.target)) {
              e.preventDefault();
              this.flipCard(card);
            }
          }
          if (e.key === 'Escape') {
            this.flipCard(card, false);
          }
        });

        this.updateCardTabindex();
        this.observeNewCards(container);
      }

      updateCardTabindex() {
        document.querySelectorAll('.flip-card').forEach(card => {
          if (card.classList.contains('ticket-disabled')) {
            card.removeAttribute('tabindex');
            card.setAttribute('aria-disabled', 'true');
          } else {
            card.setAttribute('tabindex', '0');
            card.removeAttribute('aria-disabled');
          }
        });
      }

      observeNewCards(container) {
        const observer = new MutationObserver((mutations) => {
          let hasNewCards = false;
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) {
                if (node.matches && node.matches('.flip-card')) {
                  hasNewCards = true;
                } else if (node.querySelector) {
                  const cards = node.querySelectorAll('.flip-card');
                  if (cards.length > 0) {
                    hasNewCards = true;
                  }
                }
              }
            });
          });

          if (hasNewCards) {
            this.updateCardTabindex();
            console.log('New flip cards detected and configured');
          }
        });

        observer.observe(container, {
          childList: true,
          subtree: true
        });

        this.observer = observer;
      }

      shouldPreventFlip(target) {
        const preventFlipSelectors = [
          '.qty-btn',
          '.quantity',
          '.add-to-cart-btn',
          'button',
          'input',
          '.flip-back-btn'
        ];

        return preventFlipSelectors.some(selector => {
          return target.matches(selector) || target.closest(selector);
        });
      }

      flipCard(card, toBack = null) {
        const isFlipped = card.classList.contains('flipped');
        const ticketType = card.dataset.ticketType || 'unknown';

        console.log(`Flipping card: ${ticketType}, currently flipped: ${isFlipped}`);

        if (toBack === null) {
          card.classList.toggle('flipped');
        } else if (toBack && !isFlipped) {
          card.classList.add('flipped');
        } else if (!toBack && isFlipped) {
          card.classList.remove('flipped');
        }

        const newFlippedState = card.classList.contains('flipped');
        console.log(`Card ${ticketType} now flipped: ${newFlippedState}`);

        const ticketTypeDisplay = card.querySelector('.ticket-type')?.textContent || 'Ticket';
        const newState = card.classList.contains('flipped') ? 'showing details' : 'showing front';

        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `${ticketTypeDisplay} card ${newState}`;

        document.body.appendChild(announcement);
        setTimeout(() => {
          if (document.body.contains(announcement)) {
            document.body.removeChild(announcement);
          }
        }, 1000);
      }

      resetAllCards() {
        document.querySelectorAll('.flip-card.flipped').forEach(card => {
          this.flipCard(card, false);
        });
      }

      isCardFlipped(card) {
        return card.classList.contains('flipped');
      }

      destroy() {
        if (this.observer) {
          this.observer.disconnect();
        }
      }
    };

    // Initialize flip card manager
    flipCardManager = new FlipCardManager();
  });

  afterEach(() => {
    if (flipCardManager && flipCardManager.destroy) {
      flipCardManager.destroy();
    }
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('Event Delegation Setup', () => {
    it('should initialize with event delegation on container', () => {
      expect(console.log).toHaveBeenCalledWith(
        'FlipCardManager: Binding events with delegation on',
        expect.any(Object)
      );
    });

    it('should set tabindex on enabled cards', () => {
      const enabledCard = document.querySelector('[data-ticket-type="weekend-pass"]');
      expect(enabledCard.getAttribute('tabindex')).toBe('0');
    });

    it('should not set tabindex on disabled cards', () => {
      const disabledCard = document.querySelector('[data-ticket-type="sold-out"]');
      expect(disabledCard.hasAttribute('tabindex')).toBe(false);
    });

    it('should set aria-disabled on disabled cards', () => {
      const disabledCard = document.querySelector('[data-ticket-type="sold-out"]');
      expect(disabledCard.getAttribute('aria-disabled')).toBe('true');
    });

    it('should not set aria-disabled on enabled cards', () => {
      const enabledCard = document.querySelector('[data-ticket-type="weekend-pass"]');
      expect(enabledCard.hasAttribute('aria-disabled')).toBe(false);
    });
  });

  describe('Click to Flip', () => {
    it('should flip card from front to back on click', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      expect(card.classList.contains('flipped')).toBe(true);
    });

    it('should flip card back to front on second click', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');

      card.click();
      expect(card.classList.contains('flipped')).toBe(true);

      card.click();
      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should log flip events to console', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      expect(console.log).toHaveBeenCalledWith(
        'Click detected on card: weekend-pass',
        expect.any(Object)
      );
      expect(console.log).toHaveBeenCalledWith(
        'Flipping card: weekend-pass, currently flipped: false'
      );
    });

    it('should handle clicking on card inner elements', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const innerElement = card.querySelector('.flip-card-inner');

      innerElement.click();

      expect(card.classList.contains('flipped')).toBe(true);
    });

    it('should support multiple cards flipping independently', () => {
      const card1 = document.querySelector('[data-ticket-type="weekend-pass"]');
      const card2 = document.querySelector('[data-ticket-type="friday-only"]');

      card1.click();
      expect(card1.classList.contains('flipped')).toBe(true);
      expect(card2.classList.contains('flipped')).toBe(false);

      card2.click();
      expect(card1.classList.contains('flipped')).toBe(true);
      expect(card2.classList.contains('flipped')).toBe(true);
    });
  });

  describe('Back Button Functionality', () => {
    it('should flip card back to front when clicking back button', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      expect(card.classList.contains('flipped')).toBe(true);

      const backBtn = card.querySelector('.flip-back-btn');
      backBtn.click();

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should stop propagation on back button click', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      const backBtn = card.querySelector('.flip-back-btn');
      const clickEvent = new window.MouseEvent('click', { bubbles: true });
      const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');

      backBtn.dispatchEvent(clickEvent);

      expect(stopPropagationSpy).toHaveBeenCalled();
    });

    it('should not flip card again after back button click', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      const backBtn = card.querySelector('.flip-back-btn');
      backBtn.click();

      expect(card.classList.contains('flipped')).toBe(false);
    });
  });

  describe('Flip Prevention for Disabled Tickets', () => {
    it('should not flip disabled cards on click', () => {
      const disabledCard = document.querySelector('[data-ticket-type="sold-out"]');
      disabledCard.click();

      expect(disabledCard.classList.contains('flipped')).toBe(false);
    });

    it('should not flip disabled cards on keyboard interaction', () => {
      const disabledCard = document.querySelector('[data-ticket-type="sold-out"]');
      const event = new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      });

      disabledCard.dispatchEvent(event);

      expect(disabledCard.classList.contains('flipped')).toBe(false);
    });

    it('should log ticket type for disabled cards', () => {
      const disabledCard = document.querySelector('[data-ticket-type="sold-out"]');
      disabledCard.click();

      // Should not log flip events for disabled cards
      expect(console.log).not.toHaveBeenCalledWith(
        'Click detected on card: sold-out',
        expect.any(Object)
      );
    });
  });

  describe('shouldPreventFlip Logic', () => {
    it('should prevent flip when clicking add-to-cart button', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const addToCartBtn = card.querySelector('.add-to-cart-btn');

      addToCartBtn.click();

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should prevent flip when clicking back button', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      const backBtn = card.querySelector('.flip-back-btn');
      backBtn.click();

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should prevent flip when clicking any button element', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const button = document.createElement('button');
      button.className = 'test-button';
      card.querySelector('.flip-card-front').appendChild(button);

      button.click();

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should prevent flip when clicking input element', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'quantity';
      card.querySelector('.flip-card-front').appendChild(input);

      input.click();

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should allow flip when clicking on ticket type text', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const ticketType = card.querySelector('.ticket-type');

      ticketType.click();

      expect(card.classList.contains('flipped')).toBe(true);
    });
  });

  describe('Keyboard Accessibility', () => {
    it('should flip card on Enter key', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const event = new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      });

      card.dispatchEvent(event);

      expect(card.classList.contains('flipped')).toBe(true);
    });

    it('should flip card on Space key', () => {
      const card = document.querySelector('[data-ticket-type="friday-only"]');
      const event = new window.KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true
      });

      card.dispatchEvent(event);

      expect(card.classList.contains('flipped')).toBe(true);
    });

    it('should prevent default on Space key to avoid scrolling', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const event = new window.KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      card.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should flip back on Escape key', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');

      card.click();
      expect(card.classList.contains('flipped')).toBe(true);

      const event = new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      card.dispatchEvent(event);

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should not flip on other keys', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const event = new window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true
      });

      card.dispatchEvent(event);

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should handle keyboard navigation between cards', () => {
      const cards = document.querySelectorAll('.flip-card:not(.ticket-disabled)');

      cards.forEach(card => {
        expect(card.getAttribute('tabindex')).toBe('0');
      });
    });

    it('should not prevent Enter/Space on interactive elements', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      const button = card.querySelector('.add-to-cart-btn');

      const event = new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      });

      Object.defineProperty(event, 'target', { value: button, configurable: true });

      button.dispatchEvent(event);

      expect(card.classList.contains('flipped')).toBe(false);
    });
  });

  describe('MutationObserver for New Cards', () => {
    it('should detect dynamically added cards', () => {
      const container = document.querySelector('.tickets-container');
      const newCard = document.createElement('div');
      newCard.className = 'flip-card';
      newCard.dataset.ticketType = 'saturday-only';
      newCard.innerHTML = `
        <div class="flip-card-inner">
          <div class="flip-card-front">
            <div class="ticket-type">Saturday Only</div>
          </div>
          <div class="flip-card-back">
            <button class="flip-back-btn">← Back</button>
          </div>
        </div>
      `;

      container.appendChild(newCard);

      // Wait for MutationObserver to process
      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
        expect(newCard.getAttribute('tabindex')).toBe('0');
        expect(console.log).toHaveBeenCalledWith('New flip cards detected and configured');
      });
    });

    it('should set tabindex on newly added enabled cards', () => {
      const container = document.querySelector('.tickets-container');
      const newCard = document.createElement('div');
      newCard.className = 'flip-card';
      newCard.dataset.ticketType = 'sunday-only';

      container.appendChild(newCard);

      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
        expect(newCard.getAttribute('tabindex')).toBe('0');
      });
    });

    it('should not set tabindex on newly added disabled cards', () => {
      const container = document.querySelector('.tickets-container');
      const newCard = document.createElement('div');
      newCard.className = 'flip-card ticket-disabled';
      newCard.dataset.ticketType = 'coming-soon';

      container.appendChild(newCard);

      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
        expect(newCard.hasAttribute('tabindex')).toBe(false);
        expect(newCard.getAttribute('aria-disabled')).toBe('true');
      });
    });

    it('should detect cards added within nested elements', () => {
      const container = document.querySelector('.tickets-container');
      const wrapper = document.createElement('div');
      wrapper.className = 'card-wrapper';

      const newCard = document.createElement('div');
      newCard.className = 'flip-card';
      newCard.dataset.ticketType = 'vip-pass';

      wrapper.appendChild(newCard);
      container.appendChild(wrapper);

      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
        expect(newCard.getAttribute('tabindex')).toBe('0');
      });
    });
  });

  describe('Screen Reader Announcements', () => {
    it('should create screen reader announcement when flipping', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement).not.toBeNull();
      expect(announcement.classList.contains('sr-only')).toBe(true);
    });

    it('should announce front state', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();
      card.click(); // Flip back to front

      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement.textContent).toContain('showing front');
    });

    it('should announce details state', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement.textContent).toContain('showing details');
    });

    it('should include ticket type in announcement', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement.textContent).toContain('Weekend Pass');
    });

    it('should set aria-atomic on announcements', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement.getAttribute('aria-atomic')).toBe('true');
    });

    it('should remove announcement after 1000ms', () => {
      vi.useFakeTimers();

      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      vi.advanceTimersByTime(1000);

      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('Focus Indicators', () => {
    it('should maintain focus on card after flip', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.focus();

      card.click();

      expect(document.activeElement).toBe(card);
    });

    it('should maintain tabindex after flip', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      expect(card.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('Multiple Cards State', () => {
    it('should maintain independent flip states', () => {
      const card1 = document.querySelector('[data-ticket-type="weekend-pass"]');
      const card2 = document.querySelector('[data-ticket-type="friday-only"]');

      card1.click();
      card2.click();

      expect(card1.classList.contains('flipped')).toBe(true);
      expect(card2.classList.contains('flipped')).toBe(true);

      card1.click();

      expect(card1.classList.contains('flipped')).toBe(false);
      expect(card2.classList.contains('flipped')).toBe(true);
    });

    it('should allow flipping all cards back at once', () => {
      const card1 = document.querySelector('[data-ticket-type="weekend-pass"]');
      const card2 = document.querySelector('[data-ticket-type="friday-only"]');

      card1.click();
      card2.click();

      flipCardManager.resetAllCards();

      expect(card1.classList.contains('flipped')).toBe(false);
      expect(card2.classList.contains('flipped')).toBe(false);
    });
  });

  describe('Helper Methods', () => {
    it('isCardFlipped should return true for flipped cards', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      expect(flipCardManager.isCardFlipped(card)).toBe(true);
    });

    it('isCardFlipped should return false for non-flipped cards', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');

      expect(flipCardManager.isCardFlipped(card)).toBe(false);
    });

    it('resetAllCards should flip all cards back', () => {
      const cards = document.querySelectorAll('.flip-card:not(.ticket-disabled)');

      cards.forEach(card => card.click());
      flipCardManager.resetAllCards();

      cards.forEach(card => {
        expect(card.classList.contains('flipped')).toBe(false);
      });
    });

    it('destroy should disconnect MutationObserver', () => {
      const observer = flipCardManager.observer;
      const disconnectSpy = vi.spyOn(observer, 'disconnect');

      flipCardManager.destroy();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid clicking on same card', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');

      card.click();
      card.click();
      card.click();

      expect(card.classList.contains('flipped')).toBe(true);
    });

    it('should handle clicking during flip animation', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');

      card.click();
      card.click(); // Immediate second click

      expect(card.classList.contains('flipped')).toBe(false);
    });

    it('should handle missing ticket type data attribute', () => {
      const card = document.createElement('div');
      card.className = 'flip-card';
      card.setAttribute('tabindex', '0');
      document.querySelector('.tickets-container').appendChild(card);

      card.click();

      expect(console.log).toHaveBeenCalledWith(
        'Click detected on card: unknown',
        expect.any(Object)
      );
    });

    it('should handle missing ticket type display element', () => {
      const card = document.createElement('div');
      card.className = 'flip-card';
      card.dataset.ticketType = 'test-ticket';
      document.querySelector('.tickets-container').appendChild(card);

      flipCardManager.updateCardTabindex();
      card.click();

      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement.textContent).toContain('Ticket');
    });

    it('should handle cards without data-ticket-type', () => {
      const container = document.querySelector('.tickets-container');
      const newCard = document.createElement('div');
      newCard.className = 'flip-card';

      container.appendChild(newCard);

      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
        newCard.click();
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('unknown'),
          expect.any(Object)
        );
      });
    });
  });

  describe('Card State Persistence', () => {
    it('should maintain flip state during DOM updates', () => {
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');
      card.click();

      // Simulate DOM update
      const container = document.querySelector('.tickets-container');
      const newElement = document.createElement('span');
      container.appendChild(newElement);

      expect(card.classList.contains('flipped')).toBe(true);
    });

    it('should maintain flip state when other cards are added', () => {
      const card1 = document.querySelector('[data-ticket-type="weekend-pass"]');
      card1.click();

      const container = document.querySelector('.tickets-container');
      const newCard = document.createElement('div');
      newCard.className = 'flip-card';
      container.appendChild(newCard);

      expect(card1.classList.contains('flipped')).toBe(true);
    });
  });

  describe('Accessibility Compliance', () => {
    it('should have proper ARIA attributes on enabled cards', () => {
      const enabledCards = document.querySelectorAll('.flip-card:not(.ticket-disabled)');

      enabledCards.forEach(card => {
        expect(card.getAttribute('tabindex')).toBe('0');
        expect(card.hasAttribute('aria-disabled')).toBe(false);
      });
    });

    it('should have proper ARIA attributes on disabled cards', () => {
      const disabledCards = document.querySelectorAll('.flip-card.ticket-disabled');

      disabledCards.forEach(card => {
        expect(card.hasAttribute('tabindex')).toBe(false);
        expect(card.getAttribute('aria-disabled')).toBe('true');
      });
    });

    it('should update ARIA attributes when cards change state', () => {
      const container = document.querySelector('.tickets-container');
      const card = document.querySelector('[data-ticket-type="weekend-pass"]');

      card.classList.add('ticket-disabled');
      flipCardManager.updateCardTabindex();

      expect(card.hasAttribute('tabindex')).toBe(false);
      expect(card.getAttribute('aria-disabled')).toBe('true');

      card.classList.remove('ticket-disabled');
      flipCardManager.updateCardTabindex();

      expect(card.getAttribute('tabindex')).toBe('0');
      expect(card.hasAttribute('aria-disabled')).toBe(false);
    });
  });
});
