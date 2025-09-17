/**
 * Financial Audit Queries
 * Complex queries for financial audit log analysis and compliance reporting
 *
 * Features:
 * - Revenue reconciliation calculations
 * - Payment method breakdown analysis
 * - Financial compliance reporting
 * - Automated reconciliation status updates
 * - Complex aggregations for audit trails
 * - Performance-optimized queries with proper indexing
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';
import auditService from './audit-service.js';

export class FinancialAuditQueries {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    // Fast path: already initialized
    if (this.initialized && this.db) {
      return this;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      // Clear promise on error to allow retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      logger.debug('[FinancialAuditQueries] Initializing financial audit queries service...');

      this.db = await getDatabaseClient();

      this.initialized = true;
      logger.debug('[FinancialAuditQueries] Financial audit queries service initialized successfully');
      return this;
    } catch (error) {
      logger.error('[FinancialAuditQueries] Initialization failed:', error.message);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Get comprehensive revenue reconciliation report
   */
  async getRevenueReconciliationReport(params = {}) {
    await this.ensureInitialized();

    const {
      startDate = null,
      endDate = null,
      currency = 'USD',
      groupBy = 'day' // 'day', 'week', 'month'
    } = params;

    try {
      // Dynamic date grouping based on groupBy parameter
      let dateGrouping;
      switch (groupBy) {
        case 'week':
          dateGrouping = "strftime('%Y-W%W', created_at)";
          break;
        case 'month':
          dateGrouping = "strftime('%Y-%m', created_at)";
          break;
        default:
          dateGrouping = "DATE(created_at)";
      }

      let query = `
        SELECT
          ${dateGrouping} as period,
          currency,
          -- Transaction volumes
          COUNT(CASE WHEN action LIKE '%PAYMENT%' AND payment_status = 'completed' THEN 1 END) as successful_payments,
          COUNT(CASE WHEN action LIKE '%REFUND%' THEN 1 END) as refunds,
          COUNT(CASE WHEN action LIKE '%DISPUTE%' THEN 1 END) as disputes,

          -- Revenue calculations
          COALESCE(SUM(CASE WHEN action LIKE '%PAYMENT%' AND payment_status = 'completed' THEN amount_cents ELSE 0 END), 0) as gross_revenue_cents,
          COALESCE(SUM(CASE WHEN action LIKE '%REFUND%' THEN amount_cents ELSE 0 END), 0) as refunded_amount_cents,
          COALESCE(SUM(CASE WHEN action LIKE '%DISPUTE%' THEN amount_cents ELSE 0 END), 0) as disputed_amount_cents,

          -- Fee analysis
          COALESCE(SUM(fees_cents), 0) as total_fees_cents,
          COALESCE(SUM(net_amount_cents), 0) as net_revenue_cents,

          -- Reconciliation status
          COUNT(CASE WHEN reconciliation_status = 'reconciled' THEN 1 END) as reconciled_transactions,
          COUNT(CASE WHEN reconciliation_status = 'pending' THEN 1 END) as pending_reconciliation,
          COUNT(CASE WHEN reconciliation_status = 'discrepancy' THEN 1 END) as discrepancy_transactions,

          -- Settlement tracking
          COUNT(DISTINCT settlement_id) as settlement_batches,
          COUNT(CASE WHEN settlement_date IS NOT NULL THEN 1 END) as settled_transactions,

          -- Data quality metrics
          COUNT(CASE WHEN transaction_reference IS NULL THEN 1 END) as missing_transaction_ref,
          COUNT(CASE WHEN amount_cents IS NULL OR amount_cents = 0 THEN 1 END) as missing_amounts,

          -- Timing analysis
          MIN(created_at) as period_start,
          MAX(created_at) as period_end,
          COUNT(*) as total_financial_events

        FROM audit_logs
        WHERE event_type = 'financial_event'
          AND currency = ?
      `;

      const queryParams = [currency];

      // Add date filters if provided
      if (startDate) {
        query += ' AND DATE(created_at) >= ?';
        queryParams.push(startDate);
      }
      if (endDate) {
        query += ' AND DATE(created_at) <= ?';
        queryParams.push(endDate);
      }

      query += ` GROUP BY ${dateGrouping}, currency ORDER BY period DESC`;

      const result = await this.db.execute(query, queryParams);

      // Calculate derived metrics
      const reportData = result.rows.map(row => ({
        ...row,
        // Calculate net revenue (gross - refunds - disputes)
        net_revenue_after_adjustments: row.gross_revenue_cents - row.refunded_amount_cents - row.disputed_amount_cents,

        // Calculate reconciliation rate
        reconciliation_rate: row.total_financial_events > 0
          ? (row.reconciled_transactions / row.total_financial_events * 100).toFixed(2)
          : '0.00',

        // Calculate average transaction value
        avg_transaction_value: row.successful_payments > 0
          ? (row.gross_revenue_cents / row.successful_payments).toFixed(0)
          : '0',

        // Calculate fee rate
        fee_rate: row.gross_revenue_cents > 0
          ? (row.total_fees_cents / row.gross_revenue_cents * 100).toFixed(2)
          : '0.00',

        // Calculate data quality score
        data_quality_score: row.total_financial_events > 0
          ? (100 - ((row.missing_transaction_ref + row.missing_amounts) / row.total_financial_events * 100)).toFixed(1)
          : '100.0'
      }));

      return {
        report_type: 'revenue_reconciliation',
        period_grouping: groupBy,
        currency,
        date_range: {
          start: startDate,
          end: endDate
        },
        data: reportData,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[FinancialAuditQueries] Failed to generate revenue reconciliation report:', error.message);
      throw error;
    }
  }

  /**
   * Get payment method breakdown analysis
   */
  async getPaymentMethodBreakdown(params = {}) {
    await this.ensureInitialized();

    const {
      startDate = null,
      endDate = null,
      currency = 'USD'
    } = params;

    try {
      let query = `
        SELECT
          -- Extract payment method from metadata
          CASE
            WHEN JSON_EXTRACT(metadata, '$.payment_method_types') LIKE '%card%' THEN 'card'
            WHEN JSON_EXTRACT(metadata, '$.payment_method_types') LIKE '%ach%' THEN 'ach'
            WHEN JSON_EXTRACT(metadata, '$.payment_method_types') LIKE '%paypal%' THEN 'paypal'
            WHEN JSON_EXTRACT(metadata, '$.payment_method_types') LIKE '%klarna%' THEN 'klarna'
            WHEN JSON_EXTRACT(metadata, '$.payment_method_types') LIKE '%afterpay%' THEN 'afterpay'
            ELSE 'other'
          END as payment_method,

          -- Volume metrics
          COUNT(*) as transaction_count,
          COALESCE(SUM(amount_cents), 0) as total_volume_cents,
          COALESCE(AVG(amount_cents), 0) as avg_transaction_cents,
          COALESCE(MIN(amount_cents), 0) as min_transaction_cents,
          COALESCE(MAX(amount_cents), 0) as max_transaction_cents,

          -- Success rates
          COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as successful_count,
          COUNT(CASE WHEN payment_status = 'failed' THEN 1 END) as failed_count,
          COUNT(CASE WHEN payment_status LIKE '%refund%' THEN 1 END) as refunded_count,

          -- Fee analysis by payment method
          COALESCE(SUM(fees_cents), 0) as total_fees_cents,
          COALESCE(AVG(fees_cents), 0) as avg_fee_cents,
          COALESCE(SUM(net_amount_cents), 0) as net_amount_cents,

          -- Reconciliation status
          COUNT(CASE WHEN reconciliation_status = 'reconciled' THEN 1 END) as reconciled_count,
          COUNT(CASE WHEN reconciliation_status = 'discrepancy' THEN 1 END) as discrepancy_count,

          -- Geographic distribution (if available)
          COUNT(CASE WHEN JSON_EXTRACT(metadata, '$.customer_country') IS NOT NULL THEN 1 END) as international_count,

          -- Dispute analysis
          COUNT(CASE WHEN action = 'DISPUTE_CREATED' THEN 1 END) as dispute_count,
          COALESCE(SUM(CASE WHEN action = 'DISPUTE_CREATED' THEN amount_cents ELSE 0 END), 0) as disputed_amount_cents

        FROM audit_logs
        WHERE event_type = 'financial_event'
          AND currency = ?
          AND action LIKE '%PAYMENT%'
      `;

      const queryParams = [currency];

      // Add date filters if provided
      if (startDate) {
        query += ' AND DATE(created_at) >= ?';
        queryParams.push(startDate);
      }
      if (endDate) {
        query += ' AND DATE(created_at) <= ?';
        queryParams.push(endDate);
      }

      query += ` GROUP BY payment_method ORDER BY total_volume_cents DESC`;

      const result = await this.db.execute(query, queryParams);

      // Calculate derived metrics
      const totalVolume = result.rows.reduce((sum, row) => sum + row.total_volume_cents, 0);
      const totalTransactions = result.rows.reduce((sum, row) => sum + row.transaction_count, 0);

      const analysisData = result.rows.map(row => ({
        ...row,
        // Calculate success rate
        success_rate: row.transaction_count > 0
          ? (row.successful_count / row.transaction_count * 100).toFixed(2)
          : '0.00',

        // Calculate market share
        volume_share: totalVolume > 0
          ? (row.total_volume_cents / totalVolume * 100).toFixed(2)
          : '0.00',

        transaction_share: totalTransactions > 0
          ? (row.transaction_count / totalTransactions * 100).toFixed(2)
          : '0.00',

        // Calculate effective fee rate
        effective_fee_rate: row.total_volume_cents > 0
          ? (row.total_fees_cents / row.total_volume_cents * 100).toFixed(3)
          : '0.000',

        // Calculate dispute rate
        dispute_rate: row.successful_count > 0
          ? (row.dispute_count / row.successful_count * 100).toFixed(3)
          : '0.000',

        // Calculate refund rate
        refund_rate: row.successful_count > 0
          ? (row.refunded_count / row.successful_count * 100).toFixed(2)
          : '0.00'
      }));

      return {
        report_type: 'payment_method_breakdown',
        currency,
        date_range: {
          start: startDate,
          end: endDate
        },
        summary: {
          total_volume_cents: totalVolume,
          total_transactions: totalTransactions,
          payment_methods_count: result.rows.length
        },
        payment_methods: analysisData,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[FinancialAuditQueries] Failed to generate payment method breakdown:', error.message);
      throw error;
    }
  }

  /**
   * Get financial compliance report for regulatory requirements
   */
  async getFinancialComplianceReport(params = {}) {
    await this.ensureInitialized();

    const {
      startDate = null,
      endDate = null,
      reportType = 'comprehensive' // 'pci', 'sox', 'gdpr', 'comprehensive'
    } = params;

    try {
      // Base compliance query
      let query = `
        SELECT
          DATE(created_at) as transaction_date,

          -- Audit trail completeness
          COUNT(*) as total_events,
          COUNT(CASE WHEN request_id IS NOT NULL AND request_id != '' THEN 1 END) as events_with_request_id,
          COUNT(CASE WHEN transaction_reference IS NOT NULL THEN 1 END) as events_with_transaction_ref,
          COUNT(CASE WHEN metadata IS NOT NULL AND metadata != '{}' THEN 1 END) as events_with_metadata,

          -- Financial data integrity
          COUNT(CASE WHEN amount_cents IS NOT NULL AND amount_cents > 0 THEN 1 END) as events_with_valid_amounts,
          COUNT(CASE WHEN currency IS NOT NULL AND currency != '' THEN 1 END) as events_with_currency,
          COUNT(CASE WHEN payment_status IS NOT NULL THEN 1 END) as events_with_payment_status,

          -- Reconciliation compliance
          COUNT(CASE WHEN reconciliation_status = 'reconciled' THEN 1 END) as reconciled_events,
          COUNT(CASE WHEN reconciliation_status = 'pending' AND created_at < datetime('now', '-24 hours') THEN 1 END) as overdue_reconciliation,
          COUNT(CASE WHEN reconciliation_status = 'discrepancy' THEN 1 END) as unresolved_discrepancies,

          -- Data retention compliance
          COUNT(CASE WHEN created_at < datetime('now', '-7 years') THEN 1 END) as events_past_retention,

          -- Security and access control
          COUNT(CASE WHEN admin_user IS NOT NULL THEN 1 END) as admin_accessed_events,
          COUNT(CASE WHEN ip_address IS NOT NULL THEN 1 END) as events_with_ip_tracking,
          COUNT(CASE WHEN session_id IS NOT NULL THEN 1 END) as events_with_session_tracking,

          -- Error handling and monitoring
          COUNT(CASE WHEN severity = 'error' OR severity = 'critical' THEN 1 END) as error_events,
          COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as events_with_errors,

          -- GDPR compliance (if applicable)
          COUNT(CASE WHEN data_subject_id IS NOT NULL THEN 1 END) as gdpr_tracked_events,
          COUNT(CASE WHEN processing_purpose IS NOT NULL THEN 1 END) as events_with_purpose,
          COUNT(CASE WHEN legal_basis IS NOT NULL THEN 1 END) as events_with_legal_basis,

          -- Settlement tracking
          COUNT(CASE WHEN settlement_id IS NOT NULL THEN 1 END) as events_with_settlement,
          COUNT(CASE WHEN settlement_date IS NOT NULL THEN 1 END) as settled_events,

          -- Financial volume for context
          COALESCE(SUM(amount_cents), 0) as daily_volume_cents,
          COUNT(DISTINCT transaction_reference) as unique_transactions

        FROM audit_logs
        WHERE event_type = 'financial_event'
      `;

      const queryParams = [];

      // Add date filters if provided
      if (startDate) {
        query += ' AND DATE(created_at) >= ?';
        queryParams.push(startDate);
      }
      if (endDate) {
        query += ' AND DATE(created_at) <= ?';
        queryParams.push(endDate);
      }

      query += ` GROUP BY DATE(created_at) ORDER BY transaction_date DESC`;

      const result = await this.db.execute(query, queryParams);

      // Calculate compliance scores and metrics
      const complianceData = result.rows.map(row => {
        const auditTrailScore = row.total_events > 0
          ? ((row.events_with_request_id + row.events_with_transaction_ref + row.events_with_metadata) / (row.total_events * 3) * 100).toFixed(1)
          : '100.0';

        const dataIntegrityScore = row.total_events > 0
          ? ((row.events_with_valid_amounts + row.events_with_currency + row.events_with_payment_status) / (row.total_events * 3) * 100).toFixed(1)
          : '100.0';

        const reconciliationScore = row.total_events > 0
          ? (row.reconciled_events / row.total_events * 100).toFixed(1)
          : '100.0';

        const gdprScore = row.total_events > 0 && row.gdpr_tracked_events > 0
          ? ((row.events_with_purpose + row.events_with_legal_basis) / (row.gdpr_tracked_events * 2) * 100).toFixed(1)
          : 'N/A';

        return {
          ...row,
          compliance_scores: {
            audit_trail: auditTrailScore,
            data_integrity: dataIntegrityScore,
            reconciliation: reconciliationScore,
            gdpr_compliance: gdprScore,
            overall: ((parseFloat(auditTrailScore) + parseFloat(dataIntegrityScore) + parseFloat(reconciliationScore)) / 3).toFixed(1)
          },
          compliance_issues: {
            missing_request_ids: row.total_events - row.events_with_request_id,
            missing_transaction_refs: row.total_events - row.events_with_transaction_ref,
            overdue_reconciliations: row.overdue_reconciliation,
            unresolved_discrepancies: row.unresolved_discrepancies,
            retention_violations: row.events_past_retention,
            error_rate: row.total_events > 0 ? (row.error_events / row.total_events * 100).toFixed(2) : '0.00'
          }
        };
      });

      // Calculate overall compliance summary
      const totalEvents = complianceData.reduce((sum, row) => sum + row.total_events, 0);
      const totalIssues = complianceData.reduce((sum, row) =>
        sum + row.compliance_issues.missing_request_ids +
        row.compliance_issues.missing_transaction_refs +
        row.compliance_issues.overdue_reconciliations +
        row.compliance_issues.unresolved_discrepancies, 0);

      const overallComplianceScore = totalEvents > 0
        ? (100 - (totalIssues / totalEvents * 100)).toFixed(1)
        : '100.0';

      return {
        report_type: 'financial_compliance',
        compliance_framework: reportType,
        date_range: {
          start: startDate,
          end: endDate
        },
        summary: {
          overall_compliance_score: overallComplianceScore,
          total_events_audited: totalEvents,
          total_compliance_issues: totalIssues,
          compliance_status: parseFloat(overallComplianceScore) >= 95 ? 'compliant' :
                           parseFloat(overallComplianceScore) >= 85 ? 'needs_attention' : 'non_compliant'
        },
        daily_compliance: complianceData,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[FinancialAuditQueries] Failed to generate financial compliance report:', error.message);
      throw error;
    }
  }

  /**
   * Update reconciliation status for financial events
   */
  async updateReconciliationStatus(transactionReference, status, notes = null) {
    await this.ensureInitialized();

    const validStatuses = ['pending', 'reconciled', 'discrepancy', 'resolved', 'investigating'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid reconciliation status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    try {
      const result = await this.db.execute({
        sql: `
          UPDATE audit_logs
          SET reconciliation_status = ?,
              reconciliation_date = CASE WHEN ? = 'reconciled' THEN CURRENT_TIMESTAMP ELSE reconciliation_date END,
              reconciliation_notes = COALESCE(?, reconciliation_notes)
          WHERE event_type = 'financial_event'
            AND transaction_reference = ?
        `,
        args: [status, status, notes, transactionReference]
      });

      // Log the reconciliation status update
      await auditService.logFinancialEvent({
        requestId: `recon_update_${transactionReference}_${Date.now()}`,
        action: 'RECONCILIATION_STATUS_UPDATED',
        amountCents: 0,
        currency: 'USD',
        transactionReference,
        paymentStatus: status,
        targetType: 'reconciliation_update',
        targetId: transactionReference,
        metadata: {
          new_status: status,
          notes: notes,
          affected_rows: result.changes
        },
        severity: 'info'
      });

      logger.info(`[FinancialAuditQueries] Updated reconciliation status for ${transactionReference} to ${status}`);

      return {
        success: true,
        transaction_reference: transactionReference,
        new_status: status,
        affected_rows: result.changes
      };

    } catch (error) {
      logger.error(`[FinancialAuditQueries] Failed to update reconciliation status for ${transactionReference}:`, error.message);
      throw error;
    }
  }

  /**
   * Get outstanding reconciliation items requiring attention
   */
  async getOutstandingReconciliationItems(params = {}) {
    await this.ensureInitialized();

    const {
      status = 'pending',
      daysOld = 1,
      limit = 100,
      offset = 0
    } = params;

    try {
      const query = `
        SELECT
          id,
          request_id,
          action,
          transaction_reference,
          amount_cents,
          currency,
          payment_status,
          reconciliation_status,
          reconciliation_notes,
          settlement_id,
          settlement_date,
          created_at,
          metadata,
          -- Calculate age in days
          CAST((julianday('now') - julianday(created_at)) AS INTEGER) as age_days,
          -- Extract customer info from metadata
          JSON_EXTRACT(metadata, '$.customer_email') as customer_email,
          JSON_EXTRACT(metadata, '$.stripe_session_id') as stripe_session_id,
          JSON_EXTRACT(metadata, '$.payment_intent_id') as payment_intent_id

        FROM audit_logs
        WHERE event_type = 'financial_event'
          AND reconciliation_status = ?
          AND created_at <= datetime('now', '-' || ? || ' days')
          AND amount_cents > 0
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `;

      const result = await this.db.execute(query, [status, daysOld, limit, offset]);

      // Get total count for pagination
      const countResult = await this.db.execute(`
        SELECT COUNT(*) as total
        FROM audit_logs
        WHERE event_type = 'financial_event'
          AND reconciliation_status = ?
          AND created_at <= datetime('now', '-' || ? || ' days')
          AND amount_cents > 0
      `, [status, daysOld]);

      const totalCount = countResult.rows[0].total;

      return {
        status,
        criteria: {
          days_old: daysOld,
          reconciliation_status: status
        },
        pagination: {
          total: totalCount,
          limit,
          offset,
          has_more: offset + limit < totalCount
        },
        outstanding_items: result.rows,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[FinancialAuditQueries] Failed to get outstanding reconciliation items:', error.message);
      throw error;
    }
  }

  /**
   * Get financial audit statistics for dashboard
   */
  async getFinancialAuditStats(timeframe = '24h') {
    await this.ensureInitialized();

    try {
      let timeFilter = '';
      switch (timeframe) {
        case '1h':
          timeFilter = "AND created_at >= datetime('now', '-1 hour')";
          break;
        case '24h':
          timeFilter = "AND created_at >= datetime('now', '-1 day')";
          break;
        case '7d':
          timeFilter = "AND created_at >= datetime('now', '-7 days')";
          break;
        case '30d':
          timeFilter = "AND created_at >= datetime('now', '-30 days')";
          break;
        default:
          timeFilter = "AND created_at >= datetime('now', '-1 day')";
      }

      const statsQuery = `
        SELECT
          -- Volume metrics
          COUNT(*) as total_financial_events,
          COUNT(DISTINCT transaction_reference) as unique_transactions,
          COALESCE(SUM(amount_cents), 0) as total_volume_cents,
          COALESCE(AVG(amount_cents), 0) as avg_transaction_cents,

          -- Status breakdown
          COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as completed_payments,
          COUNT(CASE WHEN payment_status = 'failed' THEN 1 END) as failed_payments,
          COUNT(CASE WHEN payment_status LIKE '%refund%' THEN 1 END) as refunds,
          COUNT(CASE WHEN action = 'DISPUTE_CREATED' THEN 1 END) as disputes,

          -- Reconciliation status
          COUNT(CASE WHEN reconciliation_status = 'reconciled' THEN 1 END) as reconciled,
          COUNT(CASE WHEN reconciliation_status = 'pending' THEN 1 END) as pending_reconciliation,
          COUNT(CASE WHEN reconciliation_status = 'discrepancy' THEN 1 END) as discrepancies,

          -- Fees and settlements
          COALESCE(SUM(fees_cents), 0) as total_fees_cents,
          COALESCE(SUM(net_amount_cents), 0) as net_amount_cents,
          COUNT(CASE WHEN settlement_id IS NOT NULL THEN 1 END) as settled_transactions,

          -- Error analysis
          COUNT(CASE WHEN severity = 'error' OR severity = 'critical' THEN 1 END) as error_events,

          -- Time analysis
          MIN(created_at) as earliest_event,
          MAX(created_at) as latest_event

        FROM audit_logs
        WHERE event_type = 'financial_event' ${timeFilter}
      `;

      const result = await this.db.execute(statsQuery);
      const stats = result.rows[0];

      // Calculate derived metrics
      const reconciliationRate = stats.total_financial_events > 0
        ? (stats.reconciled / stats.total_financial_events * 100).toFixed(2)
        : '100.00';

      const successRate = (stats.completed_payments + stats.failed_payments) > 0
        ? (stats.completed_payments / (stats.completed_payments + stats.failed_payments) * 100).toFixed(2)
        : '100.00';

      const effectiveFeeRate = stats.total_volume_cents > 0
        ? (stats.total_fees_cents / stats.total_volume_cents * 100).toFixed(3)
        : '0.000';

      return {
        timeframe,
        raw_stats: stats,
        calculated_metrics: {
          reconciliation_rate: reconciliationRate,
          success_rate: successRate,
          effective_fee_rate: effectiveFeeRate,
          avg_transaction_value: (stats.total_volume_cents / 100).toFixed(2), // Convert to dollars
          dispute_rate: stats.completed_payments > 0
            ? (stats.disputes / stats.completed_payments * 100).toFixed(3)
            : '0.000'
        },
        health_indicators: {
          reconciliation_health: parseFloat(reconciliationRate) >= 95 ? 'healthy' :
                                parseFloat(reconciliationRate) >= 85 ? 'warning' : 'critical',
          payment_health: parseFloat(successRate) >= 95 ? 'healthy' :
                         parseFloat(successRate) >= 90 ? 'warning' : 'critical',
          dispute_health: parseFloat(stats.disputes / stats.completed_payments * 100) <= 1 ? 'healthy' : 'warning'
        },
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[FinancialAuditQueries] Failed to get financial audit stats:', error.message);
      throw error;
    }
  }

  /**
   * Health check for financial audit queries service
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();

      // Test database connectivity and table access
      const testResult = await this.db.execute('SELECT COUNT(*) as count FROM audit_logs WHERE event_type = "financial_event" LIMIT 1');

      return {
        status: 'healthy',
        initialized: this.initialized,
        database_connected: true,
        financial_events_count: testResult.rows[0].count,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        initialized: this.initialized,
        database_connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const financialAuditQueries = new FinancialAuditQueries();

// Export both the instance and the class
export default financialAuditQueries;
export { financialAuditQueries };