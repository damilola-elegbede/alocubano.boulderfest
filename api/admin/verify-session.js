import { getAuthService } from '../../lib/auth-service.js';
import { withSecurityHeaders } from '../../lib/security-headers.js';

async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // If we reach here, the user is authenticated (requireAuth middleware passed)
  // Return success with basic session info
  return res.status(200).json({
    authenticated: true,
    admin: req.admin || { username: 'admin' },
    timestamp: new Date().toISOString()
  });
}

// Wrap with auth middleware - this will return 401 if not authenticated
export default withSecurityHeaders(async (req, res) => {
  try {
    const authService = getAuthService();
    return await authService.requireAuth(handler)(req, res);
  } catch (error) {
    console.error('Session verification error:', error);
    return res.status(503).json({ 
      error: 'Service temporarily unavailable',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});