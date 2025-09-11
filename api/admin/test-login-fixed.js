// Test login endpoint with fixed security headers (no Helmet dependency)
import authService from '../../lib/auth-service.js';

// Simple security headers without Helmet
function addSimpleSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Simple CSP for admin endpoints
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self';"
  );
}

export default async function handler(req, res) {
  console.log('[Test-Login-Fixed] Request received');
  
  // Add security headers manually
  addSimpleSecurityHeaders(res);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { username, password } = req.body || {};
    
    console.log('[Test-Login-Fixed] Has username:', !!username);
    console.log('[Test-Login-Fixed] Has password:', !!password);
    
    // Initialize auth service
    console.log('[Test-Login-Fixed] Initializing auth service...');
    await authService.ensureInitialized();
    console.log('[Test-Login-Fixed] Auth service initialized');
    
    // Verify username
    const isUsernameValid = username === 'admin';
    console.log('[Test-Login-Fixed] Username valid:', isUsernameValid);
    
    // Verify password
    console.log('[Test-Login-Fixed] Verifying password...');
    const isPasswordValid = await authService.verifyPassword(password || 'test');
    console.log('[Test-Login-Fixed] Password valid:', isPasswordValid);
    
    const isValid = isUsernameValid && isPasswordValid;
    
    if (isValid) {
      // Create session
      const token = await authService.createSessionToken('admin');
      const cookie = await authService.createSessionCookie(token);
      res.setHeader('Set-Cookie', cookie);
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        expiresIn: authService.sessionDuration
      });
    } else {
      res.status(401).json({
        error: 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('[Test-Login-Fixed] Error:', error.message);
    console.error('[Test-Login-Fixed] Stack:', error.stack);
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      type: error.constructor.name
    });
  }
}