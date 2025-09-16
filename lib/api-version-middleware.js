/**
 * API Version Middleware
 * Handles version detection, routing, and deprecation for A Lo Cubano Boulder Fest APIs
 *
 * IMPORTANT LOGGING AND MONITORING CONSIDERATIONS:
 *
 * Current Logging Approach:
 * - Uses simple console.log() for version usage tracking
 * - Logs to stdout/stderr (captured by Vercel's logging system)
 * - Basic request information included (method, URL, version, source)
 *
 * Production Recommendations:
 * 1. **Structured Logging**: Consider implementing structured logging (JSON format)
 *    with services like Winston, Pino, or Bunyan for better log analysis
 *
 * 2. **Log Aggregation**: Integrate with logging services like:
 *    - Vercel's built-in logging
 *    - External services: LogRocket, DataDog, New Relic, Sentry
 *    - ELK Stack (Elasticsearch, Logstash, Kibana)
 *
 * 3. **Metrics Collection**: Consider adding metrics for:
 *    - API version adoption rates
 *    - Deprecated endpoint usage frequency
 *    - Response times by version
 *    - Error rates by version
 *
 * 4. **Security Considerations**:
 *    - Avoid logging sensitive data (tokens, personal information)
 *    - Consider log rotation and retention policies
 *    - Implement rate limiting on logging to prevent log flooding
 *
 * Example Structured Logging Implementation:
 * ```javascript
 * const logger = winston.createLogger({
 *   format: winston.format.combine(
 *     winston.format.timestamp(),
 *     winston.format.json()
 *   ),
 *   transports: [new winston.transports.Console()]
 * });
 *
 * logger.info('API version usage', {
 *   method: req.method,
 *   url: req.url,
 *   version: versionInfo.version,
 *   source: versionInfo.source,
 *   userAgent: req.headers['user-agent'],
 *   timestamp: new Date().toISOString()
 * });
 * ```
 */

/**
 * Supported API versions configuration
 */
export const API_VERSIONS = {
  '1.0': {
    status: 'current',
    introduced: '2025-01-15',
    sunset: null,
    description: 'Initial versioned API - current production baseline'
  },
  '1.1': {
    status: 'development',
    introduced: null,
    sunset: null,
    description: 'Phase 3 enhancements - gallery optimization, performance metrics'
  },
  '2.0': {
    status: 'planned',
    introduced: null,
    sunset: null,
    description: 'Future major version - architectural improvements'
  }
};

/**
 * Default version when no version is specified
 */
export const DEFAULT_API_VERSION = '1.0';

/**
 * Extract API version from request
 * Supports multiple version detection methods:
 * 1. Path-based: /api/v1.0/endpoint
 * 2. Header-based: API-Version: 1.0
 * 3. Query parameter: ?api-version=1.0
 *
 * @param {Object} req - Request object
 * @returns {Object} Version detection result
 */
export function detectApiVersion(req) {
  let version = null;
  let source = 'default';

  // Method 1: Path-based version detection
  const pathMatch = req.url?.match(/^\/api\/v(\d+\.\d+)\//);
  if (pathMatch) {
    version = pathMatch[1];
    source = 'path';
  }

  // Method 2: Header-based version detection
  if (!version && req.headers['api-version']) {
    version = req.headers['api-version'];
    source = 'header';
  }

  // Method 3: Query parameter version detection
  if (!version && req.query?.['api-version']) {
    version = req.query['api-version'];
    source = 'query';
  }

  // Validate version exists
  if (version && !API_VERSIONS[version]) {
    return {
      valid: false,
      error: `Unsupported API version: ${version}`,
      supportedVersions: Object.keys(API_VERSIONS),
      requestedVersion: version
    };
  }

  // Use default if no version specified
  if (!version) {
    version = DEFAULT_API_VERSION;
    source = 'default';
  }

  // Check if version is available
  const versionConfig = API_VERSIONS[version];
  if (versionConfig.status === 'planned') {
    return {
      valid: false,
      error: `API version ${version} is not yet available`,
      supportedVersions: Object.keys(API_VERSIONS).filter(v =>
        API_VERSIONS[v].status !== 'planned'
      ),
      requestedVersion: version
    };
  }

  return {
    valid: true,
    version,
    source,
    config: versionConfig,
    isDeprecated: !!versionConfig.sunset,
    isDefault: source === 'default'
  };
}

/**
 * Add version-specific response headers
 *
 * @param {Object} res - Response object
 * @param {Object} versionInfo - Version detection result
 */
export function addVersionHeaders(res, versionInfo) {
  // Core version headers
  res.setHeader('API-Version', versionInfo.version);
  res.setHeader('API-Version-Source', versionInfo.source);

  // Supported versions
  res.setHeader('API-Supported-Versions', Object.keys(API_VERSIONS).join(', '));

  // Deprecation warnings
  if (versionInfo.isDeprecated) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', versionInfo.config.sunset);
    res.setHeader('Link', `</api/v${getLatestVersion()}/docs>; rel="successor-version"`);
  }

  // Default version guidance
  if (versionInfo.isDefault) {
    res.setHeader('API-Version-Note', 'Using default version. Consider specifying version explicitly.');
  }

  // Version documentation
  res.setHeader('Link', `</api/v${versionInfo.version}/docs>; rel="documentation"`);
}

/**
 * Get the latest available API version
 *
 * @returns {string} Latest version string
 */
export function getLatestVersion() {
  const availableVersions = Object.keys(API_VERSIONS)
    .filter(v => API_VERSIONS[v].status === 'current')
    .sort((a, b) => {
      const [aMajor, aMinor] = a.split('.').map(Number);
      const [bMajor, bMinor] = b.split('.').map(Number);
      return bMajor - aMajor || bMinor - aMinor;
    });

  return availableVersions[0] || DEFAULT_API_VERSION;
}

/**
 * Transform request for version-specific routing
 * Converts versioned paths to internal routing format
 *
 * @param {Object} req - Request object
 * @param {Object} versionInfo - Version detection result
 * @returns {Object} Transformed request info
 */
export function transformVersionedRequest(req, versionInfo) {
  let transformedUrl = req.url;

  // Remove version prefix from path for internal routing
  if (versionInfo.source === 'path') {
    const urlParts = transformedUrl.split("?");
    const pathPart = urlParts[0].replace(/^/api/vd+.d+//, "/api/");
    transformedUrl = pathPart + (urlParts[1] ? "?" + urlParts[1] : "");  }

  return {
    originalUrl: req.url,
    transformedUrl,
    version: versionInfo.version,
    internalPath: transformedUrl.replace('/api/', ''),
    versionPrefix: `/api/v${versionInfo.version}`
  };
}

/**
 * Create version-aware error response
 *
 * @param {Object} res - Response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object} versionInfo - Version information
 * @param {Object} additionalData - Additional error data
 */
export function createVersionedErrorResponse(res, statusCode, message, versionInfo, additionalData = {}) {
  addVersionHeaders(res, versionInfo);

  const errorResponse = {
    error: message,
    timestamp: new Date().toISOString(),
    version: versionInfo.version,
    ...additionalData
  };

  // Add version-specific error handling
  if (statusCode === 404) {
    errorResponse.suggestion = `Try /api/v${versionInfo.version}/docs for available endpoints`;
  }

  if (versionInfo.isDeprecated) {
    errorResponse.deprecationWarning = `API version ${versionInfo.version} is deprecated. Please migrate to v${getLatestVersion()}.`;
  }

  return res.status(statusCode).json(errorResponse);
}

/**
 * Middleware factory for API versioning
 * Returns a middleware function that handles version detection and routing
 *
 * LOGGING IMPLEMENTATION NOTES:
 *
 * Current Implementation:
 * - Uses console.log() for basic request logging
 * - Logs version usage patterns for analytics
 * - Captures basic request metadata
 *
 * Security and Performance Considerations:
 * 1. **Rate Limiting**: In high-traffic scenarios, consider throttling log output
 * 2. **Sensitive Data**: Ensure no sensitive information is logged
 * 3. **Log Volume**: Monitor log volume to prevent storage issues
 * 4. **Async Logging**: For high-performance needs, consider async logging
 *
 * Production Upgrade Path:
 * 1. Replace console.log with structured logger (Winston/Pino)
 * 2. Add correlation IDs for request tracking
 * 3. Implement log sampling for high-volume endpoints
 * 4. Add metrics collection for version adoption tracking
 *
 * @param {Object} options - Middleware options
 * @returns {Function} Middleware function
 */
export function createVersionMiddleware(options = {}) {
  const {
    strictVersioning = false,    // Require explicit version specification
    allowDeprecated = true,      // Allow requests to deprecated versions
    logVersionUsage = true       // Log version usage for analytics
  } = options;

  return function versionMiddleware(req, res, next) {
    // Only process API requests
    if (!req.url?.startsWith('/api/')) {
      return next();
    }

    // Detect API version
    const versionInfo = detectApiVersion(req);

    // Handle invalid versions
    if (!versionInfo.valid) {
      return createVersionedErrorResponse(
        res,
        400,
        versionInfo.error,
        { version: 'unknown', source: 'error', isDefault: false },
        { supportedVersions: versionInfo.supportedVersions }
      );
    }

    // Handle deprecated versions
    if (versionInfo.isDeprecated && !allowDeprecated) {
      return createVersionedErrorResponse(
        res,
        410,
        `API version ${versionInfo.version} is no longer supported`,
        versionInfo,
        { latestVersion: getLatestVersion() }
      );
    }

    // Handle strict versioning
    if (strictVersioning && versionInfo.isDefault) {
      return createVersionedErrorResponse(
        res,
        400,
        'API version must be explicitly specified',
        versionInfo,
        { supportedVersions: Object.keys(API_VERSIONS) }
      );
    }

    // Add version info to request
    req.apiVersion = versionInfo;
    req.versionedRequest = transformVersionedRequest(req, versionInfo);

    // Add response headers
    addVersionHeaders(res, versionInfo);

    // Log version usage
    // NOTE: Current implementation uses console.log for simplicity
    // For production, consider:
    // 1. Structured logging with JSON format
    // 2. Async logging to prevent blocking
    // 3. Log sampling for high-volume endpoints
    // 4. Integration with monitoring services
    if (logVersionUsage) {
      console.log(`[API] ${req.method} ${req.url} - Version: ${versionInfo.version} (${versionInfo.source})`);
    }

    return next();
  };
}

/**
 * Check if a feature is available in the specified API version
 *
 * @param {string} feature - Feature identifier
 * @param {string} version - API version
 * @returns {boolean} Feature availability
 */
export function isFeatureAvailable(feature, version) {
  const featureMatrix = {
    'gallery-optimization': ['1.1', '2.0'],
    'performance-metrics': ['1.1', '2.0'],
    'enhanced-analytics': ['2.0'],
    'webhook-v2': ['2.0']
  };

  return featureMatrix[feature]?.includes(version) || false;
}

/**
 * Version-aware response helper
 * Modifies response based on API version capabilities
 *
 * @param {Object} data - Response data
 * @param {string} version - API version
 * @returns {Object} Version-appropriate response
 */
export function createVersionedResponse(data, version) {
  const response = { ...data };

  // Add version-specific metadata
  response._meta = {
    version,
    timestamp: new Date().toISOString(),
    ...(response._meta || {})
  };

  // Version-specific data transformations
  if (version === '1.0') {
    // Remove features not available in v1.0
    delete response.performanceMetrics;
    delete response.enhancedAnalytics;
  }

  return response;
}