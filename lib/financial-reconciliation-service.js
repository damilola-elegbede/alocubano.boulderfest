/**
 * Financial Reconciliation Service
 * Comprehensive financial reconciliation and compliance monitoring system
 *
 * Features:
 * - Daily reconciliation reports comparing Stripe vs database
 * - Automated discrepancy detection and alerting
 * - Settlement tracking and bank reconciliation
 * - Fee calculation and verification
 * - Refund tracking and status management
 * - Real-time financial health monitoring
 * - Regulatory compliance reporting (PCI, financial audits)
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';
import auditService from './audit-service.js';
import Stripe from 'stripe';

export class FinancialReconciliationService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;
    this.stripe = null;
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // Stripe fee rates for calculation verification
    this.stripeFeeRates = {
      card: { rate: 0.029, fixed: 30 }, // 2.9% + 30¢ for cards
      international: { rate: 0.044, fixed: 30 }, // 4.4% + 30¢ for international
      amex: { rate: 0.035, fixed: 30 }, // 3.5% + 30¢ for Amex
      ach: { rate: 0.008, fixed: 0, max: 500 }, // 0.8% capped at $5 for ACH
    };
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    // Fast path: already initialized
    if (this.initialized && this.db && this.stripe) {
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
      logger.debug('[FinancialRecon] Initializing financial reconciliation service...');

      // In integration test mode, use the test isolation manager's database
      if (process.env.INTEGRATION_TEST_MODE === 'true') {
        try {
          const { getTestIsolationManager } = await import('./test-isolation-manager.js');
          const isolationManager = getTestIsolationManager();
          this.db = await isolationManager.getScopedDatabaseClient();
        } catch (error) {
          logger.warn('[FinancialRecon] Failed to get test database, falling back to standard database:', error.message);
          this.db = await getDatabaseClient();
        }
      } else {
        this.db = await getDatabaseClient();
      }

      if (!this.db) {
        throw new Error('Failed to get database client - db is null');
      }

      // In test environments, allow service to initialize without Stripe
      if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
        if (process.env.STRIPE_SECRET_KEY) {
          this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        } else {
          logger.debug('[FinancialRecon] Running in test mode without STRIPE_SECRET_KEY');
          this.stripe = null; // Will need to mock Stripe calls in tests
        }
      } else {
        if (!process.env.STRIPE_SECRET_KEY) {
          throw new Error('STRIPE_SECRET_KEY environment variable is required');
        }
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      }

      // Verify tables exist
      await this._ensureReconciliationTables();

      this.initialized = true;
      logger.debug('[FinancialRecon] Financial reconciliation service initialized successfully');
      return this;
    } catch (error) {
      logger.error('[FinancialRecon] Initialization failed:', error.message);
      this.initialized = false;
      this.db = null;
      this.stripe = null;
      throw error;
    }
  }

  /**
   * Ensure reconciliation tables exist
   */
  async _ensureReconciliationTables() {
    try {
      // Check if financial reconciliation tables exist
      const tableCheck = await this.db.execute(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='financial_reconciliation_reports'
      `);

      if (tableCheck.rows.length === 0) {
        // In test environments, log warning but don't fail
        if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
          logger.debug('[FinancialRecon] Reconciliation tables not found in test environment (expected)');
          this.tablesExist = false;
          return;
        }
        throw new Error('Financial reconciliation tables not found. Please run migration 025_financial_reconciliation_system.sql');
      }

      this.tablesExist = true;
      logger.debug('[FinancialRecon] Reconciliation tables verified');
    } catch (error) {
      logger.error('[FinancialRecon] Failed to verify reconciliation tables:', error.message);
      throw error;
    }
  }

  /**
   * Generate daily reconciliation report
   */
  async generateDailyReconciliationReport(date = null) {
    await this.ensureInitialized();

    const reportDate = date || new Date().toISOString().split('T')[0];
    const requestId = `daily_recon_${reportDate}_${Date.now()}`;

    try {
      logger.info(`[FinancialRecon] Generating daily reconciliation report for ${reportDate}`);

      // Check if report already exists
      const existingReport = await this.db.execute({
        sql: `SELECT * FROM financial_reconciliation_reports
              WHERE report_date = ? AND report_type = 'daily'`,
        args: [reportDate]
      });

      if (existingReport.rows.length > 0) {
        logger.info(`[FinancialRecon] Daily report for ${reportDate} already exists`);
        return existingReport.rows[0];
      }

      // Get database financial data for the date
      const dbData = await this._getDatabaseFinancialData(reportDate);

      // Get Stripe financial data for the date
      const stripeData = await this._getStripeFinancialData(reportDate);

      // Calculate variances
      const amountVariance = stripeData.grossAmount - dbData.grossAmount;
      const transactionCountVariance = stripeData.transactionCount - dbData.transactionCount;
      const feeVariance = stripeData.fees - dbData.calculatedFees;
      const netVariance = stripeData.netAmount - dbData.netAmount;

      // Determine reconciliation status
      const hasDiscrepancies = Math.abs(amountVariance) > 1 || // Allow 1 cent variance for rounding
                              transactionCountVariance !== 0 ||
                              Math.abs(feeVariance) > 5; // Allow $0.05 fee variance

      const reconciliationStatus = hasDiscrepancies ? 'discrepancies_found' : 'reconciled';

      // Create reconciliation report
      const report = await this.db.execute({
        sql: `INSERT INTO financial_reconciliation_reports (
          report_date, report_type,
          stripe_gross_amount_cents, database_gross_amount_cents, amount_variance_cents,
          stripe_transaction_count, database_transaction_count, transaction_count_variance,
          stripe_fees_cents, calculated_fees_cents, fee_variance_cents,
          stripe_net_amount_cents, database_net_amount_cents, net_variance_cents,
          refunds_amount_cents, refunds_count,
          reconciliation_status, discrepancy_count, manual_review_required,
          currency, report_generated_at,
          stripe_data_fetched_at, database_data_fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          reportDate, 'daily',
          stripeData.grossAmount, dbData.grossAmount, amountVariance,
          stripeData.transactionCount, dbData.transactionCount, transactionCountVariance,
          stripeData.fees, dbData.calculatedFees, feeVariance,
          stripeData.netAmount, dbData.netAmount, netVariance,
          dbData.refundsAmount, dbData.refundsCount,
          reconciliationStatus, hasDiscrepancies ? 1 : 0, hasDiscrepancies,
          'USD', new Date().toISOString(),
          stripeData.fetchedAt, dbData.fetchedAt
        ]
      });

      const reportId = report.lastInsertRowid;

      // If discrepancies found, create detailed discrepancy records
      if (hasDiscrepancies) {
        await this._createDiscrepancyRecords(reportId, {
          reportDate,
          amountVariance,
          transactionCountVariance,
          feeVariance,
          netVariance,
          stripeData,
          dbData
        });
      }

      // Log audit event
      await auditService.logFinancialEvent({
        requestId,
        action: 'DAILY_RECONCILIATION_COMPLETED',
        amountCents: dbData.grossAmount,
        currency: 'USD',
        transactionReference: `daily_report_${reportDate}`,
        paymentStatus: reconciliationStatus,
        targetType: 'reconciliation_report',
        targetId: reportId.toString(),
        metadata: {
          report_date: reportDate,
          reconciliation_status: reconciliationStatus,
          discrepancy_count: hasDiscrepancies ? 1 : 0,
          amount_variance_cents: amountVariance,
          transaction_count_variance: transactionCountVariance,
          fee_variance_cents: feeVariance,
          stripe_transaction_count: stripeData.transactionCount,
          database_transaction_count: dbData.transactionCount
        },
        severity: hasDiscrepancies ? 'warning' : 'info'
      });

      // Get the complete report
      const completeReport = await this.db.execute({
        sql: `SELECT * FROM financial_reconciliation_reports WHERE id = ?`,
        args: [reportId]
      });

      logger.info(`[FinancialRecon] Daily reconciliation report generated for ${reportDate} with status: ${reconciliationStatus}`);

      return completeReport.rows[0];

    } catch (error) {
      logger.error(`[FinancialRecon] Failed to generate daily reconciliation report for ${reportDate}:`, error.message);

      // Log audit event for failure
      await auditService.logFinancialEvent({
        requestId,
        action: 'DAILY_RECONCILIATION_FAILED',
        amountCents: 0,
        currency: 'USD',
        transactionReference: `daily_report_${reportDate}`,
        paymentStatus: 'failed',
        targetType: 'reconciliation_report',
        targetId: null,
        metadata: {
          error_message: error.message,
          report_date: reportDate
        },
        severity: 'error'
      });

      throw error;
    }
  }

  /**
   * Get database financial data for a specific date
   */
  async _getDatabaseFinancialData(date) {
    const fetchedAt = new Date().toISOString();

    try {
      // Get transaction data from audit logs
      const result = await this.db.execute({
        sql: `
          SELECT
            COUNT(*) as transaction_count,
            COALESCE(SUM(amount_cents), 0) as gross_amount_cents,
            COALESCE(SUM(fees_cents), 0) as fees_cents,
            COALESCE(SUM(net_amount_cents), 0) as net_amount_cents,
            COUNT(CASE WHEN payment_status = 'refunded' OR payment_status LIKE '%refund%' THEN 1 END) as refund_count,
            COALESCE(SUM(CASE WHEN payment_status = 'refunded' OR payment_status LIKE '%refund%' THEN amount_cents ELSE 0 END), 0) as refund_amount_cents
          FROM audit_logs
          WHERE event_type = 'financial_event'
            AND DATE(created_at) = ?
            AND payment_status IN ('completed', 'refunded', 'partially_refunded')
            AND amount_cents > 0
        `,
        args: [date]
      });

      const data = result.rows[0];

      // Calculate fees if not stored (fallback calculation)
      let calculatedFees = data.fees_cents || 0;
      if (calculatedFees === 0 && data.gross_amount_cents > 0) {
        calculatedFees = this._calculateExpectedFees(data.gross_amount_cents, data.transaction_count);
      }

      // Calculate net amount if not stored
      let netAmount = data.net_amount_cents || 0;
      if (netAmount === 0) {
        netAmount = data.gross_amount_cents - calculatedFees;
      }

      return {
        grossAmount: data.gross_amount_cents || 0,
        transactionCount: data.transaction_count || 0,
        calculatedFees: calculatedFees,
        netAmount: netAmount,
        refundsAmount: data.refund_amount_cents || 0,
        refundsCount: data.refund_count || 0,
        fetchedAt
      };

    } catch (error) {
      logger.error(`[FinancialRecon] Failed to get database financial data for ${date}:`, error.message);
      throw error;
    }
  }

  /**
   * Get Stripe financial data for a specific date
   */
  async _getStripeFinancialData(date) {
    const fetchedAt = new Date().toISOString();

    try {
      // Convert date to Unix timestamps for Stripe API
      const startDate = new Date(`${date}T00:00:00Z`);
      const endDate = new Date(`${date}T23:59:59Z`);
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      // Get charges for the date
      const charges = await this.stripe.charges.list({
        created: {
          gte: startTimestamp,
          lte: endTimestamp
        },
        limit: 100 // Increase if needed
      });

      // Calculate totals
      let grossAmount = 0;
      let fees = 0;
      let netAmount = 0;
      let refundsAmount = 0;
      let refundsCount = 0;
      let transactionCount = 0;

      for (const charge of charges.data) {
        if (charge.paid && charge.status === 'succeeded') {
          transactionCount++;
          grossAmount += charge.amount;

          // Get balance transaction for fees
          if (charge.balance_transaction) {
            try {
              const balanceTransaction = await this.stripe.balanceTransactions.retrieve(charge.balance_transaction);
              fees += balanceTransaction.fee;
              netAmount += balanceTransaction.net;
            } catch (error) {
              logger.warn(`[FinancialRecon] Could not get balance transaction for charge ${charge.id}:`, error.message);
              // Fallback to estimated fees
              const estimatedFee = this._calculateExpectedFees(charge.amount, 1);
              fees += estimatedFee;
              netAmount += (charge.amount - estimatedFee);
            }
          }

          // Track refunds
          if (charge.refunded) {
            refundsCount++;
            refundsAmount += charge.amount_refunded;
          }
        }
      }

      return {
        grossAmount,
        transactionCount,
        fees,
        netAmount,
        refundsAmount,
        refundsCount,
        fetchedAt
      };

    } catch (error) {
      logger.error(`[FinancialRecon] Failed to get Stripe financial data for ${date}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate expected Stripe fees for validation
   */
  _calculateExpectedFees(amountCents, transactionCount = 1) {
    // Default to standard card rate if we don't have specific payment method info
    const feeRate = this.stripeFeeRates.card;

    // Calculate percentage fee
    const percentageFee = Math.round(amountCents * feeRate.rate);

    // Add fixed fee per transaction
    const fixedFee = feeRate.fixed * transactionCount;

    return percentageFee + fixedFee;
  }

  /**
   * Create detailed discrepancy records
   */
  async _createDiscrepancyRecords(reportId, discrepancyData) {
    const {
      reportDate,
      amountVariance,
      transactionCountVariance,
      feeVariance,
      netVariance,
      stripeData,
      dbData
    } = discrepancyData;

    try {
      // Amount mismatch discrepancy
      if (Math.abs(amountVariance) > 1) {
        await this.db.execute({
          sql: `INSERT INTO financial_discrepancies (
            report_id, discrepancy_type, expected_amount_cents, actual_amount_cents,
            variance_cents, status, severity, detected_at, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            reportId, 'amount_mismatch', stripeData.grossAmount, dbData.grossAmount,
            amountVariance, 'open', 'medium', new Date().toISOString(),
            JSON.stringify({
              report_date: reportDate,
              stripe_amount: stripeData.grossAmount,
              database_amount: dbData.grossAmount,
              variance_description: 'Gross amount mismatch between Stripe and database'
            })
          ]
        });
      }

      // Transaction count mismatch
      if (transactionCountVariance !== 0) {
        await this.db.execute({
          sql: `INSERT INTO financial_discrepancies (
            report_id, discrepancy_type, expected_amount_cents, actual_amount_cents,
            variance_cents, status, severity, detected_at, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            reportId, 'missing_transaction', stripeData.transactionCount, dbData.transactionCount,
            transactionCountVariance, 'open', 'high', new Date().toISOString(),
            JSON.stringify({
              report_date: reportDate,
              stripe_count: stripeData.transactionCount,
              database_count: dbData.transactionCount,
              variance_description: 'Transaction count mismatch between Stripe and database'
            })
          ]
        });
      }

      // Fee variance
      if (Math.abs(feeVariance) > 5) {
        await this.db.execute({
          sql: `INSERT INTO financial_discrepancies (
            report_id, discrepancy_type, expected_amount_cents, actual_amount_cents,
            variance_cents, status, severity, detected_at, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            reportId, 'fee_mismatch', stripeData.fees, dbData.calculatedFees,
            feeVariance, 'open', 'low', new Date().toISOString(),
            JSON.stringify({
              report_date: reportDate,
              stripe_fees: stripeData.fees,
              calculated_fees: dbData.calculatedFees,
              variance_description: 'Fee calculation mismatch'
            })
          ]
        });
      }

      logger.debug(`[FinancialRecon] Created discrepancy records for report ${reportId}`);

    } catch (error) {
      logger.error(`[FinancialRecon] Failed to create discrepancy records:`, error.message);
      throw error;
    }
  }

  /**
   * Get financial health status
   */
  async getFinancialHealthStatus() {
    await this.ensureInitialized();

    try {
      // Get recent reconciliation status
      const recentReports = await this.db.execute({
        sql: `
          SELECT
            report_date,
            reconciliation_status,
            discrepancy_count,
            amount_variance_cents,
            transaction_count_variance
          FROM financial_reconciliation_reports
          WHERE report_date >= DATE('now', '-7 days')
          ORDER BY report_date DESC
          LIMIT 7
        `
      });

      // Get unresolved discrepancies
      const unresolvedDiscrepancies = await this.db.execute({
        sql: `
          SELECT COUNT(*) as count, severity
          FROM financial_discrepancies
          WHERE status IN ('open', 'investigating')
          GROUP BY severity
        `
      });

      // Get unreconciled transactions
      const unreconciledTransactions = await this.db.execute({
        sql: `
          SELECT COUNT(*) as count
          FROM audit_logs
          WHERE event_type = 'financial_event'
            AND reconciliation_status IN ('pending', 'discrepancy')
            AND created_at >= DATE('now', '-30 days')
        `
      });

      // Calculate health score
      const totalReports = recentReports.rows.length;
      const reconciledReports = recentReports.rows.filter(r => r.reconciliation_status === 'reconciled').length;
      const reconciliationRate = totalReports > 0 ? (reconciledReports / totalReports) * 100 : 100;

      const unresolvedCount = unresolvedDiscrepancies.rows.reduce((sum, row) => sum + row.count, 0);
      const unreconciledCount = unreconciledTransactions.rows[0]?.count || 0;

      // Determine overall health status
      let healthStatus = 'healthy';
      if (reconciliationRate < 80 || unresolvedCount > 10 || unreconciledCount > 50) {
        healthStatus = 'warning';
      }
      if (reconciliationRate < 60 || unresolvedCount > 25 || unreconciledCount > 100) {
        healthStatus = 'critical';
      }

      return {
        status: healthStatus,
        reconciliation_rate: reconciliationRate,
        recent_reports: recentReports.rows,
        unresolved_discrepancies: {
          total: unresolvedCount,
          by_severity: unresolvedDiscrepancies.rows
        },
        unreconciled_transactions: unreconciledCount,
        last_updated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[FinancialRecon] Failed to get financial health status:', error.message);
      throw error;
    }
  }

  /**
   * Resolve discrepancy
   */
  async resolveDiscrepancy(discrepancyId, resolution) {
    await this.ensureInitialized();

    const { notes, action, resolvedBy } = resolution;

    try {
      await this.db.execute({
        sql: `
          UPDATE financial_discrepancies
          SET status = 'resolved',
              resolution_notes = ?,
              resolution_action = ?,
              resolved_at = ?,
              last_updated_at = ?
          WHERE id = ?
        `,
        args: [notes, action, new Date().toISOString(), new Date().toISOString(), discrepancyId]
      });

      // Log audit event
      await auditService.logFinancialEvent({
        requestId: `discrepancy_resolution_${discrepancyId}_${Date.now()}`,
        action: 'DISCREPANCY_RESOLVED',
        amountCents: 0,
        currency: 'USD',
        transactionReference: `discrepancy_${discrepancyId}`,
        paymentStatus: 'resolved',
        targetType: 'financial_discrepancy',
        targetId: discrepancyId.toString(),
        metadata: {
          resolution_notes: notes,
          resolution_action: action,
          resolved_by: resolvedBy
        },
        severity: 'info'
      });

      logger.info(`[FinancialRecon] Discrepancy ${discrepancyId} resolved by ${resolvedBy}`);

    } catch (error) {
      logger.error(`[FinancialRecon] Failed to resolve discrepancy ${discrepancyId}:`, error.message);
      throw error;
    }
  }

  /**
   * Health check for financial reconciliation service
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();

      // Test database connectivity
      const testResult = await this.db.execute('SELECT COUNT(*) as count FROM financial_reconciliation_reports LIMIT 1');

      // Test Stripe connectivity
      let stripeConnected = false;
      try {
        await this.stripe.accounts.retrieve();
        stripeConnected = true;
      } catch (stripeError) {
        logger.warn('[FinancialRecon] Stripe connectivity test failed:', stripeError.message);
      }

      return {
        status: 'healthy',
        initialized: this.initialized,
        database_connected: true,
        stripe_connected: stripeConnected,
        total_reports: testResult.rows[0].count,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        initialized: this.initialized,
        database_connected: false,
        stripe_connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const financialReconciliationService = new FinancialReconciliationService();

// Export both the instance and the class
export default financialReconciliationService;
export { financialReconciliationService };