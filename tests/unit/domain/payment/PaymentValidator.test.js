import { describe, it, expect } from 'vitest';
import { PaymentValidator } from '../../../../lib/domain/payment/PaymentValidator.js';

describe('PaymentValidator Domain Service', () => {
  describe('validateCartItems()', () => {
    it('validates valid cart items', () => {
      const cartItems = [
        { name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket' },
        { name: 'Donation', price: 25.00, quantity: 2, type: 'donation' }
      ];
      
      const result = PaymentValidator.validateCartItems(cartItems);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing cart items', () => {
      const result = PaymentValidator.validateCartItems(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart items are required');
    });

    it('rejects non-array cart items', () => {
      const result = PaymentValidator.validateCartItems('invalid');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart items must be an array');
    });

    it('rejects empty cart', () => {
      const result = PaymentValidator.validateCartItems([]);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cart cannot be empty');
    });

    it('rejects cart with too many items', () => {
      const cartItems = Array(51).fill().map((_, i) => ({
        name: `Item ${i}`,
        price: 10,
        quantity: 1,
        type: 'ticket'
      }));
      
      const result = PaymentValidator.validateCartItems(cartItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Too many items in cart (maximum 50)');
    });

    it('accumulates errors from multiple invalid items', () => {
      const cartItems = [
        { name: '', price: 125.00, quantity: 1, type: 'ticket' },
        { name: 'Valid', price: -10, quantity: 0, type: 'invalid' }
      ];
      
      const result = PaymentValidator.validateCartItems(cartItems);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(3);
    });
  });

  describe('validateCartItem()', () => {
    it('validates valid cart item', () => {
      const item = {
        name: 'Weekend Pass',
        price: 125.00,
        quantity: 2,
        type: 'ticket',
        description: 'Full weekend access'
      };
      
      const errors = PaymentValidator.validateCartItem(item);
      expect(errors).toHaveLength(0);
    });

    it('validates item with null input', () => {
      const errors = PaymentValidator.validateCartItem(null);
      expect(errors).toContain('Item 1: Must be an object');
    });

    it('validates item name requirements', () => {
      let errors = PaymentValidator.validateCartItem({ price: 10, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Name is required');

      errors = PaymentValidator.validateCartItem({ name: 123, price: 10, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Name must be a string');

      errors = PaymentValidator.validateCartItem({ name: '   ', price: 10, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Name cannot be empty');

      const longName = 'a'.repeat(201);
      errors = PaymentValidator.validateCartItem({ name: longName, price: 10, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Name too long (maximum 200 characters)');
    });

    it('validates price requirements', () => {
      let errors = PaymentValidator.validateCartItem({ name: 'Test', quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Price is required');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: 'invalid', quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Price must be a number');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: NaN, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Price must be a valid number');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: -10, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Price cannot be negative');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: 10001, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Price too high (maximum $10,000)');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: Infinity, quantity: 1, type: 'ticket' });
      expect(errors).toContain('Item 1: Price must be finite');
    });

    it('validates quantity requirements', () => {
      let errors = PaymentValidator.validateCartItem({ name: 'Test', price: 10, type: 'ticket' });
      expect(errors).toContain('Item 1: Quantity is required');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: 10, quantity: 1.5, type: 'ticket' });
      expect(errors).toContain('Item 1: Quantity must be an integer');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: 10, quantity: 0, type: 'ticket' });
      expect(errors).toContain('Item 1: Quantity must be greater than zero');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: 10, quantity: 101, type: 'ticket' });
      expect(errors).toContain('Item 1: Quantity too high (maximum 100)');
    });

    it('validates type requirements', () => {
      let errors = PaymentValidator.validateCartItem({ name: 'Test', price: 10, quantity: 1 });
      expect(errors).toContain('Item 1: Type is required');

      errors = PaymentValidator.validateCartItem({ name: 'Test', price: 10, quantity: 1, type: 'invalid' });
      expect(errors).toContain('Item 1: Type must be one of: ticket, donation, merchandise');
    });

    it('validates ticket-specific fields', () => {
      let errors = PaymentValidator.validateCartItem({
        name: 'Test',
        price: 10,
        quantity: 1,
        type: 'ticket',
        ticketType: 123
      });
      expect(errors).toContain('Item 1: Ticket type must be a string');

      errors = PaymentValidator.validateCartItem({
        name: 'Test',
        price: 10,
        quantity: 1,
        type: 'ticket',
        eventDate: 'invalid-date'
      });
      expect(errors).toContain('Item 1: Invalid event date format');
    });

    it('validates donation-specific fields', () => {
      const errors = PaymentValidator.validateCartItem({
        name: 'Test',
        price: 10,
        quantity: 1,
        type: 'donation',
        category: 123
      });
      expect(errors).toContain('Item 1: Donation category must be a string');
    });

    it('validates optional description', () => {
      let errors = PaymentValidator.validateCartItem({
        name: 'Test',
        price: 10,
        quantity: 1,
        type: 'ticket',
        description: 123
      });
      expect(errors).toContain('Item 1: Description must be a string');

      const longDescription = 'a'.repeat(501);
      errors = PaymentValidator.validateCartItem({
        name: 'Test',
        price: 10,
        quantity: 1,
        type: 'ticket',
        description: longDescription
      });
      expect(errors).toContain('Item 1: Description too long (maximum 500 characters)');
    });
  });

  describe('validateCustomerInfo()', () => {
    it('allows missing customer info', () => {
      const result = PaymentValidator.validateCustomerInfo(null);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates valid customer info', () => {
      const customerInfo = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-123-4567'
      };
      
      const result = PaymentValidator.validateCustomerInfo(customerInfo);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object customer info', () => {
      const result = PaymentValidator.validateCustomerInfo('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Customer info must be an object');
    });

    it('validates individual fields when provided', () => {
      const result = PaymentValidator.validateCustomerInfo({
        email: 'invalid-email',
        firstName: 'A',
        lastName: '',
        phone: '123'
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });
  });

  describe('validateEmail()', () => {
    it('validates correct email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com'
      ];
      
      validEmails.forEach(email => {
        const errors = PaymentValidator.validateEmail(email);
        expect(errors).toHaveLength(0);
      });
    });

    it('rejects missing email', () => {
      const errors = PaymentValidator.validateEmail('');
      expect(errors).toContain('Email is required');
    });

    it('rejects invalid email formats', () => {
      const invalidEmails = [
        'invalid',
        'test@',
        '@domain.com',
        'test..user@domain.com',
        '.test@domain.com',
        'test@domain.com.'
      ];
      
      invalidEmails.forEach(email => {
        const errors = PaymentValidator.validateEmail(email);
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('rejects email that is too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const errors = PaymentValidator.validateEmail(longEmail);
      expect(errors).toContain('Email too long (maximum 254 characters)');
    });

    it('rejects non-string emails', () => {
      const errors = PaymentValidator.validateEmail(123);
      expect(errors).toContain('Email must be a string');
    });
  });

  describe('validateName()', () => {
    it('validates correct names', () => {
      const validNames = [
        'John',
        'Mary-Jane',
        "O'Connor",
        'José Luis',
        'Van Der Berg'
      ];
      
      validNames.forEach(name => {
        const errors = PaymentValidator.validateName(name);
        expect(errors).toHaveLength(0);
      });
    });

    it('rejects names that are too short', () => {
      const errors = PaymentValidator.validateName('A');
      expect(errors).toContain('Name must be at least 2 characters');
    });

    it('rejects names that are too long', () => {
      const longName = 'a'.repeat(51);
      const errors = PaymentValidator.validateName(longName);
      expect(errors).toContain('Name too long (maximum 50 characters)');
    });

    it('rejects names with invalid characters', () => {
      const invalidNames = [
        'John123',
        'Mary@Jane',
        'Test User!',
        'User<script>'
      ];
      
      invalidNames.forEach(name => {
        const errors = PaymentValidator.validateName(name);
        expect(errors).toContain('Name can only contain letters, spaces, hyphens, and apostrophes');
      });
    });

    it('uses custom field names in error messages', () => {
      const errors = PaymentValidator.validateName('A', 'Last name');
      expect(errors).toContain('Last name must be at least 2 characters');
    });
  });

  describe('validateAmount()', () => {
    it('validates positive amounts', () => {
      const result = PaymentValidator.validateAmount(125.50);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('allows zero amount', () => {
      const result = PaymentValidator.validateAmount(0);
      expect(result.valid).toBe(true);
    });

    it('rejects missing amount', () => {
      const result = PaymentValidator.validateAmount();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount is required');
    });

    it('rejects non-numeric amounts', () => {
      const result = PaymentValidator.validateAmount('100');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount must be a number');
    });

    it('rejects negative amounts', () => {
      const result = PaymentValidator.validateAmount(-10);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount cannot be negative');
    });

    it('rejects amounts that are too high', () => {
      const result = PaymentValidator.validateAmount(1000001);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount too high (maximum $1,000,000)');
    });

    it('rejects infinite amounts', () => {
      const result = PaymentValidator.validateAmount(Infinity);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount must be finite');
    });

    it('uses custom field names', () => {
      const result = PaymentValidator.validateAmount(-10, 'Price');
      expect(result.errors).toContain('Price cannot be negative');
    });
  });

  describe('validateQuantity()', () => {
    it('validates positive quantities', () => {
      const result = PaymentValidator.validateQuantity(5);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing quantity', () => {
      const result = PaymentValidator.validateQuantity();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity is required');
    });

    it('rejects non-integer quantities', () => {
      const result = PaymentValidator.validateQuantity(2.5);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity must be an integer');
    });

    it('rejects zero and negative quantities', () => {
      const result1 = PaymentValidator.validateQuantity(0);
      const result2 = PaymentValidator.validateQuantity(-1);
      
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
      expect(result1.errors).toContain('Quantity must be greater than zero');
    });

    it('rejects quantities that are too high', () => {
      const result = PaymentValidator.validateQuantity(101);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity too high (maximum 100)');
    });
  });

  describe('validatePaymentRequest()', () => {
    it('validates complete valid payment request', () => {
      const paymentRequest = {
        cartItems: [
          { name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket' }
        ],
        customerInfo: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe'
        }
      };
      
      const result = PaymentValidator.validatePaymentRequest(paymentRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object payment request', () => {
      const result = PaymentValidator.validatePaymentRequest('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Payment request must be an object');
    });

    it('validates cart items and customer info separately', () => {
      const paymentRequest = {
        cartItems: [],
        customerInfo: {
          email: 'invalid-email'
        }
      };
      
      const result = PaymentValidator.validatePaymentRequest(paymentRequest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Cart'))).toBe(true);
      expect(result.errors.some(error => error.includes('email'))).toBe(true);
    });

    it('allows missing customer info', () => {
      const paymentRequest = {
        cartItems: [
          { name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket' }
        ]
      };
      
      const result = PaymentValidator.validatePaymentRequest(paymentRequest);
      expect(result.valid).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('validates dates correctly', () => {
      expect(PaymentValidator.isValidDate('2026-05-15')).toBe(true);
      expect(PaymentValidator.isValidDate('2026-05-15T10:00:00Z')).toBe(true);
      expect(PaymentValidator.isValidDate('invalid-date')).toBe(false);
      expect(PaymentValidator.isValidDate(123)).toBe(false);
    });

    it('sanitizes strings correctly', () => {
      expect(PaymentValidator.sanitizeString('  test  ', 10)).toBe('test');
      expect(PaymentValidator.sanitizeString('very long string', 5)).toBe('very ');
      expect(PaymentValidator.sanitizeString(123)).toBe('');
    });
  });
});