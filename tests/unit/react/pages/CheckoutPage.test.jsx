/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Note: @testing-library/jest-dom is imported in tests/setup-react.js
import CheckoutPage from '../../../../src/pages/CheckoutPage';
import {
    createMockPaymentFetch,
    createMockLocation,
} from '../../../mocks/payment-api-mocks.js';

describe('CheckoutPage', () => {
    let mockLocation;
    let originalFetch;

    beforeEach(() => {
        // Mock window.globalCartManager (from AboutPage.test.jsx pattern)
        // Note: Cart prices are in CENTS (will be converted to dollars by OrderSummary)
        window.globalCartManager = {
            getState: vi.fn(() => ({
                tickets: {
                    'full-pass': {
                        ticketType: 'full-pass',
                        name: 'Full Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 7500, // cents - $75.00
                        quantity: 2,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: {
                    itemCount: 2,
                    grandTotal: 15000, // cents - $150.00
                },
            })),
            addTicket: vi.fn(),
            removeTicket: vi.fn(),
            updateTicketQuantity: vi.fn(),
            addDonation: vi.fn(),
            removeDonation: vi.fn(),
            clear: vi.fn(),
        };

        // Mock location for redirect testing
        mockLocation = createMockLocation();

        // Save and mock fetch
        originalFetch = global.fetch;
        global.fetch = createMockPaymentFetch({ stripe: { success: true } });

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

    afterEach(() => {
        mockLocation.restore();
        global.fetch = originalFetch;
        vi.clearAllMocks();
    });

    describe('Component Rendering', () => {
        it('should render the Checkout page', () => {
            render(<CheckoutPage />);
            expect(screen.getByText('ORDER CHECKOUT')).toBeInTheDocument();
        });

        it('should render OrderSummary section', () => {
            render(<CheckoutPage />);
            expect(screen.getByText('Order Summary')).toBeInTheDocument();
        });

        it('should render cart items in order summary', () => {
            render(<CheckoutPage />);
            // Now tickets are listed individually (e.g., "Ticket 1 of 2", "Ticket 2 of 2")
            const fullPassElements = screen.getAllByText('Full Pass');
            expect(fullPassElements.length).toBe(2); // Two separate ticket rows
            // Grand total still shows $150.00 (7500 cents * 2 = 15000 cents = $150)
            expect(screen.getByTestId('order-total')).toHaveTextContent('$150.00');
        });

        it('should render PaymentMethodSelector section', () => {
            render(<CheckoutPage />);
            expect(screen.getByText('Select Payment Method')).toBeInTheDocument();
        });

        it('should render payment method options', () => {
            render(<CheckoutPage />);
            expect(screen.getByTestId('payment-method-stripe')).toBeInTheDocument();
            expect(screen.getByTestId('payment-method-paypal')).toBeInTheDocument();
        });

        it('should render event name as category header', () => {
            render(<CheckoutPage />);
            // Event name is now the category header instead of generic "Tickets"
            expect(screen.getByText('A Lo Cubano Boulder Fest 2026')).toBeInTheDocument();
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

        it('should have Proceed to Payment button disabled initially (no payment method)', () => {
            render(<CheckoutPage />);
            const submitButton = screen.getByTestId('proceed-to-payment');
            expect(submitButton).toBeDisabled();
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

    describe('Payment Flow', () => {
        it('should enable payment method selector (CustomerInfoForm removed)', () => {
            render(<CheckoutPage />);

            // Payment method buttons should be enabled since CustomerInfoForm was removed
            const stripeButton = screen.getByTestId('payment-method-stripe');
            expect(stripeButton).not.toBeDisabled();
        });

        it('should show help text when no payment method selected', () => {
            // Use donation-only cart to test payment method help text
            // (tickets would show attendee validation message instead)
            window.globalCartManager.getState.mockReturnValue({
                tickets: {},
                donations: [{ id: 1, amount: 50, name: 'Test Donation' }],
                totals: { itemCount: 1, grandTotal: 5000 },
            });

            render(<CheckoutPage />);

            // Should show help text when no payment method (case-sensitive match)
            expect(screen.getByText('Select a payment method')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have proper heading structure', () => {
            render(<CheckoutPage />);

            const mainHeading = screen.getByText('ORDER CHECKOUT');
            expect(mainHeading.tagName).toBe('H2');

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

        it('should display cart total from useCart (cents converted to dollars)', () => {
            render(<CheckoutPage />);
            // Cart total is 15000 cents = $150.00
            expect(screen.getByTestId('order-total')).toHaveTextContent('$150.00');
        });
    });

    describe('Payment Method Integration', () => {
        it('should have payment method radiogroup', () => {
            render(<CheckoutPage />);

            expect(screen.getByRole('radiogroup', { name: /select payment method/i })).toBeInTheDocument();
        });

        it('should show secure payment note', () => {
            render(<CheckoutPage />);

            expect(screen.getByText('Secure Payment Processing')).toBeInTheDocument();
        });
    });

    describe('Simplified Checkout Flow', () => {
        it('should not render CustomerInfoForm (removed)', () => {
            render(<CheckoutPage />);

            // CustomerInfoForm has been removed - customer info is captured by payment processors
            expect(screen.queryByText('Customer Information')).not.toBeInTheDocument();
        });

        it('should enable submit after selecting payment method (donation-only cart)', async () => {
            // Use donation-only cart (no attendee validation required)
            window.globalCartManager.getState.mockReturnValue({
                tickets: {},
                donations: [{ id: 1, amount: 50, name: 'Test Donation' }],
                totals: { itemCount: 1, grandTotal: 5000 },
            });

            const user = userEvent.setup();
            render(<CheckoutPage />);

            // Initially disabled (no payment method)
            const submitButton = screen.getByTestId('proceed-to-payment');
            expect(submitButton).toBeDisabled();

            // Select a payment method
            const stripeButton = screen.getByTestId('payment-method-stripe');
            await user.click(stripeButton);

            // Now should be enabled (donation-only cart doesn't require attendee info)
            await waitFor(() => {
                expect(submitButton).not.toBeDisabled();
            });
        });

        it('should require attendee info for tickets before enabling submit', async () => {
            const user = userEvent.setup();
            render(<CheckoutPage />);

            // Initially button should be disabled (no payment method AND no attendee info)
            const submitButton = screen.getByTestId('proceed-to-payment');
            expect(submitButton).toBeDisabled();

            // Select a payment method
            const stripeButton = screen.getByTestId('payment-method-stripe');
            await user.click(stripeButton);

            // Button should still be disabled (attendee info required for tickets)
            // Need to wait for state update
            await waitFor(() => {
                expect(screen.getByTestId('proceed-to-payment')).toBeDisabled();
            });

            // Fill in attendee info for first ticket (key format: ticketType-eventId-index)
            const firstNameInputs = screen.getAllByLabelText(/first name/i);
            const lastNameInputs = screen.getAllByLabelText(/last name/i);
            const emailInputs = screen.getAllByLabelText(/email/i);

            // Fill in info for both tickets (quantity: 2)
            await user.type(firstNameInputs[0], 'John');
            await user.type(lastNameInputs[0], 'Doe');
            await user.type(emailInputs[0], 'john@example.com');

            await user.type(firstNameInputs[1], 'Jane');
            await user.type(lastNameInputs[1], 'Doe');
            await user.type(emailInputs[1], 'jane@example.com');

            // Now should be enabled
            await waitFor(() => {
                expect(screen.getByTestId('proceed-to-payment')).not.toBeDisabled();
            });
        });
    });

    describe('Inline Attendee Registration', () => {
        it('should render attendee forms for each ticket', () => {
            render(<CheckoutPage />);

            // With 2 tickets, should have 2 sets of attendee forms
            const firstNameInputs = screen.getAllByLabelText(/first name/i);
            expect(firstNameInputs.length).toBe(2);
        });

        it('should show attendee form for each ticket', () => {
            render(<CheckoutPage />);

            // Each ticket renders as separate form with attendee number
            expect(screen.getByText(/Attendee 1/)).toBeInTheDocument();
            expect(screen.getByText(/Attendee 2/)).toBeInTheDocument();
        });

        it('should show help text for attendee validation', async () => {
            const user = userEvent.setup();
            render(<CheckoutPage />);

            // Initially shows "Select a payment method" help text
            // There are two elements - one in PaymentMethodSelector and one as button help text
            const helpTexts = screen.getAllByText(/Select a payment method/i);
            expect(helpTexts.length).toBeGreaterThanOrEqual(1);

            // Select a payment method to reveal attendee validation help text
            const stripeButton = screen.getByTestId('payment-method-stripe');
            await user.click(stripeButton);

            // Now should show attendee-related help text since tickets require attendee info
            await waitFor(() => {
                const attendeeHelpText = screen.getByText(/Enter attendee info for/i);
                expect(attendeeHelpText).toBeInTheDocument();
            });
        });
    });
});
