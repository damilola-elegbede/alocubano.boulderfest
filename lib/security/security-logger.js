/**
 * Security Logger Module
 * Centralized logging for security events and violations
 */

/**
 * Log API security violations
 * @param {string} clientIP - IP address of the client
 * @param {string} endpoint - The API endpoint accessed
 * @param {string} violation - Type of violation detected
 * @param {Object} metadata - Additional violation metadata
 */
export async function logAPIViolation(clientIP, endpoint, violation, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'api_violation',
    severity: getSeverityLevel(violation),
    clientIP,
    endpoint,
    violation,
    metadata,
    requestId: metadata.requestId || generateRequestId()
  };

  // Console logging for immediate visibility
  console.warn('[SECURITY VIOLATION]', JSON.stringify(logEntry, null, 2));

  // In production, this would also send to your logging service
  // await sendToLoggingService(logEntry);
}

/**
 * Log rate limiting violations
 * @param {string} clientIP - IP address of the client
 * @param {string} endpoint - The API endpoint accessed
 * @param {string} limitType - Type of rate limit exceeded
 * @param {Object} metadata - Additional violation metadata
 */
export async function logRateLimitViolation(clientIP, endpoint, limitType, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'rate_limit_violation',
    severity: 'medium',
    clientIP,
    endpoint,
    limitType,
    metadata,
    requestId: metadata.requestId || generateRequestId()
  };

  console.warn('[RATE LIMIT VIOLATION]', JSON.stringify(logEntry, null, 2));

  // In production, this would also send to your logging service
  // await sendToLoggingService(logEntry);
}

/**
 * Log suspicious user agent patterns
 * @param {string} clientIP - IP address of the client
 * @param {string} userAgent - The suspicious user agent string
 * @param {string} reason - Reason why the user agent is suspicious
 * @param {Object} metadata - Additional metadata
 */
export async function logSuspiciousUserAgent(clientIP, userAgent, reason, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'suspicious_user_agent',
    severity: 'low',
    clientIP,
    userAgent: userAgent?.substring(0, 200) || 'undefined', // Truncate for safety
    reason,
    metadata,
    requestId: metadata.requestId || generateRequestId()
  };

  console.warn('[SUSPICIOUS USER AGENT]', JSON.stringify(logEntry, null, 2));

  // In production, this would also send to your logging service
  // await sendToLoggingService(logEntry);
}

/**
 * Log authentication-related security events
 * @param {string} clientIP - IP address of the client
 * @param {string} event - Type of authentication event
 * @param {Object} metadata - Additional event metadata
 */
export async function logAuthEvent(clientIP, event, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'auth_event',
    severity: getAuthEventSeverity(event),
    clientIP,
    event,
    metadata,
    requestId: metadata.requestId || generateRequestId()
  };

  console.log('[AUTH EVENT]', JSON.stringify(logEntry, null, 2));

  // In production, this would also send to your logging service
  // await sendToLoggingService(logEntry);
}

/**
 * Get severity level for different violation types
 * @param {string} violation - The violation type
 * @returns {string} Severity level (low, medium, high, critical)
 */
function getSeverityLevel(violation) {
  const severityMap = {
    'sql_injection_attempt': 'critical',
    'sql_injection_in_body': 'critical',
    'command_injection_attempt': 'critical',
    'command_injection_in_body': 'critical',
    'path_traversal_attempt': 'high',
    'xss_attempt': 'high',
    'xss_in_body': 'high',
    'file_inclusion_attempt': 'high',
    'excessive_payload_size': 'medium',
    'suspicious_user_agent': 'low',
    'missing_user_agent': 'low'
  };

  return severityMap[violation] || 'medium';
}

/**
 * Get severity level for authentication events
 * @param {string} event - The authentication event
 * @returns {string} Severity level
 */
function getAuthEventSeverity(event) {
  const severityMap = {
    'login_success': 'low',
    'login_failure': 'medium',
    'brute_force_attempt': 'high',
    'account_lockout': 'high',
    'invalid_token': 'medium',
    'token_expired': 'low',
    'privilege_escalation': 'critical'
  };

  return severityMap[event] || 'medium';
}

/**
 * Generate a unique request ID
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format log entry for different output formats
 * @param {Object} logEntry - The log entry to format
 * @param {string} format - Output format (json, text, structured)
 * @returns {string} Formatted log entry
 */
export function formatLogEntry(logEntry, format = 'json') {
  switch (format) {
    case 'text':
      return `${logEntry.timestamp} [${logEntry.severity.toUpperCase()}] ${logEntry.type}: ${logEntry.clientIP} - ${JSON.stringify(logEntry.metadata)}`;
    
    case 'structured':
      return [
        `Time: ${logEntry.timestamp}`,
        `Type: ${logEntry.type}`,
        `Severity: ${logEntry.severity}`,
        `Client IP: ${logEntry.clientIP}`,
        `Details: ${JSON.stringify(logEntry.metadata, null, 2)}`
      ].join('\n');
    
    case 'json':
    default:
      return JSON.stringify(logEntry, null, 2);
  }
}

/**
 * Batch log multiple security events
 * @param {Array} events - Array of security events to log
 */
export async function batchLogSecurityEvents(events) {
  const batchEntry = {
    timestamp: new Date().toISOString(),
    type: 'security_batch',
    eventCount: events.length,
    events: events.map(event => ({
      ...event,
      requestId: event.requestId || generateRequestId()
    }))
  };

  console.log('[SECURITY BATCH]', JSON.stringify(batchEntry, null, 2));

  // In production, this would also send to your logging service
  // await sendToLoggingService(batchEntry);
}

export default {
  logAPIViolation,
  logRateLimitViolation,
  logSuspiciousUserAgent,
  logAuthEvent,
  formatLogEntry,
  batchLogSecurityEvents
};
