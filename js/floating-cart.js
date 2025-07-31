/**
 * Floating Cart Component - A Lo Cubano Boulder Fest
 * Handles the floating cart UI using CartManager as single source of truth
 */

// CartManager is available globally via window.CartManager

class FloatingCart {
    constructor() {
        this.isExpanded = false;
        this.cartManager = null; // Will be initialized with CartManager instance
        this.eventNames = {
            'boulder-fest-2026': 'Boulder Fest 2026'
        };
        
        this.init();
    }

    async init() {
        try {
            console.log('FloatingCart: Starting initialization...');
            
            // Initialize CartManager and wait for it to load
            this.cartManager = window.CartManager.getInstance();
            console.log('FloatingCart: CartManager instance obtained');
            
            await this.cartManager.waitForLoad();
            console.log('FloatingCart: CartManager loaded, now creating HTML...');
            
            this.createCartHTML();
            console.log('FloatingCart: HTML created');
            
            this.bindEvents();
            this.bindCartManagerEvents();
            console.log('FloatingCart: Events bound');
            
            this.updateCartDisplay();
            
            // Make cart globally accessible
            window.floatingCart = this;
            
            // Initialize mobile-specific features
            this.initializeMobileFeatures();
            
            console.log('FloatingCart initialized successfully with CartManager');
        } catch (error) {
            console.error('Error initializing FloatingCart:', error);
            // Graceful fallback - initialize without CartManager
            console.log('FloatingCart: Falling back to initialization without CartManager');
            this.createCartHTML();
            this.bindEvents();
            this.updateCartDisplay();
            window.floatingCart = this;
            this.initializeMobileFeatures();
        }
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

        // Check if essential elements exist before binding events
        if (!toggleBtn || !clearBtn || !checkoutBtn) {
            console.error('FloatingCart: Essential cart elements not found, cannot bind events');
            return;
        }

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

        // Check if elements exist before manipulating them
        if (!cart || !toggle || !content) {
            console.warn('FloatingCart: Cannot expand cart - essential elements not found');
            return;
        }

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

        // Check if elements exist before manipulating them
        if (!cart || !toggle || !content) {
            console.warn('FloatingCart: Cannot collapse cart - essential elements not found');
            return;
        }

        this.isExpanded = false;
        cart.classList.remove('expanded');
        toggle.setAttribute('aria-expanded', 'false');
        content.setAttribute('aria-hidden', 'true');
    }

    /**
     * Bind CartManager event listeners
     */
    bindCartManagerEvents() {
        if (!this.cartManager) return;
        
        // Listen to CartManager events with namespaced event names
        this.cartManager.addEventListener('alocubano:cart:loaded', (e) => {
            console.log('FloatingCart: CartManager loaded event received, updating cart display');
            this.updateCartDisplay();
        });
        
        this.cartManager.addEventListener('alocubano:cart:updated', (e) => {
            console.log('FloatingCart: CartManager updated event received, refreshing cart display');
            this.updateCartDisplay();
        });
        
        this.cartManager.addEventListener('alocubano:cart:cleared', (e) => {
            console.log('FloatingCart: CartManager cleared event received, updating cart display');
            this.updateCartDisplay();
        });
        
        this.cartManager.addEventListener('alocubano:cart:expired', (e) => {
            console.log('FloatingCart: Cart expired event received, showing message');
            this.showMessage('Your cart has expired and been cleared.', 'warning');
            this.updateCartDisplay();
        });
    }

    /**
     * Update the cart display
     */
    updateCartDisplay(retryCount = 0) {
        // Check if cart HTML has been created yet
        const floatingCart = document.getElementById('floating-cart');
        if (!floatingCart) {
            console.debug('FloatingCart HTML not ready yet, deferring cart display update (retry', retryCount + 1, ')');
            
            // Limit retries to prevent infinite loops
            if (retryCount < 20) { // Max 1 second of retries (20 * 50ms)
                setTimeout(() => this.updateCartDisplay(retryCount + 1), 50);
            } else {
                console.warn('FloatingCart: Gave up waiting for HTML elements after 20 retries');
            }
            return;
        }
        
        this.updateCartSummary();
        this.updateCartItems();
        this.updateCartFooter();
        
        // Dispatch cart update event for global cart compatibility
        this.dispatchCartUpdate();
    }

    /**
     * Update cart summary (badge and total in header)
     */
    updateCartSummary() {
        const badge = document.getElementById('cart-badge');
        const cartTotal = document.getElementById('cart-total');
        
        // Early return if essential elements don't exist yet
        if (!badge || !cartTotal) {
            console.debug('Cart summary elements not ready yet, skipping update');
            return;
        }
        
        let totalItems = 0;
        let totalAmount = 0;

        if (this.cartManager) {
            totalItems = this.cartManager.getItemCount();
            totalAmount = this.cartManager.getTotal();
        }

        // Update badge
        if (totalItems > 0) {
            badge.textContent = totalItems;
            badge.style.display = 'flex';
            badge.classList.add('pulse-badge');
            // Remove animation class after animation completes
            setTimeout(() => {
                if (badge) {
                    badge.classList.remove('pulse-badge');
                }
            }, 300);
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

        // Early return if essential elements don't exist yet
        if (!itemsContainer) {
            console.warn('FloatingCart: cart-items element not found, cannot update');
            return;
        }

        // Create empty state element if it doesn't exist
        if (!emptyState) {
            const emptyHTML = `
                <div class="cart-empty" id="cart-empty">
                    <svg class="cart-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="m1 1 4 4 3.09 11.73A2 2 0 0 0 10.16 19H20.5a2 2 0 0 0 2-1.81L23 8H7"></path>
                    </svg>
                    <div class="cart-empty-message">Your cart is empty</div>
                    <div class="cart-empty-submessage">Add tickets to get started!</div>
                </div>
            `;
            itemsContainer.insertAdjacentHTML('afterbegin', emptyHTML);
        }
        
        // Get fresh reference to emptyState in case it was recreated
        const currentEmptyState = document.getElementById('cart-empty');
        
        if (!this.cartManager || this.cartManager.isEmpty()) {
            if (currentEmptyState) {
                currentEmptyState.style.display = 'block';
            }
            return;
        }

        if (currentEmptyState) {
            currentEmptyState.style.display = 'none';
        }

        try {
            // Get items from CartManager and group by event
            const items = this.cartManager.getItems();
            const eventGroups = new Map();
            
            items.forEach(ticket => {
                // Extract eventId from ticketType or use default
                const eventId = ticket.eventId || 'boulder-fest-2026';
                if (!eventGroups.has(eventId)) {
                    eventGroups.set(eventId, []);
                }
                eventGroups.get(eventId).push({ ticketType: ticket.ticketType, ticket });
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
            
        } catch (error) {
            console.error('FloatingCart: Error processing cart items:', error);
            
            // Fallback: show error message in cart
            if (itemsContainer) {
                itemsContainer.innerHTML = `
                    <div class="cart-error">
                        <div class="cart-error-message">Error loading cart items</div>
                        <div class="cart-error-detail">Please refresh the page</div>
                    </div>
                `;
            }
        }
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
        console.log(`FloatingCart: adjustQuantity called for ${ticketType}, change: ${change}`);
        
        if (!this.cartManager) {
            console.warn('CartManager not available for quantity adjustment');
            return;
        }

        try {
            const currentItem = this.cartManager.getItem(ticketType);
            console.log('FloatingCart: Current item:', currentItem);
            
            if (!currentItem && change <= 0) {
                console.log('FloatingCart: Cannot decrease non-existent item');
                return; // Can't decrease non-existent item
            }

            const currentQuantity = currentItem ? currentItem.quantity : 0;
            const newQuantity = Math.max(0, currentQuantity + change);
            console.log(`FloatingCart: Current quantity: ${currentQuantity}, New quantity: ${newQuantity}`);

            // Update quantity through CartManager
            if (newQuantity > 0) {
                console.log('FloatingCart: Updating item quantity via CartManager');
                this.cartManager.updateItemQuantity(ticketType, newQuantity);
            } else {
                console.log('FloatingCart: Removing item via CartManager');
                this.cartManager.removeItem(ticketType);
            }

            // Add animation to cart item
            const cartItem = document.querySelector(`.cart-item[data-ticket-type="${ticketType}"]`);
            if (cartItem && newQuantity === 0) {
                console.log('FloatingCart: Adding removal animation');
                cartItem.classList.add('cart-item-removing');
                setTimeout(() => {
                    console.log('FloatingCart: Delayed update after removal animation');
                    this.updateCartDisplay();
                }, 300);
            } else {
                console.log('FloatingCart: No animation needed, CartManager should trigger update');
            }
        } catch (error) {
            console.error('Error adjusting quantity:', error);
            this.showMessage('Error updating cart. Please try again.', 'error');
        }
    }

    /**
     * Update cart footer
     */
    updateCartFooter() {
        const footer = document.getElementById('cart-footer');
        const checkoutBtn = document.getElementById('cart-checkout-btn');
        const footerTotal = document.getElementById('cart-footer-total');

        // Early return if essential elements don't exist yet
        if (!footer || !checkoutBtn || !footerTotal) {
            console.debug('Cart footer elements not ready yet, skipping update');
            return;
        }

        if (this.cartManager && !this.cartManager.isEmpty()) {
            // Get total from CartManager
            const totalAmount = this.cartManager.getTotal();

            // Update footer total
            footerTotal.textContent = this.cartManager.getTotalFormatted();
            
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
        if (!this.cartManager || this.cartManager.isEmpty()) {
            return;
        }

        // Confirm before clearing
        if (!confirm('Are you sure you want to clear your cart?')) {
            return;
        }

        try {
            // Clear cart through CartManager - this will handle DOM updates via restoreSelectionsToDOM
            this.cartManager.clearCart();

            // Show success message
            this.showMessage('Cart cleared successfully!');
        } catch (error) {
            console.error('Error clearing cart:', error);
            this.showMessage('Error clearing cart. Please try again.', 'error');
        }
    }

    /**
     * Handle checkout button click
     */
    handleCheckout() {
        if (!this.cartManager || this.cartManager.isEmpty()) {
            return;
        }

        try {
            // Get cart items from CartManager
            const ticketData = this.cartManager.getItems();
            
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
        } catch (error) {
            console.error('Error during checkout:', error);
            this.showMessage('Error processing checkout. Please try again.', 'error');
        }
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
        
        const backgroundColor = type === 'success' ? '#10b981' : 
                              type === 'warning' ? '#f59e0b' : '#ef4444';
        
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
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
     * Dispatch cart update event for other components (legacy compatibility)
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
        if (!this.cartManager) {
            return {
                itemCount: 0,
                totalAmount: 0,
                items: [],
                isEmpty: true
            };
        }

        return {
            itemCount: this.cartManager.getItemCount(),
            totalAmount: this.cartManager.getTotal(),
            items: this.cartManager.getItems(),
            isEmpty: this.cartManager.isEmpty()
        };
    }
}

// Initialize floating cart when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Only initialize on tickets page
    if (document.querySelector('.ticket-selection')) {
        try {
            window.floatingCart = new FloatingCart();
        } catch (error) {
            console.error('Failed to initialize FloatingCart:', error);
        }
    }
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FloatingCart;
}