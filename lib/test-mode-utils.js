/**
 * Test Mode Utilities
 * Centralized test mode detection and metadata handling for the A Lo Cubano Boulder Fest system
 *
 * This module provides utilities to:
 * - Detect test mode from various environment variables and request headers
 * - Generate test-specific prefixes and identifiers
 * - Handle test mode metadata consistently across services
 */

/**
 * Detect if we're currently in test mode
 * Test mode is determined by environment variables or request headers
 *
 * @param {Object} req - Express request object (optional)
 * @returns {boolean} True if in test mode
 */
export function isTestMode(req = null) {
  // Environment-based test mode detection
  // Preview deployments ARE treated as test mode to ensure all preview data is marked as test data
  // E2E_TEST_MODE and INTEGRATION_TEST_MODE are redundant (those tests already set NODE_ENV='test')
  const envTestMode =
    process.env.NODE_ENV === 'test' ||
    process.env.VERCEL_ENV === 'preview';

  // Request header-based test mode detection
  let headerTestMode = false;
  if (req && req.headers) {
    headerTestMode =
      req.headers['x-test-mode'] === 'true' ||
      req.headers['x-e2e-test'] === 'true' ||
      req.headers['x-integration-test'] === 'true';
  }

  return envTestMode || headerTestMode;
}

/**
 * Get test mode flag as integer for database storage
 *
 * @param {Object} req - Express request object (optional)
 * @returns {number} 1 if test mode, 0 if production
 */
export function getTestModeFlag(req = null) {
  return isTestMode(req) ? 1 : 0;
}

/**
 * Create test mode metadata for database records
 *
 * @param {Object} req - Express request object (optional)
 * @param {Object} additionalMetadata - Additional metadata to include
 * @returns {Object} Metadata object with test mode information
 */
export function createTestModeMetadata(req = null, additionalMetadata = {}) {
  const metadata = {
    ...additionalMetadata,
    test_mode: isTestMode(req),
    created_at: new Date().toISOString()
  };

  if (isTestMode(req)) {
    metadata.test_context = {
      environment: process.env.NODE_ENV,
      ci_mode: process.env.CI === 'true',
      e2e_mode: process.env.E2E_TEST_MODE === 'true',
      integration_mode: process.env.INTEGRATION_TEST_MODE === 'true',
      vercel_env: process.env.VERCEL_ENV
    };

    // Add request-specific test metadata if available
    if (req && req.headers) {
      metadata.test_context.headers = {
        test_mode: req.headers['x-test-mode'],
        e2e_test: req.headers['x-e2e-test'],
        integration_test: req.headers['x-integration-test'],
        test_session: req.headers['x-test-session']
      };
    }
  }

  return metadata;
}

/**
 * Validate test mode consistency between related records
 * Ensures that child records have the same test mode as their parents
 *
 * @param {number} parentTestMode - Parent record's is_test value (0 or 1)
 * @param {number} childTestMode - Child record's is_test value (0 or 1)
 * @param {string} parentType - Type of parent record (e.g., 'transaction')
 * @param {string} childType - Type of child record (e.g., 'ticket')
 * @throws {Error} If test modes don't match
 */
export function validateTestModeConsistency(parentTestMode, childTestMode, parentType, childType) {
  if (parentTestMode !== childTestMode) {
    throw new Error(
      `Test mode mismatch: ${childType} test mode (${childTestMode}) must match ${parentType} test mode (${parentTestMode})`
    );
  }
}

/**
 * REMOVED: createTestModeFilter()
 * Reason: Admin portal should show ALL data (test + production) at all times.
 * Filtering should only be controlled by UI elements, not automatic code logic.
 */

/**
 * REMOVED: validateDataAccess()
 * Reason: No automatic data access restrictions. All data is accessible in admin portal.
 */

/**
 * Sanitize data record for safe logging in test mode
 * Removes sensitive information before logging
 *
 * @param {Object} record - Data record to sanitize
 * @returns {Object} Sanitized record safe for logging
 */
export function sanitizeRecordForLogging(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const sanitized = { ...record };

  // Remove or mask sensitive fields
  const sensitiveFields = [
    'email', 'attendee_email', 'payment_intent_id', 'session_token',
    'stripe_session_id', 'credit_card_last4', 'billing_address'
  ];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      if (field === 'email' || field === 'attendee_email') {
        // Mask email addresses
        const email = sanitized[field];
        if (email.includes('@')) {
          const [local, domain] = email.split('@');
          sanitized[field] = `${local.substring(0, 2)}***@${domain}`;
        }
      } else {
        // Replace other sensitive fields with placeholder
        sanitized[field] = '[REDACTED]';
      }
    }
  });

  return sanitized;
}

/**
 * Log test mode operation for debugging and monitoring with security considerations
 *
 * @param {string} operation - Operation being performed
 * @param {boolean|Object} detailsOrIsTest - Either boolean isTest flag OR details object (for backward compatibility)
 * @param {Object} detailsOrReq - Either details object OR request object (depends on 2nd param)
 */
export function logTestModeOperation(operation, detailsOrIsTest = {}, detailsOrReq = null) {
  // Handle both calling conventions:
  // 1. New: logTestModeOperation(message, isTest, details)
  // 2. Old: logTestModeOperation(operation, details, req)
  let isTest, details, req;

  if (typeof detailsOrIsTest === 'boolean') {
    // New convention: (message, isTest, details)
    isTest = detailsOrIsTest;
    details = detailsOrReq || {};
    req = null;
  } else {
    // Old convention: (operation, details, req)
    isTest = isTestMode(detailsOrReq);
    details = detailsOrIsTest || {};
    req = detailsOrReq;
  }

  // Only log in test mode OR development
  if (isTest || process.env.NODE_ENV !== 'production') {
    // Sanitize details before logging to prevent sensitive data exposure
    const sanitizedDetails = sanitizeRecordForLogging(details);

    // Sanitize operation message (redact email addresses)
    const sanitizedOperation = operation.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      '[EMAIL_REDACTED]'
    );

    const logPrefix = isTest ? '[TEST MODE]' : '[DEV]';
    console.log(`${logPrefix} ${sanitizedOperation}:`, {
      ...sanitizedDetails,
      timestamp: new Date().toISOString(),
      test_context: req ? createTestModeMetadata(req).test_context : { environment: process.env.NODE_ENV }
    });
  }
}

/**
 * Create test data cleanup criteria for scheduled cleanup operations
 *
 * @param {Object} options - Cleanup options
 * @returns {Object} Cleanup criteria for test_data_cleanup_log table
 */
export function createTestDataCleanupCriteria(options = {}) {
  const defaults = {
    max_age_days: 30,
    exclude_recent_hours: 24,
    max_records: 1000,
    cleanup_priority: 'scheduled'
  };

  const criteria = { ...defaults, ...options };

  return {
    criteria: JSON.stringify(criteria),
    sql_filter: `
      is_test = 1
      AND created_at < datetime('now', '-${criteria.max_age_days} days')
      AND created_at < datetime('now', '-${criteria.exclude_recent_hours} hours')
    `,
    description: `Test data older than ${criteria.max_age_days} days (excluding last ${criteria.exclude_recent_hours} hours)`
  };
}

/**
 * Extract test mode information from Stripe session for webhook processing
 *
 * @param {Object} stripeSession - Stripe checkout session object
 * @returns {Object} Test mode information
 */
export function extractTestModeFromStripeSession(stripeSession) {
  const testMode = {
    is_test: 0,
    stripe_test_mode: false,
    metadata_test_mode: false
  };

  // Check if Stripe session is in test mode
  if (stripeSession.livemode === false) {
    testMode.stripe_test_mode = true;
    testMode.is_test = 1;
  }

  // Check metadata for test mode indicators
  if (stripeSession.metadata) {
    const hasTestMetadata =
      stripeSession.metadata.test === 'true' ||
      stripeSession.metadata.test_mode === 'true' ||
      stripeSession.metadata.e2e_test === 'true';

    if (hasTestMetadata) {
      testMode.metadata_test_mode = true;
      testMode.is_test = 1;
    }
  }

  return testMode;
}

/**
 * Extract test mode information from PayPal order for webhook processing
 *
 * @param {Object} paypalOrder - PayPal order object
 * @returns {Object} Test mode information
 */
export function extractTestModeFromPayPalOrder(paypalOrder) {
  const testMode = {
    is_test: 0,
    paypal_test_mode: false,
    metadata_test_mode: false
  };

  // Check if PayPal order ID contains sandbox indicators
  const orderId = paypalOrder.id || '';
  if (orderId.includes('SANDBOX') || orderId.startsWith('6')) {
    testMode.paypal_test_mode = true;
    testMode.is_test = 1;
  }

  // Check environment for sandbox mode
  const paypalApiUrl = process.env.PAYPAL_API_URL || '';
  if (paypalApiUrl.includes('sandbox')) {
    testMode.paypal_test_mode = true;
    testMode.is_test = 1;
  }

  // Check for test mode indicators in purchase units custom_id or invoice_id
  if (paypalOrder.purchase_units) {
    for (const unit of paypalOrder.purchase_units) {
      if (unit.custom_id?.includes('test') ||
          unit.invoice_id?.includes('TEST') ||
          unit.reference_id?.includes('TEST')) {
        testMode.metadata_test_mode = true;
        testMode.is_test = 1;
      }
    }
  }

  // Check application context for test indicators
  if (paypalOrder.application_context) {
    const returnUrl = paypalOrder.application_context.return_url || '';
    const cancelUrl = paypalOrder.application_context.cancel_url || '';

    if (returnUrl.includes('test_mode=true') ||
        cancelUrl.includes('test_mode=true') ||
        returnUrl.includes('localhost') ||
        returnUrl.includes('vercel.app')) {
      testMode.metadata_test_mode = true;
      testMode.is_test = 1;
    }
  }

  return testMode;
}

/**
 * Get environment-specific test mode configuration
 *
 * @returns {Object} Test mode configuration for current environment
 */
export function getTestModeConfig() {
  return {
    enabled: isTestMode(),
    environment: process.env.NODE_ENV,
    cleanup_enabled: process.env.TEST_DATA_CLEANUP_ENABLED !== 'false',
    cleanup_age_days: parseInt(process.env.TEST_DATA_CLEANUP_AGE_DAYS || '30'),
    cleanup_batch_size: parseInt(process.env.TEST_DATA_CLEANUP_BATCH_SIZE || '100'),
    logging_enabled: process.env.TEST_MODE_LOGGING !== 'false',
    strict_mode: process.env.TEST_MODE_STRICT === 'true' // Fail on test mode violations
  };
}

export default {
  isTestMode,
  getTestModeFlag,
  createTestModeMetadata,
  validateTestModeConsistency,
  sanitizeRecordForLogging,
  logTestModeOperation,
  createTestDataCleanupCriteria,
  extractTestModeFromStripeSession,
  extractTestModeFromPayPalOrder,
  getTestModeConfig
};