/**
 * Audit Retention Cron Job
 * Runs weekly to archive old audit logs and delete expired records
 * Scheduled via Vercel Cron: Sundays at 3 AM Mountain Time
 */

import auditRetentionService from '../../lib/audit-retention-service.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized execution
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${process.env.CRON_SECRET || ''}`;

  if (authHeader !== expectedAuth && process.env.NODE_ENV === 'production') {
    logger.warn('[AuditRetention] Unauthorized cron attempt blocked');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();

  try {
    logger.info('[AuditRetention] Starting retention cleanup job');

    // Initialize service
    await auditRetentionService.ensureInitialized();

    // Step 1: Archive logs older than hot retention period
    logger.info('[AuditRetention] Step 1/3: Archiving old logs');
    const archiveResults = await auditRetentionService.archiveOldLogs();

    // Step 2: Delete expired logs from archive
    logger.info('[AuditRetention] Step 2/3: Deleting expired logs');
    const deleteResults = await auditRetentionService.deleteExpiredLogs();

    // Step 3: Get current retention stats
    logger.info('[AuditRetention] Step 3/3: Gathering statistics');
    const stats = await auditRetentionService.getRetentionStats();

    const duration = Date.now() - startTime;

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      archived: {
        total: archiveResults.archived,
        details: archiveResults.details,
        errors: archiveResults.errors
      },
      deleted: {
        total: deleteResults.deleted,
        details: deleteResults.details,
        errors: deleteResults.errors
      },
      currentStats: stats
    };

    logger.info('[AuditRetention] Cleanup completed successfully', {
      archived: archiveResults.archived,
      deleted: deleteResults.deleted,
      duration_ms: duration
    });

    // Check for warnings
    const totalRecords = stats.reduce((sum, s) => sum + s.total, 0);
    if (totalRecords > 500000) {
      logger.warn(`[AuditRetention] High record count: ${totalRecords.toLocaleString()} total audit logs`);
    }

    // Check for errors
    if (archiveResults.errors.length > 0 || deleteResults.errors.length > 0) {
      logger.error('[AuditRetention] Cleanup completed with errors', {
        archiveErrors: archiveResults.errors,
        deleteErrors: deleteResults.errors
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('[AuditRetention] Cleanup failed:', {
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
