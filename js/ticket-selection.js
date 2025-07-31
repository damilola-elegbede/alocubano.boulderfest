/**
 * Multi-Event Ticket Selection and Dynamic Pricing
 * Handles ticket selection, quantity management, and price calculation across multiple events
 */

class TicketSelection {
    constructor() {
        this.selectedTickets = new Map(); // Global ticket selection across all events
        this.eventTickets = new Map(); // Event-specific ticket selections
        this.events = ['boulder-fest-2026'];
        this.init();
    }

    init() {
        this.initializeEventMaps();
        this.bindEvents();
        this.updateAllDisplays();
    }

    /**
     * Initialize event-specific ticket maps
     */
    initializeEventMaps() {
        this.events.forEach(eventId => {
            this.eventTickets.set(eventId, new Map());
        });
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

        quantitySpan.textContent = currentQuantity;

        // Get ticket name from h5 element (updated structure)
        const ticketNameElement = card.querySelector('h5') || card.querySelector('h4');
        const ticketName = ticketNameElement ? ticketNameElement.textContent : 'Ticket';

        const ticketData = {
            quantity: currentQuantity,
            price: price,
            name: ticketName,
            eventId: eventId
        };

        if (currentQuantity > 0) {
            // Update global tickets map
            this.selectedTickets.set(ticketType, ticketData);
            
            // Update event-specific tickets map
            if (eventId && this.eventTickets.has(eventId)) {
                this.eventTickets.get(eventId).set(ticketType, ticketData);
            }
            
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');
        } else {
            // Remove from global tickets map
            this.selectedTickets.delete(ticketType);
            
            // Remove from event-specific tickets map
            if (eventId && this.eventTickets.has(eventId)) {
                this.eventTickets.get(eventId).delete(ticketType);
            }
            
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
        }

        this.updateAllDisplays();
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
        
        // Notify floating cart of changes
        this.notifyFloatingCart();
    }

    /**
     * Notify floating cart component of ticket changes
     */
    notifyFloatingCart() {
        if (window.floatingCart) {
            // Ensure floating cart is synced with current selections
            setTimeout(() => {
                window.floatingCart.syncWithTicketSelection();
            }, 0);
        }
    }

    /**
     * Update display for a specific event
     */
    updateEventDisplay(eventId) {
        const orderItemsEl = document.getElementById(`order-items-${eventId}`);
        const finalTotalEl = document.getElementById(`final-total-${eventId}`);
        const checkoutBtn = document.getElementById(`checkout-button-${eventId}`);

        if (!this.eventTickets.has(eventId)) return;

        const eventTickets = this.eventTickets.get(eventId);
        let totalAmount = 0;

        // Clear existing order items
        if (orderItemsEl) {
            orderItemsEl.innerHTML = '';
        }

        // Add each selected ticket to event order summary
        eventTickets.forEach((ticket, ticketType) => {
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
     * Update global display across all events
     */
    updateGlobalDisplay() {
        const globalOrderItemsEl = document.getElementById('global-order-items');
        const globalFinalTotalEl = document.getElementById('global-final-total');
        const globalCheckoutBtn = document.getElementById('global-checkout-button');

        let globalTotal = 0;

        // Clear existing global order items
        if (globalOrderItemsEl) {
            globalOrderItemsEl.innerHTML = '';
        }

        // Group tickets by event for display
        const eventGroups = new Map();
        this.selectedTickets.forEach((ticket, ticketType) => {
            const eventId = ticket.eventId;
            if (!eventGroups.has(eventId)) {
                eventGroups.set(eventId, []);
            }
            eventGroups.get(eventId).push({ ticketType, ticket });
        });

        // Display tickets grouped by event
        eventGroups.forEach((tickets, eventId) => {
            const eventTotal = tickets.reduce((sum, { ticket }) => sum + (ticket.quantity * ticket.price), 0);
            globalTotal += eventTotal;

            if (globalOrderItemsEl) {
                // Add event header
                const eventHeader = document.createElement('div');
                eventHeader.className = 'order-event-header';
                eventHeader.innerHTML = `<strong>${this.getEventDisplayName(eventId)}</strong>`;
                globalOrderItemsEl.appendChild(eventHeader);

                // Add tickets for this event
                tickets.forEach(({ ticket }) => {
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
        const eventTickets = this.eventTickets.get(eventId);
        if (!eventTickets || eventTickets.size === 0) {
            return;
        }

        console.log(`Checkout initiated for ${eventId}:`, Array.from(eventTickets.entries()));
        
        // Trigger payment integration for this event
        if (window.PaymentIntegration) {
            const ticketData = Array.from(eventTickets.values());
            window.PaymentIntegration.initiatePayment(ticketData, eventId);
        } else {
            alert(`Checkout for ${this.getEventDisplayName(eventId)} - Integration with payment processor will be added.`);
        }
    }

    /**
     * Handle global checkout across all events
     */
    handleGlobalCheckout() {
        if (this.selectedTickets.size === 0) {
            return;
        }

        console.log('Global checkout initiated:', Array.from(this.selectedTickets.entries()));
        
        // Trigger payment integration for all selected tickets
        if (window.PaymentIntegration) {
            const ticketData = Array.from(this.selectedTickets.values());
            window.PaymentIntegration.initiatePayment(ticketData, 'multi-event');
        } else {
            alert('Global checkout - Integration with payment processor will be added.');
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.ticket-selection')) {
        window.ticketSelection = new TicketSelection();
    }
});