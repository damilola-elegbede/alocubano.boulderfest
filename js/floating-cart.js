/**
 * Floating Cart Component - A Lo Cubano Boulder Fest
 * Handles the floating cart UI and synchronization with ticket selection
 */

class FloatingCart {
    constructor() {
        this.isExpanded = false;
        this.cartData = new Map(); // Stores cart items by ticket type
        this.eventNames = {
            'boulder-fest-2026': 'Boulder Fest 2026'
        };
        
        this.init();
    }

    init() {
        this.createCartHTML();
        this.bindEvents();
        
        // Load from storage first, then sync
        this.loadFromStorage();
        
        // Wait for ticket selection to be ready, then sync
        this.waitForTicketSelectionAndSync();
        
        // Make cart globally accessible
        window.floatingCart = this;
        
        // Listen for storage changes (for cross-tab synchronization)
        window.addEventListener('storage', (e) => {
            if (e.key === 'alocubano_cart') {
                this.loadFromStorage();
                this.updateCartDisplay();
            }
        });
        
        // Auto-save cart changes
        this.setupAutoSave();
        
        // Initialize mobile-specific features
        this.initializeMobileFeatures();
    }

    /**
     * Initialize mobile-specific cart features
     */
    initializeMobileFeatures() {
        // Ensure proper mobile sizing on load
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                this.ensureMobileCartSizing();
            }, 100);
        }

        // Handle mobile keyboard appearance
        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', () => {
                if (this.isExpanded) {
                    const cart = document.getElementById('cart-content');
                    if (cart) {
                        // Adjust cart height when mobile keyboard appears
                        const viewportHeight = window.visualViewport.height;
                        const windowHeight = window.innerHeight;
                        
                        if (viewportHeight < windowHeight * 0.8) {
                            // Keyboard is likely open, reduce cart height
                            cart.style.maxHeight = `${viewportHeight * 0.6}px`;
                        } else {
                            // Keyboard is closed, restore normal height
                            cart.style.maxHeight = '';
                        }
                    }
                }
            });
        }
    }

    /**
     * Create the floating cart HTML structure
     */
    createCartHTML() {
        const cartHTML = `
            <div class="floating-cart" id="floating-cart" role="region" aria-label="Shopping cart">
                <button class="cart-toggle" 
                        id="cart-toggle" 
                        aria-expanded="false" 
                        aria-controls="cart-content"
                        aria-label="Shopping cart - click to expand">
                    <div class="cart-icon-wrapper">
                        <svg class="cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="m1 1 4 4 3.09 11.73A2 2 0 0 0 10.16 19H20.5a2 2 0 0 0 2-1.81L23 8H7"></path>
                            <path d="m7 13 5-5-5-5"></path>
                        </svg>
                        <span class="cart-badge" id="cart-badge" style="display: none;">0</span>
                    </div>
                    <div class="cart-text-info">
                        <span class="cart-text" id="cart-text">CART</span>
                        <span class="cart-total" id="cart-total" style="display: none;">$0.00</span>
                    </div>
                    <span class="cart-arrow" aria-hidden="true">▼</span>
                </button>
                
                <div class="cart-content" id="cart-content" aria-hidden="true">
                    <div class="cart-items" id="cart-items">
                        <div class="cart-empty" id="cart-empty">
                            <svg class="cart-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="9" cy="21" r="1"></circle>
                                <circle cx="20" cy="21" r="1"></circle>
                                <path d="m1 1 4 4 3.09 11.73A2 2 0 0 0 10.16 19H20.5a2 2 0 0 0 2-1.81L23 8H7"></path>
                            </svg>
                            <div class="cart-empty-message">Your cart is empty</div>
                            <div class="cart-empty-submessage">Add tickets to get started!</div>
                        </div>
                    </div>
                    
                    <div class="cart-footer" id="cart-footer" style="display: none;">
                        <div class="cart-total-section">
                            <span class="cart-total-label">Total</span>
                            <span class="cart-total-amount" id="cart-footer-total">$0.00</span>
                        </div>
                        <div class="cart-actions">
                            <button class="cart-checkout-btn" id="cart-checkout-btn" disabled>
                                Proceed to Checkout
                            </button>
                            <button class="cart-clear-btn" id="cart-clear-btn">
                                Clear Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Append to body
        document.body.insertAdjacentHTML('beforeend', cartHTML);
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        const toggleBtn = document.getElementById('cart-toggle');
        const clearBtn = document.getElementById('cart-clear-btn');
        const checkoutBtn = document.getElementById('cart-checkout-btn');

        // Toggle cart expansion
        toggleBtn.addEventListener('click', () => this.toggleCart());
        
        // Clear cart
        clearBtn.addEventListener('click', () => this.clearCart());
        
        // Checkout
        checkoutBtn.addEventListener('click', () => this.handleCheckout());

        // Close cart when clicking outside (only on desktop)
        document.addEventListener('click', (e) => {
            if (window.innerWidth > 768) {
                const cart = document.getElementById('floating-cart');
                if (this.isExpanded && !cart.contains(e.target)) {
                    this.collapseCart();
                }
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isExpanded) {
                this.collapseCart();
                document.getElementById('cart-toggle').focus();
            }
        });

        // Handle window resize for mobile/desktop layout changes
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Handle mobile viewport changes (iOS Safari address bar)
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.handleResize();
            }, 100);
        });

        // Handle mobile browser viewport changes
        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', () => {
                this.adjustCartForMobileViewport();
            });
        }

        // Prevent mobile scroll when cart is expanded
        document.addEventListener('touchmove', (e) => {
            if (this.isExpanded && window.innerWidth <= 768) {
                const cart = document.getElementById('floating-cart');
                if (cart && !cart.contains(e.target)) {
                    e.preventDefault();
                }
            }
        }, { passive: false });
    }

    /**
     * Toggle cart expansion state
     */
    toggleCart() {
        if (this.isExpanded) {
            this.collapseCart();
        } else {
            this.expandCart();
        }
    }

    /**
     * Expand the cart
     */
    expandCart() {
        const cart = document.getElementById('floating-cart');
        const toggle = document.getElementById('cart-toggle');
        const content = document.getElementById('cart-content');

        this.isExpanded = true;
        cart.classList.add('expanded');
        toggle.setAttribute('aria-expanded', 'true');
        content.setAttribute('aria-hidden', 'false');

        // Focus management for accessibility
        content.focus();
    }

    /**
     * Collapse the cart
     */
    collapseCart() {
        const cart = document.getElementById('floating-cart');
        const toggle = document.getElementById('cart-toggle');
        const content = document.getElementById('cart-content');

        this.isExpanded = false;
        cart.classList.remove('expanded');
        toggle.setAttribute('aria-expanded', 'false');
        content.setAttribute('aria-hidden', 'true');
    }

    /**
     * Wait for ticket selection to be ready and then sync
     */
    waitForTicketSelectionAndSync() {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        const checkAndSync = () => {
            if (window.ticketSelection) {
                // If we have saved cart data, restore it to the ticket selection
                if (this.cartData.size > 0) {
                    this.restoreToTicketSelection();
                } else {
                    // Otherwise sync from ticket selection
                    this.syncWithTicketSelection();
                }
                return;
            }
            
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(checkAndSync, 100);
            } else {
                console.warn('Ticket selection system not found, cart will work independently');
                this.updateCartDisplay();
            }
        };
        
        checkAndSync();
    }

    /**
     * Restore saved cart data to the ticket selection system
     */
    restoreToTicketSelection() {
        if (!window.ticketSelection) return;
        
        // Clear existing selections
        window.ticketSelection.selectedTickets.clear();
        window.ticketSelection.events.forEach(eventId => {
            if (window.ticketSelection.eventTickets.has(eventId)) {
                window.ticketSelection.eventTickets.get(eventId).clear();
            }
        });
        
        // Restore saved items
        this.cartData.forEach((ticket, ticketType) => {
            // Find the corresponding ticket card and update it
            const ticketCard = document.querySelector(`[data-ticket-type="${ticketType}"]`);
            if (ticketCard) {
                const quantitySpan = ticketCard.querySelector('.quantity');
                if (quantitySpan) {
                    quantitySpan.textContent = ticket.quantity;
                }
                
                if (ticket.quantity > 0) {
                    ticketCard.classList.add('selected');
                    ticketCard.setAttribute('aria-pressed', 'true');
                }
            }
            
            // Update the ticket selection system
            window.ticketSelection.selectedTickets.set(ticketType, { ...ticket });
            
            const eventId = ticket.eventId;
            if (!window.ticketSelection.eventTickets.has(eventId)) {
                window.ticketSelection.eventTickets.set(eventId, new Map());
            }
            window.ticketSelection.eventTickets.get(eventId).set(ticketType, { ...ticket });
        });
        
        // Update all displays
        if (window.ticketSelection.updateAllDisplays) {
            window.ticketSelection.updateAllDisplays();
        }
        
        this.updateCartDisplay();
    }

    /**
     * Sync cart with the main ticket selection system
     */
    syncWithTicketSelection() {
        if (!window.ticketSelection) {
            return;
        }

        const tickets = window.ticketSelection.selectedTickets;
        this.cartData.clear();

        // Copy data from ticket selection
        tickets.forEach((ticket, ticketType) => {
            if (ticket.quantity > 0) {
                this.cartData.set(ticketType, { ...ticket });
            }
        });

        this.updateCartDisplay();
    }

    /**
     * Update the cart display
     */
    updateCartDisplay() {
        this.updateCartSummary();
        this.updateCartItems();
        this.updateCartFooter();
        
        // Auto-save to storage whenever cart is updated
        this.saveToStorage();
        
        // Dispatch cart update event for global cart
        this.dispatchCartUpdate();
    }

    /**
     * Update cart summary (badge and total in header)
     */
    updateCartSummary() {
        const badge = document.getElementById('cart-badge');
        const cartTotal = document.getElementById('cart-total');
        
        let totalItems = 0;
        let totalAmount = 0;

        this.cartData.forEach(ticket => {
            totalItems += ticket.quantity;
            totalAmount += ticket.quantity * ticket.price;
        });

        // Update badge
        if (totalItems > 0) {
            badge.textContent = totalItems;
            badge.style.display = 'flex';
            badge.classList.add('pulse-badge');
            // Remove animation class after animation completes
            setTimeout(() => badge.classList.remove('pulse-badge'), 300);
        } else {
            badge.style.display = 'none';
        }

        // Update cart total in toggle
        if (totalAmount > 0) {
            cartTotal.textContent = `$${totalAmount.toFixed(2)}`;
            cartTotal.style.display = 'block';
        } else {
            cartTotal.style.display = 'none';
        }
    }

    /**
     * Update cart items display
     */
    updateCartItems() {
        const itemsContainer = document.getElementById('cart-items');
        const emptyState = document.getElementById('cart-empty');

        if (this.cartData.size === 0) {
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Group items by event
        const eventGroups = new Map();
        this.cartData.forEach((ticket, ticketType) => {
            const eventId = ticket.eventId;
            if (!eventGroups.has(eventId)) {
                eventGroups.set(eventId, []);
            }
            eventGroups.get(eventId).push({ ticketType, ticket });
        });

        // Build HTML for cart items
        let itemsHTML = '';
        eventGroups.forEach((tickets, eventId) => {
            const eventName = this.eventNames[eventId] || eventId;
            itemsHTML += `<div class="cart-event-group">`;
            itemsHTML += `<div class="cart-event-title">${eventName}</div>`;
            
            tickets.forEach(({ ticketType, ticket }) => {
                const itemTotal = ticket.quantity * ticket.price;
                itemsHTML += `
                    <div class="cart-item" data-ticket-type="${ticketType}">
                        <div class="cart-item-info">
                            <div class="cart-item-name">${ticket.name}</div>
                            <div class="cart-item-price">$${ticket.price.toFixed(2)} each</div>
                        </div>
                        <div class="cart-quantity-controls">
                            <button class="cart-qty-btn cart-qty-decrease" 
                                    data-ticket-type="${ticketType}" 
                                    aria-label="Decrease quantity">−</button>
                            <span class="cart-quantity-display">${ticket.quantity}</span>
                            <button class="cart-qty-btn cart-qty-increase" 
                                    data-ticket-type="${ticketType}" 
                                    aria-label="Increase quantity">+</button>
                        </div>
                        <div class="cart-item-total">$${itemTotal.toFixed(2)}</div>
                    </div>
                `;
            });
            
            itemsHTML += `</div>`;
        });

        itemsContainer.innerHTML = itemsHTML;

        // Bind quantity control events
        this.bindQuantityControls();
    }

    /**
     * Bind quantity control events in cart
     */
    bindQuantityControls() {
        const increaseButtons = document.querySelectorAll('.cart-qty-increase');
        const decreaseButtons = document.querySelectorAll('.cart-qty-decrease');

        increaseButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ticketType = e.target.dataset.ticketType;
                this.adjustQuantity(ticketType, 1);
            });
        });

        decreaseButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ticketType = e.target.dataset.ticketType;
                this.adjustQuantity(ticketType, -1);
            });
        });
    }

    /**
     * Adjust quantity of a ticket
     */
    adjustQuantity(ticketType, change) {
        // Find the corresponding ticket card in the main interface
        const ticketCard = document.querySelector(`[data-ticket-type="${ticketType}"]`);
        if (!ticketCard) return;

        const quantitySpan = ticketCard.querySelector('.quantity');
        if (!quantitySpan) return;

        const currentQuantity = parseInt(quantitySpan.textContent) || 0;
        const newQuantity = Math.max(0, currentQuantity + change);

        // Update the main ticket selection interface
        quantitySpan.textContent = newQuantity;
        
        // Trigger the main ticket selection update
        if (change > 0) {
            const plusBtn = ticketCard.querySelector('.qty-btn.plus');
            if (plusBtn) {
                // Create a synthetic event to trigger the main system
                const event = new Event('click', { bubbles: true });
                plusBtn.dispatchEvent(event);
            }
        } else {
            const minusBtn = ticketCard.querySelector('.qty-btn.minus');
            if (minusBtn) {
                // Create a synthetic event to trigger the main system
                const event = new Event('click', { bubbles: true });
                minusBtn.dispatchEvent(event);
            }
        }

        // Add animation to cart item
        const cartItem = document.querySelector(`.cart-item[data-ticket-type="${ticketType}"]`);
        if (cartItem) {
            if (newQuantity === 0) {
                cartItem.classList.add('cart-item-removing');
                setTimeout(() => {
                    this.syncWithTicketSelection();
                }, 300);
            }
        }
    }

    /**
     * Update cart footer
     */
    updateCartFooter() {
        const footer = document.getElementById('cart-footer');
        const checkoutBtn = document.getElementById('cart-checkout-btn');
        const footerTotal = document.getElementById('cart-footer-total');

        if (this.cartData.size > 0) {
            // Calculate total for footer
            let totalAmount = 0;
            this.cartData.forEach(ticket => {
                totalAmount += ticket.quantity * ticket.price;
            });

            // Update footer total
            footerTotal.textContent = `$${totalAmount.toFixed(2)}`;
            
            footer.style.display = 'block';
            checkoutBtn.disabled = false;
        } else {
            footer.style.display = 'none';
            checkoutBtn.disabled = true;
        }
    }

    /**
     * Clear all items from cart
     */
    clearCart() {
        if (this.cartData.size === 0) return;

        // Confirm before clearing
        if (!confirm('Are you sure you want to clear your cart?')) {
            return;
        }

        // Reset all quantity selectors in the main interface
        this.cartData.forEach((ticket, ticketType) => {
            const ticketCard = document.querySelector(`[data-ticket-type="${ticketType}"]`);
            if (ticketCard) {
                const quantitySpan = ticketCard.querySelector('.quantity');
                if (quantitySpan) {
                    quantitySpan.textContent = '0';
                }
                ticketCard.classList.remove('selected');
                ticketCard.setAttribute('aria-pressed', 'false');
            }
        });

        // Clear cart data
        this.cartData.clear();

        // Clear from localStorage
        this.clearStorage();

        // Trigger update in main ticket selection system
        if (window.ticketSelection) {
            window.ticketSelection.selectedTickets.clear();
            window.ticketSelection.events.forEach(eventId => {
                if (window.ticketSelection.eventTickets.has(eventId)) {
                    window.ticketSelection.eventTickets.get(eventId).clear();
                }
            });
            window.ticketSelection.updateAllDisplays();
        }

        // Update cart display
        this.updateCartDisplay();

        // Show success message
        this.showMessage('Cart cleared successfully!');
    }

    /**
     * Handle checkout button click
     */
    handleCheckout() {
        if (this.cartData.size === 0) return;

        // Convert cart data to format expected by payment system
        const ticketData = Array.from(this.cartData.values());
        
        // Use global checkout if available
        if (window.ticketSelection) {
            window.ticketSelection.handleGlobalCheckout();
        } else if (window.PaymentIntegration) {
            window.PaymentIntegration.initiatePayment(ticketData, 'floating-cart');
        } else {
            // Fallback - redirect to checkout
            console.log('Checkout initiated from floating cart:', ticketData);
            alert('Checkout functionality will be integrated with the payment system.');
        }

        // Collapse cart after checkout
        this.collapseCart();
    }

    /**
     * Handle window resize and mobile viewport changes
     */
    handleResize() {
        // On mobile, ensure cart is properly positioned
        if (window.innerWidth <= 768) {
            // Mobile layout - cart should be full width at bottom
            if (this.isExpanded) {
                // Ensure proper mobile expansion
                const content = document.getElementById('cart-content');
                if (content) {
                    content.scrollTop = 0;
                    
                    // Handle mobile browser address bar changes
                    this.adjustCartForMobileViewport();
                }
            }
            
            // Ensure cart container is properly sized on mobile
            this.ensureMobileCartSizing();
        }
    }

    /**
     * Adjust cart for mobile viewport changes (address bar hide/show)
     */
    adjustCartForMobileViewport() {
        const cart = document.getElementById('floating-cart');
        if (!cart) return;

        // Force a repaint to handle iOS Safari viewport changes
        cart.style.bottom = '0px';
        
        // Use RAF to ensure proper positioning after viewport change
        requestAnimationFrame(() => {
            cart.style.bottom = '0';
        });
    }

    /**
     * Ensure mobile cart sizing is correct
     */
    ensureMobileCartSizing() {
        const cart = document.getElementById('floating-cart');
        if (!cart) return;

        // Prevent horizontal scrolling on mobile
        cart.style.width = '100%';
        cart.style.maxWidth = '100vw';
        cart.style.overflowX = 'hidden';
        cart.style.left = '0';
        cart.style.right = '0';
    }

    /**
     * Show a temporary message
     */
    showMessage(message, type = 'success') {
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = `cart-message cart-message-${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1001;
            opacity: 0;
            transform: translateX(100px);
            transition: all 0.3s ease;
        `;

        document.body.appendChild(messageEl);

        // Animate in
        setTimeout(() => {
            messageEl.style.opacity = '1';
            messageEl.style.transform = 'translateX(0)';
        }, 10);

        // Remove after delay
        setTimeout(() => {
            messageEl.style.opacity = '0';
            messageEl.style.transform = 'translateX(100px)';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }, 3000);
    }

    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        // Save cart when page is about to unload
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });
        
        // Save cart periodically (every 30 seconds if cart has items)
        setInterval(() => {
            if (this.cartData.size > 0) {
                this.saveToStorage();
            }
        }, 30000);
    }

    /**
     * Save cart to localStorage for session persistence
     */
    saveToStorage() {
        try {
            const cartData = Array.from(this.cartData.entries());
            const cartState = {
                cartData,
                timestamp: Date.now(),
                version: '1.0',
                url: window.location.pathname
            };
            localStorage.setItem('alocubano_cart', JSON.stringify(cartState));
        } catch (error) {
            console.warn('Could not save cart to localStorage:', error);
        }
    }

    /**
     * Load cart from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('alocubano_cart');
            if (stored) {
                const { cartData, timestamp, version } = JSON.parse(stored);
                
                // Only load if data is less than 7 days old and version matches
                const sevenDaysAgo = 7 * 24 * 60 * 60 * 1000;
                if (Date.now() - timestamp < sevenDaysAgo && version === '1.0') {
                    this.cartData = new Map(cartData);
                    console.log('Loaded cart from storage:', this.cartData.size, 'items');
                    return true;
                } else {
                    // Clean up old data
                    this.clearStorage();
                }
            }
        } catch (error) {
            console.warn('Could not load cart from localStorage:', error);
            this.clearStorage();
        }
        return false;
    }

    /**
     * Clear cart from localStorage
     */
    clearStorage() {
        try {
            localStorage.removeItem('alocubano_cart');
        } catch (error) {
            console.warn('Could not clear cart from localStorage:', error);
        }
    }

    /**
     * Dispatch cart update event for other components
     */
    dispatchCartUpdate() {
        const cartSummary = this.getCartSummary();
        const event = new CustomEvent('cartUpdated', {
            detail: cartSummary
        });
        document.dispatchEvent(event);
    }

    /**
     * Get cart summary for external use
     */
    getCartSummary() {
        let totalItems = 0;
        let totalAmount = 0;

        this.cartData.forEach(ticket => {
            totalItems += ticket.quantity;
            totalAmount += ticket.quantity * ticket.price;
        });

        return {
            itemCount: totalItems,
            totalAmount,
            items: Array.from(this.cartData.values()),
            isEmpty: this.cartData.size === 0
        };
    }
}

// Initialize floating cart when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on tickets page
    if (document.querySelector('.ticket-selection')) {
        window.floatingCart = new FloatingCart();
    }
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FloatingCart;
}