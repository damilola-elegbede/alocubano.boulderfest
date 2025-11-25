/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CheckoutPage from '../../../../src/pages/CheckoutPage';

describe('CheckoutPage', () => {
    beforeEach(() => {
        // Mock window.globalCartManager (from AboutPage.test.jsx pattern)
        window.globalCartManager = {
            getState: vi.fn(() => ({
                tickets: {
                    'full-pass': {
                        name: 'Full Pass',
                        price: 75,
                        quantity: 2,
                    },
                },
                donations: [],
                totals: {
                    itemCount: 2,
                    grandTotal: 150,
                },
            })),
            addTicket: vi.fn(),
            removeTicket: vi.fn(),
            updateTicketQuantity: vi.fn(),
            addDonation: vi.fn(),
            removeDonation: vi.fn(),
            clear: vi.fn(),
        };

        // Mock localStorage for theme
        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            clear: vi.fn(),
        };
        global.localStorage = localStorageMock;

        // Mock matchMedia for theme system
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    describe('Component Rendering', () => {
        it('should render the Checkout page', () => {
            render(<CheckoutPage />);
            expect(screen.getByText('CHECKOUT')).toBeInTheDocument();
        });

        it('should render CustomerInfoForm section', () => {
            render(<CheckoutPage />);
            expect(screen.getByText('Customer Information')).toBeInTheDocument();
        });

        it('should render OrderSummary section', () => {
            render(<CheckoutPage />);
            expect(screen.getByText('Order Summary')).toBeInTheDocument();
        });

        it('should render cart items in order summary', () => {
            render(<CheckoutPage />);
            expect(screen.getByText('Full Pass')).toBeInTheDocument();
            expect(screen.getByText('x2')).toBeInTheDocument();
            // Line item total and grand total both show $150.00, use getAllByText
            const priceElements = screen.getAllByText('$150.00');
            expect(priceElements.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Action Buttons', () => {
        it('should render Proceed to Payment button', () => {
            render(<CheckoutPage />);
            expect(screen.getByTestId('proceed-to-payment')).toBeInTheDocument();
        });

        it('should render Cancel button', () => {
            render(<CheckoutPage />);
            expect(screen.getByTestId('cancel-checkout')).toBeInTheDocument();
        });

        it('should have Proceed to Payment button disabled initially', () => {
            render(<CheckoutPage />);
            const submitButton = screen.getByTestId('proceed-to-payment');
            expect(submitButton).toBeDisabled();
        });
    });

    describe('Form Integration', () => {
        it('should render all customer info form fields', () => {
            render(<CheckoutPage />);
            expect(screen.getByLabelText(/FIRST NAME/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/LAST NAME/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/EMAIL/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/PHONE/i)).toBeInTheDocument();
        });
    });

    describe('Empty Cart Handling', () => {
        it('should show empty cart warning when cart is empty', () => {
            window.globalCartManager.getState.mockReturnValue({
                tickets: {},
                donations: [],
                totals: { itemCount: 0, grandTotal: 0 },
            });

            render(<CheckoutPage />);

            expect(screen.getByTestId('empty-cart-warning')).toBeInTheDocument();
            // "Your cart is empty" appears in both the warning and OrderSummary
            const emptyMessages = screen.getAllByText(/Your cart is empty/i);
            expect(emptyMessages.length).toBeGreaterThanOrEqual(1);
        });

        it('should disable submit button when cart is empty', () => {
            window.globalCartManager.getState.mockReturnValue({
                tickets: {},
                donations: [],
                totals: { itemCount: 0, grandTotal: 0 },
            });

            render(<CheckoutPage />);

            const submitButton = screen.getByTestId('proceed-to-payment');
            expect(submitButton).toBeDisabled();
        });
    });

    describe('PR 8 Notice', () => {
        it('should show PR 8 payment integration notice', () => {
            render(<CheckoutPage />);
            expect(screen.getByText(/Payment integration coming in PR 8/i)).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have proper heading structure', () => {
            render(<CheckoutPage />);

            const mainHeading = screen.getByText('CHECKOUT');
            expect(mainHeading.tagName).toBe('H2');

            const customerInfoHeading = screen.getByText('Customer Information');
            expect(customerInfoHeading.tagName).toBe('H3');

            const orderSummaryHeading = screen.getByText('Order Summary');
            expect(orderSummaryHeading.tagName).toBe('H3');
        });
    });

    describe('Context Integration', () => {
        it('should render with AppProviders (no errors)', () => {
            // This test verifies AppProviders wrapping works correctly
            const { container } = render(<CheckoutPage />);
            expect(container).toBeInTheDocument();
        });

        it('should display cart total from useCart', () => {
            render(<CheckoutPage />);
            expect(screen.getByTestId('order-total')).toHaveTextContent('$150.00');
        });
    });
});
