import authService from '../../lib/auth-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import { withSecurityHeaders } from '../../lib/security-headers.js';

/**
 * Simple login endpoint for testing environments - bypasses MFA
 * POST /api/admin/simple-login
 * 
 * Only available when SKIP_MFA=true or in test environments
 */
async function simpleLoginHandler(req, res) {
  // Only allow in test environments or when explicitly configured
  const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                            process.env.E2E_TEST_MODE === 'true' ||
                            process.env.CI === 'true' ||
                            process.env.VERCEL_ENV === 'preview' ||
                            process.env.SKIP_MFA === 'true';
  
  if (!isTestEnvironment) {
    return res.status(404).json({ error: 'Endpoint not available' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { username, password } = req.body || {};

  // Basic validation
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required' });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Verify credentials
  const isUsernameValid = username === 'admin';
  const isPasswordValid = await authService.verifyPassword(password);
  
  if (!isUsernameValid || !isPasswordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    // Create session
    const adminId = 'admin';
    const token = await authService.createSessionToken(adminId);
    const cookie = await authService.createSessionCookie(token);

    // Store session in database
    const db = await getDatabaseClient();
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    req.connection?.remoteAddress || 
                    'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
      await db.execute({
        sql: `INSERT INTO admin_sessions 
              (session_token, ip_address, user_agent, mfa_verified, expires_at) 
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          token,
          clientIP,
          userAgent.substring(0, 500),
          false, // MFA not used
          new Date(Date.now() + parseInt(process.env.ADMIN_SESSION_DURATION || "3600000")).toISOString()
        ]
      });
    } catch (dbError) {
      console.error('Failed to store session:', dbError);
      // Continue even if session storage fails
    }

    // Set cookie and return success
    res.setHeader('Set-Cookie', cookie);
    return res.status(200).json({
      success: true,
      adminId,
      message: 'Login successful (MFA bypassed for testing)',
      expiresIn: parseInt(process.env.ADMIN_SESSION_DURATION || "3600000")
    });
  } catch (error) {
    console.error('Simple login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}

export default withSecurityHeaders(simpleLoginHandler);