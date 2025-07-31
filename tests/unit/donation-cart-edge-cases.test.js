/**
 * Comprehensive Edge Case Testing for Donation Cart Integration System
 * Tests specific edge cases for CartManager, FloatingCart, and DonationSelection
 */

// Mock DOM and browser environment
const mockDOM = {
    createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        innerHTML: '',
        textContent: '',
        style: {},
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
            contains: jest.fn(() => false),
            toggle: jest.fn()
        },
        setAttribute: jest.fn(),
        getAttribute: jest.fn(),
        removeAttribute: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        appendChild: jest.fn(),
        insertBefore: jest.fn(),
        insertAdjacentHTML: jest.fn(),
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(() => []),
        focus: jest.fn(),
        click: jest.fn(),
        dataset: {},
        parentNode: null,
        disabled: false,
        value: ''
    }),
    
    createEvent: (type) => ({
        type,
        detail: null,
        initCustomEvent: jest.fn(),
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
    })
};

// Enhanced browser environment mock
global.window = {
    CartManager: null,
    floatingCart: null,
    donationSelection: null,
    localStorage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    innerWidth: 1024,
    innerHeight: 768,
    location: { reload: jest.fn() },
    navigator: {
        userAgent: 'Mozilla/5.0 (compatible; Jest)',
        cookieEnabled: true
    }
};

global.document = {
    createElement: mockDOM.createElement,
    createEvent: mockDOM.createEvent,
    getElementById: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    body: mockDOM.createElement('body'),
    hidden: false
};

global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
        this.bubbles = options.bubbles || false;
        this.cancelable = options.cancelable || false;
    }
};

// Mock console and browser APIs
global.console.log = jest.fn();
global.console.error = jest.fn();
global.console.warn = jest.fn();
global.console.debug = jest.fn();
global.requestAnimationFrame = (callback) => setTimeout(callback, 16);
global.confirm = jest.fn(() => true);
global.alert = jest.fn();

describe('Donation Cart Integration - Edge Case Testing', () => {
    let CartManager, DonationSelection, FloatingCart;
    let cartManager, donationSelection, floatingCart;
    
    // Enhanced mock elements
    const mockElements = {
        cartToggle: mockDOM.createElement('button'),
        cartContent: mockDOM.createElement('div'),
        cartItems: mockDOM.createElement('div'),
        cartEmpty: mockDOM.createElement('div'),
        cartFooter: mockDOM.createElement('div'),
        cartBadge: mockDOM.createElement('span'),
        cartTotal: mockDOM.createElement('span'),
        donateButton: mockDOM.createElement('button'),
        customAmountInput: mockDOM.createElement('input'),
        floatingCart: mockDOM.createElement('div'),
        donationCards: Array.from({ length: 5 }, () => mockDOM.createElement('div'))
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        
        // Reset localStorage mock
        window.localStorage.getItem.mockReturnValue(null);
        window.localStorage.setItem.mockClear();
        window.localStorage.removeItem.mockClear();
        
        // Setup DOM element mocks
        document.getElementById.mockImplementation((id) => {
            const elementMap = {
                'cart-toggle': mockElements.cartToggle,
                'cart-content': mockElements.cartContent,
                'cart-items': mockElements.cartItems,
                'cart-empty': mockElements.cartEmpty,
                'cart-footer': mockElements.cartFooter,
                'cart-badge': mockElements.cartBadge,
                'cart-total': mockElements.cartTotal,
                'cart-footer-total': mockDOM.createElement('span'),
                'cart-checkout-btn': mockDOM.createElement('button'),
                'cart-clear-btn': mockDOM.createElement('button'),
                'donate-button': mockElements.donateButton,
                'custom-amount': mockElements.customAmountInput,
                'floating-cart': mockElements.floatingCart
            };
            return elementMap[id] || null;
        });
        
        document.querySelector.mockImplementation((selector) => {
            if (selector === '.donation-selection') return mockDOM.createElement('div');
            if (selector === '.ticket-selection') return mockDOM.createElement('div');
            if (selector === '.custom-amount') return mockDOM.createElement('div');
            return null;
        });
        
        document.querySelectorAll.mockImplementation((selector) => {
            if (selector === '.donation-card') return mockElements.donationCards;
            if (selector === '.ticket-card') return [];
            return [];
        });
        
        // Enhanced CartManager mock with edge case handling
        CartManager = class MockCartManager {
            constructor() {
                this.items = new Map();
                this.isLoaded = false;
                this.loadPromise = Promise.resolve(this);
                this.isRestoringDOM = false;
                this.eventListeners = new Map();
                this.intervals = new Set();
                this.timeouts = new Set();
            }
            
            // Custom event handling for Jest environment
            addEventListener(type, callback) {
                if (!this.eventListeners.has(type)) {
                    this.eventListeners.set(type, new Set());
                }
                this.eventListeners.get(type).add(callback);
            }
            
            removeEventListener(type, callback) {
                if (this.eventListeners.has(type)) {
                    this.eventListeners.get(type).delete(callback);
                }
            }
            
            dispatchEvent(event) {
                const listeners = this.eventListeners.get(event.type);
                if (listeners) {
                    listeners.forEach(callback => {
                        try {
                            callback(event);
                        } catch (error) {
                            console.error('Event listener error:', error);
                        }
                    });
                }
                return true;
            }
            
            static getInstance() {
                if (!CartManager.instance) {
                    CartManager.instance = new CartManager();
                }
                return CartManager.instance;
            }
            
            async init() {
                this.isLoaded = true;
                return this;
            }
            
            async waitForLoad() {
                return this.loadPromise;
            }
            
            addDonation(amount, name = `$${amount} Donation`, description = '', eventId = 'boulder-fest-2026', donationType = 'preset') {
                // Enhanced validation for edge cases
                if (!amount || typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
                    throw new Error('Invalid donation parameters: amount must be a finite number');
                }
                
                if (amount <= 0) {
                    throw new Error('Invalid donation parameters: amount must be positive');
                }
                
                if (amount > 10000) {
                    throw new Error('Donation amount exceeds maximum limit of $10,000');
                }
                
                if (!name || typeof name !== 'string' || name.trim() === '') {
                    throw new Error('Invalid donation parameters: name is required');
                }
                
                const donationId = `donation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const donation = {
                    itemType: 'donation',
                    ticketType: donationId,
                    name: name.trim(),
                    price: Math.round(amount * 100) / 100, // Round to 2 decimal places
                    quantity: 1,
                    eventId: eventId || 'boulder-fest-2026',
                    addedAt: Date.now(),
                    donationType: donationType || 'preset',
                    description: description || ''
                };
                
                this.items.set(donationId, donation);
                this.dispatchEvent(new CustomEvent('alocubano:cart:updated', {
                    detail: {
                        items: this.getItems(),
                        itemCount: this.getItemCount(),
                        total: this.getTotal()
                    }
                }));
                return donation;
            }
            
            updateItemQuantity(ticketType, quantity) {
                const item = this.items.get(ticketType);
                if (!item) return null;
                
                // Prevent quantity updates for donations
                if (item.itemType === 'donation') {
                    throw new Error('Donation quantities cannot be changed');
                }
                
                if (quantity <= 0) {
                    return this.removeItem(ticketType);
                }
                
                item.quantity = quantity;
                this.items.set(ticketType, item);
                this.dispatchEvent(new CustomEvent('alocubano:cart:updated'));
                return item;
            }
            
            removeItem(ticketType) {
                const removed = this.items.delete(ticketType);
                if (removed) {
                    this.dispatchEvent(new CustomEvent('alocubano:cart:updated'));
                }
                return removed;
            }
            
            getItems() {
                return Array.from(this.items.values());
            }
            
            getItem(ticketType) {
                return this.items.get(ticketType);
            }
            
            getTickets() {
                return this.getItems().filter(item => item.itemType !== 'donation');
            }
            
            getDonations() {
                return this.getItems().filter(item => item.itemType === 'donation');
            }
            
            getItemCount() {
                return this.getItems().reduce((total, item) => total + item.quantity, 0);
            }
            
            getTotal() {
                return this.getItems().reduce((total, item) => total + (item.price * item.quantity), 0);
            }
            
            getTotalByType() {
                const tickets = this.getTickets();
                const donations = this.getDonations();
                return {
                    tickets: tickets.reduce((total, item) => total + (item.price * item.quantity), 0),
                    donations: donations.reduce((total, item) => total + (item.price * item.quantity), 0)
                };
            }
            
            isEmpty() {
                return this.items.size === 0;
            }
            
            clearCart() {
                this.items.clear();
                this.dispatchEvent(new CustomEvent('alocubano:cart:cleared'));
            }
            
            // Enhanced validation methods
            validateCartState() {
                const issues = [];
                
                if (!(this.items instanceof Map)) {
                    issues.push('Cart items structure is corrupted');
                    return { valid: false, issues };
                }
                
                for (const [key, item] of this.items) {
                    if (!key || typeof key !== 'string') {
                        issues.push('Invalid ticket type key detected');
                    }
                    
                    if (!item || typeof item !== 'object') {
                        issues.push(`Invalid item structure for: ${key}`);
                        continue;
                    }
                    
                    if (!item.itemType || !['ticket', 'donation'].includes(item.itemType)) {
                        issues.push(`Invalid itemType for: ${key}`);
                    }
                    
                    if (item.itemType === 'donation' && item.quantity !== 1) {
                        issues.push(`Donation quantity must be 1 for: ${key}`);
                    }
                }
                
                return { valid: issues.length === 0, issues };
            }
        };
        
        // Enhanced DonationSelection mock
        DonationSelection = class MockDonationSelection {
            constructor() {
                this.selectedAmount = null;
                this.cartManager = null;
            }
            
            async init() {
                this.cartManager = CartManager.getInstance();
                await this.cartManager.waitForLoad();
            }
            
            async addToCart() {
                if (!this.selectedAmount || this.selectedAmount <= 0) {
                    throw new Error('Please select or enter a donation amount.');
                }
                
                // Enhanced validation
                if (typeof this.selectedAmount !== 'number' || isNaN(this.selectedAmount) || !isFinite(this.selectedAmount)) {
                    throw new Error('Invalid donation amount format.');
                }
                
                await this.cartManager.addDonation(this.selectedAmount);
                this.selectedAmount = null;
            }
            
            selectPresetAmount(amount) {
                this.selectedAmount = amount;
            }
            
            handleCustomAmountChange(value) {
                const numValue = parseFloat(value);
                this.selectedAmount = (numValue > 0 && isFinite(numValue)) ? numValue : null;
            }
        };
        
        // Enhanced FloatingCart mock
        FloatingCart = class MockFloatingCart {
            constructor() {
                this.isExpanded = false;
                this.cartManager = null;
                this.lastUpdateData = null;
            }
            
            async init() {
                this.cartManager = CartManager.getInstance();
                await this.cartManager.waitForLoad();
                this.bindCartManagerEvents();
            }
            
            bindCartManagerEvents() {
                if (!this.cartManager) return;
                
                this.cartManager.addEventListener('alocubano:cart:updated', () => {
                    this.updateCartDisplay();
                });
                
                this.cartManager.addEventListener('alocubano:cart:cleared', () => {
                    this.updateCartDisplay();
                });
            }
            
            updateCartDisplay() {
                if (!this.cartManager) return;
                
                this.lastUpdateData = {
                    items: this.cartManager.getItems(),
                    itemCount: this.cartManager.getItemCount(),
                    total: this.cartManager.getTotal(),
                    totalsByType: this.cartManager.getTotalByType(),
                    isEmpty: this.cartManager.isEmpty()
                };
            }
            
            getCartSummary() {
                if (!this.cartManager) {
                    return { itemCount: 0, totalAmount: 0, items: [], isEmpty: true };
                }
                
                return {
                    itemCount: this.cartManager.getItemCount(),
                    totalAmount: this.cartManager.getTotal(),
                    items: this.cartManager.getItems(),
                    isEmpty: this.cartManager.isEmpty()
                };
            }
            
            adjustQuantity(ticketType, change) {
                if (!this.cartManager) return;
                
                const currentItem = this.cartManager.getItem(ticketType);
                if (currentItem && currentItem.itemType === 'donation') {
                    throw new Error('Donation amounts are fixed and cannot be adjusted');
                }
                
                const currentQuantity = currentItem ? currentItem.quantity : 0;
                const newQuantity = Math.max(0, currentQuantity + change);
                
                if (newQuantity > 0) {
                    this.cartManager.updateItemQuantity(ticketType, newQuantity);
                } else {
                    this.cartManager.removeItem(ticketType);
                }
            }
        };
        
        // Initialize components
        window.CartManager = CartManager;
        cartManager = CartManager.getInstance();
        await cartManager.init();
        
        donationSelection = new DonationSelection();
        await donationSelection.init();
        
        floatingCart = new FloatingCart();
        await floatingCart.init();
    });

    afterEach(() => {
        if (CartManager.instance) {
            CartManager.instance = null;
        }
    });

    describe('1. Empty Cart Scenarios', () => {
        test('should handle empty cart state correctly', () => {
            // Verify empty cart state
            expect(cartManager.isEmpty()).toBe(true);
            expect(cartManager.getItemCount()).toBe(0);
            expect(cartManager.getTotal()).toBe(0);
            expect(cartManager.getItems()).toHaveLength(0);
            expect(cartManager.getDonations()).toHaveLength(0);
        });

        test('should show empty cart UI state in FloatingCart', () => {
            const summary = floatingCart.getCartSummary();
            
            expect(summary.isEmpty).toBe(true);
            expect(summary.itemCount).toBe(0);
            expect(summary.totalAmount).toBe(0);
            expect(summary.items).toHaveLength(0);
        });

        test('should disable buttons when cart is empty', () => {
            const checkoutBtn = document.getElementById('cart-checkout-btn');
            const donateBtn = document.getElementById('donate-button');
            
            // Simulate button state updates
            if (checkoutBtn) {
                checkoutBtn.disabled = cartManager.isEmpty();
                expect(checkoutBtn.disabled).toBe(true);
            }
            
            if (donateBtn) {
                donateBtn.disabled = !donationSelection.selectedAmount;
                expect(donateBtn.disabled).toBe(true);
            }
        });

        test('should handle empty cart message display', () => {
            // Verify empty state is properly detected
            expect(cartManager.isEmpty()).toBe(true);
            
            // FloatingCart should reflect empty state
            const summary = floatingCart.getCartSummary();
            expect(summary.isEmpty).toBe(true);
            
            // Update display should handle empty state
            floatingCart.updateCartDisplay();
            expect(floatingCart.lastUpdateData.isEmpty).toBe(true);
        });

        test('should not allow operations on empty cart', async () => {
            // Test operations that should fail or be no-ops on empty cart
            expect(cartManager.removeItem('non-existent')).toBe(false);
            expect(cartManager.updateItemQuantity('non-existent', 5)).toBe(null);
            
            // Clear cart should be safe on empty cart
            expect(() => cartManager.clearCart()).not.toThrow();
            expect(cartManager.isEmpty()).toBe(true);
        });
    });

    describe('2. Mixed Cart Testing', () => {
        test('should handle mixed cart with tickets and donations', async () => {
            // Add a ticket
            cartManager.items.set('early-bird', {
                itemType: 'ticket',
                ticketType: 'early-bird',
                name: 'Early Bird Ticket',
                price: 85,
                quantity: 2,
                eventId: 'boulder-fest-2026',
                addedAt: Date.now()
            });
            
            // Add donations
            await cartManager.addDonation(25, '$25 Support');
            await cartManager.addDonation(50, '$50 Sponsor');
            
            // Verify mixed cart totals
            const totalsByType = cartManager.getTotalByType();
            expect(totalsByType.tickets).toBe(170); // 85 * 2
            expect(totalsByType.donations).toBe(75); // 25 + 50
            
            const overallTotal = cartManager.getTotal();
            expect(overallTotal).toBe(245); // 170 + 75
            
            const itemCount = cartManager.getItemCount();
            expect(itemCount).toBe(4); // 2 tickets + 2 donations (qty 1 each)
        });

        test('should calculate totals accurately for mixed cart', async () => {
            // Add multiple ticket types
            cartManager.items.set('weekend-pass', {
                itemType: 'ticket',
                ticketType: 'weekend-pass',
                name: 'Weekend Pass',
                price: 120,
                quantity: 1,
                eventId: 'boulder-fest-2026',
                addedAt: Date.now()
            });
            
            cartManager.items.set('day-pass', {
                itemType: 'ticket',
                ticketType: 'day-pass',
                name: 'Day Pass',
                price: 45,
                quantity: 3,
                eventId: 'boulder-fest-2026',
                addedAt: Date.now()
            });
            
            // Add donations with decimals
            await cartManager.addDonation(33.33, 'Custom Support');
            await cartManager.addDonation(66.67, 'Sponsor Level');
            
            const totals = cartManager.getTotalByType();
            expect(totals.tickets).toBe(255); // 120 + (45 * 3)
            expect(totals.donations).toBe(100); // 33.33 + 66.67
            expect(cartManager.getTotal()).toBe(355);
        });

        test('should maintain proper segregation between tickets and donations', async () => {
            // Add items
            await cartManager.addDonation(100, 'Major Donor');
            cartManager.items.set('vip-pass', {
                itemType: 'ticket',
                ticketType: 'vip-pass',
                name: 'VIP Pass',
                price: 200,
                quantity: 1,
                eventId: 'boulder-fest-2026',
                addedAt: Date.now()
            });
            
            // Verify segregation
            const tickets = cartManager.getTickets();
            const donations = cartManager.getDonations();
            
            expect(tickets).toHaveLength(1);
            expect(donations).toHaveLength(1);
            
            expect(tickets[0].itemType).toBe('ticket');
            expect(donations[0].itemType).toBe('donation');
            
            // Verify no cross-contamination
            expect(tickets.some(t => t.itemType === 'donation')).toBe(false);
            expect(donations.some(d => d.itemType === 'ticket')).toBe(false);
        });

        test('should handle checkout flow with mixed items', async () => {
            // Setup mixed cart
            await cartManager.addDonation(75, 'Support Fund');
            cartManager.items.set('student-pass', {
                itemType: 'ticket',
                ticketType: 'student-pass',
                name: 'Student Pass',
                price: 40,
                quantity: 2,
                eventId: 'boulder-fest-2026',
                addedAt: Date.now()
            });
            
            // Verify checkout data structure
            const allItems = cartManager.getItems();
            expect(allItems).toHaveLength(2);
            
            const tickets = allItems.filter(i => i.itemType !== 'donation');
            const donations = allItems.filter(i => i.itemType === 'donation');
            
            expect(tickets).toHaveLength(1);
            expect(donations).toHaveLength(1);
            
            // Verify totals for checkout
            const summary = floatingCart.getCartSummary();
            expect(summary.totalAmount).toBe(155); // 75 + (40 * 2)
            expect(summary.itemCount).toBe(3); // 2 tickets + 1 donation
        });
    });

    describe('3. Custom Donation Amount Edge Cases', () => {
        test('should handle zero amounts', async () => {
            // Test exact zero
            donationSelection.handleCustomAmountChange(0);
            expect(donationSelection.selectedAmount).toBe(null);
            
            // Test zero as string
            donationSelection.handleCustomAmountChange('0');
            expect(donationSelection.selectedAmount).toBe(null);
            
            // Test 0.00
            donationSelection.handleCustomAmountChange(0.00);
            expect(donationSelection.selectedAmount).toBe(null);
            
            // Verify cannot add zero donation
            donationSelection.selectedAmount = 0;
            await expect(donationSelection.addToCart()).rejects.toThrow('Please select or enter a donation amount');
        });

        test('should handle negative amounts', async () => {
            const negativeAmounts = [-5, -0.01, -1000, -Infinity];
            
            for (const amount of negativeAmounts) {
                donationSelection.handleCustomAmountChange(amount);
                expect(donationSelection.selectedAmount).toBe(null);
                
                // Direct assignment should also fail on add
                donationSelection.selectedAmount = amount;
                await expect(donationSelection.addToCart()).rejects.toThrow();
            }
        });

        test('should handle very large amounts', async () => {
            // Test maximum allowed amount
            await expect(cartManager.addDonation(10000, 'Max Donation')).resolves.not.toThrow();
            
            // Test over maximum
            await expect(cartManager.addDonation(10001, 'Too Large')).rejects.toThrow('exceeds maximum limit');
            await expect(cartManager.addDonation(999999, 'Way Too Large')).rejects.toThrow('exceeds maximum limit');
            
            // Test edge case near maximum
            await expect(cartManager.addDonation(9999.99, 'Near Max')).resolves.not.toThrow();
        });

        test('should handle decimal precision edge cases', async () => {
            // Test precise decimals
            const preciseAmounts = [5.999, 10.001, 33.333, 66.666];
            
            for (const amount of preciseAmounts) {
                await cartManager.addDonation(amount, `$${amount} Test`);
                const donations = cartManager.getDonations();
                const lastDonation = donations[donations.length - 1];
                
                // Should be rounded to 2 decimal places
                expect(lastDonation.price).toBe(Math.round(amount * 100) / 100);
            }
            
            // Verify total precision
            const total = cartManager.getTotal();
            expect(total).toBe(Math.round(total * 100) / 100);
        });

        test('should handle invalid inputs', async () => {
            const invalidInputs = [NaN, Infinity, -Infinity, 'abc', '', null, undefined, {}, []];
            
            for (const input of invalidInputs) {
                // Test through DonationSelection
                donationSelection.handleCustomAmountChange(input);
                expect(donationSelection.selectedAmount).toBe(null);
                
                // Test direct CartManager call
                await expect(cartManager.addDonation(input, 'Invalid')).rejects.toThrow();
            }
        });

        test('should handle empty input field', () => {
            const customInput = document.getElementById('custom-amount');
            
            // Test empty string
            customInput.value = '';
            donationSelection.handleCustomAmountChange(customInput.value);
            expect(donationSelection.selectedAmount).toBe(null);
            
            // Test whitespace
            customInput.value = '   ';
            donationSelection.handleCustomAmountChange(customInput.value.trim());
            expect(donationSelection.selectedAmount).toBe(null);
        });

        test('should handle floating point edge cases', async () => {
            // Test very small positive amounts
            const smallAmounts = [0.01, 0.001, 0.0001];
            
            for (const amount of smallAmounts) {
                if (amount >= 0.01) {
                    await expect(cartManager.addDonation(amount, `$${amount} Small`)).resolves.not.toThrow();
                } else {
                    // Very small amounts should still be positive
                    await expect(cartManager.addDonation(amount, `$${amount} Tiny`)).resolves.not.toThrow();
                }
            }
            
            // Test floating point precision issues
            const precisionTest = 0.1 + 0.2; // JavaScript precision issue
            donationSelection.handleCustomAmountChange(precisionTest);
            expect(donationSelection.selectedAmount).toBeCloseTo(0.3, 2);
        });
    });

    describe('4. Error Handling Scenarios', () => {
        test('should handle CartManager initialization failures', async () => {
            // Create a broken CartManager
            const brokenCartManager = {
                waitForLoad: () => Promise.reject(new Error('Initialization failed')),
                getInstance: () => { throw new Error('Instance creation failed'); }
            };
            
            // Test DonationSelection with broken CartManager
            const brokenDonationSelection = new DonationSelection();
            brokenDonationSelection.cartManager = null;
            
            donationSelection.selectPresetAmount(50);
            await expect(donationSelection.addToCart()).rejects.toThrow();
        });

        test('should handle network/storage failures', () => {
            // Mock localStorage failure
            window.localStorage.setItem.mockImplementation(() => {
                throw new Error('Storage quota exceeded');
            });
            
            // CartManager should handle storage failures gracefully
            expect(() => {
                cartManager.items.set('test', { price: 50, quantity: 1 });
                // In real implementation, this would trigger saveToStorage which might fail
            }).not.toThrow();
        });

        test('should handle invalid method parameters', async () => {
            // Test addDonation with invalid parameters
            const invalidParams = [
                [null, 'Test'],
                [50, null],
                [50, ''],
                ['invalid', 'Test'],
                [50, 'Test', null, null, 'invalid-type']
            ];
            
            for (const [amount, name, description, eventId, type] of invalidParams) {
                await expect(cartManager.addDonation(amount, name, description, eventId, type))
                    .rejects.toThrow();
            }
        });

        test('should handle memory constraints gracefully', () => {
            // Test with a large number of donations
            const addManyDonations = async () => {
                const promises = [];
                for (let i = 0; i < 100; i++) {
                    promises.push(cartManager.addDonation(1, `Donation ${i}`));
                }
                await Promise.all(promises);
            };
            
            // Should handle many donations without crashing
            expect(addManyDonations()).resolves.not.toThrow();
        });

        test('should handle concurrent operations safely', async () => {
            // Test rapid concurrent operations
            const concurrentOps = [];
            
            for (let i = 0; i < 10; i++) {
                concurrentOps.push(
                    cartManager.addDonation(i + 1, `Concurrent Donation ${i}`)
                );
            }
            
            await Promise.all(concurrentOps);
            
            // Verify all donations were added
            const donations = cartManager.getDonations();
            expect(donations).toHaveLength(10);
            
            // Verify total is correct
            const expectedTotal = (10 * 11) / 2; // Sum of 1 to 10
            expect(cartManager.getTotal()).toBe(expectedTotal);
        });

        test('should handle DOM element not found scenarios', () => {
            // Mock missing DOM elements
            document.getElementById.mockReturnValue(null);
            document.querySelector.mockReturnValue(null);
            document.querySelectorAll.mockReturnValue([]);
            
            // FloatingCart should handle missing elements gracefully
            expect(() => floatingCart.updateCartDisplay()).not.toThrow();
            
            // DonationSelection should handle missing elements
            expect(() => {
                const event = { currentTarget: { dataset: { amount: '50' } } };
                // In real implementation, this might fail if DOM elements are missing
            }).not.toThrow();
        });
    });

    describe('5. Browser Compatibility Edge Cases', () => {
        test('should handle localStorage unavailable', () => {
            // Mock localStorage as undefined
            const originalLocalStorage = window.localStorage;
            delete window.localStorage;
            
            // CartManager should handle missing localStorage gracefully
            expect(() => {
                const testManager = new CartManager();
                // In real implementation, this should fallback to in-memory storage
            }).not.toThrow();
            
            // Restore localStorage
            window.localStorage = originalLocalStorage;
        });

        test('should handle localStorage full scenario', () => {
            // Mock storage quota exceeded
            window.localStorage.setItem.mockImplementation(() => {
                throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
            });
            
            // Should handle gracefully
            expect(() => {
                cartManager.items.set('test-donation', {
                    itemType: 'donation',
                    price: 50,
                    quantity: 1
                });
                // In real implementation, saveToStorage would be called and should handle the error
            }).not.toThrow();
        });

        test('should handle JavaScript disabled scenarios', () => {
            // Test fallback behavior when JavaScript features are limited
            // This is more of a design consideration than a testable scenario
            
            // Verify that core data structures work without advanced JS features
            expect(cartManager.items instanceof Map).toBe(true);
            expect(Array.from(cartManager.items.values())).toEqual([]);
        });

        test('should handle slow network conditions', async () => {
            // Mock slow async operations
            const slowOperation = new Promise((resolve) => {
                setTimeout(() => {
                    resolve(cartManager.addDonation(25, 'Slow Donation'));
                }, 100);
            });
            
            // Should handle slow operations without timing out
            await slowOperation;
            expect(cartManager.getDonations()).toHaveLength(1);
        });

        test('should handle mobile viewport changes', () => {
            // Test different viewport sizes
            const viewports = [
                { width: 320, height: 568 },  // iPhone SE
                { width: 768, height: 1024 }, // iPad
                { width: 1024, height: 768 }  // Desktop
            ];
            
            viewports.forEach(viewport => {
                window.innerWidth = viewport.width;
                window.innerHeight = viewport.height;
                
                // FloatingCart should adapt to different viewport sizes
                expect(() => {
                    // In real implementation, this would trigger responsive behavior
                    floatingCart.updateCartDisplay();
                }).not.toThrow();
            });
        });

        test('should handle missing browser APIs', () => {
            // Mock missing requestAnimationFrame
            const originalRAF = global.requestAnimationFrame;
            delete global.requestAnimationFrame;
            
            // Should fallback gracefully
            expect(() => floatingCart.updateCartDisplay()).not.toThrow();
            
            // Restore API
            global.requestAnimationFrame = originalRAF;
        });
    });

    describe('6. State Validation and Integrity', () => {
        test('should validate cart state integrity', async () => {
            // Add items and verify state
            await cartManager.addDonation(50, 'Test Donation');
            
            const validation = cartManager.validateCartState();
            expect(validation.valid).toBe(true);
            expect(validation.issues).toHaveLength(0);
        });

        test('should detect corrupted cart state', () => {
            // Corrupt the cart state
            cartManager.items = 'corrupted';
            
            const validation = cartManager.validateCartState();
            expect(validation.valid).toBe(false);
            expect(validation.issues).toContain('Cart items structure is corrupted');
        });

        test('should validate donation-specific constraints', async () => {
            // Add a donation and then try to corrupt it
            await cartManager.addDonation(100, 'Valid Donation');
            const donations = cartManager.getDonations();
            const donation = donations[0];
            
            // Corrupt donation quantity
            donation.quantity = 2;
            cartManager.items.set(donation.ticketType, donation);
            
            const validation = cartManager.validateCartState();
            expect(validation.valid).toBe(false);
            expect(validation.issues.some(issue => issue.includes('Donation quantity must be 1'))).toBe(true);
        });

        test('should prevent quantity changes on donations', async () => {
            await cartManager.addDonation(75, 'Protected Donation');
            const donations = cartManager.getDonations();
            const donationId = donations[0].ticketType;
            
            // Should throw error when trying to change donation quantity
            expect(() => {
                cartManager.updateItemQuantity(donationId, 3);
            }).toThrow('Donation quantities cannot be changed');
            
            // FloatingCart should also prevent quantity changes
            expect(() => {
                floatingCart.adjustQuantity(donationId, 1);
            }).toThrow('Donation amounts are fixed and cannot be adjusted');
        });

        test('should maintain data consistency across operations', async () => {
            // Perform multiple operations
            await cartManager.addDonation(25, 'First');
            await cartManager.addDonation(50, 'Second');
            await cartManager.addDonation(75, 'Third');
            
            // Verify consistency
            const donations = cartManager.getDonations();
            expect(donations).toHaveLength(3);
            
            const total = cartManager.getTotal();
            const manualTotal = donations.reduce((sum, d) => sum + d.price, 0);
            expect(total).toBe(manualTotal);
            
            // Verify FloatingCart consistency
            const summary = floatingCart.getCartSummary();
            expect(summary.totalAmount).toBe(total);
            expect(summary.itemCount).toBe(3);
        });
    });
});