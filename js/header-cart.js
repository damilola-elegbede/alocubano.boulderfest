/**
 * Header Cart UI Component
 * Manages cart functionality in the header navigation
 */
import { getStripePaymentHandler } from './lib/stripe-integration.js';
import { getPaymentSelector } from './components/payment-selector.js';
import { setSafeHTML, escapeHtml } from './utils/dom-sanitizer.js';
import { createCartSection, createTicketItemElement, createDonationItemElement } from './floating-cart.js';

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
    const updateCartDisplay = (cartState) => {
        // If no cart state passed, get from cart manager (for backward compatibility)
        if (!cartState && cartManager) {
            cartState = cartManager.getState();
        }

        if (!cartState) {
            return;
        }

        const { tickets = {}, donations = [], totals = {}, isEmpty } = cartState;
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

        // Update cart panel content
        if (isEmpty || totalItems === 0) {
            if (elements.itemsContainer) {
                elements.itemsContainer.style.display = 'none';
            }
            if (elements.emptyMessage) {
                elements.emptyMessage.style.display = 'block';
            }
            if (elements.checkoutButton) {
                elements.checkoutButton.disabled = true;
            }
            if (elements.clearButton) {
                elements.clearButton.style.display = 'none';
            }
        } else {
            if (elements.emptyMessage) {
                elements.emptyMessage.style.display = 'none';
            }
            if (elements.itemsContainer) {
                elements.itemsContainer.style.display = 'block';
                renderCartItems(tickets, donations, elements.itemsContainer, cartManager);
            }
            if (elements.checkoutButton) {
                elements.checkoutButton.disabled = false;
            }
            if (elements.clearButton) {
                elements.clearButton.style.display = 'block';
            }
        }

        // Update total
        if (elements.totalElement) {
            elements.totalElement.textContent = `$${(totals.total || 0).toFixed(2)}`;
        }
    };

    // Render cart items using the proper functions from floating-cart.js
    const renderCartItems = (tickets, donations, container, cartManager) => {
        // Clear container first
        container.innerHTML = '';

        // Render tickets category
        const ticketValues = Object.values(tickets);
        if (ticketValues.length > 0) {
            const ticketsSection = createCartSection('A Lo Cubano 2026 Tickets', 'tickets');

            ticketValues.forEach((ticket) => {
                const itemElement = createTicketItemElement(ticket);
                ticketsSection.appendChild(itemElement);
            });

            container.appendChild(ticketsSection);
        }

        // Render donations category
        if (donations && donations.length > 0) {
            const donationsSection = createCartSection('Donations', 'donations');

            donations.forEach((donation) => {
                const itemElement = createDonationItemElement(donation);
                donationsSection.appendChild(itemElement);
            });

            container.appendChild(donationsSection);
        }

        // Attach event handlers using event delegation on the container
        container.addEventListener('click', async(e) => {
            const target = e.target;
            
            // Handle ticket quantity adjustments
            if (target.classList.contains('qty-adjust')) {
                const action = target.dataset.action;
                const ticketItem = target.closest('.cart-item');
                const ticketType = ticketItem?.dataset.ticketType;
                
                if (ticketType && tickets[ticketType]) {
                    const ticket = tickets[ticketType];
                    if (action === 'decrease' && ticket.quantity > 1) {
                        await cartManager.updateTicketQuantity(ticketType, ticket.quantity - 1);
                        updateCartDisplay();
                    } else if (action === 'increase') {
                        await cartManager.updateTicketQuantity(ticketType, ticket.quantity + 1);
                        updateCartDisplay();
                    }
                }
            }
            
            // Handle donation removal
            if (target.classList.contains('remove-donation')) {
                const donationId = target.dataset.donationId;
                if (donationId) {
                    await cartManager.removeDonation(donationId);
                    updateCartDisplay();
                }
            }
        });
    };

    // Clear cart handler
    elements.clearButton?.addEventListener('click', async() => {
        await cartManager.clear();
        updateCartDisplay();
    });

    // Checkout handler
    elements.checkoutButton?.addEventListener('click', async() => {
        const state = cartManager.getState();
        const items = [...Object.values(state.tickets), ...state.donations];
        if (items.length === 0) {
            return;
        }

        // Show email collection modal
        const emailModal = await showEmailCollectionModal();
        if (!emailModal) {
            return;
        }

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

    // Listen for cart updates
    if (cartManager) {
        cartManager.addEventListener('cart:updated', (event) => {
            updateCartDisplay(event.detail);
        });

        cartManager.addEventListener('cart:initialized', (event) => {
            updateCartDisplay(event.detail);
        });
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