/**
 * Ticket Selection and Dynamic Pricing
 * Handles ticket selection, quantity management, and price calculation
 */

import { getStripePaymentHandler } from './lib/stripe-integration.js';

class TicketSelection {
    constructor() {
        this.selectedTickets = new Map();
        this.stripeHandler = null;
        this.paymentModal = null;
        this.init();
    }

    async init() {
        this.bindEvents();

        // CRITICAL FIX: Wait for cart manager to be fully initialized
        await this.waitForCartManager();

        this.syncWithCartState();
        this.updateDisplay();
    }

    async waitForCartManager() {
        return new Promise((resolve) => {
            // Check if cart manager is already available
            if (window.cartDebug && window.cartDebug.getState) {
                resolve();
                return;
            }

            // Wait for cart initialization event
            const handleCartInit = () => {
                document.removeEventListener('cart:initialized', handleCartInit);
                resolve();
            };

            document.addEventListener('cart:initialized', handleCartInit);

            // Timeout after 5 seconds to prevent infinite waiting
            setTimeout(() => {
                document.removeEventListener('cart:initialized', handleCartInit);
                console.warn('Cart manager initialization timeout - proceeding anyway');
                resolve();
            }, 5000);
        });
    }

    bindEvents() {
    // Quantity button events
        document.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleQuantityChange(e));
        });

        // Ticket card click events and keyboard accessibility
        document.querySelectorAll('.ticket-card').forEach(card => {
            // Make cards keyboard accessible
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            card.setAttribute('aria-pressed', 'false');

            // Click events
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('qty-btn')) {
                    this.handleTicketCardClick(e);
                }
            });

            // Keyboard events for accessibility
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!e.target.classList.contains('qty-btn')) {
                        this.handleTicketCardClick(e);
                    }
                }
            });
        });

        // Checkout button removed - checkout handled by floating cart

        // Listen for cart manager events (real-time updates)
        document.addEventListener('cart:updated', () => {
            this.syncWithCartState();
        });

        document.addEventListener('cart:ticket:added', () => {
            this.syncWithCartState();
        });

        document.addEventListener('cart:ticket:removed', () => {
            this.syncWithCartState();
        });

        document.addEventListener('cart:ticket:updated', () => {
            this.syncWithCartState();
        });

        // Listen for direct localStorage changes (cross-tab sync)
        window.addEventListener('storage', (event) => {
            if (event.key === 'alocubano_cart') {
                this.syncWithCartState();
            }
        });

        // Listen for checkout event from floating cart
        document.addEventListener('cart:checkout', () => {
            this.handleCheckout();
        });
    }

    handleQuantityChange(event) {
        event.stopPropagation();
        const btn = event.target;
        const card = btn.closest('.ticket-card');
        const ticketType = card.dataset.ticketType;
        const price = parseInt(card.dataset.price);
        const action = btn.dataset.action;
        const quantitySpan = card.querySelector('.quantity');

        let currentQuantity = parseInt(quantitySpan.textContent) || 0;

        if (action === 'increase') {
            currentQuantity++;
        } else if (action === 'decrease' && currentQuantity > 0) {
            currentQuantity--;
        }

        quantitySpan.textContent = currentQuantity;

        if (currentQuantity > 0) {
            this.selectedTickets.set(ticketType, {
                quantity: currentQuantity,
                price: price,
                name: card.querySelector('h4').textContent
            });
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');
        } else {
            this.selectedTickets.delete(ticketType);
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
        }

        this.updateDisplay();

        // Emit event for cart system integration
        const eventDetail = {
            ticketType,
            quantity: currentQuantity,
            price,
            name: card.querySelector('h4').textContent,
            eventId: 'alocubano-boulderfest-2026'
        };

        document.dispatchEvent(new CustomEvent('ticket-quantity-changed', {
            detail: eventDetail
        }));
    }

    handleTicketCardClick(event) {
        const card = event.currentTarget;
        const quantitySpan = card.querySelector('.quantity');
        const currentQuantity = parseInt(quantitySpan.textContent) || 0;

        if (currentQuantity === 0) {
            // Add one ticket
            const plusBtn = card.querySelector('.qty-btn.plus');
            plusBtn.click();
        }
    }

    updateDisplay() {
    // Order summary and total display removed - handled by floating cart
    // This method is kept for potential future use or other display updates
    }

    syncWithCartState() {
    // Check if cart data exists in localStorage
        const cartData = localStorage.getItem('alocubano_cart');
        let cartState = {};

        if (cartData) {
            try {
                cartState = JSON.parse(cartData);
            } catch (error) {
                console.warn('Failed to parse cart state:', error);
                return;
            }
        }

        const cartTickets = cartState.tickets || {};

        // Reset all ticket cards first
        document.querySelectorAll('.ticket-card').forEach(card => {
            const ticketType = card.dataset.ticketType;
            const quantitySpan = card.querySelector('.quantity');

            if (quantitySpan) {
                // Check if this ticket is in the cart
                const cartTicket = cartTickets[ticketType];
                const quantity = cartTicket ? cartTicket.quantity : 0;

                // Update UI quantity
                quantitySpan.textContent = quantity;

                // Update internal state
                if (quantity > 0) {
                    this.selectedTickets.set(ticketType, {
                        quantity: quantity,
                        price: cartTicket.price,
                        name: cartTicket.name
                    });
                    card.classList.add('selected');
                    card.setAttribute('aria-pressed', 'true');
                } else {
                    this.selectedTickets.delete(ticketType);
                    card.classList.remove('selected');
                    card.setAttribute('aria-pressed', 'false');
                }
            }
        });
    }

    async handleCheckout() {
        // Get cart state from cart manager
        const cartState = window.cartDebug?.getState() || {};
        const tickets = cartState.tickets || {};
        
        if (Object.keys(tickets).length === 0) {
            alert('Please select at least one ticket before checking out.');
            return;
        }

        // Calculate total from cart
        const total = Object.values(tickets).reduce((sum, ticket) => {
            return sum + (ticket.price * ticket.quantity);
        }, 0);
        
        // Build order data
        const orderData = {
            amount: total,
            orderType: 'tickets',
            orderDetails: {
                tickets: Object.entries(tickets).map(([type, data]) => ({
                    type,
                    quantity: data.quantity,
                    price: data.price,
                    name: data.name
                })),
                totalAmount: total,
                eventId: 'alocubano-boulderfest-2026'
            }
        };

        // Show payment form modal
        this.showPaymentModal(orderData);
    }

    showPaymentModal(orderData) {
        // Create payment modal HTML
        const modalHTML = `
            <div id="payment-modal" class="payment-modal">
                <div class="payment-content">
                    <h2>Complete Your Purchase</h2>
                    <div class="order-summary">
                        <h3>Order Summary</h3>
                        <div class="order-items">
                            ${orderData.orderDetails.tickets.map(ticket => `
                                <div class="order-item">
                                    <span>${ticket.name} (x${ticket.quantity})</span>
                                    <span>$${(ticket.price * ticket.quantity).toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <p style="font-weight: bold; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e0e0e0;">
                            Total: $${orderData.amount.toFixed(2)}
                        </p>
                    </div>
                    
                    <form id="payment-form">
                        <div class="customer-info">
                            <input type="text" id="firstName" placeholder="First Name" required>
                            <input type="text" id="lastName" placeholder="Last Name" required>
                            <input type="email" id="email" placeholder="Email" required>
                            <input type="tel" id="phone" placeholder="Phone (optional)">
                        </div>
                        
                        <div id="card-element">
                            <!-- Stripe card element will be mounted here -->
                        </div>
                        <div id="card-errors" role="alert"></div>
                        
                        <div class="payment-buttons">
                            <button type="button" id="cancel-payment">Cancel</button>
                            <button type="submit" id="submit-payment">Pay $${orderData.amount.toFixed(2)}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.paymentModal = document.getElementById('payment-modal');
        
        // Initialize Stripe handler if not already done
        if (!this.stripeHandler) {
            this.stripeHandler = getStripePaymentHandler();
        }
        
        // Mount Stripe card element
        this.stripeHandler.mountCardElement('card-element');
        
        // Handle form submission
        document.getElementById('payment-form').addEventListener('submit', (e) => {
            this.handlePaymentSubmit(e, orderData);
        });
        
        // Handle cancel
        document.getElementById('cancel-payment').addEventListener('click', () => {
            this.closePaymentModal();
        });

        // Close modal on escape key
        document.addEventListener('keydown', this.handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                this.closePaymentModal();
            }
        });
    }

    async handlePaymentSubmit(event, orderData) {
        event.preventDefault();
        
        const submitButton = document.getElementById('submit-payment');
        const errorElement = document.getElementById('card-errors');
        
        // Get customer info
        const customerInfo = {
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            phone: document.getElementById('phone').value.trim()
        };
        
        // Validate customer info
        const validation = this.stripeHandler.validateCustomerInfo(customerInfo);
        if (!validation.isValid) {
            errorElement.textContent = Object.values(validation.errors)[0];
            errorElement.style.display = 'block';
            return;
        }
        
        // Process payment
        const result = await this.stripeHandler.processPayment(orderData, customerInfo);
        
        if (result.success) {
            this.showSuccessMessage(result.orderId);
            this.clearCart();
            this.closePaymentModal();
        } else {
            errorElement.textContent = result.error;
            errorElement.style.display = 'block';
        }
    }

    closePaymentModal() {
        if (this.paymentModal) {
            this.paymentModal.remove();
            this.paymentModal = null;
        }
        
        // Remove escape key listener
        if (this.handleEscapeKey) {
            document.removeEventListener('keydown', this.handleEscapeKey);
            this.handleEscapeKey = null;
        }

        // Destroy Stripe elements to clean up
        if (this.stripeHandler) {
            this.stripeHandler.clearCard();
        }
    }

    showSuccessMessage(orderId) {
        const successHTML = `
            <div class="payment-modal">
                <div class="payment-content payment-success">
                    <div class="success-icon"></div>
                    <h3>Payment Successful!</h3>
                    <p>Thank you for your purchase. You will receive a confirmation email shortly.</p>
                    <p style="color: #999; font-size: 0.9rem;">Order ID: ${orderId}</p>
                    <button onclick="window.location.reload()" style="background: #333; color: white; padding: 0.875rem 2rem; border: none; border-radius: 6px; cursor: pointer;">
                        Continue
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', successHTML);
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            document.querySelector('.payment-success').closest('.payment-modal').remove();
        }, 5000);
    }

    clearCart() {
        // Clear selected tickets
        this.selectedTickets.clear();
        
        // Clear cart through cart manager
        if (window.cartDebug?.clearCart) {
            window.cartDebug.clearCart();
        } else {
            // Fallback: clear localStorage directly
            localStorage.removeItem('alocubano_cart');
            
            // Dispatch event to update UI
            document.dispatchEvent(new CustomEvent('cart:cleared'));
        }
        
        // Update display
        this.updateDisplay();
        this.syncWithCartState();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.ticket-selection')) {
        new TicketSelection();
    }
});