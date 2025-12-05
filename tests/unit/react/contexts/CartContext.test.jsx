/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { CartProvider } from '../../../../src/contexts/CartContext.jsx';
import { useCart } from '../../../../src/hooks/useCart.js';

// Test component that uses the cart context
function TestComponent() {
    const { cart, isInitialized, isLoading, addTicket, removeTicket, clear } = useCart();

    return (
        <div>
            <div data-testid="is-initialized">{isInitialized ? 'true' : 'false'}</div>
            <div data-testid="is-loading">{isLoading ? 'true' : 'false'}</div>
            <div data-testid="item-count">{cart?.totals?.itemCount || 0}</div>
            <button onClick={() => addTicket({ ticketType: 'test', quantity: 1, price: 10 })}>
                Add Ticket
            </button>
            <button onClick={() => removeTicket('test')}>Remove Ticket</button>
            <button onClick={clear}>Clear Cart</button>
        </div>
    );
}

describe('CartContext', () => {
    let mockCartManager;

    beforeEach(() => {
        // Mock globalCartManager
        mockCartManager = {
            getState: vi.fn(() => ({
                tickets: {},
                donations: [],
                metadata: {},
                totals: {
                    itemCount: 0,
                    ticketTotal: 0,
                    donationTotal: 0,
                    grandTotal: 0
                }
            })),
            addTicket: vi.fn(),
            removeTicket: vi.fn(),
            updateTicketQuantity: vi.fn(),
            addDonation: vi.fn(),
            removeDonation: vi.fn(),
            clear: vi.fn()
        };

        window.globalCartManager = mockCartManager;
    });

    afterEach(() => {
        delete window.globalCartManager;
        vi.clearAllMocks();
    });

    describe('Provider Rendering', () => {
        it('should render children without crashing', () => {
            render(
                <CartProvider>
                    <div data-testid="child">Child Content</div>
                </CartProvider>
            );

            expect(screen.getByTestId('child')).toBeInTheDocument();
        });

        it('should provide cart context to children', () => {
            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            expect(screen.getByTestId('is-initialized')).toBeInTheDocument();
            expect(screen.getByTestId('is-loading')).toBeInTheDocument();
        });
    });

    describe('Cart State', () => {
        it('should initialize with cart state from globalCartManager', async () => {
            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            await waitFor(() => {
                expect(mockCartManager.getState).toHaveBeenCalled();
            });
        });

        it('should set isInitialized to true after initialization', async () => {
            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
            });
        });

        it('should set isLoading to false after initialization', async () => {
            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
            });
        });
    });

    describe('Cart Methods', () => {
        it('should call globalCartManager.addTicket when addTicket is called', async () => {
            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            const addButton = screen.getByText('Add Ticket');
            addButton.click();

            await waitFor(() => {
                expect(mockCartManager.addTicket).toHaveBeenCalledWith({
                    ticketType: 'test',
                    quantity: 1,
                    price: 10
                });
            });
        });

        it('should call globalCartManager.removeTicket when removeTicket is called', async () => {
            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            const removeButton = screen.getByText('Remove Ticket');
            removeButton.click();

            await waitFor(() => {
                expect(mockCartManager.removeTicket).toHaveBeenCalledWith('test');
            });
        });

        it('should call globalCartManager.clear when clear is called', async () => {
            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            const clearButton = screen.getByText('Clear Cart');
            clearButton.click();

            await waitFor(() => {
                expect(mockCartManager.clear).toHaveBeenCalled();
            });
        });
    });

    describe('Event Synchronization', () => {
        it('should update cart state when cart:updated event is dispatched', async () => {
            mockCartManager.getState.mockReturnValueOnce({
                tickets: {},
                donations: [],
                totals: { itemCount: 0 }
            }).mockReturnValueOnce({
                tickets: { test: { quantity: 1 } },
                donations: [],
                totals: { itemCount: 1 }
            });

            render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            // Wait for initial render
            await waitFor(() => {
                expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
            });

            // Dispatch cart:updated event (CartManager emits to document)
            document.dispatchEvent(new CustomEvent('cart:updated'));

            await waitFor(() => {
                expect(screen.getByTestId('item-count')).toHaveTextContent('1');
            });
        });
    });

    describe('Cleanup', () => {
        it('should cleanup event listeners on unmount', () => {
            const documentAddSpy = vi.spyOn(document, 'addEventListener');
            const documentRemoveSpy = vi.spyOn(document, 'removeEventListener');

            const { unmount } = render(
                <CartProvider>
                    <TestComponent />
                </CartProvider>
            );

            unmount();

            // Verify document listener cleanup (both events now on document)
            expect(documentRemoveSpy).toHaveBeenCalledWith('cart:initialized', expect.any(Function));
            expect(documentRemoveSpy).toHaveBeenCalledWith('cart:updated', expect.any(Function));

            documentAddSpy.mockRestore();
            documentRemoveSpy.mockRestore();
        });
    });
});
