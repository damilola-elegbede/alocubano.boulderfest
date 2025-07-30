/**
 * Stripe API mock for testing
 * Provides realistic responses without hitting actual Stripe API
 */

const mockStripe = () => {
    const sessions = new Map();
    const paymentIntents = new Map();
    const refunds = new Map();
    const customers = new Map();
    const webhookEvents = new Set();

    return {
        checkout: {
            sessions: {
                create: jest.fn(async (params) => {
                    const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const session = {
                        id: sessionId,
                        object: 'checkout.session',
                        amount_subtotal: calculateSubtotal(params.line_items),
                        amount_total: calculateTotal(params),
                        currency: params.currency || 'usd',
                        customer_email: params.customer_email,
                        expires_at: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
                        livemode: false,
                        metadata: params.metadata || {},
                        mode: params.mode || 'payment',
                        payment_intent: `pi_${sessionId.replace('cs_', '')}`,
                        payment_method_types: params.payment_method_types || ['card'],
                        payment_status: 'unpaid',
                        status: 'open',
                        success_url: params.success_url,
                        cancel_url: params.cancel_url,
                        url: `https://checkout.stripe.com/pay/${sessionId}`,
                        created: Math.floor(Date.now() / 1000),
                    };

                    sessions.set(sessionId, session);
                    
                    // Create associated payment intent
                    const paymentIntent = {
                        id: session.payment_intent,
                        object: 'payment_intent',
                        amount: session.amount_total,
                        currency: session.currency,
                        status: 'requires_payment_method',
                        metadata: session.metadata,
                    };
                    paymentIntents.set(paymentIntent.id, paymentIntent);

                    return session;
                }),

                retrieve: jest.fn(async (sessionId) => {
                    const session = sessions.get(sessionId);
                    if (!session) {
                        throw new Error(`No such checkout session: ${sessionId}`);
                    }
                    return session;
                }),

                expire: jest.fn(async (sessionId) => {
                    const session = sessions.get(sessionId);
                    if (!session) {
                        throw new Error(`No such checkout session: ${sessionId}`);
                    }
                    session.status = 'expired';
                    return session;
                }),

                listLineItems: jest.fn(async (sessionId) => {
                    const session = sessions.get(sessionId);
                    if (!session) {
                        throw new Error(`No such checkout session: ${sessionId}`);
                    }
                    return {
                        object: 'list',
                        data: session.line_items || [],
                        has_more: false,
                    };
                }),
            },
        },

        paymentIntents: {
            retrieve: jest.fn(async (paymentIntentId) => {
                const pi = paymentIntents.get(paymentIntentId);
                if (!pi) {
                    throw new Error(`No such payment intent: ${paymentIntentId}`);
                }
                return pi;
            }),

            update: jest.fn(async (paymentIntentId, params) => {
                const pi = paymentIntents.get(paymentIntentId);
                if (!pi) {
                    throw new Error(`No such payment intent: ${paymentIntentId}`);
                }
                Object.assign(pi, params);
                return pi;
            }),

            confirm: jest.fn(async (paymentIntentId) => {
                const pi = paymentIntents.get(paymentIntentId);
                if (!pi) {
                    throw new Error(`No such payment intent: ${paymentIntentId}`);
                }
                pi.status = 'succeeded';
                return pi;
            }),

            cancel: jest.fn(async (paymentIntentId) => {
                const pi = paymentIntents.get(paymentIntentId);
                if (!pi) {
                    throw new Error(`No such payment intent: ${paymentIntentId}`);
                }
                pi.status = 'canceled';
                return pi;
            }),
        },

        refunds: {
            create: jest.fn(async (params) => {
                const refundId = `rf_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const pi = paymentIntents.get(params.payment_intent);
                
                if (!pi) {
                    throw new Error(`No such payment intent: ${params.payment_intent}`);
                }

                const refund = {
                    id: refundId,
                    object: 'refund',
                    amount: params.amount || pi.amount,
                    currency: pi.currency,
                    payment_intent: params.payment_intent,
                    reason: params.reason || 'requested_by_customer',
                    status: 'succeeded',
                    created: Math.floor(Date.now() / 1000),
                };

                refunds.set(refundId, refund);
                
                // Update payment intent
                pi.amount_refunded = (pi.amount_refunded || 0) + refund.amount;

                return refund;
            }),

            retrieve: jest.fn(async (refundId) => {
                const refund = refunds.get(refundId);
                if (!refund) {
                    throw new Error(`No such refund: ${refundId}`);
                }
                return refund;
            }),
        },

        customers: {
            create: jest.fn(async (params) => {
                const customerId = `cus_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const customer = {
                    id: customerId,
                    object: 'customer',
                    email: params.email,
                    name: params.name,
                    phone: params.phone,
                    address: params.address,
                    metadata: params.metadata || {},
                    created: Math.floor(Date.now() / 1000),
                };

                customers.set(customerId, customer);
                return customer;
            }),

            retrieve: jest.fn(async (customerId) => {
                const customer = customers.get(customerId);
                if (!customer) {
                    throw new Error(`No such customer: ${customerId}`);
                }
                return customer;
            }),
        },

        promotionCodes: {
            list: jest.fn(async (params) => {
                // Mock promo codes for testing
                const promoCodes = {
                    'DANCE2026': {
                        id: 'promo_dance2026',
                        code: 'DANCE2026',
                        coupon: {
                            id: 'coupon_dance2026',
                            percent_off: 15,
                            valid: true,
                        },
                        active: true,
                    },
                    'EARLYBIRD': {
                        id: 'promo_earlybird',
                        code: 'EARLYBIRD',
                        coupon: {
                            id: 'coupon_earlybird',
                            percent_off: 20,
                            valid: true,
                        },
                        active: true,
                    },
                    'GROUP10': {
                        id: 'promo_group10',
                        code: 'GROUP10',
                        coupon: {
                            id: 'coupon_group10',
                            percent_off: 10,
                            valid: true,
                        },
                        active: true,
                    },
                };

                const code = params.code;
                const promoCode = promoCodes[code];

                return {
                    object: 'list',
                    data: promoCode && promoCode.active ? [promoCode] : [],
                    has_more: false,
                };
            }),
        },

        webhooks: {
            constructEvent: jest.fn((payload, signature, secret) => {
                // Simple signature validation mock
                if (!signature || signature === 'invalid_signature') {
                    throw new Error('Invalid signature');
                }

                // Parse payload if it's a string
                const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
                
                // Check for duplicate events
                if (webhookEvents.has(event.id)) {
                    return { ...event, duplicate: true };
                }
                
                webhookEvents.add(event.id);
                return event;
            }),
        },

        // Test card behaviors
        testHelpers: {
            testCards: {
                '4242424242424242': { type: 'success' },
                '4000000000000002': { type: 'decline', error: 'card_declined' },
                '4000000000009995': { type: 'decline', error: 'insufficient_funds' },
                '4000000000000069': { type: 'decline', error: 'expired_card' },
                '4000002500003155': { type: '3ds_required' },
                '4000002760003184': { type: '3ds_optional' },
            },
            
            simulatePayment: (cardNumber) => {
                const card = mockStripe().testHelpers.testCards[cardNumber];
                if (!card) return { type: 'success' };
                return card;
            },
        },
    };
};

// Helper functions
function calculateSubtotal(lineItems) {
    if (!lineItems) return 0;
    return lineItems.reduce((total, item) => {
        const unitAmount = item.price_data?.unit_amount || 0;
        const quantity = item.quantity || 1;
        return total + (unitAmount * quantity);
    }, 0);
}

function calculateTotal(params) {
    let total = calculateSubtotal(params.line_items);
    
    // Apply discounts
    if (params.discounts) {
        params.discounts.forEach(discount => {
            if (discount.coupon) {
                const percentOff = discount.coupon.percent_off || 0;
                total = total * (1 - percentOff / 100);
            }
        });
    }
    
    // Add tax (simplified)
    if (params.automatic_tax?.enabled) {
        total = total * 1.0875; // Colorado tax rate
    }
    
    return Math.round(total);
}

module.exports = { mockStripe };