/**
 * usePayment - React hook for payment operations
 *
 * Provides payment functionality to React components, bridging to the
 * existing payment APIs. Follows the useCart hook pattern.
 *
 * Usage:
 *   import { usePayment } from './hooks/usePayment';
 *
 *   function CheckoutButton() {
 *     const { processCheckout, isProcessing, error } = usePayment();
 *     // ...
 *   }
 *
 * @module src/hooks/usePayment
 */

import { useContext, useCallback } from 'react';
import { PaymentContext, PaymentMethod } from '../contexts/PaymentContext';

/**
 * Custom hook for accessing payment context and operations
 * @returns {Object} Payment context value and operations
 * @throws {Error} If used outside PaymentProvider
 */
export function usePayment() {
    const context = useContext(PaymentContext);

    if (!context) {
        throw new Error('usePayment must be used within a PaymentProvider');
    }

    const {
        paymentMethod,
        status,
        error,
        isProcessing,
        isReady,
        canSubmit,
        setPaymentMethod,
        setError,
        clearError,
        startProcessing,
        setRedirecting,
        reset,
    } = context;

    /**
     * Transform cart state to API-expected format
     * Follows the pattern from js/components/payment-selector.js
     *
     * @param {Object} cart - Cart state from useCart
     * @returns {Array} Array of cart items for API
     */
    const prepareCartItems = useCallback((cart) => {
        const cartItems = [];

        // Add tickets
        if (cart?.tickets) {
            Object.values(cart.tickets).forEach((ticket) => {
                // Validate required fields - all tickets MUST have these
                if (!ticket.eventName) {
                    throw new Error(`Missing eventName for ticket: ${ticket.name}`);
                }
                if (!ticket.eventDate) {
                    throw new Error(`Missing eventDate for ticket: ${ticket.name}`);
                }
                if (!ticket.ticketType) {
                    throw new Error(`Missing ticketType for ticket: ${ticket.name}`);
                }
                // eventId is REQUIRED - every ticket must have one from the source HTML
                if (ticket.eventId == null) {
                    throw new Error(`Missing eventId for ticket: ${ticket.name}. This indicates a data issue - all tickets must have an eventId.`);
                }
                const eventIdNum = Number(ticket.eventId);
                if (!Number.isFinite(eventIdNum)) {
                    throw new Error(`Invalid eventId "${ticket.eventId}" for ticket: ${ticket.name}. eventId must be a valid number.`);
                }

                // Format date for display
                const formattedDate = formatDateForDisplay(ticket.eventDate);

                // Build product name: "Event Name-Ticket Type"
                const productName = `${ticket.eventName}-${ticket.name}`;

                // Build description with event date
                const description = ticket.description
                    ? `${ticket.description}\nEvent Date: ${formattedDate}`
                    : `Event Date: ${formattedDate}`;

                cartItems.push({
                    type: 'ticket',
                    ticketType: ticket.ticketType,
                    name: productName,
                    description: description,
                    price: ticket.price,
                    quantity: ticket.quantity,
                    eventDate: ticket.eventDate,
                    eventId: eventIdNum,
                    venue: ticket.venue,
                });
            });
        }

        // Add donations
        if (cart?.donations && cart.donations.length > 0) {
            cart.donations.forEach((donation) => {
                cartItems.push({
                    type: 'donation',
                    name: donation.name || 'A Lo Cubano Boulder Fest Donation',
                    description: 'Support for A Lo Cubano Boulder Fest',
                    price: donation.amount,
                    quantity: 1,
                    category: 'general',
                    isTestItem: donation.isTest || false,
                });
            });
        }

        return cartItems;
    }, []);

    /**
     * Get device info for PayPal mobile optimization
     * @returns {Object} Device info
     */
    const getDeviceInfo = useCallback(() => {
        if (typeof window === 'undefined') {
            return {};
        }

        return {
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            ),
            connectionType: navigator.connection?.effectiveType || 'unknown',
            userAgent: navigator.userAgent.substring(0, 500),
        };
    }, []);

    /**
     * Process Stripe checkout
     *
     * @param {Array} cartItems - Prepared cart items
     * @param {Object} customerInfo - Customer information
     * @returns {Promise<Object>} Result with success/checkoutUrl or error
     */
    const processStripeCheckout = useCallback(async (cartItems, customerInfo) => {
        try {
            const response = await fetch('/api/payments/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItems,
                    customerInfo,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Stripe checkout error:', data);
                return {
                    success: false,
                    error: data.error || data.message || 'Failed to create checkout session',
                };
            }

            return {
                success: true,
                checkoutUrl: data.checkoutUrl,
                sessionId: data.sessionId,
                orderId: data.orderId,
            };
        } catch (error) {
            console.error('Stripe checkout network error:', error);
            return {
                success: false,
                error: error.message || 'Network error occurred. Please try again.',
            };
        }
    }, []);

    /**
     * Process PayPal checkout
     *
     * @param {Array} cartItems - Prepared cart items
     * @param {Object} customerInfo - Customer information
     * @returns {Promise<Object>} Result with success/approvalUrl or error
     */
    const processPayPalCheckout = useCallback(async (cartItems, customerInfo) => {
        try {
            const deviceInfo = getDeviceInfo();

            const response = await fetch('/api/payments/paypal/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItems,
                    customerInfo,
                    deviceInfo,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('PayPal order creation failed:', data);
                return {
                    success: false,
                    error: data.error || 'Failed to create PayPal order',
                    fallbackUrl: data.fallbackUrl,
                };
            }

            return {
                success: true,
                approvalUrl: data.approvalUrl,
                orderId: data.orderId,
                transactionId: data.transactionId,
                orderNumber: data.orderNumber,
            };
        } catch (error) {
            console.error('PayPal checkout network error:', error);
            return {
                success: false,
                error: error.message || 'Network error occurred. Please try again.',
            };
        }
    }, [getDeviceInfo]);

    /**
     * Main checkout handler - routes to appropriate payment processor
     *
     * Customer info is optional - payment processors (Stripe/PayPal) capture
     * customer details through their hosted checkout flows.
     *
     * @param {Object} cart - Cart state from useCart
     * @param {Object} [customerInfo] - Optional pre-filled customer information
     * @returns {Promise<Object>} Result with redirect URL or error
     */
    const processCheckout = useCallback(async (cart, customerInfo = null) => {
        if (!paymentMethod) {
            setError('Please select a payment method');
            return { success: false, error: 'Please select a payment method' };
        }

        if (!cart || (cart.totals?.itemCount || 0) === 0) {
            setError('Your cart is empty');
            return { success: false, error: 'Your cart is empty' };
        }

        startProcessing();

        try {
            // Prepare cart items for API
            const cartItems = prepareCartItems(cart);

            let result;

            if (paymentMethod === PaymentMethod.STRIPE) {
                result = await processStripeCheckout(cartItems, customerInfo);
            } else if (paymentMethod === PaymentMethod.PAYPAL) {
                result = await processPayPalCheckout(cartItems, customerInfo);
            } else {
                throw new Error(`Invalid payment method: ${paymentMethod}`);
            }

            if (result.success) {
                const redirectUrl = result.checkoutUrl || result.approvalUrl;
                setRedirecting(redirectUrl);

                // Perform redirect
                if (typeof window !== 'undefined' && redirectUrl) {
                    window.location.href = redirectUrl;
                }

                return { success: true, redirectUrl };
            } else {
                setError(result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            const errorMessage = error.message || 'Payment processing failed';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    }, [
        paymentMethod,
        prepareCartItems,
        processStripeCheckout,
        processPayPalCheckout,
        startProcessing,
        setRedirecting,
        setError,
    ]);

    return {
        // State
        paymentMethod,
        status,
        error,
        isProcessing,
        isReady,
        canSubmit,

        // Actions
        setPaymentMethod,
        clearError,
        reset,

        // Payment operations
        processCheckout,
        prepareCartItems,

        // Constants
        PaymentMethod,
    };
}

/**
 * Format date for display in cart items
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date (e.g., "Nov 14, 2025")
 */
function formatDateForDisplay(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return dateString;
    }
}
