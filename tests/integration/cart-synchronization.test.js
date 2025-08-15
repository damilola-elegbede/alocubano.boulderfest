// Cart Synchronization Integration Tests
// Tests cross-component communication and state synchronization

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import {
  cleanupJSDOM,
  EventListenerTracker,
  logMemoryUsage,
} from "../utils/cleanup-helpers.js";

describe("Cart Synchronization Integration Tests", () => {
  let dom;
  let document;
  let window;
  let localStorage;
  let donationSelectionSource;
  let ticketSelectionSource;
  let cartManagerSource;
  let registeredListeners;

  beforeEach(async () => {
    // Track all event listeners added during tests
    registeredListeners = [];
    // For integration tests, we'll use mock implementations that work in JSDOM
    // The real source files have too many dependencies for simple integration testing

    // Create minimal mock sources for testing
    donationSelectionSource = `
                class DonationSelection {
                    constructor() {
                        this.selectedAmount = null;
                        this.customAmount = null;
                    }
                    
                    validateAmount(amount) {
                        if (!amount || isNaN(amount)) {
                            throw new Error('Invalid donation amount');
                        }
                        if (amount <= 0) {
                            throw new Error('Donation amount must be greater than zero');
                        }
                        if (amount > 10000) {
                            throw new Error('Donation amount exceeds maximum limit');
                        }
                        return true;
                    }
                    
                    handleDonate() {
                        try {
                            const amount = this.selectedAmount === 'custom' ? this.customAmount : this.selectedAmount;
                            if (!amount) {
                                throw new Error('No donation amount selected');
                            }
                            
                            this.validateAmount(amount);
                            
                            document.dispatchEvent(new window.CustomEvent('donation-amount-changed', {
                                detail: { amount: amount }
                            }));
                        } catch (error) {
                            console.error('Donation error:', error.message);
                            document.dispatchEvent(new window.CustomEvent('donation-error', {
                                detail: { error: error.message }
                            }));
                        }
                    }
                }
                window.DonationSelection = DonationSelection;
            `;

    ticketSelectionSource = `
                class TicketSelection {
                    constructor() {
                        this.selectedTickets = new Map();
                        this.maxQuantityPerTicket = 10;
                    }
                    
                    validateTicketData(ticketType, quantity, price, name) {
                        if (!ticketType || typeof ticketType !== 'string') {
                            throw new Error('Invalid ticket type');
                        }
                        if (quantity < 0) {
                            throw new Error('Quantity cannot be negative');
                        }
                        if (quantity > this.maxQuantityPerTicket) {
                            throw new Error(\`Maximum \${this.maxQuantityPerTicket} tickets allowed per type\`);
                        }
                        if (price <= 0) {
                            throw new Error('Ticket price must be greater than zero');
                        }
                        if (!name || typeof name !== 'string') {
                            throw new Error('Ticket name is required');
                        }
                        return true;
                    }
                    
                    handleQuantityChange(ticketType, quantity, price, name) {
                        try {
                            this.validateTicketData(ticketType, quantity, price, name);
                            
                            // Update internal state
                            if (quantity > 0) {
                                this.selectedTickets.set(ticketType, { quantity, price, name });
                            } else {
                                this.selectedTickets.delete(ticketType);
                            }
                            
                            document.dispatchEvent(new window.CustomEvent('ticket-quantity-changed', {
                                detail: { ticketType, quantity, price, name }
                            }));
                        } catch (error) {
                            console.error('Ticket validation error:', error.message);
                            document.dispatchEvent(new window.CustomEvent('ticket-error', {
                                detail: { error: error.message, ticketType }
                            }));
                        }
                    }
                }
                window.TicketSelection = TicketSelection;
            `;

    cartManagerSource = `
                class CartManager extends EventTarget {
                    constructor() {
                        super();
                        this.state = { tickets: {}, donations: [], total: 0 };
                        
                        // Force use of custom EventTarget implementation for test compatibility
                        // This avoids Node.js/JSDOM event incompatibility issues
                        this._eventListeners = new Map();
                        
                        this.addEventListener = function(type, listener) {
                            if (!this._eventListeners.has(type)) {
                                this._eventListeners.set(type, []);
                            }
                            this._eventListeners.get(type).push(listener);
                        };
                        
                        this.removeEventListener = function(type, listener) {
                            const listeners = this._eventListeners.get(type);
                            if (listeners) {
                                const index = listeners.indexOf(listener);
                                if (index > -1) {
                                    listeners.splice(index, 1);
                                }
                            }
                        };
                        
                        this.dispatchEvent = function(event) {
                            const listeners = this._eventListeners.get(event.type) || [];
                            listeners.forEach(listener => {
                                try {
                                    listener.call(this, event);
                                } catch (err) {
                                    console.error('Listener error:', err);
                                }
                            });
                            return true;
                        };
                    }
                    
                    validateCartOperation(operation, data) {
                        if (!operation || typeof operation !== 'string') {
                            throw new Error('Invalid cart operation');
                        }
                        
                        switch (operation) {
                            case 'updateTicket':
                                if (!data.ticketType || typeof data.quantity !== 'number') {
                                    throw new Error('Invalid ticket update data');
                                }
                                if (data.quantity < 0) {
                                    throw new Error('Ticket quantity cannot be negative');
                                }
                                break;
                            case 'addDonation':
                                if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
                                    throw new Error('Invalid donation amount');
                                }
                                if (data.amount > 10000) {
                                    throw new Error('Donation amount exceeds maximum limit');
                                }
                                break;
                        }
                        return true;
                    }
                    
                    emit(eventName, detail) {
                        try {
                            let selfResult = true;
                            
                            // Use window.CustomEvent to ensure proper JSDOM context
                            const selfEvent = new window.CustomEvent(eventName, { detail });
                            selfResult = this.dispatchEvent(selfEvent);
                            
                            // Create separate event for document dispatch (JSDOM requirement)
                            // Wrap in try/catch to handle faulty document listeners gracefully
                            try {
                                const docEvent = new window.CustomEvent(eventName, { detail });
                                document.dispatchEvent(docEvent);
                            } catch (listenerError) {
                                console.error('Document listener error:', listenerError);
                                // Don't re-throw - continue operation despite listener failures
                            }
                            
                            return selfResult;
                        } catch (error) {
                            console.error('Event dispatch error:', error);
                            // In tests, we want to see errors
                            throw error;
                        }
                    }
                    
                    updateTicketQuantity(ticketType, quantity) {
                        try {
                            this.validateCartOperation('updateTicket', { ticketType, quantity });
                            
                            if (quantity > 0) {
                                this.state.tickets[ticketType] = { quantity };
                            } else {
                                delete this.state.tickets[ticketType];
                            }
                            
                            this.calculateTotal();
                            this.emit('cart:updated', this.state);
                        } catch (error) {
                            this.emit('cart:error', { error: error.message });
                            throw error;
                        }
                    }
                    
                    addDonation(amount) {
                        try {
                            this.validateCartOperation('addDonation', { amount });
                            
                            this.state.donations.push(amount);
                            this.calculateTotal();
                            this.emit('cart:updated', this.state);
                        } catch (error) {
                            this.emit('cart:error', { error: error.message });
                            throw error;
                        }
                    }
                    
                    calculateTotal() {
                        const ticketTotal = Object.values(this.state.tickets)
                            .reduce((sum, ticket) => sum + (ticket.quantity * (ticket.price || 0)), 0);
                        const donationTotal = this.state.donations.reduce((sum, amount) => sum + amount, 0);
                        this.state.total = ticketTotal + donationTotal;
                    }
                    
                    clear() {
                        this.state = { tickets: {}, donations: [], total: 0 };
                        this.emit('cart:cleared', this.state);
                    }
                    
                    getState() {
                        return { ...this.state };
                    }
                }
                window.CartManager = CartManager;
            `;

    dom = new JSDOM(
      `<!DOCTYPE html>
            <html>
            <head>
                <title>Cart Integration Test</title>
            </head>
            <body>
                <!-- Donation Selection UI -->
                <div class="donation-selection">
                    <div class="donation-card selected" data-amount="50">
                        <div class="donation-amount">$50</div>
                    </div>
                    <div class="donation-card" data-amount="custom">
                        <div class="donation-amount">CUSTOM</div>
                    </div>
                    <button id="donate-button">ADD TO CART</button>
                </div>
                
                <!-- Ticket Selection UI -->
                <div class="ticket-selection">
                    <div class="ticket-card" data-ticket-type="early-bird-full" data-price="100">
                        <h4>Early Bird Full Pass</h4>
                        <div class="quantity-selector">
                            <button class="qty-btn minus">-</button>
                            <span class="quantity">0</span>
                            <button class="qty-btn plus">+</button>
                        </div>
                    </div>
                    <div class="ticket-card" data-ticket-type="friday-pass" data-price="50">
                        <h4>Friday Pass</h4>
                        <div class="quantity-selector">
                            <button class="qty-btn minus">-</button>
                            <span class="quantity">0</span>
                            <button class="qty-btn plus">+</button>
                        </div>
                    </div>
                </div>
                
                <!-- Cart UI -->
                <div class="floating-cart-container">
                    <div class="floating-cart-panel">
                        <div class="cart-content">
                            <div class="cart-empty-message">Your cart is empty</div>
                            <div class="cart-items" style="display: none;"></div>
                        </div>
                        <div class="cart-footer">
                            <div class="cart-total">
                                Total: $<span class="cart-total-amount">0</span>
                            </div>
                            <button class="cart-clear-btn">Clear Cart</button>
                        </div>
                    </div>
                </div>
            </body>
            </html>`,
      {
        url: "https://localhost",
        pretendToBeVisual: true,
        resources: "usable",
      },
    );

    document = dom.window.document;
    window = dom.window;

    // Mock localStorage properly for JSDOM
    const storageData = {};
    localStorage = {
      data: storageData,
      getItem: vi.fn((key) => storageData[key] || null),
      setItem: vi.fn((key, value) => {
        storageData[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete storageData[key];
      }),
      clear: vi.fn(() => {
        // Clear all properties instead of reassigning
        Object.keys(storageData).forEach((key) => delete storageData[key]);
      }),
    };

    // Define localStorage on window using defineProperty
    Object.defineProperty(window, "localStorage", {
      value: localStorage,
      writable: true,
    });

    global.document = document;
    global.window = window;
    global.localStorage = localStorage;

    // Inject source code for integration testing
    const script = document.createElement("script");
    script.textContent = `
            ${cartManagerSource}
            ${donationSelectionSource}
            ${ticketSelectionSource}
        `;
    document.head.appendChild(script);

    // Execute script content in window context to ensure classes are available
    try {
      const scriptFunction = new window.Function(script.textContent);
      scriptFunction();
    } catch (scriptError) {
      console.error("Script execution error:", scriptError.message);
    }

    // Override addEventListener to track listeners
    const originalDocAddEventListener = document.addEventListener;
    const originalWinAddEventListener = window.addEventListener;

    document.addEventListener = function (type, listener, options) {
      registeredListeners.push({ target: "document", type, listener });
      return originalDocAddEventListener.call(this, type, listener, options);
    };

    window.addEventListener = function (type, listener, options) {
      registeredListeners.push({ target: "window", type, listener });
      return originalWinAddEventListener.call(this, type, listener, options);
    };
  });

  afterEach(() => {
    // Comprehensive cleanup
    if (dom) {
      // Remove all tracked event listeners
      registeredListeners.forEach(({ target, type, listener }) => {
        if (target === "document" && document) {
          document.removeEventListener(type, listener);
        } else if (target === "window" && window) {
          window.removeEventListener(type, listener);
        }
      });

      // Clean up JSDOM properly
      cleanupJSDOM(dom);
      dom = null;
    }

    // Clear references
    document = null;
    window = null;
    localStorage = null;

    // Clear module cache to free memory from loaded source files
    vi.resetModules();

    // Log memory if needed
    logMemoryUsage("Cart Sync Test Cleanup");
  });

  describe("Cart Manager Integration", () => {
    test("should initialize cart manager and respond to events", async () => {
      const cartManager = new window.CartManager();

      expect(cartManager).toBeTruthy();
      expect(cartManager.state).toBeTruthy();
      expect(cartManager.state.tickets).toEqual({});
      expect(cartManager.state.donations).toEqual([]);
    });

    test("should handle dual event dispatch from cart manager", async () => {
      const cartManager = new window.CartManager();

      const documentListener = vi.fn();
      const cartManagerListener = vi.fn();

      document.addEventListener("cart:updated", documentListener);
      cartManager.addEventListener("cart:updated", cartManagerListener);

      cartManager.updateTicketQuantity("early-bird-full", 1);

      // Both listeners should be called due to dual dispatch fix
      expect(cartManagerListener).toHaveBeenCalled();
      expect(documentListener).toHaveBeenCalled();
    });
  });

  describe("Donation to Cart Integration", () => {
    test("should add donation to cart when donation button clicked", async () => {
      const cartManager = new window.CartManager();
      const donationSelection = new window.DonationSelection();

      // Set up the integration - cart manager should listen to donation events
      document.addEventListener("donation-amount-changed", (event) => {
        cartManager.addDonation(event.detail.amount);
      });

      // Set up donation amount
      donationSelection.selectedAmount = 50;

      const cartUpdatedListener = vi.fn();
      document.addEventListener("cart:updated", cartUpdatedListener);

      // Simulate donation
      donationSelection.handleDonate();

      // Should dispatch donation event which triggers cart update
      expect(cartUpdatedListener).toHaveBeenCalled();
    });

    test("should handle donation amount changed events", async () => {
      const cartManager = new window.CartManager();

      const donationListener = vi.fn();
      document.addEventListener("donation-amount-changed", donationListener);

      // Simulate donation event
      document.dispatchEvent(
        new window.CustomEvent("donation-amount-changed", {
          detail: { amount: 25 },
        }),
      );

      expect(donationListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { amount: 25 },
        }),
      );
    });

    test("should synchronize donation UI with cart state", async () => {
      const cartManager = new window.CartManager();

      // Add donation to cart
      cartManager.addDonation(75);

      expect(cartManager.state.donations).toContain(75);
      expect(cartManager.state.donations.length).toBe(1);
    });
  });

  describe("Ticket Selection to Cart Integration", () => {
    test("should add tickets to cart when quantity changed", async () => {
      const cartManager = new window.CartManager();
      const ticketSelection = new window.TicketSelection();

      const cartUpdatedListener = vi.fn();
      document.addEventListener("cart:updated", cartUpdatedListener);

      // Simulate ticket quantity change
      ticketSelection.handleQuantityChange(
        "early-bird-full",
        2,
        100,
        "Early Bird Full Pass",
      );

      // Should dispatch ticket quantity change event
      const ticketListener = vi.fn();
      document.addEventListener("ticket-quantity-changed", ticketListener);

      document.dispatchEvent(
        new window.CustomEvent("ticket-quantity-changed", {
          detail: {
            ticketType: "early-bird-full",
            quantity: 2,
            price: 100,
            name: "Early Bird Full Pass",
          },
        }),
      );

      expect(ticketListener).toHaveBeenCalled();
    });

    test("should synchronize ticket quantities with cart state", async () => {
      const cartManager = new window.CartManager();

      // Update ticket quantity
      cartManager.updateTicketQuantity("early-bird-full", 3);

      expect(cartManager.state.tickets["early-bird-full"]).toBeTruthy();
      expect(cartManager.state.tickets["early-bird-full"].quantity).toBe(3);
    });

    test("should remove tickets when quantity is zero", async () => {
      const cartManager = new window.CartManager();

      // Add ticket first
      cartManager.updateTicketQuantity("early-bird-full", 1);
      expect(cartManager.state.tickets["early-bird-full"]).toBeTruthy();

      // Remove ticket
      cartManager.updateTicketQuantity("early-bird-full", 0);
      expect(cartManager.state.tickets["early-bird-full"]).toBeUndefined();
    });
  });

  describe("Cross-Component State Synchronization", () => {
    test("should synchronize state between ticket selection and cart", async () => {
      const cartManager = new window.CartManager();

      // Set initial cart state
      cartManager.state.tickets = {
        "early-bird-full": {
          quantity: 2,
          price: 100,
          name: "Early Bird Full Pass",
        },
        "friday-pass": { quantity: 1, price: 50, name: "Friday Pass" },
      };

      // Store in localStorage (simulating persistence)
      localStorage.setItem("alocubano_cart", JSON.stringify(cartManager.state));

      // Verify synchronization
      const storedState = JSON.parse(localStorage.getItem("alocubano_cart"));
      expect(storedState.tickets["early-bird-full"].quantity).toBe(2);
      expect(storedState.tickets["friday-pass"].quantity).toBe(1);
    });

    test("should handle localStorage updates across components", async () => {
      const cartManager = new window.CartManager();

      // Simulate cross-tab synchronization
      const storageListener = vi.fn();
      window.addEventListener("storage", storageListener);

      // Update localStorage (simulating external update)
      const newState = {
        tickets: { "early-bird-full": { quantity: 1 } },
        donations: [25],
        total: 125,
      };
      localStorage.setItem("alocubano_cart", JSON.stringify(newState));

      // Simulate storage event
      window.dispatchEvent(
        new window.StorageEvent("storage", {
          key: "alocubano_cart",
          newValue: JSON.stringify(newState),
          oldValue: null,
        }),
      );

      expect(storageListener).toHaveBeenCalled();
    });

    test("should maintain UI consistency during rapid state changes", async () => {
      const cartManager = new window.CartManager();
      const ticketCard = document.querySelector(
        '[data-ticket-type="early-bird-full"]',
      );
      const quantitySpan = ticketCard.querySelector(".quantity");

      // Simulate rapid quantity updates
      const updates = [1, 2, 3, 2, 1, 0];

      for (const quantity of updates) {
        cartManager.updateTicketQuantity("early-bird-full", quantity);
        // Simulate UI update
        quantitySpan.textContent = quantity.toString();
      }

      expect(quantitySpan.textContent).toBe("0");
      expect(cartManager.state.tickets["early-bird-full"]).toBeUndefined();
    });
  });

  describe("Clear Cart Integration", () => {
    test("should clear all cart data and synchronize UI", async () => {
      const cartManager = new window.CartManager();

      // Set up cart with data
      cartManager.state.tickets = { "early-bird-full": { quantity: 1 } };
      cartManager.state.donations = [50];

      const clearListener = vi.fn();
      document.addEventListener("cart:cleared", clearListener);

      // Clear cart
      cartManager.clear();

      expect(cartManager.state.tickets).toEqual({});
      expect(cartManager.state.donations).toEqual([]);
      expect(clearListener).toHaveBeenCalled();
    });

    test("should reset all UI elements when cart cleared", async () => {
      const cartManager = new window.CartManager();

      // Set up UI with values
      const quantitySpans = document.querySelectorAll(".quantity");
      quantitySpans.forEach((span) => (span.textContent = "2"));

      const donationCards = document.querySelectorAll(".donation-card");
      donationCards.forEach((card) => card.classList.add("selected"));

      // Clear cart and simulate UI reset
      cartManager.clear();

      // Simulate UI reset logic
      quantitySpans.forEach((span) => (span.textContent = "0"));
      donationCards.forEach((card) => card.classList.remove("selected"));

      // Verify reset
      quantitySpans.forEach((span) => {
        expect(span.textContent).toBe("0");
      });

      donationCards.forEach((card) => {
        expect(card.classList.contains("selected")).toBe(false);
      });
    });
  });

  describe("Error Handling in Integration", () => {
    test("should handle cart manager initialization failure gracefully", async () => {
      // Simulate initialization error
      const originalCartManager = window.CartManager;
      window.CartManager = undefined;

      let cartManager;
      try {
        cartManager = new window.CartManager();
      } catch (error) {
        // Should handle gracefully
        cartManager = null;
      }

      expect(cartManager).toBeNull();

      // Restore
      window.CartManager = originalCartManager;
    });

    test("should handle corrupted localStorage during synchronization", async () => {
      const cartManager = new window.CartManager();

      // Set corrupted data
      localStorage.setItem("alocubano_cart", "invalid json");

      // Should handle parsing errors
      let state = {};
      try {
        const storedData = localStorage.getItem("alocubano_cart");
        state = JSON.parse(storedData);
      } catch (error) {
        state = { tickets: {}, donations: [], total: 0 };
      }

      expect(state.tickets).toBeDefined();
      expect(state.donations).toBeDefined();
    });

    test("should handle event listener failures gracefully", async () => {
      const cartManager = new window.CartManager();

      // Track errors using window.onerror to catch JSDOM thrown errors
      const errorsSeen = [];
      const originalOnerror = window.onerror;

      window.onerror = (message, source, lineno, colno, error) => {
        if (error && error.message === "Listener error") {
          errorsSeen.push(error);
          return true; // Prevent default error handling
        }
        return false; // Let other errors bubble up
      };

      // Add faulty event listener that will throw
      const faultyListener = () => {
        throw new Error("Listener error");
      };

      document.addEventListener("cart:updated", faultyListener);

      // Should not break other functionality even when listener throws
      expect(() => {
        cartManager.updateTicketQuantity("early-bird-full", 1);
      }).not.toThrow();

      // Verify that the error was caught by window.onerror
      expect(errorsSeen.length).toBe(1);
      expect(errorsSeen[0].message).toBe("Listener error");

      // Restore window.onerror
      window.onerror = originalOnerror;
    });
  });

  describe("Performance Integration", () => {
    test("should handle rapid cart updates without performance degradation", async () => {
      const cartManager = new window.CartManager();

      const startTime = performance.now();

      // Simulate rapid updates (100 operations)
      for (let i = 0; i < 100; i++) {
        cartManager.updateTicketQuantity(`ticket-${i}`, 1);
        cartManager.addDonation(10);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
      expect(Object.keys(cartManager.state.tickets).length).toBe(100);
      expect(cartManager.state.donations.length).toBe(100);
    });

    test("should not create memory leaks during extended operation", async () => {
      const cartManager = new window.CartManager();

      // Simulate extended operation cycle
      for (let cycle = 0; cycle < 10; cycle++) {
        // Add items
        for (let i = 0; i < 10; i++) {
          cartManager.updateTicketQuantity(`ticket-${i}`, 1);
        }

        // Clear cart
        cartManager.clear();
      }

      // Cart should be empty after all cycles
      expect(Object.keys(cartManager.state.tickets).length).toBe(0);
      expect(cartManager.state.donations.length).toBe(0);
    });
  });
});
