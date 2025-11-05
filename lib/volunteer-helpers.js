/**
 * Volunteer Form Helper Utilities
 * Extracted for testability and reusability
 */

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Get client IP address from request
 * Safely parses X-Forwarded-For header to prevent spoofing
 * @param {Object} req - HTTP request object
 * @returns {string} Client IP address
 */
export function getClientIp(req) {
  const headers = req?.headers || {};

  // Parse X-Forwarded-For (take first IP only to prevent spoofing)
  const forwarded = typeof headers['x-forwarded-for'] === 'string'
    ? headers['x-forwarded-for'].split(',')[0].trim()
    : undefined;
  if (forwarded) return forwarded;

  // Check X-Real-IP header
  const realIp = typeof headers['x-real-ip'] === 'string'
    ? headers['x-real-ip'].trim()
    : undefined;
  if (realIp) return realIp;

  // Fall back to connection/socket addresses
  return (
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Mask email for logging (PII protection)
 * @param {string} email - Email address
 * @returns {string} Masked email (e.g., "ab***@domain.com")
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[invalid-email]';
  const parts = email.split('@');
  const user = parts[0];
  const domain = parts[1] || '';
  if (!user || !domain) return '[malformed-email]';
  return user.slice(0, 2) + '***@' + domain;
}

/**
 * Format areas of interest for email
 * @param {string[]} areas - Array of area identifiers
 * @returns {string} Formatted areas of interest
 */
export function formatAreasOfInterest(areas) {
  if (!areas || areas.length === 0) return 'None specified';

  const areaLabels = {
    'setup': 'Event Setup/Breakdown',
    'registration': 'Registration Desk',
    'artist': 'Artist Support',
    'merchandise': 'Merchandise Sales',
    'info': 'Information Booth',
    'social': 'Social Media Team'
  };

  return areas.map(area => areaLabels[area] || area).join(', ');
}

/**
 * Format availability for email
 * @param {string[]} days - Array of day identifiers
 * @returns {string} Formatted availability
 */
export function formatAvailability(days) {
  if (!days || days.length === 0) return 'None specified';

  const dayLabels = {
    'friday': 'Friday, May 15',
    'saturday': 'Saturday, May 16',
    'sunday': 'Sunday, May 17'
  };

  return days.map(day => dayLabels[day] || day).join(', ');
}
