/**
 * @vitest-environment node
 *
 * Unit tests for Checkout API Zod Schemas
 */

import { describe, it, expect } from 'vitest';
import {
  CartItemSchema,
  TicketCartItemSchema,
  CustomerInfoSchema,
  DeviceInfoSchema,
  CheckoutRequestSchema,
  StrictCheckoutRequestSchema,
  PayPalOrderRequestSchema,
  PayPalCaptureRequestSchema,
  CheckoutResponseSchema,
  PayPalOrderResponseSchema,
  ValidationErrorResponseSchema,
} from '../../../../src/api/schemas/checkout.js';
import {
  validateRequest,
  validateRequestWithResponse,
  formatZodErrors,
  validatePartialRequest,
} from '../../../../src/api/helpers/validate.js';

// =============================================================================
// Test Data Fixtures
// =============================================================================

const validTicketItem = {
  name: 'Full Weekend Pass',
  price: 150.0,
  quantity: 2,
  type: 'ticket',
  ticketType: 'full_weekend',
  eventDate: '2026-05-15',
  eventId: 1,
  description: 'Access to all events',
};

const validDonationItem = {
  name: 'General Donation',
  price: 50.0,
  quantity: 1,
  type: 'donation',
};

const validCustomerInfo = {
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+1-555-123-4567',
};

// =============================================================================
// CartItemSchema Tests
// =============================================================================

describe('CartItemSchema', () => {
  describe('valid inputs', () => {
    it('should accept a valid ticket item with all fields', () => {
      const result = CartItemSchema.safeParse(validTicketItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Full Weekend Pass');
        expect(result.data.type).toBe('ticket');
      }
    });

    it('should accept a valid donation item', () => {
      const result = CartItemSchema.safeParse(validDonationItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('donation');
      }
    });

    it('should accept ticket item without optional fields', () => {
      const item = {
        name: 'Basic Ticket',
        price: 50,
        quantity: 1,
        type: 'ticket',
      };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it('should accept price with decimal places', () => {
      const item = { ...validDonationItem, price: 99.99 };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it('should accept quantity of 100 (max)', () => {
      const item = { ...validDonationItem, quantity: 100 };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty name', () => {
      const item = { ...validDonationItem, name: '' };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('required');
      }
    });

    it('should reject name exceeding 200 characters', () => {
      const item = { ...validDonationItem, name: 'x'.repeat(201) };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject negative price', () => {
      const item = { ...validDonationItem, price: -10 };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject zero price', () => {
      const item = { ...validDonationItem, price: 0 };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer quantity', () => {
      const item = { ...validDonationItem, quantity: 1.5 };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject zero quantity', () => {
      const item = { ...validDonationItem, quantity: 0 };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject quantity exceeding 100', () => {
      const item = { ...validDonationItem, quantity: 101 };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject invalid type', () => {
      const item = { ...validDonationItem, type: 'merchandise' };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const item = { name: 'Test' };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('should reject description exceeding 500 characters', () => {
      const item = { ...validTicketItem, description: 'x'.repeat(501) };
      const result = CartItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// TicketCartItemSchema Tests (with refinement)
// =============================================================================

describe('TicketCartItemSchema', () => {
  it('should accept valid ticket with required ticket fields', () => {
    const result = TicketCartItemSchema.safeParse(validTicketItem);
    expect(result.success).toBe(true);
  });

  it('should reject ticket without ticketType', () => {
    const item = { ...validTicketItem };
    delete item.ticketType;
    const result = TicketCartItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('should reject ticket without eventId', () => {
    const item = { ...validTicketItem };
    delete item.eventId;
    const result = TicketCartItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('should accept donation without ticketType or eventId', () => {
    const result = TicketCartItemSchema.safeParse(validDonationItem);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// CustomerInfoSchema Tests
// =============================================================================

describe('CustomerInfoSchema', () => {
  describe('valid inputs', () => {
    it('should accept valid customer info with all fields', () => {
      const result = CustomerInfoSchema.safeParse(validCustomerInfo);
      expect(result.success).toBe(true);
    });

    it('should accept email only (minimum required)', () => {
      const result = CustomerInfoSchema.safeParse({ email: 'user@example.com' });
      expect(result.success).toBe(true);
    });

    it('should accept international characters in names', () => {
      const info = {
        email: 'test@example.com',
        firstName: 'José',
        lastName: "O'Connor",
      };
      const result = CustomerInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject invalid email format', () => {
      const info = { email: 'not-an-email' };
      const result = CustomerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });

    it('should reject email without domain', () => {
      const info = { email: 'user@' };
      const result = CustomerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });

    it('should reject email exceeding 254 characters', () => {
      const info = { email: 'x'.repeat(250) + '@test.com' };
      const result = CustomerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });

    it('should reject firstName with 1 character', () => {
      const info = { email: 'test@example.com', firstName: 'J' };
      const result = CustomerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });

    it('should reject firstName exceeding 100 characters', () => {
      const info = { email: 'test@example.com', firstName: 'J'.repeat(101) };
      const result = CustomerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });

    it('should reject phone exceeding 50 characters', () => {
      const info = { email: 'test@example.com', phone: '1'.repeat(51) };
      const result = CustomerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// DeviceInfoSchema Tests
// =============================================================================

describe('DeviceInfoSchema', () => {
  it('should accept valid device info', () => {
    const info = {
      isMobile: true,
      connectionType: '4g',
      userAgent: 'Mozilla/5.0...',
    };
    const result = DeviceInfoSchema.safeParse(info);
    expect(result.success).toBe(true);
  });

  it('should accept empty object (all fields optional)', () => {
    const result = DeviceInfoSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial device info', () => {
    const result = DeviceInfoSchema.safeParse({ isMobile: false });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// CheckoutRequestSchema Tests
// =============================================================================

describe('CheckoutRequestSchema', () => {
  describe('valid inputs', () => {
    it('should accept valid checkout request with tickets', () => {
      const request = {
        cartItems: [validTicketItem],
        customerInfo: validCustomerInfo,
      };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept checkout request without customerInfo', () => {
      const request = {
        cartItems: [validDonationItem],
      };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept checkout request with testMode', () => {
      const request = {
        cartItems: [validDonationItem],
        testMode: true,
      };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept mixed cart items (tickets and donations)', () => {
      const request = {
        cartItems: [validTicketItem, validDonationItem],
      };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept cart with 50 items (max)', () => {
      const items = Array(50).fill(validDonationItem);
      const request = { cartItems: items };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty cartItems array', () => {
      const request = { cartItems: [] };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject cartItems exceeding 50 items', () => {
      const items = Array(51).fill(validDonationItem);
      const request = { cartItems: items };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject missing cartItems', () => {
      const request = { customerInfo: validCustomerInfo };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject invalid cart item in array', () => {
      const request = {
        cartItems: [validTicketItem, { name: '' }],
      };
      const result = CheckoutRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// PayPalOrderRequestSchema Tests
// =============================================================================

describe('PayPalOrderRequestSchema', () => {
  it('should accept valid PayPal order request', () => {
    const request = {
      cartItems: [validTicketItem],
      customerInfo: validCustomerInfo,
      deviceInfo: { isMobile: true },
    };
    const result = PayPalOrderRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('should accept request without deviceInfo', () => {
    const request = { cartItems: [validDonationItem] };
    const result = PayPalOrderRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// PayPalCaptureRequestSchema Tests
// =============================================================================

describe('PayPalCaptureRequestSchema', () => {
  it('should accept valid capture request', () => {
    const request = {
      orderId: 'PAYPAL-ORDER-123',
      transactionId: 'TXN-456',
    };
    const result = PayPalCaptureRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('should accept request without transactionId', () => {
    const request = { orderId: 'PAYPAL-ORDER-123' };
    const result = PayPalCaptureRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('should reject empty orderId', () => {
    const request = { orderId: '' };
    const result = PayPalCaptureRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Response Schema Tests
// =============================================================================

describe('CheckoutResponseSchema', () => {
  it('should accept valid checkout response', () => {
    const response = {
      checkoutUrl: 'https://checkout.stripe.com/session/123',
      sessionId: 'cs_test_123',
      orderId: 'ALO-2026-0001',
      totalAmount: 150.0,
    };
    const result = CheckoutResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('should reject invalid URL', () => {
    const response = {
      checkoutUrl: 'not-a-url',
      sessionId: 'cs_test_123',
      orderId: 'ALO-2026-0001',
      totalAmount: 150.0,
    };
    const result = CheckoutResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });
});

describe('PayPalOrderResponseSchema', () => {
  it('should accept valid PayPal order response', () => {
    const response = {
      orderId: 'PAYPAL-123',
      approvalUrl: 'https://paypal.com/approve/123',
      transactionId: 'TXN-456',
      orderNumber: 'ALO-2026-0001',
      totalAmount: 150.0,
      totalAmountCents: 15000,
      testMode: false,
    };
    const result = PayPalOrderResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});

describe('ValidationErrorResponseSchema', () => {
  it('should accept valid error response', () => {
    const response = {
      success: false,
      errors: [
        { path: 'email', message: 'Invalid email format' },
        { path: 'cartItems.0.price', message: 'Price must be positive' },
      ],
    };
    const result = ValidationErrorResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Validation Helper Tests
// =============================================================================

describe('validateRequest helper', () => {
  it('should return success with data for valid input', () => {
    const result = validateRequest(CartItemSchema, validTicketItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Full Weekend Pass');
    }
  });

  it('should return errors for invalid input', () => {
    const result = validateRequest(CartItemSchema, { name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('should format nested paths correctly', () => {
    const result = validateRequest(CheckoutRequestSchema, {
      cartItems: [{ name: '', price: -1, quantity: 0, type: 'invalid' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.errors.map((e) => e.path);
      expect(paths.some((p) => p.startsWith('cartItems.0'))).toBe(true);
    }
  });
});

describe('formatZodErrors helper', () => {
  it('should format errors into object keyed by path', () => {
    const result = CustomerInfoSchema.safeParse({ email: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(typeof formatted).toBe('object');
      expect(formatted.email).toBeDefined();
    }
  });

  it('should keep only first error per field', () => {
    // Force multiple errors on same field
    const result = CartItemSchema.safeParse({
      name: '',
      price: 'not-a-number',
      quantity: 'not-a-number',
      type: 'invalid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      // Each field should have exactly one error message
      expect(typeof formatted.name).toBe('string');
    }
  });
});

describe('validatePartialRequest helper', () => {
  it('should allow missing required fields for partial validation', () => {
    // CustomerInfoSchema requires email, but partial should allow it to be missing
    const result = validatePartialRequest(CustomerInfoSchema, {
      firstName: 'John',
    });
    expect(result.success).toBe(true);
  });

  it('should still validate provided fields', () => {
    const result = validatePartialRequest(CustomerInfoSchema, {
      email: 'invalid-email',
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Edge Cases and Special Characters
// =============================================================================

describe('Edge cases', () => {
  it('should handle unicode characters in names', () => {
    const item = {
      name: '日本語チケット 🎫',
      price: 100,
      quantity: 1,
      type: 'ticket',
    };
    const result = CartItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('should handle special characters in descriptions', () => {
    const item = {
      ...validTicketItem,
      description: "O'Reilly & Sons <script>alert('xss')</script>",
    };
    const result = CartItemSchema.safeParse(item);
    // Schema doesn't sanitize, just validates structure
    expect(result.success).toBe(true);
  });

  it('should handle null values as invalid', () => {
    const item = { ...validDonationItem, name: null };
    const result = CartItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('should handle undefined values for optional fields', () => {
    const item = {
      ...validTicketItem,
      description: undefined,
    };
    const result = CartItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('should strip unknown fields', () => {
    const item = {
      ...validDonationItem,
      unknownField: 'should be stripped',
    };
    const result = CartItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('unknownField' in result.data).toBe(false);
    }
  });

  it('should handle very long valid strings at boundary', () => {
    const item = {
      ...validDonationItem,
      name: 'x'.repeat(200), // Exactly at max
    };
    const result = CartItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('should handle eventId of 0 for special events', () => {
    const item = { ...validTicketItem, eventId: 0 };
    const result = CartItemSchema.safeParse(item);
    // 0 is falsy but should be valid if schema allows it
    expect(result.success).toBe(true);
  });

  it('should handle negative eventId for test events', () => {
    const item = { ...validTicketItem, eventId: -1 };
    const result = CartItemSchema.safeParse(item);
    // Current schema allows negative integers
    expect(result.success).toBe(true);
  });
});
