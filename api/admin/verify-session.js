import authService from "../../lib/auth-service.js";

/**
 * Verify admin session endpoint
 * GET/POST /api/admin/verify-session
 * 
 * Checks if the current session is valid without requiring full authentication
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET and POST
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify session from request
    const session = await authService.verifySessionFromRequest(req);

    if (session.valid) {
      // Calculate remaining session time
      const now = Date.now();
      const loginTime = session.admin.loginTime;
      const sessionDuration = parseInt(
        process.env.ADMIN_SESSION_DURATION || "3600000"
      );
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