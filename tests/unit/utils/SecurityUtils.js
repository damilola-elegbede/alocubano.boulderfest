/**
 * SecurityUtils - Pure business logic for security operations
 * Extracted from API handlers for unit testing
 */

/**
 * HTML entities for XSS prevention
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Dangerous HTML patterns to detect
 */
const DANGEROUS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // Event handlers like onclick=
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /<object[^>]*>.*?<\/object>/gi,
  /<embed[^>]*>.*?<\/embed>/gi,
  /<form[^>]*>.*?<\/form>/gi,
  /<input[^>]*>/gi,
  /<textarea[^>]*>.*?<\/textarea>/gi,
  /<select[^>]*>.*?<\/select>/gi
];

/**
 * SQL injection patterns to detect
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|UNION|OR|AND)\b)/gi,
  /(--|\/\*|\*\/|;)/g,
  /(\b(EXEC|EXECUTE|xp_|sp_)\b)/gi,
  /(\b(SCRIPT|DECLARE|SET)\b)/gi
];

/**
 * Basic XSS sanitization - HTML entity encoding
 */
export function sanitizeHtml(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input.replace(/[&<>"'\/`=]/g, function(match) {
    return HTML_ENTITIES[match];
  });
}

/**
 * Advanced XSS sanitization - Remove dangerous tags and attributes
 */
export function sanitizeInput(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

/**
 * Detect XSS attempts in input
 */
export function detectXSS(input) {
  if (!input || typeof input !== 'string') {
    return { hasXSS: false, threats: [] };
  }

  const threats = [];

  for (const pattern of DANGEROUS_PATTERNS) {
    const matches = input.match(pattern);
    if (matches) {
      threats.push({
        type: 'XSS',
        pattern: pattern.toString(),
        matches: matches
      });
    }
  }

  return {
    hasXSS: threats.length > 0,
    threats
  };
}

/**
 * Detect SQL injection attempts
 */
export function detectSQLInjection(input) {
  if (!input || typeof input !== 'string') {
    return { hasSQLInjection: false, threats: [] };
  }

  const threats = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    const matches = input.match(pattern);
    if (matches) {
      threats.push({
        type: 'SQL_INJECTION',
        pattern: pattern.toString(),
        matches: matches
      });
    }
  }

  return {
    hasSQLInjection: threats.length > 0,
    threats
  };
}

/**
 * HTML escape function for safe output
 */
export function escapeHtml(unsafe) {
  if (!unsafe || typeof unsafe !== 'string') {
    return '';
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Remove HTML tags completely
 */
export function stripHtml(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Sanitize filename for safe file operations
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return '';
  }

  return filename
    .replace(/[^a-zA-Z0-9\-_.]/g, '_') // Replace unsafe chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .slice(0, 255); // Limit length
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  const trimmed = url.trim();

  // Check for javascript: or data: schemes
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return { valid: false, error: 'Dangerous URL scheme detected' };
  }

  // Only allow http, https, mailto
  if (!/^(https?|mailto):/i.test(trimmed) && !trimmed.startsWith('/')) {
    return { valid: false, error: 'Invalid URL scheme' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Comprehensive input sanitization for API inputs
 */
export function sanitizeApiInput(input, maxLength = 1000) {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input === 'number') {
    return input.toString();
  }

  if (typeof input === 'boolean') {
    return input.toString();
  }

  if (typeof input !== 'string') {
    return '';
  }

  return sanitizeInput(input).slice(0, maxLength);
}

/**
 * Security headers validation
 */
export function validateSecurityHeaders(headers) {
  const issues = [];

  // Check for missing security headers
  if (!headers['x-frame-options']) {
    issues.push('Missing X-Frame-Options header');
  }

  if (!headers['x-content-type-options']) {
    issues.push('Missing X-Content-Type-Options header');
  }

  if (!headers['x-xss-protection']) {
    issues.push('Missing X-XSS-Protection header');
  }

  if (!headers['content-security-policy']) {
    issues.push('Missing Content-Security-Policy header');
  }

  return {
    secure: issues.length === 0,
    issues
  };
}

/**
 * Password strength validation
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { strong: false, score: 0, issues: ['Password is required'] };
  }

  const issues = [];
  let score = 0;

  if (password.length < 8) {
    issues.push('Password must be at least 8 characters');
  } else {
    score += 1;
  }

  if (!/[a-z]/.test(password)) {
    issues.push('Password must contain lowercase letters');
  } else {
    score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    issues.push('Password must contain uppercase letters');
  } else {
    score += 1;
  }

  if (!/[0-9]/.test(password)) {
    issues.push('Password must contain numbers');
  } else {
    score += 1;
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    issues.push('Password must contain special characters');
  } else {
    score += 1;
  }

  return {
    strong: score >= 4,
    score,
    issues
  };
}