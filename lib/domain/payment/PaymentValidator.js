/**
 * Payment Validator Domain Service
 * Handles all payment input validation logic
 */

export class PaymentValidator {
  /**
   * Email validation regex
   */
  static EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Name validation regex (letters, spaces, hyphens, apostrophes, 2-50 chars)
   */
  static NAME_REGEX = /^[\p{L}\s\-']{2,50}$/u;

  /**
   * Validate cart items array
   * @param {Array} cartItems - Cart items to validate
   * @returns {Object} Validation result
   */
  static validateCartItems(cartItems) {
    const errors = [];

    if (!cartItems) {
      errors.push('Cart items are required');
      return { valid: false, errors };
    }

    if (!Array.isArray(cartItems)) {
      errors.push('Cart items must be an array');
      return { valid: false, errors };
    }

    if (cartItems.length === 0) {
      errors.push('Cart cannot be empty');
      return { valid: false, errors };
    }

    if (cartItems.length > 50) {
      errors.push('Too many items in cart (maximum 50)');
    }

    // Validate each item
    cartItems.forEach((item, index) => {
      const itemErrors = this.validateCartItem(item, index + 1);
      errors.push(...itemErrors);
    });

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate individual cart item
   * @param {Object} item - Cart item to validate
   * @param {number} itemNumber - Item number for error messages
   * @returns {Array} Array of error messages
   */
  static validateCartItem(item, itemNumber = 1) {
    const errors = [];

    if (!item || typeof item !== 'object') {
      errors.push(`Item ${itemNumber}: Must be an object`);
      return errors;
    }

    // Validate name
    if (!item.name) {
      errors.push(`Item ${itemNumber}: Name is required`);
    } else if (typeof item.name !== 'string') {
      errors.push(`Item ${itemNumber}: Name must be a string`);
    } else if (item.name.trim().length === 0) {
      errors.push(`Item ${itemNumber}: Name cannot be empty`);
    } else if (item.name.length > 200) {
      errors.push(`Item ${itemNumber}: Name too long (maximum 200 characters)`);
    }

    // Validate price
    if (!item.hasOwnProperty('price')) {
      errors.push(`Item ${itemNumber}: Price is required`);
    } else if (typeof item.price !== 'number') {
      errors.push(`Item ${itemNumber}: Price must be a number`);
    } else if (isNaN(item.price)) {
      errors.push(`Item ${itemNumber}: Price must be a valid number`);
    } else if (!Number.isFinite(item.price)) {
      errors.push(`Item ${itemNumber}: Price must be finite`);
    } else if (item.price < 0) {
      errors.push(`Item ${itemNumber}: Price cannot be negative`);
    } else if (item.price > 10000) {
      errors.push(`Item ${itemNumber}: Price too high (maximum $10,000)`);
    }

    // Validate quantity
    if (!item.hasOwnProperty('quantity')) {
      errors.push(`Item ${itemNumber}: Quantity is required`);
    } else if (!Number.isInteger(item.quantity)) {
      errors.push(`Item ${itemNumber}: Quantity must be an integer`);
    } else if (item.quantity <= 0) {
      errors.push(`Item ${itemNumber}: Quantity must be greater than zero`);
    } else if (item.quantity > 100) {
      errors.push(`Item ${itemNumber}: Quantity too high (maximum 100)`);
    }

    // Validate type
    const validTypes = ['ticket', 'donation', 'merchandise'];
    if (!item.type) {
      errors.push(`Item ${itemNumber}: Type is required`);
    } else if (!validTypes.includes(item.type)) {
      errors.push(`Item ${itemNumber}: Type must be one of: ${validTypes.join(', ')}`);
    }

    // Validate ticket-specific fields
    if (item.type === 'ticket') {
      if (item.ticketType && typeof item.ticketType !== 'string') {
        errors.push(`Item ${itemNumber}: Ticket type must be a string`);
      }

      if (item.eventDate && !this.isValidDate(item.eventDate)) {
        errors.push(`Item ${itemNumber}: Invalid event date format`);
      }
    }

    // Validate donation-specific fields
    if (item.type === 'donation') {
      if (item.category && typeof item.category !== 'string') {
        errors.push(`Item ${itemNumber}: Donation category must be a string`);
      }
    }

    // Validate optional description
    if (item.description && typeof item.description !== 'string') {
      errors.push(`Item ${itemNumber}: Description must be a string`);
    } else if (item.description && item.description.length > 500) {
      errors.push(`Item ${itemNumber}: Description too long (maximum 500 characters)`);
    }

    return errors;
  }

  /**
   * Validate customer information
   * @param {Object} customerInfo - Customer information to validate
   * @returns {Object} Validation result
   */
  static validateCustomerInfo(customerInfo) {
    const errors = [];

    // Customer info is optional, but if provided must be valid
    if (!customerInfo) {
      return { valid: true, errors: [] };
    }

    if (typeof customerInfo !== 'object') {
      errors.push('Customer info must be an object');
      return { valid: false, errors };
    }

    // Validate email if provided
    if (customerInfo.email) {
      const emailErrors = this.validateEmail(customerInfo.email);
      errors.push(...emailErrors);
    }

    // Validate first name if provided
    if (customerInfo.firstName) {
      const firstNameErrors = this.validateName(customerInfo.firstName, 'First name');
      errors.push(...firstNameErrors);
    }

    // Validate last name if provided
    if (customerInfo.lastName) {
      const lastNameErrors = this.validateName(customerInfo.lastName, 'Last name');
      errors.push(...lastNameErrors);
    }

    // Validate phone if provided
    if (customerInfo.phone) {
      const phoneErrors = this.validatePhone(customerInfo.phone);
      errors.push(...phoneErrors);
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @returns {Array} Array of error messages
   */
  static validateEmail(email) {
    const errors = [];

    if (!email) {
      errors.push('Email is required');
      return errors;
    }

    if (typeof email !== 'string') {
      errors.push('Email must be a string');
      return errors;
    }

    const trimmedEmail = email.trim();

    if (trimmedEmail.length === 0) {
      errors.push('Email cannot be empty');
    } else if (trimmedEmail.length > 254) {
      errors.push('Email too long (maximum 254 characters)');
    } else if (!this.EMAIL_REGEX.test(trimmedEmail)) {
      errors.push('Invalid email format');
    } else if (trimmedEmail.includes('..')) {
      errors.push('Email cannot contain consecutive dots');
    } else if (trimmedEmail.startsWith('.') || trimmedEmail.endsWith('.')) {
      errors.push('Email cannot start or end with a dot');
    }

    return errors;
  }

  /**
   * Validate name (first name, last name)
   * @param {string} name - Name to validate
   * @param {string} fieldName - Field name for error messages
   * @returns {Array} Array of error messages
   */
  static validateName(name, fieldName = 'Name') {
    const errors = [];

    if (!name) {
      errors.push(`${fieldName} is required`);
      return errors;
    }

    if (typeof name !== 'string') {
      errors.push(`${fieldName} must be a string`);
      return errors;
    }

    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      errors.push(`${fieldName} cannot be empty`);
    } else if (trimmedName.length < 2) {
      errors.push(`${fieldName} must be at least 2 characters`);
    } else if (trimmedName.length > 50) {
      errors.push(`${fieldName} too long (maximum 50 characters)`);
    } else if (!this.NAME_REGEX.test(trimmedName)) {
      errors.push(`${fieldName} can only contain letters, spaces, hyphens, and apostrophes`);
    }

    return errors;
  }

  /**
   * Validate phone number
   * @param {string} phone - Phone number to validate
   * @returns {Array} Array of error messages
   */
  static validatePhone(phone) {
    const errors = [];

    if (typeof phone !== 'string') {
      errors.push('Phone number must be a string');
      return errors;
    }

    const trimmedPhone = phone.trim();

    if (trimmedPhone.length === 0) {
      errors.push('Phone number cannot be empty');
    } else if (trimmedPhone.length > 50) {
      errors.push('Phone number too long (maximum 50 characters)');
    }

    // Basic phone validation - allows various formats
    const phoneRegex = /^[\d\s\-\(\)\+\.]{10,}$/;
    if (trimmedPhone.length > 0 && !phoneRegex.test(trimmedPhone)) {
      errors.push('Invalid phone number format');
    }

    return errors;
  }

  /**
   * Validate amount
   * @param {number} amount - Amount to validate
   * @param {string} fieldName - Field name for error messages
   * @returns {Object} Validation result
   */
  static validateAmount(amount, fieldName = 'Amount') {
    const errors = [];

    if (!amount && amount !== 0) {
      errors.push(`${fieldName} is required`);
      return { valid: false, errors };
    }

    if (typeof amount !== 'number') {
      errors.push(`${fieldName} must be a number`);
      return { valid: false, errors };
    }

    if (isNaN(amount)) {
      errors.push(`${fieldName} must be a valid number`);
    } else if (!Number.isFinite(amount)) {
      errors.push(`${fieldName} must be finite`);
    } else if (amount < 0) {
      errors.push(`${fieldName} cannot be negative`);
    } else if (amount > 1000000) {
      errors.push(`${fieldName} too high (maximum $1,000,000)`);
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate quantity
   * @param {number} quantity - Quantity to validate
   * @returns {Object} Validation result
   */
  static validateQuantity(quantity) {
    const errors = [];

    if (!quantity && quantity !== 0) {
      errors.push('Quantity is required');
      return { valid: false, errors };
    }

    if (!Number.isInteger(quantity)) {
      errors.push('Quantity must be an integer');
    } else if (quantity <= 0) {
      errors.push('Quantity must be greater than zero');
    } else if (quantity > 100) {
      errors.push('Quantity too high (maximum 100)');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Check if a string is a valid date
   * @param {string} dateString - Date string to validate
   * @returns {boolean} True if valid date
   */
  static isValidDate(dateString) {
    if (typeof dateString !== 'string') return false;

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Sanitize string input
   * @param {string} input - Input to sanitize
   * @param {number} maxLength - Maximum length
   * @returns {string} Sanitized string
   */
  static sanitizeString(input, maxLength = 500) {
    if (typeof input !== 'string') return '';

    return input.trim().slice(0, maxLength);
  }

  /**
   * Validate complete payment request
   * @param {Object} paymentRequest - Payment request to validate
   * @returns {Object} Validation result
   */
  static validatePaymentRequest(paymentRequest) {
    const errors = [];

    if (!paymentRequest || typeof paymentRequest !== 'object') {
      errors.push('Payment request must be an object');
      return { valid: false, errors };
    }

    // Validate cart items
    const cartValidation = this.validateCartItems(paymentRequest.cartItems);
    if (!cartValidation.valid) {
      errors.push(...cartValidation.errors);
    }

    // Validate customer info (optional)
    const customerValidation = this.validateCustomerInfo(paymentRequest.customerInfo);
    if (!customerValidation.valid) {
      errors.push(...customerValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}