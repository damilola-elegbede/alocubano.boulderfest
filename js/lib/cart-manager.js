/**
 * Cart Manager for A Lo Cubano Boulder Fest
 * Manages cart state, persistence, and real-time updates
 */

class CartManager extends EventTarget {
    constructor() {
        super();
        this.items = new Map();
        this.cartExpiry = 15 * 60 * 1000; // 15 minutes
        this.storageKey = 'alocubano_cart';
        this.expiryKey = 'alocubano_cart_expiry';

        this.init();
    }

    init() {
        this.loadFromStorage();
        this.bindEvents();
        this.startExpiryCheck();
    }

    bindEvents() {
    // Listen for ticket selection changes
        document.addEventListener('click', (e) => {
            if (e.target.matches('.qty-btn')) {
                setTimeout(() => this.syncWithTicketSelection(), 100);
            }
        });

        // Storage events (for multi-tab sync)
        window.addEventListener('storage', (e) => {
            if (e.key === this.storageKey) {
                this.loadFromStorage();
                this.dispatchCartUpdate();
            }
        });

        // Page visibility for cart expiry
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkExpiry();
            }
        });
    }

    syncWithTicketSelection() {
        const ticketCards = document.querySelectorAll('.ticket-card');
        const newItems = new Map();

        ticketCards.forEach(card => {
            const quantityEl = card.querySelector('.quantity');
            const quantity = parseInt(quantityEl?.textContent || '0');

            if (quantity > 0) {
                const ticketType = card.dataset.ticketType;
                const price = parseFloat(card.dataset.price);
                const name = card.querySelector('h4')?.textContent?.trim();

                if (ticketType && price && name) {
                    newItems.set(ticketType, {
                        ticketType,
                        name,
                        price,
                        quantity,
                        addedAt: this.items.get(ticketType)?.addedAt || Date.now()
                    });
                }
            }
        });

        // Update items and save
        this.items = newItems;
        this.saveToStorage();
        this.dispatchCartUpdate();
    }

    addItem(ticketType, name, price, quantity = 1) {
        const existingItem = this.items.get(ticketType);

        const item = {
            ticketType,
            name,
            price,
            quantity: existingItem ? existingItem.quantity + quantity : quantity,
            addedAt: existingItem?.addedAt || Date.now()
        };

        this.items.set(ticketType, item);
        this.saveToStorage();
        this.dispatchCartUpdate();

        return item;
    }

    updateItemQuantity(ticketType, quantity) {
        if (quantity <= 0) {
            return this.removeItem(ticketType);
        }

        const item = this.items.get(ticketType);
        if (item) {
            item.quantity = quantity;
            this.items.set(ticketType, item);
            this.saveToStorage();
            this.dispatchCartUpdate();
            return item;
        }

        return null;
    }

    removeItem(ticketType) {
        const removed = this.items.delete(ticketType);
        if (removed) {
            this.saveToStorage();
            this.dispatchCartUpdate();
        }
        return removed;
    }

    clearCart() {
        this.items.clear();
        this.saveToStorage();
        this.dispatchCartUpdate();
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

    // Cart validation
    validateCart() {
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

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Persistence
    saveToStorage() {
        try {
            const cartData = {
                items: Array.from(this.items.entries()),
                timestamp: Date.now(),
                expiry: Date.now() + this.cartExpiry
            };

            localStorage.setItem(this.storageKey, JSON.stringify(cartData));
            localStorage.setItem(this.expiryKey, cartData.expiry.toString());
        } catch (error) {
            console.warn('Failed to save cart to storage:', error);
        }
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (!saved) {
                return;
            }

            const cartData = JSON.parse(saved);

            // Check expiry
            if (Date.now() > cartData.expiry) {
                this.clearStorage();
                return;
            }

            // Restore items
            this.items = new Map(cartData.items);
        } catch (error) {
            console.warn('Failed to load cart from storage:', error);
            this.clearStorage();
        }
    }

    clearStorage() {
        try {
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.expiryKey);
        } catch (error) {
            console.warn('Failed to clear cart storage:', error);
        }
    }

    checkExpiry() {
        try {
            const expiryStr = localStorage.getItem(this.expiryKey);
            if (expiryStr) {
                const expiry = parseInt(expiryStr);
                if (Date.now() > expiry) {
                    this.clearCart();
                    this.clearStorage();
                    this.dispatchEvent(new CustomEvent('cart-expired'));
                }
            }
        } catch (error) {
            console.warn('Failed to check cart expiry:', error);
        }
    }

    startExpiryCheck() {
    // Check expiry every minute
        setInterval(() => {
            this.checkExpiry();
        }, 60000);
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
            console.warn('Failed to get remaining time:', error);
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
        const newExpiry = Date.now() + this.cartExpiry;
        try {
            localStorage.setItem(this.expiryKey, newExpiry.toString());
            this.saveToStorage(); // Update stored cart data too
        } catch (error) {
            console.warn('Failed to extend cart expiry:', error);
        }
    }

    // Events
    dispatchCartUpdate() {
        const event = new CustomEvent('cart-updated', {
            detail: {
                items: this.getItems(),
                itemCount: this.getItemCount(),
                total: this.getTotal(),
                totalFormatted: this.getTotalFormatted(),
                isEmpty: this.isEmpty(),
                remainingTime: this.getRemainingTime()
            }
        });

        this.dispatchEvent(event);
    }

    // Utility methods for UI updates
    updateTicketSelectionUI() {
        this.items.forEach((item, ticketType) => {
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
            }
        });

        // Clear cards not in cart
        document.querySelectorAll('.ticket-card').forEach(card => {
            const ticketType = card.dataset.ticketType;
            if (!this.items.has(ticketType)) {
                const quantityEl = card.querySelector('.quantity');
                if (quantityEl) {
                    quantityEl.textContent = '0';
                }
                card.classList.remove('selected');
                card.setAttribute('aria-pressed', 'false');
            }
        });

        // Update checkout button
        const checkoutBtn = document.getElementById('checkout-button');
        if (checkoutBtn) {
            checkoutBtn.disabled = this.isEmpty();
        }
    }

    // Cart summary for order display
    getOrderSummary() {
        const items = this.getItems();
        return {
            items: items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity
            })),
            subtotal: this.getTotal(),
            total: this.getTotal(), // No taxes/fees for now
            itemCount: this.getItemCount()
        };
    }

    // Export cart data (for analytics/debugging)
    exportCart() {
        return {
            items: this.getItems(),
            total: this.getTotal(),
            itemCount: this.getItemCount(),
            createdAt: Math.min(...this.getItems().map(item => item.addedAt)),
            expiresAt: Date.now() + this.getRemainingTime()
        };
    }

    // Event listeners for external components
    on(eventType, callback) {
        this.addEventListener(eventType, callback);
        return this;
    }

    off(eventType, callback) {
        this.removeEventListener(eventType, callback);
        return this;
    }
}

export { CartManager };