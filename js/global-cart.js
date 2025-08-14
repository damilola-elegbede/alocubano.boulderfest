/**
 * Global Cart Initialization
 * Sets up cart system on all pages
 */
import { getCartManager } from './lib/cart-manager.js';
import { initializeFloatingCart } from './floating-cart.js';

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGlobalCart);
} else {
    initializeGlobalCart();
}

async function initializeGlobalCart() {
    try {
    // Get cart manager instance
        const cartManager = getCartManager();

        // Initialize cart
        await cartManager.initialize();

        // Initialize floating cart UI
        initializeFloatingCart(cartManager);

        // Set up page-specific integrations
        setupPageIntegrations(cartManager);

        // Set up global debugging
        setupGlobalDebugging(cartManager);
    } catch {

    }
}

function setupPageIntegrations(cartManager) {
    const currentPath = window.location.pathname;

    if (
        currentPath.includes('/tickets') ||
    currentPath.includes('tickets.html')
    ) {
        setupTicketsPageIntegration(cartManager);
    } else if (
        currentPath.includes('/donations') ||
    currentPath.includes('donations.html')
    ) {
        setupDonationsPageIntegration(cartManager);
    }
}

function setupTicketsPageIntegration(cartManager) {
    // Listen for ticket selection updates
    document.addEventListener('ticket-quantity-changed', async(event) => {
        const { ticketType, quantity, price, name, eventId } = event.detail;

        try {
            if (quantity > 0) {
                // Use upsert operation that handles both add and update in one call
                await cartManager.upsertTicket({
                    ticketType,
                    quantity,
                    price,
                    name,
                    eventId
                });
            } else {
                await cartManager.removeTicket(ticketType);
            }
        } catch {

            // Show user notification if needed
        }
    });

    // Listen for direct ticket quantity updates
    document.addEventListener('ticket-quantity-updated', async(event) => {
        const { ticketType, quantity } = event.detail;

        try {
            await cartManager.updateTicketQuantity(ticketType, quantity);
        } catch {

        }
    });
}

function setupDonationsPageIntegration(cartManager) {
    // Listen for donation amount additions to cart
    document.addEventListener('donation-amount-changed', async(event) => {
        const { amount } = event.detail;

        // Only add to cart if amount is greater than 0
        if (amount > 0) {
            try {
                await cartManager.addDonation(amount);
            } catch {

            }
        }
    });
}

function setupGlobalDebugging(cartManager) {
    // Add global debugging functions for development only
    const isDevelopment = () => {
    // Check multiple indicators for development environment
        return (
            window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.port === '3000' ||
      window.location.port === '8080' ||
      window.location.search.includes('debug=true') ||
      localStorage.getItem('dev_mode') === 'true'
        );
    };

    if (typeof window !== 'undefined' && isDevelopment()) {
        const debugEventListeners = [];

        window.cartDebug = {
            getState: () => cartManager.getState(),
            getDebugInfo: () => cartManager.getDebugInfo(),
            clearCart: () => cartManager.clear(),
            addTestTicket: () =>
                cartManager.addTicket({
                    ticketType: 'test',
                    price: 25,
                    name: 'Test Ticket',
                    eventId: 'test-event',
                    quantity: 1
                }),
            addTestDonation: (amount = 10) => cartManager.addDonation(amount),
            simulate: {
                ticketAdded: (ticketType = 'general') => {
                    document.dispatchEvent(
                        new CustomEvent('ticket-quantity-changed', {
                            detail: {
                                ticketType,
                                quantity: 1,
                                price: 50,
                                name: 'General Admission',
                                eventId: 'main-event'
                            }
                        })
                    );
                },
                donationAdded: (amount = 25) => {
                    document.dispatchEvent(
                        new CustomEvent('donation-amount-changed', {
                            detail: { amount }
                        })
                    );
                }
            },
            // Cleanup function to remove event listeners and debug tools
            cleanup: () => {
                debugEventListeners.forEach(({ target, event, handler }) => {
                    target.removeEventListener(event, handler);
                });
                debugEventListeners.length = 0;
                delete window.cartDebug;
            }
        };

        // Listen for cart events and log them in development
        const cartUpdatedHandler = () => {

        };
        const ticketAddedHandler = () => {

        };
        const donationUpdatedHandler = () => {

        };

        cartManager.addEventListener('cart:updated', cartUpdatedHandler);
        cartManager.addEventListener('cart:ticket:added', ticketAddedHandler);
        cartManager.addEventListener(
            'cart:donation:updated',
            donationUpdatedHandler
        );

        // Track listeners for cleanup
        debugEventListeners.push(
            {
                target: cartManager,
                event: 'cart:updated',
                handler: cartUpdatedHandler
            },
            {
                target: cartManager,
                event: 'cart:ticket:added',
                handler: ticketAddedHandler
            },
            {
                target: cartManager,
                event: 'cart:donation:updated',
                handler: donationUpdatedHandler
            }
        );
    }
}
