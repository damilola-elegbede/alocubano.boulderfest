import authService from "../lib/auth-service.js";
import { getDatabase } from "../lib/database.js";
import { getRateLimitService } from "../lib/rate-limit-service.js";
import { withSecurityHeaders } from "../lib/security-headers.js";

async function loginHandler(req, res) {
  if (req.method === "POST") {
    const { password } = req.body;
    const clientIP =
      req.headers["x-forwarded-for"] || req.connection?.remoteAddress;

    if (!clientIP) {
      return res.status(400).json({ error: "Unable to identify client" });
    }

    if (!password || typeof password !== "string" || password.length > 200) {
      return res.status(400).json({ error: "Invalid password format" });
    }

    const rateLimitService = getRateLimitService();

    try {
      // Check rate limiting
      const rateLimitResult = await rateLimitService.checkRateLimit(clientIP);

      if (rateLimitResult.isLocked) {
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${rateLimitResult.remainingTime} minutes.`,
          remainingTime: rateLimitResult.remainingTime,
        });
      }

      // Verify password
      const isValid = await authService.verifyPassword(password);

      if (!isValid) {
        // Record failed attempt
        const attemptResult =
          await rateLimitService.recordFailedAttempt(clientIP);

        const response = {
          error: "Invalid password",
          attemptsRemaining: attemptResult.attemptsRemaining,
        };

        if (attemptResult.isLocked) {
          response.error =
            "Too many failed attempts. Account temporarily locked.";
          return res.status(429).json(response);
        }

        return res.status(401).json(response);
      }

      // Clear login attempts on success
      await rateLimitService.clearAttempts(clientIP);

      // Create session
      const token = authService.createSessionToken();
      const cookie = authService.createSessionCookie(token);

      // Log successful login
      try {
        const db = getDatabase();
        await db.execute({
          sql: `INSERT INTO admin_activity_log (
            session_token, action, ip_address, user_agent, request_details, success
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            token,
            "login",
            clientIP,
            req.headers["user-agent"] || null,
            JSON.stringify({ timestamp: new Date().toISOString() }),
            true,
          ],
        });
      } catch (error) {
        console.error("Failed to log admin login:", error);
        // Don't fail the login if logging fails
      }

      res.setHeader("Set-Cookie", cookie);
      res.status(200).json({
        success: true,
        expiresIn: authService.sessionDuration,
      });
    } catch (error) {
      console.error("Login process failed:", error);

      // Try to record the failed attempt even if other errors occurred
      try {
        const rateLimitService = getRateLimitService();
        await rateLimitService.recordFailedAttempt(clientIP);
      } catch (rateLimitError) {
        console.error("Failed to record rate limit attempt:", rateLimitError);
      }

      res.status(500).json({ error: "Internal server error" });
    }
  } else if (req.method === "DELETE") {
    // Logout
    const cookie = authService.clearSessionCookie();
    res.setHeader("Set-Cookie", cookie);
    res.status(200).json({ success: true });
  } else {
    res.setHeader("Allow", ["POST", "DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default withSecurityHeaders(loginHandler);
