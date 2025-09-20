import authService from "../../lib/auth-service.js";
import csrfService from "../../lib/csrf-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";

async function csrfTokenHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Generate CSRF token using admin info from auth middleware
    const csrfToken = await csrfService.generateToken(req.admin.id);

    // Set security headers to prevent caching of CSRF tokens
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Return CSRF token
    res.status(200).json({
      csrfToken,
      expiresIn: 3600 // 1 hour in seconds
    });
  } catch (error) {
    console.error('Failed to generate CSRF token:', error);
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
