/**
 * Cart Manager for A Lo Cubano Boulder Fest
 * Manages cart state, persistence, and real-time updates
 */

class CartManager extends EventTarget {
    constructor() {
        console.log('[CartManager] DEBUG: Constructor called');

        // Enforce singleton pattern
        if (CartManager.instance) {
            console.log('[CartManager] DEBUG: Returning existing singleton instance');
            return CartManager.instance;
        }

        console.log('[CartManager] DEBUG: Creating new CartManager instance');
        super();

        // Core properties
        this.items = new Map();
        this.cartExpiry = 15 * 60 * 1000; // 15 minutes
        this.storageKey = 'alocubano_cart_v2';
        this.expiryKey = 'alocubano_cart_expiry_v2';

        // Legacy storage keys for migration
        this.legacyStorageKey = 'alocubano_cart';
        this.legacyExpiryKey = 'alocubano_cart_expiry';

        // Initialization state management
        this.isLoaded = false;
        this.loadPromise = null;
        this.isRestoringDOM = false; // Flag to prevent sync during DOM restoration

        // Multi-tab synchronization
        this.storageDebounceTimer = null;
        this.storageDebounceDelay = 250; // 250ms debounce

        // Memory management tracking
        this.eventListeners = new Map();
        this.intervals = new Set();
        this.timeouts = new Set();

        // Set singleton instance
        CartManager.instance = this;

        // Initialize asynchronously
        this.loadPromise = this.init();
    }

    static getInstance() {
        console.log('[CartManager] DEBUG: getInstance() called');
        if (!CartManager.instance) {
            console.log('[CartManager] DEBUG: No instance exists, creating new one');
            CartManager.instance = new CartManager();
        } else {
            console.log('[CartManager] DEBUG: Returning existing instance');
        }
        return CartManager.instance;
    }

    static setDebug(enabled) {
        CartManager.DEBUG = enabled;
    }

    async init() {
        try {
            // FORCE DEBUG MODE ON DURING INVESTIGATION
            CartManager.DEBUG = true;
            console.log('[CartManager] FORCED DEBUG MODE ENABLED FOR INVESTIGATION');

            this.log('Initializing CartManager...');
            await this.loadFromStorage();
            this.bindEvents();
            this.startExpiryCheck();

            this.isLoaded = true;
            this.log('CartManager initialized successfully');

            console.log('[CartManager] DEBUG: Initialization complete');
            console.log('[CartManager] DEBUG: Final items after init:', this.items);
            console.log('[CartManager] DEBUG: Final item count:', this.getItemCount());
            console.log('[CartManager] DEBUG: Final total:', this.getTotal());

            // Auto-restore to DOM if we have items
            if (this.items.size > 0) {
                console.log('[CartManager] DEBUG: Auto-restoring DOM selections after initialization');
                this.restoreSelectionsToDOM();
            } else {
                console.log('[CartManager] DEBUG: No items to restore to DOM');
            }

            // Dispatch namespaced cart loaded event
            this.dispatchEvent(new CustomEvent('alocubano:cart:loaded', {
                detail: {
                    items: this.getItems(),
                    itemCount: this.getItemCount(),
                    total: this.getTotal()
                }
            }));

            return this;
        } catch (error) {
            this.log('Error initializing CartManager:', error);
            throw error;
        }
    }

    async waitForLoad() {
        if (this.isLoaded) {
            return this;
        }
        return this.loadPromise;
    }

    log(...args) {
        if (CartManager.DEBUG) {
            console.log('[CartManager]', ...args);
        }
    }

    bindEvents() {
        this.log('Binding event listeners...');

        // Listen for ticket selection changes
        // FIXED: Only sync after manual user interactions, not during initialization
        const clickHandler = (e) => {
            if (e.target.matches('.qty-btn')) {
                // Don't sync during initial page load - only sync after user interaction
                // Add a flag to prevent sync during DOM restoration
                if (this.isLoaded && !this.isRestoringDOM) {
                    setTimeout(() => this.syncWithTicketSelection(), 100);
                }
            }
        };
        document.addEventListener('click', clickHandler);
        this.eventListeners.set('document:click', { element: document, handler: clickHandler });

        // Enhanced storage events (for multi-tab sync with debouncing)
        const storageHandler = (e) => {
            if (e.key === this.storageKey || e.key === this.legacyStorageKey) {
                this.log('Storage event detected:', e.key);

                // Debounce rapid storage updates
                if (this.storageDebounceTimer) {
                    clearTimeout(this.storageDebounceTimer);
                }

                this.storageDebounceTimer = setTimeout(async() => {
                    try {
                        await this.loadFromStorage();
                        this.restoreSelectionsToDOM();
                        this.dispatchCartUpdate();
                        this.log('Multi-tab sync completed');
                    } catch (error) {
                        this.log('Error during multi-tab sync:', error);
                    }
                }, this.storageDebounceDelay);

                // Track timeout for cleanup
                this.timeouts.add(this.storageDebounceTimer);
            }
        };
        window.addEventListener('storage', storageHandler);
        this.eventListeners.set('window:storage', { element: window, handler: storageHandler });

        // Page visibility for cart expiry
        const visibilityHandler = () => {
            if (!document.hidden) {
                this.log('Page became visible, checking expiry...');
                this.checkExpiry();
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
        this.eventListeners.set('document:visibilitychange', { element: document, handler: visibilityHandler });

        this.log('Event listeners bound successfully');
    }

    restoreSelectionsToDOM() {
        this.log('Restoring cart selections to DOM...');
        console.log('[CartManager] DEBUG: restoreSelectionsToDOM() called');
        console.log('[CartManager] DEBUG: Current items to restore:', this.items);
        console.log('[CartManager] DEBUG: Items Map size:', this.items.size);

        // Set flag to prevent sync during DOM restoration
        this.isRestoringDOM = true;

        // Use requestAnimationFrame to batch DOM updates and avoid layout thrashing
        requestAnimationFrame(() => {
            try {
                // 1. Find and Update Ticket Cards
                this.log('Updating ticket card UI elements...');

                // Track successful updates for debugging
                let updatedCards = 0;
                const missingCards = [];

                this.items.forEach((item, ticketType) => {
                    try {
                        const card = document.querySelector(`.ticket-card[data-ticket-type="${ticketType}"]`);
                        if (card) {
                            // Update quantity displays
                            const quantityEl = card.querySelector('.quantity');
                            if (quantityEl) {
                                quantityEl.textContent = item.quantity.toString();
                            }

                            // Add/remove selected class and aria-pressed attribute
                            if (item.quantity > 0) {
                                card.classList.add('selected');
                                card.setAttribute('aria-pressed', 'true');
                            } else {
                                card.classList.remove('selected');
                                card.setAttribute('aria-pressed', 'false');
                            }

                            updatedCards++;
                            this.log(`Updated ticket card UI for: ${ticketType} (quantity: ${item.quantity})`);
                        } else {
                            missingCards.push(ticketType);
                            this.log(`Warning: Ticket card not found for: ${ticketType}`);
                        }
                    } catch (error) {
                        this.log(`Error updating ticket card for ${ticketType}:`, error);
                    }
                });

                // Clear cards not in cart (reset to default state)
                try {
                    document.querySelectorAll('.ticket-card').forEach(card => {
                        try {
                            const ticketType = card.dataset.ticketType;
                            if (ticketType && !this.items.has(ticketType)) {
                                const quantityEl = card.querySelector('.quantity');
                                if (quantityEl) {
                                    quantityEl.textContent = '0';
                                }
                                card.classList.remove('selected');
                                card.setAttribute('aria-pressed', 'false');
                            }
                        } catch (error) {
                            this.log('Error clearing ticket card UI:', error);
                        }
                    });
                } catch (error) {
                    this.log('Error during ticket card cleanup:', error);
                }

                // 2. Update Order Summaries
                this.log('Updating order summary displays...');
                try {
                    // Call existing updateTicketSelectionUI method for comprehensive updates
                    this.updateTicketSelectionUI();

                    // Update checkout buttons to proper enabled/disabled state
                    const checkoutButtons = document.querySelectorAll('#checkout-button, .checkout-btn, [data-action="checkout"]');
                    checkoutButtons.forEach(btn => {
                        try {
                            btn.disabled = this.isEmpty();
                            if (this.isEmpty()) {
                                btn.setAttribute('aria-disabled', 'true');
                            } else {
                                btn.removeAttribute('aria-disabled');
                            }
                        } catch (error) {
                            this.log('Error updating checkout button state:', error);
                        }
                    });
                } catch (error) {
                    this.log('Error updating order summaries:', error);
                }

                // 3. Trigger External Updates
                this.log('Triggering external component updates...');
                try {
                    // Update ticket selection system if available
                    if (window.ticketSelection && typeof window.ticketSelection.updateAllDisplays === 'function') {
                        window.ticketSelection.updateAllDisplays();
                        this.log('Called window.ticketSelection.updateAllDisplays()');
                    } else {
                        this.log('window.ticketSelection.updateAllDisplays() not available');
                    }

                    // Dispatch cart update event to notify other components
                    this.dispatchCartUpdate();
                    this.log('Dispatched cart update event');

                } catch (error) {
                    this.log('Error triggering external updates:', error);
                }

                // Log restoration summary
                this.log(`DOM restoration completed: ${updatedCards} cards updated, ${missingCards.length} missing cards`, {
                    totalItems: this.items.size,
                    updatedCards,
                    missingCards,
                    cartTotal: this.getTotalFormatted(),
                    itemCount: this.getItemCount()
                });

            } catch (error) {
                this.log('Critical error during DOM restoration:', error);

                // Fallback: try basic update method
                try {
                    this.log('Attempting fallback DOM update...');
                    this.updateTicketSelectionUI();
                } catch (fallbackError) {
                    this.log('Fallback DOM update also failed:', fallbackError);
                }
            } finally {
                // Clear flag to allow normal sync operations
                this.isRestoringDOM = false;
                this.log('DOM restoration flag cleared');
            }
        });
    }

    syncWithTicketSelection() {
        try {
            this.log('Syncing with ticket selection...');

            // Safety check: Don't sync during DOM restoration
            if (this.isRestoringDOM) {
                this.log('Skipping sync - DOM restoration in progress');
                return;
            }

            const ticketCards = document.querySelectorAll('.ticket-card');
            const newItems = new Map();

            ticketCards.forEach(card => {
                try {
                    const quantityEl = card.querySelector('.quantity');
                    const quantity = parseInt(quantityEl?.textContent || '0');

                    if (quantity > 0) {
                        const ticketType = card.dataset.ticketType;
                        const price = parseFloat(card.dataset.price);
                        const name = card.querySelector('h5')?.textContent?.trim() || card.querySelector('h4')?.textContent?.trim();

                        // Determine which event this ticket belongs to
                        const eventSection = card.closest('.ticket-selection[data-event]');
                        const eventId = eventSection ? eventSection.dataset.event : 'boulder-fest-2026';

                        if (ticketType && price && name) {
                            newItems.set(ticketType, {
                                ticketType,
                                name,
                                price,
                                quantity,
                                eventId,
                                addedAt: this.items.get(ticketType)?.addedAt || Date.now()
                            });
                        } else {
                            this.log('Invalid ticket data detected:', { ticketType, price, name });
                        }
                    }
                } catch (error) {
                    this.log('Error processing ticket card:', error);
                }
            });

            // Safety check: Only update if we actually found ticket cards
            if (ticketCards.length === 0) {
                this.log('No ticket cards found - skipping sync to prevent cart clearing');
                return;
            }

            // Compare with existing items to avoid unnecessary updates
            const itemsChanged = newItems.size !== this.items.size ||
                                Array.from(newItems.keys()).some(key => {
                                    const newItem = newItems.get(key);
                                    const existingItem = this.items.get(key);
                                    return !existingItem || newItem.quantity !== existingItem.quantity;
                                });

            if (!itemsChanged) {
                this.log('No changes detected - skipping sync');
                return;
            }

            // Update items and save
            this.items = newItems;
            this.saveToStorage();
            this.dispatchCartUpdate();
            this.log('Ticket selection sync completed - items updated');
        } catch (error) {
            this.log('Error syncing with ticket selection:', error);
        }
    }

    addItem(ticketType, name, price, quantity = 1, eventId = 'boulder-fest-2026') {
        try {
            this.log('Adding item:', { ticketType, name, price, quantity, eventId });

            if (!ticketType || !name || price <= 0 || quantity <= 0) {
                throw new Error('Invalid item parameters');
            }

            const existingItem = this.items.get(ticketType);

            const item = {
                ticketType,
                name,
                price,
                quantity: existingItem ? existingItem.quantity + quantity : quantity,
                eventId: existingItem?.eventId || eventId,
                addedAt: existingItem?.addedAt || Date.now()
            };

            this.items.set(ticketType, item);
            this.saveToStorage();
            this.dispatchCartUpdate();
            this.log('Item added successfully:', item);

            return item;
        } catch (error) {
            this.log('Error adding item:', error);
            throw error;
        }
    }

    updateItemQuantity(ticketType, quantity) {
        try {
            this.log('Updating item quantity:', { ticketType, quantity });

            if (quantity <= 0) {
                return this.removeItem(ticketType);
            }

            const item = this.items.get(ticketType);
            if (item) {
                item.quantity = quantity;
                this.items.set(ticketType, item);
                this.saveToStorage();
                this.dispatchCartUpdate();
                this.log('Item quantity updated successfully:', item);
                return item;
            }

            this.log('Item not found for quantity update:', ticketType);
            return null;
        } catch (error) {
            this.log('Error updating item quantity:', error);
            throw error;
        }
    }

    removeItem(ticketType) {
        try {
            this.log('Removing item:', ticketType);
            const removed = this.items.delete(ticketType);
            if (removed) {
                this.saveToStorage();
                this.dispatchCartUpdate();
                this.log('Item removed successfully:', ticketType);
            } else {
                this.log('Item not found for removal:', ticketType);
            }
            return removed;
        } catch (error) {
            this.log('Error removing item:', error);
            throw error;
        }
    }

    clearCart() {
        try {
            this.log('Clearing cart...');
            this.items.clear();
            this.saveToStorage();
            this.dispatchCartUpdate();

            // Dispatch namespaced cart cleared event
            this.dispatchEvent(new CustomEvent('alocubano:cart:cleared', {
                detail: { timestamp: Date.now() }
            }));

            this.log('Cart cleared successfully');
        } catch (error) {
            this.log('Error clearing cart:', error);
            throw error;
        }
    }

    getItems() {
        return Array.from(this.items.values());
    }

    getItem(ticketType) {
        return this.items.get(ticketType);
    }

    getItemCount() {
        return Array.from(this.items.values())
            .reduce((total, item) => total + item.quantity, 0);
    }

    getTotal() {
        return Array.from(this.items.values())
            .reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getTotalFormatted() {
        return `$${this.getTotal().toFixed(2)}`;
    }

    isEmpty() {
        return this.items.size === 0;
    }

    // Enhanced cart validation with state integrity checks
    validateCartState() {
        this.log('Validating cart state...');
        const issues = [];

        try {
            // Check if items is a Map
            if (!(this.items instanceof Map)) {
                issues.push('Cart items structure is corrupted');
                return { valid: false, issues };
            }

            // Check each item structure
            for (const [key, item] of this.items) {
                if (typeof key !== 'string' || !key.trim()) {
                    issues.push('Invalid ticket type key detected');
                }

                if (!item || typeof item !== 'object') {
                    issues.push(`Invalid item structure for: ${key}`);
                    continue;
                }

                const requiredFields = ['ticketType', 'name', 'price', 'quantity', 'addedAt'];
                const optionalFields = ['eventId'];
                for (const field of requiredFields) {
                    if (!(field in item)) {
                        issues.push(`Missing field '${field}' in item: ${key}`);
                    }
                }

                if (item.addedAt && (typeof item.addedAt !== 'number' || item.addedAt > Date.now())) {
                    issues.push(`Invalid timestamp for item: ${key}`);
                }
            }

            this.log('Cart state validation completed:', { valid: issues.length === 0, issues });
            return { valid: issues.length === 0, issues };
        } catch (error) {
            this.log('Error during cart state validation:', error);
            return { valid: false, issues: ['Cart state validation failed'] };
        }
    }

    // Business logic validation
    validateCart() {
        try {
            this.log('Validating cart business rules...');
            const errors = [];
            const items = this.getItems();

            if (items.length === 0) {
                errors.push('Cart is empty');
                return { valid: false, errors };
            }

            // Check for invalid items
            items.forEach(item => {
                if (!item.ticketType || !item.name || !item.price || item.quantity <= 0) {
                    errors.push(`Invalid item: ${item.name || 'Unknown'}`);
                }

                if (item.quantity > 10) { // Max 10 tickets per type
                    errors.push(`Maximum 10 tickets allowed per type: ${item.name}`);
                }

                if (item.price <= 0 || item.price > 1000) { // Sanity check
                    errors.push(`Invalid price for: ${item.name}`);
                }
            });

            // Check total limits
            const totalQuantity = this.getItemCount();
            if (totalQuantity > 50) { // Max 50 total tickets
                errors.push('Maximum 50 total tickets allowed');
            }

            const totalAmount = this.getTotal();
            if (totalAmount > 5000) { // Max $5000 total
                errors.push('Maximum order value exceeded');
            }

            this.log('Cart validation completed:', { valid: errors.length === 0, errors });
            return {
                valid: errors.length === 0,
                errors
            };
        } catch (error) {
            this.log('Error during cart validation:', error);
            return {
                valid: false,
                errors: ['Cart validation failed']
            };
        }
    }

    // Enhanced persistence with comprehensive error handling
    saveToStorage() {
        try {
            this.log('Saving cart to storage...');
            console.log('[CartManager] DEBUG: saveToStorage() called');
            console.log('[CartManager] DEBUG: Current items to save:', this.items);
            console.log('[CartManager] DEBUG: Items Map size:', this.items.size);

            // Validate cart state before saving
            const stateValidation = this.validateCartState();
            if (!stateValidation.valid) {
                this.log('Cart state invalid, cannot save:', stateValidation.issues);
                console.log('[CartManager] DEBUG: Validation failed:', stateValidation.issues);
                return false;
            }

            const cartData = {
                items: Array.from(this.items.entries()),
                timestamp: Date.now(),
                expiry: Date.now() + this.cartExpiry,
                version: 2 // Version for future migrations
            };

            console.log('[CartManager] DEBUG: Cart data to save:', cartData);
            console.log('[CartManager] DEBUG: Stringified cart data:', JSON.stringify(cartData));
            console.log('[CartManager] DEBUG: Storage key:', this.storageKey);

            localStorage.setItem(this.storageKey, JSON.stringify(cartData));
            localStorage.setItem(this.expiryKey, cartData.expiry.toString());

            console.log('[CartManager] DEBUG: Data saved to localStorage');
            console.log('[CartManager] DEBUG: Verification - stored data:', localStorage.getItem(this.storageKey));

            this.log('Cart saved to storage successfully');
            return true;
        } catch (error) {
            this.log('Failed to save cart to storage:', error);

            // Attempt recovery by clearing corrupted data
            try {
                this.clearStorage();
                this.log('Cleared corrupted storage data');
            } catch (clearError) {
                this.log('Failed to clear corrupted storage:', clearError);
            }

            return false;
        }
    }

    async loadFromStorage() {
        try {
            this.log('Loading cart from storage...');

            // DEBUG: Log all localStorage cart-related keys
            console.log('[CartManager] DEBUG: All localStorage keys:', Object.keys(localStorage));
            console.log('[CartManager] DEBUG: Current storage key:', this.storageKey);
            console.log('[CartManager] DEBUG: Legacy storage key:', this.legacyStorageKey);

            // Try loading from current storage key first
            let saved = localStorage.getItem(this.storageKey);
            let isLegacyData = false;

            console.log('[CartManager] DEBUG: Raw saved data from current key:', saved);

            // Migration support: check for legacy data
            if (!saved) {
                this.log('No current cart data found, checking for legacy data...');
                saved = localStorage.getItem(this.legacyStorageKey);
                console.log('[CartManager] DEBUG: Raw saved data from legacy key:', saved);
                if (saved) {
                    isLegacyData = true;
                    this.log('Legacy cart data found, will migrate...');
                }
            }

            if (!saved) {
                this.log('No cart data found in storage');
                console.log('[CartManager] DEBUG: No saved data found in either key');
                return;
            }

            console.log('[CartManager] DEBUG: About to parse saved data:', saved);

            const cartData = JSON.parse(saved);

            // Check expiry
            const expiry = cartData.expiry || (isLegacyData ?
                parseInt(localStorage.getItem(this.legacyExpiryKey) || '0') : 0);

            if (Date.now() > expiry) {
                this.log('Cart data expired, clearing storage');
                this.clearStorage();
                if (isLegacyData) {
                    this.clearLegacyStorage();
                }
                return;
            }

            // Restore items with validation
            const items = cartData.items || [];
            this.items = new Map();

            // Validate each item during restoration
            let validItemCount = 0;
            console.log('[CartManager] DEBUG: Items array from storage:', items);
            console.log('[CartManager] DEBUG: Items array length:', items.length);

            for (const [key, item] of items) {
                console.log('[CartManager] DEBUG: Processing item:', key, item);
                if (this.isValidItem(item)) {
                    this.items.set(key, item);
                    validItemCount++;
                    console.log('[CartManager] DEBUG: Valid item added:', key);
                } else {
                    this.log('Skipping invalid item during load:', item);
                    console.log('[CartManager] DEBUG: Invalid item details:', item);
                }
            }

            this.log(`Cart loaded from storage: ${validItemCount} valid items`);
            console.log('[CartManager] DEBUG: Final items Map:', this.items);
            console.log('[CartManager] DEBUG: Final items Map size:', this.items.size);

            // If legacy data was loaded, save in new format and clear legacy
            if (isLegacyData && validItemCount > 0) {
                this.log('Migrating legacy cart data...');
                this.saveToStorage();
                this.clearLegacyStorage();
                this.log('Legacy data migration completed');
            }

        } catch (error) {
            this.log('Failed to load cart from storage:', error);
            console.log('[CartManager] DEBUG: Load error stack:', error.stack);
            console.log('[CartManager] DEBUG: Load error details:', error);
            this.clearStorage();
            this.clearLegacyStorage();

            // Reset to empty cart state
            this.items = new Map();
        }
    }

    isValidItem(item) {
        return item &&
               typeof item === 'object' &&
               item.ticketType &&
               item.name &&
               typeof item.price === 'number' &&
               item.price > 0 &&
               typeof item.quantity === 'number' &&
               item.quantity > 0 &&
               typeof item.addedAt === 'number' &&
               (!item.eventId || typeof item.eventId === 'string'); // eventId is optional but must be string if present
    }

    clearLegacyStorage() {
        try {
            localStorage.removeItem(this.legacyStorageKey);
            localStorage.removeItem(this.legacyExpiryKey);
            this.log('Legacy storage cleared');
        } catch (error) {
            this.log('Failed to clear legacy storage:', error);
        }
    }

    clearStorage() {
        try {
            this.log('Clearing storage...');
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.expiryKey);
            this.log('Storage cleared successfully');
        } catch (error) {
            this.log('Failed to clear cart storage:', error);
        }
    }

    checkExpiry() {
        try {
            this.log('Checking cart expiry...');
            const expiryStr = localStorage.getItem(this.expiryKey);
            if (expiryStr) {
                const expiry = parseInt(expiryStr);
                if (Date.now() > expiry) {
                    this.log('Cart has expired, clearing...');
                    this.clearCart();
                    this.clearStorage();

                    // Dispatch namespaced cart expired event
                    this.dispatchEvent(new CustomEvent('alocubano:cart:expired', {
                        detail: {
                            expiredAt: expiry,
                            clearedAt: Date.now()
                        }
                    }));
                } else {
                    this.log('Cart is still valid');
                }
            } else {
                this.log('No expiry information found');
            }
        } catch (error) {
            this.log('Failed to check cart expiry:', error);
        }
    }

    startExpiryCheck() {
        this.log('Starting expiry check interval...');
        // Check expiry every minute
        const interval = setInterval(() => {
            this.checkExpiry();
        }, 60000);

        // Track interval for cleanup
        this.intervals.add(interval);
        this.log('Expiry check interval started');

        return interval;
    }

    getRemainingTime() {
        try {
            const expiryStr = localStorage.getItem(this.expiryKey);
            if (expiryStr) {
                const expiry = parseInt(expiryStr);
                const remaining = expiry - Date.now();
                return Math.max(0, remaining);
            }
        } catch (error) {
            this.log('Failed to get remaining time:', error);
        }
        return 0;
    }

    getRemainingTimeFormatted() {
        const remaining = this.getRemainingTime();
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    extendExpiry() {
        try {
            this.log('Extending cart expiry...');
            const newExpiry = Date.now() + this.cartExpiry;
            localStorage.setItem(this.expiryKey, newExpiry.toString());
            this.saveToStorage(); // Update stored cart data too
            this.log('Cart expiry extended successfully');
        } catch (error) {
            this.log('Failed to extend cart expiry:', error);
        }
    }

    // Memory management and cleanup
    destroy() {
        try {
            this.log('Destroying CartManager instance...');

            // Clear all event listeners
            for (const [key, { element, handler }] of this.eventListeners) {
                try {
                    element.removeEventListener(key.split(':')[1], handler);
                    this.log(`Removed event listener: ${key}`);
                } catch (error) {
                    this.log(`Failed to remove event listener ${key}:`, error);
                }
            }
            this.eventListeners.clear();

            // Clear all intervals
            for (const interval of this.intervals) {
                try {
                    clearInterval(interval);
                } catch (error) {
                    this.log('Failed to clear interval:', error);
                }
            }
            this.intervals.clear();

            // Clear all timeouts
            for (const timeout of this.timeouts) {
                try {
                    clearTimeout(timeout);
                } catch (error) {
                    this.log('Failed to clear timeout:', error);
                }
            }
            this.timeouts.clear();

            // Clear debounce timer
            if (this.storageDebounceTimer) {
                clearTimeout(this.storageDebounceTimer);
                this.storageDebounceTimer = null;
            }

            // Clear cart data
            this.items.clear();

            // Reset initialization state
            this.isLoaded = false;
            this.loadPromise = null;

            // Clear singleton instance
            CartManager.instance = null;

            this.log('CartManager destroyed successfully');
        } catch (error) {
            this.log('Error during CartManager destruction:', error);
        }
    }

    // Events with namespaced event names
    dispatchCartUpdate() {
        try {
            this.log('Dispatching cart update event...');
            const event = new CustomEvent('alocubano:cart:updated', {
                detail: {
                    items: this.getItems(),
                    itemCount: this.getItemCount(),
                    total: this.getTotal(),
                    totalFormatted: this.getTotalFormatted(),
                    isEmpty: this.isEmpty(),
                    remainingTime: this.getRemainingTime(),
                    timestamp: Date.now()
                }
            });

            this.dispatchEvent(event);
            this.log('Cart update event dispatched successfully');
        } catch (error) {
            this.log('Error dispatching cart update event:', error);
        }
    }

    // Enhanced utility methods for UI updates with error handling
    updateTicketSelectionUI() {
        try {
            this.log('Updating ticket selection UI...');

            this.items.forEach((item, ticketType) => {
                try {
                    const card = document.querySelector(`[data-ticket-type="${ticketType}"]`);
                    if (card) {
                        const quantityEl = card.querySelector('.quantity');
                        if (quantityEl) {
                            quantityEl.textContent = item.quantity.toString();
                        }

                        if (item.quantity > 0) {
                            card.classList.add('selected');
                            card.setAttribute('aria-pressed', 'true');
                        } else {
                            card.classList.remove('selected');
                            card.setAttribute('aria-pressed', 'false');
                        }
                    } else {
                        this.log(`Ticket card not found for: ${ticketType}`);
                    }
                } catch (error) {
                    this.log(`Error updating UI for ticket ${ticketType}:`, error);
                }
            });

            // Clear cards not in cart
            try {
                document.querySelectorAll('.ticket-card').forEach(card => {
                    try {
                        const ticketType = card.dataset.ticketType;
                        if (ticketType && !this.items.has(ticketType)) {
                            const quantityEl = card.querySelector('.quantity');
                            if (quantityEl) {
                                quantityEl.textContent = '0';
                            }
                            card.classList.remove('selected');
                            card.setAttribute('aria-pressed', 'false');
                        }
                    } catch (error) {
                        this.log('Error clearing ticket card UI:', error);
                    }
                });
            } catch (error) {
                this.log('Error clearing ticket cards UI:', error);
            }

            // Update checkout button
            try {
                const checkoutBtn = document.getElementById('checkout-button');
                if (checkoutBtn) {
                    checkoutBtn.disabled = this.isEmpty();
                }
            } catch (error) {
                this.log('Error updating checkout button:', error);
            }

            this.log('Ticket selection UI updated successfully');
        } catch (error) {
            this.log('Error updating ticket selection UI:', error);
        }
    }

    // Cart summary for order display
    getOrderSummary() {
        try {
            this.log('Generating order summary...');
            const items = this.getItems();
            const summary = {
                items: items.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.price * item.quantity
                })),
                subtotal: this.getTotal(),
                total: this.getTotal(), // No taxes/fees for now
                itemCount: this.getItemCount(),
                timestamp: Date.now()
            };
            this.log('Order summary generated successfully');
            return summary;
        } catch (error) {
            this.log('Error generating order summary:', error);
            return {
                items: [],
                subtotal: 0,
                total: 0,
                itemCount: 0,
                error: true
            };
        }
    }

    // Export cart data (for analytics/debugging)
    exportCart() {
        try {
            this.log('Exporting cart data...');
            const items = this.getItems();
            const exportData = {
                items: items,
                total: this.getTotal(),
                itemCount: this.getItemCount(),
                createdAt: items.length > 0 ? Math.min(...items.map(item => item.addedAt)) : Date.now(),
                expiresAt: Date.now() + this.getRemainingTime(),
                exportedAt: Date.now(),
                version: 2
            };
            this.log('Cart data exported successfully');
            return exportData;
        } catch (error) {
            this.log('Error exporting cart data:', error);
            return {
                items: [],
                total: 0,
                itemCount: 0,
                error: true,
                exportedAt: Date.now()
            };
        }
    }

    // Enhanced event listeners for external components
    on(eventType, callback) {
        try {
            this.addEventListener(eventType, callback);
            this.log(`Event listener added: ${eventType}`);
            return this;
        } catch (error) {
            this.log(`Error adding event listener ${eventType}:`, error);
            return this;
        }
    }

    off(eventType, callback) {
        try {
            this.removeEventListener(eventType, callback);
            this.log(`Event listener removed: ${eventType}`);
            return this;
        } catch (error) {
            this.log(`Error removing event listener ${eventType}:`, error);
            return this;
        }
    }
}

// Initialize static properties
CartManager.instance = null;
CartManager.DEBUG = false;

// Make CartManager available globally for non-module scripts
if (typeof window !== 'undefined') {
    window.CartManager = CartManager;
}

// CartManager is available globally via window.CartManager (set above)