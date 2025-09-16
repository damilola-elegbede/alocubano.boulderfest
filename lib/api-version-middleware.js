/**
 * API Version Middleware
 * Handles version detection, routing, and deprecation for A Lo Cubano Boulder Fest APIs
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
    transformedUrl = transformedUrl.replace(/^\/api\/v\d+\.\d+\//, '/api/');
  }

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