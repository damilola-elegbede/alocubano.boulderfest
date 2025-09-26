import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { isTestMode, createTestModeMetadata } from "../../lib/test-mode-utils.js";

/**
 * Test Data Management API
 *
 * Provides endpoints for:
 * - GET: Test data statistics and overview
 * - DELETE: Test data cleanup operations
 * - POST: Test data reset functionality
 *
 * All operations include comprehensive audit logging and proper admin authentication.
 */

async function handler(req, res) {
  let db;

  try {
    db = await getDatabaseClient();

    // Set cache headers to prevent caching of admin data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    switch (req.method) {
      case 'GET':
        return await handleGetTestDataStats(db, req, res);
      case 'DELETE':
        return await handleDeleteTestData(db, req, res);
      case 'POST':
        return await handleResetTestData(db, req, res);
      default:
        res.setHeader('Allow', 'GET, DELETE, POST');
        return res.status(405).json({
          error: 'Method Not Allowed',
          allowed: ['GET', 'DELETE', 'POST']
        });
    }
  } catch (error) {
    console.error('Test data management API error:', error);

    // Specific error handling
    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    if (error.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Request timeout' });
    }

    return res.status(500).json({
      error: 'Failed to process test data management request',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * GET /api/admin/test-data
 * Retrieve comprehensive test data statistics
 */
async function handleGetTestDataStats(db, req, res) {
  try {
    // Get overall test data statistics
    const statsQuery = `
      SELECT
        'transactions' as table_name,
        SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
        SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
        COUNT(*) as total_count,
        ROUND(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as test_percentage,
        SUM(CASE WHEN is_test = 0 AND status = 'completed' THEN amount_cents ELSE 0 END) as production_amount_cents,
        SUM(CASE WHEN is_test = 1 AND status = 'completed' THEN amount_cents ELSE 0 END) as test_amount_cents,
        MIN(created_at) as earliest_record,
        MAX(created_at) as latest_record
      FROM transactions

      UNION ALL

      SELECT
        'tickets' as table_name,
        SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
        SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
        COUNT(*) as total_count,
        ROUND(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as test_percentage,
        SUM(CASE WHEN is_test = 0 AND status = 'valid' THEN price_cents ELSE 0 END) as production_amount_cents,
        SUM(CASE WHEN is_test = 1 AND status = 'valid' THEN price_cents ELSE 0 END) as test_amount_cents,
        MIN(created_at) as earliest_record,
        MAX(created_at) as latest_record
      FROM tickets

      UNION ALL

      SELECT
        'transaction_items' as table_name,
        SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
        SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
        COUNT(*) as total_count,
        ROUND(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as test_percentage,
        SUM(CASE WHEN is_test = 0 THEN total_price_cents ELSE 0 END) as production_amount_cents,
        SUM(CASE WHEN is_test = 1 THEN total_price_cents ELSE 0 END) as test_amount_cents,
        MIN(created_at) as earliest_record,
        MAX(created_at) as latest_record
      FROM transaction_items
    `;

    const statsResult = await db.execute(statsQuery);

    // Get test data age analysis
    const ageAnalysisQuery = `
      SELECT
        'old_test_data' as category,
        COUNT(*) as count,
        AVG(julianday('now') - julianday(created_at)) as avg_age_days,
        MIN(julianday('now') - julianday(created_at)) as min_age_days,
        MAX(julianday('now') - julianday(created_at)) as max_age_days
      FROM transactions
      WHERE is_test = 1 AND julianday('now') - julianday(created_at) > 30

      UNION ALL

      SELECT
        'recent_test_data' as category,
        COUNT(*) as count,
        AVG(julianday('now') - julianday(created_at)) as avg_age_days,
        MIN(julianday('now') - julianday(created_at)) as min_age_days,
        MAX(julianday('now') - julianday(created_at)) as max_age_days
      FROM transactions
      WHERE is_test = 1 AND julianday('now') - julianday(created_at) <= 30
    `;

    const ageAnalysisResult = await db.execute(ageAnalysisQuery);

    // Get cleanup history summary
    const cleanupHistoryQuery = `
      SELECT
        COUNT(*) as total_cleanups,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_cleanups,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_cleanups,
        SUM(records_deleted) as total_records_deleted,
        MAX(started_at) as last_cleanup_date,
        AVG(duration_seconds) as avg_cleanup_duration
      FROM test_data_cleanup_log
      WHERE started_at >= datetime('now', '-30 days')
    `;

    const cleanupHistoryResult = await db.execute(cleanupHistoryQuery);

    // Get test data candidates for cleanup
    const cleanupCandidatesQuery = `
      SELECT
        record_type,
        cleanup_priority,
        COUNT(*) as candidate_count,
        AVG(age_days) as avg_age_days,
        SUM(amount_cents) as total_amount_cents
      FROM v_test_data_cleanup_candidates
      GROUP BY record_type, cleanup_priority
      ORDER BY
        CASE cleanup_priority
          WHEN 'immediate' THEN 1
          WHEN 'priority' THEN 2
          WHEN 'scheduled' THEN 3
          ELSE 4
        END,
        candidate_count DESC
    `;

    const cleanupCandidatesResult = await db.execute(cleanupCandidatesQuery);

    // Get test data by date for trend analysis
    const trendQuery = `
      SELECT
        DATE(created_at) as test_date,
        COUNT(*) as records_created,
        SUM(amount_cents) as amount_cents,
        COUNT(DISTINCT customer_email) as unique_customers
      FROM transactions
      WHERE is_test = 1
        AND created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY test_date DESC
      LIMIT 30
    `;

    const trendResult = await db.execute(trendQuery);

    // Get current test mode environment info
    const testModeInfo = {
      current_request_test_mode: isTestMode(req),
      environment: process.env.NODE_ENV,
      vercel_env: process.env.VERCEL_ENV,
      test_mode_enabled: process.env.E2E_TEST_MODE === 'true',
      integration_test_mode: process.env.INTEGRATION_TEST_MODE === 'true'
    };

    const response = {
      overview: {
        tables: statsResult.rows,
        age_analysis: ageAnalysisResult.rows,
        test_mode_info: testModeInfo
      },
      cleanup: {
        history: cleanupHistoryResult.rows[0] || {
          total_cleanups: 0,
          successful_cleanups: 0,
          failed_cleanups: 0,
          total_records_deleted: 0,
          last_cleanup_date: null,
          avg_cleanup_duration: null
        },
        candidates: cleanupCandidatesResult.rows
      },
      trends: {
        daily_test_data: trendResult.rows
      },
      timestamp: new Date().toISOString()
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching test data statistics:', error);
    throw error;
  }
}

/**
 * DELETE /api/admin/test-data
 * Perform test data cleanup operations
 */
async function handleDeleteTestData(db, req, res) {
  try {
    const {
      cleanup_type = 'scheduled',
      max_age_days = 30,
      max_records = 1000,
      force = false,
      dry_run = false
    } = req.query;

    // Generate unique cleanup ID
    const cleanupId = `cleanup_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Prepare cleanup criteria
    const cleanupCriteria = {
      cleanup_type,
      max_age_days: parseInt(max_age_days),
      max_records: parseInt(max_records),
      force: force === 'true',
      dry_run: dry_run === 'true',
      exclude_recent_hours: 24,
      initiated_by: req.user?.email || 'admin',
      initiated_at: new Date().toISOString()
    };

    // Validate cleanup parameters
    if (cleanupCriteria.max_age_days < 1 && !cleanupCriteria.force) {
      return res.status(400).json({
        error: 'Invalid cleanup parameters',
        message: 'max_age_days must be at least 1 day, or use force=true'
      });
    }

    if (cleanupCriteria.max_records < 1 || cleanupCriteria.max_records > 10000) {
      return res.status(400).json({
        error: 'Invalid cleanup parameters',
        message: 'max_records must be between 1 and 10000'
      });
    }

    // Import test data cleanup service
    const { default: testDataCleanupService } = await import('../../lib/test-data-cleanup.js');

    // Initialize cleanup log entry
    await db.execute(`
      INSERT INTO test_data_cleanup_log (
        cleanup_id,
        operation_type,
        initiated_by,
        cleanup_criteria,
        status
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      cleanupId,
      cleanup_type,
      cleanupCriteria.initiated_by,
      JSON.stringify(cleanupCriteria),
      'running'
    ]);

    let cleanupResult;

    if (cleanupCriteria.dry_run) {
      // Perform dry run - identify records but don't delete
      cleanupResult = await testDataCleanupService.performDryRun(db, cleanupCriteria);
    } else {
      // Perform actual cleanup
      cleanupResult = await testDataCleanupService.performCleanup(db, cleanupCriteria);
    }

    // Update cleanup log with results
    await db.execute(`
      UPDATE test_data_cleanup_log
      SET
        completed_at = CURRENT_TIMESTAMP,
        duration_seconds = (julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400,
        status = ?,
        records_identified = ?,
        records_deleted = ?,
        transactions_deleted = ?,
        tickets_deleted = ?,
        transaction_items_deleted = ?,
        related_records_deleted = ?,
        verification_checksum = ?,
        metadata = ?
      WHERE cleanup_id = ?
    `, [
      cleanupResult.success ? 'completed' : 'failed',
      cleanupResult.records_identified,
      cleanupResult.records_deleted,
      cleanupResult.transactions_deleted,
      cleanupResult.tickets_deleted,
      cleanupResult.transaction_items_deleted,
      cleanupResult.related_records_deleted,
      cleanupResult.verification_checksum,
      JSON.stringify(cleanupResult.metadata),
      cleanupId
    ]);

    return res.status(200).json({
      cleanup_id: cleanupId,
      cleanup_criteria: cleanupCriteria,
      result: cleanupResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error performing test data cleanup:', error);
    throw error;
  }
}

/**
 * POST /api/admin/test-data
 * Reset test data functionality (advanced operations)
 */
async function handleResetTestData(db, req, res) {
  try {
    const {
      operation_type = 'full_reset',
      confirm = false
    } = req.body;

    if (!confirm) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Set confirm: true to proceed with test data reset'
      });
    }

    // Generate unique operation ID
    const operationId = `reset_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const operationCriteria = {
      operation_type,
      initiated_by: req.user?.email || 'admin',
      initiated_at: new Date().toISOString()
    };

    // Initialize cleanup log for reset operation
    await db.execute(`
      INSERT INTO test_data_cleanup_log (
        cleanup_id,
        operation_type,
        initiated_by,
        cleanup_criteria,
        status
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      operationId,
      operation_type,
      operationCriteria.initiated_by,
      JSON.stringify(operationCriteria),
      'running'
    ]);

    let resetResult;

    switch (operation_type) {
      case 'full_reset':
        resetResult = await performFullTestDataReset(db);
        break;
      case 'recent_only':
        resetResult = await performRecentTestDataReset(db);
        break;
      case 'failed_transactions':
        resetResult = await performFailedTransactionReset(db);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation_type}`);
    }

    // Update cleanup log with results
    await db.execute(`
      UPDATE test_data_cleanup_log
      SET
        completed_at = CURRENT_TIMESTAMP,
        duration_seconds = (julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400,
        status = ?,
        records_identified = ?,
        records_deleted = ?,
        transactions_deleted = ?,
        tickets_deleted = ?,
        transaction_items_deleted = ?,
        metadata = ?
      WHERE cleanup_id = ?
    `, [
      resetResult.success ? 'completed' : 'failed',
      resetResult.records_identified,
      resetResult.records_deleted,
      resetResult.transactions_deleted,
      resetResult.tickets_deleted,
      resetResult.transaction_items_deleted,
      JSON.stringify(resetResult.metadata),
      operationId
    ]);

    return res.status(200).json({
      operation_id: operationId,
      operation_type,
      result: resetResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error performing test data reset:', error);
    throw error;
  }
}

/**
 * Perform full test data reset
 */
async function performFullTestDataReset(db) {
  const startTime = Date.now();
  let totalDeleted = 0;
  let transactionsDeleted = 0;
  let ticketsDeleted = 0;
  let transactionItemsDeleted = 0;

  try {
    // Count records before deletion
    const countResult = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM transactions WHERE is_test = 1) as transactions,
        (SELECT COUNT(*) FROM tickets WHERE is_test = 1) as tickets,
        (SELECT COUNT(*) FROM transaction_items WHERE is_test = 1) as transaction_items
    `);

    const recordsIdentified = countResult.rows[0].transactions +
                            countResult.rows[0].tickets +
                            countResult.rows[0].transaction_items;

    // Build batch operations for atomic deletion
    const deleteOperations = [];

    // Delete in proper order to maintain referential integrity
    deleteOperations.push('DELETE FROM tickets WHERE is_test = 1');
    deleteOperations.push('DELETE FROM transaction_items WHERE is_test = 1');
    deleteOperations.push('DELETE FROM transactions WHERE is_test = 1');

    // Clean up related audit logs for test data
    deleteOperations.push(`
      DELETE FROM audit_logs
      WHERE metadata IS NOT NULL
        AND json_extract(metadata, '$.test_mode') = 1
    `);

    // Execute all operations in a single batch (transaction is automatic)
    const results = await db.batch(deleteOperations);

    // Extract deletion counts from results
    ticketsDeleted = results[0]?.changes || results[0]?.rowsAffected || 0;
    transactionItemsDeleted = results[1]?.changes || results[1]?.rowsAffected || 0;
    transactionsDeleted = results[2]?.changes || results[2]?.rowsAffected || 0;
    const auditDeleted = results[3]?.changes || results[3]?.rowsAffected || 0;

    totalDeleted = ticketsDeleted + transactionItemsDeleted + transactionsDeleted;

    return {
      success: true,
      records_identified: recordsIdentified,
      records_deleted: totalDeleted,
      transactions_deleted: transactionsDeleted,
      tickets_deleted: ticketsDeleted,
      transaction_items_deleted: transactionItemsDeleted,
      related_records_deleted: auditDeleted,
      verification_checksum: generateVerificationChecksum(totalDeleted, Date.now()),
      metadata: {
        operation: 'full_reset',
        duration_ms: Date.now() - startTime,
        tables_affected: ['transactions', 'tickets', 'transaction_items', 'audit_logs']
      }
    };

  } catch (error) {
    // Rollback is automatic if batch fails
    console.error('Full test data reset failed:', error);
    throw error;
  }
}

/**
 * Perform reset of recent test data only (last 24 hours)
 */
async function performRecentTestDataReset(db) {
  const startTime = Date.now();
  let totalDeleted = 0;
  let transactionsDeleted = 0;
  let ticketsDeleted = 0;
  let transactionItemsDeleted = 0;

  try {
    const recentFilter = `is_test = 1 AND created_at >= datetime('now', '-24 hours')`;

    // Count records before deletion
    const countResult = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM transactions WHERE ${recentFilter}) as transactions,
        (SELECT COUNT(*) FROM tickets WHERE ${recentFilter}) as tickets,
        (SELECT COUNT(*) FROM transaction_items WHERE ${recentFilter}) as transaction_items
    `);

    const recordsIdentified = countResult.rows[0].transactions +
                            countResult.rows[0].tickets +
                            countResult.rows[0].transaction_items;

    // Build batch operations for atomic deletion
    const deleteOperations = [];

    // Delete recent test data
    deleteOperations.push(`DELETE FROM tickets WHERE ${recentFilter}`);
    deleteOperations.push(`DELETE FROM transaction_items WHERE ${recentFilter}`);
    deleteOperations.push(`DELETE FROM transactions WHERE ${recentFilter}`);

    // Execute all operations in a single batch (transaction is automatic)
    const results = await db.batch(deleteOperations);

    // Extract deletion counts from results
    ticketsDeleted = results[0]?.changes || results[0]?.rowsAffected || 0;
    transactionItemsDeleted = results[1]?.changes || results[1]?.rowsAffected || 0;
    transactionsDeleted = results[2]?.changes || results[2]?.rowsAffected || 0;

    totalDeleted = ticketsDeleted + transactionItemsDeleted + transactionsDeleted;

    return {
      success: true,
      records_identified: recordsIdentified,
      records_deleted: totalDeleted,
      transactions_deleted: transactionsDeleted,
      tickets_deleted: ticketsDeleted,
      transaction_items_deleted: transactionItemsDeleted,
      related_records_deleted: 0,
      verification_checksum: generateVerificationChecksum(totalDeleted, Date.now()),
      metadata: {
        operation: 'recent_only_reset',
        duration_ms: Date.now() - startTime,
        time_filter: '24 hours',
        tables_affected: ['transactions', 'tickets', 'transaction_items']
      }
    };

  } catch (error) {
    // Rollback is automatic if batch fails
    console.error('Recent test data reset failed:', error);
    throw error;
  }
}

/**
 * Perform reset of failed test transactions only
 */
async function performFailedTransactionReset(db) {
  const startTime = Date.now();
  let totalDeleted = 0;
  let transactionsDeleted = 0;
  let ticketsDeleted = 0;
  let transactionItemsDeleted = 0;

  try {
    const failedFilter = `is_test = 1 AND status IN ('failed', 'cancelled', 'expired')`;

    // Get failed transaction IDs for cascading deletes
    const failedTransactionsResult = await db.execute(`
      SELECT id FROM transactions WHERE ${failedFilter}
    `);

    const failedTransactionIds = failedTransactionsResult.rows.map(row => row.id);

    if (failedTransactionIds.length === 0) {
      return {
        success: true,
        records_identified: 0,
        records_deleted: 0,
        transactions_deleted: 0,
        tickets_deleted: 0,
        transaction_items_deleted: 0,
        related_records_deleted: 0,
        verification_checksum: generateVerificationChecksum(0, Date.now()),
        metadata: {
          operation: 'failed_transactions_reset',
          duration_ms: Date.now() - startTime,
          message: 'No failed test transactions found'
        }
      };
    }

    // Build batch operations for atomic deletion
    const deleteOperations = [];

    // Delete related tickets and transaction items
    const placeholders = failedTransactionIds.map(() => '?').join(',');

    deleteOperations.push({
      sql: `DELETE FROM tickets WHERE transaction_id IN (${placeholders}) AND is_test = 1`,
      args: failedTransactionIds
    });

    deleteOperations.push({
      sql: `DELETE FROM transaction_items WHERE transaction_id IN (${placeholders}) AND is_test = 1`,
      args: failedTransactionIds
    });

    // Delete failed transactions
    deleteOperations.push(`DELETE FROM transactions WHERE ${failedFilter}`);

    // Execute all operations in a single batch (transaction is automatic)
    const results = await db.batch(deleteOperations);

    // Extract deletion counts from results
    ticketsDeleted = results[0]?.changes || results[0]?.rowsAffected || 0;
    transactionItemsDeleted = results[1]?.changes || results[1]?.rowsAffected || 0;
    transactionsDeleted = results[2]?.changes || results[2]?.rowsAffected || 0;

    totalDeleted = ticketsDeleted + transactionItemsDeleted + transactionsDeleted;

    return {
      success: true,
      records_identified: totalDeleted,
      records_deleted: totalDeleted,
      transactions_deleted: transactionsDeleted,
      tickets_deleted: ticketsDeleted,
      transaction_items_deleted: transactionItemsDeleted,
      related_records_deleted: 0,
      verification_checksum: generateVerificationChecksum(totalDeleted, Date.now()),
      metadata: {
        operation: 'failed_transactions_reset',
        duration_ms: Date.now() - startTime,
        failed_transaction_ids: failedTransactionIds,
        tables_affected: ['transactions', 'tickets', 'transaction_items']
      }
    };

  } catch (error) {
    // Rollback is automatic if batch fails
    console.error('Failed transaction reset failed:', error);
    throw error;
  }
}

/**
 * Generate verification checksum for cleanup operations
 */
function generateVerificationChecksum(recordCount, timestamp) {
  const data = `${recordCount}_${timestamp}_test_cleanup`;
  return Buffer.from(data).toString('base64').substring(0, 16);
}

// Build middleware chain with proper authentication and audit logging
const securedHandler = withSecurityHeaders(
  withAdminAudit(
    authService.requireAuth(handler),
    {
      logBody: true, // Log request body for test data operations
      logMetadata: true,
      skipMethods: [], // Log all methods for test data management
      sensitiveFields: ['customer_email', 'attendee_email'] // Redact sensitive data in logs
    }
  )
);

// Export the secured handler with error handling
export default async function safeHandler(req, res) {
  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in test data management endpoint:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Test data operation failed',
        timestamp: new Date().toISOString()
      });
    }
  }
}