/**
 * Floating Cart UI Component
 * Mobile-first responsive cart interface
 */
export function initializeFloatingCart(cartManager) {
    // Check if already initialized
    if (document.querySelector('.floating-cart-container')) {
        return;
    }

    // Create cart HTML structure
    const cartHTML = createCartHTML();
    document.body.insertAdjacentHTML('beforeend', cartHTML);

    // Get DOM references
    const elements = {
        container: document.querySelector('.floating-cart-container'),
        button: document.querySelector('.floating-cart-button'),
        panel: document.querySelector('.floating-cart-panel'),
        badge: document.querySelector('.cart-badge'),
        itemsContainer: document.querySelector('.cart-items'),
        totalElement: document.querySelector('.cart-total-amount'),
        emptyMessage: document.querySelector('.cart-empty-message'),
        backdrop: document.querySelector('.cart-backdrop'),
        closeButton: document.querySelector('.cart-close'),
        checkoutButton: document.querySelector('.cart-checkout-btn'),
        clearButton: document.querySelector('.cart-clear-btn')
    };

    // Set up event listeners
    setupEventListeners(elements, cartManager);

    // Initial render
    updateCartUI(elements, cartManager.getState());

    // Listen for cart updates
    cartManager.addEventListener('cart:updated', (event) => {
        updateCartUI(elements, event.detail);
    });

    cartManager.addEventListener('cart:initialized', (event) => {
        updateCartUI(elements, event.detail);
    });
}

function createCartHTML() {
    return `
        <div class="floating-cart-container">
            <!-- Backdrop -->
            <div class="cart-backdrop"></div>
            
            <!-- Floating Button -->
            <button class="floating-cart-button" aria-label="View cart">
                <svg class="cart-icon" viewBox="0 0 24 24" width="24" height="24">
                    <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
                <span class="cart-badge" style="display: none;">0</span>
            </button>
            
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
                    <button class="cart-checkout-btn" disabled>
                        Proceed to Checkout
                    </button>
                    <button class="cart-clear-btn" aria-label="Clear cart">
                        Clear cart
                    </button>
                </div>
            </div>
        </div>
    `;
}

function setupEventListeners(elements, cartManager) {
    // Toggle cart panel
    elements.button.addEventListener('click', () => {
        toggleCartPanel(elements, true, cartManager);
    });

    // Close cart panel
    elements.closeButton.addEventListener('click', () => {
        toggleCartPanel(elements, false, cartManager);
    });

    // Close on backdrop click
    elements.backdrop.addEventListener('click', () => {
        toggleCartPanel(elements, false, cartManager);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && elements.panel.classList.contains('open')) {
            toggleCartPanel(elements, false, cartManager);
        }
    });

    // Quantity adjustment handlers
    elements.itemsContainer.addEventListener('click', async(event) => {
        const button = event.target.closest('.qty-adjust');
        if (!button) {
            return;
        }

        const cartItem = button.closest('.cart-item');
        const ticketType = cartItem.dataset.ticketType;
        const action = button.dataset.action;

        if (ticketType && action) {
            await handleQuantityAdjustment(cartManager, ticketType, action);
        }
    });

    // Remove donation handler
    elements.itemsContainer.addEventListener('click', async(event) => {
        const removeButton = event.target.closest('.remove-donation');
        if (removeButton) {
            const donationId = removeButton.dataset.donationId;
            if (donationId) {
                await cartManager.removeDonation(donationId);
            }
        }
    });

    // Checkout button handler
    elements.checkoutButton.addEventListener('click', () => {
        // Track analytics
        if (cartManager && cartManager.analytics) {
            cartManager.analytics.trackCartEvent('checkout_clicked', {
                total: cartManager.getState().totals.total,
                itemCount: cartManager.getState().totals.itemCount
            });
        }

        handleCheckoutClick(cartManager);
    });

    // Clear cart button handler
    elements.clearButton.addEventListener('click', async() => {
        // Show confirmation dialog to prevent accidental data loss
        const userConfirmed = await showClearCartConfirmation(cartManager.getState());

        if (!userConfirmed) {
            return; // User cancelled
        }

        await cartManager.clear();

        // Show success message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'cart-clear-message';
        messageDiv.textContent = 'Cart cleared';
        messageDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--color-blue);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(91, 107, 181, 0.3);
            z-index: 10000;
            font-family: var(--font-display);
            font-weight: 700;
            animation: slideInUp 0.3s ease-out;
        `;
        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.style.animation = 'slideOutDown 0.3s ease-out';
            setTimeout(() => messageDiv.remove(), 300);
        }, 1500);
    });
}

async function handleQuantityAdjustment(cartManager, ticketType, action) {
    const currentState = cartManager.getState();
    const ticket = currentState.tickets[ticketType];

    if (!ticket) {
        return;
    }

    let newQuantity = ticket.quantity;
    if (action === 'increase') {
        newQuantity += 1;
    } else if (action === 'decrease') {
        newQuantity -= 1;
    }

    await cartManager.updateTicketQuantity(ticketType, newQuantity);
}

function handleCheckoutClick(cartManager) {
    const cartState = cartManager.getState();

    if (cartState.isEmpty) {
        return;
    }

    // Track checkout initiation
    if (window.gtag) {
        try {
            window.gtag('event', 'begin_checkout', {
                currency: 'USD',
                value: cartState.totals.total,
                items: Object.values(cartState.tickets).map(ticket => ({
                    item_id: ticket.ticketType,
                    item_name: ticket.name,
                    category: 'ticket',
                    quantity: ticket.quantity,
                    price: ticket.price
                }))
            });
        } catch (error) {
            // Analytics tracking failed - continue silently
        }
    }

    // Store cart state securely in sessionStorage to avoid URL length limits
    // and prevent exposing sensitive data in URLs
    try {
        sessionStorage.setItem('checkout_cart', JSON.stringify(cartState));
        window.location.href = '/tickets?checkout=true';
    } catch (error) {
        // Fallback if sessionStorage is not available
        console.warn('sessionStorage not available, using basic checkout flow');
        window.location.href = '/tickets?checkout=true';
    }
}

function toggleCartPanel(elements, isOpen, cartManager) {
    if (isOpen) {
        elements.panel.classList.add('open');
        elements.backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Focus management for accessibility
        elements.closeButton.focus();

        // Track analytics
        if (cartManager && cartManager.analytics) {
            cartManager.analytics.trackCartEvent('cart_opened', {
                itemCount: cartManager.getState().totals.itemCount
            });
        }
    } else {
        elements.panel.classList.remove('open');
        elements.backdrop.classList.remove('active');
        document.body.style.overflow = '';

        // Return focus to button
        elements.button.focus();
    }
}

function updateCartUI(elements, cartState) {
    const { totals = {}, isEmpty, tickets, donations } = cartState;

    // Update badge
    if ((totals.itemCount > 0) || (totals.donationCount > 0)) {
        const totalItems = totals.itemCount + (totals.donationCount || 0);
        elements.badge.textContent = totalItems || '•';
        elements.badge.style.display = 'flex';

        // Add pulse animation for updates
        elements.badge.classList.add('pulse');
        setTimeout(() => {
            elements.badge.classList.remove('pulse');
        }, 300);
    } else {
        elements.badge.style.display = 'none';
    }

    // Update content visibility
    if (isEmpty) {
        elements.emptyMessage.style.display = 'block';
        elements.itemsContainer.style.display = 'none';
        elements.checkoutButton.disabled = true;
        if (elements.clearButton) {
            elements.clearButton.style.display = 'none';
        }
    } else {
        elements.emptyMessage.style.display = 'none';
        elements.itemsContainer.style.display = 'block';
        elements.checkoutButton.disabled = false;
        if (elements.clearButton) {
            elements.clearButton.style.display = 'block';
        }

        // Render items
        renderCartItems(elements.itemsContainer, tickets, donations);
    }

    // Update total
    elements.totalElement.textContent = `$${totals.total.toFixed(2)}`;

    // Show/hide floating button based on cart contents
    const hasItems = totals.itemCount > 0 || totals.donationCount > 0;

    if (hasItems || totals.total > 0) {
        elements.container.style.display = 'block';
        elements.button.style.opacity = '1';
        elements.button.style.pointerEvents = 'auto';
    } else {
        elements.container.style.display = 'none';
    }
}

function renderCartItems(container, tickets, donations) {
    let html = '';

    // Render tickets category
    const ticketValues = Object.values(tickets);
    if (ticketValues.length > 0) {
        html += `
            <div class="cart-category">
                <h4 class="cart-category-header tickets">A Lo Cubano 2026 Tickets</h4>
        `;

        ticketValues.forEach(ticket => {
            const itemTotal = ticket.price * ticket.quantity;
            html += `
                <div class="cart-item" data-ticket-type="${ticket.ticketType}">
                    <div class="cart-item-info">
                        <h4>${escapeHtml(ticket.name)}</h4>
                        <p class="cart-item-price">$${ticket.price.toFixed(2)} × ${ticket.quantity} = $${itemTotal.toFixed(2)}</p>
                    </div>
                    <div class="cart-item-actions">
                        <button class="qty-adjust minus" data-action="decrease" aria-label="Decrease quantity">−</button>
                        <span class="qty-display">${ticket.quantity}</span>
                        <button class="qty-adjust plus" data-action="increase" aria-label="Increase quantity">+</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    }

    // Render donations category
    if (donations && donations.length > 0) {
        html += `
            <div class="cart-category">
                <h4 class="cart-category-header">Donations</h4>
        `;

        donations.forEach(donation => {
            html += `
                <div class="cart-item" data-donation-id="${donation.id}">
                    <div class="cart-item-info">
                        <h4>${escapeHtml(donation.name)}</h4>
                        <p class="cart-item-price">$${donation.amount.toFixed(2)}</p>
                    </div>
                    <button class="remove-donation" data-donation-id="${donation.id}" aria-label="Remove donation">×</button>
                </div>
            `;
        });

        html += '</div>';
    }

    container.innerHTML = html;
}

// Security utility
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Clear cart confirmation dialog
async function showClearCartConfirmation(cartState) {
    return new Promise((resolve) => {
        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'confirmation-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.style.cssText = `
            background: var(--color-white);
            border-radius: 12px;
            padding: var(--space-xl);
            max-width: 400px;
            margin: var(--space-lg);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            text-align: center;
            font-family: var(--font-body);
        `;

        const ticketCount = Object.keys(cartState.tickets).length;
        const donationCount = cartState.donations.length;
        const totalItems = ticketCount + donationCount;

        modal.innerHTML = `
            <h3 style="color: var(--color-blue); margin-bottom: var(--space-lg); font-family: var(--font-display);">
                Clear Cart?
            </h3>
            <p style="margin-bottom: var(--space-xl); color: var(--color-text); line-height: 1.4;">
                This will remove all ${totalItems} item${totalItems !== 1 ? 's' : ''} from your cart 
                ${ticketCount > 0 ? `(${ticketCount} ticket${ticketCount !== 1 ? 's' : ''})` : ''}
                ${ticketCount > 0 && donationCount > 0 ? ' and ' : ''}
                ${donationCount > 0 ? `(${donationCount} donation${donationCount !== 1 ? 's' : ''})` : ''}.
                This action cannot be undone.
            </p>
            <div class="confirmation-buttons" style="display: flex; gap: var(--space-md); justify-content: center;">
                <button class="confirm-cancel" style="
                    padding: var(--space-md) var(--space-lg);
                    border: 2px solid var(--color-blue);
                    background: transparent;
                    color: var(--color-blue);
                    border-radius: 6px;
                    font-family: var(--font-display);
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Keep Cart</button>
                <button class="confirm-clear" style="
                    padding: var(--space-md) var(--space-lg);
                    border: none;
                    background: var(--color-red);
                    color: white;
                    border-radius: 6px;
                    font-family: var(--font-display);
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Clear Cart</button>
            </div>
        `;

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        // Add hover effects
        const cancelBtn = modal.querySelector('.confirm-cancel');
        const clearBtn = modal.querySelector('.confirm-clear');

        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.background = 'var(--color-blue)';
            cancelBtn.style.color = 'white';
        });
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.background = 'transparent';
            cancelBtn.style.color = 'var(--color-blue)';
        });

        clearBtn.addEventListener('mouseenter', () => {
            clearBtn.style.background = '#d32f2f';
        });
        clearBtn.addEventListener('mouseleave', () => {
            clearBtn.style.background = 'var(--color-red)';
        });

        // Handle button clicks
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(backdrop);
            resolve(false);
        });

        clearBtn.addEventListener('click', () => {
            document.body.removeChild(backdrop);
            resolve(true);
        });

        // Handle backdrop click (cancel)
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                document.body.removeChild(backdrop);
                resolve(false);
            }
        });

        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(backdrop);
                document.removeEventListener('keydown', handleEscape);
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Focus the cancel button initially (safer default)
        cancelBtn.focus();
    });
}

// Export for potential use in global-cart.js
window.initializeFloatingCart = initializeFloatingCart;