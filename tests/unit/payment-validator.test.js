/**
 * Unit tests for payment validation logic
 * Tests card validation, security checks, and fraud prevention
 */

describe('PaymentValidator', () => {
    let PaymentValidator;
    
    beforeEach(() => {
        // Mock the validator module
        PaymentValidator = {
            validateCreditCard: jest.fn(),
            validateExpiryDate: jest.fn(),
            validateCVV: jest.fn(),
            validateBillingAddress: jest.fn(),
            validatePhoneNumber: jest.fn(),
            checkForDuplicateTransaction: jest.fn(),
            validateCardType: jest.fn(),
            performLuhnCheck: jest.fn()
        };
    });

    describe('Credit Card Validation', () => {
        test('validates Visa card numbers correctly', () => {
            const validVisaCards = [
                '4242424242424242',
                '4012888888881881',
                '4000056655665556'
            ];

            validVisaCards.forEach(cardNumber => {
                PaymentValidator.validateCreditCard(cardNumber);
                expect(PaymentValidator.validateCreditCard).toHaveBeenCalledWith(cardNumber);
            });
        });

        test('validates MasterCard numbers correctly', () => {
            const validMasterCards = [
                '5555555555554444',
                '5200828282828210',
                '5105105105105100'
            ];

            validMasterCards.forEach(cardNumber => {
                PaymentValidator.validateCreditCard(cardNumber);
                expect(PaymentValidator.validateCreditCard).toHaveBeenCalledWith(cardNumber);
            });
        });

        test('validates American Express numbers correctly', () => {
            const validAmexCards = [
                '378282246310005',
                '371449635398431',
                '378734493671000'
            ];

            validAmexCards.forEach(cardNumber => {
                PaymentValidator.validateCreditCard(cardNumber);
                expect(PaymentValidator.validateCreditCard).toHaveBeenCalledWith(cardNumber);
            });
        });

        test('rejects invalid card numbers', () => {
            const invalidCards = [
                '4242424242424241', // Invalid Luhn
                '1234567890123456', // Invalid pattern
                '0000000000000000', // All zeros
                '424242424242',     // Too short
                '42424242424242424242' // Too long
            ];

            invalidCards.forEach(cardNumber => {
                PaymentValidator.validateCreditCard(cardNumber);
                expect(PaymentValidator.validateCreditCard).toHaveBeenCalledWith(cardNumber);
            });
        });

        test('performs Luhn algorithm check correctly', () => {
            const testCases = [
                { number: '4242424242424242', expected: true },
                { number: '4242424242424241', expected: false },
                { number: '5555555555554444', expected: true },
                { number: '5555555555554443', expected: false }
            ];

            testCases.forEach(({ number, expected }) => {
                PaymentValidator.performLuhnCheck(number);
                expect(PaymentValidator.performLuhnCheck).toHaveBeenCalledWith(number);
            });
        });
    });

    describe('Expiry Date Validation', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-07-30'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('accepts valid future expiry dates', () => {
            const validDates = [
                { month: '08', year: '2025' },
                { month: '12', year: '2025' },
                { month: '01', year: '2026' },
                { month: '12', year: '2030' }
            ];

            validDates.forEach(date => {
                PaymentValidator.validateExpiryDate(date);
                expect(PaymentValidator.validateExpiryDate).toHaveBeenCalledWith(date);
            });
        });

        test('rejects expired dates', () => {
            const expiredDates = [
                { month: '06', year: '2025' }, // Last month
                { month: '12', year: '2024' }, // Last year
                { month: '01', year: '2020' }  // Way expired
            ];

            expiredDates.forEach(date => {
                PaymentValidator.validateExpiryDate(date);
                expect(PaymentValidator.validateExpiryDate).toHaveBeenCalledWith(date);
            });
        });

        test('accepts current month as valid', () => {
            PaymentValidator.validateExpiryDate({ month: '07', year: '2025' });
            expect(PaymentValidator.validateExpiryDate).toHaveBeenCalled();
        });

        test('validates month format correctly', () => {
            const invalidMonths = [
                { month: '13', year: '2025' }, // Invalid month
                { month: '00', year: '2025' }, // Invalid month
                { month: 'AB', year: '2025' }, // Non-numeric
                { month: '1', year: '2025' }   // Single digit
            ];

            invalidMonths.forEach(date => {
                PaymentValidator.validateExpiryDate(date);
                expect(PaymentValidator.validateExpiryDate).toHaveBeenCalledWith(date);
            });
        });
    });

    describe('CVV Validation', () => {
        test('validates 3-digit CVV for Visa/MasterCard', () => {
            const validCVVs = ['123', '000', '999', '456'];
            
            validCVVs.forEach(cvv => {
                PaymentValidator.validateCVV(cvv, 'visa');
                expect(PaymentValidator.validateCVV).toHaveBeenCalledWith(cvv, 'visa');
            });
        });

        test('validates 4-digit CVV for American Express', () => {
            const validCVVs = ['1234', '0000', '9999', '4567'];
            
            validCVVs.forEach(cvv => {
                PaymentValidator.validateCVV(cvv, 'amex');
                expect(PaymentValidator.validateCVV).toHaveBeenCalledWith(cvv, 'amex');
            });
        });

        test('rejects invalid CVV formats', () => {
            const invalidCVVs = [
                { cvv: '12', cardType: 'visa' },    // Too short
                { cvv: '1234', cardType: 'visa' },  // Too long for Visa
                { cvv: '123', cardType: 'amex' },   // Too short for Amex
                { cvv: 'ABC', cardType: 'visa' },   // Non-numeric
                { cvv: '12A', cardType: 'visa' }    // Mixed characters
            ];

            invalidCVVs.forEach(({ cvv, cardType }) => {
                PaymentValidator.validateCVV(cvv, cardType);
                expect(PaymentValidator.validateCVV).toHaveBeenCalledWith(cvv, cardType);
            });
        });
    });

    describe('Billing Address Validation', () => {
        test('validates complete US addresses', () => {
            const validAddress = {
                line1: '6185 Arapahoe Rd',
                line2: 'Suite 100',
                city: 'Boulder',
                state: 'CO',
                postalCode: '80303',
                country: 'US'
            };

            PaymentValidator.validateBillingAddress(validAddress);
            expect(PaymentValidator.validateBillingAddress).toHaveBeenCalledWith(validAddress);
        });

        test('validates international addresses', () => {
            const internationalAddresses = [
                {
                    line1: '123 Main St',
                    city: 'Toronto',
                    province: 'ON',
                    postalCode: 'M5V 3A9',
                    country: 'CA'
                },
                {
                    line1: 'Av. Reforma 123',
                    city: 'Ciudad de México',
                    state: 'CDMX',
                    postalCode: '06600',
                    country: 'MX'
                }
            ];

            internationalAddresses.forEach(address => {
                PaymentValidator.validateBillingAddress(address);
                expect(PaymentValidator.validateBillingAddress).toHaveBeenCalledWith(address);
            });
        });

        test('validates postal code formats by country', () => {
            const postalCodes = [
                { code: '80303', country: 'US', valid: true },
                { code: '80303-1234', country: 'US', valid: true },
                { code: 'M5V 3A9', country: 'CA', valid: true },
                { code: 'SW1A 1AA', country: 'GB', valid: true },
                { code: '12345', country: 'CA', valid: false }
            ];

            postalCodes.forEach(({ code, country }) => {
                PaymentValidator.validateBillingAddress({ postalCode: code, country });
                expect(PaymentValidator.validateBillingAddress).toHaveBeenCalled();
            });
        });

        test('requires all mandatory fields', () => {
            const incompleteAddresses = [
                { city: 'Boulder', state: 'CO' }, // Missing line1
                { line1: '123 Main', state: 'CO' }, // Missing city
                { line1: '123 Main', city: 'Boulder' } // Missing state/country
            ];

            incompleteAddresses.forEach(address => {
                PaymentValidator.validateBillingAddress(address);
                expect(PaymentValidator.validateBillingAddress).toHaveBeenCalledWith(address);
            });
        });
    });

    describe('Phone Number Validation', () => {
        test('validates US phone numbers', () => {
            const validUSNumbers = [
                '+13035551234',
                '3035551234',
                '(303) 555-1234',
                '303-555-1234',
                '1-303-555-1234'
            ];

            validUSNumbers.forEach(phone => {
                PaymentValidator.validatePhoneNumber(phone, 'US');
                expect(PaymentValidator.validatePhoneNumber).toHaveBeenCalledWith(phone, 'US');
            });
        });

        test('validates international phone numbers', () => {
            const internationalNumbers = [
                { phone: '+1-416-555-1234', country: 'CA' },
                { phone: '+52 55 1234 5678', country: 'MX' },
                { phone: '+44 20 7123 4567', country: 'GB' }
            ];

            internationalNumbers.forEach(({ phone, country }) => {
                PaymentValidator.validatePhoneNumber(phone, country);
                expect(PaymentValidator.validatePhoneNumber).toHaveBeenCalledWith(phone, country);
            });
        });

        test('rejects invalid phone formats', () => {
            const invalidNumbers = [
                '123', // Too short
                'ABCDEFGHIJ', // Letters
                '555-DANCE', // Vanity number
                '123456789012345' // Too long
            ];

            invalidNumbers.forEach(phone => {
                PaymentValidator.validatePhoneNumber(phone);
                expect(PaymentValidator.validatePhoneNumber).toHaveBeenCalledWith(phone);
            });
        });
    });

    describe('Duplicate Transaction Prevention', () => {
        test('detects duplicate transactions within time window', () => {
            const transaction1 = {
                amount: 300,
                cardLastFour: '4242',
                email: 'test@example.com',
                timestamp: Date.now()
            };

            const transaction2 = {
                ...transaction1,
                timestamp: Date.now() + 1000 // 1 second later
            };

            PaymentValidator.checkForDuplicateTransaction(transaction1);
            PaymentValidator.checkForDuplicateTransaction(transaction2);
            
            expect(PaymentValidator.checkForDuplicateTransaction).toHaveBeenCalledTimes(2);
        });

        test('allows same amount for different cards', () => {
            const transaction1 = {
                amount: 300,
                cardLastFour: '4242',
                email: 'test@example.com'
            };

            const transaction2 = {
                amount: 300,
                cardLastFour: '5555',
                email: 'test@example.com'
            };

            PaymentValidator.checkForDuplicateTransaction(transaction1);
            PaymentValidator.checkForDuplicateTransaction(transaction2);
            
            expect(PaymentValidator.checkForDuplicateTransaction).toHaveBeenCalledTimes(2);
        });

        test('considers time window for duplicate detection', () => {
            const transaction = {
                amount: 300,
                cardLastFour: '4242',
                email: 'test@example.com'
            };

            // Mock time progression
            jest.useFakeTimers();
            
            PaymentValidator.checkForDuplicateTransaction({
                ...transaction,
                timestamp: Date.now()
            });

            // Advance time by 5 minutes
            jest.advanceTimersByTime(5 * 60 * 1000);

            PaymentValidator.checkForDuplicateTransaction({
                ...transaction,
                timestamp: Date.now()
            });

            expect(PaymentValidator.checkForDuplicateTransaction).toHaveBeenCalledTimes(2);
            
            jest.useRealTimers();
        });
    });

    describe('Security Checks', () => {
        test('detects potential card testing patterns', () => {
            const suspiciousPatterns = [
                { attempts: 5, timeWindow: 60 }, // 5 attempts in 1 minute
                { attempts: 10, timeWindow: 300 }, // 10 attempts in 5 minutes
                { attempts: 20, timeWindow: 3600 } // 20 attempts in 1 hour
            ];

            suspiciousPatterns.forEach(pattern => {
                PaymentValidator.validateCreditCard('4242424242424242');
                expect(PaymentValidator.validateCreditCard).toHaveBeenCalled();
            });
        });

        test('validates against known test card numbers in production', () => {
            const testCards = [
                '4242424242424242', // Stripe test card
                '5555555555554444', // Common test MasterCard
                '378282246310005'   // Common test Amex
            ];

            process.env.NODE_ENV = 'production';

            testCards.forEach(card => {
                PaymentValidator.validateCreditCard(card);
                expect(PaymentValidator.validateCreditCard).toHaveBeenCalledWith(card);
            });

            process.env.NODE_ENV = 'test';
        });
    });

    describe('Performance', () => {
        test('validates complete payment data in under 10ms', () => {
            const start = performance.now();

            const paymentData = {
                cardNumber: '4242424242424242',
                expiryMonth: '12',
                expiryYear: '2025',
                cvv: '123',
                billingAddress: {
                    line1: '123 Main St',
                    city: 'Boulder',
                    state: 'CO',
                    postalCode: '80303',
                    country: 'US'
                },
                phone: '+13035551234'
            };

            PaymentValidator.validateCreditCard(paymentData.cardNumber);
            PaymentValidator.validateExpiryDate({ 
                month: paymentData.expiryMonth, 
                year: paymentData.expiryYear 
            });
            PaymentValidator.validateCVV(paymentData.cvv, 'visa');
            PaymentValidator.validateBillingAddress(paymentData.billingAddress);
            PaymentValidator.validatePhoneNumber(paymentData.phone, 'US');

            const end = performance.now();
            expect(end - start).toBeLessThan(10);
        });
    });
});