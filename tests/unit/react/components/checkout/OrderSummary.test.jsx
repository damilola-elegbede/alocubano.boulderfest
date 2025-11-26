/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OrderSummary from '../../../../../src/components/checkout/OrderSummary';

describe('OrderSummary', () => {
    describe('Loading State', () => {
        it('should show loading message when isLoading is true', () => {
            render(<OrderSummary isLoading={true} cart={null} />);
            expect(screen.getByText(/Loading cart.../i)).toBeInTheDocument();
        });

        it('should render Order Summary title when loading', () => {
            render(<OrderSummary isLoading={true} cart={null} />);
            expect(screen.getByText('Order Summary')).toBeInTheDocument();
        });
    });

    describe('Empty Cart State', () => {
        it('should show empty cart message when cart is null', () => {
            render(<OrderSummary cart={null} isLoading={false} />);
            expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument();
        });

        it('should show empty cart message when cart has no items', () => {
            const emptyCart = {
                tickets: {},
                donations: [],
                totals: { itemCount: 0 },
            };
            render(<OrderSummary cart={emptyCart} isLoading={false} />);
            expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument();
        });

        it('should show empty cart message when tickets and donations are empty arrays', () => {
            const emptyCart = {
                tickets: {},
                donations: [],
                totals: {},
            };
            render(<OrderSummary cart={emptyCart} isLoading={false} />);
            expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument();
        });
    });

    describe('Ticket Display', () => {
        it('should display ticket items with price in cents converted to dollars', () => {
            const cart = {
                tickets: {
                    'full-pass': {
                        name: 'Full Pass',
                        price: 7500, // 7500 cents = $75.00
                        quantity: 2,
                    },
                },
                donations: [],
                totals: { itemCount: 2, grandTotal: 15000 }, // 15000 cents = $150.00
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            expect(screen.getByText('Full Pass')).toBeInTheDocument();
            expect(screen.getByText('x2')).toBeInTheDocument();
            // $150.00 appears for both line item total and grand total
            const priceElements = screen.getAllByText('$150.00');
            expect(priceElements.length).toBeGreaterThanOrEqual(1);
        });

        it('should display multiple ticket types', () => {
            const cart = {
                tickets: {
                    'full-pass': {
                        name: 'Full Pass',
                        price: 7500, // cents
                        quantity: 1,
                    },
                    'day-pass': {
                        name: 'Day Pass',
                        price: 4000, // cents
                        quantity: 2,
                    },
                },
                donations: [],
                totals: { itemCount: 3, grandTotal: 15500 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            expect(screen.getByText('Full Pass')).toBeInTheDocument();
            expect(screen.getByText('Day Pass')).toBeInTheDocument();
            expect(screen.getByText('$75.00')).toBeInTheDocument();
            expect(screen.getByText('$80.00')).toBeInTheDocument();
        });

        it('should use ticketType as fallback name if name is missing', () => {
            const cart = {
                tickets: {
                    'vip-pass': {
                        price: 15000, // cents
                        quantity: 1,
                    },
                },
                donations: [],
                totals: { grandTotal: 15000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);
            expect(screen.getByText('vip-pass')).toBeInTheDocument();
        });

        it('should show Tickets category header when tickets exist', () => {
            const cart = {
                tickets: {
                    'full-pass': {
                        name: 'Full Pass',
                        price: 7500,
                        quantity: 1,
                    },
                },
                donations: [],
                totals: { grandTotal: 7500 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);
            expect(screen.getByText('Tickets')).toBeInTheDocument();
        });
    });

    describe('Donation Display', () => {
        it('should display donation items with donation name', () => {
            const cart = {
                tickets: {},
                donations: [{ id: 1, amount: 25, name: 'A Lo Cubano Donation' }],
                totals: { itemCount: 1, grandTotal: 2500 }, // grandTotal in cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            // Should display donation name (or default if missing)
            expect(screen.getByText('A Lo Cubano Donation')).toBeInTheDocument();
            // Donations have amount in dollars, not cents
            // $25.00 appears for both line item and grand total
            const priceElements = screen.getAllByText('$25.00');
            expect(priceElements.length).toBeGreaterThanOrEqual(1);
        });

        it('should display multiple donations', () => {
            const cart = {
                tickets: {},
                donations: [
                    { id: 1, amount: 25 },
                    { id: 2, amount: 50 },
                ],
                totals: { itemCount: 2, grandTotal: 7500 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            // Default name is "A Lo Cubano Donation"
            const donations = screen.getAllByText('A Lo Cubano Donation');
            expect(donations).toHaveLength(2);
        });

        it('should handle donations without id using index', () => {
            const cart = {
                tickets: {},
                donations: [{ amount: 25 }, { amount: 50 }],
                totals: { grandTotal: 7500 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const donations = screen.getAllByText('A Lo Cubano Donation');
            expect(donations).toHaveLength(2);
        });

        it('should show Donations category header when donations exist', () => {
            const cart = {
                tickets: {},
                donations: [{ id: 1, amount: 25 }],
                totals: { grandTotal: 2500 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);
            expect(screen.getByText('Donations')).toBeInTheDocument();
        });
    });

    describe('Total Display', () => {
        it('should display grand total converted from cents to dollars', () => {
            const cart = {
                tickets: {
                    'pass': { name: 'Pass', price: 10000, quantity: 1 }, // cents
                },
                donations: [],
                totals: { itemCount: 1, grandTotal: 10000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const total = screen.getByTestId('order-total');
            expect(total).toHaveTextContent('$100.00');
        });

        it('should use totals.total as fallback if grandTotal is missing', () => {
            const cart = {
                tickets: {
                    'pass': { name: 'Pass', price: 5000, quantity: 1 }, // cents
                },
                donations: [],
                totals: { total: 5000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const total = screen.getByTestId('order-total');
            expect(total).toHaveTextContent('$50.00');
        });

        it('should handle zero total', () => {
            const cart = {
                tickets: {
                    'free-pass': { name: 'Free Pass', price: 0, quantity: 1 },
                },
                donations: [],
                totals: { grandTotal: 0 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const total = screen.getByTestId('order-total');
            expect(total).toHaveTextContent('$0.00');
        });
    });

    describe('Mixed Cart Items', () => {
        it('should display both tickets and donations with category headers', () => {
            const cart = {
                tickets: {
                    'full-pass': {
                        name: 'Full Pass',
                        price: 7500, // cents
                        quantity: 1,
                    },
                },
                donations: [{ id: 1, amount: 25 }], // dollars
                totals: { itemCount: 2, grandTotal: 10000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            // Both category headers should appear
            expect(screen.getByText('Tickets')).toBeInTheDocument();
            expect(screen.getByText('Donations')).toBeInTheDocument();

            expect(screen.getByText('Full Pass')).toBeInTheDocument();
            expect(screen.getByText('A Lo Cubano Donation')).toBeInTheDocument();
            expect(screen.getByTestId('order-total')).toHaveTextContent('$100.00');
        });
    });

    describe('XSS Prevention', () => {
        it('should escape HTML in item names', () => {
            const cart = {
                tickets: {
                    'xss': {
                        name: '<script>alert("xss")</script>',
                        price: 5000, // cents
                        quantity: 1,
                    },
                },
                donations: [],
                totals: { grandTotal: 5000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            // React auto-escapes text content - verify text shows as literal string
            const itemRow = screen.getByTestId('order-item-xss');
            expect(itemRow).toBeInTheDocument();

            // The script text should be displayed as text, not executed
            // React escapes content automatically, so textContent shows the original text
            const itemName = itemRow.querySelector('h4');
            expect(itemName.textContent).toBe('<script>alert("xss")</script>');

            // innerHTML should have escaped version (React escapes automatically)
            expect(itemName.innerHTML).not.toContain('<script>');
        });

        it('should handle special characters safely', () => {
            const cart = {
                tickets: {
                    'special': {
                        name: 'Pass & Tickets "Special" <Sale>',
                        price: 5000, // cents
                        quantity: 1,
                    },
                },
                donations: [],
                totals: { grandTotal: 5000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const itemRow = screen.getByTestId('order-item-special');
            expect(itemRow).toBeInTheDocument();

            // React displays special characters as text content
            const itemName = itemRow.querySelector('h4');
            expect(itemName.textContent).toBe('Pass & Tickets "Special" <Sale>');

            // innerHTML should have escaped versions (React auto-escapes)
            expect(itemName.innerHTML).toContain('&amp;');
            expect(itemName.innerHTML).toContain('&lt;');
            expect(itemName.innerHTML).toContain('&gt;');
        });
    });

    describe('Component Structure', () => {
        it('should render with data-testid for testing', () => {
            const cart = {
                tickets: { 'test': { name: 'Test', price: 1000, quantity: 1 } }, // cents
                donations: [],
                totals: { grandTotal: 1000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            expect(screen.getByTestId('order-summary')).toBeInTheDocument();
            expect(screen.getByTestId('order-item-test')).toBeInTheDocument();
            expect(screen.getByTestId('order-total')).toBeInTheDocument();
        });

        it('should display unit price with "each" label', () => {
            const cart = {
                tickets: {
                    'pass': { name: 'Pass', price: 7500, quantity: 2 }, // cents
                },
                donations: [],
                totals: { grandTotal: 15000 }, // cents
            };

            render(<OrderSummary cart={cart} isLoading={false} />);
            expect(screen.getByText('$75.00 each')).toBeInTheDocument();
        });

        it('should display donation description', () => {
            const cart = {
                tickets: {},
                donations: [{ id: 1, amount: 25 }],
                totals: { grandTotal: 2500 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);
            expect(screen.getByText('One-time contribution')).toBeInTheDocument();
        });
    });
});
