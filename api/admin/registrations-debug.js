// Debug version of registrations endpoint to isolate import failures
console.log('🐛 [DEBUG] Starting registrations-debug endpoint load...');

import authService from '../../lib/auth-service.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';

let importError = null;

// Test each import individually to find the problematic one
try {
  console.log('🐛 [DEBUG] Importing auth service...');
  const { default: authService } = await import('../../lib/auth-service.js');
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
  const { withSecurityHeaders } = await import('../../lib/security-headers-serverless.js');
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
  console.log('🐛 [DEBUG] Importing CSRF service...');
  const { default: csrfService } = await import('../../lib/csrf-service.js');
  console.log('🐛 [DEBUG] CSRF service imported successfully');
} catch (error) {
  console.error('🐛 [DEBUG] ❌ CSRF service import failed:', error);
  importError = { service: 'csrf-service', error };
}

async function handler(req, res) {
  console.log('🐛 [DEBUG] Handler called - all imports completed');

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

export default withSecurityHeaders(
  authService.requireAuth(
    withAdminAudit(handler, {
      logBody: false,
      logMetadata: true,
      skipMethods: [] // Track debug registrations access for security
    })
  ),
  { isAPI: true }
);