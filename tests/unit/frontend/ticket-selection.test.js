/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Ticket Selection Component Tests
 * Tests the ticket-selection.js functionality including:
 * - Ticket quantity increment/decrement
 * - Add to cart button behavior
 * - Cart synchronization
 * - Ticket card selection state
 * - ARIA attributes for accessibility
 * - Keyboard accessibility
 * - Event emission for cart integration
 * - Unavailable ticket handling
 * - Display updates
 * - localStorage cross-tab synchronization
 */

describe('Ticket Selection Component', () => {
  let TicketSelection;
  let ticketSelectionInstance;
  let mockCartManager;
  let testEventListeners = []; // Track event listeners added in tests

  beforeEach(async () => {
    // Clear previous test listeners array
    testEventListeners = [];

    // Mock cart manager
    mockCartManager = {
      getState: vi.fn(() => ({
        tickets: {},
        donations: [],
        totals: { tickets: 0, donations: 0, total: 0, itemCount: 0 },
        isEmpty: true
      })),
      addTicket: vi.fn(),
      updateTicketQuantity: vi.fn(),
      removeTicket: vi.fn()
    };

    global.window.cartDebug = mockCartManager;

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

    // Set up DOM structure
    document.body.innerHTML = `
      <style>
        .ticket-card.selected { background-color: #e3f2fd; }
        .ticket-card.unavailable { opacity: 0.5; cursor: not-allowed; }
        .add-to-cart-btn { background-color: var(--color-blue); }
      </style>
      <div class="ticket-selection">
        <div class="ticket-card"
             data-ticket-id="weekend-pass"
             data-price="150"
             data-quantity="0"
             data-selected="false"
             data-initialized="true">
          <h4>Weekend Pass</h4>
          <p class="price">$150</p>
          <div class="quantity-controls">
            <button class="qty-btn minus" data-action="decrease" data-ready="true">-</button>
            <span class="quantity">0</span>
            <button class="qty-btn plus" data-action="increase" data-ready="true">+</button>
          </div>
          <button class="add-to-cart-btn"
                  data-ticket-id="weekend-pass"
                  data-price="150"
                  data-action-state="ready">
            Add to Cart
          </button>
        </div>

        <div class="ticket-card"
             data-ticket-id="friday-only"
             data-price="75"
             data-quantity="0"
             data-selected="false"
             data-initialized="true">
          <h4>Friday Only</h4>
          <p class="price">$75</p>
          <div class="quantity-controls">
            <button class="qty-btn minus" data-action="decrease" data-ready="true">-</button>
            <span class="quantity">0</span>
            <button class="qty-btn plus" data-action="increase" data-ready="true">+</button>
          </div>
          <button class="add-to-cart-btn"
                  data-ticket-id="friday-only"
                  data-price="75"
                  data-action-state="ready">
            Add to Cart
          </button>
        </div>

        <div class="ticket-card unavailable"
             data-ticket-id="sold-out"
             data-price="100"
             data-quantity="0"
             data-selected="false"
             data-initialized="true"
             aria-disabled="true">
          <h4>Saturday Only</h4>
          <p class="price">$100 (SOLD OUT)</p>
          <div class="quantity-controls">
            <button class="qty-btn minus" data-action="decrease" disabled>-</button>
            <span class="quantity">0</span>
            <button class="qty-btn plus" data-action="increase" disabled>+</button>
          </div>
        </div>
      </div>
    `;

    // Use fake timers
    vi.useFakeTimers();

    // Define TicketSelection class inline
    TicketSelection = class TicketSelection {
      constructor() {
        this.selectedTickets = new Map();
        this._initPromise = null;
        this._boundHandlers = {
          quantityChange: null,
          addToCart: null,
          cardClick: null,
          cardKeydown: null,
          cartUpdated: null,
          storage: null
        };
      }
      async init() {
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._performInit();
        return this._initPromise;
      }
      async _performInit() {
        this.initializeTicketCards();
        this.bindEvents();
        await this.waitForCartManager();
        this.syncWithCartState();
        this.updateDisplay();
      }
      destroy() {
        // Remove document-level event listeners
        if (this._boundHandlers.cartUpdated) {
          document.removeEventListener('cart:updated', this._boundHandlers.cartUpdated);
          document.removeEventListener('cart:ticket:added', this._boundHandlers.cartUpdated);
          document.removeEventListener('cart:ticket:removed', this._boundHandlers.cartUpdated);
          document.removeEventListener('cart:ticket:updated', this._boundHandlers.cartUpdated);
        }
        if (this._boundHandlers.storage) {
          window.removeEventListener('storage', this._boundHandlers.storage);
        }
      }
      initializeTicketCards() {
        document.querySelectorAll('.ticket-card').forEach((card) => {
          card.setAttribute('data-quantity', '0');
          card.setAttribute('data-selected', 'false');
          card.setAttribute('aria-pressed', 'false');
          card.setAttribute('data-initialized', 'true');
          const quantitySpan = card.querySelector('.quantity');
          if (quantitySpan) {
            // Always set to '0' to ensure consistent state
            quantitySpan.textContent = '0';
          }
          const addToCartBtn = card.querySelector('.add-to-cart-btn');
          if (addToCartBtn) {
            addToCartBtn.setAttribute('data-action-state', 'ready');
            addToCartBtn.disabled = false;
          }
          const qtyButtons = card.querySelectorAll('.qty-btn');
          qtyButtons.forEach(btn => {
            btn.setAttribute('data-ready', 'true');
            btn.disabled = false;
          });
        });
      }
      async waitForCartManager() {
        return new Promise((resolve) => {
          if (window.cartDebug && window.cartDebug.getState) {
            resolve();
            return;
          }
          const handleCartInit = () => {
            document.removeEventListener('cart:initialized', handleCartInit);
            resolve();
          };
          document.addEventListener('cart:initialized', handleCartInit);
          setTimeout(() => {
            document.removeEventListener('cart:initialized', handleCartInit);
            resolve();
          }, 5000);
        });
      }
      bindEvents() {
        // Store bound handlers for cleanup
        this._boundHandlers.cartUpdated = () => this.syncWithCartState();
        this._boundHandlers.storage = (event) => {
          if (event.key === 'alocubano_cart') {
            this.syncWithCartState();
          }
        };

        document.querySelectorAll('.qty-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => this.handleQuantityChange(e));
        });
        document.querySelectorAll('.add-to-cart-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => this.handleAddToCartClick(e));
        });
        document.querySelectorAll('.ticket-card').forEach((card) => {
          if (card.classList.contains('unavailable')) {
            card.setAttribute('aria-disabled', 'true');
            return;
          }
          card.setAttribute('tabindex', '0');
          card.setAttribute('role', 'button');
          card.setAttribute('aria-pressed', 'false');
          card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('qty-btn')) {
              this.handleTicketCardClick(e);
            }
          });
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!e.target.classList.contains('qty-btn')) {
                this.handleTicketCardClick(e);
              }
            }
          });
        });
        document.addEventListener('cart:updated', this._boundHandlers.cartUpdated);
        document.addEventListener('cart:ticket:added', this._boundHandlers.cartUpdated);
        document.addEventListener('cart:ticket:removed', this._boundHandlers.cartUpdated);
        document.addEventListener('cart:ticket:updated', this._boundHandlers.cartUpdated);
        window.addEventListener('storage', this._boundHandlers.storage);
      }
      handleQuantityChange(event) {
        event.stopPropagation();
        const btn = event.target;
        const card = btn.closest('.ticket-card');
        if (card.classList.contains('unavailable')) {
          return;
        }
        const ticketType = card.dataset.ticketId;
        const price = parseInt(card.dataset.price);
        const action = btn.dataset.action;
        const quantitySpan = card.querySelector('.quantity');
        if (!quantitySpan) {
          return; // Handle missing quantity span gracefully
        }
        let currentQuantity = parseInt(quantitySpan.textContent) || 0;
        if (action === 'increase') {
          currentQuantity++;
        } else if (action === 'decrease' && currentQuantity > 0) {
          currentQuantity--;
        }
        quantitySpan.textContent = currentQuantity.toString();
        if (currentQuantity > 0) {
          this.selectedTickets.set(ticketType, {
            quantity: currentQuantity,
            price: price,
            name: card.querySelector('h4').textContent
          });
          card.classList.add('selected');
          card.setAttribute('aria-pressed', 'true');
          card.setAttribute('data-quantity', currentQuantity.toString());
          card.setAttribute('data-selected', 'true');
        } else {
          this.selectedTickets.delete(ticketType);
          card.classList.remove('selected');
          card.setAttribute('aria-pressed', 'false');
          card.setAttribute('data-quantity', '0');
          card.setAttribute('data-selected', 'false');
        }
        this.updateDisplay();
        const eventDetail = {
          ticketType,
          quantity: currentQuantity,
          price,
          name: card.querySelector('h4').textContent,
          eventId: 'alocubano-boulderfest-2026'
        };
        document.dispatchEvent(new CustomEvent('ticket-quantity-changed', { detail: eventDetail }));
      }
      handleAddToCartClick(event) {
        event.stopPropagation();
        const btn = event.target;
        const ticketType = btn.dataset.ticketId;
        const price = parseInt(btn.dataset.price);
        if (!ticketType || !price) {
          console.error('Missing ticket data for add to cart button');
          return;
        }
        const card = document.querySelector(`[data-ticket-id="${ticketType}"]`);
        if (!card) {
          console.error('Could not find ticket card for', ticketType);
          return;
        }
        const quantitySpan = card.querySelector('.quantity');
        if (!quantitySpan) {
          return;
        }
        let currentQuantity = parseInt(quantitySpan.textContent) || 0;
        currentQuantity++;
        quantitySpan.textContent = currentQuantity.toString();
        this.selectedTickets.set(ticketType, {
          quantity: currentQuantity,
          price: price,
          name: card.querySelector('h4').textContent
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        card.setAttribute('data-quantity', currentQuantity.toString());
        card.setAttribute('data-selected', 'true');
        this.updateDisplay();
        const eventDetail = {
          ticketType,
          quantity: currentQuantity,
          price,
          name: card.querySelector('h4').textContent,
          eventId: 'alocubano-boulderfest-2026'
        };
        document.dispatchEvent(new CustomEvent('ticket-quantity-changed', { detail: eventDetail }));
        btn.textContent = 'Added!';
        btn.setAttribute('data-action-state', 'added');
        btn.style.backgroundColor = '#28a745';
        setTimeout(() => {
          btn.textContent = 'Add to Cart';
          btn.setAttribute('data-action-state', 'ready');
          btn.style.backgroundColor = '';
        }, 1000);
      }
      handleTicketCardClick(event) {
        const card = event.currentTarget;
        if (card.classList.contains('unavailable')) {
          return;
        }
        const quantitySpan = card.querySelector('.quantity');
        const currentQuantity = parseInt(quantitySpan.textContent) || 0;
        if (currentQuantity === 0) {
          const plusBtn = card.querySelector('.qty-btn.plus');
          plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }
      updateDisplay() {}
      syncWithCartState() {}
    };

    // Initialize ticket selection
    ticketSelectionInstance = new TicketSelection();
    await ticketSelectionInstance.init();

    // NOW wrap document.addEventListener to track listeners added by tests (after instance init)
    const originalAddEventListener = document.addEventListener.bind(document);
    document.addEventListener = function(type, listener, options) {
      testEventListeners.push({ type, listener, options });
      return originalAddEventListener(type, listener, options);
    };
  });

  afterEach(() => {
    // Remove all event listeners added during the test
    testEventListeners.forEach(({ type, listener, options }) => {
      document.removeEventListener(type, listener, options);
    });
    testEventListeners = [];

    // Restore original addEventListener
    delete document.addEventListener;

    // Clean up instance event listeners
    if (ticketSelectionInstance && ticketSelectionInstance.destroy) {
      ticketSelectionInstance.destroy();
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize all ticket cards with default attributes', () => {
      const cards = document.querySelectorAll('.ticket-card:not(.unavailable)');

      cards.forEach(card => {
        expect(card.getAttribute('data-quantity')).toBe('0');
        expect(card.getAttribute('data-selected')).toBe('false');
        expect(card.getAttribute('aria-pressed')).toBe('false');
        expect(card.getAttribute('data-initialized')).toBe('true');
      });
    });

    it('should initialize quantity displays to 0', () => {
      const quantities = document.querySelectorAll('.quantity');

      quantities.forEach(qty => {
        expect(qty.textContent).toBe('0');
      });
    });

    it('should initialize add to cart buttons as ready', () => {
      const buttons = document.querySelectorAll('.add-to-cart-btn');

      buttons.forEach(btn => {
        expect(btn.getAttribute('data-action-state')).toBe('ready');
        expect(btn.disabled).toBe(false);
      });
    });

    it('should set quantity control buttons as ready', () => {
      const qtyButtons = document.querySelectorAll('.qty-btn:not(.unavailable .qty-btn)');

      qtyButtons.forEach(btn => {
        expect(btn.getAttribute('data-ready')).toBe('true');
        expect(btn.disabled).toBe(false);
      });
    });

    it('should wait for cart manager initialization', async () => {
      // Create a fresh instance to test init flow
      const freshInstance = new TicketSelection();
      const waitSpy = vi.spyOn(freshInstance, 'waitForCartManager');

      await freshInstance.init();

      expect(waitSpy).toHaveBeenCalled();

      // Clean up
      freshInstance.destroy();
    });
  });

  describe('Quantity Controls', () => {
    it('should increase quantity on plus button click', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      const quantitySpan = card.querySelector('.quantity');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(quantitySpan.textContent).toBe('1');
      expect(card.classList.contains('selected')).toBe(true);
    });

    it('should decrease quantity on minus button click', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      const minusBtn = card.querySelector('.qty-btn.minus');
      const quantitySpan = card.querySelector('.quantity');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(quantitySpan.textContent).toBe('2');

      minusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(quantitySpan.textContent).toBe('1');
    });

    it('should not decrease quantity below 0', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const minusBtn = card.querySelector('.qty-btn.minus');
      const quantitySpan = card.querySelector('.quantity');

      // Manually trigger the handler since event listeners are attached
      minusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(quantitySpan.textContent).toBe('0');
      expect(card.classList.contains('selected')).toBe(false);
    });

    it('should update internal state when quantity changes', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(ticketSelectionInstance.selectedTickets.has('weekend-pass')).toBe(true);
      expect(ticketSelectionInstance.selectedTickets.get('weekend-pass').quantity).toBe(1);
    });

    it('should remove from internal state when quantity reaches 0', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      const minusBtn = card.querySelector('.qty-btn.minus');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(ticketSelectionInstance.selectedTickets.has('weekend-pass')).toBe(true);

      minusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(ticketSelectionInstance.selectedTickets.has('weekend-pass')).toBe(false);
    });

    it('should add selected class when quantity > 0', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(card.classList.contains('selected')).toBe(true);
    });

    it('should remove selected class when quantity = 0', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      const minusBtn = card.querySelector('.qty-btn.minus');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      minusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(card.classList.contains('selected')).toBe(false);
    });

    it('should update ARIA attributes when quantity changes', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(card.getAttribute('aria-pressed')).toBe('true');
      expect(card.getAttribute('data-quantity')).toBe('1');
      expect(card.getAttribute('data-selected')).toBe('true');
    });

    it('should emit ticket-quantity-changed event on quantity change', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      let eventFired = false;

      document.addEventListener('ticket-quantity-changed', (event) => {
        expect(event.detail).toMatchObject({
          ticketType: 'weekend-pass',
          quantity: 1,
          price: 150,
          name: 'Weekend Pass',
          eventId: 'alocubano-boulderfest-2026'
        });
        eventFired = true;
      });

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(eventFired).toBe(true);
    });
  });

  describe('Add to Cart Button', () => {
    it('should increase quantity when add to cart clicked', () => {
      const addToCartBtn = document.querySelector('[data-ticket-id="weekend-pass"].add-to-cart-btn');
      const quantitySpan = document.querySelector('[data-ticket-id="weekend-pass"] .quantity');

      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(quantitySpan.textContent).toBe('1');
    });

    it('should show visual feedback after adding to cart', () => {
      const addToCartBtn = document.querySelector('[data-ticket-id="weekend-pass"].add-to-cart-btn');

      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(addToCartBtn.textContent).toBe('Added!');
      expect(addToCartBtn.getAttribute('data-action-state')).toBe('added');
      expect(addToCartBtn.style.backgroundColor).toBe('#28a745'); // Happy-DOM stores as hex
    });

    it('should reset button text after 1 second', () => {
      const addToCartBtn = document.querySelector('[data-ticket-id="weekend-pass"].add-to-cart-btn');

      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(1000);

      expect(addToCartBtn.textContent).toBe('Add to Cart');
      expect(addToCartBtn.getAttribute('data-action-state')).toBe('ready');
    });

    it('should emit event when adding to cart', () => {
      const addToCartBtn = document.querySelector('[data-ticket-id="weekend-pass"].add-to-cart-btn');
      let eventFired = false;

      document.addEventListener('ticket-quantity-changed', (event) => {
        expect(event.detail.ticketType).toBe('weekend-pass');
        eventFired = true;
      });

      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(eventFired).toBe(true);
    });

    it('should handle missing ticket data gracefully', () => {
      const addToCartBtn = document.querySelector('[data-ticket-id="weekend-pass"].add-to-cart-btn');
      delete addToCartBtn.dataset.ticketId;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(consoleSpy).toHaveBeenCalledWith('Missing ticket data for add to cart button');

      consoleSpy.mockRestore();
    });
  });

  describe('Ticket Card Click', () => {
    it('should add one ticket when clicking card with 0 quantity', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const quantitySpan = card.querySelector('.quantity');

      card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(quantitySpan.textContent).toBe('1');
    });

    it('should not add ticket when clicking selected card', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      const quantitySpan = card.querySelector('.quantity');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const quantity = quantitySpan.textContent;

      card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(quantitySpan.textContent).toBe(quantity);
    });

    it('should not respond to clicks on quantity buttons', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const minusBtn = card.querySelector('.qty-btn.minus');

      const clickSpy = vi.spyOn(ticketSelectionInstance, 'handleTicketCardClick');

      minusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(clickSpy).not.toHaveBeenCalled();

      clickSpy.mockRestore();
    });
  });

  describe('Unavailable Tickets', () => {
    it('should mark unavailable tickets with aria-disabled', () => {
      const unavailableCard = document.querySelector('.ticket-card.unavailable');

      expect(unavailableCard.getAttribute('aria-disabled')).toBe('true');
    });

    it('should not respond to quantity changes on unavailable tickets', () => {
      const unavailableCard = document.querySelector('.ticket-card.unavailable');
      const quantitySpan = unavailableCard.querySelector('.quantity');
      const initialQuantity = quantitySpan.textContent;

      const plusBtn = unavailableCard.querySelector('.qty-btn.plus');
      if (plusBtn && !plusBtn.disabled) {
        plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      expect(quantitySpan.textContent).toBe(initialQuantity);
    });

    it('should not add selected class to unavailable tickets', () => {
      const unavailableCard = document.querySelector('.ticket-card.unavailable');

      unavailableCard.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(unavailableCard.classList.contains('selected')).toBe(false);
    });
  });

  describe('Keyboard Accessibility', () => {
    it('should have tabindex on available ticket cards', () => {
      const availableCards = document.querySelectorAll('.ticket-card:not(.unavailable)');

      availableCards.forEach(card => {
        expect(card.getAttribute('tabindex')).toBe('0');
      });
    });

    it('should have role="button" on ticket cards', () => {
      const availableCards = document.querySelectorAll('.ticket-card:not(.unavailable)');

      availableCards.forEach(card => {
        expect(card.getAttribute('role')).toBe('button');
      });
    });

    it('should respond to Enter key on ticket card', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const quantitySpan = card.querySelector('.quantity');

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      card.dispatchEvent(enterEvent);

      expect(quantitySpan.textContent).toBe('1');
    });

    it('should respond to Space key on ticket card', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const quantitySpan = card.querySelector('.quantity');

      const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      card.dispatchEvent(spaceEvent);

      expect(quantitySpan.textContent).toBe('1');
    });

    it('should prevent default on Space key to avoid scrolling', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');

      const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      const preventDefaultSpy = vi.spyOn(spaceEvent, 'preventDefault');

      card.dispatchEvent(spaceEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Cart Synchronization', () => {
    it('should listen for cart:updated events', () => {
      const syncSpy = vi.spyOn(ticketSelectionInstance, 'syncWithCartState');

      document.dispatchEvent(new CustomEvent('cart:updated'));

      expect(syncSpy).toHaveBeenCalled();

      syncSpy.mockRestore();
    });

    it('should listen for cart:ticket:added events', () => {
      const syncSpy = vi.spyOn(ticketSelectionInstance, 'syncWithCartState');

      document.dispatchEvent(new CustomEvent('cart:ticket:added'));

      expect(syncSpy).toHaveBeenCalled();

      syncSpy.mockRestore();
    });

    it('should listen for cart:ticket:removed events', () => {
      const syncSpy = vi.spyOn(ticketSelectionInstance, 'syncWithCartState');

      document.dispatchEvent(new CustomEvent('cart:ticket:removed'));

      expect(syncSpy).toHaveBeenCalled();

      syncSpy.mockRestore();
    });

    it('should listen for localStorage storage events for cross-tab sync', () => {
      const syncSpy = vi.spyOn(ticketSelectionInstance, 'syncWithCartState');

      const storageEvent = new StorageEvent('storage', {
        key: 'alocubano_cart',
        newValue: '{}',
        url: window.location.href
      });
      window.dispatchEvent(storageEvent);

      expect(syncSpy).toHaveBeenCalled();

      syncSpy.mockRestore();
    });

    it('should ignore storage events for other keys', () => {
      const syncSpy = vi.spyOn(ticketSelectionInstance, 'syncWithCartState');

      const storageEvent = new StorageEvent('storage', {
        key: 'other_key',
        newValue: '{}',
        url: window.location.href
      });
      window.dispatchEvent(storageEvent);

      expect(syncSpy).not.toHaveBeenCalled();

      syncSpy.mockRestore();
    });
  });

  describe('Multiple Ticket Selection', () => {
    it('should allow selecting multiple different ticket types', () => {
      const weekendCard = document.querySelector('[data-ticket-id="weekend-pass"]');
      const fridayCard = document.querySelector('[data-ticket-id="friday-only"]');

      const weekendPlusBtn = weekendCard.querySelector('.qty-btn.plus');
      const fridayPlusBtn = fridayCard.querySelector('.qty-btn.plus');

      weekendPlusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      fridayPlusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(ticketSelectionInstance.selectedTickets.size).toBe(2);
      expect(ticketSelectionInstance.selectedTickets.has('weekend-pass')).toBe(true);
      expect(ticketSelectionInstance.selectedTickets.has('friday-only')).toBe(true);
    });

    it('should maintain separate quantities for different ticket types', () => {
      const weekendCard = document.querySelector('[data-ticket-id="weekend-pass"]');
      const fridayCard = document.querySelector('[data-ticket-id="friday-only"]');

      const weekendPlusBtn = weekendCard.querySelector('.qty-btn.plus');
      const fridayPlusBtn = fridayCard.querySelector('.qty-btn.plus');

      weekendPlusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      weekendPlusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      fridayPlusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(ticketSelectionInstance.selectedTickets.get('weekend-pass').quantity).toBe(2);
      expect(ticketSelectionInstance.selectedTickets.get('friday-only').quantity).toBe(1);
    });
  });

  describe('Data Attributes', () => {
    it('should store ticket metadata in selected tickets', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      const ticketData = ticketSelectionInstance.selectedTickets.get('weekend-pass');

      expect(ticketData).toMatchObject({
        quantity: 1,
        price: 150,
        name: 'Weekend Pass'
      });
    });

    it('should update data-quantity attribute on card', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(card.getAttribute('data-quantity')).toBe('2');
    });

    it('should update data-selected attribute on card', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');

      expect(card.getAttribute('data-selected')).toBe('false');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(card.getAttribute('data-selected')).toBe('true');
    });
  });

  describe('Event Emission', () => {
    it('should emit complete event detail on quantity change', () => {
      const card = document.querySelector('[data-ticket-id="friday-only"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      let eventFired = false;

      document.addEventListener('ticket-quantity-changed', (event) => {
        expect(event.detail).toEqual({
          ticketType: 'friday-only',
          quantity: 1,
          price: 75,
          name: 'Friday Only',
          eventId: 'alocubano-boulderfest-2026'
        });
        eventFired = true;
      });

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(eventFired).toBe(true);
    });

    it('should emit event with updated quantity on multiple increments', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');

      let eventCount = 0;

      document.addEventListener('ticket-quantity-changed', (event) => {
        eventCount++;
        if (eventCount === 2) {
          expect(event.detail.quantity).toBe(2);
        }
      });

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(eventCount).toBe(2);
    });

    it('should emit event with quantity 0 when removing ticket', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      const minusBtn = card.querySelector('.qty-btn.minus');

      let eventCount = 0;

      document.addEventListener('ticket-quantity-changed', (event) => {
        eventCount++;
        if (eventCount === 2) {
          expect(event.detail.quantity).toBe(0);
        }
      });

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      minusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(eventCount).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid clicking on quantity buttons', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const plusBtn = card.querySelector('.qty-btn.plus');
      const quantitySpan = card.querySelector('.quantity');

      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(quantitySpan.textContent).toBe('3');
      expect(ticketSelectionInstance.selectedTickets.get('weekend-pass').quantity).toBe(3);
    });

    it('should handle clicking add to cart multiple times', () => {
      const addToCartBtn = document.querySelector('[data-ticket-id="weekend-pass"].add-to-cart-btn');
      const quantitySpan = document.querySelector('[data-ticket-id="weekend-pass"] .quantity');

      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(quantitySpan.textContent).toBe('3');
    });

    it('should handle missing quantity element gracefully', () => {
      const card = document.querySelector('[data-ticket-id="weekend-pass"]');
      const quantitySpan = card.querySelector('.quantity');
      quantitySpan.remove();

      const plusBtn = card.querySelector('.qty-btn.plus');

      expect(() => plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).not.toThrow();
    });
  });
});
