// Minimal test endpoint to debug login issues
export default async function handler(req, res) {
  console.log('[Test-Login] Request received');
  
  try {
    console.log('[Test-Login] Importing auth service...');
    const authService = await import('../../lib/auth-service.js').then(m => m.default);
    console.log('[Test-Login] Auth service imported successfully');
    
    console.log('[Test-Login] Initializing auth service...');
    await authService.ensureInitialized();
    console.log('[Test-Login] Auth service initialized');
    
    console.log('[Test-Login] Importing rate limit service...');
    const { getRateLimitService } = await import('../../lib/rate-limit-service.js');
    console.log('[Test-Login] Rate limit service imported');
    
    const rateLimitService = getRateLimitService();
    console.log('[Test-Login] Rate limit service obtained:', !!rateLimitService);
    
    console.log('[Test-Login] Importing database client...');
    const { getDatabaseClient } = await import('../../lib/database.js');
    const db = await getDatabaseClient();
    console.log('[Test-Login] Database client obtained');
    
    console.log('[Test-Login] Importing MFA middleware...');
    const mfaModule = await import('../../lib/mfa-middleware.js');
    console.log('[Test-Login] MFA middleware imported');
    
    res.status(200).json({
      status: 'ok',
      message: 'All imports successful',
      modules: {
        authService: !!authService,
        rateLimitService: !!rateLimitService,
        database: !!db,
        mfaMiddleware: !!mfaModule
      }
    });
  } catch (error) {
    console.error('[Test-Login] Error:', error.message);
    console.error('[Test-Login] Stack:', error.stack);
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      type: error.constructor.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}