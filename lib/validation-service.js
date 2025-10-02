/**
 * Validation Service
 * Centralized input validation and sanitization for admin APIs
 */

class ValidationService {
  constructor() {
    this.config = {
      maxEmailLength: 254,
      maxNameLength: 100,
      maxSearchLength: parseInt(process.env.ADMIN_MAX_SEARCH_LENGTH) || 100,
      maxQueryLimit: parseInt(process.env.ADMIN_MAX_QUERY_LIMIT) || 1000,
      maxQueryOffset: parseInt(process.env.ADMIN_MAX_QUERY_OFFSET) || 10000,
      minAmount: 0.01,
      maxAmount: 10000,
    };

    // Define allowed values for enum-like fields
    this.allowedValues = {
      ticketStatuses: [
        "active",
        "cancelled",
        "refunded",
        "pending",
        "valid",
        "used",
        "transferred",
      ],
      ticketTypes: [
        "full_pass",
        "workshop_only",
        "social_only",
        "single_workshop",
      ],
      transactionStatuses: [
        "pending",
        "paid",
        "failed",
        "cancelled",
        "refunded",
        "completed",
      ],
      transactionTypes: ["tickets", "donations", "merchandise", "donation"],
      paymentMethods: ["stripe", "paypal"],
      sortDirections: ["ASC", "DESC"],
      adminActions: ["checkin", "undo_checkin", "update", "cancel"],
      booleanStrings: ["true", "false"],
    };

    this.allowedSortColumns = {
      registrations: [
        "created_at",
        "attendee_last_name",
        "ticket_type",
        "checked_in_at",
        "status",
      ],
      transactions: [
        "created_at",
        "customer_email",
        "amount_cents",
        "status",
        "type",
      ],
    };
  }

  /**
   * Validate and sanitize pagination parameters
   * @param {Object} params - Query parameters
   * @returns {Object} Sanitized pagination parameters
   */
  validatePagination(params = {}) {
    const { limit = 50, offset = 0 } = params;

    return {
      limit: Math.min(
        Math.max(parseInt(limit) || 50, 1),
        this.config.maxQueryLimit,
      ),
      offset: Math.min(
        Math.max(parseInt(offset) || 0, 0),
        this.config.maxQueryOffset,
      ),
    };
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {Object} Validation result
   */
  validateEmail(email) {
    if (!email) {
      return { isValid: true }; // Email is optional in many contexts
    }

    if (typeof email !== "string") {
      return { isValid: false, error: "Email must be a string" };
    }

    if (email.length > this.config.maxEmailLength) {
      return {
        isValid: false,
        error: `Email must be ${this.config.maxEmailLength} characters or less`,
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { isValid: false, error: "Invalid email format" };
    }

    return { isValid: true };
  }

  /**
   * Validate search term
   * @param {string} search - Search term to validate
   * @returns {Object} Validation result
   */
  validateSearch(search) {
    if (!search) {
      return { isValid: true }; // Search is optional
    }

    if (typeof search !== "string") {
      return { isValid: false, error: "Search term must be a string" };
    }

    if (search.length > this.config.maxSearchLength) {
      return {
        isValid: false,
        error: `Search term must be ${this.config.maxSearchLength} characters or less`,
      };
    }

    return { isValid: true };
  }

  /**
   * Sanitize search term for SQL LIKE queries
   * @param {string} search - Search term to sanitize
   * @returns {string} Sanitized search term
   */
  sanitizeSearchTerm(search) {
    if (!search) return null;
    // Escape SQL LIKE special characters
    return `%${search.replace(/[%_]/g, "\\$&")}%`;
  }

  /**
   * Validate enum value
   * @param {string} value - Value to validate
   * @param {string} fieldName - Name of the field (for error messages)
   * @param {string} allowedKey - Key for allowed values lookup
   * @returns {Object} Validation result
   */
  validateEnum(value, fieldName, allowedKey) {
    if (!value) {
      return { isValid: true }; // Most enum fields are optional
    }

    const allowedValues = this.allowedValues[allowedKey];
    if (!allowedValues) {
      return { isValid: false, error: `Unknown validation key: ${allowedKey}` };
    }

    if (!allowedValues.includes(value)) {
      return {
        isValid: false,
        error: `Invalid ${fieldName} value`,
        allowedValues: allowedValues,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate sort parameters
   * @param {string} sortBy - Column to sort by
   * @param {string} sortOrder - Sort direction
   * @param {string} context - Context for allowed columns (registrations, transactions)
   * @returns {Object} Validation result
   */
  validateSort(sortBy = "created_at", sortOrder = "DESC", context) {
    const allowedColumns = this.allowedSortColumns[context] || ["created_at"];

    if (!allowedColumns.includes(sortBy)) {
      return {
        isValid: false,
        error: "Invalid sort column",
        allowedValues: allowedColumns,
      };
    }

    const normalizedOrder = sortOrder.toUpperCase();
    if (!this.allowedValues.sortDirections.includes(normalizedOrder)) {
      return {
        isValid: false,
        error: "Invalid sort direction",
        allowedValues: this.allowedValues.sortDirections,
      };
    }

    return {
      isValid: true,
      sortBy,
      sortOrder: normalizedOrder,
    };
  }

  /**
   * Validate amount (for transactions)
   * @param {any} amount - Amount to validate
   * @returns {Object} Validation result
   */
  validateAmount(amount) {
    if (amount === undefined || amount === null) {
      return { isValid: false, error: "Amount is required" };
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      return { isValid: false, error: "Amount must be a valid number" };
    }

    if (
      numAmount < this.config.minAmount ||
      numAmount > this.config.maxAmount
    ) {
      return {
        isValid: false,
        error: `Amount must be between ${this.config.minAmount} and ${this.config.maxAmount}`,
      };
    }

    return { isValid: true, amount: numAmount };
  }

  /**
   * Validate name fields
   * @param {string} name - Name to validate
   * @param {string} fieldName - Field name for error messages
   * @returns {Object} Validation result
   */
  validateName(name, fieldName = "Name") {
    if (!name) {
      return { isValid: true }; // Names are usually optional
    }

    if (typeof name !== "string") {
      return { isValid: false, error: `${fieldName} must be a string` };
    }

    if (name.length > this.config.maxNameLength) {
      return {
        isValid: false,
        error: `${fieldName} must be ${this.config.maxNameLength} characters or less`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate ticket ID format
   * @param {string} ticketId - Ticket ID to validate
   * @returns {Object} Validation result
   */
  validateTicketId(ticketId) {
    if (!ticketId) {
      return { isValid: false, error: "Ticket ID is required" };
    }

    if (typeof ticketId !== "string") {
      return { isValid: false, error: "Ticket ID must be a string" };
    }

    // Ticket IDs should be reasonable length (adjust based on your format)
    if (ticketId.length < 5 || ticketId.length > 50) {
      return { isValid: false, error: "Invalid ticket ID format" };
    }

    return { isValid: true };
  }

  /**
   * Validate positive integer
   * @param {any} value - Value to validate
   * @param {string} fieldName - Field name for error messages
   * @returns {Object} Validation result
   */
  validatePositiveInteger(value, fieldName = "Value") {
    if (!value) {
      return { isValid: true }; // Most integer fields are optional
    }

    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue <= 0) {
      return {
        isValid: false,
        error: `${fieldName} must be a positive integer`,
      };
    }

    return { isValid: true, value: numValue };
  }

  /**
   * Validate any integer (positive or negative)
   * Used for event IDs which can be negative for test events
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name for error messages
   * @returns {Object} Validation result
   */
  validateInteger(value, fieldName = "Value") {
    if (!value) {
      return { isValid: true }; // Most integer fields are optional
    }

    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      return {
        isValid: false,
        error: `${fieldName} must be an integer`,
      };
    }

    return { isValid: true, value: numValue };
  }

  /**
   * Validate admin action
   * @param {string} action - Action to validate
   * @returns {Object} Validation result
   */
  validateAdminAction(action) {
    return this.validateEnum(action, "action", "adminActions");
  }

  /**
   * Comprehensive validation for registration search parameters
   * @param {Object} params - Request query parameters
   * @returns {Object} Validation result with sanitized values
   */
  validateRegistrationSearchParams(params = {}) {
    const errors = [];
    const sanitized = {};

    // Validate pagination
    const pagination = this.validatePagination(params);
    sanitized.limit = pagination.limit;
    sanitized.offset = pagination.offset;

    // Validate search
    const searchValidation = this.validateSearch(params.search);
    if (!searchValidation.isValid) {
      errors.push(searchValidation.error);
    } else if (params.search) {
      sanitized.search = params.search;
      sanitized.searchTerm = this.sanitizeSearchTerm(params.search);
    }

    // Validate status
    const statusValidation = this.validateEnum(
      params.status,
      "status",
      "ticketStatuses",
    );
    if (!statusValidation.isValid) {
      errors.push(statusValidation.error);
    } else if (params.status) {
      sanitized.status = params.status;
    }

    // Validate ticket type
    const typeValidation = this.validateEnum(
      params.ticketType,
      "ticket type",
      "ticketTypes",
    );
    if (!typeValidation.isValid) {
      errors.push(typeValidation.error);
    } else if (params.ticketType) {
      sanitized.ticketType = params.ticketType;
    }

    // Validate checkedIn boolean
    const checkedInValidation = this.validateEnum(
      params.checkedIn,
      "checkedIn",
      "booleanStrings",
    );
    if (!checkedInValidation.isValid) {
      errors.push(checkedInValidation.error);
    } else if (params.checkedIn !== undefined && params.checkedIn !== null) {
      // Convert string to boolean - handle both "true" and "false" explicitly
      sanitized.checkedIn = params.checkedIn === "true" ? "true" : "false";
    }

    // Validate eventId (optional) - accepts negative IDs for test events
    if (params.eventId) {
      const eventIdValidation = this.validateInteger(params.eventId, "eventId");
      if (!eventIdValidation.isValid) {
        errors.push(eventIdValidation.error);
      } else {
        sanitized.eventId = eventIdValidation.value;
      }
    }

    // Validate payment method (optional)
    const paymentMethodValidation = this.validateEnum(
      params.paymentMethod,
      "payment method",
      "paymentMethods"
    );
    if (!paymentMethodValidation.isValid) {
      errors.push(paymentMethodValidation.error);
    } else if (params.paymentMethod) {
      sanitized.paymentMethod = params.paymentMethod;
    }

    // Validate sort parameters
    const sortValidation = this.validateSort(
      params.sortBy,
      params.sortOrder,
      "registrations",
    );
    if (!sortValidation.isValid) {
      errors.push(sortValidation.error);
    } else {
      sanitized.sortBy = sortValidation.sortBy;
      sanitized.sortOrder = sortValidation.sortOrder;
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized,
    };
  }

  /**
   * Comprehensive validation for transaction search parameters
   * @param {Object} params - Request query parameters
   * @returns {Object} Validation result with sanitized values
   */
  validateTransactionSearchParams(params = {}) {
    const errors = [];
    const sanitized = {};

    // Validate pagination
    const pagination = this.validatePagination(params);
    sanitized.limit = pagination.limit;
    sanitized.offset = pagination.offset;

    // Validate email
    if (params.email) {
      const emailValidation = this.validateEmail(params.email);
      if (!emailValidation.isValid) {
        errors.push(emailValidation.error);
      } else {
        sanitized.email = params.email;
      }
    }

    // Validate status
    const statusValidation = this.validateEnum(
      params.status,
      "status",
      "transactionStatuses",
    );
    if (!statusValidation.isValid) {
      errors.push(statusValidation.error);
    } else if (params.status) {
      sanitized.status = params.status;
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized,
    };
  }
}

// Export singleton instance
let validationServiceInstance = null;

/**
 * Get validation service singleton instance
 * @returns {ValidationService} Validation service instance
 */
export function getValidationService() {
  if (!validationServiceInstance) {
    validationServiceInstance = new ValidationService();
  }
  return validationServiceInstance;
}

export { ValidationService };
