/**
 * Bootstrap JSON Schema Validator
 *
 * Comprehensive validation for config/bootstrap.json structure and data integrity.
 * Validates events, ticket types, foreign keys, and business rules.
 */

import { logger } from './logger.js';

/**
 * Validation result structure
 */
class ValidationResult {
  constructor() {
    this.isValid = true;
    this.errors = [];
    this.warnings = [];
  }

  addError(field, message) {
    this.isValid = false;
    this.errors.push({ field, message });
  }

  addWarning(field, message) {
    this.warnings.push({ field, message });
  }

  getReport() {
    return {
      isValid: this.isValid,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

/**
 * Bootstrap Schema Validator
 */
export class BootstrapSchemaValidator {
  constructor() {
    // Allowed values for enums (must match database CHECK constraints)
    // Events table: migration 019 CHECK(status IN ('draft', 'upcoming', 'active', 'completed', 'cancelled'))
    this.allowedEventStatuses = ['draft', 'upcoming', 'active', 'completed', 'cancelled'];
    this.allowedEventTypes = ['festival', 'weekender', 'workshop', 'social'];
    // Ticket_types table: migration 042 CHECK(status IN ('available', 'sold-out', 'coming-soon', 'closed', 'test'))
    this.allowedTicketStatuses = ['available', 'sold-out', 'coming-soon', 'closed', 'test'];
    this.allowedCurrencies = ['USD', 'EUR', 'GBP', 'CAD'];
  }

  /**
   * Main validation entry point
   */
  validate(data) {
    const result = new ValidationResult();

    // Validate top-level structure
    this.validateTopLevel(data, result);

    if (!result.isValid) {
      return result.getReport();
    }

    // Validate metadata
    this.validateMetadata(data.metadata || {}, result);

    // Validate events
    this.validateEvents(data.events || {}, result);

    // Validate ticket types
    this.validateTicketTypes(data.ticket_types || {}, result);

    // Validate foreign key relationships
    this.validateForeignKeys(data, result);

    // Validate business rules
    this.validateBusinessRules(data, result);

    return result.getReport();
  }

  /**
   * Validate top-level structure
   */
  validateTopLevel(data, result) {
    // Required top-level fields
    if (!data.version) {
      result.addError('version', 'Missing required field');
    } else if (typeof data.version !== 'string') {
      result.addError('version', 'Must be a string');
    } else if (!/^\d+\.\d+\.\d+$/.test(data.version)) {
      result.addError('version', 'Must be in semver format (e.g., "1.0.0")');
    }

    if (!data.events) {
      result.addError('events', 'Missing required field');
    } else if (typeof data.events !== 'object') {
      result.addError('events', 'Must be an array or object');
    }

    if (!data.ticket_types) {
      result.addError('ticket_types', 'Missing required field');
    } else if (typeof data.ticket_types !== 'object') {
      result.addError('ticket_types', 'Must be an array or object');
    }

    if (data.generated && typeof data.generated !== 'string') {
      result.addError('generated', 'Must be a string (ISO date format)');
    }

    if (data.description && typeof data.description !== 'string') {
      result.addError('description', 'Must be a string');
    }
  }

  /**
   * Validate metadata section
   */
  validateMetadata(metadata, result) {
    if (!metadata || Object.keys(metadata).length === 0) {
      result.addWarning('metadata', 'Metadata section is empty or missing');
      return;
    }

    // Validate currency
    if (metadata.currency) {
      if (!this.allowedCurrencies.includes(metadata.currency)) {
        result.addError(
          'metadata.currency',
          `Invalid currency. Allowed: ${this.allowedCurrencies.join(', ')}`
        );
      }
    } else {
      result.addWarning('metadata.currency', 'Currency not specified, will default to USD');
    }

    // Validate timezone
    if (metadata.timezone && typeof metadata.timezone !== 'string') {
      result.addError('metadata.timezone', 'Must be a string');
    }

    // Validate max_tickets_per_transaction
    if (metadata.max_tickets_per_transaction !== undefined) {
      if (!Number.isInteger(metadata.max_tickets_per_transaction) ||
          metadata.max_tickets_per_transaction < 1) {
        result.addError('metadata.max_tickets_per_transaction', 'Must be a positive integer');
      }
    }

    // Validate status arrays
    if (metadata.ticket_statuses) {
      if (!Array.isArray(metadata.ticket_statuses)) {
        result.addError('metadata.ticket_statuses', 'Must be an array');
      }
    }

    if (metadata.event_statuses) {
      if (!Array.isArray(metadata.event_statuses)) {
        result.addError('metadata.event_statuses', 'Must be an array');
      }
    }
  }

  /**
   * Normalize events to array format for validation
   */
  normalizeToArray(data) {
    const events = Array.isArray(data) ? data : Object.values(data);
    return events;
  }

  /**
   * Validate events section (supports both array and object formats)
   */
  validateEvents(events, result) {
    const eventsArray = this.normalizeToArray(events);

    if (eventsArray.length === 0) {
      result.addError('events', 'Must contain at least one event');
      return;
    }

    for (let i = 0; i < eventsArray.length; i++) {
      const event = eventsArray[i];
      const prefix = Array.isArray(events) ? `events[${i}]` : `events.${event.id || i}`;

      // Validate event ID
      if (event.id === undefined) {
        result.addError(`${prefix}.id`, 'Missing required field');
      } else if (!Number.isInteger(event.id)) {
        result.addError(`${prefix}.id`, 'Must be an integer');
      }

      // Validate required fields
      this.validateRequiredField(event, 'name', 'string', prefix, result);
      this.validateRequiredField(event, 'slug', 'string', prefix, result);
      this.validateRequiredField(event, 'status', 'string', prefix, result);
      this.validateRequiredField(event, 'start_date', 'string', prefix, result);

      // Validate slug format
      if (event.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.slug)) {
        result.addError(`${prefix}.slug`, 'Must be lowercase with hyphens only (e.g., "event-2026")');
      }

      // Validate status enum
      if (event.status && !this.allowedEventStatuses.includes(event.status)) {
        result.addError(
          `${prefix}.status`,
          `Invalid status. Allowed: ${this.allowedEventStatuses.join(', ')}`
        );
      }

      // Validate type enum
      if (event.type) {
        if (!this.allowedEventTypes.includes(event.type)) {
          result.addError(
            `${prefix}.type`,
            `Invalid type. Allowed: ${this.allowedEventTypes.join(', ')}`
          );
        }
      } else {
        result.addWarning(`${prefix}.type`, 'Type not specified, will default to "festival"');
      }

      // Validate dates
      this.validateDate(event.start_date, `${prefix}.start_date`, result);

      if (event.end_date) {
        this.validateDate(event.end_date, `${prefix}.end_date`, result);

        // Validate end_date >= start_date
        if (event.start_date && event.end_date) {
          const startDate = new Date(event.start_date);
          const endDate = new Date(event.end_date);

          if (endDate < startDate) {
            result.addError(
              `${prefix}.end_date`,
              `End date (${event.end_date}) must be >= start date (${event.start_date})`
            );
          }
        }
      }

      // Validate optional fields
      if (event.description && typeof event.description !== 'string') {
        result.addError(`${prefix}.description`, 'Must be a string');
      }

      if (event.venue && typeof event.venue !== 'string') {
        result.addError(`${prefix}.venue`, 'Must be a string');
      }

      if (event.display_order !== undefined) {
        if (!Number.isInteger(event.display_order) || event.display_order < 0) {
          result.addError(`${prefix}.display_order`, 'Must be a non-negative integer');
        }
      }

      if (event.is_featured !== undefined && typeof event.is_featured !== 'boolean') {
        result.addError(`${prefix}.is_featured`, 'Must be a boolean');
      }

      if (event.is_visible !== undefined && typeof event.is_visible !== 'boolean') {
        result.addError(`${prefix}.is_visible`, 'Must be a boolean');
      }
    }
  }

  /**
   * Validate ticket types section (supports both array and object formats)
   */
  validateTicketTypes(ticketTypes, result) {
    const ticketTypesArray = this.normalizeToArray(ticketTypes);

    if (ticketTypesArray.length === 0) {
      result.addError('ticket_types', 'Must contain at least one ticket type');
      return;
    }

    for (let i = 0; i < ticketTypesArray.length; i++) {
      const ticket = ticketTypesArray[i];
      const prefix = Array.isArray(ticketTypes) ? `ticket_types[${i}]` : `ticket_types.${ticket.id || i}`;

      // Validate ticket ID
      if (ticket.id === undefined) {
        result.addError(`${prefix}.id`, 'Missing required field');
      } else if (typeof ticket.id !== 'string') {
        result.addError(`${prefix}.id`, 'Must be a string');
      }

      // Validate required fields
      this.validateRequiredField(ticket, 'name', 'string', prefix, result);
      this.validateRequiredField(ticket, 'status', 'string', prefix, result);

      // Validate event_id (can be negative for test events)
      if (ticket.event_id === undefined) {
        result.addError(`${prefix}.event_id`, 'Missing required field');
      } else if (!Number.isInteger(ticket.event_id)) {
        result.addError(`${prefix}.event_id`, 'Must be an integer');
      }

      // Validate status enum
      if (ticket.status && !this.allowedTicketStatuses.includes(ticket.status)) {
        result.addError(
          `${prefix}.status`,
          `Invalid status. Allowed: ${this.allowedTicketStatuses.join(', ')}`
        );
      }

      // Validate price_cents
      if (ticket.price_cents !== null && ticket.price_cents !== undefined) {
        if (!Number.isInteger(ticket.price_cents)) {
          result.addError(`${prefix}.price_cents`, 'Must be an integer or null');
        } else if (ticket.price_cents < 0) {
          result.addError(`${prefix}.price_cents`, 'Must be >= 0');
        }
      } else if (ticket.status === 'available') {
        result.addWarning(
          `${prefix}.price_cents`,
          'Available ticket has null price - ensure this is intentional'
        );
      }

      // Validate optional fields
      if (ticket.description && typeof ticket.description !== 'string') {
        result.addError(`${prefix}.description`, 'Must be a string');
      }

      if (ticket.sort_order !== undefined) {
        if (!Number.isInteger(ticket.sort_order) || ticket.sort_order < 0) {
          result.addError(`${prefix}.sort_order`, 'Must be a non-negative integer');
        }
      }

      if (ticket.max_quantity !== undefined && ticket.max_quantity !== null) {
        if (!Number.isInteger(ticket.max_quantity) || ticket.max_quantity <= 0) {
          result.addError(`${prefix}.max_quantity`, 'Must be a positive integer or null');
        }
      }

      if (ticket.sold_count !== undefined) {
        if (!Number.isInteger(ticket.sold_count) || ticket.sold_count < 0) {
          result.addError(`${prefix}.sold_count`, 'Must be a non-negative integer');
        }
      }

      if (ticket.stripe_price_id && typeof ticket.stripe_price_id !== 'string') {
        result.addError(`${prefix}.stripe_price_id`, 'Must be a string');
      }
    }
  }

  /**
   * Validate foreign key relationships
   */
  validateForeignKeys(data, result) {
    const { events, ticket_types } = data;

    if (!events || !ticket_types) {
      return; // Already caught in top-level validation
    }

    // Normalize to arrays
    const eventsArray = this.normalizeToArray(events);
    const ticketTypesArray = this.normalizeToArray(ticket_types);

    // Collect valid event IDs
    const validEventIds = new Set(
      eventsArray
        .filter(event => event.id !== undefined)
        .map(event => event.id)
    );

    // Validate each ticket's event_id references a valid event
    for (let i = 0; i < ticketTypesArray.length; i++) {
      const ticket = ticketTypesArray[i];
      const prefix = Array.isArray(ticket_types) ? `ticket_types[${i}]` : `ticket_types.${ticket.id || i}`;

      if (ticket.event_id !== undefined && !validEventIds.has(ticket.event_id)) {
        result.addError(
          `${prefix}.event_id`,
          `References non-existent event ID ${ticket.event_id}. Valid event IDs: ${Array.from(validEventIds).join(', ')}`
        );
      }
    }
  }

  /**
   * Validate business rules
   */
  validateBusinessRules(data, result) {
    const { events, ticket_types } = data;

    if (!events || !ticket_types) {
      return;
    }

    // Normalize to arrays
    const eventsArray = this.normalizeToArray(events);
    const ticketTypesArray = this.normalizeToArray(ticket_types);

    // Check for duplicate slugs
    const slugs = new Map();
    for (let i = 0; i < eventsArray.length; i++) {
      const event = eventsArray[i];
      const prefix = Array.isArray(events) ? `events[${i}]` : `events.${event.id || i}`;

      if (event.slug) {
        if (slugs.has(event.slug)) {
          result.addError(
            `${prefix}.slug`,
            `Duplicate slug "${event.slug}" found in event ${slugs.get(event.slug)}`
          );
        } else {
          slugs.set(event.slug, prefix);
        }
      }
    }

    // Check that each event has at least one ticket type
    const eventIdsWithTickets = new Set(
      ticketTypesArray
        .filter(ticket => ticket.event_id !== undefined)
        .map(ticket => ticket.event_id)
    );

    for (let i = 0; i < eventsArray.length; i++) {
      const event = eventsArray[i];
      const prefix = Array.isArray(events) ? `events[${i}]` : `events.${event.id || i}`;

      if (event.id !== undefined && !eventIdsWithTickets.has(event.id)) {
        result.addWarning(
          `${prefix}`,
          `Event has no ticket types defined`
        );
      }
    }

    // Check for logical inconsistencies in ticket pricing
    for (let i = 0; i < ticketTypesArray.length; i++) {
      const ticket = ticketTypesArray[i];
      const prefix = Array.isArray(ticket_types) ? `ticket_types[${i}]` : `ticket_types.${ticket.id || i}`;
      // Warn if sold_count exceeds max_quantity
      if (ticket.sold_count !== undefined &&
          ticket.max_quantity !== undefined &&
          ticket.max_quantity !== null &&
          ticket.sold_count > ticket.max_quantity) {
        result.addWarning(
          `${prefix}.sold_count`,
          `Sold count (${ticket.sold_count}) exceeds max quantity (${ticket.max_quantity})`
        );
      }

      // Warn if available ticket has no price and no Stripe price ID
      if (ticket.status === 'available' &&
          (ticket.price_cents === null || ticket.price_cents === undefined) &&
          !ticket.stripe_price_id) {
        result.addWarning(
          `${prefix}`,
          'Available ticket has no price_cents and no stripe_price_id'
        );
      }
    }
  }

  /**
   * Helper: Validate required field
   */
  validateRequiredField(obj, field, type, prefix, result) {
    if (obj[field] === undefined || obj[field] === null) {
      result.addError(`${prefix}.${field}`, 'Missing required field');
    } else if (typeof obj[field] !== type) {
      result.addError(`${prefix}.${field}`, `Must be a ${type}`);
    } else if (type === 'string' && obj[field].trim() === '') {
      result.addError(`${prefix}.${field}`, 'Must not be empty');
    }
  }

  /**
   * Helper: Validate ISO date format
   */
  validateDate(dateString, fieldPath, result) {
    if (!dateString) return;

    // Check ISO format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      result.addError(fieldPath, 'Must be in ISO date format (YYYY-MM-DD)');
      return;
    }

    // Parse components
    const [year, month, day] = dateString.split('-').map(Number);

    // Validate ranges
    if (month < 1 || month > 12) {
      result.addError(fieldPath, `Invalid month: ${month} (must be 1-12)`);
      return;
    }

    if (day < 1 || day > 31) {
      result.addError(fieldPath, `Invalid day: ${day} (must be 1-31)`);
      return;
    }

    // Check if valid date using Date object (this catches Feb 30, etc.)
    const date = new Date(dateString + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
      result.addError(fieldPath, `Invalid date: ${dateString}`);
      return;
    }

    // Verify the date components match (catches overflow like Feb 30 -> Mar 2)
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth() + 1;
    const utcDay = date.getUTCDate();

    if (utcYear !== year || utcMonth !== month || utcDay !== day) {
      result.addError(fieldPath, `Invalid date: ${dateString} (e.g., month/day overflow)`);
    }
  }

  /**
   * Log validation report
   */
  logReport(report) {
    if (report.isValid) {
      logger.log('✅ Bootstrap validation passed');
      if (report.warningCount > 0) {
        logger.warn(`⚠️  ${report.warningCount} warning(s) found:`);
        report.warnings.forEach(({ field, message }) => {
          logger.warn(`   - ${field}: ${message}`);
        });
      }
    } else {
      logger.error('❌ Bootstrap validation failed');
      logger.error(`   Errors: ${report.errorCount}`);
      report.errors.forEach(({ field, message }) => {
        logger.error(`   - ${field}: ${message}`);
      });

      if (report.warningCount > 0) {
        logger.warn(`\n⚠️  Warnings: ${report.warningCount}`);
        report.warnings.forEach(({ field, message }) => {
          logger.warn(`   - ${field}: ${message}`);
        });
      }
    }
  }
}

// Export singleton instance
export const bootstrapSchemaValidator = new BootstrapSchemaValidator();