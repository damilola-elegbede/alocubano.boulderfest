import jwt from "jsonwebtoken";
import { getDatabaseClient } from "../../lib/database.js";
import { getRateLimitService } from "../../lib/rate-limit-service.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";
import auditService from "../../lib/audit-service.js";
import { isTestMode, getTestModeFlag } from "../../lib/test-mode-utils.js";
import { getQRTokenService } from "../../lib/qr-token-service.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getTicketColorService } from "../../lib/ticket-color-service.js";
import timeUtils from "../../lib/time-utils.js";

// Enhanced rate limiting configuration
const TICKET_RATE_LIMIT = {
  window: 60000, // 1 minute
  maxAttempts: 50, // Reduced from 100 for better security
  lockoutDuration: 300000 // 5 minutes lockout after exceeding limit
};

// Per-ticket rate limiting (max 10 scans per hour per ticket)
const PER_TICKET_RATE_LIMIT = {
  window: 3600000, // 1 hour
  maxAttempts: 10,
  lockoutDuration: 1800000 // 30 minutes lockout after exceeding limit
};

/**
 * Detect if a ticket is a test ticket
 * @param {Object} ticket - Ticket record from database
 * @returns {boolean} - True if this is a test ticket
 */
function isTestTicket(ticket) {
  if (!ticket) return false;

  // Primary check: is_test field
  if (typeof ticket.is_test === 'number') {
    return ticket.is_test === 1;
  }

  // Fallback: check patterns in ticket ID
  const ticketId = ticket.ticket_id || '';
  if (!ticket.ticket_id) {
    console.error('[TicketValidate] Missing ticket_id field, cannot detect test ticket reliably', { ticket });
  }
  return /test[_-]?ticket|^TEST[_-]|[_-]TEST$/i.test(ticketId);
}

/**
 * Get test mode validation indicator
 * @param {boolean} isTest - Whether this is test mode
 * @returns {string} - Test mode indicator text
 */
function getTestModeValidationIndicator(isTest) {
  return isTest ? '🧪 TEST TICKET' : '';
}

/**
 * Enhanced input validation for ticket tokens
 * @param {any} token - Token to validate
 * @returns {Object} Validation result
 */
function validateTicketToken(token) {
  // Check if token exists and is a string
  if (!token || typeof token !== 'string') {
    return {
      isValid: false,
      error: 'Token must be a non-empty string',
      securityRisk: false
    };
  }

  // Check token length (JWT tokens are typically 100-500+ chars, validation codes are shorter)
  if (token.length < 4 || token.length > 2000) {
    return {
      isValid: false,
      error: 'Token format invalid',
      securityRisk: false
    };
  }

  // Security pattern detection for injection attempts
  const suspiciousPatterns = [
    /<script[^>]*>/i,           // Script tags
    /javascript:/i,             // JavaScript protocol
    /on\w+\s*=/i,              // Event handlers
    /\$\{.*\}/,                // Template literals
    /__proto__/,               // Prototype pollution
    /constructor/,             // Constructor access
    /prototype/,               // Prototype access
    /eval\s*\(/i,              // Eval calls
    /function\s*\(/i,          // Function declarations
    /\.\.\/|\.\.\\|%2e%2e/i,   // Directory traversal
    /union\s+select/i,         // SQL injection
    /insert\s+into/i,          // SQL injection
    /delete\s+from/i,          // SQL injection
    /drop\s+table/i,           // SQL injection
    /\bexec\b|\bexecute\b/i   // Command execution
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(token)) {
      console.warn('Suspicious token pattern detected');
      return {
        isValid: false,
        error: 'Token contains invalid characters',
        securityRisk: true
      };
    }
  }

  // Additional validation for non-printable characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(token)) {
    return {
      isValid: false,
      error: 'Token contains invalid characters',
      securityRisk: true
    };
  }

  return { isValid: true };
}

/**
 * Enhanced rate limiting using the centralized rate limit service
 * @param {string} clientIP - Client IP address
 * @returns {Promise<Object>} Rate limit status
 */
async function checkEnhancedRateLimit(clientIP) {
  const rateLimitService = getRateLimitService();

  const result = await rateLimitService.checkLimit(clientIP, 'ticket_validation', {
    maxAttempts: TICKET_RATE_LIMIT.maxAttempts,
    windowMs: TICKET_RATE_LIMIT.window
  });

  return {
    isAllowed: result.allowed,
    remaining: result.remaining,
    retryAfter: result.retryAfter
  };
}

/**
 * Extract validation code from token with enhanced security using QRTokenService
 * @param {string} token - JWT token or raw validation code
 * @returns {Object} - Extraction result with security validation
 */
function extractValidationCode(token) {
  const qrTokenService = getQRTokenService();

  // First try with QRTokenService for JWT validation
  const jwtValidation = qrTokenService.validateToken(token);
  if (jwtValidation.valid) {
    // Successfully validated as JWT - extract ticket ID
    const ticketId = jwtValidation.payload.tid;
    if (!ticketId || typeof ticketId !== 'string') {
      throw new Error('Invalid ticket ID in JWT token');
    }

    return {
      isJWT: true,
      validationCode: ticketId, // For JWT tokens, we use ticket_id as validation code
      issueTime: jwtValidation.payload.iat,
      expirationTime: jwtValidation.payload.exp,
      tokenPayload: jwtValidation.payload
    };
  }

  // JWT validation failed - handle as legacy validation_code
  if (jwtValidation.error?.includes('expired')) {
    throw new Error('Token has expired');
  }

  // Fallback to treating as direct validation code (legacy format)
  console.warn('JWT token validation failed, treating as direct validation code:', {
    error: jwtValidation.error
  });

  // Additional validation for direct validation codes
  if (!/^[A-Za-z0-9\-_]{8,64}$/.test(token)) {
    throw new Error('Invalid direct validation code format');
  }

  return {
    isJWT: false,
    validationCode: token,
    issueTime: null,
    expirationTime: null,
    tokenPayload: null
  };
}

/**
 * Check per-ticket rate limiting to prevent abuse
 * @param {string} ticketId - Ticket ID to check
 * @returns {Promise<Object>} Rate limit status
 */
async function checkPerTicketRateLimit(ticketId) {
  if (!ticketId) {
    return { isAllowed: true, remaining: PER_TICKET_RATE_LIMIT.maxAttempts };
  }

  const rateLimitService = getRateLimitService();
  const result = await rateLimitService.checkLimit(`ticket:${ticketId}`, 'ticket_validation_per_ticket', {
    maxAttempts: PER_TICKET_RATE_LIMIT.maxAttempts,
    windowMs: PER_TICKET_RATE_LIMIT.window
  });

  return {
    isAllowed: result.allowed,
    remaining: result.remaining,
    retryAfter: result.retryAfter
  };
}

/**
 * Check if event has ended
 * @param {Object} ticket - Ticket object with event_end_date
 * @returns {boolean} True if event has ended
 */
function isEventEnded(ticket) {
  if (!ticket.event_end_date) {
    // If no end date set, assume event is still active
    return false;
  }

  const eventEndDate = new Date(ticket.event_end_date);
  const now = new Date();
  return now > eventEndDate;
}

/**
 * Log comprehensive scan attempt to scan_logs table
 * @param {Object} db - Database client
 * @param {Object} scanData - Scan data to log
 */
async function logScanAttempt(db, scanData) {
  // Skip logging if ticket doesn't exist (prevents FOREIGN KEY constraint errors)
  if (!scanData.ticketId || scanData.ticketId === 'unknown') {
    return;
  }

  try {
    await db.execute({
      sql: `
        INSERT INTO scan_logs (
          ticket_id, scan_status, scan_location, device_info, ip_address,
          user_agent, validation_source, token_type, failure_reason,
          request_id, scan_duration_ms, security_flags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        scanData.ticketId,
        scanData.scanStatus,
        scanData.scanLocation || null,
        scanData.deviceInfo || null,
        scanData.ipAddress,
        scanData.userAgent || null,
        scanData.validationSource,
        scanData.tokenType,
        scanData.failureReason || null,
        scanData.requestId,
        scanData.scanDurationMs || null,
        scanData.securityFlags ? JSON.stringify(scanData.securityFlags) : null
      ]
    });
  } catch (error) {
    // Non-blocking: log error but don't fail the operation
    console.error('Failed to log scan attempt (non-blocking):', error.message);
  }
}

/**
 * Detect validation source from request with input sanitization
 * @param {object} req - Request object
 * @returns {string} - Validation source
 */
function detectSource(req, clientIP) {
  // Sanitize and validate wallet source header
  const walletSource = req.headers['x-wallet-source'];
  if (walletSource) {
    // Only allow specific wallet source values
    const allowedWalletSources = ['apple_wallet', 'google_wallet', 'samsung_wallet'];
    const sanitizedSource = String(walletSource).toLowerCase().trim();

    if (allowedWalletSources.includes(sanitizedSource)) {
      return sanitizedSource;
    }

    // Log suspicious wallet source attempts
    console.warn('Invalid wallet source header detected:', {
      source: String(walletSource).slice(0, 50),
      ip: clientIP
    });

    return 'web'; // Default to web for invalid sources
  }

  // Safely extract user agent with length limits
  const userAgent = req.headers['user-agent'];
  if (userAgent && typeof userAgent === 'string') {
    const safeUserAgent = userAgent.substring(0, 500); // Limit length to prevent attacks

    if (/\bApple\b/i.test(safeUserAgent) || /\biOS\b/i.test(safeUserAgent)) {
      return 'apple_wallet';
    } else if (/\bGoogle\b/i.test(safeUserAgent) || /\bAndroid\b/i.test(safeUserAgent)) {
      return 'google_wallet';
    }
  }

  return 'web';
}

/**
 * Validate ticket and update scan count atomically with enhanced JWT support
 * @param {object} db - Database instance
 * @param {string} validationCode - Validation code (ticket_id for JWT, validation_code for legacy)
 * @param {string} source - Validation source
 * @param {boolean} isJWT - Whether this is a JWT token validation
 * @returns {object} - Validation result
 */
async function validateTicket(db, validationCode, source, isJWT = false) {
  // Start transaction for atomic operations
  const tx = await db.transaction();

  try {
    let ticket;

    if (isJWT) {
      // For JWT tokens, validationCode is actually the ticket_id
      const result = await tx.execute({
        sql: `
          SELECT t.*,
                 'A Lo Cubano Boulder Fest' as event_name,
                 t.event_date
          FROM tickets t
          WHERE t.ticket_id = ?
        `,
        args: [validationCode]
      });
      // Process database result to handle BigInt values
      const processedResult = processDatabaseResult(result);
      ticket = processedResult.rows[0];
    } else {
      // Legacy validation - use validation_code
      const result = await tx.execute({
        sql: `
          SELECT t.*,
                 'A Lo Cubano Boulder Fest' as event_name,
                 t.event_date
          FROM tickets t
          WHERE t.validation_code = ?
        `,
        args: [validationCode]
      });
      // Process database result to handle BigInt values
      const processedResult = processDatabaseResult(result);
      ticket = processedResult.rows[0];

      // Fallback: Try ticket_id for legacy QR codes or manual entry
      if (!ticket) {
        const fallbackResult = await tx.execute({
          sql: `
            SELECT t.*,
                   'A Lo Cubano Boulder Fest' as event_name,
                   t.event_date
            FROM tickets t
            WHERE t.ticket_id = ?
          `,
          args: [validationCode]
        });
        const fallbackProcessed = processDatabaseResult(fallbackResult);
        ticket = fallbackProcessed.rows[0];
      }
    }

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // Check ticket status
    if (ticket.status !== 'valid') {
      throw new Error(`Ticket is ${ticket.status}`);
    }

    // Check validation status
    if (ticket.validation_status !== 'active') {
      throw new Error(`Ticket validation is ${ticket.validation_status}`);
    }

    // Check if event has ended
    if (isEventEnded(ticket)) {
      throw new Error('Event has ended');
    }

    // Check scan limits
    if (ticket.scan_count >= ticket.max_scan_count) {
      throw new Error('Maximum scans exceeded');
    }

    // Atomic update with condition check (prevents race condition)
    const updateField = isJWT ? 'ticket_id' : 'validation_code';
    const updateResult = await tx.execute({
      sql: `
        UPDATE tickets
        SET scan_count = scan_count + 1,
            qr_access_method = ?,
            first_scanned_at = COALESCE(first_scanned_at, CURRENT_TIMESTAMP),
            last_scanned_at = CURRENT_TIMESTAMP
        WHERE ${updateField} = ?
          AND scan_count < max_scan_count
          AND status = 'valid'
          AND validation_status = 'active'
      `,
      args: [source, validationCode]
    });

    // Use portable rows changed check for different database implementations
    const rowsChanged = updateResult.rowsAffected ?? updateResult.changes ?? 0;
    if (rowsChanged === 0) {
      throw new Error('Validation failed - ticket may have reached scan limit or status changed');
    }

    // Commit transaction
    await tx.commit();

    return {
      success: true,
      ticket: {
        ...ticket,
        scan_count: ticket.scan_count + 1
      }
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Log validation attempt with comprehensive audit trail
 * @param {object} db - Database instance
 * @param {object} params - Logging parameters
 */
async function logValidation(db, params) {
  // Skip logging if ticket doesn't exist (prevents NOT NULL constraint errors)
  if (!params.ticketId) {
    return;
  }

  try {
    // Ensure database exists and qr_validations table is available
    if (!db) {
      console.warn('Database client not available for QR validation logging');
      return;
    }

    // Check if qr_validations table exists before attempting insert
    try {
      await db.execute('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'qr_validations\'');
    } catch (tableCheckError) {
      console.warn('qr_validations table not available, skipping validation logging');
      return;
    }

    // Prepare validation metadata as JSON
    const metadata = {
      token: params.token,
      source: params.source,
      ip: params.ip,
      deviceInfo: params.deviceInfo || null,
      failureReason: params.failureReason || null
    };

    // Insert into qr_validations with correct schema
    await db.execute({
      sql: `
        INSERT INTO qr_validations (
          ticket_id, validation_result, validation_metadata
        ) VALUES (?, ?, ?)
      `,
      args: [
        params.ticketId || null,
        params.result,
        JSON.stringify(metadata)
      ]
    });
  } catch (error) {
    // Log error but dont throw - validation logging is not critical
    console.error('Failed to log QR validation:', error.message);
  }
}

/**
 * Enhanced audit logging for validation attempts (non-blocking)
 */
async function auditValidationAttempt(params) {
  try {
    const action = params.success ? 'QR_CODE_VALIDATION_SUCCESS' : 'QR_CODE_VALIDATION_FAILURE';
    const severity = params.success ? 'info' : 'warning';

    await auditService.logDataChange({
      requestId: params.requestId,
      action: action,
      targetType: 'ticket_validation',
      targetId: params.ticketId || 'unknown',
      beforeValue: params.beforeState || null,
      afterValue: params.afterState || null,
      changedFields: params.changedFields || [],
      adminUser: null, // QR validations are typically user-initiated
      sessionId: null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        validation_source: params.source,
        validation_token_type: params.tokenType,
        scan_count_before: params.scanCountBefore,
        scan_count_after: params.scanCountAfter,
        max_scan_count: params.maxScanCount,
        validation_time_ms: params.validationTimeMs,
        device_info: params.deviceInfo,
        geolocation: params.geolocation || null,
        failure_reason: params.failureReason || null,
        security_flags: params.securityFlags || {}
      },
      severity: severity
    });
  } catch (auditError) {
    // Non-blocking: log error but don't fail the operation
    console.error('Validation audit failed (non-blocking):', auditError.message);
  }
}

/**
 * Enhanced IP address extraction and validation
 * @param {object} req - Request object
 * @returns {string} - Validated IP address
 */
function extractClientIP(req) {
  // Handle multiple IP formats and validate
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  const connectionIP = req.connection?.remoteAddress || req.socket?.remoteAddress;

  let clientIP = 'unknown';

  if (forwardedFor && typeof forwardedFor === 'string') {
    // Take the first IP from the forwarded chain and validate
    const firstIP = forwardedFor.split(',')[0]?.trim();
    if (firstIP && isValidIP(firstIP)) {
      clientIP = firstIP;
    }
  } else if (realIP && typeof realIP === 'string' && isValidIP(realIP)) {
    clientIP = realIP;
  } else if (connectionIP && isValidIP(connectionIP)) {
    clientIP = connectionIP;
  }

  return clientIP;
}

/**
 * Enhanced IP address validation with complete IPv4 and IPv6 support
 * @param {any} ip - IP address to validate (handles any input type)
 * @returns {boolean} - Whether IP is valid format
 */
function isValidIP(ip) {
  // Type checking - ensure input is a non-empty string
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // Length validation - prevent potential DoS with extremely long strings
  if (ip.length > 45) {
    return false;
  } // Max IPv6 length is 39, IPv4 is 15, add buffer

  // Trim whitespace and validate basic character set
  const trimmedIP = ip.trim();
  if (!trimmedIP || !/^[0-9a-fA-F:.]+$/.test(trimmedIP)) {
    return false;
  }

  return isValidIPv4(trimmedIP) || isValidIPv6(trimmedIP);
}

/**
 * Comprehensive IPv4 address validation
 * @param {string} ip - IPv4 address to validate
 * @returns {boolean} - Whether IPv4 is valid
 */
function isValidIPv4(ip) {
  // IPv4 pattern with strict octet validation
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  if (!ipv4Regex.test(ip)) {
    return false;
  }

  // Additional validation: ensure no leading zeros (except for single zero)
  const octets = ip.split('.');
  for (const octet of octets) {
    if (octet.length > 1 && octet.startsWith('0')) {
      return false; // Invalid: leading zeros like 01, 001, etc.
    }
  }

  return true;
}

/**
 * Comprehensive IPv6 address validation
 * @param {string} ip - IPv6 address to validate
 * @returns {boolean} - Whether IPv6 is valid
 */
function isValidIPv6(ip) {
  // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    const ipv4Part = ip.substring(7);
    return isValidIPv4(ipv4Part);
  }

  // Handle IPv4-compatible IPv6 addresses (::192.168.1.1)
  if (ip.startsWith('::') && ip.includes('.')) {
    const ipv4Part = ip.substring(2);
    return isValidIPv4(ipv4Part);
  }

  // Standard IPv6 validation
  // Check for multiple :: (only one allowed)
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) {
    return false;
  }

  // Split by :: to handle compressed notation
  if (doubleColonCount === 1) {
    const parts = ip.split('::');
    if (parts.length !== 2) {
      return false;
    }

    const leftPart = parts[0];
    const rightPart = parts[1];

    // Validate left part
    if (leftPart && !isValidIPv6Groups(leftPart.split(':'))) {
      return false;
    }

    // Validate right part
    if (rightPart && !isValidIPv6Groups(rightPart.split(':'))) {
      return false;
    }

    // Check total group count doesn't exceed 8
    const leftGroups = leftPart ? leftPart.split(':').length : 0;
    const rightGroups = rightPart ? rightPart.split(':').length : 0;

    // :: represents at least one group of zeros
    if (leftGroups + rightGroups >= 8) {
      return false;
    }

    return true;
  }

  // No compression - must have exactly 8 groups
  const groups = ip.split(':');
  if (groups.length !== 8) {
    return false;
  }

  return isValidIPv6Groups(groups);
}

/**
 * Validate IPv6 groups
 * @param {string[]} groups - Array of IPv6 groups
 * @returns {boolean} - Whether all groups are valid
 */
function isValidIPv6Groups(groups) {
  for (const group of groups) {
    // Empty groups are allowed in compressed notation context
    if (group === '') {
      continue;
    }

    // Each group must be 1-4 hex digits
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return false;
    }
  }

  return true;
}

/**
 * Handle ticket validation endpoint with enhanced security
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
async function handler(req, res) {
  const startTime = Date.now();
  // Ensure audit service is initialized to prevent race conditions
  if (auditService.ensureInitialized) {
    await auditService.ensureInitialized();
  }

  const requestId = auditService.generateRequestId();

  // Only accept POST for security (tokens should not be in URL)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      error: 'Method not allowed - use POST',
      allowedMethods: ['POST']
    });
  }

  // Enhanced IP extraction and validation
  const clientIP = extractClientIP(req);
  const userAgent = req.headers['user-agent'] || '';

  if (clientIP === 'unknown') {
    console.warn('Unable to determine client IP address for rate limiting');
  }

  // Enhanced rate limiting check (skip only in test environment)
  if (process.env.NODE_ENV !== 'test') {
    try {
      const rateLimitResult = await checkEnhancedRateLimit(clientIP);

      if (!rateLimitResult.isAllowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: rateLimitResult.retryAfter,
          remaining: rateLimitResult.remaining
        });
      }
    } catch (rateLimitError) {
      console.error('Rate limiting service error:', rateLimitError);
      // Continue processing but log the error - don't block legitimate requests
    }
  }

  const { token, validateOnly } = req.body || {};

  // Enhanced token validation
  const tokenValidation = validateTicketToken(token);
  if (!tokenValidation.isValid) {
    // Log security risks for monitoring
    if (tokenValidation.securityRisk) {
      console.warn('Security risk detected in ticket validation:', {
        ip: clientIP,
        error: tokenValidation.error,
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent']?.substring(0, 100)
      });
    }

    return res.status(400).json({
      valid: false,
      error: 'Invalid token format',
      details: process.env.NODE_ENV === 'development' ? tokenValidation.error : undefined
    });
  }

  const source = detectSource(req, clientIP);
  let db;
  let extractionResult;
  let ticketId;

  try {
    db = await getDatabaseClient();
    extractionResult = extractValidationCode(token);
    const validationCode = extractionResult.validationCode;

    // For JWT tokens, validationCode is the ticket_id
    ticketId = extractionResult.isJWT ? validationCode : null;

    // Per-ticket rate limiting (only if we have a ticket ID)
    if (ticketId && process.env.NODE_ENV !== 'test') {
      const ticketRateLimit = await checkPerTicketRateLimit(ticketId);
      if (!ticketRateLimit.isAllowed) {
        // Log rate limit exceeded
        await logScanAttempt(db, {
          ticketId: ticketId,
          scanStatus: 'rate_limited',
          ipAddress: clientIP,
          userAgent: userAgent,
          validationSource: source,
          tokenType: extractionResult.isJWT ? 'JWT' : 'direct',
          failureReason: 'Per-ticket rate limit exceeded',
          requestId: requestId,
          scanDurationMs: Date.now() - startTime,
          securityFlags: { rate_limited: true, per_ticket: true }
        });

        return res.status(429).json({
          valid: false,
          error: 'Too many validation attempts for this ticket. Please try again later.',
          validation: {
            status: 'rate_limited',
            message: 'Rate limit exceeded for this ticket'
          },
          retryAfter: ticketRateLimit.retryAfter
        });
      }
    }

    if (validateOnly) {
      // For preview only - no updates
      let ticket;

      if (extractionResult.isJWT) {
        // For JWT tokens, validationCode is ticket_id
        const result = await db.execute({
          sql: `
            SELECT t.*,
                   'A Lo Cubano Boulder Fest' as event_name,
                   t.event_date
            FROM tickets t
            WHERE t.ticket_id = ?
          `,
          args: [validationCode]
        });
        // Process database result to handle BigInt values
        const processedResult = processDatabaseResult(result);
        ticket = processedResult.rows[0];
      } else {
        // Legacy validation - use validation_code
        const result = await db.execute({
          sql: `
            SELECT t.*,
                   'A Lo Cubano Boulder Fest' as event_name,
                   t.event_date
            FROM tickets t
            WHERE t.validation_code = ?
          `,
          args: [validationCode]
        });
        // Process database result to handle BigInt values
        const processedResult = processDatabaseResult(result);
        ticket = processedResult.rows[0];
      }

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      if (ticket.status !== 'valid') {
        throw new Error(`Ticket is ${ticket.status}`);
      }

      if (ticket.validation_status !== 'active') {
        throw new Error(`Ticket validation is ${ticket.validation_status}`);
      }

      if (isEventEnded(ticket)) {
        throw new Error('Event has ended');
      }

      // Detect test mode for response
      const ticketIsTest = isTestTicket(ticket);
      const testModeIndicator = getTestModeValidationIndicator(ticketIsTest);

      // Get color for ticket type (for view-ticket page display)
      const colorService = getTicketColorService();
      let ticketColor;
      try {
        ticketColor = await colorService.getColorForTicketType(ticket.ticket_type);
      } catch (error) {
        console.error('[Validation] Failed to get ticket color:', error);
        ticketColor = { name: 'Default', rgb: 'rgb(255, 255, 255)', emoji: '⬤' };
      }

      // Prepare base response with all ticket details
      const baseResponse = {
        valid: true,

        // Top-level fields (expected by my-ticket.html)
        ticket_id: ticket.ticket_id,
        ticket_type: ticket.ticket_type,
        ticket_type_name: ticket.ticket_type_name,

        // Attendee information
        attendee_first_name: ticket.attendee_first_name,
        attendee_last_name: ticket.attendee_last_name,
        attendee_email: ticket.attendee_email,

        // Registration information
        registration_status: ticket.registration_status,
        registered_at: ticket.registered_at,

        // Color information (for colored circles)
        color_name: ticketColor.name,
        color_rgb: ticketColor.rgb,

        // Nested ticket object (for backward compatibility)
        ticket: {
          id: ticket.ticket_id,
          type: ticket.ticket_type,
          attendee: `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
          event: ticket.event_name
        },

        // Validation status
        validation: {
          status: 'valid',
          scan_count: ticket.scan_count,
          last_scanned: ticket.last_scanned_at,
          message: ticketIsTest ? `${testModeIndicator} - Test ticket verified` : 'Ticket verified for preview'
        }
      };

      // Enhance with Mountain Time formatted timestamps
      const enhancedResponse = timeUtils.enhanceApiResponse(
        baseResponse,
        ['registered_at', 'last_scanned_at'],
        { includeDeadline: false }
      );

      return res.status(200).json(enhancedResponse);
    }

    // Actual validation with scan count update
    const validationResult = await validateTicket(db, validationCode, source, extractionResult.isJWT);
    const ticket = validationResult.ticket;
    const validationTimeMs = Date.now() - startTime;

    // Log successful scan to new scan_logs table
    await logScanAttempt(db, {
      ticketId: ticket.ticket_id,
      scanStatus: 'valid',
      ipAddress: clientIP,
      userAgent: userAgent,
      validationSource: source,
      tokenType: extractionResult.isJWT ? 'JWT' : 'direct',
      requestId: requestId,
      scanDurationMs: validationTimeMs,
      securityFlags: {
        rate_limited: false,
        suspicious_pattern: tokenValidation.securityRisk || false,
        jwt_token: extractionResult.isJWT
      }
    });

    // Log successful validation (legacy format for compatibility)
    await logValidation(db, {
      ticketId: ticket.ticket_id,
      token: '[REDACTED]', // Don't log any part of token
      result: 'success',
      source: source,
      ip: clientIP,
      deviceInfo: userAgent
    });

    // Enhanced audit logging for successful validation (non-blocking)
    auditValidationAttempt({
      requestId: requestId,
      success: true,
      ticketId: ticket.ticket_id,
      beforeState: {
        scan_count: ticket.scan_count - 1,
        status: ticket.status,
        qr_access_method: ticket.qr_access_method || null
      },
      afterState: {
        scan_count: ticket.scan_count,
        status: ticket.status,
        qr_access_method: source,
        last_scanned_at: new Date().toISOString()
      },
      changedFields: ['scan_count', 'qr_access_method', 'last_scanned_at'],
      ipAddress: clientIP,
      userAgent: userAgent,
      source: source,
      tokenType: extractionResult.isJWT ? 'JWT' : 'direct',
      scanCountBefore: ticket.scan_count - 1,
      scanCountAfter: ticket.scan_count,
      maxScanCount: ticket.max_scan_count,
      validationTimeMs: validationTimeMs,
      deviceInfo: userAgent.substring(0, 200), // Truncate for storage
      securityFlags: {
        rate_limited: false,
        suspicious_pattern: tokenValidation.securityRisk || false,
        jwt_token: extractionResult.isJWT
      }
    });

    // Detect test mode for response
    const ticketIsTest = isTestTicket(ticket);
    const testModeIndicator = getTestModeValidationIndicator(ticketIsTest);

    // Return enhanced response format as specified
    res.status(200).json({
      valid: true,
      ticketId: ticket.ticket_id, // Top-level ticket ID for easy access
      wallet_source: source, // Wallet source for tracking
      ticket: {
        id: ticket.ticket_id,
        type: ticket.ticket_type,
        attendee: `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
        event: ticket.event_name,
        wallet_source: source // Also include in nested object for consistency
      },
      validation: {
        status: 'valid',
        scan_count: ticket.scan_count,
        last_scanned: new Date().toISOString(),
        message: ticketIsTest ?
          `${testModeIndicator} - Welcome ${ticket.attendee_first_name}! (Test Mode)` :
          `Welcome ${ticket.attendee_first_name}! Ticket validated successfully`
      }
    });
  } catch (error) {
    // Handle initialization errors
    if (error.message.includes('Failed to initialize database client')) {
      return res.status(503).json({
        valid: false,
        error: 'Service temporarily unavailable. Please try again.',
        validation: {
          status: 'service_unavailable',
          message: 'Database service temporarily unavailable'
        }
      });
    }

    const validationTimeMs = Date.now() - startTime;

    // Enhanced error handling with security considerations
    let safeErrorMessage = 'Ticket validation failed';
    let validationStatus = 'invalid';
    let httpStatusCode = 400;

    const logDetails = {
      message: error.message || 'Unknown validation error',
      timestamp: new Date().toISOString(),
      ip: clientIP,
      source: source
    };

    // Categorize errors for appropriate responses and HTTP status codes
    if (error.message.includes('Token validation service')) {
      // Configuration errors - don't expose details to client
      safeErrorMessage = 'Service temporarily unavailable';
      validationStatus = 'service_unavailable';
      httpStatusCode = 503;
      logDetails.category = 'configuration_error';
      console.error('Token validation service error:', logDetails);
    } else if (error.message.includes('Invalid token') ||
               error.message.includes('Token expired') ||
               error.message.includes('has expired') ||
               error.message.includes('Invalid validation code') ||
               error.message.includes('malformed') ||
               error.message.includes('Invalid format') ||
               !token || token.length < 10) {
      // Token-related errors
      if (error.message.includes('expired')) {
        safeErrorMessage = 'Token has expired';
        validationStatus = 'expired';
        httpStatusCode = 401;
      } else {
        safeErrorMessage = 'Invalid token format';
        validationStatus = 'invalid';
        httpStatusCode = 400;
      }
      logDetails.category = 'token_error';
    } else if (error.message.includes('Ticket not found')) {
      safeErrorMessage = 'Ticket not found';
      validationStatus = 'invalid';
      httpStatusCode = 404;
      logDetails.category = 'ticket_not_found';
    } else if (error.message.includes('Maximum scans exceeded')) {
      safeErrorMessage = 'Maximum scans exceeded';
      validationStatus = 'already_scanned';
      httpStatusCode = 410;
      logDetails.category = 'scan_limit_exceeded';
    } else if (error.message.includes('Event has ended')) {
      safeErrorMessage = 'Event has ended';
      validationStatus = 'expired';
      httpStatusCode = 410;
      logDetails.category = 'event_ended';
    } else if (error.message.includes('Ticket is') ||
               error.message.includes('Ticket validation is')) {
      // Ticket status errors - safe to show to user
      safeErrorMessage = error.message;
      validationStatus = error.message.includes('cancelled') ? 'cancelled' :
                        error.message.includes('refunded') ? 'refunded' :
                        error.message.includes('suspended') ? 'suspended' : 'invalid';
      httpStatusCode = 400;
      logDetails.category = 'ticket_status';
    } else {
      // Unknown errors - assume invalid token for security
      safeErrorMessage = 'Invalid ticket format';
      validationStatus = 'invalid';
      httpStatusCode = 400;
      logDetails.category = 'unknown_error';
      console.error('Unknown validation error:', logDetails);
    }

    // Log failed scan to new scan_logs table
    try {
      if (db) {
        await logScanAttempt(db, {
          ticketId: ticketId || 'unknown',
          scanStatus: validationStatus,
          ipAddress: clientIP,
          userAgent: userAgent,
          validationSource: source,
          tokenType: extractionResult?.isJWT ? 'JWT' : (token ? 'direct' : 'invalid'),
          failureReason: safeErrorMessage,
          requestId: requestId,
          scanDurationMs: validationTimeMs,
          securityFlags: {
            rate_limited: error.message?.includes('Rate limit') || false,
            suspicious_pattern: tokenValidation?.securityRisk || false,
            configuration_error: logDetails.category === 'configuration_error',
            token_error: logDetails.category === 'token_error',
            ticket_status_error: logDetails.category === 'ticket_status',
            jwt_token: extractionResult?.isJWT || false
          }
        });
      }
    } catch (logError) {
      console.error('Failed to log scan attempt (non-blocking):', logError.message);
    }

    // Log failed validation (legacy format for compatibility)
    try {
      if (db) {
        await logValidation(db, {
          ticketId: ticketId || null,
          token: token ? '[REDACTED]' : 'invalid',
          result: 'invalid', // Use schema-compliant enum value
          failureReason: safeErrorMessage,
          source: source,
          ip: clientIP
        });
      }
    } catch (logError) {
      console.error('Failed to log validation error:', logError.message);
    }

    // Enhanced audit logging for failed validation (non-blocking)
    auditValidationAttempt({
      requestId: requestId,
      success: false,
      ticketId: ticketId || null,
      beforeState: null,
      afterState: null,
      changedFields: [],
      ipAddress: clientIP,
      userAgent: userAgent,
      source: source,
      tokenType: extractionResult?.isJWT ? 'JWT' : (token ? 'direct' : 'invalid'),
      scanCountBefore: null,
      scanCountAfter: null,
      maxScanCount: null,
      validationTimeMs: validationTimeMs,
      deviceInfo: userAgent.substring(0, 200), // Truncate for storage
      failureReason: safeErrorMessage,
      securityFlags: {
        rate_limited: error.message?.includes('Rate limit') || false,
        suspicious_pattern: tokenValidation?.securityRisk || false,
        configuration_error: logDetails.category === 'configuration_error',
        token_error: logDetails.category === 'token_error',
        ticket_status_error: logDetails.category === 'ticket_status',
        jwt_token: extractionResult?.isJWT || false
      }
    });

    // Return enhanced error response format
    res.status(httpStatusCode).json({
      valid: false,
      error: safeErrorMessage,
      validation: {
        status: validationStatus,
        message: safeErrorMessage
      },
      // Only include error details in development
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
        category: logDetails.category
      })
    });
  }
}

export default withSecurityHeaders(handler);
