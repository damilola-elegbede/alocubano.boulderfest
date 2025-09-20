import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';

export class RegistrationValidator {

  validateName(name, fieldName = 'name') {
    // Check presence and length
    if (!name || typeof name !== 'string') {
      throw new ValidationError(`${fieldName} is required`);
    }

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      throw new ValidationError(`${fieldName} must be 2-50 characters`);
    }

    // Character whitelist: letters, spaces, hyphens, apostrophes
    // Supports international characters
    const nameRegex = /^[\p{L}\p{M}\s'\-\.]+$/u;
    if (!nameRegex.test(trimmed)) {
      throw new ValidationError(`${fieldName} contains invalid characters`);
    }

    // Normalize whitespace
    const normalized = trimmed.replace(/\s+/g, ' ');

    // Check for potential XSS patterns
    if (this.containsXSSPatterns(normalized)) {
      throw new ValidationError(`${fieldName} contains prohibited content`);
    }

    // Check for SQL patterns
    if (this.containsSQLPatterns(normalized)) {
      throw new ValidationError(`${fieldName} contains prohibited content`);
    }

    // Sanitize for storage (HTML entity encoding)
    const sanitized = DOMPurify.sanitize(normalized, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });

    return sanitized;
  }

  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required');
    }

    const trimmed = email.trim().toLowerCase();

    // Use validator.js for RFC compliance
    if (!validator.isEmail(trimmed, {
      allow_utf8_local_part: false,
      require_tld: true,
      allow_ip_domain: false
    })) {
      throw new ValidationError('Invalid email format');
    }

    // Additional security checks
    if (trimmed.length > 254) { // RFC 5321
      throw new ValidationError('Email address too long');
    }

    // Check for malicious patterns
    if (this.containsXSSPatterns(trimmed) || this.containsSQLPatterns(trimmed)) {
      throw new ValidationError('Email contains prohibited content');
    }

    return trimmed;
  }

  containsXSSPatterns(str) {
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i, // Event handlers
      /<iframe/i,
      /<embed/i,
      /<object/i,
      /data:text\/html/i,
      /vbscript:/i
    ];

    return xssPatterns.some(pattern => pattern.test(str));
  }

  containsSQLPatterns(str) {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/i,
      /(--|\||;|\/\*|\*\/)/,
      /(\bOR\b.*=.*)/i,
      /(\bAND\b.*=.*)/i,
      /'.*\bOR\b.*'/i
    ];

    return sqlPatterns.some(pattern => pattern.test(str));
  }

  validateTicketRegistration(data) {
    const validated = {
      ticketId: this.validateTicketId(data.ticketId),
      firstName: this.validateName(data.firstName, 'First name'),
      lastName: this.validateName(data.lastName, 'Last name'),
      email: this.validateEmail(data.email)
    };

    return validated;
  }

  validateTicketId(ticketId) {
    if (!ticketId || typeof ticketId !== 'string') {
      throw new ValidationError('Ticket ID is required');
    }

    // Ticket ID format: TKT-XXXXXXXXX
    const ticketRegex = /^TKT-[A-Z0-9]{9}$/;
    if (!ticketRegex.test(ticketId)) {
      throw new ValidationError('Invalid ticket ID format');
    }

    return ticketId;
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

// Export singleton instance
export const registrationValidator = new RegistrationValidator();