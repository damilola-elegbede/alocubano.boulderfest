/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PaymentProvider, PaymentMethod } from '../../../../src/contexts/PaymentContext.jsx';
import { usePayment } from '../../../../src/hooks/usePayment.js';
import {
    createMockCartState,
    createMockCustomerInfo,
    createMockStripeSessionResponse,
    createMockPayPalOrderResponse,
    createMockPaymentFetch,
    createMockLocation,
    PaymentErrorScenarios,
} from '../../../mocks/payment-api-mocks.js';

describe('usePayment', () => {
    let mockLocation;
    let originalFetch;

    beforeEach(() => {
        // Mock window.location
        mockLocation = createMockLocation();

        // Save original fetch
        originalFetch = global.fetch;
    });

    afterEach(() => {
        // Restore location
        mockLocation.restore();

        // Restore fetch
        global.fetch = originalFetch;

        vi.clearAllMocks();
    });

    // Helper to create wrapper with PaymentProvider
    const wrapper = ({ children }) => (
        <PaymentProvider>{children}</PaymentProvider>
    );

    describe('Hook Behavior', () => {
        it('should return payment context values', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            expect(result.current).toHaveProperty('paymentMethod');
            expect(result.current).toHaveProperty('status');
            expect(result.current).toHaveProperty('error');
            expect(result.current).toHaveProperty('isProcessing');
            expect(result.current).toHaveProperty('isReady');
            expect(result.current).toHaveProperty('canSubmit');
        });

        it('should return functions for payment operations', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            expect(typeof result.current.setPaymentMethod).toBe('function');
            expect(typeof result.current.clearError).toBe('function');
            expect(typeof result.current.reset).toBe('function');
            expect(typeof result.current.processCheckout).toBe('function');
            expect(typeof result.current.prepareCartItems).toBe('function');
        });

        it('should return PaymentMethod constants', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            expect(result.current.PaymentMethod).toBeDefined();
            expect(result.current.PaymentMethod.STRIPE).toBe('stripe');
            expect(result.current.PaymentMethod.PAYPAL).toBe('paypal');
        });

        it('should have correct initial state', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            expect(result.current.paymentMethod).toBeNull();
            expect(result.current.status).toBe('idle');
            expect(result.current.error).toBeNull();
            expect(result.current.isProcessing).toBe(false);
            // isReady is false initially because no payment method is selected
            expect(result.current.isReady).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should throw error when used outside PaymentProvider', () => {
            // Suppress console.error for this test
            const originalError = console.error;
            console.error = () => {};

            expect(() => {
                renderHook(() => usePayment());
            }).toThrow('usePayment must be used within a PaymentProvider');

            console.error = originalError;
        });
    });

    describe('Payment Method Selection', () => {
        it('should set payment method to Stripe', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            expect(result.current.paymentMethod).toBe('stripe');
        });

        it('should set payment method to PayPal', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.PAYPAL);
            });

            expect(result.current.paymentMethod).toBe('paypal');
        });

        it('should clear error when setting payment method', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            // Set an error first (by failing a checkout)
            global.fetch = createMockPaymentFetch({ stripe: { success: false, error: 'Test error' } });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            // Error should be cleared
            expect(result.current.error).toBeNull();
        });
    });

    describe('prepareCartItems', () => {
        it('should prepare ticket items correctly', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        description: 'Full weekend access',
                        price: 15000,
                        quantity: 2,
                        eventId: 1,
                        venue: 'Avalon Ballroom',
                    },
                },
                donations: [],
            };

            const cartItems = result.current.prepareCartItems(cart);

            expect(cartItems).toHaveLength(1);
            expect(cartItems[0]).toMatchObject({
                type: 'ticket',
                ticketType: 'weekend-pass',
                name: 'A Lo Cubano Boulder Fest 2026-Weekend Pass',
                price: 15000,
                quantity: 2,
                eventDate: '2026-05-15',
                eventId: 1,
            });
        });

        it('should prepare donation items correctly', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = {
                tickets: {},
                donations: [
                    { amount: 50, name: 'General Donation' },
                ],
            };

            const cartItems = result.current.prepareCartItems(cart);

            expect(cartItems).toHaveLength(1);
            expect(cartItems[0]).toMatchObject({
                type: 'donation',
                price: 50,
                quantity: 1,
            });
        });

        it('should throw error for missing eventName', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                    },
                },
                donations: [],
            };

            expect(() => result.current.prepareCartItems(cart)).toThrow('Missing eventName for ticket');
        });

        it('should throw error for missing eventDate', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        price: 15000,
                        quantity: 1,
                    },
                },
                donations: [],
            };

            expect(() => result.current.prepareCartItems(cart)).toThrow('Missing eventDate for ticket');
        });

        it('should throw error for missing ticketType', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                    },
                },
                donations: [],
            };

            expect(() => result.current.prepareCartItems(cart)).toThrow('Missing ticketType for ticket');
        });

        it('should throw error for missing eventId', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                        // Missing eventId
                    },
                },
                donations: [],
            };

            expect(() => result.current.prepareCartItems(cart)).toThrow('Missing eventId for ticket');
        });

        it('should throw error for invalid eventId', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                        eventId: 'not-a-number',
                    },
                },
                donations: [],
            };

            expect(() => result.current.prepareCartItems(cart)).toThrow('Invalid eventId');
        });

        it('should handle empty cart', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = { tickets: {}, donations: [] };
            const cartItems = result.current.prepareCartItems(cart);

            expect(cartItems).toHaveLength(0);
        });

        it('should handle null cart', () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cartItems = result.current.prepareCartItems(null);
            expect(cartItems).toHaveLength(0);
        });
    });

    describe('processCheckout - Stripe', () => {
        it('should process Stripe checkout successfully', async () => {
            global.fetch = createMockPaymentFetch({ stripe: { success: true } });

            const { result } = renderHook(() => usePayment(), { wrapper });

            // Set payment method
            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            // Create cart with valid data
            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 2,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: { itemCount: 2 },
            };
            const customerInfo = createMockCustomerInfo();

            // Process checkout
            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(cart, customerInfo);
            });

            expect(checkoutResult.success).toBe(true);
            expect(checkoutResult.redirectUrl).toContain('https://checkout.stripe.com');
            expect(mockLocation.location.href).toContain('https://checkout.stripe.com');
        });

        it('should handle Stripe checkout failure', async () => {
            global.fetch = createMockPaymentFetch({
                stripe: { success: false, error: 'Invalid card' },
            });

            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: { itemCount: 1 },
            };
            const customerInfo = createMockCustomerInfo();

            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(cart, customerInfo);
            });

            expect(checkoutResult.success).toBe(false);
            expect(checkoutResult.error).toBe('Invalid card');
            expect(result.current.error).toBe('Invalid card');
        });
    });

    describe('processCheckout - PayPal', () => {
        it('should process PayPal checkout successfully', async () => {
            global.fetch = createMockPaymentFetch({
                paypal: { createOrder: { success: true } },
            });

            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.PAYPAL);
            });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 2,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: { itemCount: 2 },
            };
            const customerInfo = createMockCustomerInfo();

            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(cart, customerInfo);
            });

            expect(checkoutResult.success).toBe(true);
            expect(checkoutResult.redirectUrl).toContain('paypal.com');
            expect(mockLocation.location.href).toContain('paypal.com');
        });

        it('should handle PayPal checkout failure', async () => {
            global.fetch = createMockPaymentFetch({
                paypal: { createOrder: PaymentErrorScenarios.paypalOrderCreationFailed },
            });

            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.PAYPAL);
            });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: { itemCount: 1 },
            };
            const customerInfo = createMockCustomerInfo();

            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(cart, customerInfo);
            });

            expect(checkoutResult.success).toBe(false);
            expect(result.current.error).toBeTruthy();
        });
    });

    describe('processCheckout - Validation', () => {
        it('should fail if no payment method selected', async () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            const cart = createMockCartState();
            cart.totals = { itemCount: 1 };
            const customerInfo = createMockCustomerInfo();

            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(cart, customerInfo);
            });

            expect(checkoutResult.success).toBe(false);
            expect(checkoutResult.error).toBe('Please select a payment method');
        });

        it('should fail if cart is empty', async () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            const emptyCart = { totals: { itemCount: 0 } };
            const customerInfo = createMockCustomerInfo();

            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(emptyCart, customerInfo);
            });

            expect(checkoutResult.success).toBe(false);
            expect(checkoutResult.error).toBe('Your cart is empty');
        });

        it('should fail if cart is null', async () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            const customerInfo = createMockCustomerInfo();

            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(null, customerInfo);
            });

            expect(checkoutResult.success).toBe(false);
            expect(checkoutResult.error).toBe('Your cart is empty');
        });
    });

    describe('processCheckout - State Management', () => {
        it('should set isProcessing during checkout', async () => {
            // Create a delayed fetch to observe processing state
            global.fetch = vi.fn().mockImplementation(() =>
                new Promise(resolve =>
                    setTimeout(() => resolve(createMockStripeSessionResponse()), 50)
                )
            );

            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: { itemCount: 1 },
            };
            const customerInfo = createMockCustomerInfo();

            // Start checkout (don't await)
            act(() => {
                result.current.processCheckout(cart, customerInfo);
            });

            // Should be processing
            expect(result.current.isProcessing).toBe(true);
            expect(result.current.status).toBe('processing');
        });

        it('should handle network errors', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: { itemCount: 1 },
            };
            const customerInfo = createMockCustomerInfo();

            let checkoutResult;
            await act(async () => {
                checkoutResult = await result.current.processCheckout(cart, customerInfo);
            });

            expect(checkoutResult.success).toBe(false);
            expect(result.current.error).toContain('Network error');
        });
    });

    describe('clearError and reset', () => {
        it('should clear error', async () => {
            global.fetch = createMockPaymentFetch({
                stripe: { success: false, error: 'Test error' },
            });

            const { result } = renderHook(() => usePayment(), { wrapper });

            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            const cart = {
                tickets: {
                    'weekend-pass': {
                        ticketType: 'weekend-pass',
                        name: 'Weekend Pass',
                        eventName: 'A Lo Cubano Boulder Fest 2026',
                        eventDate: '2026-05-15',
                        price: 15000,
                        quantity: 1,
                        eventId: 1,
                    },
                },
                donations: [],
                totals: { itemCount: 1 },
            };

            // Trigger an error
            await act(async () => {
                await result.current.processCheckout(cart, createMockCustomerInfo());
            });

            expect(result.current.error).toBeTruthy();

            // Clear error
            act(() => {
                result.current.clearError();
            });

            expect(result.current.error).toBeNull();
        });

        it('should reset all state', async () => {
            const { result } = renderHook(() => usePayment(), { wrapper });

            // Set some state
            act(() => {
                result.current.setPaymentMethod(PaymentMethod.STRIPE);
            });

            expect(result.current.paymentMethod).toBe('stripe');

            // Reset
            act(() => {
                result.current.reset();
            });

            expect(result.current.paymentMethod).toBeNull();
            expect(result.current.status).toBe('idle');
            expect(result.current.error).toBeNull();
        });
    });
});
