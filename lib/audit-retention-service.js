/**
 * Audit Retention Service
 * Manages audit log lifecycle: hot storage → warm storage (archive) → deletion
 * Implements compliance-driven retention policies
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

export class AuditRetentionService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;

    // Retention policies by event type (in days)
    this.retentionPolicies = {
      financial_event: {
        hot: 365,      // 1 year queryable
        warm: 2555,    // 7 years total (IRS compliance)
        total: 2555
      },
      admin_access: {
        hot: 90,       // 90 days queryable
        warm: 365,     // 1 year in archive
        total: 1095    // 3 years total (security compliance)
      },
      data_change: {
        hot: 365,      // 1 year queryable
        warm: 1095,    // 3 years in archive
        total: 2555    // 7 years total (align with financial)
      },
      data_processing: {
        hot: 90,       // 90 days queryable
        warm: 1095,    // 3 years in archive
        total: 1095    // 3 years total (GDPR)
      },
      config_change: {
        hot: 365,      // 1 year queryable
        warm: 1825,    // 5 years in archive
        total: 3650    // 10 years total (system evolution tracking)
      }
    };
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized() {
    if (this.initialized && this.db) {
      return this;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      this.initializationPromise = null;
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      this.db = await getDatabaseClient();

      if (!this.db) {
        throw new Error('Failed to get database client');
      }

      // Verify tables exist
      await this.db.execute('SELECT 1 FROM audit_logs LIMIT 1');
      await this.db.execute('SELECT 1 FROM audit_logs_archive LIMIT 1');

      this.initialized = true;
      logger.debug('[AuditRetention] Service initialized successfully');
      return this;
    } catch (error) {
      logger.error('[AuditRetention] Initialization failed:', error.message);
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Archive logs older than hot retention period
   * Moves logs from audit_logs to audit_logs_archive
   */
  async archiveOldLogs() {
    await this.ensureInitialized();

    const results = {
      archived: 0,
      errors: [],
      details: []
    };

    for (const [eventType, policy] of Object.entries(this.retentionPolicies)) {
      try {
        const cutoffDate = new Date(
          Date.now() - policy.hot * 24 * 60 * 60 * 1000
        ).toISOString();

        logger.debug(`[AuditRetention] Archiving ${eventType} logs older than ${cutoffDate}`);

        // Insert into archive table
        const insertResult = await this.db.execute({
          sql: `INSERT INTO audit_logs_archive (
            original_id, request_id, event_type, action,
            target_type, target_id, admin_user, session_id,
            ip_address, user_agent, before_value, after_value,
            changed_fields, request_method, request_url, request_body,
            response_status, response_time_ms, error_message,
            data_subject_id, data_type, processing_purpose,
            legal_basis, retention_period, amount_cents, currency,
            transaction_reference, payment_status, config_key,
            config_environment, metadata, severity, created_at, archived_at
          )
          SELECT
            id, request_id, event_type, action,
            target_type, target_id, admin_user, session_id,
            ip_address, user_agent, before_value, after_value,
            changed_fields, request_method, request_url, request_body,
            response_status, response_time_ms, error_message,
            data_subject_id, data_type, processing_purpose,
            legal_basis, retention_period, amount_cents, currency,
            transaction_reference, payment_status, config_key,
            config_environment, metadata, severity, created_at,
            CURRENT_TIMESTAMP
          FROM audit_logs
          WHERE event_type = ?
            AND created_at < ?
            AND archived_at IS NULL`,
          args: [eventType, cutoffDate]
        });

        // Mark as archived in main table
        const updateResult = await this.db.execute({
          sql: `UPDATE audit_logs
                SET archived_at = CURRENT_TIMESTAMP
                WHERE event_type = ?
                  AND created_at < ?
                  AND archived_at IS NULL`,
          args: [eventType, cutoffDate]
        });

        const archivedCount = updateResult.meta?.changes || 0;
        results.archived += archivedCount;

        results.details.push({
          eventType,
          archived: archivedCount,
          cutoffDate
        });

        if (archivedCount > 0) {
          logger.info(`[AuditRetention] Archived ${archivedCount} ${eventType} logs`);
        }
      } catch (error) {
        logger.error(`[AuditRetention] Error archiving ${eventType}:`, error.message);
        results.errors.push({
          eventType,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Delete archived logs past total retention period
   */
  async deleteExpiredLogs() {
    await this.ensureInitialized();

    const results = {
      deleted: 0,
      errors: [],
      details: []
    };

    for (const [eventType, policy] of Object.entries(this.retentionPolicies)) {
      try {
        const cutoffDate = new Date(
          Date.now() - policy.total * 24 * 60 * 60 * 1000
        ).toISOString();

        logger.debug(`[AuditRetention] Deleting ${eventType} logs older than ${cutoffDate}`);

        const deleteResult = await this.db.execute({
          sql: `DELETE FROM audit_logs_archive
                WHERE event_type = ?
                  AND created_at < ?`,
          args: [eventType, cutoffDate]
        });

        const deletedCount = deleteResult.meta?.changes || 0;
        results.deleted += deletedCount;

        results.details.push({
          eventType,
          deleted: deletedCount,
          cutoffDate
        });

        if (deletedCount > 0) {
          logger.info(`[AuditRetention] Deleted ${deletedCount} ${eventType} archived logs`);
        }
      } catch (error) {
        logger.error(`[AuditRetention] Error deleting ${eventType}:`, error.message);
        results.errors.push({
          eventType,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get retention statistics for monitoring dashboard
   */
  async getRetentionStats() {
    await this.ensureInitialized();

    try {
      const stats = await this.db.execute(`
        SELECT
          event_type,
          COUNT(*) as total,
          COUNT(CASE WHEN archived_at IS NULL THEN 1 END) as hot,
          COUNT(CASE WHEN archived_at IS NOT NULL THEN 1 END) as warm,
          MIN(created_at) as oldest,
          MAX(created_at) as newest,
          SUM(
            LENGTH(COALESCE(metadata, '')) +
            LENGTH(COALESCE(request_body, '')) +
            LENGTH(COALESCE(before_value, '')) +
            LENGTH(COALESCE(after_value, ''))
          ) as estimated_size_bytes
        FROM audit_logs
        GROUP BY event_type
      `);

      // Get archive stats
      const archiveStats = await this.db.execute(`
        SELECT
          event_type,
          COUNT(*) as archived_count,
          MIN(created_at) as oldest_archived,
          MAX(created_at) as newest_archived
        FROM audit_logs_archive
        GROUP BY event_type
      `);

      // Combine stats
      const combined = stats.rows.map(stat => {
        const archiveStat = archiveStats.rows.find(
          a => a.event_type === stat.event_type
        ) || {};

        return {
          ...stat,
          archived_count: archiveStat.archived_count || 0,
          oldest_archived: archiveStat.oldest_archived || null,
          newest_archived: archiveStat.newest_archived || null
        };
      });

      return combined;
    } catch (error) {
      logger.error('[AuditRetention] Failed to get stats:', error.message);
      return [];
    }
  }

  /**
   * Clean up archived records from main table (optional housekeeping)
   * Can be run periodically to reduce main table size
   */
  async cleanupArchivedRecords(olderThanDays = 365) {
    await this.ensureInitialized();

    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    ).toISOString();

    try {
      const deleteResult = await this.db.execute({
        sql: `DELETE FROM audit_logs
              WHERE archived_at IS NOT NULL
                AND archived_at < ?`,
        args: [cutoffDate]
      });

      const deletedCount = deleteResult.meta?.changes || 0;
      logger.info(`[AuditRetention] Cleaned up ${deletedCount} archived records from main table`);

      return { deleted: deletedCount };
    } catch (error) {
      logger.error('[AuditRetention] Cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Health check for retention service
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();

      const stats = await this.getRetentionStats();
      const totalRecords = stats.reduce((sum, s) => sum + s.total, 0);
      const totalArchived = stats.reduce((sum, s) => sum + (s.archived_count || 0), 0);

      return {
        status: 'healthy',
        initialized: this.initialized,
        totalRecords,
        totalArchived,
        policies: this.retentionPolicies,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        initialized: this.initialized,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const auditRetentionService = new AuditRetentionService();

// Export both the instance and the class
export default auditRetentionService;
export { auditRetentionService };
