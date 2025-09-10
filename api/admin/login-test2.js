// Test which import is failing
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const results = {};
  
  try {
    // Test each import individually
    try {
      const authService = await import('../../lib/auth-service.js').then(m => m.default);
      results.authService = 'OK';
    } catch (e) {
      results.authService = e.message;
    }
    
    try {
      const { getDatabaseClient } = await import('../../lib/database.js');
      results.database = 'OK';
    } catch (e) {
      results.database = e.message;
    }
    
    try {
      const { withSecurityHeaders } = await import('../../lib/security-headers.js');
      results.securityHeaders = 'OK';
    } catch (e) {
      results.securityHeaders = e.message;
    }
    
    try {
      const { verifyMfaCode, markSessionMfaVerified } = await import('../../lib/mfa-middleware.js');
      results.mfaMiddleware = 'OK';
    } catch (e) {
      results.mfaMiddleware = e.message;
    }
    
    return res.status(200).json({ 
      test: 'login-test2 endpoint',
      imports: results
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Test endpoint error',
      message: error.message,
      stack: error.stack 
    });
  }
}