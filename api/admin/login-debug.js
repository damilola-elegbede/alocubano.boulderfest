/**
 * Debug endpoint to test imports and identify the exact error
 */

export default async function handler(req, res) {
  try {
    console.log("=== LOGIN DEBUG ENDPOINT ===");
    
    // Test 1: Basic imports
    console.log("1. Testing basic imports...");
    
    try {
      const authService = await import("../../lib/auth-service.js");
      console.log("✅ auth-service.js imported successfully");
    } catch (error) {
      console.log("❌ auth-service.js import failed:", error.message);
      return res.status(500).json({ error: "auth-service import failed", details: error.message });
    }
    
    try {
      const database = await import("../../lib/database.js");
      console.log("✅ database.js imported successfully");
    } catch (error) {
      console.log("❌ database.js import failed:", error.message);
      return res.status(500).json({ error: "database import failed", details: error.message });
    }
    
    try {
      const mfaMiddleware = await import("../../lib/mfa-middleware.js");
      console.log("✅ mfa-middleware.js imported successfully");
    } catch (error) {
      console.log("❌ mfa-middleware.js import failed:", error.message);
      return res.status(500).json({ error: "mfa-middleware import failed", details: error.message });
    }
    
    // Test 2: Database initialization
    console.log("2. Testing database initialization...");
    
    try {
      const { getDatabaseClient } = await import("../../lib/database.js");
      const db = await getDatabaseClient();
      console.log("✅ Database client initialized successfully");
      
      const result = await db.execute("SELECT 1 as test");
      console.log("✅ Database query successful:", result);
    } catch (error) {
      console.log("❌ Database initialization failed:", error.message);
      return res.status(500).json({ error: "database initialization failed", details: error.message });
    }
    
    // Test 3: Environment variables
    console.log("3. Testing environment variables...");
    const envVars = {
      ADMIN_SECRET: !!process.env.ADMIN_SECRET,
      ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
      TEST_ADMIN_PASSWORD: !!process.env.TEST_ADMIN_PASSWORD,
      TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    };
    console.log("Environment variables:", envVars);
    
    // Test 4: Check for missing rateLimitService import issue
    console.log("4. Testing rate limit service import...");
    
    try {
      const rateLimitService = await import("../../lib/rate-limit-service.js");
      console.log("✅ rate-limit-service.js imported successfully");
      
      // Test the methods that are being called in login.js
      const service = rateLimitService.default;
      if (typeof service.recordFailedAttempt === 'function') {
        console.log("✅ recordFailedAttempt method exists");
      } else {
        console.log("❌ recordFailedAttempt method missing");
      }
      
      if (typeof service.clearAttempts === 'function') {
        console.log("✅ clearAttempts method exists");
      } else {
        console.log("❌ clearAttempts method missing");
      }
      
    } catch (error) {
      console.log("❌ rate-limit-service.js import failed:", error.message);
      return res.status(500).json({ error: "rate-limit-service import failed", details: error.message });
    }
    
    res.status(200).json({ 
      success: true, 
      message: "All imports and database initialization successful",
      envVars 
    });
    
  } catch (error) {
    console.error("Debug endpoint error:", error);
    res.status(500).json({ error: "Debug endpoint failed", details: error.message, stack: error.stack });
  }
}