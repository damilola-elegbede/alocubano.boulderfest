/**
 * Global Cart Component - A Lo Cubano Boulder Fest
 * Displays cart icon with item count on all pages when cart has items
 * Uses CartManager as single source of truth
 */

class GlobalCart {
    constructor() {
        this.isVisible = false;
        this.cartManager = null; // Will be initialized with CartManager instance
        
        this.init();
    }

    async init() {
        try {
            // Wait for CartManager to be available globally
            await this.waitForCartManager();
            
            // Initialize CartManager and wait for it to load
            this.cartManager = window.CartManager.getInstance();
            await this.cartManager.waitForLoad();
            
            this.createGlobalCartHTML();
            this.bindEvents();
            this.bindCartManagerEvents();
            this.updateDisplay();
            
            // Make globally accessible
            window.globalCart = this;
            
            console.log('GlobalCart initialized successfully with CartManager');
        } catch (error) {
            console.error('Error initializing GlobalCart:', error);
            // Graceful fallback - initialize without CartManager
            this.createGlobalCartHTML();
            this.bindEvents();
            this.updateDisplay();
            window.globalCart = this;
        }
    }

    /**
     * Wait for CartManager to be available globally
     */
    async waitForCartManager() {
        return new Promise((resolve) => {
            // Check if CartManager is already available
            if (window.CartManager) {
                resolve();
                return;
            }
            
            // Poll for CartManager availability with timeout
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max wait
            const interval = setInterval(() => {
                attempts++;
                
                if (window.CartManager) {
                    clearInterval(interval);
                    resolve();
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    console.warn('CartManager not found after waiting, proceeding without it');
                    resolve();
                }
            }, 100);
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
     * Bind CartManager event listeners
     */
    bindCartManagerEvents() {
        if (!this.cartManager) return;
        
        // Listen to CartManager events with namespaced event names
        this.cartManager.addEventListener('alocubano:cart:loaded', (e) => {
            console.log('CartManager loaded, updating global cart display');
            this.updateDisplay();
        });
        
        this.cartManager.addEventListener('alocubano:cart:updated', (e) => {
            console.log('CartManager updated, refreshing global cart display');
            this.updateDisplay();
        });
        
        this.cartManager.addEventListener('alocubano:cart:cleared', (e) => {
            console.log('CartManager cleared, updating global cart display');
            this.updateDisplay();
        });
        
        this.cartManager.addEventListener('alocubano:cart:expired', (e) => {
            console.log('Cart expired, hiding global cart');
            this.updateDisplay();
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
     * Update the display
     */
    updateDisplay() {
        const cartIcon = document.getElementById('global-cart-icon');
        const badge = document.getElementById('global-cart-badge');

        // Get data from CartManager instead of internal state
        let itemCount = 0;
        if (this.cartManager) {
            itemCount = this.cartManager.getItemCount();
        }

        if (itemCount > 0) {
            this.showCart();
            badge.textContent = itemCount;
            
            // Add pulse animation when cart updates
            cartIcon.classList.add('cart-pulse');
            setTimeout(() => cartIcon.classList.remove('cart-pulse'), 600);
        } else {
            this.hideCart();
        }
        
        // Update aria-label for better accessibility
        const ariaLabel = itemCount > 0 
            ? `View shopping cart - ${itemCount} item${itemCount !== 1 ? 's' : ''}`
            : 'View shopping cart - empty';
        cartIcon.setAttribute('aria-label', ariaLabel);
        
        // Dispatch compatibility event for backward compatibility
        this.dispatchCartUpdate();
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
     * Dispatch cart update event (for compatibility with existing code)
     */
    dispatchCartUpdate() {
        let itemCount = 0;
        let totalAmount = 0;
        
        if (this.cartManager) {
            itemCount = this.cartManager.getItemCount();
            totalAmount = this.cartManager.getTotal();
        }
        
        const event = new CustomEvent('globalCartUpdate', {
            detail: {
                itemCount: itemCount,
                totalAmount: totalAmount,
                isVisible: this.isVisible
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Get current cart state
     */
    getCartState() {
        let itemCount = 0;
        let totalAmount = 0;
        
        if (this.cartManager) {
            itemCount = this.cartManager.getItemCount();
            totalAmount = this.cartManager.getTotal();
        }
        
        return {
            itemCount: itemCount,
            totalAmount: totalAmount,
            isVisible: this.isVisible
        };
    }
}

// Initialize global cart when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize on all pages except tickets (which has its own floating cart)
    const isTicketsPage = window.location.pathname.includes('/tickets') || 
                         document.querySelector('.ticket-selection');
    
    if (!isTicketsPage) {
        try {
            window.globalCart = new GlobalCart();
        } catch (error) {
            console.error('Failed to initialize GlobalCart:', error);
        }
    }
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalCart;
}