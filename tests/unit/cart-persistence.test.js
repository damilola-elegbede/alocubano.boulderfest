import { describe, it, expect, beforeEach } from 'vitest';
import {
    CART_TIMEOUT,
    isExpired,
    isNearExpiry,
    getTimeRemaining,
    formatTimeRemaining,
    cleanCartState,
    isValidTicket,
    isValidDonation,
    getExpiredItems,
    startCheckoutSession,
    clearCheckoutSession,
    isCheckoutSessionActive
} from '../../js/lib/pure/cart-persistence.js';

describe('Cart Persistence - Expiration Logic', () => {
    const now = Date.now();

    describe('isExpired', () => {
        it('should return true for items older than 24 hours', () => {
            const oldTimestamp = now - (25 * 60 * 60 * 1000); // 25 hours ago
            expect(isExpired(oldTimestamp)).toBe(true);
        });

        it('should return false for items less than 24 hours old', () => {
            const recentTimestamp = now - (23 * 60 * 60 * 1000); // 23 hours ago
            expect(isExpired(recentTimestamp)).toBe(false);
        });

        it('should return true for invalid timestamps', () => {
            expect(isExpired(null)).toBe(true);
            expect(isExpired(undefined)).toBe(true);
            expect(isExpired('invalid')).toBe(true);
        });
    });

    describe('isNearExpiry', () => {
        it('should return true for items within 2 hours of expiry', () => {
            const nearExpiryTimestamp = now - (22.5 * 60 * 60 * 1000); // 22.5 hours ago
            expect(isNearExpiry(nearExpiryTimestamp)).toBe(true);
        });

        it('should return false for fresh items', () => {
            const freshTimestamp = now - (1 * 60 * 60 * 1000); // 1 hour ago
            expect(isNearExpiry(freshTimestamp)).toBe(false);
        });

        it('should return false for expired items', () => {
            const expiredTimestamp = now - (25 * 60 * 60 * 1000); // 25 hours ago
            expect(isNearExpiry(expiredTimestamp)).toBe(false);
        });
    });

    describe('getTimeRemaining', () => {
        it('should calculate correct time remaining', () => {
            const timestamp = now - (23 * 60 * 60 * 1000); // 23 hours ago
            const remaining = getTimeRemaining(timestamp);
            expect(remaining).toBeGreaterThan(0);
            expect(remaining).toBeLessThanOrEqual(60 * 60 * 1000); // 1 hour or less remaining
        });

        it('should return 0 for expired items', () => {
            const expiredTimestamp = now - (25 * 60 * 60 * 1000);
            expect(getTimeRemaining(expiredTimestamp)).toBe(0);
        });
    });

    describe('formatTimeRemaining', () => {
        it('should format time correctly', () => {
            expect(formatTimeRemaining(25 * 60 * 60 * 1000)).toBe('1 day remaining');
            expect(formatTimeRemaining(2 * 60 * 60 * 1000)).toBe('2 hours remaining');
            expect(formatTimeRemaining(30 * 60 * 1000)).toBe('30 minutes remaining');
            expect(formatTimeRemaining(30 * 1000)).toBe('Less than a minute');
            expect(formatTimeRemaining(0)).toBe('Expired');
        });
    });

    describe('cleanCartState', () => {
        let validCartState;

        beforeEach(() => {
            validCartState = {
                tickets: {
                    'general': {
                        ticketType: 'general',
                        price: 50,
                        name: 'General Admission',
                        quantity: 2,
                        addedAt: now - (1 * 60 * 60 * 1000) // 1 hour ago
                    },
                    'vip': {
                        ticketType: 'vip',
                        price: 100,
                        name: 'VIP Pass',
                        quantity: 1,
                        addedAt: now - (25 * 60 * 60 * 1000) // 25 hours ago (expired)
                    }
                },
                donations: [
                    {
                        id: 'donation_1',
                        amount: 25,
                        name: 'Festival Support',
                        addedAt: now - (1 * 60 * 60 * 1000) // 1 hour ago
                    },
                    {
                        id: 'donation_2',
                        amount: 50,
                        name: 'Festival Support',
                        addedAt: now - (26 * 60 * 60 * 1000) // 26 hours ago (expired)
                    }
                ],
                metadata: {
                    createdAt: now - (2 * 60 * 60 * 1000),
                    updatedAt: now - (1 * 60 * 60 * 1000),
                    sessionId: 'test_session',
                    checkoutStartedAt: null,
                    checkoutSessionId: null
                }
            };
        });

        it('should remove expired tickets', () => {
            const cleaned = cleanCartState(validCartState);
            expect(cleaned.tickets['general']).toBeDefined();
            expect(cleaned.tickets['vip']).toBeUndefined();
        });

        it('should remove expired donations', () => {
            const cleaned = cleanCartState(validCartState);
            expect(cleaned.donations).toHaveLength(1);
            expect(cleaned.donations[0].id).toBe('donation_1');
        });

        it('should clear expired checkout sessions', () => {
            validCartState.metadata.checkoutStartedAt = now - (20 * 60 * 1000); // 20 minutes ago
            validCartState.metadata.checkoutSessionId = 'checkout_123';

            const cleaned = cleanCartState(validCartState);
            expect(cleaned.metadata.checkoutStartedAt).toBeNull();
            expect(cleaned.metadata.checkoutSessionId).toBeNull();
        });

        it('should keep active checkout sessions', () => {
            validCartState.metadata.checkoutStartedAt = now - (5 * 60 * 1000); // 5 minutes ago
            validCartState.metadata.checkoutSessionId = 'checkout_123';

            const cleaned = cleanCartState(validCartState);
            expect(cleaned.metadata.checkoutStartedAt).toBe(validCartState.metadata.checkoutStartedAt);
            expect(cleaned.metadata.checkoutSessionId).toBe('checkout_123');
        });
    });

    describe('Checkout Session Management', () => {
        let cartState;

        beforeEach(() => {
            cartState = {
                tickets: {},
                donations: [],
                metadata: {
                    createdAt: now,
                    updatedAt: now,
                    sessionId: 'test_session',
                    checkoutStartedAt: null,
                    checkoutSessionId: null
                }
            };
        });

        it('should start a checkout session', () => {
            const updatedState = startCheckoutSession(cartState);
            expect(updatedState.metadata.checkoutStartedAt).toBeDefined();
            expect(updatedState.metadata.checkoutSessionId).toBeDefined();
            expect(updatedState.metadata.checkoutSessionId).toContain('checkout_');
        });

        it('should clear a checkout session', () => {
            cartState.metadata.checkoutStartedAt = now;
            cartState.metadata.checkoutSessionId = 'checkout_123';

            const clearedState = clearCheckoutSession(cartState);
            expect(clearedState.metadata.checkoutStartedAt).toBeNull();
            expect(clearedState.metadata.checkoutSessionId).toBeNull();
        });

        it('should detect active checkout sessions', () => {
            cartState.metadata.checkoutStartedAt = now - (5 * 60 * 1000); // 5 minutes ago
            expect(isCheckoutSessionActive(cartState)).toBe(true);

            cartState.metadata.checkoutStartedAt = now - (20 * 60 * 1000); // 20 minutes ago
            expect(isCheckoutSessionActive(cartState)).toBe(false);
        });
    });

    describe('getExpiredItems', () => {
        it('should identify expired tickets and donations', () => {
            const cartState = {
                tickets: {
                    'fresh': {
                        ticketType: 'fresh',
                        addedAt: now - (1 * 60 * 60 * 1000) // 1 hour ago
                    },
                    'expired': {
                        ticketType: 'expired',
                        addedAt: now - (25 * 60 * 60 * 1000) // 25 hours ago
                    }
                },
                donations: [
                    {
                        id: 'fresh_donation',
                        addedAt: now - (1 * 60 * 60 * 1000) // 1 hour ago
                    },
                    {
                        id: 'expired_donation',
                        addedAt: now - (26 * 60 * 60 * 1000) // 26 hours ago
                    }
                ],
                metadata: {
                    createdAt: now - (2 * 60 * 60 * 1000)
                }
            };

            const expired = getExpiredItems(cartState);
            expect(expired.expiredTickets).toHaveLength(1);
            expect(expired.expiredTickets[0].ticketType).toBe('expired');
            expect(expired.expiredDonations).toHaveLength(1);
            expect(expired.expiredDonations[0].id).toBe('expired_donation');
        });
    });
});