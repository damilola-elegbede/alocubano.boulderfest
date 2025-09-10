/**
 * Simple endpoint to test rate limit service import
 * This helps validate that the rate limit service imports work in Vercel
 */

import rateLimitService from "../../lib/rate-limit-service.js";

export default function handler(req, res) {
  try {
    // Test that the rate limit service can be imported and used
    const testClient = "test-client";
    const result = rateLimitService.recordFailedAttempt(testClient);
    
    res.status(200).json({
      success: true,
      message: "Rate limit service working",
      testResult: {
        attemptsRemaining: result.attemptsRemaining,
        isLocked: result.isLocked
      }
    });
  } catch (error) {
    console.error("Rate limit test failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}