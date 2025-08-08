import authService from "../lib/auth-service.js";
import { getDatabase } from "../lib/database.js";

// Track login attempts (in production, use database or Redis)
const loginAttempts = new Map();
const MAX_ATTEMPTS = parseInt(process.env.ADMIN_MAX_LOGIN_ATTEMPTS || "5");
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { password } = req.body;
    const clientIP =
      req.headers["x-forwarded-for"] || req.connection?.remoteAddress;

    // Check login attempts
    const attempts = loginAttempts.get(clientIP) || {
      count: 0,
      lockedUntil: 0,
    };

    if (Date.now() < attempts.lockedUntil) {
      const remainingTime = Math.ceil(
        (attempts.lockedUntil - Date.now()) / 1000 / 60,
      );
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${remainingTime} minutes.`,
      });
    }

    // Verify password
    const isValid = await authService.verifyPassword(password);

    if (!isValid) {
      // Increment failed attempts
      attempts.count++;

      if (attempts.count >= MAX_ATTEMPTS) {
        attempts.lockedUntil = Date.now() + LOCKOUT_DURATION;
      }

      loginAttempts.set(clientIP, attempts);

      return res.status(401).json({
        error: "Invalid password",
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts.count),
      });
    }

    // Clear login attempts on success
    loginAttempts.delete(clientIP);

    // Create session
    const token = authService.createSessionToken();
    const cookie = authService.createSessionCookie(token);

    // Log successful login
    try {
      const db = getDatabase();
      await db.execute({
        sql: `INSERT INTO payment_events (
          event_id, event_type, event_source, event_data, processing_status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: [
          `LOGIN-${Date.now()}`,
          "admin_login",
          "admin",
          JSON.stringify({ ip: clientIP, timestamp: new Date().toISOString() }),
          "processed",
        ],
      });
    } catch (error) {
      console.error("Failed to log admin login:", error);
    }

    res.setHeader("Set-Cookie", cookie);
    res.status(200).json({
      success: true,
      token, // Also return token for API usage
      expiresIn: authService.sessionDuration,
    });
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
