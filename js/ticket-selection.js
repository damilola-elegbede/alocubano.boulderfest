/**
 * Multi-Event Ticket Selection and Dynamic Pricing
 * Handles ticket selection, quantity management, and price calculation across multiple events
 * Uses CartManager as the single source of truth for cart state
 */

// Import CartManager - it's available globally via window.CartManager

class TicketSelection {
    constructor() {
        // Remove internal state management - CartManager is now the single source of truth
        this.events = ['boulder-fest-2026']; // Keep events as configuration
        this.cartManager = null; // Will be initialized with CartManager instance
        this.init();
    }

    async init() {
        try {
            // Initialize CartManager and wait for it to load
            this.cartManager = window.CartManager.getInstance();
            await this.cartManager.waitForLoad();
            
            this.bindEvents();
            this.bindCartManagerEvents();
            this.updateAllDisplays();
            
            console.log('TicketSelection initialized successfully with CartManager');
        } catch (error) {
            console.error('Error initializing TicketSelection with CartManager:', error);
            // Graceful fallback
            this.bindEvents();
            this.updateAllDisplays();
        }
    }

    /**
     * Bind CartManager event listeners for real-time updates
     */
    bindCartManagerEvents() {
        if (!this.cartManager) return;
        
        // Listen to cart update events
        this.cartManager.addEventListener('alocubano:cart:updated', (event) => {
            this.updateAllDisplays();
        });
        
        // Listen to cart loaded events
        this.cartManager.addEventListener('alocubano:cart:loaded', (event) => {
            this.updateAllDisplays();
        });
        
        // Listen to cart cleared events
        this.cartManager.addEventListener('alocubano:cart:cleared', (event) => {
            this.updateAllDisplays();
        });
        
        console.log('CartManager event listeners bound successfully');
    }

    bindEvents() {
        // Quantity button events
        document.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleQuantityChange(e));
        });

        // Ticket card click events and keyboard accessibility
        document.querySelectorAll('.ticket-card').forEach(card => {
            // Make cards keyboard accessible
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            card.setAttribute('aria-pressed', 'false');

            // Click events
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('qty-btn')) {
                    this.handleTicketCardClick(e);
                }
            });

            // Keyboard events for accessibility
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!e.target.classList.contains('qty-btn')) {
                        this.handleTicketCardClick(e);
                    }
                }
            });
        });

        // Event-specific checkout buttons
        this.events.forEach(eventId => {
            const checkoutBtn = document.getElementById(`checkout-button-${eventId}`);
            if (checkoutBtn) {
                checkoutBtn.addEventListener('click', () => this.handleEventCheckout(eventId));
            }
        });

        // Global checkout button
        const globalCheckoutBtn = document.getElementById('global-checkout-button');
        if (globalCheckoutBtn) {
            globalCheckoutBtn.addEventListener('click', () => this.handleGlobalCheckout());
        }
    }

    handleQuantityChange(event) {
        event.stopPropagation();
        const btn = event.target;
        const card = btn.closest('.ticket-card');
        const ticketType = card.dataset.ticketType;
        const price = parseInt(card.dataset.price);
        const action = btn.dataset.action;
        const quantitySpan = card.querySelector('.quantity');

        // Determine which event this ticket belongs to
        const eventSection = card.closest('.ticket-selection[data-event]');
        const eventId = eventSection ? eventSection.dataset.event : 'boulder-fest-2026';

        let currentQuantity = parseInt(quantitySpan.textContent) || 0;

        if (action === 'increase') {
            currentQuantity++;
        } else if (action === 'decrease' && currentQuantity > 0) {
            currentQuantity--;
        }

        // Update DOM immediately for responsive UI
        quantitySpan.textContent = currentQuantity;

        // Get ticket name from h5 element (updated structure)
        const ticketNameElement = card.querySelector('h5') || card.querySelector('h4');
        const ticketName = ticketNameElement ? ticketNameElement.textContent : 'Ticket';

        // Update cart state through CartManager
        if (!this.cartManager) {
            console.warn('CartManager not available, falling back to direct DOM updates');
            this.updateCardState(card, currentQuantity);
            return;
        }

        try {
            if (currentQuantity > 0) {
                // Use CartManager to add/update item
                const existingItem = this.cartManager.getItem(ticketType);
                if (existingItem) {
                    this.cartManager.updateItemQuantity(ticketType, currentQuantity);
                } else {
                    this.cartManager.addItem(ticketType, ticketName, price, currentQuantity, eventId);
                }
                
                card.classList.add('selected');
                card.setAttribute('aria-pressed', 'true');
            } else {
                // Remove from cart
                this.cartManager.removeItem(ticketType);
                
                card.classList.remove('selected');
                card.setAttribute('aria-pressed', 'false');
            }
        } catch (error) {
            console.error('Error updating cart through CartManager:', error);
            // Fallback to direct DOM updates
            this.updateCardState(card, currentQuantity);
        }
    }

    /**
     * Fallback method to update card state when CartManager is not available
     */
    updateCardState(card, quantity) {
        if (quantity > 0) {
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');
        } else {
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
        }
    }

    handleTicketCardClick(event) {
        const card = event.currentTarget;
        const quantitySpan = card.querySelector('.quantity');
        const currentQuantity = parseInt(quantitySpan.textContent) || 0;

        if (currentQuantity === 0) {
            // Add one ticket
            const plusBtn = card.querySelector('.qty-btn.plus');
            plusBtn.click();
        }
    }

    /**
     * Update all displays (event-specific and global)
     */
    updateAllDisplays() {
        this.events.forEach(eventId => {
            this.updateEventDisplay(eventId);
        });
        this.updateGlobalDisplay();
        
        // No need to explicitly notify floating cart anymore - 
        // CartManager events handle cross-component synchronization
    }

    /**
     * Update display for a specific event
     */
    updateEventDisplay(eventId) {
        const orderItemsEl = document.getElementById(`order-items-${eventId}`);
        const finalTotalEl = document.getElementById(`final-total-${eventId}`);
        const checkoutBtn = document.getElementById(`checkout-button-${eventId}`);

        // Get tickets for this event from CartManager
        const eventTickets = this.getEventTicketsFromCart(eventId);
        let totalAmount = 0;

        // Clear existing order items
        if (orderItemsEl) {
            orderItemsEl.innerHTML = '';
        }

        // Add each selected ticket to event order summary
        eventTickets.forEach((ticket) => {
            const itemAmount = ticket.quantity * ticket.price;
            totalAmount += itemAmount;

            if (orderItemsEl) {
                const orderItem = document.createElement('div');
                orderItem.className = 'order-item';
                orderItem.innerHTML = `
                    <span>${ticket.name} × ${ticket.quantity}</span>
                    <span>$${itemAmount}</span>
                `;
                orderItemsEl.appendChild(orderItem);
            }
        });

        if (finalTotalEl) {
            finalTotalEl.textContent = totalAmount;
        }

        if (checkoutBtn) {
            checkoutBtn.disabled = totalAmount === 0;
        }
    }

    /**
     * Get tickets for a specific event from CartManager
     */
    getEventTicketsFromCart(eventId) {
        if (!this.cartManager) return [];
        
        const allItems = this.cartManager.getItems();
        return allItems.filter(item => item.eventId === eventId);
    }

    /**
     * Update global display across all events
     */
    updateGlobalDisplay() {
        const globalOrderItemsEl = document.getElementById('global-order-items');
        const globalFinalTotalEl = document.getElementById('global-final-total');
        const globalCheckoutBtn = document.getElementById('global-checkout-button');

        // Get all items from CartManager
        const allItems = this.cartManager ? this.cartManager.getItems() : [];
        let globalTotal = 0;

        // Clear existing global order items
        if (globalOrderItemsEl) {
            globalOrderItemsEl.innerHTML = '';
        }

        // Group tickets by event for display
        const eventGroups = new Map();
        allItems.forEach((ticket) => {
            const eventId = ticket.eventId;
            if (!eventGroups.has(eventId)) {
                eventGroups.set(eventId, []);
            }
            eventGroups.get(eventId).push(ticket);
        });

        // Display tickets grouped by event
        eventGroups.forEach((tickets, eventId) => {
            const eventTotal = tickets.reduce((sum, ticket) => sum + (ticket.quantity * ticket.price), 0);
            globalTotal += eventTotal;

            if (globalOrderItemsEl) {
                // Add event header
                const eventHeader = document.createElement('div');
                eventHeader.className = 'order-event-header';
                eventHeader.innerHTML = `<strong>${this.getEventDisplayName(eventId)}</strong>`;
                globalOrderItemsEl.appendChild(eventHeader);

                // Add tickets for this event
                tickets.forEach((ticket) => {
                    const itemAmount = ticket.quantity * ticket.price;
                    const orderItem = document.createElement('div');
                    orderItem.className = 'order-item';
                    orderItem.innerHTML = `
                        <span>${ticket.name} × ${ticket.quantity}</span>
                        <span>$${itemAmount}</span>
                    `;
                    globalOrderItemsEl.appendChild(orderItem);
                });
            }
        });

        if (globalFinalTotalEl) {
            globalFinalTotalEl.textContent = globalTotal;
        }

        if (globalCheckoutBtn) {
            globalCheckoutBtn.disabled = globalTotal === 0;
        }
    }

    /**
     * Get display name for event
     */
    getEventDisplayName(eventId) {
        const eventNames = {
            'boulder-fest-2026': 'Boulder Fest 2026',
            'boulder-fest-2025': 'Boulder Fest 2025',
            'weekender-2026-09': 'Weekender Sept 2026'
        };
        return eventNames[eventId] || eventId;
    }

    /**
     * Handle checkout for a specific event
     */
    handleEventCheckout(eventId) {
        const eventTickets = this.getEventTicketsFromCart(eventId);
        if (!eventTickets || eventTickets.length === 0) {
            return;
        }

        console.log(`Checkout initiated for ${eventId}:`, eventTickets);
        
        // Trigger payment integration for this event
        if (window.PaymentIntegration) {
            window.PaymentIntegration.initiatePayment(eventTickets, eventId);
        } else {
            alert(`Checkout for ${this.getEventDisplayName(eventId)} - Integration with payment processor will be added.`);
        }
    }

    /**
     * Handle global checkout across all events
     */
    handleGlobalCheckout() {
        const allTickets = this.cartManager ? this.cartManager.getItems() : [];
        if (allTickets.length === 0) {
            return;
        }

        console.log('Global checkout initiated:', allTickets);
        
        // Trigger payment integration for all selected tickets
        if (window.PaymentIntegration) {
            window.PaymentIntegration.initiatePayment(allTickets, 'multi-event');
        } else {
            alert('Global checkout - Integration with payment processor will be added.');
        }
    }

    /**
     * Backward compatibility method - get selected tickets in legacy format
     * @deprecated Use cartManager.getItems() directly instead
     */
    getSelectedTickets() {
        if (!this.cartManager) return new Map();
        
        const items = this.cartManager.getItems();
        const legacyMap = new Map();
        
        items.forEach(item => {
            legacyMap.set(item.ticketType, {
                quantity: item.quantity,
                price: item.price,
                name: item.name,
                eventId: item.eventId
            });
        });
        
        return legacyMap;
    }

    /**
     * Backward compatibility method - get event tickets in legacy format
     * @deprecated Use getEventTicketsFromCart() instead
     */
    getEventTickets() {
        if (!this.cartManager) return new Map();
        
        const legacyEventMap = new Map();
        this.events.forEach(eventId => {
            const eventTickets = this.getEventTicketsFromCart(eventId);
            const eventMap = new Map();
            
            eventTickets.forEach(item => {
                eventMap.set(item.ticketType, {
                    quantity: item.quantity,
                    price: item.price,
                    name: item.name,
                    eventId: item.eventId
                });
            });
            
            legacyEventMap.set(eventId, eventMap);
        });
        
        return legacyEventMap;
    }

    /**
     * Get cart manager instance (for external access)
     */
    getCartManager() {
        return this.cartManager;
    }

    /**
     * Helper method to check if cart has items
     */
    hasItems() {
        return this.cartManager ? !this.cartManager.isEmpty() : false;
    }

    /**
     * Helper method to get total items count
     */
    getTotalItemCount() {
        return this.cartManager ? this.cartManager.getItemCount() : 0;
    }

    /**
     * Helper method to get total amount
     */
    getTotalAmount() {
        return this.cartManager ? this.cartManager.getTotal() : 0;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.ticket-selection')) {
        window.ticketSelection = new TicketSelection();
    }
});