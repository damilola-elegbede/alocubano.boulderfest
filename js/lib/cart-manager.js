/**
 * Unified Cart Management System
 * Handles all cart operations across tickets and donations
 */
import { getAnalyticsTracker } from './analytics-tracker.js';

export class CartManager extends EventTarget {
    constructor() {
        super();
        this.state = {
            tickets: {},
            donations: {},
            metadata: {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                sessionId: this.generateSessionId()
            }
        };
        this.storageKey = 'alocubano_cart';
        this.initialized = false;
        this.isProcessing = false;
        this.analytics = getAnalyticsTracker();
    }

    // Core initialization
    async initialize() {
        if (this.initialized) {
            return;
        }

        // Load from localStorage
        this.loadFromStorage();

        // Setup event listeners
        this.setupEventListeners();

        // Validate cart contents
        await this.validateCart();

        this.initialized = true;
        this.analytics.track('payment_integration_initialized');
        this.emit('cart:initialized', this.getState());
    }

    // State management
    getState() {
        return {
            ...this.state,
            totals: this.calculateTotals(),
            isEmpty: this.isEmpty()
        };
    }

    // Ticket operations
    async addTicket(ticketData) {
        const { ticketType, price, name, eventId, quantity = 1 } = ticketData;

        if (!ticketType || !price || !name) {
            throw new Error('Invalid ticket data');
        }

        // Check if already processing
        if (this.isProcessing) {
            return false;
        }

        this.isProcessing = true;

        try {
            // Update state
            if (!this.state.tickets[ticketType]) {
                this.state.tickets[ticketType] = {
                    ticketType,
                    price,
                    name,
                    eventId,
                    quantity: 0,
                    addedAt: Date.now()
                };
            }

            this.state.tickets[ticketType].quantity += quantity;
            this.state.tickets[ticketType].updatedAt = Date.now();

            // Save and emit
            this.saveToStorage();

            // Track analytics
            this.analytics.trackCartEvent('ticket_added', {
                ticketType,
                quantity,
                price,
                total: this.state.tickets[ticketType].quantity * price
            });

            this.emit('cart:ticket:added', {
                ticketType,
                quantity,
                total: this.state.tickets[ticketType].quantity
            });
            this.emit('cart:updated', this.getState());

            return true;
        } finally {
            this.isProcessing = false;
        }
    }

    async removeTicket(ticketType) {
        if (this.state.tickets[ticketType]) {
            const ticket = this.state.tickets[ticketType];
            delete this.state.tickets[ticketType];
            this.saveToStorage();

            // Track analytics
            this.analytics.trackCartEvent('ticket_removed', {
                ticketType,
                quantity: ticket.quantity,
                price: ticket.price
            });

            this.emit('cart:ticket:removed', { ticketType });
            this.emit('cart:updated', this.getState());
        }
    }

    async updateTicketQuantity(ticketType, quantity) {
        if (this.state.tickets[ticketType]) {
            if (quantity <= 0) {
                await this.removeTicket(ticketType);
            } else {
                this.state.tickets[ticketType].quantity = quantity;
                this.state.tickets[ticketType].updatedAt = Date.now();
                this.saveToStorage();
                this.emit('cart:ticket:updated', { ticketType, quantity });
                this.emit('cart:updated', this.getState());
            }
        }
    }

    // Donation operations
    async updateDonation(amount) {
        if (amount < 0) {
            throw new Error('Invalid donation amount');
        }

        const oldAmount = this.state.donations.amount || 0;
        this.state.donations = {
            amount,
            updatedAt: Date.now()
        };

        this.saveToStorage();

        // Track analytics
        this.analytics.trackCartEvent('donation_updated', {
            oldAmount,
            newAmount: amount,
            difference: amount - oldAmount
        });

        this.emit('cart:donation:updated', {
            oldAmount,
            newAmount: amount
        });
        this.emit('cart:updated', this.getState());
    }

    // Cart calculations
    calculateTotals() {
        let ticketsTotal = 0;
        let ticketCount = 0;

        Object.values(this.state.tickets).forEach(ticket => {
            ticketsTotal += ticket.price * ticket.quantity;
            ticketCount += ticket.quantity;
        });

        const donationTotal = this.state.donations.amount || 0;

        return {
            tickets: ticketsTotal,
            donations: donationTotal,
            total: ticketsTotal + donationTotal,
            itemCount: ticketCount
        };
    }

    // Persistence
    saveToStorage() {
        try {
            this.state.metadata.updatedAt = Date.now();
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch {
            // Failed to save cart - continue silently
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Validate stored data
                if (this.isValidStoredCart(parsed)) {
                    this.state = parsed;
                }
            }
        } catch {
            // Failed to load cart - continue with empty state
        }
    }

    isValidStoredCart(data) {
        return data &&
               typeof data === 'object' &&
               data.metadata &&
               typeof data.tickets === 'object' &&
               typeof data.donations === 'object';
    }

    // Event handling
    setupEventListeners() {
        // Listen for storage changes from other tabs
        window.addEventListener('storage', (event) => {
            if (event.key === this.storageKey) {
                this.loadFromStorage();
                this.emit('cart:synced', this.getState());
            }
        });

        // Listen for beforeunload to save final state
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });
    }

    emit(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    // Validation
    async validateCart() {
        // Remove any invalid tickets
        for (const [ticketType, ticket] of Object.entries(this.state.tickets)) {
            if (!ticket.price || !ticket.name || ticket.quantity <= 0) {
                delete this.state.tickets[ticketType];
            }
        }

        // Validate donation amount
        if (this.state.donations.amount && this.state.donations.amount < 0) {
            this.state.donations = {};
        }

        // Save cleaned state
        this.saveToStorage();
    }

    // Utility methods
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    }

    isEmpty() {
        const hasTickets = Object.keys(this.state.tickets).length > 0;
        const hasDonation = this.state.donations.amount > 0;
        return !hasTickets && !hasDonation;
    }

    clear() {
        this.state = {
            tickets: {},
            donations: {},
            metadata: {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                sessionId: this.generateSessionId()
            }
        };
        this.saveToStorage();

        // Track analytics
        this.analytics.trackCartEvent('cart_cleared', {
            sessionId: this.state.metadata.sessionId
        });

        this.emit('cart:cleared');
        this.emit('cart:updated', this.getState());
    }

    // Debug methods
    getDebugInfo() {
        return {
            state: this.state,
            initialized: this.initialized,
            isProcessing: this.isProcessing,
            sessionId: this.state.metadata.sessionId,
            lastUpdated: new Date(this.state.metadata.updatedAt).toISOString()
        };
    }
}

// Singleton instance
let cartManagerInstance = null;

export function getCartManager() {
    if (!cartManagerInstance) {
        cartManagerInstance = new CartManager();
    }
    return cartManagerInstance;
}