/**
 * PaymentMethodSelector - React component for payment method selection
 *
 * Provides a UI for selecting between Stripe (credit cards, Apple Pay, Google Pay)
 * and PayPal (including Venmo) payment methods.
 *
 * Follows the UI patterns from the legacy js/components/payment-selector.js
 * but as a controlled React component.
 *
 * @module src/components/checkout/PaymentMethodSelector
 */

import React, { useState, useEffect } from 'react';
import { usePayment } from '../../hooks/usePayment';
import { PaymentMethod } from '../../contexts/PaymentContext';

// Styles matching the original payment-selector.css modal design
const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        marginTop: 'var(--space-lg)',
        marginBottom: 'var(--space-lg)',
    },
    header: {
        fontFamily: 'var(--font-display)',
        fontSize: '1.5rem',
        fontWeight: 900,
        color: 'var(--color-text-primary)',
        letterSpacing: 'var(--letter-spacing-wider)',
        textTransform: 'uppercase',
        margin: 0,
        textAlign: 'center',
    },
    // Payment button base style - white background for icon visibility
    button: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 20px',
        height: '120px',
        background: '#ffffff',
        border: '2px solid #e5e7eb',
        borderRadius: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
    },
    buttonSelected: {
        borderColor: 'var(--color-primary)',
        boxShadow: '0 4px 12px rgba(91, 107, 181, 0.3)',
    },
    buttonDisabled: {
        opacity: 0.5,
        cursor: 'not-allowed',
        pointerEvents: 'none',
    },
    iconsContainer: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
    },
    // Icon sizes matching payment-selector.css
    cardIcon: {
        width: '72px',
        height: '48px',
        objectFit: 'contain',
    },
    applePayIcon: {
        width: '74px',
        height: '48px',
        objectFit: 'contain',
    },
    googlePayIcon: {
        width: '72px',
        height: '48px',
        objectFit: 'contain',
    },
    paypalIcon: {
        width: '180px',
        height: 'auto',
        objectFit: 'contain',
    },
    securityNote: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--font-size-sm)',
        marginTop: 'var(--space-sm)',
    },
};

/**
 * PaymentMethodSelector component
 *
 * @param {Object} props
 * @param {boolean} [props.disabled=false] - Disable selection
 * @param {Function} [props.onChange] - Optional callback when selection changes
 */
export default function PaymentMethodSelector({ disabled = false, onChange }) {
    const { paymentMethod, setPaymentMethod, isProcessing } = usePayment();
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile for Venmo display (Venmo is mobile-only)
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const isDisabled = disabled || isProcessing;

    const handleSelect = (method) => {
        if (isDisabled) return;

        setPaymentMethod(method);
        if (onChange) {
            onChange(method);
        }
    };

    const isSelected = (method) => paymentMethod === method;

    const getButtonStyle = (method) => ({
        ...styles.button,
        ...(isSelected(method) ? styles.buttonSelected : {}),
        ...(isDisabled ? styles.buttonDisabled : {}),
    });

    return (
        <div
            className="payment-method-selector"
            role="radiogroup"
            aria-label="Select payment method"
            style={styles.container}
        >
            <h3 style={styles.header}>Payment Method</h3>

            {/* Stripe Option - Credit Cards & Digital Wallets */}
            <button
                type="button"
                role="radio"
                aria-checked={isSelected(PaymentMethod.STRIPE)}
                aria-label="Pay with credit card, Apple Pay, or Google Pay"
                data-method="stripe"
                data-testid="payment-method-stripe"
                disabled={isDisabled}
                onClick={() => handleSelect(PaymentMethod.STRIPE)}
                style={getButtonStyle(PaymentMethod.STRIPE)}
            >
                <div className="payment-card-icons" style={styles.iconsContainer}>
                    <img
                        src="/images/payment-icons/card_visa.svg"
                        alt="Visa"
                        className="card-icon"
                        style={styles.cardIcon}
                    />
                    <img
                        src="/images/payment-icons/card_mastercard.svg"
                        alt="Mastercard"
                        className="card-icon"
                        style={styles.cardIcon}
                    />
                    <img
                        src="/images/payment-icons/apple-pay.svg"
                        alt="Apple Pay"
                        className="apple-pay-icon"
                        style={styles.applePayIcon}
                    />
                    <img
                        src="/images/payment-icons/card_google-pay.svg"
                        alt="Google Pay"
                        className="google-pay-icon"
                        style={styles.googlePayIcon}
                    />
                </div>
            </button>

            {/* PayPal Option - PayPal only on desktop, PayPal + Venmo on mobile */}
            <button
                type="button"
                role="radio"
                aria-checked={isSelected(PaymentMethod.PAYPAL)}
                aria-label={isMobile ? 'Pay with PayPal or Venmo' : 'Pay with PayPal'}
                data-method="paypal"
                data-testid="payment-method-paypal"
                disabled={isDisabled}
                onClick={() => handleSelect(PaymentMethod.PAYPAL)}
                style={getButtonStyle(PaymentMethod.PAYPAL)}
            >
                <div className="payment-card-icons" style={styles.iconsContainer}>
                    <img
                        src="/images/payment-icons/card_paypal.svg"
                        alt="PayPal"
                        className="paypal-icon"
                        style={styles.paypalIcon}
                    />
                </div>
            </button>

            {/* Security Note */}
            <div className="security-note" style={styles.securityNote}>
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="#22c55e"
                    aria-hidden="true"
                >
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                </svg>
                <span>Secure Payment Processing</span>
            </div>
        </div>
    );
}
