/**
 * Payment Configuration
 * Centralized configuration for payment processing
 */

export const PAYMENT_CONFIG = {
  // Stripe Configuration
  stripe: {
    currency: 'USD',
    paymentMethods: ['card'],
    sessionExpiry: 30 * 60, // 30 minutes
    maxAmount: 10000 * 100, // $10,000 in cents
    minAmount: 1 * 100, // $1 in cents
  },

  // Ticket Configuration
  tickets: {
    'full-pass': {
      id: 'full-pass',
      name: 'Full Festival Pass',
      price: 150,
      maxQuantity: 10,
      available: 500,
    },
    'single-day': {
      id: 'single-day',
      name: 'Single Day Pass',
      price: 75,
      maxQuantity: 10,
      available: 200,
    },
    'vip-pass': {
      id: 'vip-pass',
      name: 'VIP Experience',
      price: 350,
      maxQuantity: 4,
      available: 50,
    },
    'donation': {
      id: 'donation',
      name: 'Donation',
      price: 0, // Variable pricing
      maxQuantity: 1,
      available: 9999,
    }
  },

  // Rate Limiting
  rateLimits: {
    createCheckout: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // limit each IP to 10 requests per windowMs
    },
    webhooks: {
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // allow more for webhooks
    }
  },

  // Order Configuration
  orders: {
    reservationTimeout: 15 * 60, // 15 minutes
    orderNumberLength: 8,
    maxItemsPerOrder: 20,
  },

  // Validation Rules
  validation: {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^\+?[\d\s\-\(\)]{10,20}$/,
    name: /^[a-zA-Z\s\-']{2,50}$/,
  }
};

export const ERROR_MESSAGES = {
  INVALID_REQUEST: 'Invalid request data',
  INSUFFICIENT_INVENTORY: 'Some tickets are no longer available',
  INVALID_EMAIL: 'Please provide a valid email address',
  INVALID_PHONE: 'Please provide a valid phone number',
  INVALID_NAME: 'Please provide a valid name',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  PAYMENT_FAILED: 'Payment processing failed. Please try again.',
  SESSION_EXPIRED: 'Your session has expired. Please start over.',
  INTERNAL_ERROR: 'An internal error occurred. Please try again.',
  WEBHOOK_VERIFICATION_FAILED: 'Webhook verification failed',
  ORDER_NOT_FOUND: 'Order not found',
  INVENTORY_LOCK_FAILED: 'Unable to reserve tickets. Please try again.',
};

export const ORDER_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
};

export const TICKET_TYPES = {
  FULL_PASS: 'full-pass',
  SINGLE_DAY: 'single-day',
  VIP_PASS: 'vip-pass',
  DONATION: 'donation',
};