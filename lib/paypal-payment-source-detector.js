/**
 * PayPal Payment Source Detector
 * Extracts funding source (Venmo, PayPal Account, etc.) from PayPal API responses
 *
 * This utility helps distinguish between different payment methods that go through
 * PayPal's checkout flow, allowing proper attribution in database and analytics.
 */

/**
 * Detect payment processor from PayPal capture response
 * @param {Object} captureResponse - PayPal capture order response from Orders API v2
 * @returns {string} Payment processor: 'venmo' or 'paypal'
 *
 * @example
 * const response = await paypalService.captureOrder(orderId);
 * const processor = detectPaymentProcessor(response);
 * // processor = 'venmo' or 'paypal'
 */
export function detectPaymentProcessor(captureResponse) {
  try {
    // Navigate to payment source in capture response
    // Structure: purchase_units[0].payments.captures[0].payment_source
    const captures = captureResponse?.purchase_units?.[0]?.payments?.captures;
    const primaryCapture = captures?.[0];
    const paymentSource = primaryCapture?.payment_source;

    // Check if payment was funded by Venmo
    if (paymentSource?.venmo) {
      return 'venmo';
    }

    // Check if payment was from PayPal account (explicit check)
    if (paymentSource?.paypal) {
      return 'paypal';
    }

    // Default to PayPal for any other payment source or unknown
    // This ensures backward compatibility and safe fallback
    return 'paypal';

  } catch (error) {
    console.error('[PayPal Source Detector] Error detecting payment processor:', error);
    // Safe default in case of any parsing errors
    return 'paypal';
  }
}

/**
 * Extract detailed payment source information for logging and debugging
 * @param {Object} captureResponse - PayPal capture order response
 * @returns {Object} Payment source details with type and account info
 *
 * @example
 * const details = extractPaymentSourceDetails(response);
 * // For Venmo: { type: 'venmo', accountId: '...', userName: '...', email: '...' }
 * // For PayPal: { type: 'paypal', accountId: '...', email: '...' }
 */
export function extractPaymentSourceDetails(captureResponse) {
  try {
    const captures = captureResponse?.purchase_units?.[0]?.payments?.captures;
    const paymentSource = captures?.[0]?.payment_source;

    // Extract Venmo details
    if (paymentSource?.venmo) {
      return {
        type: 'venmo',
        accountId: paymentSource.venmo.account_id,
        userName: paymentSource.venmo.user_name,
        email: paymentSource.venmo.email_address,
        // Venmo-specific fields
        name: paymentSource.venmo.name ? {
          givenName: paymentSource.venmo.name.given_name,
          surname: paymentSource.venmo.name.surname
        } : undefined
      };
    }

    // Extract PayPal account details
    if (paymentSource?.paypal) {
      return {
        type: 'paypal',
        accountId: paymentSource.paypal.account_id,
        email: paymentSource.paypal.email_address,
        accountStatus: paymentSource.paypal.account_status,
        // PayPal-specific fields
        name: paymentSource.paypal.name ? {
          givenName: paymentSource.paypal.name.given_name,
          surname: paymentSource.paypal.name.surname
        } : undefined
      };
    }

    // Unknown or missing payment source
    return {
      type: 'unknown',
      note: 'Payment source not found in capture response'
    };

  } catch (error) {
    console.error('[PayPal Source Detector] Error extracting payment source details:', error);
    return {
      type: 'error',
      error: error.message
    };
  }
}

/**
 * Validate that a capture response has the expected PayPal structure
 * Useful for debugging integration issues
 * @param {Object} captureResponse - PayPal capture response to validate
 * @returns {Object} Validation result with isValid flag and any issues
 */
export function validateCaptureResponseStructure(captureResponse) {
  const issues = [];

  if (!captureResponse) {
    return {
      isValid: false,
      issues: ['Capture response is null or undefined']
    };
  }

  if (!captureResponse.purchase_units) {
    issues.push('Missing purchase_units array');
  }

  if (!captureResponse.purchase_units?.[0]?.payments) {
    issues.push('Missing payments object in first purchase unit');
  }

  if (!captureResponse.purchase_units?.[0]?.payments?.captures) {
    issues.push('Missing captures array in payments');
  }

  if (!captureResponse.purchase_units?.[0]?.payments?.captures?.[0]) {
    issues.push('Missing first capture in captures array');
  }

  const hasPaymentSource = captureResponse.purchase_units?.[0]?.payments?.captures?.[0]?.payment_source;
  if (!hasPaymentSource) {
    issues.push('Missing payment_source in capture - may be older API version');
  }

  return {
    isValid: issues.length === 0,
    issues: issues.length > 0 ? issues : null,
    hasPaymentSource: !!hasPaymentSource
  };
}
