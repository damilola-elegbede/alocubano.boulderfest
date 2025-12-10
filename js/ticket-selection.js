/**
 * Ticket Selection and Dynamic Pricing
 * Handles ticket selection, quantity management, and price calculation
 */

import { ticketDataService } from './lib/ticket-data-service.js';
import { getAvailabilityService } from './lib/availability-service.js';
import eventsService from './lib/events-service.js';
import timeManager from './time-manager.js';

class TicketSelection {
    constructor() {
        this.selectedTickets = new Map();
        this.eventId = null;
        this.ticketData = new Map();
        this.isLoading = true;
        this.availabilityService = getAvailabilityService();
        this.init();
    }

    /**
     * Detect event ID synchronously from DOM (no API call)
     * This prevents blocking button initialization
     */
    detectEventIdFromDOM() {
        try {
            // Read event ID directly from first ticket card's data attribute
            const firstCard = document.querySelector('[data-event-id]');
            const eventId = firstCard ? parseInt(firstCard.dataset.eventId) : null;

            console.log('🎫 Detected event ID from DOM:', eventId);

            // Default to boulderfest-2026 (event ID 3) if not found
            return eventId || 3;
        } catch (error) {
            console.error('Failed to detect event ID from DOM:', error);
            return 3; // Default to boulderfest-2026
        }
    }

    /**
     * @deprecated Use detectEventIdFromDOM() instead - this makes unnecessary API call
     */
    async detectEventId() {
        try {
            return await ticketDataService.detectEventIdFromPage();
        } catch (error) {
            console.error('Failed to detect event ID:', error);
            return null; // No default - let it fail
        }
    }

    /**
     * Get event name for a ticket card
     * @param {HTMLElement} card - Ticket card element
     * @returns {Promise<string|null>} Event name or null if not found
     */
    async getEventNameForCard(card) {
        const cardEventId = card.dataset.eventId ? parseInt(card.dataset.eventId) : null;
        if (!cardEventId) return null;

        try {
            return await eventsService.getEventName(cardEventId);
        } catch (error) {
            console.warn(`Failed to get event name for ID ${cardEventId}:`, error);
            return null;
        }
    }

    /**
     * Validate and extract eventId from ticket card
     * @param {HTMLElement} card - The ticket card element
     * @param {string} ticketName - Ticket name for error messages
     * @returns {number} The validated eventId
     * @throws {Error} If eventId is missing or invalid
     */
    validateCardEventId(card, ticketName) {
        if (!card.dataset.eventId) {
            console.error(`Missing data-event-id attribute on ticket card: ${card.dataset.ticketId}`);
            throw new Error(`Ticket ${ticketName} is missing required eventId. Please contact support.`);
        }
        const eventId = parseInt(card.dataset.eventId, 10);
        if (!Number.isFinite(eventId)) {
            console.error(`Invalid data-event-id on ticket card: ${card.dataset.eventId}`);
            throw new Error(`Ticket ${ticketName} has invalid eventId. Please contact support.`);
        }
        return eventId;
    }

    async init() {
        try {
            // Skip loading state for static tickets
            // this.showLoadingState();

            // Skip API loading - tickets are static in HTML
            // await this.loadTicketData();

            // Detect event ID from DOM (synchronous, no API call)
            this.eventId = this.detectEventIdFromDOM();

            // Initialize ticket cards with default attributes for testing
            this.initializeTicketCards();

            // Sync with cart state immediately - localStorage is always available
            this.syncWithCartState();

            this.bindEvents();

            // Mark as loaded immediately - enable user interaction right away
            this.isLoading = false;
            console.log('🎫 [DIAGNOSTIC] Loading complete, isLoading set to false - buttons enabled');

            this.updateDisplay();

            // Background tasks (non-blocking) - cart operations will queue until ready
            Promise.all([
                this.waitForCartManager(),
                this.updateAvailabilityIndicators(),
                eventsService.preloadAndCache().catch(() => {
                    // Non-critical - cart will fall back to API if cache fails
                })
            ]).then(() => {
                console.log('🎫 [DIAGNOSTIC] All background tasks complete');
            }).catch(error => {
                console.error('Background task error (non-critical):', error);
            });

            // Start availability polling for real-time updates
            this.availabilityService.startPolling(30000); // Poll every 30 seconds

            // Listen for availability updates
            this.availabilityService.addListener((tickets) => {
                this.handleAvailabilityUpdate(tickets);
            });

        } catch (error) {
            console.error('Failed to initialize ticket selection:', error);
            this.showErrorState(error.message);
        }
    }

    async loadTicketData() {
        try {
            const tickets = await ticketDataService.loadTicketData();

            // Cache ticket data for quick lookup
            this.ticketData.clear();
            for (const ticket of tickets) {
                // API returns 'id' field as the ticket type identifier
                if (!ticket.id) {
                    throw new Error(`Ticket missing required 'id' field: ${JSON.stringify(ticket)}`);
                }
                this.ticketData.set(ticket.id, ticket);
            }

            this.isLoading = false;
            console.log(`✅ Loaded ${tickets.length} ticket types`);

        } catch (error) {
            this.isLoading = false;
            console.error('Failed to load ticket data:', error);
            throw error;
        }
    }

    showLoadingState() {
        // Add loading class to ticket cards
        document.querySelectorAll('.ticket-card').forEach(card => {
            card.classList.add('loading');
            card.setAttribute('aria-busy', 'true');

            // Disable interactions during loading
            const buttons = card.querySelectorAll('button, .qty-btn, .add-to-cart-btn');
            buttons.forEach(btn => {
                btn.disabled = true;
                btn.setAttribute('data-loading', 'true');
            });
        });
    }

    hideLoadingState() {
        // Remove loading class from ticket cards
        document.querySelectorAll('.ticket-card').forEach(card => {
            card.classList.remove('loading');
            card.removeAttribute('aria-busy');

            // Re-enable interactions
            const buttons = card.querySelectorAll('button, .qty-btn, .add-to-cart-btn');
            buttons.forEach(btn => {
                btn.disabled = false;
                btn.removeAttribute('data-loading');
            });
        });
    }

    showErrorState(message) {
        // Show error message to user
        const errorContainer = document.querySelector('.ticket-selection-error') ||
                              this.createErrorContainer();

        errorContainer.textContent = `Error loading tickets: ${message}`;
        errorContainer.style.display = 'block';

        // Disable all ticket interactions
        document.querySelectorAll('.ticket-card').forEach(card => {
            card.classList.add('disabled');
            card.setAttribute('aria-disabled', 'true');

            const buttons = card.querySelectorAll('button, .qty-btn, .add-to-cart-btn');
            buttons.forEach(btn => {
                btn.disabled = true;
            });
        });
    }

    createErrorContainer() {
        const container = document.createElement('div');
        container.className = 'ticket-selection-error';
        container.style.cssText = `
            background: var(--color-red, #dc3545);
            color: white;
            padding: 1rem;
            margin: 1rem 0;
            border-radius: 4px;
            text-align: center;
            display: none;
        `;

        const ticketSection = document.querySelector('.ticket-selection') || document.body;
        ticketSection.insertBefore(container, ticketSection.firstChild);

        return container;
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

        // Update ticket cards with API data
        this.updateTicketCardsFromAPI();
    }

    async updateTicketCardsFromAPI() {
        // Update ticket cards with data from API
        // Only process cards marked as dynamic
        const dynamicCards = document.querySelectorAll('.ticket-card[data-ticket-id][data-dynamic-tickets="true"]');

        const updatePromises = Array.from(dynamicCards).map(async(card) => {
            const ticketId = card.dataset.ticketId;

            try {
                const ticketData = await ticketDataService.getTicketById(ticketId);
                if (ticketData) {
                    // Update event name
                    const eventNameElement = card.querySelector('.event-name');
                    if (eventNameElement) {
                        eventNameElement.textContent = ticketData.event_name || ticketData.event?.name || 'Event';
                        eventNameElement.removeAttribute('data-loading');
                        eventNameElement.setAttribute('data-loaded', 'true');
                    }

                    // Update ticket type/name
                    const ticketTypeElement = card.querySelector('.ticket-type');
                    if (ticketTypeElement) {
                        ticketTypeElement.textContent = (ticketData.name || 'Ticket').toUpperCase();
                        ticketTypeElement.removeAttribute('data-loading');
                        ticketTypeElement.setAttribute('data-loaded', 'true');
                    }

                    // Update price display
                    const priceElement = card.querySelector('.ticket-price');
                    if (priceElement) {
                        const formattedPrice = `$${(ticketData.price_cents / 100).toFixed(0)}`;
                        priceElement.textContent = formattedPrice;
                        priceElement.removeAttribute('data-loading');
                        priceElement.setAttribute('data-loaded', 'true');
                    }

                    // Update date
                    const dateElement = card.querySelector('.detail-value');
                    if (dateElement) {
                        const eventDate = ticketData.event_date || ticketData.event?.date;
                        if (eventDate) {
                            const formattedDate = timeManager
                                ? timeManager.formatDate(eventDate)
                                : new Date(eventDate).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      timeZone: 'America/Denver'
                                  });
                            dateElement.textContent = formattedDate;
                            dateElement.removeAttribute('data-loading');
                            dateElement.setAttribute('data-loaded', 'true');
                        }
                    }

                    // Update venue
                    const venueElement = card.querySelector('.venue-name');
                    if (venueElement) {
                        venueElement.textContent = ticketData.event_venue || ticketData.event?.venue || 'Venue TBA';
                        venueElement.removeAttribute('data-loading');
                        venueElement.setAttribute('data-loaded', 'true');
                    }

                    // Mark card as successfully loaded
                    card.setAttribute('data-api-loaded', 'true');
                }
            } catch (error) {
                console.error(`Failed to load data for ticket ${ticketId}:`, error);
                // Keep the "Loading..." placeholder or show an error state
                const priceElement = card.querySelector('.ticket-price');
                if (priceElement && priceElement.textContent === 'Loading...') {
                    priceElement.textContent = 'Price unavailable';
                    priceElement.removeAttribute('data-loading');
                    priceElement.setAttribute('data-error', 'true');
                }

                // Mark card as having an error
                card.setAttribute('data-api-error', 'true');
            }
        });

        // Wait for all updates to complete
        await Promise.all(updatePromises);
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
        console.log('🎫 [DIAGNOSTIC] bindEvents called');
        const qtyButtons = document.querySelectorAll('.qty-btn');
        console.log('🎫 [DIAGNOSTIC] Binding events to', qtyButtons.length, 'buttons');

    // Quantity button events
        qtyButtons.forEach((btn, index) => {
            console.log('🎫 [DIAGNOSTIC] Binding button', index, btn.className, btn.dataset.action);
            btn.addEventListener('click', (e) => {
                console.log('🎫 [DIAGNOSTIC] Button clicked!', btn.dataset.action);
                this.handleQuantityChange(e);
            });
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
        const card = target.closest('.ticket-card');
        const isFlipCard = card && card.closest('.flip-card');

        // For non-flip cards, allow Enter/Space on the card itself for accessibility
        if (!isFlipCard && card === target) {
            return true;
        }

        return isQuantityButton || (isQuantityArea && !isAddToCartBtn);
    }

    async handleQuantityChange(event) {
        try {
        console.log('🎫 [DIAGNOSTIC] handleQuantityChange called');
        event.stopPropagation();
        const btn = event.target;
        const card = btn.closest('.ticket-card');

        console.log('🎫 [DIAGNOSTIC] Button:', btn, 'Card:', card);

        if (!card) {
            console.error('🎫 [DIAGNOSTIC] ERROR: Could not find ticket card for button', btn);
            return;
        }

        // Skip if ticket is unavailable or still loading
        if (card.classList.contains('unavailable') || this.isLoading) {
            console.log('🎫 [DIAGNOSTIC] Skipping - unavailable or loading:', {
                unavailable: card.classList.contains('unavailable'),
                isLoading: this.isLoading
            });
            return;
        }

        const ticketType = card.dataset.ticketId;
        const action = btn.dataset.action;
        const quantitySpan = card.querySelector('.quantity');

        console.log('🎫 [DIAGNOSTIC] Ticket type:', ticketType, 'Action:', action);

        // Read ticket data from HTML data attributes (static tickets)
        const price = parseFloat(card.dataset.price) * 100; // Convert dollars to cents
        const ticketName = card.dataset.name;
        const ticketDescription = card.dataset.description || '';

        console.log('🎫 [DIAGNOSTIC] Price:', price, 'Name:', ticketName);

        if (!ticketName || !price) {
            console.error('🎫 [DIAGNOSTIC] ERROR: Missing ticket data in HTML for:', ticketType);
            return;
        }

        let currentQuantity = parseInt(quantitySpan.textContent) || 0;
        let newQuantity = currentQuantity;

        if (action === 'increase') {
            newQuantity = currentQuantity + 1;
            console.log('🎫 [DIAGNOSTIC] Increasing to:', newQuantity);

            // Skip availability check for test tickets (they're not in database)
            const isTestTicket = ticketType.toLowerCase().includes('test');

            if (!isTestTicket) {
                // CRITICAL: Validate availability before increasing quantity
                console.log('🎫 [DIAGNOSTIC] Checking availability for:', ticketType, newQuantity);
                const availabilityCheck = await this.availabilityService.checkAvailability(ticketType, newQuantity);
                console.log('🎫 [DIAGNOSTIC] Availability check result:', availabilityCheck);

                if (!availabilityCheck.available) {
                    console.error('🎫 [DIAGNOSTIC] ERROR: Ticket not available!', availabilityCheck);
                    // Show error message
                    this.showAvailabilityError(card, availabilityCheck.message);

                    // Update card to show sold out/unavailable
                    this.markCardUnavailable(card, availabilityCheck.status, availabilityCheck.remaining);

                    // Prevent quantity increase
                    return;
                }

                console.log('🎫 [DIAGNOSTIC] Availability check passed, updating quantity');
            } else {
                console.log('🎫 [DIAGNOSTIC] Test ticket - skipping availability check');
            }

            currentQuantity = newQuantity;
        } else if (action === 'decrease' && currentQuantity > 0) {
            currentQuantity--;
        }

        quantitySpan.textContent = currentQuantity;

        // Add visual feedback for cart update
        btn.classList.add('cart-updating');
        quantitySpan.classList.add('updating');

        // Fly-to-cart animation (only on increase)
        if (action === 'increase') {
            this.createFlyToCartAnimation(btn, price);
        }

        setTimeout(() => {
            btn.classList.remove('cart-updating');
            quantitySpan.classList.remove('updating');
        }, 500);

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

        const cardEventId = this.validateCardEventId(card, ticketName);

        // Look up event name from events service
        const eventName = await this.getEventNameForCard(card);

        // Emit event for cart system integration
        const eventDetail = {
            ticketType,
            quantity: currentQuantity,
            price,
            name: ticketName,
            description: ticketDescription,
            eventId: cardEventId,
            eventName: eventName
        };

        document.dispatchEvent(
            new CustomEvent('ticket-quantity-changed', {
                detail: eventDetail
            })
        );
            } catch (error) {
            console.error('Error in handleQuantityChange:', error);
            // Show user-friendly error message
            const errorMessage = error.message || 'An error occurred. Please try again.';
            const card = event.target?.closest('.ticket-card') || document.querySelector('.ticket-card');
            if (card) {
                this.showAvailabilityError(card, errorMessage);
            }
        }
    }

    async handleAddToCartClick(event) {
        try {
        event.stopPropagation();
        const btn = event.target;
        const ticketType = btn.dataset.ticketId;

        if (!ticketType) {
            console.error('Missing ticket type for add to cart button');
            return;
        }

        // Skip if still loading (though we don't load anymore for static tickets)
        if (this.isLoading) {
            return;
        }

        // Find corresponding ticket card (regular or flip card)
        const card = document.querySelector(`[data-ticket-id="${ticketType}"]`);
        if (!card) {
            console.error('Could not find ticket card for', ticketType);
            return;
        }

        // Read ticket data from HTML data attributes (static tickets)
        const price = parseFloat(card.dataset.price) * 100; // Convert dollars to cents
        const ticketName = card.dataset.name;
        const ticketDescription = card.dataset.description || '';

        if (!ticketName || !price) {
            console.error(`Missing ticket data in HTML for: ${ticketType}`);
            return;
        }

        // Get current quantity
        const quantitySpan = card.querySelector('.quantity');
        let currentQuantity = parseInt(quantitySpan.textContent) || 0;

        // Skip availability check for test tickets (they're not in database)
        const isTestTicket = ticketType.toLowerCase().includes('test');
        const newQuantity = currentQuantity + 1;

        if (!isTestTicket) {
            // CRITICAL: Validate availability before adding to cart
            const availabilityCheck = await this.availabilityService.checkAvailability(ticketType, newQuantity);

            if (!availabilityCheck.available) {
                // Show error message
                this.showAvailabilityError(card, availabilityCheck.message);

                // Update card to show sold out/unavailable
                this.markCardUnavailable(card, availabilityCheck.status, availabilityCheck.remaining);

                // Update button to show error state
                btn.textContent = 'Unavailable';
                btn.setAttribute('data-action-state', 'unavailable');
                btn.style.backgroundColor = 'var(--color-gray-400, #9ca3af)';
                btn.disabled = true;

                return;
            }
        }

        // Add one ticket
        currentQuantity = newQuantity;
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

        const cardEventId = this.validateCardEventId(card, ticketName);

        // Look up event name from events service
        const eventName = await this.getEventNameForCard(card);

        // Emit event for cart system integration
        const eventDetail = {
            ticketType,
            quantity: currentQuantity,
            price,
            name: ticketName,
            description: ticketDescription,
            eventId: cardEventId,
            eventName: eventName
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

        // Fly-to-cart animation
        this.createFlyToCartAnimation(btn, price);

        setTimeout(() => {
            btn.textContent = 'Add to Cart';
            btn.setAttribute('data-action-state', 'ready');
            btn.style.backgroundColor = 'var(--color-blue)';
        }, 1000);
            } catch (error) {
            console.error('Error in handleAddToCartClick:', error);
            // Show user-friendly error message  
            const errorMessage = error.message || 'An error occurred. Please try again.';
            const btn = event.target;
            const card = btn?.closest('.ticket-card') || document.querySelector('.ticket-card');
            if (card) {
                this.showAvailabilityError(card, errorMessage);
            }
            // Reset button state
            if (btn) {
                btn.textContent = 'Add to Cart';
                btn.setAttribute('data-action-state', 'error');
                btn.style.backgroundColor = 'var(--color-red, #dc3545)';
                setTimeout(() => {
                    btn.setAttribute('data-action-state', 'ready');
                    btn.style.backgroundColor = 'var(--color-blue)';
                }, 2000);
            }
        }
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

    /**
     * Creates a fly-to-cart animation for tickets
     * @param {HTMLElement} sourceBtn - The button that triggered the action
     * @param {number} price - Price in cents
     */
    createFlyToCartAnimation(sourceBtn, price) {
        const cartIcon = document.querySelector('.nav-cart-icon');

        if (!sourceBtn || !cartIcon) return;

        // Check for reduced motion preference
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const btnRect = sourceBtn.getBoundingClientRect();
        const cartRect = cartIcon.getBoundingClientRect();

        // Create flying element with price
        const flyItem = document.createElement('div');
        flyItem.className = 'fly-to-cart-item';
        flyItem.textContent = `$${Math.round(price / 100)}`; // Price in dollars

        // Position at button center
        const startX = btnRect.left + btnRect.width / 2;
        const startY = btnRect.top + btnRect.height / 2;

        flyItem.style.left = `${startX}px`;
        flyItem.style.top = `${startY}px`;

        document.body.appendChild(flyItem);

        // Calculate end position (cart icon center)
        const endX = cartRect.left + cartRect.width / 2;
        const endY = cartRect.top + cartRect.height / 2;

        // Set CSS custom properties for animation
        flyItem.style.setProperty('--fly-x', `${endX - startX}px`);
        flyItem.style.setProperty('--fly-y', `${endY - startY}px`);

        // Trigger animation
        requestAnimationFrame(() => {
            flyItem.classList.add('flying');
        });

        // Dispatch cart-item-arrived event and remove element
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('cart-item-arrived', {
                detail: { type: 'ticket', price }
            }));
            if (flyItem.parentNode) {
                flyItem.parentNode.removeChild(flyItem);
            }
        }, 600);
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
            const ticketType = card.dataset.ticketId;
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

    /**
     * Update real-time availability indicators on all ticket cards
     */
    async updateAvailabilityIndicators() {
        try {
            const availabilityMap = await this.availabilityService.getAllAvailability();

            document.querySelectorAll('.ticket-card').forEach((card) => {
                const ticketType = card.dataset.ticketId;
                if (!ticketType) return;

                const availability = availabilityMap.get(ticketType);
                if (!availability) return;

                // Remove existing availability indicator
                const existingIndicator = card.querySelector('.availability-indicator');
                if (existingIndicator) {
                    existingIndicator.remove();
                }

                // Determine what indicator to show
                let indicator = null;

                if (!availability.available || availability.remaining === 0) {
                    // Sold out badge
                    indicator = this.createAvailabilityBadge('Sold Out', 'sold-out');
                    this.markCardUnavailable(card, 'sold_out', 0);
                } else if (availability.remaining < 10) {
                    // Low stock warning
                    indicator = this.createAvailabilityBadge(`${availability.remaining} left`, 'low-stock');
                } else if (availability.remaining < availability.maxQuantity * 0.2) {
                    // Limited availability
                    indicator = this.createAvailabilityBadge('Limited availability', 'limited');
                }

                // Add indicator to card if needed
                if (indicator) {
                    const header = card.querySelector('.ticket-header');
                    if (header) {
                        header.appendChild(indicator);
                    }
                }
            });

        } catch (error) {
            console.error('Failed to update availability indicators:', error);
        }
    }

    /**
     * Create an availability badge element
     */
    createAvailabilityBadge(text, type) {
        const badge = document.createElement('div');
        badge.className = `availability-indicator availability-${type}`;
        badge.textContent = text;
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-live', 'polite');
        return badge;
    }

    /**
     * Handle availability updates from polling
     */
    handleAvailabilityUpdate(tickets) {
        console.log('✓ Availability updated:', tickets.length, 'ticket types');
        this.updateAvailabilityIndicators();
    }

    /**
     * Show availability error message
     */
    showAvailabilityError(card, message) {
        // Create error toast
        const errorToast = document.createElement('div');
        errorToast.className = 'availability-error-toast';
        errorToast.textContent = message;
        errorToast.setAttribute('role', 'alert');
        errorToast.setAttribute('aria-live', 'assertive');

        document.body.appendChild(errorToast);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            errorToast.classList.add('fade-out');
            setTimeout(() => errorToast.remove(), 300);
        }, 4000);

        // Also add visual feedback to the card
        card.classList.add('availability-error');
        setTimeout(() => card.classList.remove('availability-error'), 2000);
    }

    /**
     * Mark a ticket card as unavailable
     */
    markCardUnavailable(card, status, remaining) {
        card.classList.add('unavailable');
        card.setAttribute('aria-disabled', 'true');
        card.setAttribute('data-availability-status', status);
        card.setAttribute('data-availability-remaining', remaining.toString());

        // Disable quantity controls
        const qtyButtons = card.querySelectorAll('.qty-btn');
        qtyButtons.forEach(btn => {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
        });

        // Disable add to cart button
        const addToCartBtn = card.querySelector('.add-to-cart-btn');
        if (addToCartBtn) {
            addToCartBtn.disabled = true;
            addToCartBtn.textContent = remaining === 0 ? 'Sold Out' : 'Unavailable';
            addToCartBtn.setAttribute('data-action-state', 'unavailable');
        }
    }

    /**
     * Cleanup on page unload
     */
    destroy() {
        if (this.availabilityService) {
            this.availabilityService.stopPolling();
        }
    }
}

// Initialize when DOM is loaded
let ticketSelectionInstance = null;

function initTicketSelection() {
    console.log('🎫 [DIAGNOSTIC] initTicketSelection called');
    console.log('🎫 [DIAGNOSTIC] document.readyState:', document.readyState);
    console.log('🎫 [DIAGNOSTIC] .ticket-selection exists:', !!document.querySelector('.ticket-selection'));
    console.log('🎫 [DIAGNOSTIC] .qty-btn buttons found:', document.querySelectorAll('.qty-btn').length);

    if (document.querySelector('.ticket-selection')) {
        ticketSelectionInstance = new TicketSelection();
        console.log('🎫 [DIAGNOSTIC] TicketSelection instance created:', !!ticketSelectionInstance);
    } else {
        console.error('🎫 [DIAGNOSTIC] ERROR: .ticket-selection element not found!');
    }
}

// Handle module script timing - module scripts are deferred and may load after DOMContentLoaded
console.log('🎫 [DIAGNOSTIC] Module loading, readyState:', document.readyState);
if (document.readyState === 'loading') {
    // DOM still loading, wait for DOMContentLoaded
    console.log('🎫 [DIAGNOSTIC] Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initTicketSelection);
} else {
    // DOM already loaded (module scripts are deferred), initialize immediately
    console.log('🎫 [DIAGNOSTIC] DOM already loaded, initializing immediately');
    initTicketSelection();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ticketSelectionInstance) {
        ticketSelectionInstance.destroy();
    }
});
