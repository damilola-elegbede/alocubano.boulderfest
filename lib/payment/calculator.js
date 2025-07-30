/**
 * Payment Calculator
 * Server-side calculation utilities for secure pricing
 */

import { PAYMENT_CONFIG, TICKET_TYPES } from './config.js';
import { ValidationError } from './validation.js';

/**
 * Calculates total amount for order items with security validations
 */
export function calculateTotal(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Invalid items array');
  }

  let subtotal = 0;
  const lineItems = [];
  const breakdown = {
    subtotal: 0,
    fees: 0,
    tax: 0,
    total: 0,
    items: []
  };

  for (const item of items) {
    const itemTotal = calculateItemTotal(item);
    subtotal += itemTotal.total;
    
    lineItems.push({
      price_data: {
        currency: PAYMENT_CONFIG.stripe.currency.toLowerCase(),
        product_data: {
          name: itemTotal.name,
          description: itemTotal.description,
        },
        unit_amount: Math.round(itemTotal.unitPrice * 100), // Convert to cents
      },
      quantity: item.quantity,
    });

    breakdown.items.push({
      id: item.id,
      name: itemTotal.name,
      quantity: item.quantity,
      unitPrice: itemTotal.unitPrice,
      total: itemTotal.total
    });
  }

  // Calculate fees (if any)
  const fees = calculateProcessingFees(subtotal);
  
  // Calculate tax (if applicable)
  const tax = calculateTax(subtotal);
  
  const total = subtotal + fees + tax;

  // Validate total amount is within limits
  const totalCents = Math.round(total * 100);
  if (totalCents < PAYMENT_CONFIG.stripe.minAmount) {
    throw new ValidationError(`Order total too low: minimum $${PAYMENT_CONFIG.stripe.minAmount / 100}`);
  }
  
  if (totalCents > PAYMENT_CONFIG.stripe.maxAmount) {
    throw new ValidationError(`Order total too high: maximum $${PAYMENT_CONFIG.stripe.maxAmount / 100}`);
  }

  breakdown.subtotal = subtotal;
  breakdown.fees = fees;
  breakdown.tax = tax;
  breakdown.total = total;

  return {
    total: Math.round(total * 100), // Return in cents for Stripe
    totalDollars: total,
    lineItems,
    breakdown
  };
}

/**
 * Calculates total for individual item
 */
export function calculateItemTotal(item) {
  const { id, quantity, price } = item;
  
  const ticketConfig = PAYMENT_CONFIG.tickets[id];
  if (!ticketConfig) {
    throw new ValidationError(`Invalid ticket type: ${id}`);
  }

  let unitPrice;
  let name = ticketConfig.name;
  let description = `${ticketConfig.name} - A Lo Cubano Boulder Fest 2026`;

  // Handle different pricing models
  if (id === TICKET_TYPES.DONATION) {
    // Custom donation amount
    unitPrice = price;
    name = `Donation - ${ticketConfig.name}`;
    description = 'Support A Lo Cubano Boulder Fest';
  } else {
    // Fixed price tickets - ensure price matches config for security
    if (price !== ticketConfig.price) {
      throw new ValidationError(`Price mismatch for ${id}: expected ${ticketConfig.price}, received ${price}`);
    }
    unitPrice = ticketConfig.price;
  }

  // Validate quantity
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError(`Invalid quantity for ${id}: ${quantity}`);
  }

  if (quantity > ticketConfig.maxQuantity) {
    throw new ValidationError(`Quantity exceeds maximum for ${id}: ${quantity} > ${ticketConfig.maxQuantity}`);
  }

  const total = unitPrice * quantity;

  return {
    unitPrice,
    total,
    name,
    description
  };
}

/**
 * Calculates processing fees (if any)
 * Currently no processing fees, but structure for future implementation
 */
export function calculateProcessingFees(subtotal) {
  // For now, we absorb the processing fees
  // In the future, we might add a small processing fee
  return 0;
}

/**
 * Calculates tax (if applicable)
 * Colorado state tax implementation
 */
export function calculateTax(subtotal) {
  // Check if tax should be applied
  // For events in Colorado, tax might be required
  // Currently not applying tax to keep pricing simple
  return 0;
}

/**
 * Validates calculated total against expected total
 */
export function validateCalculatedTotal(items, expectedTotal) {
  const calculated = calculateTotal(items);
  
  // Allow for small rounding differences
  const tolerance = 1; // 1 cent tolerance
  const difference = Math.abs(calculated.total - expectedTotal);
  
  if (difference > tolerance) {
    throw new ValidationError(
      `Total calculation mismatch: expected ${expectedTotal} cents, calculated ${calculated.total} cents`
    );
  }

  return calculated;
}

/**
 * Formats currency for display
 */
export function formatCurrency(amount, currency = 'USD') {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Amount is expected in cents, convert to dollars
  return formatter.format(amount / 100);
}

/**
 * Converts cents to dollars
 */
export function centsToDollars(cents) {
  return Math.round(cents) / 100;
}

/**
 * Converts dollars to cents
 */
export function dollarsToCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * Calculates refund amount
 */
export function calculateRefundAmount(originalTotal, refundType = 'full') {
  switch (refundType) {
    case 'full':
      return originalTotal;
    case 'partial':
      // Implement partial refund logic
      // For now, return 80% (20% processing fee)
      return Math.round(originalTotal * 0.8);
    default:
      throw new ValidationError(`Invalid refund type: ${refundType}`);
  }
}

/**
 * Validates pricing configuration integrity
 */
export function validatePricingConfig() {
  const errors = [];

  Object.entries(PAYMENT_CONFIG.tickets).forEach(([id, config]) => {
    if (!config.name) {
      errors.push(`Missing name for ticket type: ${id}`);
    }
    
    if (id !== TICKET_TYPES.DONATION && (!Number.isFinite(config.price) || config.price < 0)) {
      errors.push(`Invalid price for ticket type: ${id}`);
    }
    
    if (!Number.isInteger(config.maxQuantity) || config.maxQuantity < 1) {
      errors.push(`Invalid maxQuantity for ticket type: ${id}`);
    }
    
    if (!Number.isInteger(config.available) || config.available < 0) {
      errors.push(`Invalid available count for ticket type: ${id}`);
    }
  });

  if (errors.length > 0) {
    throw new ValidationError(`Pricing configuration errors: ${errors.join(', ')}`);
  }

  return true;
}