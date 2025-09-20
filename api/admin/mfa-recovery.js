import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { getMfaRateLimitService } from "../../lib/mfa-rate-limit-service.js";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { withHighSecurityAudit } from "../../lib/admin-audit-middleware.js";

/**
 * MFA Recovery Endpoint
 * Handles recovery procedures for lost MFA devices and emergency access
 */
async function mfaRecoveryHandler(req, res) {
  const { method } = req;
  const { action } = req.query;

  try {
    switch (method) {
    case 'GET':
      return await handleGetRecoveryInfo(req, res);
    case 'POST':
      switch (action) {
      case 'verify-backup-code':
        return await handleVerifyBackupCode(req, res);
      case 'emergency-disable':
        return await handleEmergencyDisable(req, res);
      case 'generate-recovery-token':
        return await handleGenerateRecoveryToken(req, res);
      case 'use-recovery-token':
        return await handleUseRecoveryToken(req, res);
      default:
        return res.status(400).json({ error: 'Invalid recovery action' });
      }
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error('MFA recovery error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get recovery information and options
 */
async function handleGetRecoveryInfo(req, res) {
  const db = await getDatabaseClient();
  const adminId = req.admin?.id || 'admin';

  try {
    // Get MFA status
    const mfaConfig = await db.execute({
      sql: `SELECT is_enabled, device_name, enabled_at
            FROM admin_mfa_config WHERE admin_id = ?`,
      args: [adminId]
    });

    if (!mfaConfig.rows[0]?.is_enabled) {
      return res.status(400).json({
        error: 'MFA is not enabled. Recovery options are not available.'
      });
    }

    // Count available backup codes
    const backupCodesResult = await db.execute({
      sql: `SELECT COUNT(*) as available_codes
            FROM admin_mfa_backup_codes
            WHERE admin_id = ? AND is_used = FALSE`,
      args: [adminId]
    });

    // Get recent recovery attempts
    const recoveryAttempts = await db.execute({
      sql: `SELECT COUNT(*) as attempts
            FROM admin_mfa_attempts
            WHERE admin_id = ? AND attempt_type = 'backup_code'
            AND created_at > datetime('now', '-1 day')`,
      args: [adminId]
    });

    const config = mfaConfig.rows[0];
    const availableBackupCodes =
      backupCodesResult.rows[0]?.available_codes || 0;
    const recentRecoveryAttempts = recoveryAttempts.rows[0]?.attempts || 0;

    res.status(200).json({
      mfaEnabled: true,
      deviceName: config.device_name,
      enabledAt: config.enabled_at,
      recoveryOptions: {
        backupCodes: {
          available: availableBackupCodes,
          description: 'Use one of your saved backup codes to regain access'
        },
        emergencyDisable: {
          available: true,
          description:
            'Permanently disable MFA using master password confirmation',
          warning: 'This will remove all MFA protection from your account'
        }
      },
      recentActivity: {
        recoveryAttempts: recentRecoveryAttempts
      }
    });
  } catch (error) {
    console.error('Error getting recovery info:', error);
    res.status(500).json({ error: 'Failed to get recovery information' });
  }
}

/**
 * Verify backup code for recovery
 */
async function handleVerifyBackupCode(req, res) {
  const { backupCode } = req.body;
  const adminId = req.admin?.id || 'admin';
  const clientIP =
    req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

  if (!backupCode || typeof backupCode !== 'string') {
    return res.status(400).json({ error: 'Backup code is required' });
  }

  // Normalize backup code (uppercase, remove spaces/dashes)
  const normalizedCode = backupCode.toUpperCase().replace(/[\s\-]/g, '');

  if (!/^[0-9A-F]{8}$/.test(normalizedCode)) {
    return res.status(400).json({
      error: 'Invalid backup code format. Expected 8-character code.'
    });
  }

  try {
    // Check rate limiting
    const rateLimitService = getMfaRateLimitService();
    const rateLimitResult = await rateLimitService.checkRateLimit(
      adminId,
      clientIP
    );

    if (rateLimitResult.isLocked) {
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${rateLimitResult.remainingTime} minutes.`,
        remainingTime: rateLimitResult.remainingTime
      });
    }

    const db = await getDatabaseClient();

    // Get unused backup codes
    const backupCodes = await db.execute({
      sql: `SELECT id, code_hash FROM admin_mfa_backup_codes
            WHERE admin_id = ? AND is_used = FALSE`,
      args: [adminId]
    });

    let codeFound = false;
    let codeId = null;

    // Check each backup code
    for (const storedCode of backupCodes.rows) {
      const isValid = await bcrypt.compare(
        normalizedCode,
        storedCode.code_hash
      );

      if (isValid) {
        codeFound = true;
        codeId = storedCode.id;
        break;
      }
    }

    if (!codeFound) {
      // Log failed attempt
      await logRecoveryAttempt(
        adminId,
        'backup_code',
        false,
        req,
        'invalid_code'
      );
      await rateLimitService.recordFailedAttempt(adminId, clientIP);

      return res.status(401).json({
        error: 'Invalid backup code',
        attemptsRemaining: Math.max(0, rateLimitResult.attemptsRemaining - 1)
      });
    }

    // Mark backup code as used
    await db.execute({
      sql: `UPDATE admin_mfa_backup_codes
            SET is_used = TRUE, used_at = CURRENT_TIMESTAMP, used_from_ip = ?
            WHERE id = ?`,
      args: [clientIP, codeId]
    });

    // Clear rate limiting
    await rateLimitService.clearAttempts(adminId, clientIP);

    // Log successful recovery
    await logRecoveryAttempt(adminId, 'backup_code', true, req);

    // Set security headers to prevent caching of recovery tokens
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Generate temporary recovery session
    const recoveryToken = await generateRecoveryToken(adminId);

    res.status(200).json({
      success: true,
      message: 'Backup code verified successfully',
      recoveryToken,
      expiresIn: 900000, // 15 minutes
      options: [
        {
          action: 'disable_mfa',
          description: 'Disable MFA completely (not recommended)'
        },
        {
          action: 'generate_new_backup_codes',
          description: 'Generate new backup codes (recommended)'
        },
        {
          action: 'setup_new_device',
          description: 'Set up MFA on a new device'
        }
      ]
    });
  } catch (error) {
    console.error('Error verifying backup code:', error);
    res.status(500).json({ error: 'Failed to verify backup code' });
  }
}

/**
 * Emergency disable MFA (requires master password confirmation)
 */
async function handleEmergencyDisable(req, res) {
  const { masterPassword, confirmDisable } = req.body;
  const adminId = req.admin?.id || 'admin';
  const clientIP =
    req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

  if (confirmDisable !== 'PERMANENTLY_DISABLE_MFA') {
    return res.status(400).json({
      error: 'Emergency disable requires explicit confirmation',
      required: { confirmDisable: 'PERMANENTLY_DISABLE_MFA' }
    });
  }

  if (!masterPassword || typeof masterPassword !== 'string') {
    return res.status(400).json({ error: 'Master password is required' });
  }

  try {
    // Verify master password
    const isValidPassword = await authService.verifyPassword(masterPassword);

    if (!isValidPassword) {
      await logRecoveryAttempt(
        adminId,
        'emergency_disable',
        false,
        req,
        'invalid_password'
      );
      return res.status(401).json({ error: 'Invalid master password' });
    }

    const db = await getDatabaseClient();

    // Disable MFA and remove all related data
    await db.execute({
      sql: 'DELETE FROM admin_mfa_config WHERE admin_id = ?',
      args: [adminId]
    });

    await db.execute({
      sql: 'DELETE FROM admin_mfa_backup_codes WHERE admin_id = ?',
      args: [adminId]
    });

    await db.execute({
      sql: 'DELETE FROM admin_mfa_rate_limits WHERE admin_id = ?',
      args: [adminId]
    });

    // Update any existing sessions to not require MFA
    await db.execute({
      sql: `UPDATE admin_sessions
            SET mfa_verified = FALSE, requires_mfa_setup = FALSE
            WHERE session_token IN (
              SELECT session_token FROM admin_activity_log
              WHERE action LIKE 'login%' AND ip_address = ?
              ORDER BY created_at DESC LIMIT 10
            )`,
      args: [clientIP]
    });

    // Log emergency disable
    await logRecoveryAttempt(adminId, 'emergency_disable', true, req);

    await db.execute({
      sql: `INSERT INTO admin_activity_log
            (session_token, action, ip_address, user_agent, request_details, success)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        authService.getSessionFromRequest(req),
        'mfa_emergency_disabled',
        clientIP,
        req.headers['user-agent'] || null,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          reason: 'emergency_recovery',
          adminId
        }),
        true
      ]
    });

    res.status(200).json({
      success: true,
      message: 'MFA has been permanently disabled',
      warning:
        'Your account no longer has multi-factor authentication protection',
      recommendation: 'Set up MFA again as soon as possible for security'
    });
  } catch (error) {
    console.error('Error in emergency MFA disable:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
}

/**
 * Generate recovery token (admin must already be authenticated)
 */
async function handleGenerateRecoveryToken(req, res) {
  const adminId = req.admin?.id || 'admin';

  try {
    // Verify admin is authenticated (this endpoint requires auth middleware)
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const recoveryToken = await generateRecoveryToken(adminId);

    // Log recovery token generation
    await logRecoveryAttempt(adminId, 'recovery_token_generated', true, req);

    // Set security headers to prevent caching of recovery tokens
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      recoveryToken,
      expiresIn: 900000, // 15 minutes
      message: 'Recovery token generated. Use this to access recovery options.'
    });
  } catch (error) {
    console.error('Error generating recovery token:', error);
    res.status(500).json({ error: 'Failed to generate recovery token' });
  }
}

/**
 * Use recovery token for various recovery actions
 */
async function handleUseRecoveryToken(req, res) {
  const { recoveryToken, recoveryAction } = req.body;

  if (!recoveryToken || !recoveryAction) {
    return res.status(400).json({
      error: 'Recovery token and action are required'
    });
  }

  try {
    // Verify recovery token
    const tokenData = await verifyRecoveryToken(recoveryToken);

    if (!tokenData.valid) {
      return res
        .status(401)
        .json({ error: 'Invalid or expired recovery token' });
    }

    const adminId = tokenData.adminId;

    // Handle different recovery actions
    switch (recoveryAction) {
    case 'disable_mfa':
      return await disableMfaWithRecoveryToken(req, res, adminId);
    case 'generate_new_backup_codes':
      return await generateNewBackupCodesWithRecovery(req, res, adminId);
    case 'reset_mfa_setup':
      return await resetMfaSetupWithRecovery(req, res, adminId);
    default:
      return res.status(400).json({ error: 'Invalid recovery action' });
    }
  } catch (error) {
    console.error('Error using recovery token:', error);
    res.status(500).json({ error: 'Failed to process recovery action' });
  }
}

/**
 * Generate recovery token
 */
async function generateRecoveryToken(adminId) {
  const payload = {
    adminId,
    type: 'recovery',
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes
    iat: Math.floor(Date.now() / 1000)
  };

  return await authService.createSessionToken(payload);
}

/**
 * Verify recovery token
 */
async function verifyRecoveryToken(token) {
  try {
    const decoded = await authService.verifySessionToken(token);

    if (!decoded.valid || decoded.admin.type !== 'recovery') {
      return { valid: false };
    }

    return {
      valid: true,
      adminId: decoded.admin.adminId,
      exp: decoded.admin.exp
    };
  } catch {
    return { valid: false };
  }
}

/**
 * Disable MFA using recovery token
 */
async function disableMfaWithRecoveryToken(req, res, adminId) {
  const db = await getDatabaseClient();

  try {
    // Remove all MFA data
    await db.execute({
      sql: 'DELETE FROM admin_mfa_config WHERE admin_id = ?',
      args: [adminId]
    });

    await db.execute({
      sql: 'DELETE FROM admin_mfa_backup_codes WHERE admin_id = ?',
      args: [adminId]
    });

    // Log the action
    await logRecoveryAttempt(adminId, 'mfa_disabled_via_recovery', true, req);

    res.status(200).json({
      success: true,
      message: 'MFA disabled successfully using recovery token'
    });
  } catch (error) {
    console.error('Error disabling MFA via recovery:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
}

/**
 * Generate new backup codes with recovery token
 */
async function generateNewBackupCodesWithRecovery(req, res, adminId) {
  const db = await getDatabaseClient();

  try {
    // Check if MFA is still enabled
    const mfaConfig = await db.execute({
      sql: 'SELECT is_enabled FROM admin_mfa_config WHERE admin_id = ?',
      args: [adminId]
    });

    if (!mfaConfig.rows[0]?.is_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled' });
    }

    // Generate new backup codes
    const newCodes = [];
    const codeHashes = [];

    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      newCodes.push(code);
      const hash = await bcrypt.hash(code, 10);
      codeHashes.push(hash);
    }

    // Replace all existing backup codes
    await db.execute({
      sql: 'DELETE FROM admin_mfa_backup_codes WHERE admin_id = ?',
      args: [adminId]
    });

    for (const hash of codeHashes) {
      await db.execute({
        sql: 'INSERT INTO admin_mfa_backup_codes (admin_id, code_hash) VALUES (?, ?)',
        args: [adminId, hash]
      });
    }

    // Log the action
    await logRecoveryAttempt(
      adminId,
      'backup_codes_regenerated_via_recovery',
      true,
      req
    );

    // Set security headers to prevent caching of backup codes
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      success: true,
      message: 'New backup codes generated successfully',
      backupCodes: newCodes,
      warning: 'Store these codes securely. They will not be shown again.'
    });
  } catch (error) {
    console.error('Error generating backup codes via recovery:', error);
    res.status(500).json({ error: 'Failed to generate backup codes' });
  }
}

/**
 * Reset MFA setup with recovery token
 */
async function resetMfaSetupWithRecovery(req, res, adminId) {
  const db = await getDatabaseClient();

  try {
    // Reset MFA configuration to allow new setup
    await db.execute({
      sql: `UPDATE admin_mfa_config
            SET is_enabled = FALSE, totp_secret = NULL, enabled_at = NULL
            WHERE admin_id = ?`,
      args: [adminId]
    });

    // Clear backup codes
    await db.execute({
      sql: 'DELETE FROM admin_mfa_backup_codes WHERE admin_id = ?',
      args: [adminId]
    });

    // Log the action
    await logRecoveryAttempt(adminId, 'mfa_reset_for_new_setup', true, req);

    res.status(200).json({
      success: true,
      message:
        'MFA setup reset successfully. You can now set up MFA on a new device.'
    });
  } catch (error) {
    console.error('Error resetting MFA setup via recovery:', error);
    res.status(500).json({ error: 'Failed to reset MFA setup' });
  }
}

/**
 * Log recovery attempt
 */
async function logRecoveryAttempt(
  adminId,
  attemptType,
  success,
  req,
  errorReason = null
) {
  try {
    const db = await getDatabaseClient();
    const clientIP =
      req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const sessionToken = authService.getSessionFromRequest(req);

    await db.execute({
      sql: `INSERT INTO admin_mfa_attempts
            (admin_id, attempt_type, success, ip_address, user_agent, error_reason, session_token)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        adminId,
        attemptType,
        success,
        clientIP,
        userAgent,
        errorReason,
        sessionToken
      ]
    });
  } catch (error) {
    console.error('Failed to log recovery attempt:', error);
  }
}

// Apply security headers and audit (note: this endpoint should NOT require auth for recovery scenarios)
export default withSecurityHeaders(withHighSecurityAudit(mfaRecoveryHandler, {
  requireExplicitAction: true,
  logFullRequest: true,
  alertOnFailure: true
}));
