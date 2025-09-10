// Minimal test version to debug the issue
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Test 1: Can we import auth-service?
    const authService = await import('../lib/auth-service.js').then(m => m.default);
    
    // Test 2: Basic response
    return res.status(200).json({ 
      test: 'login-test endpoint working',
      authServiceLoaded: !!authService,
      method: req.method,
      body: req.body
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Test endpoint error',
      message: error.message,
      stack: error.stack 
    });
  }
}