/**
 * Ticket Selection and Dynamic Pricing
 * Handles ticket selection, quantity management, and price calculation
 */

class TicketSelection {
    constructor() {
        this.selectedTickets = new Map();
        this.eventId = this.detectEventId();
        this.init();
    }

    // Deterministic mapping table: ticket type -> event ID
    static TICKET_TYPE_TO_EVENT_MAP = {
        // November 2025 Weekender
        '2025-11-weekender-full': 'weekender-2025-11',
        '2025-11-weekender-class': 'weekender-2025-11',

        // Boulder Fest 2026 (commented out tickets)
        '2026-early-bird-full': 'boulderfest-2026',
        '2026-regular-full': 'boulderfest-2026',
        '2026-friday-pass': 'boulderfest-2026',
        '2026-saturday-pass': 'boulderfest-2026',
        '2026-sunday-pass': 'boulderfest-2026',
        '2026-friday-social': 'boulderfest-2026',
        '2026-saturday-social': 'boulderfest-2026',

        // Boulder Fest 2025
        '2025-early-bird-full': 'boulderfest-2025',
        '2025-regular-full': 'boulderfest-2025',
        '2025-friday-pass': 'boulderfest-2025',
        '2025-saturday-pass': 'boulderfest-2025',
        '2025-sunday-pass': 'boulderfest-2025'
    };

    static getEventIdFromTicketType(ticketType) {
        const eventId = TicketSelection.TICKET_TYPE_TO_EVENT_MAP[ticketType];
        if (!eventId) {
            console.error(`❌ No event mapping found for ticket type: ${ticketType}`);
            console.error('Available mappings:', Object.keys(TicketSelection.TICKET_TYPE_TO_EVENT_MAP));
            throw new Error(`No event mapping found for ticket type: ${ticketType}. Add mapping to TICKET_TYPE_TO_EVENT_MAP.`);
        }
        return eventId;
    }

    detectEventId() {
        // Find all ticket types on the current page (including flip cards)
        const ticketCards = document.querySelectorAll('[data-ticket-type]');
        const ticketTypesOnPage = Array.from(ticketCards).map(card => card.dataset.ticketType);

        if (ticketTypesOnPage.length === 0) {
            console.warn('No ticket types found on page, falling back to default');
            return 'boulderfest-2026';
        }

        // Get event ID from first ticket type (all tickets on a page should belong to same event)
        const firstTicketType = ticketTypesOnPage[0];
        const eventId = TicketSelection.getEventIdFromTicketType(firstTicketType);

        // Verify all tickets on page belong to same event
        const eventIds = ticketTypesOnPage.map(type => {
            try {
                return TicketSelection.getEventIdFromTicketType(type);
            } catch (error) {
                console.error(`Failed to map ticket type ${type}:`, error.message);
                throw error;
            }
        });

        const uniqueEventIds = [...new Set(eventIds)];
        if (uniqueEventIds.length > 1) {
            throw new Error(`Mixed events on page! Found tickets for events: ${uniqueEventIds.join(', ')}`);
        }

        console.log(`✅ Detected event ID: ${eventId} from ${ticketTypesOnPage.length} ticket types`);
        return eventId;
    }

    async init() {
        // Initialize ticket cards with default attributes for testing
        this.initializeTicketCards();

        // Sync with cart state immediately - localStorage is always available
        this.syncWithCartState();

        this.bindEvents();

        // Wait for cart manager only for write operations
        await this.waitForCartManager();

        this.updateDisplay();
    }

    initializeTicketCards() {
        // Set up initial test attributes on all ticket cards
        document.querySelectorAll('.ticket-card').forEach((card) => {
            // Initialize with default state for E2E test reliability
            card.setAttribute('data-initialized', 'true');

            // Only set defaults if not already set by syncWithCartState
            if (!card.hasAttribute('data-quantity')) {
                card.setAttribute('data-quantity', '0');
                card.setAttribute('data-selected', 'false');
                card.setAttribute('aria-pressed', 'false');

                // Make sure quantity displays are initialized
                const quantitySpan = card.querySelector('.quantity');
                if (quantitySpan && !quantitySpan.textContent) {
                    quantitySpan.textContent = '0';
                }
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

            // Make cards keyboard accessible (but don't override flip card tabindex)
            if (!card.classList.contains('flip-card')) {
                card.setAttribute('tabindex', '0');
            }
            card.setAttribute('role', 'button');
            card.setAttribute('aria-pressed', 'false');

            // Click events - only handle ticket selection, not flip
            card.addEventListener('click', (e) => {
                if (this.shouldHandleTicketClick(e.target)) {
                    this.handleTicketCardClick(e);
                }
            });

            // Keyboard events for accessibility
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (this.shouldHandleTicketClick(e.target)) {
                        e.preventDefault();
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

    shouldHandleTicketClick(target) {
        // Only handle ticket clicks on quantity buttons or empty card areas
        // Don't interfere with flip functionality
        const isQuantityButton = target.classList.contains('qty-btn') || target.closest('.qty-btn');
        const isQuantityArea = target.classList.contains('quantity-selector') || target.closest('.quantity-selector');
        const isAddToCartBtn = target.classList.contains('add-to-cart-btn') || target.closest('.add-to-cart-btn');

        return isQuantityButton || (isQuantityArea && !isAddToCartBtn);
    }

    handleQuantityChange(event) {
        event.stopPropagation();
        const btn = event.target;
        const card = btn.closest('.ticket-card');

        if (!card) {
            console.error('Could not find ticket card for button', btn);
            return;
        }

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

        // Add visual feedback for cart update
        btn.classList.add('cart-updating');
        quantitySpan.classList.add('updating');

        setTimeout(() => {
            btn.classList.remove('cart-updating');
            quantitySpan.classList.remove('updating');
        }, 500);

        // Get ticket name from either h4 (regular cards) or .ticket-type (vertical design)
        const nameElement = card.querySelector('h4') || card.querySelector('.ticket-type');
        const ticketName = nameElement ? nameElement.textContent.trim() : 'Ticket';

        if (currentQuantity > 0) {
            this.selectedTickets.set(ticketType, {
                quantity: currentQuantity,
                price: price,
                name: ticketName
            });
            card.setAttribute('data-quantity', currentQuantity.toString());
        } else {
            this.selectedTickets.delete(ticketType);
            card.setAttribute('data-quantity', '0');
        }

        this.updateDisplay();

        // Emit event for cart system integration
        const eventDetail = {
            ticketType,
            quantity: currentQuantity,
            price,
            name: ticketName,
            eventId: this.eventId
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

        // Find corresponding ticket card (regular or flip card)
        const card = document.querySelector(`[data-ticket-type="${ticketType}"]`);
        if (!card) {
            console.error('Could not find ticket card for', ticketType);
            return;
        }

        // Get current quantity
        const quantitySpan = card.querySelector('.quantity');
        let currentQuantity = parseInt(quantitySpan.textContent) || 0;

        // Get ticket name from either h4 (regular cards) or .ticket-type (vertical design)
        const nameElement = card.querySelector('h4') || card.querySelector('.ticket-type');
        const ticketName = nameElement ? nameElement.textContent.trim() : 'Ticket';

        // Add one ticket
        currentQuantity++;
        quantitySpan.textContent = currentQuantity;

        // Update internal state
        this.selectedTickets.set(ticketType, {
            quantity: currentQuantity,
            price: price,
            name: ticketName
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
            name: ticketName,
            eventId: this.eventId
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
