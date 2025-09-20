import { describe, it, expect } from 'vitest';
import { StripeOrderMapper } from '../../../../lib/domain/payment/StripeOrderMapper.js';

describe('StripeOrderMapper Domain Service', () => {
  describe('mapCartItemToStripeLineItem()', () => {
    it('maps basic cart item to Stripe line item', () => {
      const item = {
        name: 'Weekend Pass',
        price: 125.00,
        quantity: 2,
        type: 'ticket'
      };

      const result = StripeOrderMapper.mapCartItemToStripeLineItem(item);

      expect(result).toEqual({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Weekend Pass',
            description: 'A Lo Cubano Boulder Fest - Weekend Pass',
            metadata: {
              type: 'ticket',
              ticket_type: 'general',
              event_date: '2026-05-15'
            }
          },
          unit_amount: 12500 // $125.00 in cents
        },
        quantity: 2
      });
    });

    it('maps ticket with custom description and metadata', () => {
      const item = {
        name: 'VIP Pass',
        price: 200.00,
        quantity: 1,
        type: 'ticket',
        description: 'VIP Experience Package',
        ticketType: 'vip',
        eventDate: '2026-05-16',
        eventTime: '19:00',
        venue: 'Avalon Ballroom'
      };

      const result = StripeOrderMapper.mapCartItemToStripeLineItem(item);

      expect(result.price_data.product_data.description).toBe('VIP Experience Package');
      expect(result.price_data.product_data.metadata).toEqual({
        type: 'ticket',
        ticket_type: 'vip',
        event_date: '2026-05-16',
        event_time: '19:00',
        venue: 'Avalon Ballroom'
      });
    });

    it('maps donation item correctly', () => {
      const item = {
        name: 'Artist Support Fund',
        price: 50.00,
        quantity: 1,
        type: 'donation',
        category: 'artists',
        purpose: 'Support local artists',
        taxDeductible: true
      };

      const result = StripeOrderMapper.mapCartItemToStripeLineItem(item);

      expect(result.price_data.product_data.metadata).toEqual({
        type: 'donation',
        donation_category: 'artists',
        purpose: 'Support local artists',
        tax_deductible: 'true'
      });
    });

    it('maps merchandise item correctly', () => {
      const item = {
        name: 'Festival T-Shirt',
        price: 25.00,
        quantity: 2,
        type: 'merchandise',
        size: 'M',
        color: 'Blue',
        sku: 'TSHIRT-M-BLUE'
      };

      const result = StripeOrderMapper.mapCartItemToStripeLineItem(item);

      expect(result.price_data.product_data.metadata).toEqual({
        type: 'merchandise',
        size: 'M',
        color: 'Blue',
        sku: 'TSHIRT-M-BLUE'
      });
    });

    it('includes custom attributes in metadata', () => {
      const item = {
        name: 'Test Item',
        price: 10.00,
        quantity: 1,
        type: 'ticket',
        attributes: {
          customField1: 'value1',
          customField2: 123,
          invalidField: { nested: 'object' } // Should be ignored
        }
      };

      const result = StripeOrderMapper.mapCartItemToStripeLineItem(item);

      expect(result.price_data.product_data.metadata).toEqual({
        type: 'ticket',
        ticket_type: 'general',
        event_date: '2026-05-15',
        custom_customField1: 'value1',
        custom_customField2: '123'
      });
    });

    it('throws error for invalid item', () => {
      expect(() => {
        StripeOrderMapper.mapCartItemToStripeLineItem(null);
      }).toThrow('Item must be an object');

      expect(() => {
        StripeOrderMapper.mapCartItemToStripeLineItem({});
      }).toThrow('Item must have name, price, and quantity');

      expect(() => {
        StripeOrderMapper.mapCartItemToStripeLineItem({
          name: 'Test',
          price: 10,
          quantity: 0
        });
      }).toThrow('Item quantity must be greater than zero');

      expect(() => {
        StripeOrderMapper.mapCartItemToStripeLineItem({
          name: 'Test',
          price: -10,
          quantity: 1
        });
      }).toThrow('Item price cannot be negative');
    });

    it('handles decimal prices correctly', () => {
      const item = {
        name: 'Test Item',
        price: 12.99,
        quantity: 1,
        type: 'ticket'
      };

      const result = StripeOrderMapper.mapCartItemToStripeLineItem(item);
      expect(result.price_data.unit_amount).toBe(1299);
    });

    it('handles zero price items', () => {
      const item = {
        name: 'Free Item',
        price: 0,
        quantity: 1,
        type: 'ticket'
      };

      expect(() => {
        StripeOrderMapper.mapCartItemToStripeLineItem(item);
      }).toThrow('Item price must be greater than zero');
    });
  });

  describe('mapCartItemsToStripeLineItems()', () => {
    it('maps multiple cart items', () => {
      const cartItems = [
        { name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket' },
        { name: 'Donation', price: 25.00, quantity: 1, type: 'donation' }
      ];

      const result = StripeOrderMapper.mapCartItemsToStripeLineItems(cartItems);

      expect(result).toHaveLength(2);
      expect(result[0].price_data.product_data.name).toBe('Weekend Pass');
      expect(result[1].price_data.product_data.name).toBe('Donation');
    });

    it('throws error for non-array input', () => {
      expect(() => {
        StripeOrderMapper.mapCartItemsToStripeLineItems('invalid');
      }).toThrow('Cart items must be an array');
    });

    it('provides context for item mapping errors', () => {
      const cartItems = [
        { name: 'Valid Item', price: 10, quantity: 1, type: 'ticket' },
        { name: 'Invalid Item', price: -10, quantity: 1, type: 'ticket' }
      ];

      expect(() => {
        StripeOrderMapper.mapCartItemsToStripeLineItems(cartItems);
      }).toThrow('Error mapping item 2: Item price cannot be negative');
    });
  });

  describe('buildItemMetadata()', () => {
    it('builds metadata for unknown type', () => {
      const item = { type: 'unknown' };
      const result = StripeOrderMapper.buildItemMetadata(item);
      expect(result).toEqual({ type: 'unknown' });
    });

    it('builds complete ticket metadata', () => {
      const item = {
        type: 'ticket',
        ticketType: 'vip',
        eventDate: '2026-05-16',
        eventTime: '20:00',
        venue: 'Main Stage'
      };

      const result = StripeOrderMapper.buildItemMetadata(item);
      expect(result).toEqual({
        type: 'ticket',
        ticket_type: 'vip',
        event_date: '2026-05-16',
        event_time: '20:00',
        venue: 'Main Stage'
      });
    });

    it('builds complete donation metadata', () => {
      const item = {
        type: 'donation',
        category: 'artists',
        purpose: 'Support musicians',
        taxDeductible: false
      };

      const result = StripeOrderMapper.buildItemMetadata(item);
      expect(result).toEqual({
        type: 'donation',
        donation_category: 'artists',
        purpose: 'Support musicians',
        tax_deductible: 'false'
      });
    });

    it('builds complete merchandise metadata', () => {
      const item = {
        type: 'merchandise',
        size: 'L',
        color: 'Red',
        sku: 'SHIRT-L-RED'
      };

      const result = StripeOrderMapper.buildItemMetadata(item);
      expect(result).toEqual({
        type: 'merchandise',
        size: 'L',
        color: 'Red',
        sku: 'SHIRT-L-RED'
      });
    });
  });

  describe('mapCustomerInfoToStripeOptions()', () => {
    it('returns empty options for missing customer info', () => {
      const result = StripeOrderMapper.mapCustomerInfoToStripeOptions(null);
      expect(result).toEqual({});
    });

    it('maps email to customer_email', () => {
      const customerInfo = { email: 'test@example.com' };
      const result = StripeOrderMapper.mapCustomerInfoToStripeOptions(customerInfo);

      expect(result.customer_email).toBe('test@example.com');
    });

    it('maps name fields to metadata', () => {
      const customerInfo = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-123-4567'
      };

      const result = StripeOrderMapper.mapCustomerInfoToStripeOptions(customerInfo);

      expect(result.customer_email).toBe('test@example.com');
      expect(result.customer_creation).toBe('if_required');
      expect(result.metadata).toEqual({
        customer_first_name: 'John',
        customer_last_name: 'Doe',
        customer_phone: '555-123-4567'
      });
    });

    it('handles partial customer info', () => {
      const customerInfo = {
        firstName: 'John'
      };

      const result = StripeOrderMapper.mapCustomerInfoToStripeOptions(customerInfo);

      expect(result.customer_creation).toBe('if_required');
      expect(result.metadata).toEqual({
        customer_first_name: 'John'
      });
    });
  });

  describe('buildSessionMetadata()', () => {
    it('builds complete session metadata', () => {
      const orderData = {
        orderId: 'order_123',
        orderType: 'tickets',
        customerInfo: {
          firstName: 'John',
          lastName: 'Doe'
        },
        environment: 'development',
        source: 'web'
      };

      const result = StripeOrderMapper.buildSessionMetadata(orderData);

      expect(result.orderId).toBe('order_123');
      expect(result.orderType).toBe('tickets');
      expect(result.customerName).toBe('John Doe');
      expect(result.environment).toBe('development');
      expect(result.source).toBe('web');
      expect(result.created_at).toBeDefined();
    });

    it('handles minimal order data', () => {
      const orderData = {
        orderId: 'order_456'
      };

      const result = StripeOrderMapper.buildSessionMetadata(orderData);

      expect(result.orderId).toBe('order_456');
      expect(result.created_at).toBeDefined();
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe('buildCustomerName()', () => {
    it('builds full name from first and last', () => {
      const customerInfo = { firstName: 'John', lastName: 'Doe' };
      const result = StripeOrderMapper.buildCustomerName(customerInfo);
      expect(result).toBe('John Doe');
    });

    it('handles first name only', () => {
      const customerInfo = { firstName: 'John' };
      const result = StripeOrderMapper.buildCustomerName(customerInfo);
      expect(result).toBe('John');
    });

    it('handles last name only', () => {
      const customerInfo = { lastName: 'Doe' };
      const result = StripeOrderMapper.buildCustomerName(customerInfo);
      expect(result).toBe('Doe');
    });

    it('handles whitespace trimming', () => {
      const customerInfo = { firstName: '  John  ', lastName: '  Doe  ' };
      const result = StripeOrderMapper.buildCustomerName(customerInfo);
      expect(result).toBe('John Doe');
    });

    it('returns null for missing names', () => {
      expect(StripeOrderMapper.buildCustomerName({})).toBeNull();
      expect(StripeOrderMapper.buildCustomerName(null)).toBeNull();
    });
  });

  describe('generateOrderId()', () => {
    it('generates order ID with default prefix', () => {
      const orderId = StripeOrderMapper.generateOrderId();
      expect(orderId).toMatch(/^order_\d+_[a-z0-9]{9}$/);
    });

    it('generates order ID with custom prefix', () => {
      const orderId = StripeOrderMapper.generateOrderId('test');
      expect(orderId).toMatch(/^test_\d+_[a-z0-9]{9}$/);
    });

    it('generates unique order IDs', () => {
      const id1 = StripeOrderMapper.generateOrderId();
      const id2 = StripeOrderMapper.generateOrderId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('buildRedirectUrls()', () => {
    it('builds redirect URLs correctly', () => {
      const result = StripeOrderMapper.buildRedirectUrls('https://example.com', 'order_123');

      expect(result.success_url).toBe('https://example.com/success?session_id={CHECKOUT_SESSION_ID}');
      expect(result.cancel_url).toBe('https://example.com/failure?session_id={CHECKOUT_SESSION_ID}&order_id=order_123');
    });

    it('handles origin with trailing slash', () => {
      const result = StripeOrderMapper.buildRedirectUrls('https://example.com/', 'order_123');

      expect(result.success_url).toBe('https://example.com/success?session_id={CHECKOUT_SESSION_ID}');
      expect(result.cancel_url).toBe('https://example.com/failure?session_id={CHECKOUT_SESSION_ID}&order_id=order_123');
    });

    it('throws error for missing origin', () => {
      expect(() => {
        StripeOrderMapper.buildRedirectUrls('', 'order_123');
      }).toThrow('Origin is required');
    });
  });

  describe('mapOrderToStripeSession()', () => {
    it('maps complete order to Stripe session config', () => {
      const orderRequest = {
        cartItems: [
          { name: 'Weekend Pass', price: 125.00, quantity: 1, type: 'ticket' }
        ],
        customerInfo: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe'
        },
        origin: 'https://example.com',
        orderId: 'order_123',
        orderType: 'tickets',
        environment: 'test'
      };

      const result = StripeOrderMapper.mapOrderToStripeSession(orderRequest);

      expect(result.payment_method_types).toEqual(['card', 'link']);
      expect(result.mode).toBe('payment');
      expect(result.billing_address_collection).toBe('required');
      expect(result.line_items).toHaveLength(1);
      expect(result.success_url).toBeDefined();
      expect(result.cancel_url).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.customer_email).toBe('test@example.com');
      expect(result.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('throws error for missing cart items', () => {
      expect(() => {
        StripeOrderMapper.mapOrderToStripeSession({
          origin: 'https://example.com',
          orderId: 'order_123'
        });
      }).toThrow('Cart items are required');
    });

    it('throws error for missing origin', () => {
      expect(() => {
        StripeOrderMapper.mapOrderToStripeSession({
          cartItems: [
            { name: 'Test', price: 10, quantity: 1, type: 'ticket' }
          ],
          orderId: 'order_123'
        });
      }).toThrow('Origin is required');
    });

    it('handles line item mapping errors', () => {
      const orderRequest = {
        cartItems: [
          { name: 'Invalid', price: -10, quantity: 1, type: 'ticket' }
        ],
        origin: 'https://example.com',
        orderId: 'order_123'
      };

      expect(() => {
        StripeOrderMapper.mapOrderToStripeSession(orderRequest);
      }).toThrow('Failed to map line items');
    });
  });

  describe('validateStripeLineItem()', () => {
    it('validates correct line item', () => {
      const lineItem = {
        price_data: {
          currency: 'usd',
          unit_amount: 12500,
          product_data: {
            name: 'Test Product'
          }
        },
        quantity: 1
      };

      const result = StripeOrderMapper.validateStripeLineItem(lineItem);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates line item structure requirements', () => {
      let result = StripeOrderMapper.validateStripeLineItem(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Line item must be an object');

      result = StripeOrderMapper.validateStripeLineItem({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Line item must have price_data');
    });

    it('validates price_data requirements', () => {
      const result = StripeOrderMapper.validateStripeLineItem({
        price_data: {
          unit_amount: 0
        },
        quantity: 1
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Currency is required');
      expect(result.errors).toContain('Unit amount must be greater than zero');
      expect(result.errors).toContain('Product data is required');
    });

    it('validates quantity requirements', () => {
      const result = StripeOrderMapper.validateStripeLineItem({
        price_data: {
          currency: 'usd',
          unit_amount: 1000,
          product_data: { name: 'Test' }
        }
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity must be greater than zero');
    });
  });
});