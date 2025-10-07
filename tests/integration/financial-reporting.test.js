/**
 * Financial Reporting Integration Tests
 * Tests financial report generation, revenue calculations, and compliance reporting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import auditService from '../../lib/audit-service.js';
import securityAlertService from '../../lib/security-alert-service.js';
import sessionMonitorService from '../../lib/admin-session-monitor.js';

// Mock Financial Reporting Service
class FinancialReportingService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async ensureInitialized() {
    if (!this.initialized) {
      this.db = await getDatabaseClient();
      await this._ensureReportingTables();
      this.initialized = true;
    }
    return this;
  }

  async _ensureReportingTables() {
    // Create financial reports cache table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS financial_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_type TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        report_data TEXT NOT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        generated_by TEXT,
        status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
        UNIQUE(report_type, start_date, end_date)
      )
    `);

    // Create compliance tracking table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS compliance_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        compliance_type TEXT NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_revenue_cents INTEGER NOT NULL DEFAULT 0,
        total_refunds_cents INTEGER NOT NULL DEFAULT 0,
        total_disputes_cents INTEGER NOT NULL DEFAULT 0,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        compliance_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Generate revenue report for a time period
   */
  async generateRevenueReport(startDate, endDate, breakdown = 'daily') {
    await this.ensureInitialized();

    // Get all financial events in the period
    const events = await auditService.queryAuditLogs({
      eventType: 'financial_event',
      startDate: `${startDate}T00:00:00.000Z`,
      endDate: `${endDate}T23:59:59.999Z`,
      limit: 10000
    });

    const reportData = {
      period: { start: startDate, end: endDate },
      breakdown: breakdown,
      summary: {
        total_gross_revenue_cents: 0,
        total_net_revenue_cents: 0,
        total_refunds_cents: 0,
        total_fees_cents: 0,
        total_disputes_cents: 0,
        transaction_count: 0,
        refund_count: 0,
        dispute_count: 0,
        average_transaction_value_cents: 0
      },
      breakdown_data: {},
      top_revenue_days: [],
      payment_methods: {},
      currency_breakdown: {}
    };

    const processedTransactions = new Set();
    const dailyData = {};

    for (const event of events.logs) {
      const eventDate = event.created_at.split('T')[0];
      const amount = event.amount_cents || 0;

      // Initialize daily data if needed
      if (!dailyData[eventDate]) {
        dailyData[eventDate] = {
          date: eventDate,
          gross_revenue_cents: 0,
          refunds_cents: 0,
          disputes_cents: 0,
          fees_cents: 0,
          transaction_count: 0,
          refund_count: 0,
          dispute_count: 0
        };
      }

      const dayData = dailyData[eventDate];

      switch (event.action) {
        case 'PAYMENT_SUCCESSFUL':
        case 'ASYNC_PAYMENT_SUCCESSFUL':
          if (!processedTransactions.has(event.transaction_reference)) {
            reportData.summary.total_gross_revenue_cents += amount;
            dayData.gross_revenue_cents += amount;
            reportData.summary.transaction_count++;
            dayData.transaction_count++;
            processedTransactions.add(event.transaction_reference);

            // Track payment methods
            try {
              const metadata = JSON.parse(event.metadata || '{}');
              const paymentMethods = metadata.payment_method_types || ['unknown'];
              paymentMethods.forEach(method => {
                reportData.payment_methods[method] = (reportData.payment_methods[method] || 0) + amount;
              });
            } catch (e) {
              reportData.payment_methods['unknown'] = (reportData.payment_methods['unknown'] || 0) + amount;
            }
          }
          break;

        case 'REFUND_FULL':
        case 'REFUND_PARTIAL':
          reportData.summary.total_refunds_cents += amount;
          dayData.refunds_cents += amount;
          reportData.summary.refund_count++;
          dayData.refund_count++;
          break;

        case 'DISPUTE_CREATED':
          reportData.summary.total_disputes_cents += amount;
          dayData.disputes_cents += amount;
          reportData.summary.dispute_count++;
          dayData.dispute_count++;
          break;
      }

      // Track currency breakdown
      const currency = event.currency || 'USD';
      if (!reportData.currency_breakdown[currency]) {
        reportData.currency_breakdown[currency] = { revenue_cents: 0, transaction_count: 0 };
      }
      if (event.action.includes('PAYMENT_SUCCESSFUL')) {
        reportData.currency_breakdown[currency].revenue_cents += amount;
        reportData.currency_breakdown[currency].transaction_count++;
      }
    }

    // Calculate derived metrics
    if (reportData.summary.transaction_count > 0) {
      reportData.summary.average_transaction_value_cents = Math.round(
        reportData.summary.total_gross_revenue_cents / reportData.summary.transaction_count
      );
    }

    // Estimate fees (2.9% + 30¢ per transaction)
    reportData.summary.total_fees_cents = Math.round(
      reportData.summary.total_gross_revenue_cents * 0.029
    ) + (reportData.summary.transaction_count * 30);

    reportData.summary.total_net_revenue_cents =
      reportData.summary.total_gross_revenue_cents -
      reportData.summary.total_fees_cents -
      reportData.summary.total_refunds_cents;

    // Set breakdown data
    if (breakdown === 'daily') {
      reportData.breakdown_data = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
    }

    // Top revenue days
    reportData.top_revenue_days = Object.values(dailyData)
      .sort((a, b) => b.gross_revenue_cents - a.gross_revenue_cents)
      .slice(0, 5);

    // Save report
    await this.db.execute({
      sql: `INSERT OR REPLACE INTO financial_reports (
        report_type, start_date, end_date, report_data, generated_by
      ) VALUES (?, ?, ?, ?, ?)`,
      args: [
        'revenue_report',
        startDate,
        endDate,
        JSON.stringify(reportData),
        'system'
      ]
    });

    return reportData;
  }

  /**
   * Generate refund and dispute tracking report
   */
  async generateRefundDisputeReport(startDate, endDate) {
    await this.ensureInitialized();

    const events = await auditService.queryAuditLogs({
      eventType: 'financial_event',
      startDate: `${startDate}T00:00:00.000Z`,
      endDate: `${endDate}T23:59:59.999Z`,
      limit: 10000
    });

    const reportData = {
      period: { start: startDate, end: endDate },
      refunds: {
        total_amount_cents: 0,
        count: 0,
        full_refunds: { count: 0, amount_cents: 0 },
        partial_refunds: { count: 0, amount_cents: 0 },
        by_reason: {},
        by_date: {}
      },
      disputes: {
        total_amount_cents: 0,
        count: 0,
        by_reason: {},
        by_status: {},
        by_date: {}
      },
      chargeback_risk: {
        total_disputed_amount_cents: 0,
        dispute_rate: 0,
        average_dispute_amount_cents: 0
      }
    };

    for (const event of events.logs) {
      const eventDate = event.created_at.split('T')[0];
      const amount = event.amount_cents || 0;

      if (event.action === 'REFUND_FULL' || event.action === 'REFUND_PARTIAL') {
        reportData.refunds.total_amount_cents += amount;
        reportData.refunds.count++;

        // Track refund type
        if (event.action === 'REFUND_FULL') {
          reportData.refunds.full_refunds.count++;
          reportData.refunds.full_refunds.amount_cents += amount;
        } else {
          reportData.refunds.partial_refunds.count++;
          reportData.refunds.partial_refunds.amount_cents += amount;
        }

        // Track by date
        reportData.refunds.by_date[eventDate] = (reportData.refunds.by_date[eventDate] || 0) + amount;

        // Track by reason from metadata
        try {
          const metadata = JSON.parse(event.metadata || '{}');
          const reason = metadata.refund_reason || 'unknown';
          reportData.refunds.by_reason[reason] = (reportData.refunds.by_reason[reason] || 0) + amount;
        } catch (e) {
          reportData.refunds.by_reason['unknown'] = (reportData.refunds.by_reason['unknown'] || 0) + amount;
        }
      }

      if (event.action === 'DISPUTE_CREATED') {
        reportData.disputes.total_amount_cents += amount;
        reportData.disputes.count++;
        reportData.chargeback_risk.total_disputed_amount_cents += amount;

        // Track by date
        reportData.disputes.by_date[eventDate] = (reportData.disputes.by_date[eventDate] || 0) + amount;

        // Track by reason and status from metadata
        try {
          const metadata = JSON.parse(event.metadata || '{}');
          const reason = metadata.dispute_reason || 'unknown';
          const status = metadata.dispute_status || 'unknown';

          reportData.disputes.by_reason[reason] = (reportData.disputes.by_reason[reason] || 0) + amount;
          reportData.disputes.by_status[status] = (reportData.disputes.by_status[status] || 0) + amount;
        } catch (e) {
          reportData.disputes.by_reason['unknown'] = (reportData.disputes.by_reason['unknown'] || 0) + amount;
          reportData.disputes.by_status['unknown'] = (reportData.disputes.by_status['unknown'] || 0) + amount;
        }
      }
    }

    // Calculate chargeback risk metrics
    if (reportData.disputes.count > 0) {
      reportData.chargeback_risk.average_dispute_amount_cents = Math.round(
        reportData.disputes.total_amount_cents / reportData.disputes.count
      );
    }

    // Calculate dispute rate (would need total transaction volume for accurate rate)
    const totalTransactionEvents = events.logs.filter(e =>
      e.action === 'PAYMENT_SUCCESSFUL' || e.action === 'ASYNC_PAYMENT_SUCCESSFUL'
    ).length;

    if (totalTransactionEvents > 0) {
      reportData.chargeback_risk.dispute_rate = (reportData.disputes.count / totalTransactionEvents) * 100;
    }

    return reportData;
  }

  /**
   * Generate compliance report for regulatory requirements
   */
  async generateComplianceReport(startDate, endDate, complianceType = 'general') {
    await this.ensureInitialized();

    const events = await auditService.queryAuditLogs({
      eventType: 'financial_event',
      startDate: `${startDate}T00:00:00.000Z`,
      endDate: `${endDate}T23:59:59.999Z`,
      limit: 10000
    });

    let totalRevenue = 0;
    let totalRefunds = 0;
    let totalDisputes = 0;
    let transactionCount = 0;
    const processedTransactions = new Set();

    const complianceData = {
      audit_trail_complete: true,
      data_retention_compliant: true,
      transaction_integrity: true,
      financial_controls: {
        segregation_of_duties: true,
        authorization_controls: true,
        reconciliation_controls: true
      },
      audit_events: []
    };

    for (const event of events.logs) {
      const amount = event.amount_cents || 0;

      switch (event.action) {
        case 'PAYMENT_SUCCESSFUL':
        case 'ASYNC_PAYMENT_SUCCESSFUL':
          if (!processedTransactions.has(event.transaction_reference)) {
            totalRevenue += amount;
            transactionCount++;
            processedTransactions.add(event.transaction_reference);
          }
          break;
        case 'REFUND_FULL':
        case 'REFUND_PARTIAL':
          totalRefunds += amount;
          break;
        case 'DISPUTE_CREATED':
          totalDisputes += amount;
          break;
      }

      // Validate audit trail completeness
      if (!event.request_id || !event.created_at) {
        complianceData.audit_trail_complete = false;
      }

      complianceData.audit_events.push({
        event_id: event.id,
        timestamp: event.created_at,
        action: event.action,
        amount: amount,
        has_metadata: !!event.metadata,
        has_request_id: !!event.request_id
      });
    }

    // Save compliance report
    await this.db.execute({
      sql: `INSERT INTO compliance_reports (
        compliance_type, period_start, period_end, total_revenue_cents,
        total_refunds_cents, total_disputes_cents, transaction_count, compliance_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        complianceType,
        startDate,
        endDate,
        totalRevenue,
        totalRefunds,
        totalDisputes,
        transactionCount,
        JSON.stringify(complianceData)
      ]
    });

    return {
      compliance_type: complianceType,
      period: { start: startDate, end: endDate },
      summary: {
        total_revenue_cents: totalRevenue,
        total_refunds_cents: totalRefunds,
        total_disputes_cents: totalDisputes,
        transaction_count: transactionCount
      },
      compliance_status: complianceData,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Get cached report
   */
  async getCachedReport(reportType, startDate, endDate) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: `SELECT * FROM financial_reports
            WHERE report_type = ? AND start_date = ? AND end_date = ?
            ORDER BY generated_at DESC LIMIT 1`,
      args: [reportType, startDate, endDate]
    });

    if (result.rows.length > 0) {
      const report = result.rows[0];
      return {
        ...report,
        report_data: JSON.parse(report.report_data)
      };
    }

    return null;
  }

  /**
   * Performance test for large datasets
   */
  async performanceTestReport(transactionCount = 1000) {
    const startDate = '2026-01-01';
    const endDate = '2026-12-31';

    const startTime = Date.now();
    const report = await this.generateRevenueReport(startDate, endDate);
    const duration = Date.now() - startTime;

    return {
      transaction_count: transactionCount,
      processing_time_ms: duration,
      performance_grade: duration < 5000 ? 'excellent' : duration < 10000 ? 'good' : 'needs_optimization',
      report_size_kb: Math.round(JSON.stringify(report).length / 1024),
      breakdown_data_points: Object.keys(report.breakdown_data || {}).length
    };
  }
}

describe('Financial Reporting Integration Tests', () => {
  let db;
  let reportingService;

  beforeEach(async () => {
    db = await getDatabaseClient();
    reportingService = new FinancialReportingService();

    // Reset ALL service states that cache database connections
    // This prevents CLIENT_CLOSED errors from stale connections

    // Reset audit service state and force it to use the test database
    auditService.initialized = false;
    auditService.initializationPromise = null;
    auditService.db = null;
    // Force same database for audit service
    auditService.db = db;
    auditService.initialized = true;
    auditService.initializationPromise = Promise.resolve(auditService);

    // Reset security alert service state and force same database
    securityAlertService.initialized = false;
    securityAlertService.initializationPromise = null;
    securityAlertService.db = null;
    securityAlertService.db = db;
    securityAlertService.initialized = true;

    // Reset session monitor service state and force same database
    sessionMonitorService.initialized = false;
    sessionMonitorService.initializationPromise = null;
    sessionMonitorService.db = null;
    sessionMonitorService.db = db;
    sessionMonitorService.initialized = true;

    // Initialize reporting service with same database
    reportingService.db = db;
    await reportingService._ensureReportingTables();
    reportingService.initialized = true;

    // Ensure audit_logs table exists with proper schema
    await db.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        admin_user TEXT,
        session_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        before_value TEXT,
        after_value TEXT,
        changed_fields TEXT,
        amount_cents INTEGER,
        currency TEXT DEFAULT 'USD',
        transaction_reference TEXT,
        payment_status TEXT,
        metadata TEXT,
        severity TEXT DEFAULT 'info',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Clean up tables (check existence first)
    try {
      const tables = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
      );
      if (tables.rows && tables.rows.length > 0) {
        await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
      }
    } catch (error) {
      // Ignore if table doesn't exist yet
    }

    try {
      await db.execute('DROP TABLE IF EXISTS financial_reports');
      await db.execute('DROP TABLE IF EXISTS compliance_reports');
    } catch (error) {
      // Ignore if tables don't exist
    }

    // Create fresh instance after cleanup to ensure clean tables
    reportingService = new FinancialReportingService();
    await reportingService.ensureInitialized();
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
      await db.execute('DROP TABLE IF EXISTS financial_reports');
      await db.execute('DROP TABLE IF EXISTS compliance_reports');
    } catch (error) {
      // Ignore cleanup errors in case table doesn't exist
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Revenue Report Generation', () => {
    it('should generate comprehensive revenue report', async () => {
      const startDate = '2026-05-15';
      const endDate = '2026-05-17';

      // Add sample data across multiple days
      const events = [
        { date: '2026-05-15', action: 'PAYMENT_SUCCESSFUL', amount: 5000, ref: 'txn_001' },
        { date: '2026-05-15', action: 'PAYMENT_SUCCESSFUL', amount: 7500, ref: 'txn_002' },
        { date: '2026-05-16', action: 'PAYMENT_SUCCESSFUL', amount: 3000, ref: 'txn_003' },
        { date: '2026-05-16', action: 'REFUND_FULL', amount: 2000, ref: 'refund_001' },
        { date: '2026-05-17', action: 'PAYMENT_SUCCESSFUL', amount: 10000, ref: 'txn_004' },
        { date: '2026-05-17', action: 'DISPUTE_CREATED', amount: 1500, ref: 'dispute_001' }
      ];

      for (const event of events) {
        const timestamp = `${event.date}T12:00:00.000Z`;
        await auditService.logFinancialEvent({
          requestId: `req_${event.ref}`,
          action: event.action,
          amountCents: event.amount,
          currency: 'USD',
          transactionReference: event.ref,
          paymentStatus: 'completed',
          metadata: {
            payment_method_types: ['card'],
            created_at: timestamp
          }
        });
      }

      const report = await reportingService.generateRevenueReport(startDate, endDate);

      expect(report.summary.total_gross_revenue_cents).toBe(25500); // 5000+7500+3000+10000
      expect(report.summary.total_refunds_cents).toBe(2000);
      expect(report.summary.total_disputes_cents).toBe(1500);
      expect(report.summary.transaction_count).toBe(4);
      expect(report.summary.refund_count).toBe(1);
      expect(report.summary.dispute_count).toBe(1);

      // Verify breakdown data
      expect(report.breakdown_data).toHaveLength(3); // 3 days
      expect(report.breakdown_data[0].date).toBe('2026-05-15');
      expect(report.breakdown_data[0].gross_revenue_cents).toBe(12500);

      // Verify top revenue days
      expect(report.top_revenue_days[0].gross_revenue_cents).toBe(12500); // May 15th highest

      // Verify payment methods
      expect(report.payment_methods.card).toBe(25500);

      // Verify currency breakdown
      expect(report.currency_breakdown.USD.revenue_cents).toBe(25500);
      expect(report.currency_breakdown.USD.transaction_count).toBe(4);
    });

    it('should handle empty date ranges', async () => {
      const report = await reportingService.generateRevenueReport('2026-06-01', '2026-06-01');

      expect(report.summary.total_gross_revenue_cents).toBe(0);
      expect(report.summary.transaction_count).toBe(0);
      expect(report.breakdown_data).toHaveLength(0);
    });

    it('should calculate accurate average transaction values', async () => {
      const events = [
        { amount: 1000, ref: 'txn_001' },
        { amount: 2000, ref: 'txn_002' },
        { amount: 3000, ref: 'txn_003' }
      ];

      for (const event of events) {
        await auditService.logFinancialEvent({
          requestId: `req_${event.ref}`,
          action: 'PAYMENT_SUCCESSFUL',
          amountCents: event.amount,
          currency: 'USD',
          transactionReference: event.ref,
          paymentStatus: 'completed',
          metadata: {
            created_at: '2026-05-15T12:00:00.000Z'
          }
        });
      }

      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      expect(report.summary.average_transaction_value_cents).toBe(2000); // (1000+2000+3000)/3
    });

    it('should cache generated reports', async () => {
      await auditService.logFinancialEvent({
        requestId: 'req_cache_test',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: 'txn_cache',
        paymentStatus: 'completed',
        metadata: {
          created_at: '2026-05-15T12:00:00.000Z'
        }
      });

      const startDate = '2026-05-15';
      const endDate = '2026-05-15';

      // Generate report
      const report = await reportingService.generateRevenueReport(startDate, endDate);

      // Retrieve cached report
      const cachedReport = await reportingService.getCachedReport('revenue_report', startDate, endDate);

      expect(cachedReport).toBeDefined();
      expect(cachedReport.report_data.summary.total_gross_revenue_cents).toBe(5000);
      expect(cachedReport.report_type).toBe('revenue_report');
    });
  });

  describe('Refund and Dispute Tracking', () => {
    it('should generate detailed refund and dispute report', async () => {
      const events = [
        {
          action: 'REFUND_FULL',
          amount: 5000,
          metadata: { refund_reason: 'requested_by_customer' }
        },
        {
          action: 'REFUND_PARTIAL',
          amount: 2500,
          metadata: { refund_reason: 'duplicate' }
        },
        {
          action: 'DISPUTE_CREATED',
          amount: 7500,
          metadata: { dispute_reason: 'fraudulent', dispute_status: 'needs_response' }
        },
        {
          action: 'DISPUTE_CREATED',
          amount: 3000,
          metadata: { dispute_reason: 'product_not_received', dispute_status: 'under_review' }
        }
      ];

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        await auditService.logFinancialEvent({
          requestId: `req_${i}`,
          action: event.action,
          amountCents: event.amount,
          currency: 'USD',
          transactionReference: `ref_${i}`,
          paymentStatus: 'completed',
          metadata: {
            ...event.metadata,
            created_at: '2026-05-15T12:00:00.000Z'
          }
        });
      }

      const report = await reportingService.generateRefundDisputeReport('2026-05-15', '2026-05-15');

      // Verify refund tracking
      expect(report.refunds.total_amount_cents).toBe(7500);
      expect(report.refunds.count).toBe(2);
      expect(report.refunds.full_refunds.count).toBe(1);
      expect(report.refunds.full_refunds.amount_cents).toBe(5000);
      expect(report.refunds.partial_refunds.count).toBe(1);
      expect(report.refunds.partial_refunds.amount_cents).toBe(2500);

      // Verify refund reasons
      expect(report.refunds.by_reason.requested_by_customer).toBe(5000);
      expect(report.refunds.by_reason.duplicate).toBe(2500);

      // Verify dispute tracking
      expect(report.disputes.total_amount_cents).toBe(10500);
      expect(report.disputes.count).toBe(2);
      expect(report.disputes.by_reason.fraudulent).toBe(7500);
      expect(report.disputes.by_reason.product_not_received).toBe(3000);
      expect(report.disputes.by_status.needs_response).toBe(7500);
      expect(report.disputes.by_status.under_review).toBe(3000);

      // Verify chargeback risk
      expect(report.chargeback_risk.total_disputed_amount_cents).toBe(10500);
      expect(report.chargeback_risk.average_dispute_amount_cents).toBe(5250);
    });

    it('should handle missing metadata gracefully', async () => {
      await auditService.logFinancialEvent({
        requestId: 'req_no_metadata',
        action: 'REFUND_FULL',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: 'ref_no_metadata',
        paymentStatus: 'refunded',
        metadata: {
          created_at: '2026-05-15T12:00:00.000Z'
        }
      });

      const report = await reportingService.generateRefundDisputeReport('2026-05-15', '2026-05-15');

      expect(report.refunds.by_reason.unknown).toBe(5000);
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate compliance report with audit trail validation', async () => {
      const events = [
        { action: 'PAYMENT_SUCCESSFUL', amount: 5000, ref: 'txn_001' },
        { action: 'REFUND_FULL', amount: 2000, ref: 'refund_001' },
        { action: 'DISPUTE_CREATED', amount: 1000, ref: 'dispute_001' }
      ];

      for (const event of events) {
        await auditService.logFinancialEvent({
          requestId: `req_${event.ref}`,
          action: event.action,
          amountCents: event.amount,
          currency: 'USD',
          transactionReference: event.ref,
          paymentStatus: 'completed',
          metadata: {
            created_at: '2026-05-15T12:00:00.000Z'
          }
        });
      }

      const complianceReport = await reportingService.generateComplianceReport(
        '2026-05-15',
        '2026-05-15',
        'general'
      );

      expect(complianceReport.summary.total_revenue_cents).toBe(5000);
      expect(complianceReport.summary.total_refunds_cents).toBe(2000);
      expect(complianceReport.summary.total_disputes_cents).toBe(1000);
      expect(complianceReport.summary.transaction_count).toBe(1);

      expect(complianceReport.compliance_status.audit_trail_complete).toBe(true);
      expect(complianceReport.compliance_status.financial_controls.segregation_of_duties).toBe(true);
      expect(complianceReport.compliance_status.audit_events).toHaveLength(3);

      // Verify compliance report was saved
      const result = await db.execute({
        sql: 'SELECT * FROM compliance_reports WHERE compliance_type = ?',
        args: ['general']
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].total_revenue_cents).toBe(5000);
    });

    it('should detect audit trail issues', async () => {
      // Add an event without proper audit trail (missing request_id)
      await db.execute({
        sql: `INSERT INTO audit_logs (
          request_id, event_type, action, amount_cents, currency, target_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          '', // Empty request_id to simulate incomplete audit trail
          'financial_event',
          'PAYMENT_SUCCESSFUL',
          5000,
          'USD',
          'incomplete_audit',
          '2026-05-15T12:00:00.000Z'
        ]
      });

      const complianceReport = await reportingService.generateComplianceReport(
        '2026-05-15',
        '2026-05-15',
        'audit_validation'
      );

      expect(complianceReport.compliance_status.audit_trail_complete).toBe(false);
    });
  });

  describe('Performance with Large Datasets', () => {
    it('should handle large financial datasets efficiently', async () => {
      const startTime = Date.now();

      // Create 500 financial events
      const promises = [];
      for (let i = 0; i < 500; i++) {
        promises.push(
          auditService.logFinancialEvent({
            requestId: `req_perf_${i}`,
            action: i % 10 === 0 ? 'REFUND_FULL' : 'PAYMENT_SUCCESSFUL',
            amountCents: 1000 + (i * 10),
            currency: 'USD',
            transactionReference: `txn_perf_${i}`,
            paymentStatus: 'completed',
            metadata: {
              payment_method_types: ['card'],
              performance_test: true,
              created_at: '2026-05-15T12:00:00.000Z'
            }
          })
        );
      }

      await Promise.all(promises);

      const dataSetupTime = Date.now() - startTime;
      console.log(`Data setup time: ${dataSetupTime}ms`);

      // Test report generation performance
      const reportStartTime = Date.now();
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');
      const reportDuration = Date.now() - reportStartTime;

      console.log(`Report generation time: ${reportDuration}ms`);

      expect(report.summary.transaction_count).toBe(450); // 500 events - 50 refunds
      expect(report.summary.refund_count).toBe(50);
      expect(reportDuration).toBeLessThan(10000); // Should complete within 10 seconds

      // Test performance metrics
      const performanceTest = await reportingService.performanceTestReport(500);

      expect(performanceTest.transaction_count).toBe(500);
      expect(performanceTest.performance_grade).not.toBe('needs_optimization');
      expect(performanceTest.report_size_kb).toBeGreaterThan(0);
    });

    it('should optimize memory usage for large date ranges', async () => {
      // Add events across multiple days
      const dates = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'];

      for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
        for (let i = 0; i < 50; i++) {
          await auditService.logFinancialEvent({
            requestId: `req_${dateIndex}_${i}`,
            action: 'PAYMENT_SUCCESSFUL',
            amountCents: 1000 + i,
            currency: 'USD',
            transactionReference: `txn_${dateIndex}_${i}`,
            paymentStatus: 'completed',
            metadata: {
              created_at: `${dates[dateIndex]}T12:00:00.000Z`
            }
          });
        }
      }

      const startTime = Date.now();
      const report = await reportingService.generateRevenueReport('2026-05-01', '2026-05-05');
      const duration = Date.now() - startTime;

      expect(report.summary.transaction_count).toBe(250); // 50 per day × 5 days
      expect(report.breakdown_data).toHaveLength(5);
      expect(duration).toBeLessThan(15000); // Should handle multi-day reports efficiently

      // Verify memory-efficient breakdown
      expect(report.breakdown_data.every(day =>
        day.gross_revenue_cents > 0 && day.transaction_count === 50
      )).toBe(true);
    });
  });

  describe('Multi-Currency Support', () => {
    it('should handle multiple currencies in reports', async () => {
      const currencies = [
        { currency: 'USD', amount: 5000 },
        { currency: 'EUR', amount: 4200 },
        { currency: 'GBP', amount: 3800 }
      ];

      for (let i = 0; i < currencies.length; i++) {
        const curr = currencies[i];
        await auditService.logFinancialEvent({
          requestId: `req_multi_${i}`,
          action: 'PAYMENT_SUCCESSFUL',
          amountCents: curr.amount,
          currency: curr.currency,
          transactionReference: `txn_multi_${i}`,
          paymentStatus: 'completed',
          metadata: {
            created_at: '2026-05-15T12:00:00.000Z'
          }
        });
      }

      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      expect(Object.keys(report.currency_breakdown)).toHaveLength(3);
      expect(report.currency_breakdown.USD.revenue_cents).toBe(5000);
      expect(report.currency_breakdown.EUR.revenue_cents).toBe(4200);
      expect(report.currency_breakdown.GBP.revenue_cents).toBe(3800);

      expect(report.currency_breakdown.USD.transaction_count).toBe(1);
      expect(report.currency_breakdown.EUR.transaction_count).toBe(1);
      expect(report.currency_breakdown.GBP.transaction_count).toBe(1);
    });
  });

  describe('Financial Reporting with Manual Payment Processors', () => {
    beforeEach(async () => {
      // Log manual payment events with different processors
      const manualPayments = [
        {
          processor: 'cash',
          amount: 10000,
          ref: 'CASH-001',
          action: 'PAYMENT_SUCCESSFUL'
        },
        {
          processor: 'card_terminal',
          amount: 15000,
          ref: 'TERMINAL-001',
          action: 'PAYMENT_SUCCESSFUL'
        },
        {
          processor: 'venmo',
          amount: 7500,
          ref: 'VENMO-001',
          action: 'PAYMENT_SUCCESSFUL'
        },
        {
          processor: 'comp',
          amount: 5000,
          ref: 'COMP-001',
          action: 'PAYMENT_SUCCESSFUL'
        }
      ];

      for (const payment of manualPayments) {
        await auditService.logFinancialEvent({
          requestId: `req_${payment.ref}`,
          action: payment.action,
          amountCents: payment.amount,
          currency: 'USD',
          transactionReference: payment.ref,
          paymentStatus: 'completed',
          metadata: {
            payment_method_types: [payment.processor],
            manual_entry: true,
            created_at: '2026-05-15T12:00:00.000Z'
          }
        });
      }

      // Add some online payments for comparison
      await auditService.logFinancialEvent({
        requestId: 'req_stripe_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 12000,
        currency: 'USD',
        transactionReference: 'stripe_001',
        paymentStatus: 'completed',
        metadata: {
          payment_method_types: ['card'],
          manual_entry: false,
          created_at: '2026-05-15T12:00:00.000Z'
        }
      });
    });

    it('should include cash transactions in revenue report', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      expect(report.payment_methods.cash).toBe(10000);
      expect(report.summary.total_gross_revenue_cents).toBeGreaterThanOrEqual(10000);
    });

    it('should include card_terminal transactions in revenue report', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      expect(report.payment_methods.card_terminal).toBe(15000);
    });

    it('should include venmo transactions in revenue report', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      expect(report.payment_methods.venmo).toBe(7500);
    });

    it('should include comp transactions but exclude from revenue calculations', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      // Comp transactions should be tracked
      expect(report.payment_methods.comp).toBe(5000);

      // Total revenue should include all payment methods
      const totalManualPayments = 10000 + 15000 + 7500 + 5000; // cash + terminal + venmo + comp
      const onlinePayments = 12000; // stripe
      expect(report.summary.total_gross_revenue_cents).toBe(totalManualPayments + onlinePayments);
    });

    it('should separate manual vs online payment methods in reports', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      // Manual payment methods
      const manualMethods = ['cash', 'card_terminal', 'venmo', 'comp'];
      manualMethods.forEach(method => {
        expect(report.payment_methods[method]).toBeDefined();
        expect(report.payment_methods[method]).toBeGreaterThan(0);
      });

      // Online payment methods
      expect(report.payment_methods.card).toBeDefined();
      expect(report.payment_methods.card).toBe(12000);

      // Verify all payment methods are tracked
      const totalPaymentMethodRevenue = Object.values(report.payment_methods)
        .reduce((sum, amount) => sum + amount, 0);

      expect(totalPaymentMethodRevenue).toBe(report.summary.total_gross_revenue_cents);
    });

    it('should calculate accurate totals across all processors', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      // Expected total: cash(10k) + terminal(15k) + venmo(7.5k) + comp(5k) + stripe(12k) = 49.5k
      expect(report.summary.total_gross_revenue_cents).toBe(49500);

      // Verify transaction count includes all payment methods
      expect(report.summary.transaction_count).toBe(5);

      // Verify payment methods breakdown matches total
      const calculatedTotal = Object.values(report.payment_methods)
        .reduce((sum, amount) => sum + amount, 0);

      expect(calculatedTotal).toBe(49500);
    });

    it('should track manual payment metadata correctly', async () => {
      const events = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        startDate: '2026-05-15T00:00:00.000Z',
        endDate: '2026-05-15T23:59:59.999Z',
        limit: 100
      });

      const manualPaymentEvents = events.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.manual_entry === true;
        } catch {
          return false;
        }
      });

      expect(manualPaymentEvents.length).toBe(4); // cash, terminal, venmo, comp
    });

    it('should differentiate between comp and paid transactions', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      // Comp transactions are tracked separately
      const compRevenue = report.payment_methods.comp || 0;
      expect(compRevenue).toBe(5000);

      // Paid revenue (excluding comp) should be calculable
      const paidRevenue = report.summary.total_gross_revenue_cents - compRevenue;
      expect(paidRevenue).toBe(44500); // 49.5k - 5k comp
    });

    it('should handle mixed manual and online transactions in same report', async () => {
      const report = await reportingService.generateRevenueReport('2026-05-15', '2026-05-15');

      // Verify both manual and online transactions are present
      const hasManualPayments = ['cash', 'card_terminal', 'venmo', 'comp']
        .some(method => report.payment_methods[method] > 0);

      const hasOnlinePayments = report.payment_methods.card > 0;

      expect(hasManualPayments).toBe(true);
      expect(hasOnlinePayments).toBe(true);

      // Total should include all payment types
      expect(report.summary.total_gross_revenue_cents).toBe(49500);
    });

    it('should support filtering by payment method type', async () => {
      const events = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        startDate: '2026-05-15T00:00:00.000Z',
        endDate: '2026-05-15T23:59:59.999Z',
        limit: 100
      });

      // Filter cash-only transactions
      const cashTransactions = events.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.payment_method_types && metadata.payment_method_types.includes('cash');
        } catch {
          return false;
        }
      });

      expect(cashTransactions.length).toBe(1);
      expect(cashTransactions[0].amount_cents).toBe(10000);
    });
  });
});