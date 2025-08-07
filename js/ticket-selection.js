/**
 * Ticket Selection and Dynamic Pricing
 * Handles ticket selection, quantity management, and price calculation
 */

class TicketSelection {
    constructor() {
        this.selectedTickets = new Map();
        this.init();
    }

    async init() {
        this.bindEvents();

        // CRITICAL FIX: Wait for cart manager to be fully initialized
        await this.waitForCartManager();

        this.syncWithCartState();
        this.updateDisplay();
    }

    async waitForCartManager() {
        return new Promise((resolve) => {
            // Check if cart manager is already available
            if (window.cartDebug && window.cartDebug.getState) {
                resolve();
                return;
            }

            // Wait for cart initialization event
            const handleCartInit = () => {
                document.removeEventListener('cart:initialized', handleCartInit);
                resolve();
            };

            document.addEventListener('cart:initialized', handleCartInit);

            // Timeout after 5 seconds to prevent infinite waiting
            setTimeout(() => {
                document.removeEventListener('cart:initialized', handleCartInit);
                // Cart manager initialization timeout - proceeding anyway
                resolve();
            }, 5000);
        });
    }

    bindEvents() {
    // Quantity button events
        document.querySelectorAll('.qty-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => this.handleQuantityChange(e));
        });

        // Ticket card click events and keyboard accessibility
        document.querySelectorAll('.ticket-card').forEach((card) => {
            // Skip unavailable tickets
            if (card.classList.contains('unavailable')) {
                card.setAttribute('aria-disabled', 'true');
                return;
            }
            
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

        // Checkout button removed - checkout handled by floating cart

        // Listen for cart manager events (real-time updates)
        document.addEventListener('cart:updated', () => {
            this.syncWithCartState();
        });

        document.addEventListener('cart:ticket:added', () => {
            this.syncWithCartState();
        });

        document.addEventListener('cart:ticket:removed', () => {
            this.syncWithCartState();
        });

        document.addEventListener('cart:ticket:updated', () => {
            this.syncWithCartState();
        });

        // Listen for direct localStorage changes (cross-tab sync)
        window.addEventListener('storage', (event) => {
            if (event.key === 'alocubano_cart') {
                this.syncWithCartState();
            }
        });
    }

    handleQuantityChange(event) {
        event.stopPropagation();
        const btn = event.target;
        const card = btn.closest('.ticket-card');
        
        // Skip if ticket is unavailable
        if (card.classList.contains('unavailable')) {
            return;
        }
        
        const ticketType = card.dataset.ticketType;
        const price = parseInt(card.dataset.price);
        const action = btn.dataset.action;
        const quantitySpan = card.querySelector('.quantity');

        let currentQuantity = parseInt(quantitySpan.textContent) || 0;

        if (action === 'increase') {
            currentQuantity++;
        } else if (action === 'decrease' && currentQuantity > 0) {
            currentQuantity--;
        }

        quantitySpan.textContent = currentQuantity;

        if (currentQuantity > 0) {
            this.selectedTickets.set(ticketType, {
                quantity: currentQuantity,
                price: price,
                name: card.querySelector('h4').textContent
            });
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');
        } else {
            this.selectedTickets.delete(ticketType);
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
        }

        this.updateDisplay();

        // Emit event for cart system integration
        const eventDetail = {
            ticketType,
            quantity: currentQuantity,
            price,
            name: card.querySelector('h4').textContent,
            eventId: 'alocubano-boulderfest-2026'
        };

        document.dispatchEvent(
            new CustomEvent('ticket-quantity-changed', {
                detail: eventDetail
            })
        );
    }

    handleTicketCardClick(event) {
        const card = event.currentTarget;
        
        // Skip if ticket is unavailable
        if (card.classList.contains('unavailable')) {
            return;
        }
        
        const quantitySpan = card.querySelector('.quantity');
        const currentQuantity = parseInt(quantitySpan.textContent) || 0;

        if (currentQuantity === 0) {
            // Add one ticket
            const plusBtn = card.querySelector('.qty-btn.plus');
            plusBtn.click();
        }
    }

    updateDisplay() {
    // Order summary and total display removed - handled by floating cart
    // This method is kept for potential future use or other display updates
    }

    syncWithCartState() {
    // Check if cart data exists in localStorage
        const cartData = localStorage.getItem('alocubano_cart');
        let cartState = {};

        if (cartData) {
            try {
                cartState = JSON.parse(cartData);
            } catch {
                // Failed to parse cart state - invalid JSON
                return;
            }
        }

        const cartTickets = cartState.tickets || {};

        // Reset all ticket cards first
        document.querySelectorAll('.ticket-card').forEach((card) => {
            const ticketType = card.dataset.ticketType;
            const quantitySpan = card.querySelector('.quantity');

            if (quantitySpan) {
                // Check if this ticket is in the cart
                const cartTicket = cartTickets[ticketType];
                const quantity = cartTicket ? cartTicket.quantity : 0;

                // Update UI quantity
                quantitySpan.textContent = quantity;

                // Update internal state
                if (quantity > 0) {
                    this.selectedTickets.set(ticketType, {
                        quantity: quantity,
                        price: cartTicket.price,
                        name: cartTicket.name
                    });
                    card.classList.add('selected');
                    card.setAttribute('aria-pressed', 'true');
                } else {
                    this.selectedTickets.delete(ticketType);
                    card.classList.remove('selected');
                    card.setAttribute('aria-pressed', 'false');
                }
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.ticket-selection')) {
        new TicketSelection();
    }
});
