/**
 * Scan Logs Cleanup Cron Job
 * Runs weekly to delete old scan logs and QR validation records
 * Scheduled via Vercel Cron: Sundays at 5 AM UTC (10 PM MST / 11 PM MDT Saturday)
 * Note: Vercel Cron only supports UTC scheduling. Local time varies with DST.
 *
 * Retention Policy:
 * - scan_logs: 90 days (for security/fraud analysis)
 * - qr_validations: 90 days (legacy table, maintained for compatibility)
 */

import { getDatabaseClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized execution
  // Step 1: Fail fast if CRON_SECRET is not configured in production
  const secret = process.env.CRON_SECRET || '';

  if (process.env.NODE_ENV === 'production' && !secret) {
    logger.error('[ScanLogsCleanup] CRON_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  // Step 2: Parse Authorization header (case-insensitive Bearer token parsing)
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.match(/^Bearer\s+(.+)$/i) || [];

  // Step 3: Validate token matches secret in production
  if (process.env.NODE_ENV === 'production' && token !== secret) {
    logger.warn('[ScanLogsCleanup] Unauthorized cron attempt blocked');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  let db;

  try {
    logger.info('[ScanLogsCleanup] Starting 90-day retention cleanup job');

    // Initialize database
    db = await getDatabaseClient();

    const results = {
      scanLogs: { deleted: 0, error: null },
      qrValidations: { deleted: 0, error: null }
    };

    // Step 1: Delete old scan_logs records (older than 90 days)
    // Performance: Uses idx_scan_logs_time_status index (migration 049) for efficient filtering
    logger.info('[ScanLogsCleanup] Step 1/2: Deleting old scan_logs records');
    try {
      const scanLogsResult = await db.execute({
        sql: `DELETE FROM scan_logs WHERE scanned_at < datetime('now', '-90 days')`,
        args: []
      });

      results.scanLogs.deleted = scanLogsResult.rowsAffected ?? scanLogsResult.changes ?? 0;
      logger.info(`[ScanLogsCleanup] Deleted ${results.scanLogs.deleted} scan_logs records`);
    } catch (error) {
      results.scanLogs.error = error.message;
      logger.error('[ScanLogsCleanup] Failed to delete scan_logs:', error);
    }

    // Step 2: Delete old qr_validations records (older than 90 days)
    // Performance: Uses idx_qr_validations_time index (migration 009) for efficient filtering
    logger.info('[ScanLogsCleanup] Step 2/2: Deleting old qr_validations records');
    try {
      const qrValidationsResult = await db.execute({
        sql: `DELETE FROM qr_validations WHERE validation_time < datetime('now', '-90 days')`,
        args: []
      });

      results.qrValidations.deleted = qrValidationsResult.rowsAffected ?? qrValidationsResult.changes ?? 0;
      logger.info(`[ScanLogsCleanup] Deleted ${results.qrValidations.deleted} qr_validations records`);
    } catch (error) {
      results.qrValidations.error = error.message;
      logger.error('[ScanLogsCleanup] Failed to delete qr_validations:', error);
    }

    const duration = Date.now() - startTime;
    const totalDeleted = results.scanLogs.deleted + results.qrValidations.deleted;
    const hasErrors = results.scanLogs.error || results.qrValidations.error;

    const response = {
      success: !hasErrors,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      retention_policy: '90 days',
      results: {
        scan_logs: {
          deleted: results.scanLogs.deleted,
          error: results.scanLogs.error
        },
        qr_validations: {
          deleted: results.qrValidations.deleted,
          error: results.qrValidations.error
        }
      },
      total_deleted: totalDeleted
    };

    logger.info('[ScanLogsCleanup] Cleanup completed', {
      total_deleted: totalDeleted,
      duration_ms: duration,
      has_errors: hasErrors
    });

    // Check for warnings
    if (totalDeleted > 10000) {
      logger.warn(`[ScanLogsCleanup] High deletion count: ${totalDeleted.toLocaleString()} total records deleted`);
    }

    return res.status(200).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('[ScanLogsCleanup] Cleanup failed:', {
      error: error.message,
      stack: error.stack,
      duration_ms: duration
    });

    return res.status(500).json({
      success: false,
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });
  }
}
