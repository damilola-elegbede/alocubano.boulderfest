/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { CartProvider } from '../../../../src/contexts/CartContext.jsx';
import { useCart } from '../../../../src/hooks/useCart.js';

describe('useCart', () => {
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

    describe('Hook Behavior', () => {
        it('should return cart context values', () => {
            const { result } = renderHook(() => useCart(), {
                wrapper: CartProvider
            });

            expect(result.current).toHaveProperty('cart');
            expect(result.current).toHaveProperty('isInitialized');
            expect(result.current).toHaveProperty('isLoading');
            expect(result.current).toHaveProperty('addTicket');
            expect(result.current).toHaveProperty('removeTicket');
            expect(result.current).toHaveProperty('updateTicketQuantity');
            expect(result.current).toHaveProperty('addDonation');
            expect(result.current).toHaveProperty('removeDonation');
            expect(result.current).toHaveProperty('clear');
        });

        it('should return functions for cart methods', () => {
            const { result } = renderHook(() => useCart(), {
                wrapper: CartProvider
            });

            expect(typeof result.current.addTicket).toBe('function');
            expect(typeof result.current.removeTicket).toBe('function');
            expect(typeof result.current.updateTicketQuantity).toBe('function');
            expect(typeof result.current.addDonation).toBe('function');
            expect(typeof result.current.removeDonation).toBe('function');
            expect(typeof result.current.clear).toBe('function');
        });

        it('should return booleans for initialization states', () => {
            const { result } = renderHook(() => useCart(), {
                wrapper: CartProvider
            });

            expect(typeof result.current.isInitialized).toBe('boolean');
            expect(typeof result.current.isLoading).toBe('boolean');
        });
    });

    describe('Error Handling', () => {
        it('should throw error when used outside CartProvider', () => {
            // Suppress console.error for this test
            const originalError = console.error;
            console.error = () => {};

            expect(() => {
                renderHook(() => useCart());
            }).toThrow('useCart must be used within a CartProvider');

            console.error = originalError;
        });
    });
});
