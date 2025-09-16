/**
 * Legacy API Proxy
 * Provides backward compatibility for unversioned API endpoints
 * by forwarding requests to versioned implementations
 */

import {
  detectApiVersion,
  addVersionHeaders,
  createVersionedErrorResponse,
  DEFAULT_API_VERSION
} from "./api-version-middleware.js";

/**
 * Legacy endpoint mapping to versioned equivalents
 * Maps unversioned paths to their v1.0 counterparts
 */
const LEGACY_ENDPOINT_MAP = {
  // Email endpoints
  'email/subscribe': 'v1.0/email/subscribe',
  'email/unsubscribe': 'v1.0/email/unsubscribe',
  'email/brevo-webhook': 'v1.0/email/brevo-webhook',

  // Gallery endpoints
  'gallery': 'v1.0/gallery',
  'gallery/years': 'v1.0/gallery/years',
  'featured-photos': 'v1.0/featured-photos',

  // Health endpoints
  'health/check': 'v1.0/health/check',
  'health/database': 'v1.0/health/database',
  'health/ping': 'v1.0/health/ping',

  // Admin endpoints
  'admin/login': 'v1.0/admin/login',
  'admin/dashboard': 'v1.0/admin/dashboard',
  'admin/registrations': 'v1.0/admin/registrations',

  // Payment endpoints
  'payments/create-checkout-session': 'v1.0/payments/create-checkout-session',
  'payments/stripe-webhook': 'v1.0/payments/stripe-webhook',
  'payments/checkout-success': 'v1.0/payments/checkout-success',

  // Ticket endpoints
  'tickets/validate': 'v1.0/tickets/validate',
  'tickets/register': 'v1.0/tickets/register',
  'tickets/apple-wallet': 'v1.0/tickets/apple-wallet',
  'tickets/google-wallet': 'v1.0/tickets/google-wallet',

  // Registration endpoints
  'registration/batch': 'v1.0/registration/batch',
  'registration/health': 'v1.0/registration/health'
};

/**
 * Endpoints that should remain unversioned for now
 * These are utility or special-purpose endpoints
 */
const UNVERSIONED_ENDPOINTS = new Set([
  'migrate',
  'robots',
  'sitemap.xml',
  'debug',
  'cache-warm',
  'utils/cors',
  'utils/rate-limiter',
  'monitoring/alerts',
  'monitoring/dashboard',
  'monitoring/metrics',
  'performance-metrics',
  'config/stripe-public'
]);

/**
 * Get the deprecation timeline for legacy endpoints
 */
function getDeprecationInfo() {
  const currentDate = new Date();
  const sunsetDate = new Date(currentDate);
  sunsetDate.setMonth(sunsetDate.getMonth() + 6); // 6 months from now

  return {
    deprecated: true,
    sunsetDate: sunsetDate.toISOString(),
    migrationGuide: '/api/docs/migration',
    recommendation: `Use /api/v${DEFAULT_API_VERSION}/ prefix for new integrations`
  };
}

/**
 * Create proxy request for versioned endpoint
 * @param {Object} req - Original request
 * @param {string} versionedPath - Path to versioned endpoint
 * @returns {Object} Proxy request configuration
 */
function createProxyRequest(req, versionedPath) {
  // Import the versioned handler dynamically
  const handlerPath = `../api/${versionedPath}.js`;

  return {
    originalPath: req.url,
    versionedPath: `/api/${versionedPath}`,
    handlerPath,
    proxyHeaders: {
      'X-Legacy-Proxy': 'true',
      'X-Original-Path': req.url,
      'X-Versioned-Path': `/api/${versionedPath}`
    }
  };
}

/**
 * Check if an endpoint should be proxied to a versioned implementation
 * @param {string} requestPath - The request path (without /api/ prefix)
 * @returns {Object} Proxy decision and configuration
 */
export function shouldProxyToVersioned(requestPath) {
  // Remove any dynamic parameters for mapping lookup
  const normalizedPath = requestPath.replace(/\/\[.*?\]/g, '/[param]');

  // Check if this endpoint should remain unversioned
  if (UNVERSIONED_ENDPOINTS.has(normalizedPath)) {
    return {
      shouldProxy: false,
      reason: 'endpoint-excluded',
      endpoint: normalizedPath
    };
  }

  // Check for exact mapping
  if (LEGACY_ENDPOINT_MAP[normalizedPath]) {
    return {
      shouldProxy: true,
      versionedPath: LEGACY_ENDPOINT_MAP[normalizedPath],
      deprecationInfo: getDeprecationInfo(),
      mapping: 'exact'
    };
  }

  // Check for pattern-based mapping (e.g., tickets/[ticketId])
  for (const [pattern, versionedPath] of Object.entries(LEGACY_ENDPOINT_MAP)) {
    const regexPattern = pattern.replace(/\[.*?\]/g, '[^/]+');
    const regex = new RegExp(`^${regexPattern}$`);

    if (regex.test(normalizedPath)) {
      return {
        shouldProxy: true,
        versionedPath: versionedPath.replace('[param]', requestPath.match(/\[([^\]]+)\]/)?.[1] || 'param'),
        deprecationInfo: getDeprecationInfo(),
        mapping: 'pattern'
      };
    }
  }

  // No mapping found - let the original handler process it
  return {
    shouldProxy: false,
    reason: 'no-mapping',
    endpoint: normalizedPath
  };
}

/**
 * Add deprecation headers to legacy API responses
 * @param {Object} res - Response object
 * @param {Object} deprecationInfo - Deprecation information
 */
export function addDeprecationHeaders(res, deprecationInfo) {
  if (deprecationInfo) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', deprecationInfo.sunsetDate);
    res.setHeader('Link', `<${deprecationInfo.migrationGuide}>; rel="migration-guide"`);
    res.setHeader('X-API-Recommendation', deprecationInfo.recommendation);
  }
}

/**
 * Log legacy API usage for analytics
 * @param {Object} req - Request object
 * @param {Object} proxyInfo - Proxy information
 */
export function logLegacyUsage(req, proxyInfo) {
  const userAgent = req.headers['user-agent']?.substring(0, 100) || 'unknown';
  const referer = req.headers['referer'] || 'unknown';

  console.log('[Legacy API]', {
    timestamp: new Date().toISOString(),
    method: req.method,
    originalPath: req.url,
    versionedPath: proxyInfo.versionedPath,
    userAgent,
    referer: referer.substring(0, 100),
    mapping: proxyInfo.mapping,
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  });
}

/**
 * Create a middleware function that handles legacy API proxying
 * @param {Object} options - Middleware options
 * @returns {Function} Middleware function
 */
export function createLegacyProxyMiddleware(options = {}) {
  const {
    enableLogging = true,
    enforceDeprecation = false
  } = options;

  return async function legacyProxyMiddleware(req, res, next) {
    // Only process API requests
    if (!req.url?.startsWith('/api/')) {
      return next();
    }

    // Skip versioned endpoints
    if (req.url.match(/^\/api\/v\d+\.\d+\//)) {
      return next();
    }

    // Extract the endpoint path
    const endpointPath = req.url.replace(/^\/api\//, '').split('?')[0];

    // Check if this endpoint should be proxied
    const proxyInfo = shouldProxyToVersioned(endpointPath);

    if (!proxyInfo.shouldProxy) {
      // Continue with original handler
      return next();
    }

    // Log legacy usage if enabled
    if (enableLogging) {
      logLegacyUsage(req, proxyInfo);
    }

    // Add deprecation headers
    addDeprecationHeaders(res, proxyInfo.deprecationInfo);

    // If enforcing deprecation, return error instead of proxying
    if (enforceDeprecation) {
      const versionInfo = {
        version: 'legacy',
        source: 'deprecated',
        isDefault: false,
        isDeprecated: true,
        config: { sunset: proxyInfo.deprecationInfo.sunsetDate }
      };

      return createVersionedErrorResponse(
        res,
        410,
        'This API endpoint has been deprecated. Please use the versioned API.',
        versionInfo,
        {
          versionedEndpoint: proxyInfo.versionedPath,
          migrationGuide: proxyInfo.deprecationInfo.migrationGuide
        }
      );
    }

    // Add proxy headers
    // Add proxy headers using Object.assign for cleaner application
    Object.assign(req.headers, 
      Object.fromEntries(
        Object.entries(createProxyRequest(req, proxyInfo.versionedPath).proxyHeaders)
          .map(([key, value]) => [key.toLowerCase(), value])
      )
    );
    // Modify the request URL to point to the versioned endpoint
    req.url = `/api/${proxyInfo.versionedPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

    // Continue to the versioned handler
    return next();
  };
}

/**
 * Get list of all legacy endpoints that will be deprecated
 * @returns {Object} Comprehensive mapping information
 */
export function getLegacyEndpointList() {
  return {
    mappedEndpoints: Object.keys(LEGACY_ENDPOINT_MAP).length,
    unversionedEndpoints: Array.from(UNVERSIONED_ENDPOINTS).length,
    totalLegacyEndpoints: Object.keys(LEGACY_ENDPOINT_MAP).length + Array.from(UNVERSIONED_ENDPOINTS).length,
    deprecationInfo: getDeprecationInfo(),
    endpointMap: LEGACY_ENDPOINT_MAP,
    excludedEndpoints: Array.from(UNVERSIONED_ENDPOINTS)
  };
}