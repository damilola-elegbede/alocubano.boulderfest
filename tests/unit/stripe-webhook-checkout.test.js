/**
 * Tests for Stripe Webhook Handler - Checkout Session Events
 * Tests the new Checkout Session event handling while maintaining backward compatibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReadStream } from 'fs';
import { readFileSync } from 'fs';
import path from 'path';

// Mock crypto module
vi.mock('crypto', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: actual,
        createHash: vi.fn().mockReturnValue({
            update: vi.fn().mockReturnThis(),
            digest: vi.fn().mockReturnValue('mocked_hash')
        }),
        timingSafeEqual: vi.fn().mockReturnValue(true)
    };
});

// Mock dependencies
const mockDb = {
    run: vi.fn(),
    get: vi.fn()
};

const mockBrevoService = {
    sendTransactionalEmail: vi.fn()
};

// Mock modules
vi.mock('../../api/lib/database.js', () => ({
    openDb: vi.fn(() => Promise.resolve(mockDb))
}));

vi.mock('../../api/lib/brevo-service.js', () => ({
    getBrevoService: vi.fn(() => mockBrevoService)
}));

// Mock Stripe
const mockStripe = {
    webhooks: {
        constructEvent: vi.fn()
    }
};

vi.mock('stripe', () => ({
    default: vi.fn(() => mockStripe)
}));

// Load the actual webhook handler
let webhookHandler;

describe('Stripe Webhook Handler - Checkout Session Events', () => {
    beforeEach(async () => {
        // Reset all mocks
        vi.clearAllMocks();
        
        // Set up environment variables
        process.env.STRIPE_SECRET_KEY = 'test_key';
        process.env.STRIPE_WEBHOOK_SECRET = 'test_webhook_secret';
        process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID = '2';
        process.env.BREVO_API_KEY = 'test_brevo_key';
        
        // Import the handler after mocking
        const module = await import('/Users/damilola/Documents/Projects/alocubano.boulderfest/api/payments/stripe-webhook.js');
        webhookHandler = module.default;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    // Helper to create mock request and response objects
    const createMockReqRes = (eventType, eventData) => {
        const req = {
            method: 'POST',
            headers: {
                'stripe-signature': 'test_signature'
            },
            // Mock readable stream
            [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(JSON.stringify({ type: eventType, data: eventData }));
            }
        };

        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        return { req, res };
    };

    describe('Checkout Session Events', () => {
        it('should handle checkout.session.completed event with payment_intent', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            const mockOrder = {
                id: 'order_123',
                customer_email: 'test@example.com',
                customer_name: 'Test User',
                order_type: 'tickets',
                order_total: 5000,
                order_details: JSON.stringify({ tickets: [{ type: 'early_bird', quantity: 2 }] }),
                confirmation_email_sent: 0
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            
            // Mock the database calls in sequence
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Email confirmation flag update
            
            mockBrevoService.sendTransactionalEmail.mockResolvedValue();

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            // Verify order status update (should be called twice - once to update status, once for email flag)
            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE orders'),
                ['pi_test_intent']
            );

            // Verify order lookup
            expect(mockDb.get).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM orders'),
                ['pi_test_intent']
            );

            // Verify email sent
            expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledWith(
                'test@example.com',
                '2',
                expect.objectContaining({
                    customerName: 'Test User'
                })
            );

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle checkout.session.completed event without payment_intent', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: null // Some payment methods don't create payment_intent
                    }
                }
            };

            const mockOrder = {
                id: 'order_123',
                customer_email: 'test@example.com',
                customer_name: 'Test User',
                order_type: 'tickets',
                order_total: 5000,
                order_details: JSON.stringify({ tickets: [{ type: 'early_bird', quantity: 2 }] }),
                confirmation_email_sent: 0
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Email confirmation flag update
            mockBrevoService.sendTransactionalEmail.mockResolvedValue();

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            // Verify lookup by session ID instead of payment_intent
            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining('stripe_checkout_session_id'),
                ['cs_test_session']
            );

            // Verify order lookup by session ID
            expect(mockDb.get).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM orders'),
                ['cs_test_session']
            );

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle checkout.session.async_payment_succeeded event', async () => {
            const mockEvent = {
                type: 'checkout.session.async_payment_succeeded',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            const mockOrder = {
                id: 'order_123',
                customer_email: 'test@example.com',
                customer_name: 'Test User',
                confirmation_email_sent: 0,
                order_details: JSON.stringify({}),
                order_type: 'donation',
                order_total: 2500
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Email confirmation flag update
            mockBrevoService.sendTransactionalEmail.mockResolvedValue();

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining('fulfillment_status = \'paid\''),
                ['pi_test_intent']
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle checkout.session.async_payment_failed event', async () => {
            const mockEvent = {
                type: 'checkout.session.async_payment_failed',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            const mockOrder = {
                customer_email: 'test@example.com',
                customer_name: 'Test User'
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining('fulfillment_status = \'failed\''),
                ['pi_test_intent']
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle checkout.session.expired event', async () => {
            const mockEvent = {
                type: 'checkout.session.expired',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining('fulfillment_status = \'expired\''),
                ['pi_test_intent']
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('Backward Compatibility', () => {
        it('should still handle payment_intent.succeeded events', async () => {
            const mockEvent = {
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_intent'
                    }
                }
            };

            const mockOrder = {
                id: 'order_123',
                customer_email: 'test@example.com',
                customer_name: 'Test User',
                order_type: 'tickets',
                order_total: 5000,
                order_details: JSON.stringify({ tickets: [] }),
                confirmation_email_sent: 0
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Email confirmation flag update
            mockBrevoService.sendTransactionalEmail.mockResolvedValue();

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining('stripe_payment_intent_id'),
                ['pi_test_intent']
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle orders without confirmation_email_sent column', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            const mockOrder = {
                id: 'order_123',
                customer_email: 'test@example.com',
                customer_name: 'Test User',
                order_type: 'tickets',
                order_total: 5000,
                order_details: JSON.stringify({ tickets: [] })
                // Note: no confirmation_email_sent field (backward compatibility)
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details
            mockBrevoService.sendTransactionalEmail.mockResolvedValue();
            
            // Mock database error for confirmation_email_sent update
            mockDb.run.mockRejectedValueOnce(new Error('no such column: confirmation_email_sent')); // Email flag update fails gracefully

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            // Should still send email and complete successfully
            expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('Duplicate Email Prevention', () => {
        it('should not send duplicate emails when confirmation_email_sent is 1', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            const mockOrder = {
                id: 'order_123',
                customer_email: 'test@example.com',
                customer_name: 'Test User',
                confirmation_email_sent: 1 // Already sent
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            // Should not send email
            expect(mockBrevoService.sendTransactionalEmail).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('Error Handling', () => {
        it('should handle signature verification failures', async () => {
            mockStripe.webhooks.constructEvent.mockImplementation(() => {
                throw new Error('Invalid signature');
            });

            const { req, res } = createMockReqRes('test', {});

            await webhookHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.stringContaining('Webhook Error')
                })
            );
        });

        it('should handle database errors gracefully', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockRejectedValueOnce(new Error('Database connection failed'));

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            // Should return 200 to prevent Stripe retries
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                received: true,
                error: 'Processing error logged'
            });
        });

        it('should handle email sending failures gracefully', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_session',
                        payment_intent: 'pi_test_intent'
                    }
                }
            };

            const mockOrder = {
                id: 'order_123',
                customer_email: 'test@example.com',
                customer_name: 'Test User',
                order_type: 'tickets',
                order_total: 5000,
                order_details: JSON.stringify({ tickets: [] }),
                confirmation_email_sent: 0
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
            mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order status update
            mockDb.get.mockResolvedValueOnce(mockOrder); // Get order details
            mockBrevoService.sendTransactionalEmail.mockRejectedValue(new Error('Email service unavailable'));

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            // Should still return success even if email fails
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('Event Type Coverage', () => {
        it('should log unhandled event types', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            
            const mockEvent = {
                type: 'unhandled.event.type',
                data: { object: {} }
            };

            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

            const { req, res } = createMockReqRes(mockEvent.type, mockEvent.data);

            await webhookHandler(req, res);

            expect(consoleSpy).toHaveBeenCalledWith('Unhandled event type: unhandled.event.type');
            expect(res.status).toHaveBeenCalledWith(200);
            
            consoleSpy.mockRestore();
        });
    });
});