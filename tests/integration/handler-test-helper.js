/**
 * Integration Test Helper - Direct Handler Testing
 * Tests API handlers directly without HTTP server overhead
 */

// HTTP status codes for readable test assertions
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

/**
 * Create mock request object
 */
function createMockRequest(method, url, body = null, headers = {}) {
  const urlObj = new URL(url, 'http://localhost:3001');

  return {
    method: method.toUpperCase(),
    url: urlObj.toString(),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',  // Add client IP for tests
      ...headers
    },
    body: body,  // Pass body as-is, not stringified
    json: async () => body,
    text: async () => body ? JSON.stringify(body) : '',
    connection: {
      remoteAddress: '127.0.0.1'  // Fallback IP
    }
  };
}

/**
 * Create mock response object
 */
function createMockResponse() {
  let statusCode = 200;
  let responseBody = null;
  let responseHeaders = {};

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseBody = data;
      responseHeaders['content-type'] = 'application/json';
      return this;
    },
    send(data) {
      responseBody = data;
      return this;
    },
    setHeader(name, value) {
      responseHeaders[name.toLowerCase()] = value;
      return this;
    },
    end() {
      return this;
    },
    // For testing
    _getStatus: () => statusCode,
    _getBody: () => responseBody,
    _getHeaders: () => responseHeaders
  };
}

/**
 * Test API handler directly (replaces testRequest for integration tests)
 */
export async function testHandler(handler, method, path, data = null, headers = {}) {
  const req = createMockRequest(method, path, data, headers);
  const res = createMockResponse();

  try {
    await handler(req, res);

    return {
      status: res._getStatus(),
      data: res._getBody() || {},
      headers: res._getHeaders()
    };
  } catch (error) {
    // Handler threw an error - treat as 500
    return {
      status: 500,
      data: { error: error.message },
      headers: {}
    };
  }
}

/**
 * Import and test an API handler
 */
export async function testApiHandler(apiPath, method, urlPath, data = null, headers = {}) {
  try {
    // Convert API path to file path
    const handlerPath = `../../${apiPath}.js`;
    const handlerModule = await import(handlerPath);
    const handler = handlerModule.default;

    if (!handler || typeof handler !== 'function') {
      throw new Error(`No default handler exported from ${apiPath}`);
    }

    return await testHandler(handler, method, urlPath, data, headers);
  } catch (error) {
    // Could not import handler - treat as 404
    if (error.code === 'MODULE_NOT_FOUND') {
      return {
        status: 404,
        data: { error: 'Handler not found' },
        headers: {}
      };
    }

    // Other import errors - treat as 500
    return {
      status: 500,
      data: { error: error.message },
      headers: {}
    };
  }
}

/**
 * Backward compatibility wrapper to replace testRequest
 * Maps HTTP paths to handler imports
 */
export async function testRequest(method, path, data = null, headers = {}) {
  // Map URL paths to API handler files
  const pathMappings = {
    '/api/admin/login': 'api/admin/login',
    '/api/admin/dashboard': 'api/admin/dashboard',
    '/api/admin/registrations': 'api/admin/registrations',
    '/api/email/subscribe': 'api/email/subscribe',
    '/api/email/unsubscribe': 'api/email/unsubscribe',
    '/api/email/brevo-webhook': 'api/email/brevo-webhook',
    '/api/payments/create-checkout-session': 'api/payments/create-checkout-session',
    '/api/payments/stripe-webhook': 'api/payments/stripe-webhook',
    '/api/tickets/validate': 'api/tickets/validate',
    '/api/tickets/register': 'api/tickets/register',
    '/api/registration': 'api/registration',
    '/api/health/check': 'api/health/check',
    '/api/health/database': 'api/health/database'
  };

  // Extract base path without query params
  const basePath = path.split('?')[0];

  // Find matching handler
  const apiPath = pathMappings[basePath];

  if (!apiPath) {
    // No mapping found - return 404
    return {
      status: 404,
      data: { error: `No handler mapping for ${basePath}` }
    };
  }

  return await testApiHandler(apiPath, method, path, data, headers);
}

// Generate unique test ID
export function generateTestId(prefix = 'test') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// Generate unique test email
export function generateTestEmail() {
  return `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}

// Export everything
export default {
  testHandler,
  testApiHandler,
  testRequest,
  createMockRequest,
  createMockResponse,
  HTTP_STATUS,
  generateTestId,
  generateTestEmail
};