import speakeasy from "speakeasy";
import bcrypt from "bcryptjs";
import { getDatabase } from "./database.js";
import authService from "./auth-service.js";
import { getMfaRateLimitService } from "./mfa-rate-limit-service.js";
import { decryptSecret } from "./security/encryption-utils.js";

/**
 * MFA Validation Middleware
 * Enforces MFA verification for admin endpoints
 */

/**
 * Middleware that requires MFA verification
 * Used for sensitive admin operations
 */
export function requireMfa(handler) {
  return async (req, res) => {
    try {
      // First check if user is authenticated
      const token = authService.getSessionFromRequest(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const session = authService.verifySessionToken(token);
      if (!session.valid) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }

      req.admin = session.admin;
      const adminId = req.admin.id || "admin";

      // Check if MFA is enabled for this admin
      const mfaStatus = await getMfaStatus(adminId);

      if (!mfaStatus.isEnabled) {
        // MFA not enabled - require setup for sensitive operations
        return res.status(403).json({
          error: "Multi-factor authentication is required for this operation",
          requiresMfaSetup: true,
        });
      }

      // Check if MFA is already verified in this session
      const sessionMfaStatus = await getSessionMfaStatus(token);
      
      if (sessionMfaStatus.isVerified) {
        // Check if MFA verification is still valid (within time window)
        const mfaAge = Date.now() - new Date(sessionMfaStatus.verifiedAt).getTime();
        const maxAge = parseInt(process.env.MFA_SESSION_DURATION || "1800000"); // 30 minutes default
        
        if (mfaAge < maxAge) {
          // MFA still valid, proceed with request
          req.admin.mfaVerified = true;
          req.admin.mfaVerifiedAt = sessionMfaStatus.verifiedAt;
          return handler(req, res);
        }
      }

      // MFA verification required
      return res.status(403).json({
        error: "Multi-factor authentication verification required",
        requiresMfaVerification: true,
      });
    } catch (error) {
      console.error("MFA middleware error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

/**
 * Middleware that optionally checks MFA status
 * Adds MFA info to request but doesn't block access
 */
export function checkMfaStatus(handler) {
  return async (req, res) => {
    try {
      const adminId = req.admin?.id || "admin";
      
      // Get MFA status
      const mfaStatus = await getMfaStatus(adminId);
      
      // Add MFA info to request
      req.admin = req.admin || {};
      req.admin.mfa = mfaStatus;

      // Check session MFA status if authenticated
      const token = authService.getSessionFromRequest(req);
      if (token) {
        const sessionMfaStatus = await getSessionMfaStatus(token);
        req.admin.mfa.sessionVerified = sessionMfaStatus.isVerified;
        req.admin.mfa.sessionVerifiedAt = sessionMfaStatus.verifiedAt;
      }

      return handler(req, res);
    } catch (error) {
      console.error("MFA status check error:", error);
      // Don't block request on error
      return handler(req, res);
    }
  };
}

/**
 * Verify MFA code for admin
 */
export async function verifyMfaCode(adminId, code, req) {
  const clientIP = req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
  
  try {
    // Check rate limiting first
    const rateLimitService = getMfaRateLimitService();
    const rateLimitResult = await rateLimitService.checkRateLimit(adminId, clientIP);

    if (rateLimitResult.isLocked) {
      await logMfaAttempt(adminId, "unknown", false, req, "rate_limited");
      return {
        success: false,
        error: `Too many failed attempts. Try again in ${rateLimitResult.remainingTime} minutes.`,
        rateLimited: true,
        remainingTime: rateLimitResult.remainingTime,
      };
    }

    const db = getDatabase();

    // Get MFA configuration
    const mfaConfig = await db.execute({
      sql: `SELECT totp_secret, is_enabled FROM admin_mfa_config WHERE admin_id = ?`,
      args: [adminId],
    });

    if (!mfaConfig.rows[0]?.is_enabled) {
      return {
        success: false,
        error: "MFA is not enabled",
        requiresSetup: true,
      };
    }

    const encryptedSecret = mfaConfig.rows[0].totp_secret;

    // Check if it's a TOTP code (6 digits)
    if (/^\d{6}$/.test(code)) {
      const decryptedSecret = decryptSecret(encryptedSecret);
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: "base32",
        token: code,
        window: 2, // Allow some time drift
      });

      if (verified) {
        await rateLimitService.clearAttempts(adminId, clientIP);
        await logMfaAttempt(adminId, "totp", true, req);
        
        // Update last used time
        await db.execute({
          sql: `UPDATE admin_mfa_config SET last_used_at = CURRENT_TIMESTAMP WHERE admin_id = ?`,
          args: [adminId],
        });

        return { success: true, method: "totp" };
      }
    }

    // Check if it's a backup code (8-character hex)
    if (/^[0-9A-F]{8}$/i.test(code.toUpperCase())) {
      const backupCodes = await db.execute({
        sql: `SELECT id, code_hash FROM admin_mfa_backup_codes 
              WHERE admin_id = ? AND is_used = FALSE`,
        args: [adminId],
      });

      for (const backupCode of backupCodes.rows) {
        const isValid = await bcrypt.compare(code.toUpperCase(), backupCode.code_hash);
        
        if (isValid) {
          // Mark backup code as used
          await db.execute({
            sql: `UPDATE admin_mfa_backup_codes 
                  SET is_used = TRUE, used_at = CURRENT_TIMESTAMP, used_from_ip = ?
                  WHERE id = ?`,
            args: [clientIP, backupCode.id],
          });

          await rateLimitService.clearAttempts(adminId, clientIP);
          await logMfaAttempt(adminId, "backup_code", true, req);
          
          return { success: true, method: "backup_code" };
        }
      }
    }

    // Failed verification
    const attemptType = /^\d{6}$/.test(code) ? "totp" : "backup_code";
    await rateLimitService.recordFailedAttempt(adminId, clientIP);
    await logMfaAttempt(adminId, attemptType, false, req, "invalid_code");

    return {
      success: false,
      error: "Invalid authentication code",
      attemptsRemaining: Math.max(0, rateLimitResult.attemptsRemaining - 1),
    };
  } catch (error) {
    console.error("Error verifying MFA code:", error);
    await logMfaAttempt(adminId, "unknown", false, req, "system_error");
    return {
      success: false,
      error: "Verification failed due to system error",
    };
  }
}

/**
 * Mark session as MFA verified
 */
export async function markSessionMfaVerified(sessionToken) {
  const db = getDatabase();

  try {
    const result = await db.execute({
      sql: `UPDATE admin_sessions 
            SET mfa_verified = TRUE, mfa_verified_at = CURRENT_TIMESTAMP 
            WHERE session_token = ?`,
      args: [sessionToken],
    });

    return result.changes > 0;
  } catch (error) {
    console.error("Error marking session MFA verified:", error);
    return false;
  }
}

/**
 * Get MFA status for admin
 */
async function getMfaStatus(adminId) {
  const db = getDatabase();

  try {
    const result = await db.execute({
      sql: `SELECT is_enabled, enabled_at, last_used_at, device_name 
            FROM admin_mfa_config WHERE admin_id = ?`,
      args: [adminId],
    });

    const config = result.rows[0];

    if (!config) {
      return {
        isSetup: false,
        isEnabled: false,
        requiresSetup: true,
      };
    }

    return {
      isSetup: true,
      isEnabled: config.is_enabled,
      enabledAt: config.enabled_at,
      lastUsedAt: config.last_used_at,
      deviceName: config.device_name,
      requiresSetup: false,
    };
  } catch (error) {
    console.error("Error getting MFA status:", error);
    return {
      isSetup: false,
      isEnabled: false,
      requiresSetup: true,
    };
  }
}

/**
 * Get session MFA verification status
 */
async function getSessionMfaStatus(sessionToken) {
  const db = getDatabase();

  try {
    const result = await db.execute({
      sql: `SELECT mfa_verified, mfa_verified_at FROM admin_sessions 
            WHERE session_token = ? AND is_active = TRUE`,
      args: [sessionToken],
    });

    const session = result.rows[0];

    return {
      isVerified: session?.mfa_verified || false,
      verifiedAt: session?.mfa_verified_at || null,
    };
  } catch (error) {
    console.error("Error getting session MFA status:", error);
    return {
      isVerified: false,
      verifiedAt: null,
    };
  }
}


/**
 * Log MFA attempt
 */
async function logMfaAttempt(adminId, attemptType, success, req, errorReason = null) {
  try {
    const db = getDatabase();
    const clientIP = req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const sessionToken = authService.getSessionFromRequest(req);

    await db.execute({
      sql: `INSERT INTO admin_mfa_attempts 
            (admin_id, attempt_type, success, ip_address, user_agent, error_reason, session_token) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [adminId, attemptType, success, clientIP, userAgent, errorReason, sessionToken],
    });
  } catch (error) {
    console.error("Failed to log MFA attempt:", error);
  }
}

export default {
  requireMfa,
  checkMfaStatus,
  verifyMfaCode,
  markSessionMfaVerified,
};