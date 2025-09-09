import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import authService from '../lib/auth-service.js';
import { getDatabaseClient } from '../lib/database.js';
import { withSecurityHeaders } from '../lib/security-headers.js';
import { getMfaRateLimitService } from '../lib/mfa-rate-limit-service.js';
import { verifyMfaCode } from '../lib/mfa-middleware.js';
import {
  encryptSecret,
  decryptSecret
} from '../lib/security/encryption-utils.js';

/**
 * MFA Setup and Management Endpoint
 * Handles TOTP setup, QR code generation, backup codes, and MFA configuration
 */
async function mfaSetupHandler(req, res) {
  const { method } = req;
  const { action } = req.query;

  try {
    switch (method) {
    case 'GET':
      return await handleGetMfaStatus(req, res);
    case 'POST':
      switch (action) {
      case 'generate-secret':
        return await handleGenerateSecret(req, res);
      case 'verify-setup':
        return await handleVerifySetup(req, res);
      case 'generate-backup-codes':
        return await handleGenerateBackupCodes(req, res);
      case 'disable':
        return await handleDisableMfa(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action' });
      }
    case 'DELETE':
      return await handleResetMfa(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      return res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error('MFA setup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get current MFA status for admin
 */
async function handleGetMfaStatus(req, res) {
  const db = await getDatabaseClient();
  const adminId = req.admin?.id || 'admin';

  try {
    // Get MFA configuration
    const mfaConfig = await db.execute({
      sql: `SELECT is_enabled, enabled_at, last_used_at, device_name, 
                   secret_created_at FROM admin_mfa_config WHERE admin_id = ?`,
      args: [adminId]
    });

    // Count unused backup codes
    const backupCodes = await db.execute({
      sql: `SELECT COUNT(*) as count FROM admin_mfa_backup_codes 
            WHERE admin_id = ? AND is_used = FALSE`,
      args: [adminId]
    });

    // Get recent MFA attempts (last 24 hours)
    const recentAttempts = await db.execute({
      sql: `SELECT COUNT(*) as total_attempts, 
                   SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful_attempts
            FROM admin_mfa_attempts 
            WHERE admin_id = ? AND created_at > datetime('now', '-1 day')`,
      args: [adminId]
    });

    const config = mfaConfig.rows[0];
    const status = {
      isEnabled: config?.is_enabled || false,
      isSetup: !!config,
      enabledAt: config?.enabled_at,
      lastUsedAt: config?.last_used_at,
      deviceName: config?.device_name,
      secretCreatedAt: config?.secret_created_at,
      backupCodesCount: backupCodes.rows[0]?.count || 0,
      recentAttempts: {
        total: recentAttempts.rows[0]?.total_attempts || 0,
        successful: recentAttempts.rows[0]?.successful_attempts || 0
      }
    };

    res.status(200).json(status);
  } catch (error) {
    console.error('Error getting MFA status:', error);
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
}

/**
 * Generate new TOTP secret and QR code
 */
async function handleGenerateSecret(req, res) {
  const db = await getDatabaseClient();
  const adminId = req.admin?.id || 'admin';
  const { deviceName = 'Authenticator App' } = req.body || {};

  try {
    // Check if MFA is already enabled
    const existingConfig = await db.execute({
      sql: 'SELECT is_enabled FROM admin_mfa_config WHERE admin_id = ?',
      args: [adminId]
    });

    if (existingConfig.rows[0]?.is_enabled) {
      return res.status(409).json({
        error:
          'MFA is already enabled. Disable it first to generate a new secret.'
      });
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `A Lo Cubano Boulder Fest Admin (${adminId})`,
      issuer: 'A Lo Cubano Boulder Fest',
      length: 32
    });

    // Encrypt the secret for storage
    const encryptedSecret = encryptSecret(secret.base32);

    // Store the secret in database (not enabled yet)
    await db.execute({
      sql: `INSERT OR REPLACE INTO admin_mfa_config 
            (admin_id, totp_secret, device_name, is_enabled, secret_created_at) 
            VALUES (?, ?, ?, FALSE, CURRENT_TIMESTAMP)`,
      args: [adminId, encryptedSecret, deviceName]
    });

    // Generate QR code
    const qrCodeUrl = secret.otpauth_url;
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl);

    // Log the secret generation
    await logMfaEvent(adminId, 'secret_generated', req, {
      deviceName
    });

    res.status(200).json({
      secret: secret.base32, // Return for manual entry
      qrCodeUrl: qrCodeDataUrl,
      manualEntryKey: secret.base32,
      issuer: 'A Lo Cubano Boulder Fest',
      accountName: `A Lo Cubano Boulder Fest Admin (${adminId})`
    });
  } catch (error) {
    console.error('Error generating MFA secret:', error);
    res.status(500).json({ error: 'Failed to generate MFA secret' });
  }
}

/**
 * Verify TOTP code and enable MFA
 */
async function handleVerifySetup(req, res) {
  const db = await getDatabaseClient();
  const adminId = req.admin?.id || 'admin';
  const { token, deviceName } = req.body || {};
  const clientIP =
    req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

  if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid TOTP code format' });
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

    // Get the stored secret
    const secretResult = await db.execute({
      sql: 'SELECT totp_secret, is_enabled FROM admin_mfa_config WHERE admin_id = ?',
      args: [adminId]
    });

    if (!secretResult.rows[0]) {
      return res
        .status(400)
        .json({ error: 'No MFA secret found. Generate a secret first.' });
    }

    if (secretResult.rows[0].is_enabled) {
      return res.status(409).json({ error: 'MFA is already enabled.' });
    }

    // Decrypt the secret
    const encryptedSecret = secretResult.rows[0].totp_secret;
    const decryptedSecret = decryptSecret(encryptedSecret);

    // Verify the TOTP token
    const verified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token,
      window: 2 // Allow 2 steps before/after (30 seconds each)
    });

    // Log the attempt
    await logMfaAttempt(
      adminId,
      'totp',
      verified,
      req,
      verified ? null : 'invalid_code'
    );

    if (!verified) {
      await rateLimitService.recordFailedAttempt(adminId, clientIP);
      return res.status(401).json({ error: 'Invalid TOTP code' });
    }

    // Clear any failed attempts
    await rateLimitService.clearAttempts(adminId, clientIP);

    // Enable MFA
    await db.execute({
      sql: `UPDATE admin_mfa_config 
            SET is_enabled = TRUE, enabled_at = CURRENT_TIMESTAMP, 
                last_used_at = CURRENT_TIMESTAMP, device_name = ?
            WHERE admin_id = ?`,
      args: [deviceName || 'Authenticator App', adminId]
    });

    // Generate backup codes
    const backupCodes = await generateBackupCodes(db, adminId);

    // Log successful MFA setup
    await logMfaEvent(adminId, 'mfa_enabled', req, {
      deviceName: deviceName || 'Authenticator App'
    });

    res.status(200).json({
      success: true,
      message: 'MFA has been successfully enabled',
      backupCodes // Show backup codes once
    });
  } catch (error) {
    console.error('Error verifying MFA setup:', error);
    res.status(500).json({ error: 'Failed to verify MFA setup' });
  }
}

/**
 * Generate new backup codes
 */
async function handleGenerateBackupCodes(req, res) {
  const db = await getDatabaseClient();
  const adminId = req.admin?.id || 'admin';

  try {
    // Check if MFA is enabled
    const mfaConfig = await db.execute({
      sql: 'SELECT is_enabled FROM admin_mfa_config WHERE admin_id = ?',
      args: [adminId]
    });

    if (!mfaConfig.rows[0]?.is_enabled) {
      return res
        .status(400)
        .json({ error: 'MFA must be enabled to generate backup codes' });
    }

    // Invalidate existing unused backup codes
    await db.execute({
      sql: 'DELETE FROM admin_mfa_backup_codes WHERE admin_id = ? AND is_used = FALSE',
      args: [adminId]
    });

    // Generate new backup codes
    const backupCodes = await generateBackupCodes(db, adminId);

    // Log backup codes generation
    await logMfaEvent(adminId, 'backup_codes_generated', req, {
      codesCount: backupCodes.length
    });

    // Set cache control headers to prevent caching of backup codes
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      backupCodes,
      message:
        'New backup codes generated. Store them securely - they won\'t be shown again.'
    });
  } catch (error) {
    console.error('Error generating backup codes:', error);
    res.status(500).json({ error: 'Failed to generate backup codes' });
  }
}

/**
 * Disable MFA
 */
async function handleDisableMfa(req, res) {
  const db = await getDatabaseClient();
  const adminId = req.admin?.id || 'admin';
  const { confirmationCode } = req.body || {};

  try {
    // Require current TOTP or backup code to disable MFA
    if (!confirmationCode || typeof confirmationCode !== 'string') {
      return res.status(400).json({
        error: 'Current TOTP code or backup code required to disable MFA'
      });
    }

    // Verify the confirmation code using the middleware version
    const verificationResult = await verifyMfaCode(
      adminId,
      confirmationCode,
      req
    );

    if (!verificationResult.success) {
      return res.status(401).json({
        error: verificationResult.error || 'Invalid confirmation code',
        rateLimited: verificationResult.rateLimited,
        remainingTime: verificationResult.remainingTime
      });
    }

    // Disable MFA and clear all related data
    await db.execute({
      sql: 'DELETE FROM admin_mfa_config WHERE admin_id = ?',
      args: [adminId]
    });

    await db.execute({
      sql: 'DELETE FROM admin_mfa_backup_codes WHERE admin_id = ?',
      args: [adminId]
    });

    // Log MFA disabled
    await logMfaEvent(adminId, 'mfa_disabled', req);

    res.status(200).json({
      success: true,
      message: 'MFA has been disabled successfully'
    });
  } catch (error) {
    console.error('Error disabling MFA:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
}

/**
 * Reset MFA (admin recovery)
 */
async function handleResetMfa(req, res) {
  const db = await getDatabaseClient();
  const adminId = req.admin?.id || 'admin';

  try {
    // This is a dangerous operation, so we require extra confirmation
    const { emergencyReset } = req.body || {};

    if (!emergencyReset || emergencyReset !== 'CONFIRM_RESET_MFA') {
      return res.status(400).json({
        error:
          'Emergency MFA reset requires confirmation: { emergencyReset: \'CONFIRM_RESET_MFA\' }'
      });
    }

    // Clear all MFA data
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

    // Log emergency MFA reset
    await logMfaEvent(adminId, 'mfa_emergency_reset', req);

    res.status(200).json({
      success: true,
      message: 'MFA has been completely reset. Set up MFA again for security.'
    });
  } catch (error) {
    console.error('Error resetting MFA:', error);
    res.status(500).json({ error: 'Failed to reset MFA' });
  }
}

/**
 * Generate backup codes
 */
async function generateBackupCodes(db, adminId) {
  const codes = [];
  const codeHashes = [];

  // Generate 10 backup codes
  for (let i = 0; i < 10; i++) {
    // Generate a 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);

    // Hash the code for storage
    const hash = await bcrypt.hash(code, 10);
    codeHashes.push(hash);
  }

  // Store hashed codes in database
  for (const hash of codeHashes) {
    await db.execute({
      sql: 'INSERT INTO admin_mfa_backup_codes (admin_id, code_hash) VALUES (?, ?)',
      args: [adminId, hash]
    });
  }

  return codes;
}

/**
 * Log MFA attempt
 */
async function logMfaAttempt(
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
    console.error('Failed to log MFA attempt:', error);
  }
}

/**
 * Log MFA event
 */
async function logMfaEvent(adminId, eventType, req, details = null) {
  try {
    const db = await getDatabaseClient();
    const clientIP =
      req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const sessionToken = authService.getSessionFromRequest(req);

    await db.execute({
      sql: `INSERT INTO admin_activity_log 
            (session_token, action, ip_address, user_agent, request_details, success) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        sessionToken,
        eventType,
        clientIP,
        userAgent,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          details: details || {}
        }),
        true
      ]
    });
  } catch (error) {
    console.error('Failed to log MFA event:', error);
  }
}

// Apply auth middleware and security headers
const protectedHandler = authService.requireAuth
  ? authService.requireAuth(mfaSetupHandler)
  : mfaSetupHandler;

export default withSecurityHeaders(protectedHandler);
