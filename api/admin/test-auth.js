import authService from '../../lib/auth-service.js';

export default async function handler(req, res) {
  console.log('[Test-Auth] Handler started');
  
  try {
    // Try to initialize auth service
    console.log('[Test-Auth] Attempting to initialize auth service...');
    await authService.ensureInitialized();
    console.log('[Test-Auth] Auth service initialized successfully');
    
    // Check environment variables
    const envCheck = {
      hasAdminSecret: !!process.env.ADMIN_SECRET,
      adminSecretLength: process.env.ADMIN_SECRET?.length || 0,
      hasAdminPassword: !!process.env.ADMIN_PASSWORD,
      hasTestAdminPassword: !!process.env.TEST_ADMIN_PASSWORD,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    };
    
    console.log('[Test-Auth] Environment check:', envCheck);
    
    return res.status(200).json({
      success: true,
      message: 'Auth service initialized successfully',
      environment: envCheck,
      authServiceInitialized: authService.initialized,
      sessionDuration: authService.sessionDuration,
    });
  } catch (error) {
    console.error('[Test-Auth] Error:', error.message);
    console.error('[Test-Auth] Stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    });
  }
}