/**
 * CheckoutPage - React checkout page with payment integration
 *
 * Main checkout page combining OrderSummary and PaymentMethodSelector.
 * Handles payment processing via Stripe and PayPal.
 *
 * Customer info is captured by payment processors (Stripe/PayPal).
 * Attendee info is now captured inline during checkout (not in separate registration).
 *
 * Follows AboutPage.jsx patterns with AppProviders wrapper.
 *
 * @module src/pages/CheckoutPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AppProviders } from '../providers/AppProviders';
import { useCart } from '../hooks/useCart';
import { usePayment } from '../hooks/usePayment';
import OrderSummary from '../components/checkout/OrderSummary';
import PaymentMethodSelector from '../components/checkout/PaymentMethodSelector';
import {
    validateAllAttendees,
    cartHasTickets,
    getTotalTicketCount,
    generateTicketKey,
} from '../utils/attendee-validation';

// Custom button styles for checkout - override default animations
const checkoutButtonStyles = {
    proceed: {
        width: '100%',
        background: 'var(--color-blue)',
        color: 'white',
        border: 'none',
        padding: 'var(--space-md) var(--space-xl)',
        fontFamily: 'var(--font-code)',
        fontSize: 'var(--font-size-sm)',
        letterSpacing: 'var(--letter-spacing-wide)',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
    },
    proceedHover: {
        transform: 'translateY(-2px)',
    },
    cancel: {
        width: 'auto',
        padding: 'var(--space-sm) var(--space-lg)',
        background: 'var(--color-red)',
        color: 'white',
        border: 'none',
        fontFamily: 'var(--font-code)',
        fontSize: 'var(--font-size-sm)',
        letterSpacing: 'var(--letter-spacing-wide)',
        textTransform: 'uppercase',
        cursor: 'pointer',
        display: 'block',
        margin: 'var(--space-md) auto 0',
        transition: 'transform 0.2s ease',
    },
};

function CheckoutPageContent() {
    const { cart, isLoading, isInitialized } = useCart();
    const {
        paymentMethod,
        isProcessing,
        error: paymentError,
        isReady: isPaymentReady,
        processCheckout,
        clearError,
    } = usePayment();

    // Form state
    const [submitButtonState, setSubmitButtonState] = useState({
        disabled: true,
        text: 'PROCEED TO PAYMENT',
    });

    // Attendee data state - keyed by ticket identifier
    // Structure: { [ticketKey]: { firstName, lastName, email } }
    const [attendeeData, setAttendeeData] = useState({});

    // Attendee validation errors - keyed by ticket identifier
    // Structure: { [ticketKey]: { firstName?, lastName?, email? } }
    const [attendeeErrors, setAttendeeErrors] = useState({});

    // General form error (for payment errors, etc.)
    const [generalError, setGeneralError] = useState(null);

    // Sync payment errors to general error
    useEffect(() => {
        if (paymentError) {
            setGeneralError(paymentError);
        }
    }, [paymentError]);

    // Convert cart.tickets object to items array for validation
    // Cart structure: { tickets: { [ticketType]: {...} }, donations: [], totals: {} }
    // Validation functions expect an array of items with type: 'ticket' or 'donation'
    const cartItems = (() => {
        const items = [];
        if (cart?.tickets) {
            Object.entries(cart.tickets).forEach(([ticketType, ticket]) => {
                items.push({
                    ...ticket,
                    type: 'ticket',
                    ticketType: ticket.ticketType || ticketType,
                });
            });
        }
        if (cart?.donations) {
            cart.donations.forEach((donation) => {
                items.push({ ...donation, type: 'donation' });
            });
        }
        return items;
    })();

    // Check if attendees are valid for tickets in cart
    const hasTickets = cartHasTickets(cartItems);
    const ticketCount = getTotalTicketCount(cartItems);
    const attendeeValidation = hasTickets
        ? validateAllAttendees(cartItems, attendeeData)
        : { valid: true, allErrors: {}, missingCount: 0 };
    const attendeesValid = attendeeValidation.valid;

    // Update button state based on cart, payment method, and attendee validation
    useEffect(() => {
        const hasCartItems = cart?.totals?.itemCount > 0;
        const hasPaymentMethod = paymentMethod !== null;

        // Require attendee info for tickets (not for donations-only)
        const attendeeRequirementMet = !hasTickets || attendeesValid;

        const canProceed = hasCartItems && hasPaymentMethod && attendeeRequirementMet && !isProcessing;

        setSubmitButtonState((prev) => ({
            ...prev,
            disabled: isProcessing ? true : !canProceed,
            text: isProcessing ? 'PROCESSING...' : 'PROCEED TO PAYMENT',
        }));
    }, [cart, paymentMethod, isProcessing, hasTickets, attendeesValid]);

    // Handle attendee data changes
    const handleAttendeeChange = useCallback((ticketKey, field, value) => {
        setAttendeeData((prev) => ({
            ...prev,
            [ticketKey]: {
                ...(prev[ticketKey] || {}),
                [field]: value,
            },
        }));

        // Clear error for this field when user types
        setAttendeeErrors((prev) => {
            const ticketErrors = prev[ticketKey] || {};
            if (ticketErrors[field]) {
                const { [field]: removed, ...rest } = ticketErrors;
                return {
                    ...prev,
                    [ticketKey]: Object.keys(rest).length > 0 ? rest : undefined,
                };
            }
            return prev;
        });
    }, []);

    // Handle "Copy to all tickets" functionality
    const handleCopyToAll = useCallback((sourceTicketKey) => {
        const sourceAttendee = attendeeData[sourceTicketKey];
        if (!sourceAttendee) return;

        // Get all ticket keys from cart
        const newAttendeeData = { ...attendeeData };

        // Convert cart.tickets to items array
        const ticketItems = cart?.tickets
            ? Object.entries(cart.tickets).map(([ticketType, ticket]) => ({
                ...ticket,
                type: 'ticket',
                ticketType: ticket.ticketType || ticketType,
            }))
            : [];

        ticketItems.forEach((item) => {
            const quantity = item.quantity || 1;
            for (let i = 0; i < quantity; i++) {
                const ticketKey = generateTicketKey(item, i);
                // Copy source attendee data to all tickets
                newAttendeeData[ticketKey] = { ...sourceAttendee };
            }
        });

        setAttendeeData(newAttendeeData);
        // Clear all attendee errors since we just populated all fields
        setAttendeeErrors({});
    }, [attendeeData, cart?.tickets]);

    // Handle checkout button click
    const handleProceedToPayment = async () => {
        if (!cart?.totals?.itemCount || !paymentMethod) {
            return;
        }

        // Validate attendees if there are tickets
        if (hasTickets && !attendeesValid) {
            setAttendeeErrors(attendeeValidation.allErrors);
            setGeneralError('Please fill in all attendee information');
            return;
        }

        setGeneralError(null);

        // Pass cart and attendee data to checkout
        // The usePayment hook's prepareCartItems function handles cart.tickets structure
        // and merges attendeeData using ticket keys
        const result = await processCheckout(cart, attendeeData);

        if (!result.success) {
            setGeneralError(result.error || 'Payment processing failed. Please try again.');
        }
        // On success, processCheckout handles the redirect
    };

    // Handle cancel
    const handleCancel = () => {
        // Navigate back or close modal
        if (typeof window !== 'undefined' && window.history.length > 1) {
            window.history.back();
        }
    };

    // Clear error when payment method changes
    const handlePaymentMethodChange = () => {
        setGeneralError(null);
        clearError();
    };

    // Check if cart is empty
    const isCartEmpty = !cart || (cart.totals?.itemCount || 0) === 0;

    // Check if form is complete (for button state message)
    const getButtonHelpText = () => {
        if (isProcessing) return null;
        if (isCartEmpty) return 'Add items to your cart to continue';
        if (hasTickets && !attendeesValid) {
            const missingCount = attendeeValidation.missingCount;
            if (missingCount > 0) {
                return `Enter attendee info for ${missingCount} ticket${missingCount > 1 ? 's' : ''}`;
            }
            return 'Complete all attendee information';
        }
        if (!paymentMethod) return 'Select a payment method';
        return null;
    };

    const helpText = getButtonHelpText();

    // Hover state for proceed button (raise animation only, no color change)
    const [isProceedHovered, setIsProceedHovered] = useState(false);

    return (
        <main>
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-mask" style={{ textAlign: 'center' }}>ORDER CHECKOUT</h2>

                    <div
                        className="checkout-layout"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-xl)',
                            maxWidth: '480px',
                            margin: '0 auto',
                            marginTop: 'var(--space-xl)',
                        }}
                    >
                        {/* Order Summary Section */}
                        <div className="checkout-summary-section">
                            <OrderSummary
                                cart={cart}
                                isLoading={isLoading}
                                attendeeData={attendeeData}
                                attendeeErrors={attendeeErrors}
                                onAttendeeChange={handleAttendeeChange}
                                onCopyToAll={handleCopyToAll}
                                ticketCount={ticketCount}
                                disabled={isProcessing}
                            />
                        </div>

                        {/* Payment Section */}
                        <div className="checkout-form-section">
                            {/* Payment Method Selection */}
                            <PaymentMethodSelector
                                disabled={isProcessing}
                                onChange={handlePaymentMethodChange}
                            />

                            {/* Action Buttons */}
                            <div
                                className="form-actions-type"
                                style={{ marginTop: 'var(--space-lg)' }}
                            >
                                <button
                                    type="button"
                                    data-testid="proceed-to-payment"
                                    disabled={submitButtonState.disabled || isCartEmpty}
                                    onClick={handleProceedToPayment}
                                    onMouseEnter={() => setIsProceedHovered(true)}
                                    onMouseLeave={() => setIsProceedHovered(false)}
                                    style={{
                                        ...checkoutButtonStyles.proceed,
                                        ...(isProceedHovered && !submitButtonState.disabled && !isCartEmpty
                                            ? checkoutButtonStyles.proceedHover
                                            : {}),
                                        opacity: submitButtonState.disabled || isCartEmpty ? '0.5' : '1',
                                        cursor: submitButtonState.disabled || isCartEmpty ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {submitButtonState.text}
                                </button>

                                {/* Help text for incomplete form */}
                                {helpText && (
                                    <p
                                        style={{
                                            color: 'var(--color-text-muted)',
                                            fontSize: 'var(--font-size-sm)',
                                            textAlign: 'center',
                                            marginTop: 'var(--space-sm)',
                                        }}
                                    >
                                        {helpText}
                                    </p>
                                )}

                                <button
                                    type="button"
                                    data-testid="cancel-checkout"
                                    onClick={handleCancel}
                                    disabled={isProcessing}
                                    style={checkoutButtonStyles.cancel}
                                >
                                    CANCEL
                                </button>
                            </div>

                            {/* General Error Display */}
                            {generalError && (
                                <div
                                    className="form-error general-error"
                                    data-testid="checkout-error"
                                    role="alert"
                                    style={{
                                        display: 'block',
                                        color: '#dc2626',
                                        marginTop: 'var(--space-lg)',
                                        padding: 'var(--space-md)',
                                        border: '1px solid #dc2626',
                                        borderRadius: '4px',
                                        textAlign: 'center',
                                    }}
                                >
                                    {generalError}
                                </div>
                            )}

                            {/* Empty Cart Warning */}
                            {isCartEmpty && !isLoading && (
                                <div
                                    className="form-warning"
                                    data-testid="empty-cart-warning"
                                    style={{
                                        display: 'block',
                                        color: 'var(--color-warning)',
                                        marginTop: 'var(--space-lg)',
                                        padding: 'var(--space-md)',
                                        border: '1px solid var(--color-warning)',
                                        borderRadius: '4px',
                                        textAlign: 'center',
                                    }}
                                >
                                    Your cart is empty. Please add items before checkout.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

export default function CheckoutPage() {
    return (
        <AppProviders>
            <CheckoutPageContent />
        </AppProviders>
    );
}
