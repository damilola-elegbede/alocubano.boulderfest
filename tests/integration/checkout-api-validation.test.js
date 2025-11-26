/**
 * Checkout API Validation Integration Tests
 *
 * Tests Zod schema validation for checkout API endpoints.
 * Validates that the API properly rejects invalid requests
 * and accepts valid requests with proper data.
 *
 * @module tests/integration/checkout-api-validation
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { CheckoutRequestSchema, PayPalOrderRequestSchema, PayPalCaptureRequestSchema } from '../../src/api/schemas/checkout.js';
import { validateRequest, formatZodErrors } from '../../src/api/helpers/validate.js';

describe('Checkout API Zod Validation', () => {
    describe('CheckoutRequestSchema (Stripe)', () => {
        describe('Valid Requests', () => {
            test('should accept valid checkout request with ticket', () => {
                const validRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Weekend Pass',
                            price: 15000,
                            quantity: 2,
                            ticketType: 'weekend-pass',
                            eventDate: '2026-05-15',
                            eventId: 1,
                        },
                    ],
                    customerInfo: {
                        email: 'test@example.com',
                        firstName: 'Test',
                        lastName: 'User',
                    },
                };

                const result = validateRequest(CheckoutRequestSchema, validRequest);
                expect(result.success).toBe(true);
                expect(result.data).toMatchObject(validRequest);
            });

            test('should accept checkout request with donation', () => {
                const validRequest = {
                    cartItems: [
                        {
                            type: 'donation',
                            name: 'General Donation',
                            price: 50,
                            quantity: 1,
                        },
                    ],
                    customerInfo: {
                        email: 'donor@example.com',
                    },
                };

                const result = validateRequest(CheckoutRequestSchema, validRequest);
                expect(result.success).toBe(true);
            });

            test('should accept request without customer info', () => {
                const validRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Weekend Pass',
                            price: 15000,
                            quantity: 1,
                        },
                    ],
                };

                const result = validateRequest(CheckoutRequestSchema, validRequest);
                expect(result.success).toBe(true);
            });

            test('should accept request with testMode flag', () => {
                const validRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Test Ticket',
                            price: 100,
                            quantity: 1,
                        },
                    ],
                    testMode: true,
                };

                const result = validateRequest(CheckoutRequestSchema, validRequest);
                expect(result.success).toBe(true);
                expect(result.data.testMode).toBe(true);
            });
        });

        describe('Invalid Requests', () => {
            test('should reject empty cart', () => {
                const invalidRequest = {
                    cartItems: [],
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
                expect(result.errors[0].message).toContain('at least one item');
            });

            test('should reject missing cartItems', () => {
                const invalidRequest = {
                    customerInfo: { email: 'test@example.com' },
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject invalid item type', () => {
                const invalidRequest = {
                    cartItems: [
                        {
                            type: 'invalid',
                            name: 'Test Item',
                            price: 100,
                            quantity: 1,
                        },
                    ],
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject negative price', () => {
                const invalidRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Test Ticket',
                            price: -100,
                            quantity: 1,
                        },
                    ],
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject zero quantity', () => {
                const invalidRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Test Ticket',
                            price: 100,
                            quantity: 0,
                        },
                    ],
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject quantity over 100', () => {
                const invalidRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Test Ticket',
                            price: 100,
                            quantity: 101,
                        },
                    ],
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject invalid email format', () => {
                const invalidRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Test Ticket',
                            price: 100,
                            quantity: 1,
                        },
                    ],
                    customerInfo: {
                        email: 'not-an-email',
                    },
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject too many items', () => {
                const invalidRequest = {
                    cartItems: Array(51).fill({
                        type: 'ticket',
                        name: 'Test Ticket',
                        price: 100,
                        quantity: 1,
                    }),
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject item name over 200 characters', () => {
                const invalidRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'A'.repeat(201),
                            price: 100,
                            quantity: 1,
                        },
                    ],
                };

                const result = validateRequest(CheckoutRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });
        });
    });

    describe('PayPalOrderRequestSchema', () => {
        describe('Valid Requests', () => {
            test('should accept valid PayPal order request', () => {
                const validRequest = {
                    cartItems: [
                        {
                            type: 'ticket',
                            name: 'Weekend Pass',
                            price: 15000,
                            quantity: 1,
                        },
                    ],
                    customerInfo: {
                        email: 'test@example.com',
                    },
                    deviceInfo: {
                        isMobile: true,
                        connectionType: '4g',
                    },
                };

                const result = validateRequest(PayPalOrderRequestSchema, validRequest);
                expect(result.success).toBe(true);
            });

            test('should accept request without deviceInfo', () => {
                const validRequest = {
                    cartItems: [
                        {
                            type: 'donation',
                            name: 'Donation',
                            price: 100,
                            quantity: 1,
                        },
                    ],
                };

                const result = validateRequest(PayPalOrderRequestSchema, validRequest);
                expect(result.success).toBe(true);
            });
        });

        describe('Invalid Requests', () => {
            test('should reject empty cartItems', () => {
                const invalidRequest = {
                    cartItems: [],
                };

                const result = validateRequest(PayPalOrderRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });
        });
    });

    describe('PayPalCaptureRequestSchema', () => {
        describe('Valid Requests', () => {
            test('should accept valid capture request', () => {
                const validRequest = {
                    orderId: 'PAYPAL_ORDER_123456',
                };

                const result = validateRequest(PayPalCaptureRequestSchema, validRequest);
                expect(result.success).toBe(true);
            });

            test('should accept request with transactionId', () => {
                const validRequest = {
                    orderId: 'PAYPAL_ORDER_123456',
                    transactionId: 'txn_abc123',
                };

                const result = validateRequest(PayPalCaptureRequestSchema, validRequest);
                expect(result.success).toBe(true);
            });
        });

        describe('Invalid Requests', () => {
            test('should reject missing orderId', () => {
                const invalidRequest = {};

                const result = validateRequest(PayPalCaptureRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject empty orderId', () => {
                const invalidRequest = {
                    orderId: '',
                };

                const result = validateRequest(PayPalCaptureRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });

            test('should reject orderId over 100 characters', () => {
                const invalidRequest = {
                    orderId: 'A'.repeat(101),
                };

                const result = validateRequest(PayPalCaptureRequestSchema, invalidRequest);
                expect(result.success).toBe(false);
            });
        });
    });

    describe('formatZodErrors', () => {
        test('should format single error correctly', () => {
            const invalidRequest = {
                cartItems: [],
            };

            const result = validateRequest(CheckoutRequestSchema, invalidRequest);
            expect(result.success).toBe(false);

            const formatted = result.errors;
            expect(formatted.length).toBeGreaterThan(0);
            expect(formatted[0]).toHaveProperty('path');
            expect(formatted[0]).toHaveProperty('message');
        });

        test('should format multiple errors correctly', () => {
            const invalidRequest = {
                cartItems: [
                    {
                        type: 'invalid',
                        name: '',
                        price: -1,
                        quantity: 0,
                    },
                ],
            };

            const result = validateRequest(CheckoutRequestSchema, invalidRequest);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(1);
        });
    });
});
