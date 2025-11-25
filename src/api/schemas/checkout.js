/**
 * Checkout API Zod Schemas
 *
 * Defines validation schemas for checkout-related API requests and responses.
 * Uses JSDoc for type inference in JavaScript.
 *
 * @module src/api/schemas/checkout
 */

import { z } from 'zod';

// =============================================================================
// Cart Item Schema
// =============================================================================

/**
 * Schema for individual cart items (tickets or donations)
 * @typedef {z.infer<typeof CartItemSchema>} CartItem
 */
export const CartItemSchema = z.object({
  name: z
    .string()
    .min(1, 'Item name is required')
    .max(200, 'Item name must be 200 characters or less'),
  price: z
    .number()
    .positive('Price must be a positive number'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1')
    .max(100, 'Maximum quantity is 100'),
  type: z.enum(['ticket', 'donation'], {
    errorMap: () => ({ message: 'Type must be either "ticket" or "donation"' }),
  }),
  // Ticket-specific fields (conditionally required based on type)
  ticketType: z
    .string()
    .max(100, 'Ticket type must be 100 characters or less')
    .optional(),
  eventDate: z
    .string()
    .max(50, 'Event date must be 50 characters or less')
    .optional(),
  eventId: z
    .number()
    .int('Event ID must be a whole number')
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
});

// =============================================================================
// Customer Info Schema
// =============================================================================

/**
 * Schema for customer information
 * @typedef {z.infer<typeof CustomerInfoSchema>} CustomerInfo
 */
export const CustomerInfoSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(254, 'Email must be 254 characters or less'),
  firstName: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(100, 'First name must be 100 characters or less')
    .optional(),
  lastName: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(100, 'Last name must be 100 characters or less')
    .optional(),
  phone: z
    .string()
    .max(50, 'Phone number must be 50 characters or less')
    .optional(),
});

// =============================================================================
// Device Info Schema (for PayPal mobile optimization)
// =============================================================================

/**
 * Schema for device information (used in PayPal flow)
 * @typedef {z.infer<typeof DeviceInfoSchema>} DeviceInfo
 */
export const DeviceInfoSchema = z.object({
  isMobile: z.boolean().optional(),
  connectionType: z.string().max(50).optional(),
  userAgent: z.string().max(500).optional(),
});

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Schema for Stripe checkout session creation request
 * @typedef {z.infer<typeof CheckoutRequestSchema>} CheckoutRequest
 */
export const CheckoutRequestSchema = z.object({
  cartItems: z
    .array(CartItemSchema)
    .min(1, 'Cart must contain at least one item')
    .max(50, 'Cart cannot contain more than 50 items'),
  customerInfo: CustomerInfoSchema.optional(),
  testMode: z.boolean().optional(),
});

/**
 * Schema for PayPal order creation request
 * @typedef {z.infer<typeof PayPalOrderRequestSchema>} PayPalOrderRequest
 */
export const PayPalOrderRequestSchema = z.object({
  cartItems: z
    .array(CartItemSchema)
    .min(1, 'Cart must contain at least one item')
    .max(50, 'Cart cannot contain more than 50 items'),
  customerInfo: CustomerInfoSchema.optional(),
  deviceInfo: DeviceInfoSchema.optional(),
});

/**
 * Schema for PayPal order capture request
 * @typedef {z.infer<typeof PayPalCaptureRequestSchema>} PayPalCaptureRequest
 */
export const PayPalCaptureRequestSchema = z.object({
  orderId: z
    .string()
    .min(1, 'Order ID is required')
    .max(100, 'Order ID must be 100 characters or less'),
  transactionId: z
    .string()
    .min(1, 'Transaction ID is required')
    .max(100, 'Transaction ID must be 100 characters or less')
    .optional(),
});

// =============================================================================
// Response Schemas (for documentation and response validation)
// =============================================================================

/**
 * Schema for Stripe checkout session response
 * @typedef {z.infer<typeof CheckoutResponseSchema>} CheckoutResponse
 */
export const CheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url('Invalid checkout URL'),
  sessionId: z.string().min(1, 'Session ID is required'),
  orderId: z.string().min(1, 'Order ID is required'),
  totalAmount: z.number().nonnegative('Total amount must be non-negative'),
});

/**
 * Schema for PayPal order creation response
 * @typedef {z.infer<typeof PayPalOrderResponseSchema>} PayPalOrderResponse
 */
export const PayPalOrderResponseSchema = z.object({
  orderId: z.string().min(1, 'PayPal order ID is required'),
  approvalUrl: z.string().url('Invalid approval URL'),
  transactionId: z.string().min(1, 'Transaction ID is required'),
  orderNumber: z.string().min(1, 'Order number is required'),
  totalAmount: z.number().nonnegative('Total amount must be non-negative'),
  totalAmountCents: z.number().int().nonnegative('Total amount in cents must be non-negative'),
  testMode: z.boolean().optional(),
});

/**
 * Schema for PayPal order capture response
 * @typedef {z.infer<typeof PayPalCaptureResponseSchema>} PayPalCaptureResponse
 */
export const PayPalCaptureResponseSchema = z.object({
  success: z.boolean(),
  transaction: z.object({
    id: z.number().int().positive(),
    transactionId: z.string(),
    orderNumber: z.string(),
    status: z.string(),
    totalAmount: z.number(),
    paymentProcessor: z.enum(['paypal', 'venmo']),
  }),
  tickets: z.array(z.object({
    ticketId: z.string(),
    ticketType: z.string(),
    status: z.string(),
  })).optional(),
  registrationUrl: z.string().url().optional(),
  registrationToken: z.string().optional(),
});

// =============================================================================
// Error Response Schema
// =============================================================================

/**
 * Schema for validation error response
 * @typedef {z.infer<typeof ValidationErrorResponseSchema>} ValidationErrorResponse
 */
export const ValidationErrorResponseSchema = z.object({
  success: z.literal(false),
  errors: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })),
});

// =============================================================================
// Refinements (Cross-field validation)
// =============================================================================

/**
 * Cart item with ticket validation - ensures ticket items have required fields
 * @typedef {z.infer<typeof TicketCartItemSchema>} TicketCartItem
 */
export const TicketCartItemSchema = CartItemSchema.refine(
  (item) => {
    if (item.type === 'ticket') {
      return item.ticketType && item.eventId !== undefined;
    }
    return true;
  },
  {
    message: 'Ticket items require ticketType and eventId',
    path: ['ticketType'],
  }
);

/**
 * Checkout request with ticket validation
 * @typedef {z.infer<typeof StrictCheckoutRequestSchema>} StrictCheckoutRequest
 */
export const StrictCheckoutRequestSchema = z.object({
  cartItems: z
    .array(TicketCartItemSchema)
    .min(1, 'Cart must contain at least one item')
    .max(50, 'Cart cannot contain more than 50 items'),
  customerInfo: CustomerInfoSchema.optional(),
  testMode: z.boolean().optional(),
});
