/**
 * Comprehensive Security Headers System
 * Implements HTTPS enforcement, CSP, HSTS, and security headers using Helmet.js
 * Target: A+ rating from security testing tools
 */

import helmet from "helmet";

/**
 * Environment configuration
 */
function isProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function isDevelopment() {
  return (
    process.env.VERCEL_ENV === "development" ||
    process.env.NODE_ENV === "development"
  );
}

const reportUri = process.env.CSP_REPORT_URI || "/api/security/csp-report";

/**
 * Trusted domains for Content Security Policy
 */
export const TRUSTED_DOMAINS = {
  stripe: [
    "https://js.stripe.com",
    "https://checkout.stripe.com",
    "https://api.stripe.com",
    "https://q.stripe.com",
    "https://m.stripe.network",
  ],
  brevo: [
    "https://sibforms.com",
    "https://sibautomation.com",
    "https://*.sendinblue.com",
    "https://api.brevo.com",
  ],
  analytics: [
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://googletagmanager.com",
  ],
  cdn: [
    "https://cdnjs.cloudflare.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://unpkg.com",
  ],
  vercel: ["https://vercel.live", "*.vercel.app"],
};

/**
 * Strict Content Security Policy configuration
 * Prevents XSS attacks while allowing necessary third-party services
 */
function buildCSP() {
  const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'", // Required for Stripe and inline scripts
      ...TRUSTED_DOMAINS.stripe,
      ...TRUSTED_DOMAINS.analytics,
      ...TRUSTED_DOMAINS.cdn,
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Required for dynamic styles and Stripe
      ...TRUSTED_DOMAINS.cdn,
      ...TRUSTED_DOMAINS.stripe,
    ],
    imgSrc: ["'self'", "data:", "blob:", "https:", ...TRUSTED_DOMAINS.stripe],
    fontSrc: ["'self'", "data:", ...TRUSTED_DOMAINS.cdn],
    connectSrc: [
      "'self'",
      ...TRUSTED_DOMAINS.stripe,
      ...TRUSTED_DOMAINS.brevo,
      ...TRUSTED_DOMAINS.analytics,
      ...TRUSTED_DOMAINS.vercel,
    ],
    frameSrc: ["'self'", ...TRUSTED_DOMAINS.stripe],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'", ...TRUSTED_DOMAINS.stripe, ...TRUSTED_DOMAINS.brevo],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    workerSrc: ["'self'", "blob:"],
    childSrc: ["'self'", "blob:"],
    manifestSrc: ["'self'"],
    ...(isProduction() && { upgradeInsecureRequests: true }),
    reportUri: reportUri,
  };

  // In development, relax some restrictions for debugging
  if (isDevelopment()) {
    cspDirectives.scriptSrc.push("'unsafe-eval'");
    cspDirectives.connectSrc.push(
      "ws:",
      "wss:",
      "http://localhost:*",
      "https://localhost:*",
    );
  }

  return cspDirectives;
}

/**
 * Comprehensive Permissions Policy configuration
 * Restricts dangerous browser features
 */
const PERMISSIONS_POLICY = {
  accelerometer: [],
  ambientLightSensor: [],
  autoplay: [],
  battery: [],
  camera: [],
  crossOriginIsolated: [],
  displayCapture: [],
  documentDomain: [],
  encryptedMedia: [],
  executionWhileNotRendered: [],
  executionWhileOutOfViewport: [],
  fullscreen: ["self"],
  geolocation: [],
  gyroscope: [],
  magnetometer: [],
  microphone: [],
  midi: [],
  navigationOverride: [],
  payment: isProduction() ? ["self"] : [], // Allow payments in production
  pictureInPicture: [],
  publickeyCredentialsGet: [],
  screenWakeLock: [],
  syncXhr: [],
  usb: [],
  webShare: ["self"],
  xrSpatialTracking: [],
};

/**
 * HSTS configuration with 2-year max-age and preload
 */
const HSTS_CONFIG = {
  maxAge: 63072000, // 2 years in seconds
  includeSubDomains: true,
  preload: true,
};

/**
 * Main security headers configuration using Helmet.js
 */
export function getHelmetConfig() {
  return {
    // Content Security Policy
    contentSecurityPolicy: {
      useDefaults: false,
      directives: buildCSP(),
    },

    // HTTP Strict Transport Security
    hsts: isProduction() ? HSTS_CONFIG : false,

    // X-Frame-Options
    frameguard: {
      action: "deny",
    },

    // X-Content-Type-Options
    noSniff: true,

    // X-XSS-Protection is handled manually below since xssFilter was removed in Helmet v7

    // Referrer Policy
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },

    // Permissions Policy is handled manually below due to Helmet config issues

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
      allow: false,
    },

    // X-Download-Options
    ieNoOpen: true,

    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: false,

    // Origin-Agent-Cluster
    originAgentCluster: true,

    // Cross-Origin-Embedder-Policy
    crossOriginEmbedderPolicy: false, // Disabled for compatibility with third-party embeds

    // Cross-Origin-Opener-Policy
    crossOriginOpenerPolicy: {
      policy: "same-origin",
    },

    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: {
      policy: "cross-origin", // Allow cross-origin for API usage
    },
  };
}

/**
 * API-specific security headers with caching controls
 */
export function addAPISecurityHeaders(req, res, options = {}) {
  const {
    maxAge = 0,
    apiVersion = "v1",
    allowCredentials = false,
    corsOrigins = ["https://alocubanoboulderfest.vercel.app"],
    etag = null,
  } = options;

  // Cache control for API responses
  if (maxAge > 0) {
    res.setHeader(
      "Cache-Control",
      `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=60`,
    );
    // Only set ETag if explicitly provided by caller to ensure cache stability
    if (etag) {
      res.setHeader("ETag", etag);
    }
  } else {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  // API versioning headers
  res.setHeader("X-API-Version", apiVersion);
  res.setHeader("X-Content-Type-Options", "nosniff");

  // CORS headers for API endpoints
  if (corsOrigins.length > 0) {
    const requestOrigin = req?.headers?.origin;

    if (requestOrigin && corsOrigins.includes(requestOrigin)) {
      // Echo the requesting origin if it's in the allowlist
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
    } else if (corsOrigins.length === 1 && !requestOrigin) {
      // Fallback to first origin only if no request origin (e.g., server-side requests)
      res.setHeader("Access-Control-Allow-Origin", corsOrigins[0]);
      res.setHeader("Vary", "Origin");
    } else {
      // Always set Vary: Origin for proper caching behavior
      res.setHeader("Vary", "Origin");
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, X-API-Key, X-CSRF-Token",
    );

    if (allowCredentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  // Rate limiting headers are handled by rate limiter middleware
  // Remove hard-coded rate limit headers to avoid conflicts

  // Security headers
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  return res;
}

/**
 * CSRF protection setup
 */
export function addCSRFHeaders(res, token) {
  res.setHeader("X-CSRF-Token", token);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "X-CSRF-Token, Origin, X-Requested-With");

  return res;
}

/**
 * Format Permissions Policy for header
 */
function formatPermissionsPolicy(policy) {
  return Object.entries(policy)
    .map(([feature, allowlist]) => {
      const formattedAllowlist =
        allowlist.length === 0 ? "()" : `(${allowlist.join(" ")})`;
      return `${feature.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}=${formattedAllowlist}`;
    })
    .join(", ");
}

/**
 * Apply Helmet.js security headers
 */
export function applySecurityHeaders(req, res) {
  const helmetMiddleware = helmet(getHelmetConfig());

  return new Promise((resolve, reject) => {
    helmetMiddleware(req, res, (error) => {
      if (error) {
        reject(error);
      } else {
        // Add headers that were removed from Helmet config
        res.setHeader("X-XSS-Protection", "1; mode=block");
        res.setHeader(
          "Permissions-Policy",
          formatPermissionsPolicy(PERMISSIONS_POLICY),
        );
        resolve();
      }
    });
  });
}

/**
 * Enhanced security headers with HTTPS enforcement
 */
export async function addSecurityHeaders(req, res, options = {}) {
  const { isAPI = false, maxAge = 0, apiVersion = "v1" } = options;

  // Apply Helmet.js headers via mock request/response
  const mockReq = { headers: {}, url: "/" };
  const mockRes = {
    setHeader: (name, value) => res.setHeader(name, value),
    getHeader: (name) => res.getHeader(name),
    removeHeader: (name) => res.removeHeader(name),
  };

  try {
    await applySecurityHeaders(mockReq, mockRes);
  } catch (error) {
    console.error("Failed to apply Helmet security headers:", error);
    // Fallback to basic headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
  }

  // Add API-specific headers if needed
  if (isAPI) {
    addAPISecurityHeaders(req, res, { maxAge, apiVersion });
  }

  // Add custom application headers
  res.setHeader("X-Application", "ALocubanoBoulderfest");
  res.setHeader("X-Security-Level", "Strict");

  // Server information hiding
  res.removeHeader("X-Powered-By");
  res.setHeader("Server", "Vercel");

  return res;
}

/**
 * Wrap handler with comprehensive security headers
 */
export function withSecurityHeaders(handler, options = {}) {
  return async (req, res) => {
    try {
      await addSecurityHeaders(req, res, options);
      return await handler(req, res);
    } catch (error) {
      console.error("Security headers middleware error:", error);
      // Continue with handler even if security headers fail
      return await handler(req, res);
    }
  };
}

/**
 * Legacy function for backwards compatibility
 */
export function addBasicSecurityHeaders(res) {
  // Basic security headers for backwards compatibility
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (isProduction()) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return res;
}

export default {
  addSecurityHeaders,
  addAPISecurityHeaders,
  addCSRFHeaders,
  withSecurityHeaders,
  getHelmetConfig,
  applySecurityHeaders,
  TRUSTED_DOMAINS,
  isProduction: isProduction(),
  isDevelopment: isDevelopment(),
};
