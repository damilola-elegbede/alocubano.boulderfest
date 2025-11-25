/**
 * CheckoutPage - React checkout page wrapper
 *
 * Main checkout page combining CustomerInfoForm and OrderSummary.
 * Follows AboutPage.jsx patterns with AppProviders wrapper.
 *
 * Note: PaymentMethodSelector and CheckoutActions are deferred to PR 8.
 * This page is not mounted in production yet - preparation for future integration.
 *
 * @module src/pages/CheckoutPage
 */

import React, { useState, useEffect } from 'react';
import { AppProviders } from '../providers/AppProviders';
import { useCart } from '../hooks/useCart';
import CustomerInfoForm from '../components/checkout/CustomerInfoForm';
import OrderSummary from '../components/checkout/OrderSummary';

function CheckoutPageContent() {
    const { cart, isLoading, isInitialized } = useCart();

    // Form state
    const [customerInfo, setCustomerInfo] = useState(null);
    const [submitButtonState, setSubmitButtonState] = useState({
        disabled: true,
        text: 'PROCEED TO PAYMENT',
    });

    // General form error (for payment errors, etc.)
    const [generalError, setGeneralError] = useState(null);

    // Update button state based on customer info and cart
    useEffect(() => {
        const hasCustomerInfo = customerInfo !== null;
        const hasCartItems = cart?.totals?.itemCount > 0;

        setSubmitButtonState((prev) => ({
            ...prev,
            disabled: prev.text === 'PROCESSING...' ? true : !(hasCustomerInfo && hasCartItems),
        }));
    }, [customerInfo, cart]);

    // Handle customer info form submission
    const handleCustomerInfoSubmit = (data) => {
        setCustomerInfo(data);
        setGeneralError(null);
    };

    // Handle checkout button click
    const handleProceedToPayment = async () => {
        if (!customerInfo || !cart?.totals?.itemCount) {
            return;
        }

        setSubmitButtonState({ disabled: true, text: 'PROCESSING...' });
        setGeneralError(null);

        try {
            // PR 8 will add payment flow here
            // For now, just log the checkout data
            console.log('Checkout data (PR 8 will process):', {
                customerInfo,
                cart,
            });

            // Reset button state after "processing"
            setSubmitButtonState({ disabled: false, text: 'PROCEED TO PAYMENT' });
        } catch (error) {
            setGeneralError(error.message || 'An error occurred. Please try again.');
            setSubmitButtonState({ disabled: false, text: 'PROCEED TO PAYMENT' });
        }
    };

    // Handle cancel
    const handleCancel = () => {
        // Navigate back or close modal
        if (typeof window !== 'undefined' && window.history.length > 1) {
            window.history.back();
        }
    };

    // Check if cart is empty
    const isCartEmpty = !cart || (cart.totals?.itemCount || 0) === 0;

    return (
        <main>
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-mask">CHECKOUT</h2>

                    <div
                        className="checkout-layout"
                        style={{
                            display: 'grid',
                            gap: 'var(--space-xl)',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                            marginTop: 'var(--space-xl)',
                        }}
                    >
                        {/* Order Summary Section */}
                        <div className="checkout-summary-section">
                            <OrderSummary cart={cart} isLoading={isLoading} />
                        </div>

                        {/* Customer Info Section */}
                        <div className="checkout-form-section">
                            <CustomerInfoForm
                                onValidSubmit={handleCustomerInfoSubmit}
                                disabled={submitButtonState.text === 'PROCESSING...'}
                            />

                            {/* Action Buttons */}
                            <div
                                className="form-actions-type"
                                style={{ marginTop: 'var(--space-xl)' }}
                            >
                                <button
                                    type="button"
                                    className="form-button-type volunteer-submit"
                                    data-testid="proceed-to-payment"
                                    disabled={submitButtonState.disabled || isCartEmpty}
                                    onClick={handleProceedToPayment}
                                    style={{
                                        opacity: submitButtonState.disabled || isCartEmpty ? '0.5' : '1',
                                        cursor: submitButtonState.disabled || isCartEmpty ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {submitButtonState.text}
                                </button>

                                <button
                                    type="button"
                                    className="form-button-type"
                                    data-testid="cancel-checkout"
                                    onClick={handleCancel}
                                    disabled={submitButtonState.text === 'PROCESSING...'}
                                    style={{
                                        marginTop: 'var(--space-md)',
                                        background: 'transparent',
                                        border: '2px solid var(--color-border)',
                                        color: 'var(--color-text-primary)',
                                    }}
                                >
                                    CANCEL
                                </button>
                            </div>

                            {/* General Error Display */}
                            {generalError && (
                                <div
                                    className="form-error general-error"
                                    data-testid="checkout-error"
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

                            {/* PR 8 Notice */}
                            <p
                                style={{
                                    color: 'var(--color-text-muted)',
                                    fontSize: 'var(--font-size-sm)',
                                    textAlign: 'center',
                                    marginTop: 'var(--space-lg)',
                                }}
                            >
                                Payment integration coming in PR 8
                            </p>
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
