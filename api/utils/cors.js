/**
 * CORS configuration utility for API endpoints
 */

// Default allowed origins
const DEFAULT_ALLOWED_ORIGINS = [
  'https://alocubano.boulderfest.com',
  'https://www.alocubano.boulderfest.com'
];

// Add development origins if in development mode
if (
  process.env.NODE_ENV === 'development' ||
  process.env.VERCEL_ENV === 'preview'
) {
  DEFAULT_ALLOWED_ORIGINS.push(
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080'
  );
}

/**
 * Get allowed origins from environment or use defaults
 * @returns {Array<string>} Array of allowed origins
 */
export function getAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map((origin) =>
      origin.trim()
    );
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Validate if an origin is allowed
 * @param {string} origin - The origin to validate
 * @returns {boolean} Whether the origin is allowed
 */
export function isOriginAllowed(origin) {
  if (!origin) {
    return false;
  }

  const allowedOrigins = getAllowedOrigins();

  // Check if origin is in allowed list
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check for Vercel preview deployments
  if (process.env.VERCEL_ENV === 'preview' && origin.includes('.vercel.app')) {
    return true;
  }

  return false;
}

/**
 * Set CORS headers on response
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} options - CORS options
 */
export function setCorsHeaders(req, res, options = {}) {
  const origin = req.headers.origin;

  // Only set Access-Control-Allow-Origin if the origin is allowed
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Set other CORS headers
  res.setHeader(
    'Access-Control-Allow-Methods',
    options.methods || 'GET, POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    options.headers || 'Content-Type, Authorization'
  );

  res.setHeader(
    'Access-Control-Max-Age',
    options.maxAge || '86400' // 24 hours
  );
}

/**
 * CORS middleware for handling preflight requests
 * @param {Object} options - CORS options
 * @returns {Function} Middleware function
 */
export function corsMiddleware(options = {}) {
  return (req, res, next) => {
    // Set CORS headers
    setCorsHeaders(req, res, options);

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Continue to next middleware
    if (next) {
      next();
    }
  };
}

/**
 * Apply CORS to a handler function
 * @param {Function} handler - The handler function
 * @param {Object} options - CORS options
 * @returns {Function} Handler with CORS
 */
export function withCors(handler, options = {}) {
  return async function corsHandler(req, res) {
    // Set CORS headers
    setCorsHeaders(req, res, options);

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Continue with original handler
    return handler(req, res);
  };
}

export default {
  getAllowedOrigins,
  isOriginAllowed,
  setCorsHeaders,
  corsMiddleware,
  withCors
};
