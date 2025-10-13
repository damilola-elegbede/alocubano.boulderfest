/**
 * Integration Test Helper - Direct Handler Testing
 * Tests API handlers directly without HTTP server overhead
 */

/**
 * Initialize services with test database
 * Ensures all services use the test isolation manager's database
 * MUST be called AFTER migrations are complete
 */
async function initializeTestServices() {
  const maxRetries = 5;
  const retryDelay = 300; // ms - increased for better stability

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔧 Initializing test services (attempt ${attempt}/${maxRetries})`);

      // Get test database from isolation manager
      const { getTestIsolationManager } = await import('../../lib/test-isolation-manager.js');
      const isolationManager = getTestIsolationManager();

      // CRITICAL FIX: Use getScopedDatabaseClient instead of getWorkerDatabase
      // This ensures we get the properly initialized database with migrations
      const testDb = await isolationManager.getScopedDatabaseClient();

      // CRITICAL: Verify tables exist before initializing services
      await verifyTablesExist(testDb);
      console.log(`✅ Table verification passed - proceeding with service initialization`);

      // Initialize audit service with table verification
      const auditService = (await import('../../lib/audit-service.js')).default;
      // Force reset to ensure clean state
      auditService.initialized = false;
      auditService.initializationPromise = null;
      auditService.db = testDb;
      auditService.initialized = true;
      auditService.initializationPromise = Promise.resolve(auditService);
      console.log(`✅ Audit service initialized with test database`);

      // Initialize admin session monitor - graceful handling if import fails
      try {
        const adminSessionModule = await import('../../lib/admin-session-monitor.js');
        const adminSessionMonitor = adminSessionModule.adminSessionMonitor || adminSessionModule.default;
        if (adminSessionMonitor) {
          adminSessionMonitor.initialized = false;
          adminSessionMonitor.initializationPromise = null;
          adminSessionMonitor.db = testDb;
          adminSessionMonitor.initialized = true;
          adminSessionMonitor.initializationPromise = Promise.resolve(adminSessionMonitor);
          console.log(`✅ Admin session monitor initialized with test database`);
        }
      } catch (error) {
        console.log(`ℹ️ Admin session monitor not available: ${error.message}`);
      }

      // Initialize security alert service - graceful handling if import fails
      try {
        const securityAlertModule = await import('../../lib/security-alert-service.js');
        const securityAlertService = securityAlertModule.securityAlertService || securityAlertModule.default;
        if (securityAlertService) {
          securityAlertService.initialized = false;
          securityAlertService.initializationPromise = null;
          securityAlertService.db = testDb;
          securityAlertService.initialized = true;
          securityAlertService.initializationPromise = Promise.resolve(securityAlertService);
          console.log(`✅ Security alert service initialized with test database`);
        }
      } catch (error) {
        console.log(`ℹ️ Security alert service not available: ${error.message}`);
      }

      console.log(`✅ All test services initialized successfully`);
      return; // Success

    } catch (error) {
      console.warn(`⚠️ Failed to initialize test services (attempt ${attempt}/${maxRetries}):`, error.message);

      if (attempt < maxRetries) {
        console.log(`🔄 Retrying service initialization in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.warn(`❌ Service initialization failed after ${maxRetries} attempts - continuing with basic setup`);
        // Continue with test execution - many tests can run without full service initialization
      }
    }
  }
}

/**
 * Verify that required tables exist before service initialization
 */
async function verifyTablesExist(dbClient) {
  const requiredTables = ['transactions', 'tickets'];
  const optionalTables = ['audit_logs', 'admin_sessions', 'security_alerts'];

  // Retry logic for table verification to handle migration completion timing
  const maxRetries = 10;
  const retryDelay = 100;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check if migration table exists (indicates migrations have run)
      const migrationCheck = await dbClient.execute(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='migrations'
      `);

      if (migrationCheck.rows.length === 0 && attempt < maxRetries) {
        console.log(`⏳ Migrations table not found (attempt ${attempt}/${maxRetries}), waiting for migrations...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      // Check required tables
      let missingTables = [];
      for (const tableName of requiredTables) {
        try {
          await dbClient.execute(`SELECT 1 FROM ${tableName} LIMIT 1`);
        } catch (error) {
          missingTables.push(tableName);
        }
      }

      if (missingTables.length > 0 && attempt < maxRetries) {
        console.log(`⏳ Missing required tables [${missingTables.join(', ')}] (attempt ${attempt}/${maxRetries}), waiting...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      if (missingTables.length > 0) {
        throw new Error(`Required tables missing after ${maxRetries} attempts: [${missingTables.join(', ')}]`);
      }

      // Check optional tables (don't fail if missing)
      const existingOptionalTables = [];
      for (const tableName of optionalTables) {
        try {
          await dbClient.execute(`SELECT 1 FROM ${tableName} LIMIT 1`);
          existingOptionalTables.push(tableName);
        } catch (error) {
          console.log(`ℹ️ Optional table '${tableName}' not available: ${error.message}`);
        }
      }

      console.log(`✅ Table verification: ${requiredTables.length} required tables OK, ${existingOptionalTables.length}/${optionalTables.length} optional tables available`);
      return; // Success

    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`⚠️ Table verification attempt ${attempt} failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

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
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Create mock request object
 */
export function createMockRequest(method, url, body = null, headers = {}) {
  const urlObj = new URL(url, 'http://localhost:3001');

  return {
    method: method.toUpperCase(),
    url: urlObj.toString(),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `127.0.0.1-${Date.now()}-${Math.random()}`,  // Unique IP per request to avoid rate limiting in tests
      ...headers
    },
    body: body,  // Pass body as-is, not stringified
    json: async () => body,
    text: async () => body ? JSON.stringify(body) : '',
    connection: {
      remoteAddress: `127.0.0.1-${Date.now()}-${Math.random()}`  // Unique fallback IP
    }
  };
}

/**
 * Create mock response object
 */
export function createMockResponse() {
  let statusCode = 200;
  let responseBody = null;
  let responseHeaders = {};

  const mockRes = {
    status(code) {
      statusCode = code;
      this.statusCode = code; // Expose statusCode property for middleware
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
    _getHeaders: () => responseHeaders,
    // Initial statusCode
    statusCode: statusCode
  };

  return mockRes;
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

// Track if services have been initialized
let servicesInitialized = false;

/**
 * Import and test an API handler
 */
export async function testApiHandler(apiPath, method, urlPath, data = null, headers = {}) {
  try {
    // SKIP service initialization in integration tests - services are already initialized by setup-integration.js
    // Only initialize for standalone handler tests
    if (process.env.NODE_ENV === 'test' && !servicesInitialized && !process.env.INTEGRATION_TEST_MODE) {
      console.log('[TEST_API_HANDLER] Initializing services...');
      await initializeTestServices();
      servicesInitialized = true;
      console.log('[TEST_API_HANDLER] Services initialized');
    }

    // Convert API path to file path
    const handlerPath = `../../${apiPath}.js`;
    console.log('[TEST_API_HANDLER] Importing:', handlerPath);
    const handlerModule = await import(handlerPath);
    console.log('[TEST_API_HANDLER] Module imported, checking for default export');
    const handler = handlerModule.default;

    if (!handler || typeof handler !== 'function') {
      console.error('[TEST_API_HANDLER] No handler found. Module keys:', Object.keys(handlerModule));
      throw new Error(`No default handler exported from ${apiPath}`);
    }

    console.log('[TEST_API_HANDLER] Calling handler...');
    const result = await testHandler(handler, method, urlPath, data, headers);
    console.log('[TEST_API_HANDLER] Handler completed with status:', result.status);
    return result;
  } catch (error) {
    // Could not import handler - treat as 404
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('[TEST_API_HANDLER] Module not found:', apiPath, error.message);
      return {
        status: 404,
        data: { error: 'Handler not found', path: apiPath, message: error.message },
        headers: {}
      };
    }

    // Other import errors - treat as 500
    console.error('[TEST_API_HANDLER] Import error:', apiPath, error.message, error.stack);
    return {
      status: 500,
      data: { error: error.message, path: apiPath },
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
    '/api/admin/verify-session': 'api/admin/verify-session',
    '/api/admin/dashboard': 'api/admin/dashboard',
    '/api/admin/registrations': 'api/admin/registrations',
    '/api/admin/transactions': 'api/admin/transactions',
    '/api/admin/audit-logs': 'api/admin/audit-logs',
    '/api/admin/search': 'api/admin/search',
    '/api/admin/manual-ticket-entry': 'api/admin/manual-ticket-entry',
    '/api/admin/csrf-token': 'api/admin/csrf-token',
    '/api/email/subscribe': 'api/email/subscribe',
    '/api/email/unsubscribe': 'api/email/unsubscribe',
    '/api/email/brevo-webhook': 'api/email/brevo-webhook',
    '/api/payments/create-checkout-session': 'api/payments/create-checkout-session',
    '/api/payments/stripe-webhook': 'api/payments/stripe-webhook',
    '/api/tickets/validate': 'api/tickets/validate',
    '/api/tickets/register': 'api/tickets/register',
    '/api/registration': 'api/registration/index',
    '/api/registration/batch': 'api/registration/batch',
    '/api/health/check': 'api/health/check',
    '/api/health/database': 'api/health/database',
    '/api/health/brevo': 'api/health/brevo',
    '/api/health/stripe': 'api/health/stripe',
    '/api/gallery': 'api/gallery',
    '/api/featured-photos': 'api/featured-photos'
  };

  // Extract base path without query params
  const basePath = path.split('?')[0];

  // Find matching handler
  const apiPath = pathMappings[basePath];

  console.log('[TEST_REQUEST] Method:', method, 'Path:', path, 'API Path:', apiPath);

  if (!apiPath) {
    // No mapping found - return 404
    console.log('[TEST_REQUEST] No mapping found for:', basePath);
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

/**
 * Create a test event and return its numeric ID
 * Handles the foreign key requirement for tickets table
 */
export async function createTestEvent(dbClient, eventData = {}) {
  const slug = eventData.slug || `test-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const name = eventData.name || 'Test Event';
  const type = eventData.type || 'festival';
  const status = eventData.status || 'test';
  const startDate = eventData.startDate || '2026-05-15';
  const endDate = eventData.endDate || '2026-05-17';
  const venueName = eventData.venueName || 'Test Venue';
  const venueCity = eventData.venueCity || 'Boulder';
  const venueState = eventData.venueState || 'CO';

  // Insert event and get its ID
  await dbClient.execute({
    sql: `
      INSERT INTO events (
        slug, name, type, status, start_date, end_date,
        venue_name, venue_city, venue_state, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    args: [slug, name, type, status, startDate, endDate, venueName, venueCity, venueState]
  });

  // Get the generated ID
  const result = await dbClient.execute({
    sql: 'SELECT id FROM events WHERE slug = ?',
    args: [slug]
  });

  if (result.rows.length === 0) {
    throw new Error(`Failed to create test event with slug: ${slug}`);
  }

  return result.rows[0].id;
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
  generateTestEmail,
  createTestEvent
};