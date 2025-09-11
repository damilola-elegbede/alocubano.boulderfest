/**
 * Performance Testing Endpoint for Admin Login
 * 
 * This endpoint tests specific performance bottlenecks:
 * 1. Module import timing
 * 2. Database initialization timing
 * 3. bcrypt.compare() timing
 * 4. Total function execution timing
 * 5. Memory usage during operation
 */

export default async function handler(req, res) {
  const startTime = Date.now();
  const performanceData = {
    timestamps: {},
    timings: {},
    memoryUsage: {},
    errors: []
  };

  try {
    // 1. Test module imports timing
    performanceData.timestamps.importStart = Date.now();
    
    const authServiceImport = await import("../../lib/auth-service.js");
    performanceData.timestamps.authServiceImported = Date.now();
    
    const databaseImport = await import("../../lib/database.js");
    performanceData.timestamps.databaseImported = Date.now();
    
    const bcryptImport = await import("bcryptjs");
    performanceData.timestamps.bcryptImported = Date.now();
    
    // Calculate import timings
    performanceData.timings.authServiceImport = performanceData.timestamps.authServiceImported - performanceData.timestamps.importStart;
    performanceData.timings.databaseImport = performanceData.timestamps.databaseImported - performanceData.timestamps.authServiceImported;
    performanceData.timings.bcryptImport = performanceData.timestamps.bcryptImported - performanceData.timestamps.databaseImported;
    performanceData.timings.totalImports = performanceData.timestamps.bcryptImported - performanceData.timestamps.importStart;

    // 2. Test database initialization timing
    performanceData.timestamps.dbInitStart = Date.now();
    const db = await databaseImport.getDatabaseClient();
    performanceData.timestamps.dbInitComplete = Date.now();
    performanceData.timings.databaseInit = performanceData.timestamps.dbInitComplete - performanceData.timestamps.dbInitStart;

    // Test database connection
    performanceData.timestamps.dbTestStart = Date.now();
    const testResult = await db.execute("SELECT 1 as test");
    performanceData.timestamps.dbTestComplete = Date.now();
    performanceData.timings.databaseTest = performanceData.timestamps.dbTestComplete - performanceData.timestamps.dbTestStart;

    // 3. Test bcrypt.compare() timing with different scenarios
    const authService = authServiceImport.default;
    
    // Test 1: Fast path for wrong password (early failure)
    performanceData.timestamps.bcryptWrongStart = Date.now();
    const wrongResult = await authService.verifyPassword("wrongpassword");
    performanceData.timestamps.bcryptWrongComplete = Date.now();
    performanceData.timings.bcryptWrongPassword = performanceData.timestamps.bcryptWrongComplete - performanceData.timestamps.bcryptWrongStart;

    // Test 2: Potential correct password timing (if TEST_ADMIN_PASSWORD is set)
    if (process.env.TEST_ADMIN_PASSWORD) {
      performanceData.timestamps.bcryptCorrectStart = Date.now();
      const correctResult = await authService.verifyPassword(process.env.TEST_ADMIN_PASSWORD);
      performanceData.timestamps.bcryptCorrectComplete = Date.now();
      performanceData.timings.bcryptCorrectPassword = performanceData.timestamps.bcryptCorrectComplete - performanceData.timestamps.bcryptCorrectStart;
    }

    // 4. Memory usage analysis
    const memUsage = process.memoryUsage();
    performanceData.memoryUsage = {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };

    // 5. Additional performance checks
    performanceData.timestamps.endTime = Date.now();
    performanceData.timings.totalExecution = performanceData.timestamps.endTime - startTime;

    // Environment information
    performanceData.environment = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      vercelEnv: process.env.VERCEL_ENV,
      isVercel: process.env.VERCEL === "1",
      maxOldSpaceSize: process.execArgv.find(arg => arg.includes('max-old-space-size')),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Performance analysis
    const analysis = {
      potentialBottlenecks: [],
      recommendations: []
    };

    // Analyze timing bottlenecks
    if (performanceData.timings.totalImports > 1000) {
      analysis.potentialBottlenecks.push("Module imports taking >1s");
    }
    if (performanceData.timings.databaseInit > 2000) {
      analysis.potentialBottlenecks.push("Database initialization taking >2s");
    }
    if (performanceData.timings.bcryptWrongPassword > 3000) {
      analysis.potentialBottlenecks.push("bcrypt.compare() taking >3s");
    }
    if (performanceData.timings.totalExecution > 5000) {
      analysis.potentialBottlenecks.push("Total execution time >5s (approaching timeout risk)");
    }

    // Memory analysis
    const heapUsedMB = performanceData.memoryUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 512) {
      analysis.potentialBottlenecks.push(`High memory usage: ${heapUsedMB.toFixed(2)}MB heap used`);
    }

    // Generate recommendations
    if (performanceData.timings.databaseInit > 1000) {
      analysis.recommendations.push("Consider optimizing database connection pooling");
    }
    if (performanceData.timings.bcryptWrongPassword > 1000) {
      analysis.recommendations.push("Consider reducing bcrypt rounds for Vercel serverless");
    }
    if (performanceData.timings.totalExecution > 3000) {
      analysis.recommendations.push("Function approaching Vercel timeout limits - needs optimization");
    }

    res.status(200).json({
      success: true,
      performanceData,
      analysis,
      summary: {
        criticalPath: `Imports: ${performanceData.timings.totalImports}ms ’ DB Init: ${performanceData.timings.databaseInit}ms ’ bcrypt: ${performanceData.timings.bcryptWrongPassword}ms`,
        totalTime: performanceData.timings.totalExecution,
        memoryFootprint: `${heapUsedMB.toFixed(2)}MB`,
        timeoutRisk: performanceData.timings.totalExecution > 5000 ? "HIGH" : performanceData.timings.totalExecution > 3000 ? "MEDIUM" : "LOW"
      }
    });

  } catch (error) {
    performanceData.errors.push({
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });

    res.status(500).json({
      success: false,
      error: error.message,
      performanceData,
      partialTimings: performanceData.timings
    });
  }
}