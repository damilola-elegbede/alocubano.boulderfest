/**
 * Global Cart Component - A Lo Cubano Boulder Fest
 * Displays cart icon with item count on all pages when cart has items
 */

class GlobalCart {
    constructor() {
        this.isVisible = false;
        this.itemCount = 0;
        this.totalAmount = 0;
        
        this.init();
    }

    init() {
        this.createGlobalCartHTML();
        this.bindEvents();
        this.loadCartState();
        this.startPeriodicUpdates();
        
        // Make globally accessible
        window.globalCart = this;
        
        // Listen for storage changes (cross-tab sync)
        window.addEventListener('storage', (e) => {
            if (e.key === 'alocubano_cart') {
                this.loadCartState();
            }
        });

        // Listen for cart updates from floating cart
        document.addEventListener('cartUpdated', (e) => {
            this.updateFromCartData(e.detail);
        });
    }

    /**
     * Create the global cart icon HTML
     */
    createGlobalCartHTML() {
        const cartHTML = `
            <div class="global-cart-icon" id="global-cart-icon" style="display: none;" role="button" tabindex="0" aria-label="View shopping cart">
                <div class="global-cart-content">
                    <div class="global-cart-icon-wrapper">
                        <svg class="global-cart-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="m1 1 4 4 3.09 11.73A2 2 0 0 0 10.16 19H20.5a2 2 0 0 0 2-1.81L23 8H7"></path>
                        </svg>
                        <span class="global-cart-badge" id="global-cart-badge">0</span>
                    </div>
                </div>
            </div>
        `;

        // Try to insert into header-right container first, fallback to body
        const headerRight = document.getElementById('header-right');
        if (headerRight) {
            headerRight.insertAdjacentHTML('beforeend', cartHTML);
        } else {
            // Fallback for pages without header-right container
            document.body.insertAdjacentHTML('beforeend', cartHTML);
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        const cartIcon = document.getElementById('global-cart-icon');
        
        // Click handler - navigate to tickets page
        cartIcon.addEventListener('click', () => {
            this.navigateToTickets();
        });

        // Keyboard handler
        cartIcon.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.navigateToTickets();
            }
        });

        // Hover effects
        cartIcon.addEventListener('mouseenter', () => {
            this.showHoverEffect();
        });

        cartIcon.addEventListener('mouseleave', () => {
            this.hideHoverEffect();
        });
    }

    /**
     * Navigate to tickets page
     */
    navigateToTickets() {
        // Add smooth transition effect
        const cartIcon = document.getElementById('global-cart-icon');
        cartIcon.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            window.location.href = '/tickets';
        }, 150);
    }

    /**
     * Load cart state from localStorage
     */
    loadCartState() {
        try {
            const stored = localStorage.getItem('alocubano_cart');
            if (stored) {
                const { cartData, timestamp, version } = JSON.parse(stored);
                
                // Only load if data is less than 7 days old and version matches
                const sevenDaysAgo = 7 * 24 * 60 * 60 * 1000;
                if (Date.now() - timestamp < sevenDaysAgo && version === '1.0') {
                    this.updateFromStoredData(cartData);
                    return true;
                }
            }
        } catch (error) {
            console.warn('Could not load cart state:', error);
        }
        
        // Hide cart if no valid data
        this.hideCart();
        return false;
    }

    /**
     * Update cart from stored data
     */
    updateFromStoredData(cartData) {
        let totalItems = 0;
        let totalAmount = 0;

        cartData.forEach(([ticketType, ticket]) => {
            totalItems += ticket.quantity;
            totalAmount += ticket.quantity * ticket.price;
        });

        this.itemCount = totalItems;
        this.totalAmount = totalAmount;
        
        this.updateDisplay();
    }

    /**
     * Update from cart data (when called from floating cart)
     */
    updateFromCartData(cartSummary) {
        this.itemCount = cartSummary.itemCount;
        this.totalAmount = cartSummary.totalAmount;
        
        this.updateDisplay();
    }

    /**
     * Update the display
     */
    updateDisplay() {
        const cartIcon = document.getElementById('global-cart-icon');
        const badge = document.getElementById('global-cart-badge');

        if (this.itemCount > 0) {
            this.showCart();
            badge.textContent = this.itemCount;
            
            // Add pulse animation when cart updates
            cartIcon.classList.add('cart-pulse');
            setTimeout(() => cartIcon.classList.remove('cart-pulse'), 600);
        } else {
            this.hideCart();
        }
    }

    /**
     * Show the cart icon
     */
    showCart() {
        const cartIcon = document.getElementById('global-cart-icon');
        if (!this.isVisible) {
            this.isVisible = true;
            cartIcon.style.display = 'flex';
            
            // Animate in
            setTimeout(() => {
                cartIcon.classList.add('visible');
            }, 10);
        }
    }

    /**
     * Hide the cart icon
     */
    hideCart() {
        const cartIcon = document.getElementById('global-cart-icon');
        if (this.isVisible) {
            this.isVisible = false;
            cartIcon.classList.remove('visible');
            
            // Hide after animation
            setTimeout(() => {
                cartIcon.style.display = 'none';
            }, 300);
        }
    }

    /**
     * Show hover effect
     */
    showHoverEffect() {
        const cartIcon = document.getElementById('global-cart-icon');
        cartIcon.classList.add('hovering');
    }

    /**
     * Hide hover effect
     */
    hideHoverEffect() {
        const cartIcon = document.getElementById('global-cart-icon');
        cartIcon.classList.remove('hovering');
    }

    /**
     * Start periodic updates to sync with localStorage
     */
    startPeriodicUpdates() {
        // Check for cart updates every 2 seconds
        setInterval(() => {
            this.loadCartState();
        }, 2000);
    }

    /**
     * Dispatch cart update event
     */
    dispatchCartUpdate() {
        const event = new CustomEvent('globalCartUpdate', {
            detail: {
                itemCount: this.itemCount,
                totalAmount: this.totalAmount,
                isVisible: this.isVisible
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Get current cart state
     */
    getCartState() {
        return {
            itemCount: this.itemCount,
            totalAmount: this.totalAmount,
            isVisible: this.isVisible
        };
    }
}

// Initialize global cart when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize on all pages except tickets (which has its own floating cart)
    const isTicketsPage = window.location.pathname.includes('/tickets') || 
                         document.querySelector('.ticket-selection');
    
    if (!isTicketsPage) {
        window.globalCart = new GlobalCart();
    }
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalCart;
}