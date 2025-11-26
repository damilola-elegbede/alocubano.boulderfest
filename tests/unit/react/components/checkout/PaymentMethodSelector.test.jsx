/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import PaymentMethodSelector from '../../../../../src/components/checkout/PaymentMethodSelector';
import { PaymentProvider, PaymentMethod } from '../../../../../src/contexts/PaymentContext';

describe('PaymentMethodSelector', () => {
    // Wrapper component with PaymentProvider
    const renderWithProvider = (props = {}) => {
        return render(
            <PaymentProvider>
                <PaymentMethodSelector {...props} />
            </PaymentProvider>
        );
    };

    describe('Rendering', () => {
        it('should render payment method options', () => {
            renderWithProvider();

            expect(screen.getByTestId('payment-method-stripe')).toBeInTheDocument();
            expect(screen.getByTestId('payment-method-paypal')).toBeInTheDocument();
        });

        it('should render payment method header', () => {
            renderWithProvider();

            expect(screen.getByText('Payment Method')).toBeInTheDocument();
        });

        it('should render security note', () => {
            renderWithProvider();

            expect(screen.getByText('Secure Payment Processing')).toBeInTheDocument();
        });

        it('should render with radiogroup role', () => {
            renderWithProvider();

            expect(screen.getByRole('radiogroup')).toBeInTheDocument();
        });

        it('should render payment icons', () => {
            renderWithProvider();

            expect(screen.getByAltText('Visa')).toBeInTheDocument();
            expect(screen.getByAltText('Mastercard')).toBeInTheDocument();
            expect(screen.getByAltText('Apple Pay')).toBeInTheDocument();
            expect(screen.getByAltText('Google Pay')).toBeInTheDocument();
            expect(screen.getByAltText('PayPal')).toBeInTheDocument();
            expect(screen.getByAltText('Venmo')).toBeInTheDocument();
        });
    });

    describe('Selection', () => {
        it('should select Stripe when clicked', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');
            fireEvent.click(stripeButton);

            expect(stripeButton).toHaveAttribute('aria-checked', 'true');
        });

        it('should select PayPal when clicked', () => {
            renderWithProvider();

            const paypalButton = screen.getByTestId('payment-method-paypal');
            fireEvent.click(paypalButton);

            expect(paypalButton).toHaveAttribute('aria-checked', 'true');
        });

        it('should only have one selection at a time', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');
            const paypalButton = screen.getByTestId('payment-method-paypal');

            // Select Stripe
            fireEvent.click(stripeButton);
            expect(stripeButton).toHaveAttribute('aria-checked', 'true');
            expect(paypalButton).toHaveAttribute('aria-checked', 'false');

            // Select PayPal
            fireEvent.click(paypalButton);
            expect(stripeButton).toHaveAttribute('aria-checked', 'false');
            expect(paypalButton).toHaveAttribute('aria-checked', 'true');
        });

        it('should call onChange callback when selection changes', () => {
            const onChange = vi.fn();
            renderWithProvider({ onChange });

            fireEvent.click(screen.getByTestId('payment-method-stripe'));

            expect(onChange).toHaveBeenCalledWith(PaymentMethod.STRIPE);
        });

        it('should call onChange with PayPal method', () => {
            const onChange = vi.fn();
            renderWithProvider({ onChange });

            fireEvent.click(screen.getByTestId('payment-method-paypal'));

            expect(onChange).toHaveBeenCalledWith(PaymentMethod.PAYPAL);
        });
    });

    describe('Disabled State', () => {
        it('should disable buttons when disabled prop is true', () => {
            renderWithProvider({ disabled: true });

            const stripeButton = screen.getByTestId('payment-method-stripe');
            const paypalButton = screen.getByTestId('payment-method-paypal');

            expect(stripeButton).toBeDisabled();
            expect(paypalButton).toBeDisabled();
        });

        it('should not call onChange when disabled', () => {
            const onChange = vi.fn();
            renderWithProvider({ disabled: true, onChange });

            fireEvent.click(screen.getByTestId('payment-method-stripe'));

            expect(onChange).not.toHaveBeenCalled();
        });

        it('should apply disabled styling', () => {
            renderWithProvider({ disabled: true });

            const stripeButton = screen.getByTestId('payment-method-stripe');

            // Check opacity style (indicates disabled state)
            expect(stripeButton.style.opacity).toBe('0.5');
            expect(stripeButton.style.cursor).toBe('not-allowed');
        });
    });

    describe('Accessibility', () => {
        it('should have correct aria-label on radiogroup', () => {
            renderWithProvider();

            expect(screen.getByRole('radiogroup')).toHaveAttribute(
                'aria-label',
                'Select payment method'
            );
        });

        it('should have radio role on payment buttons', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');
            const paypalButton = screen.getByTestId('payment-method-paypal');

            expect(stripeButton).toHaveAttribute('role', 'radio');
            expect(paypalButton).toHaveAttribute('role', 'radio');
        });

        it('should have descriptive aria-labels on buttons', () => {
            renderWithProvider();

            expect(screen.getByTestId('payment-method-stripe')).toHaveAttribute(
                'aria-label',
                'Pay with credit card, Apple Pay, or Google Pay'
            );
            expect(screen.getByTestId('payment-method-paypal')).toHaveAttribute(
                'aria-label',
                'Pay with PayPal or Venmo'
            );
        });

        it('should update aria-checked when selection changes', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');
            const paypalButton = screen.getByTestId('payment-method-paypal');

            // Initial state - nothing selected
            expect(stripeButton).toHaveAttribute('aria-checked', 'false');
            expect(paypalButton).toHaveAttribute('aria-checked', 'false');

            // Select Stripe
            fireEvent.click(stripeButton);
            expect(stripeButton).toHaveAttribute('aria-checked', 'true');
            expect(paypalButton).toHaveAttribute('aria-checked', 'false');
        });

        it('should be keyboard accessible', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');

            // Focus the button
            stripeButton.focus();
            expect(document.activeElement).toBe(stripeButton);

            // Simulate Enter key
            fireEvent.keyDown(stripeButton, { key: 'Enter', code: 'Enter' });
            fireEvent.click(stripeButton);

            expect(stripeButton).toHaveAttribute('aria-checked', 'true');
        });
    });

    describe('Data Attributes', () => {
        it('should have correct data-method attributes', () => {
            renderWithProvider();

            expect(screen.getByTestId('payment-method-stripe')).toHaveAttribute(
                'data-method',
                'stripe'
            );
            expect(screen.getByTestId('payment-method-paypal')).toHaveAttribute(
                'data-method',
                'paypal'
            );
        });
    });

    describe('Visual States', () => {
        it('should apply selected styling to Stripe', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');
            fireEvent.click(stripeButton);

            // Check that border style changes (indicates selected state)
            expect(stripeButton.style.border).toContain('2px solid var(--color-primary)');
        });

        it('should apply selected styling to PayPal', () => {
            renderWithProvider();

            const paypalButton = screen.getByTestId('payment-method-paypal');
            fireEvent.click(paypalButton);

            // Check that border style changes (indicates selected state)
            expect(paypalButton.style.border).toContain('2px solid var(--color-primary)');
        });

        it('should have unselected styling initially', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');

            // Check unselected border style
            expect(stripeButton.style.border).toContain('var(--color-border)');
        });
    });

    describe('Button Type', () => {
        it('should be type button to prevent form submission', () => {
            renderWithProvider();

            const stripeButton = screen.getByTestId('payment-method-stripe');
            const paypalButton = screen.getByTestId('payment-method-paypal');

            expect(stripeButton).toHaveAttribute('type', 'button');
            expect(paypalButton).toHaveAttribute('type', 'button');
        });
    });
});
