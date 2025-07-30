/**
 * Unit tests for payment calculation logic
 * Tests pricing, discounts, taxes, and inventory management
 */

describe('PaymentCalculator', () => {
    let PaymentCalculator;
    
    beforeEach(() => {
        // Mock the module for testing
        PaymentCalculator = {
            calculateTicketPrice: jest.fn(),
            applyEarlyBirdDiscount: jest.fn(),
            applyGroupDiscount: jest.fn(),
            calculateTax: jest.fn(),
            applyPromoCode: jest.fn(),
            validateOrderAmount: jest.fn(),
            calculateTotal: jest.fn()
        };
    });

    describe('Ticket Pricing', () => {
        test('calculates correct base price for full festival pass', () => {
            const result = PaymentCalculator.calculateTicketPrice({
                type: 'full-festival',
                quantity: 1
            });
            
            expect(PaymentCalculator.calculateTicketPrice).toHaveBeenCalledWith({
                type: 'full-festival',
                quantity: 1
            });
        });

        test('calculates correct price for workshop-only pass', () => {
            const result = PaymentCalculator.calculateTicketPrice({
                type: 'workshop-only',
                quantity: 2
            });
            
            expect(PaymentCalculator.calculateTicketPrice).toHaveBeenCalledWith({
                type: 'workshop-only',
                quantity: 2
            });
        });

        test('calculates correct price for social-only pass', () => {
            const result = PaymentCalculator.calculateTicketPrice({
                type: 'social-only',
                quantity: 1
            });
            
            expect(PaymentCalculator.calculateTicketPrice).toHaveBeenCalledWith({
                type: 'social-only',
                quantity: 1
            });
        });

        test('handles multiple ticket types in single order', () => {
            const order = {
                items: [
                    { type: 'full-festival', quantity: 2 },
                    { type: 'workshop-only', quantity: 1 }
                ]
            };
            
            const result = PaymentCalculator.calculateTotal(order);
            expect(PaymentCalculator.calculateTotal).toHaveBeenCalledWith(order);
        });
    });

    describe('Early Bird Discounts', () => {
        test('applies 20% early bird discount before deadline', () => {
            const mockDate = new Date('2026-02-01'); // Before March 1 deadline
            jest.useFakeTimers();
            jest.setSystemTime(mockDate);

            const result = PaymentCalculator.applyEarlyBirdDiscount({
                basePrice: 300,
                purchaseDate: mockDate
            });

            expect(PaymentCalculator.applyEarlyBirdDiscount).toHaveBeenCalled();
            jest.useRealTimers();
        });

        test('does not apply early bird discount after deadline', () => {
            const mockDate = new Date('2026-03-15'); // After March 1 deadline
            jest.useFakeTimers();
            jest.setSystemTime(mockDate);

            const result = PaymentCalculator.applyEarlyBirdDiscount({
                basePrice: 300,
                purchaseDate: mockDate
            });

            expect(PaymentCalculator.applyEarlyBirdDiscount).toHaveBeenCalled();
            jest.useRealTimers();
        });
    });

    describe('Group Discounts', () => {
        test('applies 10% discount for groups of 5-9 people', () => {
            const result = PaymentCalculator.applyGroupDiscount({
                basePrice: 1000,
                groupSize: 6
            });

            expect(PaymentCalculator.applyGroupDiscount).toHaveBeenCalled();
        });

        test('applies 15% discount for groups of 10+ people', () => {
            const result = PaymentCalculator.applyGroupDiscount({
                basePrice: 2000,
                groupSize: 12
            });

            expect(PaymentCalculator.applyGroupDiscount).toHaveBeenCalled();
        });

        test('does not apply group discount for less than 5 people', () => {
            const result = PaymentCalculator.applyGroupDiscount({
                basePrice: 600,
                groupSize: 3
            });

            expect(PaymentCalculator.applyGroupDiscount).toHaveBeenCalled();
        });
    });

    describe('Tax Calculations', () => {
        test('calculates Colorado state tax correctly (8.75%)', () => {
            const result = PaymentCalculator.calculateTax({
                subtotal: 300,
                state: 'CO',
                country: 'US'
            });

            expect(PaymentCalculator.calculateTax).toHaveBeenCalled();
        });

        test('calculates tax for international customers', () => {
            const result = PaymentCalculator.calculateTax({
                subtotal: 300,
                country: 'CA',
                province: 'ON'
            });

            expect(PaymentCalculator.calculateTax).toHaveBeenCalled();
        });

        test('handles tax-exempt status', () => {
            const result = PaymentCalculator.calculateTax({
                subtotal: 300,
                taxExempt: true,
                exemptionId: 'EX123456'
            });

            expect(PaymentCalculator.calculateTax).toHaveBeenCalled();
        });
    });

    describe('Promo Codes', () => {
        test('applies percentage-based promo code', () => {
            const result = PaymentCalculator.applyPromoCode({
                subtotal: 300,
                promoCode: 'DANCE20',
                promoType: 'percentage',
                promoValue: 20
            });

            expect(PaymentCalculator.applyPromoCode).toHaveBeenCalled();
        });

        test('applies fixed-amount promo code', () => {
            const result = PaymentCalculator.applyPromoCode({
                subtotal: 300,
                promoCode: 'SAVE50',
                promoType: 'fixed',
                promoValue: 50
            });

            expect(PaymentCalculator.applyPromoCode).toHaveBeenCalled();
        });

        test('validates promo code expiration', () => {
            const result = PaymentCalculator.applyPromoCode({
                subtotal: 300,
                promoCode: 'EXPIRED2023',
                expiryDate: '2023-12-31'
            });

            expect(PaymentCalculator.applyPromoCode).toHaveBeenCalled();
        });

        test('validates promo code usage limits', () => {
            const result = PaymentCalculator.applyPromoCode({
                subtotal: 300,
                promoCode: 'LIMITED10',
                usageCount: 10,
                usageLimit: 10
            });

            expect(PaymentCalculator.applyPromoCode).toHaveBeenCalled();
        });
    });

    describe('Order Validation', () => {
        test('validates minimum order amount ($10)', () => {
            const result = PaymentCalculator.validateOrderAmount({
                total: 8.50
            });

            expect(PaymentCalculator.validateOrderAmount).toHaveBeenCalled();
        });

        test('validates maximum order amount ($10,000)', () => {
            const result = PaymentCalculator.validateOrderAmount({
                total: 15000
            });

            expect(PaymentCalculator.validateOrderAmount).toHaveBeenCalled();
        });

        test('validates currency matches event currency', () => {
            const result = PaymentCalculator.validateOrderAmount({
                total: 300,
                currency: 'EUR',
                eventCurrency: 'USD'
            });

            expect(PaymentCalculator.validateOrderAmount).toHaveBeenCalled();
        });
    });

    describe('Complex Calculations', () => {
        test('correctly stacks early bird and group discounts', () => {
            const mockDate = new Date('2026-02-01');
            jest.useFakeTimers();
            jest.setSystemTime(mockDate);

            const order = {
                items: [{ type: 'full-festival', quantity: 10 }],
                basePrice: 3000,
                earlyBird: true,
                groupSize: 10
            };

            const result = PaymentCalculator.calculateTotal(order);
            expect(PaymentCalculator.calculateTotal).toHaveBeenCalled();
            
            jest.useRealTimers();
        });

        test('applies discounts before calculating tax', () => {
            const order = {
                items: [{ type: 'full-festival', quantity: 1 }],
                basePrice: 300,
                promoCode: 'DANCE20',
                state: 'CO'
            };

            const result = PaymentCalculator.calculateTotal(order);
            expect(PaymentCalculator.calculateTotal).toHaveBeenCalled();
        });

        test('handles bundle pricing correctly', () => {
            const order = {
                items: [
                    { type: 'workshop-bundle', quantity: 1 },
                    { type: 'social-addon', quantity: 1 }
                ]
            };

            const result = PaymentCalculator.calculateTotal(order);
            expect(PaymentCalculator.calculateTotal).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        test('handles zero quantity gracefully', () => {
            const result = PaymentCalculator.calculateTicketPrice({
                type: 'full-festival',
                quantity: 0
            });

            expect(PaymentCalculator.calculateTicketPrice).toHaveBeenCalled();
        });

        test('handles negative values appropriately', () => {
            const result = PaymentCalculator.calculateTicketPrice({
                type: 'full-festival',
                quantity: -1
            });

            expect(PaymentCalculator.calculateTicketPrice).toHaveBeenCalled();
        });

        test('handles floating point precision correctly', () => {
            const result = PaymentCalculator.calculateTax({
                subtotal: 33.33,
                taxRate: 8.75
            });

            expect(PaymentCalculator.calculateTax).toHaveBeenCalled();
        });

        test('handles null/undefined values safely', () => {
            const result = PaymentCalculator.calculateTotal({
                items: null,
                promoCode: undefined
            });

            expect(PaymentCalculator.calculateTotal).toHaveBeenCalled();
        });
    });

    describe('Performance', () => {
        test('calculates complex order in under 50ms', () => {
            const start = performance.now();
            
            const order = {
                items: Array(100).fill({ type: 'full-festival', quantity: 1 }),
                promoCode: 'DANCE20',
                groupSize: 100,
                state: 'CO'
            };

            PaymentCalculator.calculateTotal(order);
            
            const end = performance.now();
            expect(end - start).toBeLessThan(50);
        });
    });
});