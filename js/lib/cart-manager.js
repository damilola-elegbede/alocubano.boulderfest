/**
 * Unified Cart Management System
 * Handles all cart operations across tickets and donations
 */
import { getAnalyticsTracker } from './analytics-tracker.js';

// Storage Write Coordinator to prevent conflicts
class CartStorageCoordinator {
    constructor() {
        this.writeLock = false;
        this.pendingWrites = [];
    }

    async write(key, data) {
        return new Promise((resolve) => {
            if (this.writeLock) {
                this.pendingWrites.push({ key, data, resolve });
                return;
            }

            this.writeLock = true;

            try {
                localStorage.setItem(key, JSON.stringify(data));
                resolve();
            } catch (error) {
                console.error('Failed to write to localStorage:', error);
                resolve(); // Don't block on storage errors
            } finally {
                this.writeLock = false;
                this.processPendingWrites();
            }
        });
    }

    processPendingWrites() {
        if (this.pendingWrites.length > 0) {
            const { key, data, resolve } = this.pendingWrites.shift();
            this.write(key, data).then(resolve);
        }
    }
}

export class CartManager extends EventTarget {
    constructor() {
        super();
        this.state = {
            tickets: {},
            donations: [],
            metadata: {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                sessionId: this.generateSessionId()
            }
        };
        this.storageKey = 'alocubano_cart';
        this.initialized = false;
        this.operationQueue = [];
        this.isExecutingQueue = false;
        this.analytics = getAnalyticsTracker();
        this.storageCoordinator = new CartStorageCoordinator();
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

    // Operation Queue Management
    async queueOperation(operationName, operation) {
        return new Promise((resolve, reject) => {
            this.operationQueue.push({ operationName, operation, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isExecutingQueue || this.operationQueue.length === 0) {
            return;
        }

        this.isExecutingQueue = true;

        while (this.operationQueue.length > 0) {
            const { operationName, operation, resolve, reject } = this.operationQueue.shift();

            try {
                const result = await operation();
                resolve(result);
            } catch (error) {
                console.error(`Operation ${operationName} failed:`, error);
                reject(error);
            }
        }

        this.isExecutingQueue = false;
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

        // CRITICAL FIX: Use operation queue instead of blocking lock
        return this.queueOperation('addTicket', async() => {
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

            // Use coordinated storage write
            await this.saveToStorage();

            // Track analytics
            this.analytics.trackCartEvent('ticket_added', {
                ticketType,
                quantity,
                price,
                total: this.state.tickets[ticketType].quantity * price
            });

            // Emit events immediately
            this.emit('cart:ticket:added', {
                ticketType,
                quantity,
                total: this.state.tickets[ticketType].quantity
            });
            this.emit('cart:updated', this.getState());

            return true;
        });
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
    async addDonation(amount) {
        if (amount <= 0) {
            throw new Error('Invalid donation amount');
        }

        // Create new donation item
        const donationId = `donation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const donation = {
            id: donationId,
            amount: amount,
            name: 'Festival Support',
            addedAt: Date.now()
        };

        this.state.donations.push(donation);
        this.saveToStorage();

        // Track analytics
        this.analytics.trackCartEvent('donation_added', {
            donationAmount: amount,
            donationId: donationId
        });

        this.emit('cart:donation:added', {
            donation,
            totalDonations: this.state.donations.length
        });
        this.emit('cart:updated', this.getState());
    }

    async removeDonation(donationId) {
        const donationIndex = this.state.donations.findIndex(d => d.id === donationId);

        if (donationIndex !== -1) {
            const donation = this.state.donations[donationIndex];
            this.state.donations.splice(donationIndex, 1);
            this.saveToStorage();

            // Track analytics
            this.analytics.trackCartEvent('donation_removed', {
                donationAmount: donation.amount,
                donationId: donationId
            });

            this.emit('cart:donation:removed', { donationId });
            this.emit('cart:updated', this.getState());
        }
    }

    async updateDonation(amount) {
        // Kept for backward compatibility, but now clears all donations and adds one
        if (amount < 0) {
            throw new Error('Invalid donation amount');
        }

        this.state.donations = [];
        if (amount > 0) {
            await this.addDonation(amount);
        } else {
            this.saveToStorage();
            this.emit('cart:updated', this.getState());
        }
    }

    // Cart calculations
    calculateTotals() {
        let ticketsTotal = 0;
        let ticketCount = 0;

        Object.values(this.state.tickets).forEach(ticket => {
            ticketsTotal += ticket.price * ticket.quantity;
            ticketCount += ticket.quantity;
        });

        const donationTotal = this.state.donations.reduce((sum, donation) => sum + donation.amount, 0);
        const donationCount = this.state.donations.length;

        return {
            tickets: ticketsTotal,
            donations: donationTotal,
            total: ticketsTotal + donationTotal,
            itemCount: ticketCount,
            donationCount: donationCount
        };
    }

    // Persistence
    async saveToStorage() {
        this.state.metadata.updatedAt = Date.now();
        await this.storageCoordinator.write(this.storageKey, this.state);
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);

                // Migrate old donation format if needed
                if (parsed.donations && !Array.isArray(parsed.donations)) {
                    console.log('Migrating old donation format to new array format');
                    if (parsed.donations.amount && parsed.donations.amount > 0) {
                        // Convert old single donation to array format
                        parsed.donations = [{
                            id: `donation_${Date.now()}_migrated`,
                            amount: parsed.donations.amount,
                            name: 'Festival Support',
                            addedAt: parsed.donations.updatedAt || Date.now()
                        }];
                    } else {
                        // No donation amount, use empty array
                        parsed.donations = [];
                    }
                }

                // Validate and set stored data
                if (this.isValidStoredCart(parsed)) {
                    this.state = parsed;
                }
            }
        } catch (error) {
            console.log('Failed to load cart from storage:', error);
            // Failed to load cart - continue with empty state
        }
    }

    isValidStoredCart(data) {
        return data &&
               typeof data === 'object' &&
               data.metadata &&
               typeof data.tickets === 'object' &&
               Array.isArray(data.donations);
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
        // Dispatch on CartManager instance (for direct listeners)
        this.dispatchEvent(new CustomEvent(eventName, { detail }));

        // CRITICAL FIX: Also dispatch on document for cross-component communication
        document.dispatchEvent(new CustomEvent(eventName, { detail }));
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
        const hasDonations = this.state.donations.length > 0;
        return !hasTickets && !hasDonations;
    }

    clear() {
        this.state = {
            tickets: {},
            donations: [],
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
            queueLength: this.operationQueue.length,
            isExecutingQueue: this.isExecutingQueue,
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