/**
 * Test MFA Middleware Import and Basic Functionality
 * 
 * This endpoint tests if the mfa-middleware can be imported correctly
 * after fixing the critical import issue.
 */

import { requireMfa, checkMfaStatus, verifyMfaCode } from "../../lib/mfa-middleware.js";

export default async function handler(req, res) {
  try {
    // Test that we can import the MFA middleware functions
    const imports = {
      requireMfa: typeof requireMfa,
      checkMfaStatus: typeof checkMfaStatus, 
      verifyMfaCode: typeof verifyMfaCode
    };

    // Test creating a middleware function
    let middlewareCreated = false;
    try {
      const testMiddleware = requireMfa(() => {});
      middlewareCreated = typeof testMiddleware === 'function';
    } catch (error) {
      middlewareCreated = false;
    }

    // Test creating the check status middleware
    let statusMiddlewareCreated = false;
    try {
      const statusMiddleware = checkMfaStatus(() => {});
      statusMiddlewareCreated = typeof statusMiddleware === 'function';
    } catch (error) {
      statusMiddlewareCreated = false;
    }

    res.status(200).json({
      success: true,
      message: "MFA middleware import test successful",
      results: {
        imports,
        middlewareCreated,
        statusMiddlewareCreated,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error("MFA middleware test error:", error);
    
    res.status(500).json({
      success: false,
      error: "MFA middleware test failed",
      details: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }
    });
  }
}