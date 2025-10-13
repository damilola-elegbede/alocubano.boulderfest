/**
 * Stripe Order Mapper Domain Service
 * Handles mapping domain objects to Stripe API format
 */

export class StripeOrderMapper {
  /**
   * Map cart items to Stripe line items
   * @param {Array} cartItems - Domain cart items
   * @returns {Array} Stripe line items
   */
  static mapCartItemsToStripeLineItems(cartItems) {
    if (!cartItems || !Array.isArray(cartItems)) {
      throw new Error('Cart items must be an array');
    }

    return cartItems.map((item, index) => {
      try {
        return this.mapCartItemToStripeLineItem(item);
      } catch (error) {
        throw new Error(`Error mapping item ${index + 1}: ${error.message}`);
      }
    });
  }

  /**
   * Map single cart item to Stripe line item
   * @param {Object} item - Domain cart item
   * @returns {Object} Stripe line item
   */
  static mapCartItemToStripeLineItem(item) {
    if (!item || typeof item !== 'object') {
      throw new Error('Item must be an object');
    }

    if (!item.name || !item.hasOwnProperty('price') || !item.hasOwnProperty('quantity')) {
      throw new Error('Item must have name, price, and quantity');
    }

    if (item.quantity <= 0) {
      throw new Error('Item quantity must be greater than zero');
    }

    if (item.price < 0) {
      throw new Error('Item price cannot be negative');
    }

    // Convert to Stripe cents format
    const unitAmountCents = Math.round(item.price * 100);

    if (unitAmountCents <= 0) {
      throw new Error('Item price must be greater than zero');
    }

    // Generate description with default fallback for tickets
    let description = item.description;
    if (!description && item.type === 'ticket') {
      description = `A Lo Cubano Boulder Fest - ${item.name}`;
    }

    const lineItem = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: description
        },
        unit_amount: unitAmountCents
      },
      quantity: item.quantity
    };

    // Add metadata based on item type
    const metadata = this.buildItemMetadata(item);
    if (Object.keys(metadata).length > 0) {
      lineItem.price_data.product_data.metadata = metadata;
    }

    return lineItem;
  }

  /**
   * Build metadata for different item types
   * @param {Object} item - Domain cart item
   * @returns {Object} Metadata object
   */
  static buildItemMetadata(item) {
    const metadata = {
      type: item.type || 'unknown'
    };

    switch (item.type) {
      case 'ticket':
        // Default to 'general' if no ticketType specified
        metadata.ticket_type = item.ticketType || 'general';
        metadata.event_date = item.eventDate || '2026-05-15';
        if (item.eventTime) {
          metadata.event_time = item.eventTime;
        }
        if (item.venue) {
          metadata.venue = item.venue;
        }
        break;

      case 'donation':
        metadata.donation_category = item.category || 'general';
        if (item.purpose) {
          metadata.purpose = item.purpose;
        }
        if (item.taxDeductible !== undefined) {
          metadata.tax_deductible = item.taxDeductible.toString();
        }
        break;

      case 'merchandise':
        if (item.size) {
          metadata.size = item.size;
        }
        if (item.color) {
          metadata.color = item.color;
        }
        if (item.sku) {
          metadata.sku = item.sku;
        }
        break;
    }

    // Add custom attributes if present
    if (item.attributes && typeof item.attributes === 'object') {
      Object.keys(item.attributes).forEach(key => {
        if (typeof item.attributes[key] === 'string' || typeof item.attributes[key] === 'number') {
          metadata[`custom_${key}`] = item.attributes[key].toString();
        }
      });
    }

    return metadata;
  }

  /**
   * Map customer info to Stripe session options
   * @param {Object} customerInfo - Domain customer info
   * @returns {Object} Stripe session customer options
   */
  static mapCustomerInfoToStripeOptions(customerInfo) {
    const options = {};

    if (!customerInfo || typeof customerInfo !== 'object') {
      return options;
    }

    // Map email
    if (customerInfo.email) {
      options.customer_email = customerInfo.email;
    }

    // Map customer data for prefilling
    if (customerInfo.firstName || customerInfo.lastName) {
      options.customer_creation = 'if_required';

      if (!options.metadata) {
        options.metadata = {};
      }

      if (customerInfo.firstName) {
        options.metadata.customer_first_name = customerInfo.firstName;
      }

      if (customerInfo.lastName) {
        options.metadata.customer_last_name = customerInfo.lastName;
      }
    }

    // Map phone if provided
    if (customerInfo.phone) {
      if (!options.metadata) {
        options.metadata = {};
      }
      options.metadata.customer_phone = customerInfo.phone;
    }

    return options;
  }

  /**
   * Build session metadata
   * @param {Object} orderData - Order data
   * @returns {Object} Session metadata
   */
  static buildSessionMetadata(orderData) {
    const {
      orderId,
      orderType,
      customerInfo,
      environment,
      source
    } = orderData;

    const metadata = {};

    if (orderId) {
      metadata.orderId = orderId;
    }

    if (orderType) {
      metadata.orderType = orderType;
    }

    if (environment) {
      metadata.environment = environment;
    }

    if (source) {
      metadata.source = source;
    }

    // Add customer name if available
    if (customerInfo) {
      const customerName = this.buildCustomerName(customerInfo);
      if (customerName) {
        metadata.customerName = customerName;
      }
    }

    // Add timestamp
    metadata.created_at = new Date().toISOString();

    return metadata;
  }

  /**
   * Build customer full name
   * @param {Object} customerInfo - Customer information
   * @returns {string|null} Full name or null
   */
  static buildCustomerName(customerInfo) {
    if (!customerInfo || typeof customerInfo !== 'object') {
      return null;
    }

    const firstName = customerInfo.firstName?.trim();
    const lastName = customerInfo.lastName?.trim();

    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else if (lastName) {
      return lastName;
    }

    return null;
  }

  /**
   * Generate order ID
   * @param {string} prefix - Order ID prefix
   * @returns {string} Unique order ID
   */
  static generateOrderId(prefix = 'order') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Build success and cancel URLs
   * @param {string} origin - Request origin
   * @param {string} orderId - Order ID
   * @returns {Object} URL configuration
   */
  static buildRedirectUrls(origin, orderId) {
    if (!origin) {
      throw new Error('Origin is required');
    }

    // Ensure origin doesn't end with slash
    const baseOrigin = origin.replace(/\/$/, '');

    return {
      success_url: `${baseOrigin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseOrigin}/failure?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`
    };
  }

  /**
   * Map complete order to Stripe checkout session config
   * @param {Object} orderRequest - Complete order request
   * @returns {Object} Stripe checkout session configuration
   */
  static mapOrderToStripeSession(orderRequest) {
    const {
      cartItems,
      customerInfo,
      origin,
      orderId,
      orderType,
      environment
    } = orderRequest;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error('Cart items are required');
    }

    if (!origin) {
      throw new Error('Origin is required');
    }

    const sessionConfig = {
      payment_method_types: ['card', 'link'],
      mode: 'payment',
      billing_address_collection: 'required',
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    // Map line items
    try {
      sessionConfig.line_items = this.mapCartItemsToStripeLineItems(cartItems);
    } catch (error) {
      throw new Error(`Failed to map line items: ${error.message}`);
    }

    // Map customer options
    const customerOptions = this.mapCustomerInfoToStripeOptions(customerInfo);
    Object.assign(sessionConfig, customerOptions);

    // Build URLs
    const urlConfig = this.buildRedirectUrls(origin, orderId);
    Object.assign(sessionConfig, urlConfig);

    // Build metadata
    sessionConfig.metadata = this.buildSessionMetadata({
      orderId,
      orderType,
      customerInfo,
      environment
    });

    return sessionConfig;
  }

  /**
   * Validate Stripe line item
   * @param {Object} lineItem - Stripe line item
   * @returns {Object} Validation result
   */
  static validateStripeLineItem(lineItem) {
    const errors = [];

    if (!lineItem || typeof lineItem !== 'object') {
      errors.push('Line item must be an object');
      return { valid: false, errors };
    }

    if (!lineItem.price_data) {
      errors.push('Line item must have price_data');
    } else {
      if (!lineItem.price_data.currency) {
        errors.push('Currency is required');
      }

      if (!lineItem.price_data.unit_amount || lineItem.price_data.unit_amount <= 0) {
        errors.push('Unit amount must be greater than zero');
      }

      if (!lineItem.price_data.product_data) {
        errors.push('Product data is required');
      } else if (!lineItem.price_data.product_data.name) {
        errors.push('Product name is required');
      }
    }

    if (!lineItem.quantity || lineItem.quantity <= 0) {
      errors.push('Quantity must be greater than zero');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}