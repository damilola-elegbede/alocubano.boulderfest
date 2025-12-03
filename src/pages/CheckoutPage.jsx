/**
 * CheckoutPage - React checkout page with payment integration
 *
 * Main checkout page combining OrderSummary and PaymentMethodSelector.
 * Handles payment processing via Stripe and PayPal.
 *
 * Customer info is captured by payment processors (Stripe/PayPal).
 * Registration flow (coming later) will capture per-ticket attendee info.
 *
 * Follows AboutPage.jsx patterns with AppProviders wrapper.
 *
 * @module src/pages/CheckoutPage
 */

import React, { useState, useEffect } from 'react';
import { AppProviders } from '../providers/AppProviders';
import { useCart } from '../hooks/useCart';
import { usePayment } from '../hooks/usePayment';
import OrderSummary from '../components/checkout/OrderSummary';
import PaymentMethodSelector from '../components/checkout/PaymentMethodSelector';

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

    // General form error (for payment errors, etc.)
    const [generalError, setGeneralError] = useState(null);

    // Sync payment errors to general error
    useEffect(() => {
        if (paymentError) {
            setGeneralError(paymentError);
        }
    }, [paymentError]);

    // Update button state based on cart and payment method
    useEffect(() => {
        const hasCartItems = cart?.totals?.itemCount > 0;
        const hasPaymentMethod = paymentMethod !== null;
        const canProceed = hasCartItems && hasPaymentMethod && !isProcessing;

        setSubmitButtonState((prev) => ({
            ...prev,
            disabled: isProcessing ? true : !canProceed,
            text: isProcessing ? 'PROCESSING...' : 'PROCEED TO PAYMENT',
        }));
    }, [cart, paymentMethod, isProcessing]);

    // Handle checkout button click
    const handleProceedToPayment = async () => {
        if (!cart?.totals?.itemCount || !paymentMethod) {
            return;
        }

        setGeneralError(null);

        // Customer info will be captured by payment processor (Stripe/PayPal)
        const result = await processCheckout(cart);

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
                            <OrderSummary cart={cart} isLoading={isLoading} />
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
