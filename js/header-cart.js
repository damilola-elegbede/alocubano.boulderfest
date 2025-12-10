/**
 * Header Cart UI Component
 * Manages the cart navigation button in the header
 * Communicates with the floating cart for cart panel functionality
 */

export function initializeHeaderCart(cartManager) {
    // Check if header cart button exists
    const headerCartButton = document.querySelector('.nav-cart-button');
    if (!headerCartButton) {
        console.warn('Header cart button not found');
        return;
    }

    // Get DOM references for header cart elements only
    const elements = {
        headerButton: document.querySelector('.nav-cart-button'),
        headerBadge: document.querySelector('.nav-cart-badge')
    };

    // Header cart click handler - emit event to open floating cart
    const handleHeaderCartClick = () => {
        // Emit custom event that floating cart can listen to
        document.dispatchEvent(new CustomEvent('header-cart:open-requested'));

        // Also try to call floating cart directly if available
        if (window.floatingCartAPI && typeof window.floatingCartAPI.open === 'function') {
            window.floatingCartAPI.open();
        }
    };

    // Update cart display - only handle header badge
    const updateCartDisplay = (cartState) => {
        // If no cart state passed, get from cart manager (for backward compatibility)
        if (!cartState && cartManager) {
            cartState = cartManager.getState();
        }

        if (!cartState) {
            return;
        }

        const { tickets = {}, donations = [], totals = {} } = cartState;
        // Calculate item counts
        const ticketCount = Object.values(tickets).reduce((sum, ticket) => sum + (ticket.quantity || 0), 0);
        const donationCount = donations.length;
        const totalItems = ticketCount + donationCount;

        // Update header badge
        if (elements.headerBadge) {
            if (totalItems > 0) {
                elements.headerBadge.textContent = totalItems;
                elements.headerBadge.style.display = 'flex';
                elements.headerBadge.classList.add('pulse');
                setTimeout(() => elements.headerBadge.classList.remove('pulse'), 300);
            } else {
                elements.headerBadge.style.display = 'none';
            }
        }
    };

    // Attach event listener to header cart button
    elements.headerButton?.addEventListener('click', handleHeaderCartClick);

    // Listen for cart updates to update badge
    if (cartManager) {
        cartManager.addEventListener('cart:updated', (event) => {
            updateCartDisplay(event.detail);
        });

        cartManager.addEventListener('cart:initialized', (event) => {
            updateCartDisplay(event.detail);
        });
    }

    // Listen for cart-item-arrived events to trigger bounce animation
    document.addEventListener('cart-item-arrived', () => {
        const cartIcon = document.querySelector('.nav-cart-icon');
        if (cartIcon) {
            cartIcon.classList.add('cart-bounce');
            setTimeout(() => cartIcon.classList.remove('cart-bounce'), 400);
        }
    });

    // Initial update
    updateCartDisplay();

    // Return minimal public API - only badge update function
    return {
        updateBadge: updateCartDisplay
    };
}

