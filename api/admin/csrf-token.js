import authService from '../../lib/auth-service.js';
import csrfService from '../../lib/csrf-service.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';

async function csrfTokenHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Get session token
    const token = authService.getSessionFromRequest(req);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify session
    const session = await authService.verifySessionToken(token);

    if (!session.valid) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Generate CSRF token
    const csrfToken = await csrfService.generateToken(session.admin.id);

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

export default withSecurityHeaders(withAdminAudit(csrfTokenHandler, {
  logBody: false,
  logMetadata: false,
  skipMethods: [] // Track CSRF token requests for security monitoring
}));
