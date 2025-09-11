// Simplified login endpoint without security headers wrapper
import authService from '../../lib/auth-service.js';

export default async function handler(req, res) {
  console.log('[Test-Login-Simple] Request received');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { password } = req.body || {};
    
    console.log('[Test-Login-Simple] Has password:', !!password);
    
    // Try to initialize auth service
    console.log('[Test-Login-Simple] Initializing auth service...');
    await authService.ensureInitialized();
    console.log('[Test-Login-Simple] Auth service initialized');
    
    // Try to verify password
    console.log('[Test-Login-Simple] Verifying password...');
    const isValid = await authService.verifyPassword(password || 'test');
    console.log('[Test-Login-Simple] Password verification result:', isValid);
    
    res.status(200).json({
      status: 'ok',
      message: 'Login test completed',
      passwordValid: isValid,
      authServiceReady: true
    });
  } catch (error) {
    console.error('[Test-Login-Simple] Error:', error.message);
    console.error('[Test-Login-Simple] Stack:', error.stack);
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      type: error.constructor.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}