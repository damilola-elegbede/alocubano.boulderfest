/**
 * Unified Cart Management System
 * Handles all cart operations across tickets and donations
 */
import { getAnalyticsTracker } from './analytics-tracker.js';

// Development-only logging utility
const devLog = {
    error: (message, ...args) => {
        if (
            typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.port === '3000' ||
        window.location.port === '8080' ||
        window.location.search.includes('debug=true') ||
        localStorage.getItem('dev_mode') === 'true')
        ) {
            // eslint-disable-next-line no-console
            console.error(message, ...args);
        }
    },
    log: (message, ...args) => {
        if (
            typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.port === '3000' ||
        window.location.port === '8080' ||
        window.location.search.includes('debug=true') ||
        localStorage.getItem('dev_mode') === 'true')
        ) {
            // eslint-disable-next-line no-console
            console.log(message, ...args);
        }
    },
    warn: (message, ...args) => {
        if (
            typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.port === '3000' ||
        window.location.port === '8080' ||
        window.location.search.includes('debug=true') ||
        localStorage.getItem('dev_mode') === 'true')
        ) {
            // eslint-disable-next-line no-console
            console.warn(message, ...args);
        }
    }
};

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
                devLog.error('Failed to write to localStorage:', error);
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
                sessionId: this.generateSessionId(),
                testMode: false
            }
        };
        this.storageKey = 'alocubano_cart';
        this.testStorageKey = 'alocubano_cart_test';
        this.initialized = false;
        this.operationQueue = [];
        this.isExecutingQueue = false;
        this.analytics = getAnalyticsTracker();
        this.storageCoordinator = new CartStorageCoordinator();
        this.testMode = this.detectTestMode();
    }

    // Test mode detection
    detectTestMode() {
        // Check for test mode in URL parameters
        if (typeof window !== 'undefined') {
            try {
                if (typeof URLSearchParams !== 'undefined') {
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('test_mode') === 'true') {
                        return true;
                    }
                }
            } catch (error) {
                // URLSearchParams not available or failed, continue with other checks
                devLog.warn('URLSearchParams not available for test mode detection:', error.message);
            }

            // Check for test mode in localStorage
            try {
                if (typeof localStorage !== 'undefined') {
                    if (localStorage.getItem('cart_test_mode') === 'true') {
                        return true;
                    }

                    // Check for admin test mode header/flag
                    if (localStorage.getItem('admin_test_session') === 'true') {
                        return true;
                    }
                }
            } catch (error) {
                // localStorage not available or failed, continue
                devLog.warn('localStorage not available for test mode detection:', error.message);
            }
        }

        return false;
    }

    // Core initialization
    async initialize() {
        if (this.initialized) {
            return;
        }

        // Update test mode state
        this.testMode = this.detectTestMode();
        this.state.metadata.testMode = this.testMode;

        // Load from localStorage
        this.loadFromStorage();

        // Setup event listeners
        this.setupEventListeners();

        // Validate cart contents
        await this.validateCart();

        this.initialized = true;
        this.analytics.track('payment_integration_initialized', {
            testMode: this.testMode
        });
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
            const { operationName, operation, resolve, reject } =
        this.operationQueue.shift();

            try {
                const result = await operation();
                resolve(result);
            } catch (error) {
                devLog.error(`Operation ${operationName} failed:`, error);
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
        const { ticketType, price, name, eventId, quantity = 1, isTestItem = false } = ticketData;

        if (!ticketType || !price || !name) {
            throw new Error('Invalid ticket data');
        }

        // CRITICAL FIX: Use operation queue instead of blocking lock
        return this.queueOperation('addTicket', async() => {
            // Determine if this is a test item
            const isTest = isTestItem || this.testMode;

            // Create ticket key with test prefix if needed
            const ticketKey = isTest ? `TEST-${ticketType}` : ticketType;

            // Update state
            if (!this.state.tickets[ticketKey]) {
                this.state.tickets[ticketKey] = {
                    ticketType: ticketKey,
                    originalTicketType: ticketType,
                    price,
                    name: isTest ? `TEST - ${name}` : name,
                    eventId,
                    quantity: 0,
                    addedAt: Date.now(),
                    isTestItem: isTest
                };
            }

            this.state.tickets[ticketKey].quantity += quantity;
            this.state.tickets[ticketKey].updatedAt = Date.now();

            // Update test mode state if this is a test item
            if (isTest) {
                this.state.metadata.testMode = true;
            }

            // Use coordinated storage write
            await this.saveToStorage();

            // Track analytics with test mode info
            this.analytics.trackCartEvent('ticket_added', {
                ticketType: ticketKey,
                originalTicketType: ticketType,
                quantity,
                price,
                total: this.state.tickets[ticketKey].quantity * price,
                isTestItem: isTest,
                testMode: this.testMode
            });

            // Emit events immediately
            this.emit('cart:ticket:added', {
                ticketType: ticketKey,
                originalTicketType: ticketType,
                quantity,
                total: this.state.tickets[ticketKey].quantity,
                isTestItem: isTest
            });
            this.emit('cart:updated', this.getState());

            return true;
        });
    }

    async removeTicket(ticketType) {
        if (this.state.tickets[ticketType]) {
            const ticket = this.state.tickets[ticketType];
            delete this.state.tickets[ticketType];
            await this.saveToStorage();

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
                await this.saveToStorage();
                this.emit('cart:ticket:updated', { ticketType, quantity });
                this.emit('cart:updated', this.getState());
            }
        }
    }

    // Upsert operation that combines add and update logic
    async upsertTicket(ticketData) {
        const { ticketType, price, name, eventId, quantity, isTestItem = false } = ticketData;

        if (!ticketType || !price || !name || quantity <= 0) {
            throw new Error('Invalid ticket data for upsert');
        }

        return this.queueOperation('upsertTicket', async() => {
            // Determine if this is a test item
            const isTest = isTestItem || this.testMode;
            const ticketKey = isTest ? `TEST-${ticketType}` : ticketType;

            // Update state - handles both new and existing tickets
            if (!this.state.tickets[ticketKey]) {
                // Add new ticket
                this.state.tickets[ticketKey] = {
                    ticketType: ticketKey,
                    originalTicketType: ticketType,
                    price,
                    name: isTest ? `TEST - ${name}` : name,
                    eventId,
                    quantity: 0,
                    addedAt: Date.now(),
                    isTestItem: isTest
                };
            }

            // Set the exact quantity (replaces current quantity)
            this.state.tickets[ticketKey].quantity = quantity;
            this.state.tickets[ticketKey].updatedAt = Date.now();

            // Update test mode state if this is a test item
            if (isTest) {
                this.state.metadata.testMode = true;
            }

            // Use coordinated storage write
            await this.saveToStorage();

            // Emit events using dual dispatch pattern
            this.emit('cart:ticket:updated', {
                ticketType: ticketKey,
                originalTicketType: ticketType,
                quantity,
                isTestItem: isTest
            });
            this.emit('cart:updated', this.getState());

            return this.state.tickets[ticketKey];
        });
    }

    // Donation operations
    async addDonation(amount, isTestItem = false) {
        if (amount <= 0) {
            throw new Error('Invalid donation amount');
        }

        // Determine if this is a test item
        const isTest = isTestItem || this.testMode;

        // Create new donation item
        const donationId = isTest
            ? `test_donation_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
            : `donation_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        const donation = {
            id: donationId,
            amount: amount,
            name: isTest ? 'TEST - Festival Support' : 'Festival Support',
            addedAt: Date.now(),
            isTestItem: isTest
        };

        this.state.donations.push(donation);

        // Update test mode state if this is a test item
        if (isTest) {
            this.state.metadata.testMode = true;
        }

        await this.saveToStorage();

        // Track analytics
        this.analytics.trackCartEvent('donation_added', {
            donationAmount: amount,
            donationId: donationId,
            isTestItem: isTest,
            testMode: this.testMode
        });

        this.emit('cart:donation:added', {
            donation,
            totalDonations: this.state.donations.length,
            isTestItem: isTest
        });
        this.emit('cart:updated', this.getState());
    }

    async removeDonation(donationId) {
        const donationIndex = this.state.donations.findIndex(
            (d) => d.id === donationId
        );

        if (donationIndex !== -1) {
            const donation = this.state.donations[donationIndex];
            this.state.donations.splice(donationIndex, 1);
            await this.saveToStorage();

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
            await this.saveToStorage();
            this.emit('cart:updated', this.getState());
        }
    }

    // Cart calculations
    calculateTotals() {
        let ticketsTotal = 0;
        let ticketCount = 0;

        Object.values(this.state.tickets).forEach((ticket) => {
            ticketsTotal += ticket.price * ticket.quantity;
            ticketCount += ticket.quantity;
        });

        const donationTotal = this.state.donations.reduce(
            (sum, donation) => sum + donation.amount,
            0
        );
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

        // Use appropriate storage key based on test mode
        const storageKey = this.testMode || this.state.metadata.testMode
            ? this.testStorageKey
            : this.storageKey;

        await this.storageCoordinator.write(storageKey, this.state);
    }

    loadFromStorage() {
        try {
            // Check test mode and load from appropriate storage
            const testMode = this.detectTestMode();
            const storageKey = testMode ? this.testStorageKey : this.storageKey;

            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);

                // Migrate old donation format if needed
                if (parsed.donations && !Array.isArray(parsed.donations)) {
                    devLog.log('Migrating old donation format to new array format');
                    if (parsed.donations.amount && parsed.donations.amount > 0) {
                        // Convert old single donation to array format
                        parsed.donations = [
                            {
                                id: `donation_${Date.now()}_migrated`,
                                amount: parsed.donations.amount,
                                name: 'Festival Support',
                                addedAt: parsed.donations.updatedAt || Date.now(),
                                isTestItem: false
                            }
                        ];
                    } else {
                        // No donation amount, use empty array
                        parsed.donations = [];
                    }
                }

                // Ensure metadata has testMode property
                if (parsed.metadata && typeof parsed.metadata.testMode === 'undefined') {
                    parsed.metadata.testMode = testMode;
                }

                // Validate and set stored data
                if (this.isValidStoredCart(parsed)) {
                    this.state = parsed;
                    this.testMode = this.state.metadata.testMode || testMode;
                }
            }
        } catch (error) {
            devLog.log('Failed to load cart from storage:', error);
            // Failed to load cart - continue with empty state
        }
    }

    isValidStoredCart(data) {
        return (
            data &&
      typeof data === 'object' &&
      data.metadata &&
      typeof data.tickets === 'object' &&
      Array.isArray(data.donations)
        );
    }

    // Event handling
    setupEventListeners() {
    // Listen for storage changes from other tabs
        window.addEventListener('storage', (event) => {
            if (event.key === this.storageKey || event.key === this.testStorageKey) {
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

        // Validate donations array - remove any with negative amounts
        if (Array.isArray(this.state.donations)) {
            this.state.donations = this.state.donations.filter((donation) => {
                return donation && typeof donation === 'object' && donation.amount > 0;
            });
        } else {
            // Ensure donations is always an array
            this.state.donations = [];
        }

        // Save cleaned state
        await this.saveToStorage();
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

    async clear() {
        this.state = {
            tickets: {},
            donations: [],
            metadata: {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                sessionId: this.generateSessionId()
            }
        };
        await this.saveToStorage();

        // Track analytics
        this.analytics.trackCartEvent('cart_cleared', {
            sessionId: this.state.metadata.sessionId
        });

        this.emit('cart:cleared');
        this.emit('cart:updated', this.getState());
    }

    // Test mode management
    async enableTestMode() {
        if (typeof window !== 'undefined') {
            localStorage.setItem('cart_test_mode', 'true');
        }
        this.testMode = true;
        this.state.metadata.testMode = true;
        await this.saveToStorage();
        this.emit('cart:test-mode:enabled');
        this.emit('cart:updated', this.getState());
    }

    async disableTestMode() {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('cart_test_mode');
        }
        this.testMode = false;
        this.state.metadata.testMode = false;
        await this.saveToStorage();
        this.emit('cart:test-mode:disabled');
        this.emit('cart:updated', this.getState());
    }

    isTestMode() {
        return this.testMode || this.state.metadata.testMode;
    }

    hasTestItems() {
        // Check if any tickets are test items
        const hasTestTickets = Object.values(this.state.tickets).some(
            ticket => ticket.isTestItem || ticket.ticketType.startsWith('TEST-')
        );

        // Check if any donations are test items
        const hasTestDonations = this.state.donations.some(
            donation => donation.isTestItem || donation.id.startsWith('test_')
        );

        return hasTestTickets || hasTestDonations;
    }

    async clearTestItems() {
        // Remove test tickets
        const testTicketKeys = Object.keys(this.state.tickets).filter(
            key => this.state.tickets[key].isTestItem || key.startsWith('TEST-')
        );

        testTicketKeys.forEach(key => {
            delete this.state.tickets[key];
        });

        // Remove test donations
        this.state.donations = this.state.donations.filter(
            donation => !donation.isTestItem && !donation.id.startsWith('test_')
        );

        // Update test mode if no test items remain
        if (!this.hasTestItems()) {
            this.state.metadata.testMode = false;
            this.testMode = false;
        }

        await this.saveToStorage();
        this.emit('cart:test-items:cleared');
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
            lastUpdated: new Date(this.state.metadata.updatedAt).toISOString(),
            testMode: this.testMode,
            hasTestItems: this.hasTestItems(),
            storageKey: this.testMode ? this.testStorageKey : this.storageKey
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
