/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AppProviders } from '../../../../src/providers/AppProviders.jsx';
import { useTheme } from '../../../../src/hooks/useTheme.js';
import { useCart } from '../../../../src/hooks/useCart.js';
import { useTimeManager } from '../../../../src/hooks/useTimeManager.js';

// Test component that uses all three hooks
function IntegrationTestComponent() {
    const { theme } = useTheme();
    const { isInitialized: cartInitialized, isLoading: cartLoading } = useCart();
    const { formatDate } = useTimeManager();

    return (
        <div>
            <div data-testid="theme">{theme}</div>
            <div data-testid="cart-initialized">{cartInitialized ? 'true' : 'false'}</div>
            <div data-testid="cart-loading">{cartLoading ? 'true' : 'false'}</div>
            <div data-testid="formatted-date">{formatDate('2026-05-15T19:00:00Z')}</div>
        </div>
    );
}

describe('AppProviders Integration', () => {
    let mockCartManager;

    beforeEach(() => {
        // Mock globalCartManager for cart tests
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
            clear: vi.fn()
        };

        window.globalCartManager = mockCartManager;
    });

    afterEach(() => {
        delete window.globalCartManager;
        vi.clearAllMocks();
    });

    describe('Provider Composition', () => {
        it('should render children without crashing', () => {
            render(
                <AppProviders>
                    <div data-testid="child">Test Content</div>
                </AppProviders>
            );

            expect(screen.getByTestId('child')).toBeInTheDocument();
            expect(screen.getByTestId('child')).toHaveTextContent('Test Content');
        });

        it('should provide all three contexts to children', () => {
            render(
                <AppProviders>
                    <IntegrationTestComponent />
                </AppProviders>
            );

            // All test IDs should exist
            expect(screen.getByTestId('theme')).toBeInTheDocument();
            expect(screen.getByTestId('cart-initialized')).toBeInTheDocument();
            expect(screen.getByTestId('cart-loading')).toBeInTheDocument();
            expect(screen.getByTestId('formatted-date')).toBeInTheDocument();
        });
    });

    describe('Context Availability', () => {
        it('should make useTheme available', () => {
            render(
                <AppProviders>
                    <IntegrationTestComponent />
                </AppProviders>
            );

            const theme = screen.getByTestId('theme').textContent;
            expect(['light', 'dark']).toContain(theme);
        });

        it('should make useCart available', () => {
            render(
                <AppProviders>
                    <IntegrationTestComponent />
                </AppProviders>
            );

            // Cart should be initializing or initialized
            const cartInitialized = screen.getByTestId('cart-initialized').textContent;
            expect(['true', 'false']).toContain(cartInitialized);
        });

        it('should make useTimeManager available', () => {
            render(
                <AppProviders>
                    <IntegrationTestComponent />
                </AppProviders>
            );

            const formattedDate = screen.getByTestId('formatted-date').textContent;
            expect(formattedDate).toContain('May 15, 2026');
        });
    });

    describe('No Context Leakage', () => {
        it('should not have prop drilling issues', () => {
            function DeepNestedComponent() {
                // Should still have access to all contexts
                const { theme } = useTheme();
                const { isInitialized } = useCart();
                const { formatDate } = useTimeManager();

                return (
                    <div>
                        <span data-testid="deep-theme">{theme}</span>
                        <span data-testid="deep-cart">{isInitialized ? 'yes' : 'no'}</span>
                        <span data-testid="deep-time">{formatDate('2026-05-15')}</span>
                    </div>
                );
            }

            render(
                <AppProviders>
                    <div>
                        <div>
                            <div>
                                <DeepNestedComponent />
                            </div>
                        </div>
                    </div>
                </AppProviders>
            );

            expect(screen.getByTestId('deep-theme')).toBeInTheDocument();
            expect(screen.getByTestId('deep-cart')).toBeInTheDocument();
            expect(screen.getByTestId('deep-time')).toBeInTheDocument();
        });
    });
});
