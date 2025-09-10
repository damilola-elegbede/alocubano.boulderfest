// Simple import test to diagnose the exact failure point
export default async function handler(req, res) {
  try {
    console.log("Step 1: Starting import test");
    
    // Test individual imports
    console.log("Step 2: Testing authService import");
    const authService = await import("../../lib/auth-service.js");
    console.log("Step 3: authService imported successfully", typeof authService.default);
    
    console.log("Step 4: Testing database import");
    const { getDatabaseClient } = await import("../../lib/database.js");
    console.log("Step 5: getDatabaseClient imported successfully", typeof getDatabaseClient);
    
    console.log("Step 6: Testing security headers import");
    const { withSecurityHeaders } = await import("../../lib/security-headers.js");
    console.log("Step 7: withSecurityHeaders imported successfully", typeof withSecurityHeaders);
    
    console.log("Step 8: Testing mfa middleware import");
    const mfaMiddleware = await import("../../lib/mfa-middleware.js");
    console.log("Step 9: mfaMiddleware imported successfully", Object.keys(mfaMiddleware));
    
    console.log("Step 10: Testing rate-limit-service import");
    const rateLimitService = await import("../../lib/rate-limit-service.js");
    console.log("Step 11: rateLimitService imported successfully", typeof rateLimitService.default);
    
    console.log("Step 12: Testing if default export is callable");
    if (rateLimitService.default && typeof rateLimitService.default.recordFailedAttempt === 'function') {
      console.log("Step 13: recordFailedAttempt method exists");
    } else {
      console.log("Step 13: ERROR - recordFailedAttempt method missing", Object.keys(rateLimitService.default || {}));
    }
    
    res.status(200).json({ 
      success: true,
      message: "All imports successful",
      rateLimitServiceMethods: rateLimitService.default ? Object.getOwnPropertyNames(rateLimitService.default) : "no default export"
    });
    
  } catch (error) {
    console.error("Import test failed:", error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      step: "Failed during import test"
    });
  }
}