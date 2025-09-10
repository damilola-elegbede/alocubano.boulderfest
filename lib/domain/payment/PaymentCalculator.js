/**
 * Payment Calculator Domain Service
 * Handles all payment calculations and pricing logic
 */

export class PaymentCalculator {
  /**
   * Calculate cart total amount
   * @param {Array} cartItems - Array of cart items
   * @returns {Object} Calculation result with total, subtotal, and breakdown
   */
  static calculateCartTotal(cartItems) {
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return {
        total: 0,
        subtotal: 0,
        itemCount: 0,
        breakdown: []
      };
    }

    let subtotal = 0;
    const breakdown = [];
    let itemCount = 0;

    for (const item of cartItems) {
      const itemCalculation = this.calculateItemTotal(item);
      subtotal += itemCalculation.total;
      itemCount += item.quantity || 0;
      breakdown.push({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        itemTotal: itemCalculation.total,
        type: item.type
      });
    }

    return {
      total: subtotal,
      subtotal: subtotal,
      itemCount: itemCount,
      breakdown: breakdown
    };
  }

  /**
   * Calculate individual item total
   * @param {Object} item - Cart item
   * @returns {Object} Item calculation result
   */
  static calculateItemTotal(item) {
    if (!item || !item.hasOwnProperty('price') || !item.quantity || item.quantity <= 0) {
      return {
        total: 0,
        unitPrice: item?.price || 0,
        quantity: item?.quantity || 0,
        valid: false,
        error: 'Invalid item data'
      };
    }

    if (item.price < 0) {
      return {
        total: 0,
        unitPrice: item.price,
        quantity: item.quantity,
        valid: false,
        error: 'Negative price not allowed'
      };
    }

    const total = item.price * item.quantity;
    
    return {
      total: total,
      unitPrice: item.price,
      quantity: item.quantity,
      valid: true,
      error: null
    };
  }

  /**
   * Calculate tax amount (future use)
   * @param {number} subtotal - Subtotal amount
   * @param {string} taxZone - Tax zone identifier
   * @returns {Object} Tax calculation result
   */
  static calculateTax(subtotal, taxZone = 'CO') {
    // Currently no taxes applied, but structure for future implementation
    const taxRates = {
      'CO': 0.0,  // Colorado - no tax on event tickets currently
      'default': 0.0
    };

    const rate = taxRates[taxZone] || taxRates.default;
    const taxAmount = subtotal * rate;

    return {
      taxAmount: taxAmount,
      taxRate: rate,
      taxZone: taxZone,
      taxableAmount: subtotal
    };
  }

  /**
   * Calculate processing fees
   * @param {number} subtotal - Subtotal amount
   * @param {string} paymentMethod - Payment method type
   * @returns {Object} Fee calculation result
   */
  static calculateProcessingFees(subtotal, paymentMethod = 'card') {
    // Currently fees are handled by Stripe, but structure for future use
    const feeRates = {
      'card': 0.0,    // Included in Stripe pricing
      'link': 0.0,    // Stripe Link
      'ach': 0.0      // Future ACH support
    };

    const rate = feeRates[paymentMethod] || feeRates.card;
    const feeAmount = subtotal * rate;

    return {
      feeAmount: feeAmount,
      feeRate: rate,
      paymentMethod: paymentMethod,
      description: 'Processing fee'
    };
  }

  /**
   * Apply discount to cart
   * @param {number} subtotal - Subtotal amount
   * @param {Object} discount - Discount configuration
   * @returns {Object} Discount calculation result
   */
  static applyDiscount(subtotal, discount) {
    if (!discount || !discount.active) {
      return {
        discountAmount: 0,
        discountPercent: 0,
        discountCode: null,
        finalAmount: subtotal
      };
    }

    let discountAmount = 0;
    
    if (discount.type === 'percentage') {
      discountAmount = subtotal * (discount.value / 100);
    } else if (discount.type === 'fixed') {
      discountAmount = Math.min(discount.value, subtotal);
    }

    // Apply minimum order requirements
    if (discount.minimumOrder && subtotal < discount.minimumOrder) {
      return {
        discountAmount: 0,
        discountPercent: 0,
        discountCode: discount.code,
        finalAmount: subtotal,
        error: `Minimum order of $${discount.minimumOrder} required`
      };
    }

    const finalAmount = Math.max(0, subtotal - discountAmount);

    return {
      discountAmount: discountAmount,
      discountPercent: discount.type === 'percentage' ? discount.value : (discountAmount / subtotal) * 100,
      discountCode: discount.code,
      finalAmount: finalAmount
    };
  }

  /**
   * Determine order type based on cart contents
   * @param {Array} cartItems - Array of cart items
   * @returns {Object} Order type analysis
   */
  static determineOrderType(cartItems) {
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return {
        orderType: 'empty',
        hasTickets: false,
        hasDonations: false,
        hasMerchandise: false,
        itemTypes: []
      };
    }

    const hasTickets = cartItems.some(item => item.type === 'ticket');
    const hasDonations = cartItems.some(item => item.type === 'donation');
    const hasMerchandise = cartItems.some(item => item.type === 'merchandise');
    
    const itemTypes = [...new Set(cartItems.map(item => item.type))];

    let orderType = 'mixed';
    if (hasDonations && !hasTickets && !hasMerchandise) {
      orderType = 'donation';
    } else if (hasTickets && !hasDonations && !hasMerchandise) {
      orderType = 'tickets';
    } else if (hasMerchandise && !hasTickets && !hasDonations) {
      orderType = 'merchandise';
    }

    return {
      orderType: orderType,
      hasTickets: hasTickets,
      hasDonations: hasDonations,
      hasMerchandise: hasMerchandise,
      itemTypes: itemTypes
    };
  }

  /**
   * Convert price to Stripe cents format
   * @param {number} price - Price in dollars
   * @returns {number} Price in cents
   */
  static convertToStripeCents(price) {
    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      return 0;
    }
    
    return Math.round(price * 100);
  }

  /**
   * Convert price from Stripe cents format
   * @param {number} cents - Price in cents
   * @returns {number} Price in dollars
   */
  static convertFromStripeCents(cents) {
    if (typeof cents !== 'number' || isNaN(cents) || cents < 0) {
      return 0;
    }
    
    return cents / 100;
  }

  /**
   * Validate cart for checkout
   * @param {Array} cartItems - Array of cart items
   * @returns {Object} Validation result
   */
  static validateCartForCheckout(cartItems) {
    const errors = [];
    
    if (!cartItems || !Array.isArray(cartItems)) {
      errors.push('Cart items must be an array');
      return { valid: false, errors };
    }

    if (cartItems.length === 0) {
      errors.push('Cart cannot be empty');
      return { valid: false, errors };
    }

    const calculation = this.calculateCartTotal(cartItems);
    
    if (calculation.total <= 0) {
      errors.push('Cart total must be greater than zero');
    }

    // Validate each item
    cartItems.forEach((item, index) => {
      const itemValidation = this.calculateItemTotal(item);
      if (!itemValidation.valid) {
        errors.push(`Item ${index + 1}: ${itemValidation.error}`);
      }

      if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
        errors.push(`Item ${index + 1}: Name is required`);
      }

      if (!item.type || !['ticket', 'donation', 'merchandise'].includes(item.type)) {
        errors.push(`Item ${index + 1}: Invalid item type`);
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      calculation: calculation
    };
  }
}