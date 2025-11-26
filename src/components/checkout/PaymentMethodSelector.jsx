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

import React from 'react';
import { usePayment } from '../../hooks/usePayment';
import { PaymentMethod } from '../../contexts/PaymentContext';

/**
 * PaymentMethodSelector component
 *
 * @param {Object} props
 * @param {boolean} [props.disabled=false] - Disable selection
 * @param {Function} [props.onChange] - Optional callback when selection changes
 */
export default function PaymentMethodSelector({ disabled = false, onChange }) {
    const { paymentMethod, setPaymentMethod, isProcessing } = usePayment();

    const isDisabled = disabled || isProcessing;

    const handleSelect = (method) => {
        if (isDisabled) return;

        setPaymentMethod(method);
        if (onChange) {
            onChange(method);
        }
    };

    const isSelected = (method) => paymentMethod === method;

    return (
        <div
            className="payment-method-selector"
            role="radiogroup"
            aria-label="Select payment method"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-md)',
                marginTop: 'var(--space-lg)',
                marginBottom: 'var(--space-lg)',
            }}
        >
            <h3
                style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 'var(--font-size-lg)',
                    marginBottom: 'var(--space-sm)',
                    color: 'var(--color-text-primary)',
                }}
            >
                Payment Method
            </h3>

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
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-md)',
                    padding: 'var(--space-lg)',
                    border: isSelected(PaymentMethod.STRIPE)
                        ? '2px solid var(--color-primary)'
                        : '2px solid var(--color-border)',
                    borderRadius: '8px',
                    background: isSelected(PaymentMethod.STRIPE)
                        ? 'var(--color-background-elevated)'
                        : 'var(--color-background)',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.5 : 1,
                    transition: 'all 0.2s ease',
                    minHeight: '70px',
                }}
            >
                <div
                    className="payment-icons"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}
                >
                    <img
                        src="/images/payment-icons/card_visa.svg"
                        alt="Visa"
                        style={{ height: '28px', width: 'auto' }}
                    />
                    <img
                        src="/images/payment-icons/card_mastercard.svg"
                        alt="Mastercard"
                        style={{ height: '28px', width: 'auto' }}
                    />
                    <img
                        src="/images/payment-icons/apple-pay.svg"
                        alt="Apple Pay"
                        style={{ height: '28px', width: 'auto' }}
                    />
                    <img
                        src="/images/payment-icons/card_google-pay.svg"
                        alt="Google Pay"
                        style={{ height: '28px', width: 'auto' }}
                    />
                </div>
            </button>

            {/* PayPal Option - PayPal & Venmo */}
            <button
                type="button"
                role="radio"
                aria-checked={isSelected(PaymentMethod.PAYPAL)}
                aria-label="Pay with PayPal or Venmo"
                data-method="paypal"
                data-testid="payment-method-paypal"
                disabled={isDisabled}
                onClick={() => handleSelect(PaymentMethod.PAYPAL)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-md)',
                    padding: 'var(--space-lg)',
                    border: isSelected(PaymentMethod.PAYPAL)
                        ? '2px solid var(--color-primary)'
                        : '2px solid var(--color-border)',
                    borderRadius: '8px',
                    background: isSelected(PaymentMethod.PAYPAL)
                        ? 'var(--color-background-elevated)'
                        : 'var(--color-background)',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.5 : 1,
                    transition: 'all 0.2s ease',
                    minHeight: '70px',
                }}
            >
                <div
                    className="payment-icons"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}
                >
                    <img
                        src="/images/payment-icons/card_paypal.svg"
                        alt="PayPal"
                        style={{ height: '28px', width: 'auto' }}
                    />
                    <img
                        src="/images/payment-icons/venmo.png"
                        alt="Venmo"
                        style={{ height: '28px', width: 'auto' }}
                    />
                </div>
            </button>

            {/* Security Note */}
            <div
                className="security-note"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-xs)',
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--font-size-sm)',
                    marginTop: 'var(--space-sm)',
                }}
            >
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                </svg>
                <span>Secure Payment Processing</span>
            </div>
        </div>
    );
}
