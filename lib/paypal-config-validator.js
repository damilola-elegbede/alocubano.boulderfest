/**
 * PayPal Configuration Validator
 *
 * Validates PayPal environment configuration to catch common issues:
 * - Missing credentials
 * - Sandbox vs production URL mismatches
 * - Inconsistent environment settings
 */

const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';
const PRODUCTION_URL = 'https://api-m.paypal.com';

/**
 * Validates PayPal configuration and returns detailed status
 * @returns {Object} Validation result with warnings and errors
 */
export function validatePayPalConfig() {
  const config = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    apiUrl: process.env.PAYPAL_API_URL || SANDBOX_URL,
    mode: process.env.PAYPAL_MODE || 'sandbox'
  };

  const errors = [];
  const warnings = [];
  const info = [];

  // Check for missing credentials
  if (!config.clientId) {
    errors.push('PAYPAL_CLIENT_ID is not set');
  }
  if (!config.clientSecret) {
    errors.push('PAYPAL_CLIENT_SECRET is not set');
  }

  // Check for environment consistency
  const apiUrlIsSandbox = config.apiUrl.includes('sandbox');
  const modeIsSandbox = config.mode === 'sandbox';

  if (apiUrlIsSandbox !== modeIsSandbox) {
    errors.push(
      `Environment mismatch: PAYPAL_API_URL (${apiUrlIsSandbox ? 'sandbox' : 'production'}) ` +
      `does not match PAYPAL_MODE (${config.mode})`
    );
  }

  // Warn about defaults
  if (!process.env.PAYPAL_API_URL) {
    warnings.push(
      `PAYPAL_API_URL not set, defaulting to sandbox (${SANDBOX_URL}). ` +
      `For production, set to ${PRODUCTION_URL}`
    );
  }

  if (!process.env.PAYPAL_MODE) {
    warnings.push(
      'PAYPAL_MODE not set, defaulting to sandbox. For production, set to "production"'
    );
  }

  // Warn about production risks
  if (!apiUrlIsSandbox && process.env.NODE_ENV !== 'production') {
    warnings.push(
      'Using production PayPal URL in non-production environment. ' +
      'This may cause issues with test transactions.'
    );
  }

  // Info about current configuration
  info.push(`Mode: ${config.mode}`);
  info.push(`API URL: ${config.apiUrl}`);
  info.push(`Credentials: ${config.clientId ? 'Configured' : 'Missing'}`);

  return {
    valid: errors.length === 0,
    config,
    errors,
    warnings,
    info
  };
}

/**
 * Ensures PayPal configuration is valid, throws if not
 * @param {Object} logger - Optional logger for warnings
 * @throws {Error} If configuration is invalid
 */
export function ensureValidPayPalConfig(logger = console) {
  const validation = validatePayPalConfig();

  // Log warnings
  if (validation.warnings.length > 0 && logger) {
    validation.warnings.forEach(warning => {
      logger.warn('[PayPal Config]', warning);
    });
  }

  // Throw on errors
  if (!validation.valid) {
    const errorMessage = [
      'Invalid PayPal configuration:',
      ...validation.errors.map(err => `  - ${err}`),
      '',
      'Current configuration:',
      ...validation.info.map(info => `  ${info}`),
      '',
      'Please set the following environment variables in Vercel:',
      '  - PAYPAL_CLIENT_ID (required)',
      '  - PAYPAL_CLIENT_SECRET (required)',
      '  - PAYPAL_API_URL (production: https://api-m.paypal.com)',
      '  - PAYPAL_MODE (production: "production")'
    ].join('\n');

    throw new Error(errorMessage);
  }

  return validation;
}

/**
 * Gets PayPal environment info for debugging
 * @returns {Object} Environment information (safe for logging)
 */
export function getPayPalEnvironmentInfo() {
  const apiUrl = process.env.PAYPAL_API_URL || SANDBOX_URL;
  const mode = process.env.PAYPAL_MODE || 'sandbox';

  return {
    mode,
    apiUrl,
    isSandbox: apiUrl.includes('sandbox'),
    hasCredentials: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    configuredExplicitly: !!(process.env.PAYPAL_API_URL && process.env.PAYPAL_MODE)
  };
}

/**
 * Detects likely configuration issues based on error response
 * @param {Response} response - Fetch response from PayPal API
 * @returns {string} Helpful error message
 */
export async function diagnoseAuthError(response) {
  const env = getPayPalEnvironmentInfo();
  const status = response.status;

  let diagnosis = `PayPal authentication failed (${status})`;

  if (status === 401) {
    if (env.isSandbox && !env.configuredExplicitly) {
      diagnosis += '\n\nLikely cause: Using sandbox URL with production credentials.';
      diagnosis += '\nSolution: Set PAYPAL_API_URL=https://api-m.paypal.com and PAYPAL_MODE=production';
    } else if (!env.hasCredentials) {
      diagnosis += '\n\nLikely cause: Missing PayPal credentials.';
      diagnosis += '\nSolution: Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET';
    } else {
      diagnosis += '\n\nLikely cause: Invalid credentials or expired client secret.';
      diagnosis += '\nSolution: Verify credentials in PayPal Developer Dashboard';
    }
  } else if (status === 403) {
    diagnosis += '\n\nLikely cause: Valid credentials but insufficient permissions.';
    diagnosis += '\nSolution: Check PayPal app permissions in Developer Dashboard';
  }

  diagnosis += '\n\nCurrent configuration:';
  diagnosis += `\n  Mode: ${env.mode}`;
  diagnosis += `\n  API URL: ${env.apiUrl}`;
  diagnosis += `\n  Credentials: ${env.hasCredentials ? 'Configured' : 'Missing'}`;

  return diagnosis;
}
