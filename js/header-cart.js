/**
 * Header Cart UI Component
 * Manages cart functionality in the header navigation
 */
import { getStripePaymentHandler } from './lib/stripe-integration.js';
import { getPaymentSelector } from './components/payment-selector.js';
import { setSafeHTML, escapeHtml } from './utils/dom-sanitizer.js';

export function initializeHeaderCart(cartManager) {
    // Check if header cart button exists
    const headerCartButton = document.querySelector('.nav-cart-button');
    if (!headerCartButton) {
        console.warn('Header cart button not found');
        return;
    }

    // Create cart panel HTML structure if it doesn't exist
    if (!document.querySelector('.cart-panel-container')) {
        const cartPanelHTML = createCartPanelHTML();
        document.body.insertAdjacentHTML('beforeend', cartPanelHTML);
    }

    // Get DOM references
    const elements = {
        headerButton: document.querySelector('.nav-cart-button'),
        headerBadge: document.querySelector('.nav-cart-badge'),
        panel: document.querySelector('.floating-cart-panel'),
        itemsContainer: document.querySelector('.cart-items'),
        totalElement: document.querySelector('.cart-total-amount'),
        emptyMessage: document.querySelector('.cart-empty-message'),
        backdrop: document.querySelector('.cart-backdrop'),
        closeButton: document.querySelector('.cart-close'),
        checkoutButton: document.querySelector('.cart-checkout-btn'),
        clearButton: document.querySelector('.cart-clear-btn')
    };

    // Initialize cart state
    let isOpen = false;

    // Event handlers
    const toggleCart = () => {
        isOpen = !isOpen;
        if (isOpen) {
            openCart();
        } else {
            closeCart();
        }
    };

    const openCart = () => {
        elements.panel?.classList.add('open');
        elements.backdrop?.classList.add('active');
        document.body.style.overflow = 'hidden';
        isOpen = true;
    };

    const closeCart = () => {
        elements.panel?.classList.remove('open');
        elements.backdrop?.classList.remove('active');
        document.body.style.overflow = '';
        isOpen = false;
    };

    // Attach event listeners
    elements.headerButton?.addEventListener('click', toggleCart);
    elements.closeButton?.addEventListener('click', closeCart);
    elements.backdrop?.addEventListener('click', closeCart);

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeCart();
        }
    });

    // Update cart display
    const updateCartDisplay = () => {
        if (!cartManager) return;

        const items = cartManager.getItems();
        const total = cartManager.getTotal();
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        // Update header badge
        if (elements.headerBadge) {
            if (itemCount > 0) {
                elements.headerBadge.textContent = itemCount;
                elements.headerBadge.style.display = 'flex';
                elements.headerBadge.classList.add('pulse');
                setTimeout(() => elements.headerBadge.classList.remove('pulse'), 300);
            } else {
                elements.headerBadge.style.display = 'none';
            }
        }

        // Update cart panel content
        if (items.length === 0) {
            if (elements.itemsContainer) elements.itemsContainer.style.display = 'none';
            if (elements.emptyMessage) elements.emptyMessage.style.display = 'block';
            if (elements.checkoutButton) elements.checkoutButton.disabled = true;
            if (elements.clearButton) elements.clearButton.style.display = 'none';
        } else {
            if (elements.emptyMessage) elements.emptyMessage.style.display = 'none';
            if (elements.itemsContainer) {
                elements.itemsContainer.style.display = 'block';
                renderCartItems(items, elements.itemsContainer, cartManager);
            }
            if (elements.checkoutButton) elements.checkoutButton.disabled = false;
            if (elements.clearButton) elements.clearButton.style.display = 'block';
        }

        // Update total
        if (elements.totalElement) {
            elements.totalElement.textContent = `$${total.toFixed(2)}`;
        }
    };

    // Render cart items
    const renderCartItems = (items, container, cartManager) => {
        const ticketItems = items.filter(item => item.type === 'ticket');
        const donationItems = items.filter(item => item.type === 'donation');

        let html = '';

        if (ticketItems.length > 0) {
            html += `
                <div class="cart-category">
                    <h4 class="cart-category-header tickets">Tickets</h4>
                    ${ticketItems.map(item => `
                        <div class="cart-item" data-item-id="${escapeHtml(item.id)}">
                            <div class="cart-item-info">
                                <h4>${escapeHtml(item.name)}</h4>
                                <p class="cart-item-price">$${item.price.toFixed(2)} each</p>
                            </div>
                            <div class="cart-item-actions">
                                <button class="qty-adjust qty-decrease" data-item-id="${escapeHtml(item.id)}" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                                <span class="qty-display">${item.quantity}</span>
                                <button class="qty-adjust qty-increase" data-item-id="${escapeHtml(item.id)}">+</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (donationItems.length > 0) {
            html += `
                <div class="cart-category">
                    <h4 class="cart-category-header">Donations</h4>
                    ${donationItems.map(item => `
                        <div class="cart-item donation-item" data-item-id="${escapeHtml(item.id)}">
                            <div class="cart-item-info">
                                <h4>Donation</h4>
                                <p class="cart-item-price">$${item.price.toFixed(2)}</p>
                            </div>
                            <button class="remove-donation" data-item-id="${escapeHtml(item.id)}">×</button>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        setSafeHTML(container, html);

        // Attach quantity adjustment handlers
        container.querySelectorAll('.qty-decrease').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.dataset.itemId;
                const item = cartManager.getItem(itemId);
                if (item && item.quantity > 1) {
                    cartManager.updateQuantity(itemId, item.quantity - 1);
                    updateCartDisplay();
                }
            });
        });

        container.querySelectorAll('.qty-increase').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.dataset.itemId;
                const item = cartManager.getItem(itemId);
                if (item) {
                    cartManager.updateQuantity(itemId, item.quantity + 1);
                    updateCartDisplay();
                }
            });
        });

        container.querySelectorAll('.remove-donation').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.dataset.itemId;
                cartManager.removeItem(itemId);
                updateCartDisplay();
            });
        });
    };

    // Clear cart handler
    elements.clearButton?.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your cart?')) {
            cartManager.clearCart();
            updateCartDisplay();
        }
    });

    // Checkout handler
    elements.checkoutButton?.addEventListener('click', async () => {
        const items = cartManager.getItems();
        if (items.length === 0) return;

        // Show email collection modal
        const emailModal = await showEmailCollectionModal();
        if (!emailModal) return;

        const { email, firstName, lastName } = emailModal;

        // Show loading state
        showLoadingOverlay();

        try {
            const stripeHandler = await getStripePaymentHandler();
            await stripeHandler.initiateCheckout(items, { email, firstName, lastName });
        } catch (error) {
            console.error('Checkout error:', error);
            hideLoadingOverlay();
            showErrorMessage('There was an error processing your checkout. Please try again.');
        }
    });

    // Subscribe to cart changes
    if (cartManager && typeof cartManager.subscribe === 'function') {
        cartManager.subscribe(updateCartDisplay);
    }

    // Initial update
    updateCartDisplay();

    // Return public API
    return {
        open: openCart,
        close: closeCart,
        toggle: toggleCart,
        update: updateCartDisplay
    };
}

function createCartPanelHTML() {
    return `
        <div class="cart-panel-container">
            <!-- Backdrop -->
            <div class="cart-backdrop"></div>
            
            <!-- Cart Panel -->
            <div class="floating-cart-panel">
                <div class="cart-header">
                    <h3>Your Cart</h3>
                    <button class="cart-close" aria-label="Close cart">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z"/>
                        </svg>
                    </button>
                </div>
                
                <div class="cart-content">
                    <div class="cart-empty-message">
                        <p>Your cart is empty</p>
                        <p>Add tickets or make a donation to get started</p>
                    </div>
                    
                    <div class="cart-items"></div>
                </div>
                
                <div class="cart-footer">
                    <div class="cart-total">
                        <span>Total:</span>
                        <span class="cart-total-amount">$0</span>
                    </div>
                    <button class="cart-checkout-btn" disabled data-testid="checkout-button">
                        Proceed to Checkout
                    </button>
                    <button class="cart-clear-btn" aria-label="Clear cart" data-testid="clear-cart">
                        Clear cart
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Helper functions for checkout flow
async function showEmailCollectionModal() {
    // Implementation would go here
    // For now, return mock data
    return {
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe'
    };
}

function showLoadingOverlay() {
    // Implementation would go here
}

function hideLoadingOverlay() {
    // Implementation would go here
}

function showErrorMessage(message) {
    alert(message); // Simple implementation for now
}