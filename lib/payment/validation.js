/**
 * Payment Validation Utilities
 * Comprehensive input validation for payment processing
 */

import { PAYMENT_CONFIG, ERROR_MESSAGES, TICKET_TYPES } from './config.js';

export class ValidationError extends Error {
  constructor(message, field = null, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
  }
}

/**
 * Validates checkout data from the frontend
 */
export function validateCheckoutData(data) {
  const errors = [];

  // Validate structure
  if (!data || typeof data !== 'object') {
    return { valid: false, error: ERROR_MESSAGES.INVALID_REQUEST };
  }

  const { items, customerInfo } = data;

  // Validate customer info
  const customerValidation = validateCustomerInfo(customerInfo);
  if (!customerValidation.valid) {
    return customerValidation;
  }

  // Validate items
  const itemsValidation = validateItems(items);
  if (!itemsValidation.valid) {
    return itemsValidation;
  }

  return { valid: true };
}

/**
 * Validates customer information
 */
export function validateCustomerInfo(customerInfo) {
  if (!customerInfo || typeof customerInfo !== 'object') {
    return { valid: false, error: ERROR_MESSAGES.INVALID_REQUEST };
  }

  const { email, name, phone } = customerInfo;

  // Validate email
  if (!email || typeof email !== 'string') {
    return { valid: false, error: ERROR_MESSAGES.INVALID_EMAIL };
  }

  if (!PAYMENT_CONFIG.validation.email.test(email.trim())) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_EMAIL };
  }

  // Validate name
  if (!name || typeof name !== 'string') {
    return { valid: false, error: ERROR_MESSAGES.INVALID_NAME };
  }

  if (!PAYMENT_CONFIG.validation.name.test(name.trim())) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_NAME };
  }

  // Validate phone (optional but if provided must be valid)
  if (phone && typeof phone === 'string') {
    if (!PAYMENT_CONFIG.validation.phone.test(phone.trim())) {
      return { valid: false, error: ERROR_MESSAGES.INVALID_PHONE };
    }
  }

  return { valid: true };
}

/**
 * Validates order items
 */
export function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'At least one item is required' };
  }

  if (items.length > PAYMENT_CONFIG.orders.maxItemsPerOrder) {
    return { valid: false, error: 'Too many items in order' };
  }

  for (const item of items) {
    const itemValidation = validateItem(item);
    if (!itemValidation.valid) {
      return itemValidation;
    }
  }

  return { valid: true };
}

/**
 * Validates individual item
 */
export function validateItem(item) {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: 'Invalid item format' };
  }

  const { id, quantity, price } = item;

  // Validate item ID
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Invalid item ID' };
  }

  const ticketConfig = PAYMENT_CONFIG.tickets[id];
  if (!ticketConfig) {
    return { valid: false, error: `Invalid ticket type: ${id}` };
  }

  // Validate quantity
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { valid: false, error: 'Invalid quantity' };
  }

  if (quantity > ticketConfig.maxQuantity) {
    return { 
      valid: false, 
      error: `Maximum ${ticketConfig.maxQuantity} tickets per type allowed` 
    };
  }

  // Validate price (for donations, price can be custom)
  if (id === TICKET_TYPES.DONATION) {
    if (!Number.isFinite(price) || price < 1) {
      return { valid: false, error: 'Invalid donation amount' };
    }
    if (price > 10000) {
      return { valid: false, error: 'Donation amount too large' };
    }
  } else {
    // For fixed-price tickets, ensure price matches configuration
    if (price !== ticketConfig.price) {
      return { valid: false, error: 'Price mismatch detected' };
    }
  }

  return { valid: true };
}

/**
 * Sanitizes customer input data
 */
export function sanitizeCustomerInfo(customerInfo) {
  return {
    email: customerInfo.email?.trim().toLowerCase(),
    name: customerInfo.name?.trim(),
    phone: customerInfo.phone?.trim() || null,
  };
}

/**
 * Sanitizes and validates items
 */
export function sanitizeItems(items) {
  return items.map(item => ({
    id: item.id.trim(),
    quantity: parseInt(item.quantity, 10),
    price: parseFloat(item.price),
    name: PAYMENT_CONFIG.tickets[item.id]?.name || item.id,
  }));
}

/**
 * Validates webhook signature
 */
export function validateWebhookSignature(payload, signature, secret) {
  try {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace('sha256=', ''), 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Webhook signature validation error:', error);
    return false;
  }
}

/**
 * Validates order total calculation
 */
export function validateOrderTotal(items, expectedTotal) {
  const calculatedTotal = calculateOrderTotal(items);
  
  // Allow for small floating point differences
  const tolerance = 0.01;
  const difference = Math.abs(calculatedTotal - expectedTotal);
  
  if (difference > tolerance) {
    throw new ValidationError(
      `Total mismatch: expected ${expectedTotal}, calculated ${calculatedTotal}`
    );
  }

  return true;
}

/**
 * Calculates order total from items
 */
export function calculateOrderTotal(items) {
  return items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);
}

/**
 * Validates environment variables
 */
export function validateEnvironment() {
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Rate limiting validation
 */
export function validateRateLimit(requests, limit, windowMs) {
  const now = Date.now();
  const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
  
  return validRequests.length < limit;
}