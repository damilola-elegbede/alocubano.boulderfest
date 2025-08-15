import * as Sentry from "@sentry/node";

// Patterns for sensitive data that must be sanitized
const SENSITIVE_PATTERNS = {
  email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
  phone:
    /(\+?[0-9]{1,4}[-.\s]?)?((\([0-9]{1,3}\)|[0-9]{1,3})[-.\s]?)?([0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9})/g,
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
  apiKey:
    /(api[_-]?key|apikey|secret|token|password|auth|bearer|jwt)[\s:="']*([a-zA-Z0-9_\-\.]+)/gi,
  stripeToken:
    /(tok|card|cus|sub|pi|pm|price|prod|sku|tax|src|ch|ba)_[a-zA-Z0-9]{24,}/g,
  dbConnection: /(mongodb|postgres|mysql|redis|sqlite):\/\/[^\s]+/gi,
  ipAddress:
    /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  customerId:
    /(customer_id|customerId|user_id|userId)[\s:="']*([a-zA-Z0-9_\-]+)/gi,
};

// Fields that should be completely removed from events
const BLOCKED_FIELDS = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "authorization",
  "auth",
  "bearer",
  "creditCard",
  "credit_card",
  "cc",
  "cvv",
  "cvc",
  "ssn",
  "social_security",
  "tax_id",
  "bank_account",
  "routing_number",
  "iban",
  "swift",
  "private_key",
  "privateKey",
];

/**
 * Recursively sanitize an object, removing or masking sensitive data
 */
function sanitizeObject(obj, depth = 0) {
  if (depth > 10) return "[MAX_DEPTH_EXCEEDED]"; // Prevent infinite recursion
  if (!obj) return obj;

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if field should be blocked
      const lowerKey = key.toLowerCase();
      if (BLOCKED_FIELDS.some((field) => lowerKey.includes(field))) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize a string value, replacing sensitive patterns
 */
function sanitizeString(str) {
  if (typeof str !== "string") return str;

  let sanitized = str;

  // Replace emails
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.email, "[EMAIL]");

  // Replace phone numbers
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.phone, "[PHONE]");

  // Replace credit card numbers
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.creditCard, "[CARD]");

  // Replace API keys and tokens
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.apiKey, "$1=[REDACTED]");

  // Replace Stripe tokens
  sanitized = sanitized.replace(
    SENSITIVE_PATTERNS.stripeToken,
    "[STRIPE_TOKEN]",
  );

  // Replace database connection strings
  sanitized = sanitized.replace(
    SENSITIVE_PATTERNS.dbConnection,
    "[DATABASE_URL]",
  );

  // Replace IP addresses (but keep localhost)
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.ipAddress, (match) => {
    return match === "127.0.0.1" || match === "0.0.0.0"
      ? match
      : "[IP_ADDRESS]";
  });

  // Replace SSNs
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.ssn, "[SSN]");

  // Replace customer IDs
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.customerId, "$1=[ID]");

  return sanitized;
}

/**
 * Sanitize Sentry event before sending
 */
const sanitizeEvent = (event, hint) => {
  try {
    // Create a deep copy to avoid mutating the original
    const sanitizedEvent = JSON.parse(JSON.stringify(event));

    // Sanitize request data
    if (sanitizedEvent.request) {
      if (sanitizedEvent.request.headers) {
        sanitizedEvent.request.headers = sanitizeObject(
          sanitizedEvent.request.headers,
        );
      }
      if (sanitizedEvent.request.data) {
        sanitizedEvent.request.data = sanitizeObject(
          sanitizedEvent.request.data,
        );
      }
      if (sanitizedEvent.request.query_string) {
        sanitizedEvent.request.query_string = sanitizeString(
          sanitizedEvent.request.query_string,
        );
      }
      if (sanitizedEvent.request.cookies) {
        sanitizedEvent.request.cookies = sanitizeObject(
          sanitizedEvent.request.cookies,
        );
      }
    }

    // Sanitize user context
    if (sanitizedEvent.user) {
      if (sanitizedEvent.user.email) {
        sanitizedEvent.user.email = "[USER_EMAIL]";
      }
      if (sanitizedEvent.user.username) {
        sanitizedEvent.user.username = sanitizedEvent.user.id || "[USER]";
      }
      // Keep user.id for tracking but remove other PII
      delete sanitizedEvent.user.ip_address;
      delete sanitizedEvent.user.name;
    }

    // Sanitize breadcrumbs
    if (
      sanitizedEvent.breadcrumbs &&
      Array.isArray(sanitizedEvent.breadcrumbs)
    ) {
      sanitizedEvent.breadcrumbs = sanitizedEvent.breadcrumbs.map(
        (breadcrumb) => ({
          ...breadcrumb,
          message: sanitizeString(breadcrumb.message),
          data: sanitizeObject(breadcrumb.data),
        }),
      );
    }

    // Sanitize extra context
    if (sanitizedEvent.extra) {
      sanitizedEvent.extra = sanitizeObject(sanitizedEvent.extra);
    }

    // Sanitize tags
    if (sanitizedEvent.tags) {
      sanitizedEvent.tags = sanitizeObject(sanitizedEvent.tags);
    }

    // Sanitize exception values
    if (sanitizedEvent.exception && sanitizedEvent.exception.values) {
      sanitizedEvent.exception.values = sanitizedEvent.exception.values.map(
        (exception) => ({
          ...exception,
          value: sanitizeString(exception.value),
        }),
      );
    }

    // Sanitize error messages
    if (sanitizedEvent.message) {
      sanitizedEvent.message = sanitizeString(sanitizedEvent.message);
    }

    return sanitizedEvent;
  } catch (error) {
    console.error("Error sanitizing Sentry event:", error);
    // If sanitization fails, block the event to prevent data leaks
    return null;
  }
};

/**
 * Get appropriate sample rate based on environment
 */
function getTracesSampleRate() {
  const env = process.env.VERCEL_ENV || "development";
  switch (env) {
    case "production":
      return 0.1; // 10% in production to control costs
    case "preview":
      return 0.25; // 25% in preview
    default:
      return 1.0; // 100% in development
  }
}

/**
 * Check if running in test environment
 */
function isTestEnvironment() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.CI === "true" ||
    typeof global !== "undefined" && global.__vitest__ ||
    typeof globalThis !== "undefined" && globalThis.__vitest__
  );
}

/**
 * Initialize Sentry with comprehensive configuration
 */
export const initSentry = () => {
  // Skip initialization in test environment
  if (isTestEnvironment()) {
    return;
  }

  // Skip initialization if no DSN is provided
  if (!process.env.SENTRY_DSN) {
    console.log("Sentry DSN not configured, skipping initialization");
    return;
  }

  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV || "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",

      // Performance monitoring
      tracesSampleRate: getTracesSampleRate(),

      // Data sanitization
      beforeSend: sanitizeEvent,

      // Additional options
      debug: process.env.VERCEL_ENV === "development",
      attachStacktrace: true,
      autoSessionTracking: true,

      // Integrations
      integrations: [
        // HTTP integration for automatic request/response tracking
        new Sentry.Integrations.Http({ tracing: true }),
        // Note: ContextLines and LinkedErrors are not available in @sentry/node
        // These would need to be imported from @sentry/integrations if needed
      ],

      // Ignore certain errors
      ignoreErrors: [
        // Browser-specific errors
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
        // Network errors that are expected
        "NetworkError",
        "Failed to fetch",
        // User-triggered errors
        "Non-Error promise rejection captured",
      ],

      // Transaction filtering
      beforeTransaction: (transaction) => {
        // Don't track health check transactions
        if (transaction.name?.includes("/health")) {
          return null;
        }
        return transaction;
      },
    });

    // Set initial app context
    Sentry.setContext("app", {
      name: "A Lo Cubano Boulder Fest",
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.VERCEL_ENV || "development",
    });

    console.log("Sentry initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Sentry:", error);
  }
};

/**
 * Capture exception with additional context
 */
export const captureException = (error, context = {}) => {
  // Skip in test environment
  if (isTestEnvironment()) {
    return;
  }

  try {
    // Sanitize context before sending
    const sanitizedContext = sanitizeObject(context);

    Sentry.withScope((scope) => {
      // Add custom context
      Object.entries(sanitizedContext).forEach(([key, value]) => {
        scope.setContext(key, value);
      });

      // Capture the exception
      Sentry.captureException(error);
    });
  } catch (sentryError) {
    console.error("Error capturing exception in Sentry:", sentryError);
  }
};

/**
 * Capture message with level
 */
export const captureMessage = (message, level = "info", context = {}) => {
  // Skip in test environment
  if (isTestEnvironment()) {
    return;
  }

  try {
    // Sanitize message and context
    const sanitizedMessage = sanitizeString(message);
    const sanitizedContext = sanitizeObject(context);

    // Map alert severity levels to valid Sentry levels
    const sentryLevel = mapAlertSeverityToSentryLevel(level);

    Sentry.withScope((scope) => {
      // Add custom context
      Object.entries(sanitizedContext).forEach(([key, value]) => {
        scope.setContext(key, value);
      });

      // Capture the message
      Sentry.captureMessage(sanitizedMessage, sentryLevel);
    });
  } catch (sentryError) {
    console.error("Error capturing message in Sentry:", sentryError);
  }
};

/**
 * Map alert severity to valid Sentry level
 */
function mapAlertSeverityToSentryLevel(level) {
  const levelMapping = {
    critical: "fatal",
    high: "error",
    medium: "warning",
    low: "info",
    info: "info",
  };

  return levelMapping[level] || level;
}

/**
 * Add breadcrumb for tracking user journey
 */
export const addBreadcrumb = (breadcrumb) => {
  // Skip in test environment
  if (isTestEnvironment()) {
    return;
  }

  try {
    Sentry.addBreadcrumb({
      ...breadcrumb,
      message: sanitizeString(breadcrumb.message),
      data: sanitizeObject(breadcrumb.data),
    });
  } catch (sentryError) {
    console.error("Error adding breadcrumb in Sentry:", sentryError);
  }
};

/**
 * Set user context (sanitized)
 */
export const setUser = (user) => {
  if (!user) {
    Sentry.setUser(null);
    return;
  }

  // Only keep non-PII user identifiers
  Sentry.setUser({
    id: user.id || "anonymous",
    segment: user.segment || "unknown",
  });
};

/**
 * Start a transaction for performance monitoring
 */
export const startTransaction = (name, op = "http.server") => {
  return Sentry.startTransaction({
    name: sanitizeString(name),
    op,
  });
};

/**
 * Export Sentry for direct access if needed
 */
export { Sentry };

export default {
  initSentry,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  startTransaction,
  Sentry,
};
