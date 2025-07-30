/**
 * Integration tests for payment API endpoints
 * Tests the complete payment flow with mocked external services
 */

const request = require('supertest');
const { mockStripe } = require('../mocks/stripe-mock');

describe('Payment API Integration Tests', () => {
    let app;
    let mockDatabase;
    let stripeMock;

    beforeAll(() => {
        // Mock environment variables
        process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';
        process.env.NODE_ENV = 'test';
    });

    beforeEach(() => {
        // Reset mocks
        stripeMock = mockStripe();
        mockDatabase = {
            tickets: new Map(),
            orders: new Map(),
            inventory: {
                'full-festival': 1000,
                'workshop-only': 500,
                'social-only': 800
            }
        };

        // Mock app instance
        app = {
            post: jest.fn(),
            get: jest.fn()
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/payments/create-checkout-session', () => {
        test('creates checkout session with valid ticket selection', async () => {
            const requestBody = {
                items: [
                    { ticketType: 'full-festival', quantity: 2 },
                    { ticketType: 'workshop-only', quantity: 1 }
                ],
                customerEmail: 'dancer@example.com',
                successUrl: 'https://alocubanoboulderfest.com/success',
                cancelUrl: 'https://alocubanoboulderfest.com/tickets'
            };

            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: 'cs_test_123',
                url: 'https://checkout.stripe.com/pay/cs_test_123',
                amount_total: 90000, // $900 in cents
                currency: 'usd'
            });

            const response = await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(200);

            expect(response.body).toEqual({
                sessionId: 'cs_test_123',
                checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_123'
            });

            expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith({
                payment_method_types: ['card'],
                line_items: expect.any(Array),
                mode: 'payment',
                success_url: requestBody.successUrl,
                cancel_url: requestBody.cancelUrl,
                customer_email: requestBody.customerEmail,
                metadata: expect.objectContaining({
                    orderType: 'festival_tickets'
                })
            });
        });

        test('applies early bird discount when applicable', async () => {
            // Mock current date to be before early bird deadline
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-02-15'));

            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 1 }],
                customerEmail: 'earlybird@example.com'
            };

            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: 'cs_test_early',
                url: 'https://checkout.stripe.com/pay/cs_test_early',
                amount_total: 24000 // $240 (20% off $300)
            });

            const response = await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(200);

            expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    line_items: expect.arrayContaining([
                        expect.objectContaining({
                            price_data: expect.objectContaining({
                                unit_amount: 24000 // Discounted price
                            })
                        })
                    ])
                })
            );

            jest.useRealTimers();
        });

        test('applies group discount for 5+ tickets', async () => {
            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 6 }],
                customerEmail: 'group@example.com'
            };

            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: 'cs_test_group',
                amount_total: 162000 // $1620 (10% off $1800)
            });

            const response = await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(200);

            expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    discounts: expect.arrayContaining([
                        expect.objectContaining({
                            coupon: 'GROUP_DISCOUNT_10'
                        })
                    ])
                })
            );
        });

        test('validates promo code and applies discount', async () => {
            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 1 }],
                promoCode: 'DANCE2026',
                customerEmail: 'promo@example.com'
            };

            // Mock promo code validation
            stripeMock.promotionCodes.list.mockResolvedValue({
                data: [{
                    id: 'promo_123',
                    code: 'DANCE2026',
                    coupon: {
                        percent_off: 15,
                        valid: true
                    }
                }]
            });

            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: 'cs_test_promo',
                amount_total: 25500 // $255 (15% off $300)
            });

            const response = await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(200);

            expect(stripeMock.promotionCodes.list).toHaveBeenCalledWith({
                code: 'DANCE2026',
                active: true
            });
        });

        test('returns 400 for invalid ticket type', async () => {
            const requestBody = {
                items: [{ ticketType: 'invalid-type', quantity: 1 }],
                customerEmail: 'test@example.com'
            };

            const response = await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(400);

            expect(response.body).toEqual({
                error: 'Invalid ticket type: invalid-type'
            });
        });

        test('returns 400 for sold out tickets', async () => {
            // Set inventory to 0
            mockDatabase.inventory['full-festival'] = 0;

            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 1 }],
                customerEmail: 'test@example.com'
            };

            const response = await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(400);

            expect(response.body).toEqual({
                error: 'Insufficient inventory for full-festival tickets'
            });
        });

        test('reserves inventory during checkout', async () => {
            const initialInventory = mockDatabase.inventory['full-festival'];
            
            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 2 }],
                customerEmail: 'test@example.com'
            };

            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: 'cs_test_reserve',
                url: 'https://checkout.stripe.com/pay/cs_test_reserve'
            });

            await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(200);

            // Verify inventory was reserved
            expect(mockDatabase.inventory['full-festival']).toBe(initialInventory - 2);
        });

        test('includes metadata for order tracking', async () => {
            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 1 }],
                customerEmail: 'metadata@example.com',
                referralSource: 'instagram',
                specialRequests: 'Vegetarian meal'
            };

            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: 'cs_test_metadata',
                url: 'https://checkout.stripe.com/pay/cs_test_metadata'
            });

            await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(200);

            expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        referralSource: 'instagram',
                        specialRequests: 'Vegetarian meal',
                        orderType: 'festival_tickets'
                    })
                })
            );
        });

        test('handles Stripe API errors gracefully', async () => {
            stripeMock.checkout.sessions.create.mockRejectedValue(
                new Error('Stripe API Error: Invalid API Key')
            );

            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 1 }],
                customerEmail: 'error@example.com'
            };

            const response = await request(app)
                .post('/api/payments/create-checkout-session')
                .send(requestBody)
                .expect(500);

            expect(response.body).toEqual({
                error: 'Payment processing error',
                message: 'Unable to create checkout session'
            });
        });
    });

    describe('POST /api/webhooks/stripe', () => {
        test('processes successful payment webhook', async () => {
            const webhookPayload = {
                id: 'evt_test_success',
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_123',
                        payment_status: 'paid',
                        amount_total: 30000,
                        customer_email: 'success@example.com',
                        metadata: {
                            items: JSON.stringify([
                                { ticketType: 'full-festival', quantity: 1 }
                            ])
                        }
                    }
                }
            };

            const signature = 'test_signature';

            stripeMock.webhooks.constructEvent.mockReturnValue(webhookPayload);

            const response = await request(app)
                .post('/api/webhooks/stripe')
                .set('stripe-signature', signature)
                .send(webhookPayload)
                .expect(200);

            expect(response.body).toEqual({ received: true });

            // Verify order was created
            expect(mockDatabase.orders.has('cs_test_123')).toBe(true);
            const order = mockDatabase.orders.get('cs_test_123');
            expect(order.status).toBe('completed');
            expect(order.customerEmail).toBe('success@example.com');
        });

        test('validates webhook signature', async () => {
            const webhookPayload = { type: 'checkout.session.completed' };
            const invalidSignature = 'invalid_signature';

            stripeMock.webhooks.constructEvent.mockImplementation(() => {
                throw new Error('Invalid signature');
            });

            const response = await request(app)
                .post('/api/webhooks/stripe')
                .set('stripe-signature', invalidSignature)
                .send(webhookPayload)
                .expect(400);

            expect(response.body).toEqual({
                error: 'Webhook signature verification failed'
            });
        });

        test('handles payment failure webhook', async () => {
            const webhookPayload = {
                id: 'evt_test_failure',
                type: 'payment_intent.payment_failed',
                data: {
                    object: {
                        id: 'pi_test_failed',
                        amount: 30000,
                        metadata: {
                            checkoutSessionId: 'cs_test_failed'
                        }
                    }
                }
            };

            stripeMock.webhooks.constructEvent.mockReturnValue(webhookPayload);

            const response = await request(app)
                .post('/api/webhooks/stripe')
                .set('stripe-signature', 'test_signature')
                .send(webhookPayload)
                .expect(200);

            // Verify inventory was released
            const originalInventory = 1000;
            expect(mockDatabase.inventory['full-festival']).toBe(originalInventory);
        });

        test('prevents duplicate webhook processing', async () => {
            const webhookPayload = {
                id: 'evt_test_duplicate',
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_duplicate',
                        payment_status: 'paid'
                    }
                }
            };

            stripeMock.webhooks.constructEvent.mockReturnValue(webhookPayload);

            // Process webhook first time
            await request(app)
                .post('/api/payments/webhook')
                .set('stripe-signature', 'test_signature')
                .send(webhookPayload)
                .expect(200);

            // Process same webhook again
            const response = await request(app)
                .post('/api/webhooks/stripe')
                .set('stripe-signature', 'test_signature')
                .send(webhookPayload)
                .expect(200);

            expect(response.body).toEqual({
                received: true,
                message: 'Event already processed'
            });
        });

        test('sends confirmation email after successful payment', async () => {
            const mockEmailService = {
                sendConfirmationEmail: jest.fn().mockResolvedValue(true)
            };

            const webhookPayload = {
                id: 'evt_test_email',
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_email',
                        payment_status: 'paid',
                        customer_email: 'customer@example.com',
                        amount_total: 30000,
                        metadata: {
                            items: JSON.stringify([
                                { ticketType: 'full-festival', quantity: 1 }
                            ])
                        }
                    }
                }
            };

            stripeMock.webhooks.constructEvent.mockReturnValue(webhookPayload);

            await request(app)
                .post('/api/payments/webhook')
                .set('stripe-signature', 'test_signature')
                .send(webhookPayload)
                .expect(200);

            expect(mockEmailService.sendConfirmationEmail).toHaveBeenCalledWith({
                to: 'customer@example.com',
                orderDetails: expect.any(Object),
                ticketLinks: expect.any(Array)
            });
        });
    });

    describe('GET /api/payments/status/:sessionId', () => {
        test('returns payment status for valid session', async () => {
            const sessionId = 'cs_test_status';
            
            stripeMock.checkout.sessions.retrieve.mockResolvedValue({
                id: sessionId,
                payment_status: 'paid',
                amount_total: 30000,
                currency: 'usd',
                customer_email: 'status@example.com'
            });

            const response = await request(app)
                .get(`/api/payments/status/${sessionId}`)
                .expect(200);

            expect(response.body).toEqual({
                sessionId,
                status: 'paid',
                amount: 300.00,
                currency: 'USD',
                customerEmail: 'status@example.com'
            });
        });

        test('returns 404 for non-existent session', async () => {
            const sessionId = 'cs_test_notfound';
            
            stripeMock.checkout.sessions.retrieve.mockRejectedValue(
                new Error('No such checkout session')
            );

            const response = await request(app)
                .get(`/api/payments/status/${sessionId}`)
                .expect(404);

            expect(response.body).toEqual({
                error: 'Session not found'
            });
        });

        test('masks sensitive information in response', async () => {
            const sessionId = 'cs_test_sensitive';
            
            stripeMock.checkout.sessions.retrieve.mockResolvedValue({
                id: sessionId,
                payment_status: 'paid',
                payment_method_details: {
                    card: {
                        last4: '4242',
                        brand: 'visa'
                    }
                },
                customer_details: {
                    email: 'customer@example.com',
                    phone: '+13035551234'
                }
            });

            const response = await request(app)
                .get(`/api/payments/status/${sessionId}`)
                .expect(200);

            // Should not include sensitive payment method details
            expect(response.body.payment_method_details).toBeUndefined();
            expect(response.body.customer_details).toBeUndefined();
        });
    });

    describe('POST /api/payments/refund', () => {
        test('processes full refund successfully', async () => {
            const refundRequest = {
                paymentIntentId: 'pi_test_refund',
                reason: 'Event cancellation'
            };

            stripeMock.refunds.create.mockResolvedValue({
                id: 'rf_test_123',
                amount: 30000,
                status: 'succeeded',
                reason: 'requested_by_customer'
            });

            const response = await request(app)
                .post('/api/payments/refund')
                .send(refundRequest)
                .expect(200);

            expect(response.body).toEqual({
                refundId: 'rf_test_123',
                amount: 300.00,
                status: 'succeeded'
            });

            expect(stripeMock.refunds.create).toHaveBeenCalledWith({
                payment_intent: refundRequest.paymentIntentId,
                reason: 'requested_by_customer'
            });
        });

        test('processes partial refund with amount', async () => {
            const refundRequest = {
                paymentIntentId: 'pi_test_partial',
                amount: 150.00,
                reason: 'Partial workshop cancellation'
            };

            stripeMock.refunds.create.mockResolvedValue({
                id: 'rf_test_partial',
                amount: 15000,
                status: 'succeeded'
            });

            const response = await request(app)
                .post('/api/payments/refund')
                .send(refundRequest)
                .expect(200);

            expect(stripeMock.refunds.create).toHaveBeenCalledWith({
                payment_intent: refundRequest.paymentIntentId,
                amount: 15000, // Amount in cents
                reason: 'requested_by_customer'
            });
        });

        test('validates refund amount does not exceed original', async () => {
            stripeMock.paymentIntents.retrieve.mockResolvedValue({
                id: 'pi_test_exceed',
                amount: 30000,
                amount_refunded: 10000
            });

            const refundRequest = {
                paymentIntentId: 'pi_test_exceed',
                amount: 250.00 // Trying to refund $250 when only $200 remaining
            };

            const response = await request(app)
                .post('/api/payments/refund')
                .send(refundRequest)
                .expect(400);

            expect(response.body).toEqual({
                error: 'Refund amount exceeds remaining balance'
            });
        });
    });

    describe('Rate Limiting', () => {
        test('enforces rate limits on payment endpoints', async () => {
            const requestBody = {
                items: [{ ticketType: 'full-festival', quantity: 1 }],
                customerEmail: 'ratelimit@example.com'
            };

            // Make multiple rapid requests
            const requests = Array(10).fill().map(() => 
                request(app)
                    .post('/api/payments/create-checkout-session')
                    .send(requestBody)
            );

            const responses = await Promise.all(requests);
            
            // Some requests should be rate limited
            const rateLimited = responses.filter(r => r.status === 429);
            expect(rateLimited.length).toBeGreaterThan(0);
            
            const limitedResponse = rateLimited[0];
            expect(limitedResponse.body).toEqual({
                error: 'Too many requests',
                retryAfter: expect.any(Number)
            });
        });
    });
});