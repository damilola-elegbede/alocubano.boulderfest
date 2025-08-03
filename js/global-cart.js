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
        
        console.log('Global cart system initialized');
        
    } catch (error) {
        console.error('Failed to initialize global cart:', error);
    }
}

function setupPageIntegrations(cartManager) {
    const currentPath = window.location.pathname;
    
    if (currentPath.includes('/tickets') || currentPath.includes('tickets.html')) {
        setupTicketsPageIntegration(cartManager);
    } else if (currentPath.includes('/donations') || currentPath.includes('donations.html')) {
        setupDonationsPageIntegration(cartManager);
    }
}

function setupTicketsPageIntegration(cartManager) {
    // Listen for ticket selection updates
    document.addEventListener('ticket-quantity-changed', async (event) => {
        const { ticketType, quantity, price, name, eventId } = event.detail;
        
        try {
            if (quantity > 0) {
                await cartManager.addTicket({
                    ticketType,
                    quantity,
                    price,
                    name,
                    eventId
                });
            } else {
                await cartManager.removeTicket(ticketType);
            }
        } catch (error) {
            console.error('Failed to update cart with ticket:', error);
            // Show user notification if needed
        }
    });

    // Listen for direct ticket quantity updates
    document.addEventListener('ticket-quantity-updated', async (event) => {
        const { ticketType, quantity } = event.detail;
        
        try {
            await cartManager.updateTicketQuantity(ticketType, quantity);
        } catch (error) {
            console.error('Failed to update ticket quantity:', error);
        }
    });
}

function setupDonationsPageIntegration(cartManager) {
    // Listen for donation amount updates
    document.addEventListener('donation-amount-changed', async (event) => {
        const { amount } = event.detail;
        
        try {
            await cartManager.updateDonation(amount);
        } catch (error) {
            console.error('Failed to update donation:', error);
        }
    });
}

function setupGlobalDebugging(cartManager) {
    // Add global debugging functions for development
    if (typeof window !== 'undefined') {
        window.cartDebug = {
            getState: () => cartManager.getState(),
            getDebugInfo: () => cartManager.getDebugInfo(),
            clearCart: () => cartManager.clear(),
            addTestTicket: () => cartManager.addTicket({
                ticketType: 'test',
                price: 25,
                name: 'Test Ticket',
                eventId: 'test-event',
                quantity: 1
            }),
            addTestDonation: (amount = 10) => cartManager.updateDonation(amount),
            simulate: {
                ticketAdded: (ticketType = 'general') => {
                    document.dispatchEvent(new CustomEvent('ticket-quantity-changed', {
                        detail: {
                            ticketType,
                            quantity: 1,
                            price: 50,
                            name: 'General Admission',
                            eventId: 'main-event'
                        }
                    }));
                },
                donationAdded: (amount = 25) => {
                    document.dispatchEvent(new CustomEvent('donation-amount-changed', {
                        detail: { amount }
                    }));
                }
            }
        };
        
        // Listen for cart events and log them in development
        cartManager.addEventListener('cart:updated', (event) => {
            console.log('Cart updated:', event.detail);
        });
        
        cartManager.addEventListener('cart:ticket:added', (event) => {
            console.log('Ticket added to cart:', event.detail);
        });
        
        cartManager.addEventListener('cart:donation:updated', (event) => {
            console.log('Donation updated in cart:', event.detail);
        });
    }
}