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
 * Generate a unique request ID
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `req_${timestamp}_${random}`;
}

export default {
  logAPIViolation,
  logRateLimitViolation,
  logSuspiciousUserAgent
};
