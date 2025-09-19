import authService from "../../lib/auth-service.js";
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';

/**
 * Verify admin session endpoint
 * GET/POST /api/admin/verify-session
 *
 * Checks if the current session is valid without requiring full authentication
 */
async function handler(req, res) {
  // Set Cache-Control headers to prevent caching of sensitive auth data
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  
  // Set CORS headers - echo origin instead of "*" when credentials needed
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET and POST
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Ensure auth service is initialized to get session duration
    await authService.ensureInitialized();

    // Verify session from request
    const session = await authService.verifySessionFromRequest(req);

    if (session.valid) {
      // Calculate remaining session time using service session duration
      const now = Date.now();
      const loginTime = session.admin.loginTime;
      const sessionDuration = authService.sessionDuration;
      const elapsed = now - loginTime;
      const remaining = Math.max(0, sessionDuration - elapsed);      
      return res.status(200).json({
        valid: true,
        admin: {
          id: session.admin.id,
          role: session.admin.role,
        },
        sessionInfo: {
          loginTime: loginTime,
          remainingMs: remaining,
          remainingMinutes: Math.floor(remaining / 60000),
          expiresAt: loginTime + sessionDuration,
        },
      });
    } else {
      return res.status(401).json({
        valid: false,
        error: session.error || "Invalid or expired session",
      });
    }
  } catch (error) {
    console.error("Session verification error:", error);
    return res.status(500).json({
      valid: false,
      error: "Failed to verify session",
    });
  }
}

export default withAdminAudit(handler, {
  logBody: false, // Session verification doesn't need body logging
  logMetadata: false, // Keep lightweight for session checks
  skipMethods: [] // Still log session verification attempts
});
