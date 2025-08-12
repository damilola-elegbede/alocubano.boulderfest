import authService from "../lib/auth-service.js";
import { getDatabaseClient } from "../lib/database.js";
import { getRateLimitService } from "../lib/rate-limit-service.js";
import { withSecurityHeaders } from "../lib/security-headers.js";
import {
  verifyMfaCode,
  markSessionMfaVerified,
} from "../lib/mfa-middleware.js";

async function loginHandler(req, res) {
  if (req.method === "POST") {
    const { password, mfaCode, step } = req.body;
    const clientIP =
      req.headers["x-forwarded-for"] || req.connection?.remoteAddress;

    if (!clientIP) {
      return res.status(400).json({ error: "Unable to identify client" });
    }

    // Handle two-step authentication process
    try {
      if (step === "mfa" || mfaCode) {
        // Step 2: MFA verification
        return await handleMfaStep(req, res, mfaCode, clientIP);
      } else {
        // Step 1: Password verification
        return await handlePasswordStep(req, res, password, clientIP);
      }
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

/**
 * Handle password verification step (Step 1)
 */
async function handlePasswordStep(req, res, password, clientIP) {
  if (!password || typeof password !== "string" || password.length > 200) {
    return res.status(400).json({ error: "Invalid password format" });
  }

  const rateLimitService = getRateLimitService();
  const db = await getDatabaseClient();

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
    const attemptResult = await rateLimitService.recordFailedAttempt(clientIP);

    const response = {
      error: "Invalid password",
      attemptsRemaining: attemptResult.attemptsRemaining,
    };

    if (attemptResult.isLocked) {
      response.error = "Too many failed attempts. Account temporarily locked.";
      return res.status(429).json(response);
    }

    return res.status(401).json(response);
  }

  // Clear login attempts on password success
  await rateLimitService.clearAttempts(clientIP);

  // Check if MFA is enabled
  const adminId = "admin"; // Default admin ID
  const mfaStatus = await getMfaStatus(adminId);

  if (!mfaStatus.isEnabled) {
    // No MFA required - complete login
    return await completeLogin(req, res, adminId, clientIP, false);
  }

  // MFA is required - create temporary session and request MFA
  const tempToken = authService.createSessionToken(adminId);

  // Store temporary session (not MFA verified yet)
  try {
    await db.execute({
      sql: `INSERT INTO admin_sessions 
            (session_token, ip_address, user_agent, mfa_verified, requires_mfa_setup, expires_at) 
            VALUES (?, ?, ?, FALSE, FALSE, ?)`,
      args: [
        tempToken,
        clientIP,
        req.headers["user-agent"] || null,
        new Date(Date.now() + authService.sessionDuration).toISOString(),
      ],
    });
  } catch (error) {
    console.error("Failed to create temporary session:", error);
  }

  return res.status(200).json({
    success: true,
    requiresMfa: true,
    tempToken,
    message: "Password verified. Please provide your MFA code.",
  });
}

/**
 * Handle MFA verification step (Step 2)
 */
async function handleMfaStep(req, res, mfaCode, clientIP) {
  if (!mfaCode || typeof mfaCode !== "string") {
    return res.status(400).json({ error: "MFA code is required" });
  }

  // Get temp token from Authorization header or body
  const tempToken =
    authService.getSessionFromRequest(req) || req.body.tempToken;

  if (!tempToken) {
    return res.status(400).json({ error: "Temporary session token required" });
  }

  // Verify temp session
  const session = authService.verifySessionToken(tempToken);
  if (!session.valid) {
    return res
      .status(401)
      .json({ error: "Invalid or expired temporary session" });
  }

  const adminId = session.admin.id || "admin";

  // Verify MFA code
  const mfaResult = await verifyMfaCode(adminId, mfaCode, req);

  if (!mfaResult.success) {
    const response = {
      error: mfaResult.error,
    };

    if (mfaResult.rateLimited) {
      response.remainingTime = mfaResult.remainingTime;
      return res.status(429).json(response);
    }

    if (mfaResult.requiresSetup) {
      response.requiresMfaSetup = true;
    }

    if (mfaResult.attemptsRemaining !== undefined) {
      response.attemptsRemaining = mfaResult.attemptsRemaining;
    }

    return res.status(401).json(response);
  }

  // MFA verified - mark session as fully authenticated
  await markSessionMfaVerified(tempToken);

  // Complete login
  return await completeLogin(req, res, adminId, clientIP, true, tempToken);
}

/**
 * Complete login process and create final session
 */
async function completeLogin(
  req,
  res,
  adminId,
  clientIP,
  mfaUsed = false,
  existingToken = null,
) {
  const db = await getDatabaseClient();

  // Use existing token or create new one
  const token = existingToken || authService.createSessionToken(adminId);
  const cookie = authService.createSessionCookie(token);

  // Update or create session record
  if (existingToken) {
    // Update existing temporary session to be fully authenticated
    await db.execute({
      sql: `UPDATE admin_sessions 
            SET mfa_verified = ?, last_accessed_at = CURRENT_TIMESTAMP 
            WHERE session_token = ?`,
      args: [mfaUsed, token],
    });
  } else {
    // Create new session record (no MFA case)
    try {
      await db.execute({
        sql: `INSERT INTO admin_sessions 
              (session_token, ip_address, user_agent, mfa_verified, expires_at) 
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          token,
          clientIP,
          req.headers["user-agent"] || null,
          mfaUsed,
          new Date(Date.now() + authService.sessionDuration).toISOString(),
        ],
      });
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  }

  // Log successful login
  try {
    await db.execute({
      sql: `INSERT INTO admin_activity_log (
        session_token, action, ip_address, user_agent, request_details, success
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        token,
        mfaUsed ? "login_with_mfa" : "login",
        clientIP,
        req.headers["user-agent"] || null,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          mfaUsed,
          adminId,
        }),
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
    mfaUsed,
    adminId,
  });
}

/**
 * Get MFA status for admin
 */
async function getMfaStatus(adminId) {
  const db = await getDatabaseClient();

  try {
    const result = await db.execute({
      sql: `SELECT is_enabled FROM admin_mfa_config WHERE admin_id = ?`,
      args: [adminId],
    });

    return {
      isEnabled: result.rows[0]?.is_enabled || false,
    };
  } catch (error) {
    console.error("Error checking MFA status:", error);
    return { isEnabled: false };
  }
}

export default withSecurityHeaders(loginHandler);
