import authService from "../../lib/auth-service.js";
import csrfService from "../../lib/csrf-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";

async function csrfTokenHandler(req, res) {
  const startTime = Date.now();

  console.log('[CSRF-TOKEN] Request received', {
    method: req.method,
    timestamp: new Date().toISOString(),
    headers: {
      'user-agent': req.headers['user-agent']?.substring(0, 100),
      'x-forwarded-for': req.headers['x-forwarded-for']
    }
  });

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    console.log('[CSRF-TOKEN] Admin info from auth middleware', {
      adminId: req.admin?.id,
      hasAdmin: !!req.admin
    });

    // Generate CSRF token using admin info from auth middleware
    const csrfToken = await csrfService.generateToken(req.admin.id);

    console.log('[CSRF-TOKEN] CSRF token generated', {
      tokenLength: csrfToken?.length || 0,
      adminId: req.admin.id
    });

    // Set security headers to prevent caching of CSRF tokens
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const duration = Date.now() - startTime;

    console.log('[CSRF-TOKEN] Response ready', {
      duration: `${duration}ms`,
      expiresIn: 3600
    });

    // Return CSRF token
    res.status(200).json({
      csrfToken,
      expiresIn: 3600 // 1 hour in seconds
    });
  } catch (error) {
    console.error('[CSRF-TOKEN] Error occurred', {
      error: error.message,
      stack: error.stack,
      adminId: req.admin?.id
    });
    res.status(500).json({ error: 'Failed to generate CSRF token' });
  }
}

export default withSecurityHeaders(
  authService.requireAuth(
    withAdminAudit(csrfTokenHandler, {
      logBody: false,
      logMetadata: false,
      skipMethods: [] // Track CSRF token requests for security monitoring
    })
  ),
  { isAPI: true }
);
