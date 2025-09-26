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
        // Initialize ticket cards with default attributes for testing
        this.initializeTicketCards();

        this.bindEvents();

        // CRITICAL FIX: Wait for cart manager to be fully initialized
        await this.waitForCartManager();

        this.syncWithCartState();
        this.updateDisplay();
    }

    initializeTicketCards() {
        // Set up initial test attributes on all ticket cards
        document.querySelectorAll('.ticket-card').forEach((card) => {
            // Initialize with default state for E2E test reliability
            card.setAttribute('data-quantity', '0');
            card.setAttribute('data-selected', 'false');
            card.setAttribute('aria-pressed', 'false');
            card.setAttribute('data-initialized', 'true');

            // Make sure quantity displays are initialized
            const quantitySpan = card.querySelector('.quantity');
            if (quantitySpan && !quantitySpan.textContent) {
                quantitySpan.textContent = '0';
            }

            // Initialize add to cart buttons with ready state
            const addToCartBtn = card.querySelector('.add-to-cart-btn');
            if (addToCartBtn) {
                addToCartBtn.setAttribute('data-action-state', 'ready');
                // Ensure button is immediately clickable for E2E tests
                addToCartBtn.disabled = false;
            }

            // Set up quantity control buttons
            const qtyButtons = card.querySelectorAll('.qty-btn');
            qtyButtons.forEach(btn => {
                btn.setAttribute('data-ready', 'true');
                btn.disabled = false;
            });
        });
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

        // Add to cart button events
        document.querySelectorAll('.add-to-cart-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => this.handleAddToCartClick(e));
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
            card.setAttribute('data-quantity', currentQuantity.toString());
            card.setAttribute('data-selected', 'true');
        } else {
            this.selectedTickets.delete(ticketType);
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
            card.setAttribute('data-quantity', '0');
            card.setAttribute('data-selected', 'false');
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

    handleAddToCartClick(event) {
        event.stopPropagation();
        const btn = event.target;
        const ticketType = btn.dataset.ticketType;
        const price = parseInt(btn.dataset.price);

        if (!ticketType || !price) {
            console.error('Missing ticket data for add to cart button');
            return;
        }

        // Find corresponding ticket card
        const card = document.querySelector(`[data-ticket-type="${ticketType}"]`);
        if (!card) {
            console.error('Could not find ticket card for', ticketType);
            return;
        }

        // Get current quantity
        const quantitySpan = card.querySelector('.quantity');
        let currentQuantity = parseInt(quantitySpan.textContent) || 0;

        // Add one ticket
        currentQuantity++;
        quantitySpan.textContent = currentQuantity;

        // Update internal state
        this.selectedTickets.set(ticketType, {
            quantity: currentQuantity,
            price: price,
            name: card.querySelector('h4').textContent
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');

        // Add test attributes for better E2E testing
        card.setAttribute('data-quantity', currentQuantity.toString());
        card.setAttribute('data-selected', 'true');

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

        // Show visual feedback with test-friendly attributes
        btn.textContent = 'Added!';
        btn.setAttribute('data-action-state', 'added');
        btn.style.backgroundColor = 'var(--color-green, #28a745)';

        setTimeout(() => {
            btn.textContent = 'Add to Cart';
            btn.setAttribute('data-action-state', 'ready');
            btn.style.backgroundColor = 'var(--color-blue)';
        }, 1000);
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

            // Skip TEST- tickets (managed by Test Dashboard)
            if (ticketType && ticketType.startsWith('TEST-')) {
                return;
            }

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
                    card.setAttribute('data-quantity', quantity.toString());
                    card.setAttribute('data-selected', 'true');
                } else {
                    this.selectedTickets.delete(ticketType);
                    card.classList.remove('selected');
                    card.setAttribute('aria-pressed', 'false');
                    card.setAttribute('data-quantity', '0');
                    card.setAttribute('data-selected', 'false');
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
