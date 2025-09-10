export default async function handler(req, res) {
  try {
    console.log("=== IMPORT TEST START ===");
    
    // Test 1: Import rate-limit-service
    console.log("1. Testing rate-limit-service import...");
    const rateLimitModule = await import("../../lib/rate-limit-service.js");
    console.log("rate-limit-service import OK:", typeof rateLimitModule.default);
    
    // Test 2: Import auth-service
    console.log("2. Testing auth-service import...");
    const authModule = await import("../../lib/auth-service.js");
    console.log("auth-service import OK:", typeof authModule.default);
    
    // Test 3: Import database
    console.log("3. Testing database import...");
    const dbModule = await import("../../lib/database.js");
    console.log("database import OK:", typeof dbModule.getDatabaseClient);
    
    // Test 4: Check environment variables
    console.log("4. Environment check:");
    console.log("ADMIN_SECRET:", process.env.ADMIN_SECRET ? "configured" : "MISSING");
    console.log("ADMIN_PASSWORD:", process.env.ADMIN_PASSWORD ? "configured" : "MISSING");
    console.log("TEST_ADMIN_PASSWORD:", process.env.TEST_ADMIN_PASSWORD ? "configured" : "MISSING");
    
    console.log("=== ALL IMPORTS SUCCESSFUL ===");
    
    return res.status(200).json({
      success: true,
      message: "All imports successful",
      rateLimitService: typeof rateLimitModule.default,
      authService: typeof authModule.default,
      database: typeof dbModule.getDatabaseClient,
      environment: {
        adminSecret: !!process.env.ADMIN_SECRET,
        adminPassword: !!process.env.ADMIN_PASSWORD,
        testAdminPassword: !!process.env.TEST_ADMIN_PASSWORD
      }
    });
    
  } catch (error) {
    console.error("=== IMPORT ERROR ===");
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);
    
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
  }
}
