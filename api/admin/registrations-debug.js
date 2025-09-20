// Debug version of registrations endpoint to isolate import failures
console.log('🐛 [DEBUG] Starting registrations-debug endpoint load...');

let importError = null;
let servicesLoaded = false;
let authService = null;
let withSecurityHeaders = null;
let withAdminAudit = null;

// Lazy load services only when handler is called to avoid top-level await issues
async function loadServices() {
  if (servicesLoaded) {
    return;
  }

  console.log('🐛 [DEBUG] Loading services on-demand...');

  // Test each import individually to find the problematic one
  try {
    console.log('🐛 [DEBUG] Importing auth service...');
    const authServiceModule = await import('../../lib/auth-service.js');
    authService = authServiceModule.default;
    console.log('🐛 [DEBUG] Auth service imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ Auth service import failed:', error);
    importError = { service: 'auth-service', error };
  }

  try {
    console.log('🐛 [DEBUG] Importing database client...');
    const { getDatabaseClient } = await import('../../lib/database.js');
    console.log('🐛 [DEBUG] Database client imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ Database client import failed:', error);
    importError = { service: 'database', error };
  }

  try {
    console.log('🐛 [DEBUG] Importing ticket service...');
    const { default: ticketService } = await import('../../lib/ticket-service.js');
    console.log('🐛 [DEBUG] Ticket service imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ Ticket service import failed:', error);
    importError = { service: 'ticket-service', error };
  }

  try {
    console.log('🐛 [DEBUG] Importing validation service...');
    const { getValidationService } = await import('../../lib/validation-service.js');
    console.log('🐛 [DEBUG] Validation service imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ Validation service import failed:', error);
    importError = { service: 'validation-service', error };
  }

  try {
    console.log('🐛 [DEBUG] Importing security headers...');
    const securityHeadersModule = await import('../../lib/security-headers-serverless.js');
    withSecurityHeaders = securityHeadersModule.withSecurityHeaders;
    console.log('🐛 [DEBUG] Security headers imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ Security headers import failed:', error);
    importError = { service: 'security-headers', error };
  }

  try {
    console.log('🐛 [DEBUG] Importing db utils...');
    const { columnExists } = await import('../../lib/db-utils.js');
    console.log('🐛 [DEBUG] DB utils imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ DB utils import failed:', error);
    importError = { service: 'db-utils', error };
  }

  try {
    console.log('🐛 [DEBUG] Importing admin audit middleware...');
    const adminAuditModule = await import('../../lib/admin-audit-middleware.js');
    withAdminAudit = adminAuditModule.withAdminAudit;
    console.log('🐛 [DEBUG] Admin audit middleware imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ Admin audit middleware import failed:', error);
    importError = { service: 'admin-audit-middleware', error };
  }

  try {
    console.log('🐛 [DEBUG] Importing CSRF service...');
    const { default: csrfService } = await import('../../lib/csrf-service.js');
    console.log('🐛 [DEBUG] CSRF service imported successfully');
  } catch (error) {
    console.error('🐛 [DEBUG] ❌ CSRF service import failed:', error);
    importError = { service: 'csrf-service', error };
  }

  servicesLoaded = true;
  console.log('🐛 [DEBUG] Service loading completed');
}

async function handler(req, res) {
  console.log('🐛 [DEBUG] Handler called - loading services on-demand...');

  // Load services lazily when handler is called
  await loadServices();

  if (importError) {
    console.error('🐛 [DEBUG] 💥 Import error detected:', importError);
    return res.status(500).json({
      error: 'Import failure during module loading',
      service: importError.service,
      message: importError.error.message,
      // Never expose stack traces in production
      timestamp: new Date().toISOString()
    });
  }

  return res.status(200).json({
    message: 'Debug endpoint working - all imports successful',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
}

// Create a lazy-loading wrapper that loads services on first request
async function lazyWrappedHandler(req, res) {
  // Load services on first request
  await loadServices();

  // Create wrappers with fallbacks
  const securityHeadersWrapper = withSecurityHeaders || ((handler) => handler);
  const auditWrapper = withAdminAudit || ((handler) => handler);

  // Create the audit-wrapped handler with same options in both paths
  const auditOptions = {
    logBody: false,
    logMetadata: true,
    skipMethods: [] // Track debug registrations access for security
  };

  // Apply audit wrapper first
  const auditWrappedHandler = auditWrapper(handler, auditOptions);

  // Determine the final handler based on authService availability
  let finalHandler;
  if (authService && typeof authService.requireAuth === 'function') {
    // Full protection path: authService.requireAuth + audit
    finalHandler = authService.requireAuth(auditWrappedHandler);
  } else {
    // Fallback path: audit only (no auth)
    console.warn('🐛 [DEBUG] ⚠️ authService.requireAuth not available, falling back to audit-only protection');
    finalHandler = auditWrappedHandler;
  }

  // Apply security headers wrapper to final handler
  const securityWrappedHandler = securityHeadersWrapper(finalHandler, { isAPI: true });

  // Execute the final wrapped handler
  return securityWrappedHandler(req, res);
}

export default lazyWrappedHandler;