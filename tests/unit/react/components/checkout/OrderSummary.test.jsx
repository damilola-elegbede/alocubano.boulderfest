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
        it('should display ticket items', () => {
            const cart = {
                tickets: {
                    'full-pass': {
                        name: 'Full Pass',
                        price: 75,
                        quantity: 2,
                    },
                },
                donations: [],
                totals: { itemCount: 2, grandTotal: 150 },
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
                        price: 75,
                        quantity: 1,
                    },
                    'day-pass': {
                        name: 'Day Pass',
                        price: 40,
                        quantity: 2,
                    },
                },
                donations: [],
                totals: { itemCount: 3, grandTotal: 155 },
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
                        price: 150,
                        quantity: 1,
                    },
                },
                donations: [],
                totals: { grandTotal: 150 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);
            expect(screen.getByText('vip-pass')).toBeInTheDocument();
        });
    });

    describe('Donation Display', () => {
        it('should display donation items', () => {
            const cart = {
                tickets: {},
                donations: [{ id: 1, amount: 25 }],
                totals: { itemCount: 1, grandTotal: 25 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            expect(screen.getByText('Donation')).toBeInTheDocument();
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
                totals: { itemCount: 2, grandTotal: 75 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const donations = screen.getAllByText('Donation');
            expect(donations).toHaveLength(2);
        });

        it('should handle donations without id using index', () => {
            const cart = {
                tickets: {},
                donations: [{ amount: 25 }, { amount: 50 }],
                totals: { grandTotal: 75 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const donations = screen.getAllByText('Donation');
            expect(donations).toHaveLength(2);
        });
    });

    describe('Total Display', () => {
        it('should display grand total', () => {
            const cart = {
                tickets: {
                    'pass': { name: 'Pass', price: 100, quantity: 1 },
                },
                donations: [],
                totals: { itemCount: 1, grandTotal: 100 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const total = screen.getByTestId('order-total');
            expect(total).toHaveTextContent('$100.00');
        });

        it('should use totals.total as fallback if grandTotal is missing', () => {
            const cart = {
                tickets: {
                    'pass': { name: 'Pass', price: 50, quantity: 1 },
                },
                donations: [],
                totals: { total: 50 },
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
        it('should display both tickets and donations', () => {
            const cart = {
                tickets: {
                    'full-pass': {
                        name: 'Full Pass',
                        price: 75,
                        quantity: 1,
                    },
                },
                donations: [{ id: 1, amount: 25 }],
                totals: { itemCount: 2, grandTotal: 100 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            expect(screen.getByText('Full Pass')).toBeInTheDocument();
            expect(screen.getByText('Donation')).toBeInTheDocument();
            expect(screen.getByTestId('order-total')).toHaveTextContent('$100.00');
        });
    });

    describe('XSS Prevention', () => {
        it('should escape HTML in item names', () => {
            const cart = {
                tickets: {
                    'xss': {
                        name: '<script>alert("xss")</script>',
                        price: 50,
                        quantity: 1,
                    },
                },
                donations: [],
                totals: { grandTotal: 50 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            // React auto-escapes text content - verify text shows as literal string
            const itemRow = screen.getByTestId('order-item-xss');
            expect(itemRow).toBeInTheDocument();

            // The script text should be displayed as text, not executed
            // React escapes content automatically, so textContent shows the original text
            const itemName = itemRow.querySelector('.item-name');
            expect(itemName.textContent).toBe('<script>alert("xss")</script>');

            // innerHTML should have escaped version (React escapes automatically)
            expect(itemName.innerHTML).not.toContain('<script>');
        });

        it('should handle special characters safely', () => {
            const cart = {
                tickets: {
                    'special': {
                        name: 'Pass & Tickets "Special" <Sale>',
                        price: 50,
                        quantity: 1,
                    },
                },
                donations: [],
                totals: { grandTotal: 50 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            const itemRow = screen.getByTestId('order-item-special');
            expect(itemRow).toBeInTheDocument();

            // React displays special characters as text content
            const itemName = itemRow.querySelector('.item-name');
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
                tickets: { 'test': { name: 'Test', price: 10, quantity: 1 } },
                donations: [],
                totals: { grandTotal: 10 },
            };

            render(<OrderSummary cart={cart} isLoading={false} />);

            expect(screen.getByTestId('order-summary')).toBeInTheDocument();
            expect(screen.getByTestId('order-item-test')).toBeInTheDocument();
            expect(screen.getByTestId('order-total')).toBeInTheDocument();
        });
    });
});
