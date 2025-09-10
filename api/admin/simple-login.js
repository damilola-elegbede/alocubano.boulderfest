import { getAuthService } from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";

export default withSecurityHeaders(async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { username, password } = req.body || {};

    // Basic validation
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    // Get services
    const authService = getAuthService();
    authService.ensureInitialized();

    // Verify username (hardcoded as 'admin')
    if (username !== 'admin') {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isPasswordValid = await authService.verifyPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create session
    const token = authService.createSessionToken('admin');
    const cookie = authService.createSessionCookie(token);

    // Store session in database
    const db = await getDatabaseClient();
    const clientIP = req.headers["x-forwarded-for"]?.split(',')[0]?.trim() || 'unknown';
    
    try {
      await db.execute({
        sql: `INSERT INTO admin_sessions 
              (session_token, ip_address, user_agent, mfa_verified, expires_at) 
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          token,
          clientIP,
          req.headers["user-agent"] || 'unknown',
          false, // No MFA for now
          new Date(Date.now() + authService.sessionDuration).toISOString(),
        ],
      });
    } catch (dbError) {
      console.error("Failed to store session:", dbError);
      // Continue anyway - session will work via JWT
    }

    res.setHeader("Set-Cookie", cookie);
    return res.status(200).json({
      success: true,
      expiresIn: authService.sessionDuration,
      adminId: 'admin',
    });

  } catch (error) {
    console.error("Simple login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
