/**
 * Financial Reconciliation Tests
 * Tests daily reconciliation calculations, discrepancy detection, and settlement tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import auditService from '../../lib/audit-service.js';

// Mock Financial Reconciliation Service
class FinancialReconciliationService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async ensureInitialized() {
    if (!this.initialized) {
      this.db = await getDatabaseClient();
      await this._ensureReconciliationTables();
      this.initialized = true;
    }
    return this;
  }

  async _ensureReconciliationTables() {
    // Create reconciliation tracking table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS daily_reconciliation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_date DATE NOT NULL UNIQUE,
        total_gross_revenue_cents INTEGER NOT NULL DEFAULT 0,
        total_fees_cents INTEGER NOT NULL DEFAULT 0,
        total_net_revenue_cents INTEGER NOT NULL DEFAULT 0,
        total_refunds_cents INTEGER NOT NULL DEFAULT 0,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        refund_count INTEGER NOT NULL DEFAULT 0,
        stripe_settlement_amount_cents INTEGER,
        discrepancy_cents INTEGER DEFAULT 0,
        reconciliation_status TEXT DEFAULT 'pending' CHECK (reconciliation_status IN ('pending', 'reconciled', 'discrepancy', 'failed')),
        stripe_payout_id TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create settlement tracking table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settlement_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payout_id TEXT NOT NULL UNIQUE,
        arrival_date DATE NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT DEFAULT 'USD',
        method TEXT DEFAULT 'standard',
        status TEXT DEFAULT 'pending',
        stripe_fees_cents INTEGER DEFAULT 0,
        transaction_fees_cents INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create discrepancy tracking table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_date DATE NOT NULL,
        discrepancy_type TEXT NOT NULL,
        expected_amount_cents INTEGER NOT NULL,
        actual_amount_cents INTEGER NOT NULL,
        difference_cents INTEGER NOT NULL,
        description TEXT,
        resolved BOOLEAN DEFAULT FALSE,
        resolution_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
  }

  /**
   * Calculate daily reconciliation for a specific date
   */
  async calculateDailyReconciliation(reconciliationDate) {
    await this.ensureInitialized();

    const dateStr = reconciliationDate;
    const nextDay = new Date(reconciliationDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];

    // Get all financial events for the day
    const events = await auditService.queryAuditLogs({
      eventType: 'financial_event',
      limit: 1000
    });

    let totalGrossRevenue = 0;
    let totalRefunds = 0;
    let transactionCount = 0;
    let refundCount = 0;
    const processedTransactions = new Set();

    for (const event of events.logs) {
      const amount = event.amount_cents || 0;

      switch (event.action) {
        case 'PAYMENT_SUCCESSFUL':
        case 'ASYNC_PAYMENT_SUCCESSFUL':
          if (!processedTransactions.has(event.transaction_reference)) {
            totalGrossRevenue += amount;
            transactionCount++;
            processedTransactions.add(event.transaction_reference);
          }
          break;

        case 'REFUND_FULL':
        case 'REFUND_PARTIAL':
          totalRefunds += amount;
          refundCount++;
          break;
      }
    }

    // Calculate Stripe fees (estimate: 2.9% + 30¢ per transaction)
    const estimatedFees = Math.round(totalGrossRevenue * 0.029) + (transactionCount * 30);
    const netRevenue = totalGrossRevenue - estimatedFees - totalRefunds;

    const reconciliation = {
      reconciliation_date: dateStr,
      total_gross_revenue_cents: totalGrossRevenue,
      total_fees_cents: estimatedFees,
      total_net_revenue_cents: netRevenue,
      total_refunds_cents: totalRefunds,
      transaction_count: transactionCount,
      refund_count: refundCount,
      reconciliation_status: 'pending'
    };

    // Save reconciliation record
    await this.db.execute({
      sql: `INSERT OR REPLACE INTO daily_reconciliation (
        reconciliation_date, total_gross_revenue_cents, total_fees_cents,
        total_net_revenue_cents, total_refunds_cents, transaction_count,
        refund_count, reconciliation_status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        reconciliation.reconciliation_date,
        reconciliation.total_gross_revenue_cents,
        reconciliation.total_fees_cents,
        reconciliation.total_net_revenue_cents,
        reconciliation.total_refunds_cents,
        reconciliation.transaction_count,
        reconciliation.refund_count,
        reconciliation.reconciliation_status,
        new Date().toISOString()
      ]
    });

    return reconciliation;
  }

  /**
   * Detect discrepancies between calculated and actual amounts
   */
  async detectDiscrepancies(reconciliationDate, actualSettlementAmount) {
    await this.ensureInitialized();

    const reconciliation = await this.getReconciliation(reconciliationDate);
    if (!reconciliation) {
      throw new Error(`No reconciliation found for date: ${reconciliationDate}`);
    }

    const expectedAmount = reconciliation.total_net_revenue_cents;
    const discrepancy = actualSettlementAmount - expectedAmount;

    // Threshold for discrepancy detection (1% or $5, whichever is smaller)
    const threshold = Math.min(Math.abs(expectedAmount * 0.01), 500);

    if (Math.abs(discrepancy) > threshold) {
      // Record discrepancy
      await this.db.execute({
        sql: `INSERT INTO reconciliation_discrepancies (
          reconciliation_date, discrepancy_type, expected_amount_cents,
          actual_amount_cents, difference_cents, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          reconciliationDate,
          discrepancy > 0 ? 'overpayment' : 'underpayment',
          expectedAmount,
          actualSettlementAmount,
          discrepancy,
          `Settlement amount differs from calculated net revenue by ${Math.abs(discrepancy)} cents`
        ]
      });

      // Update reconciliation status
      await this.db.execute({
        sql: `UPDATE daily_reconciliation
              SET reconciliation_status = 'discrepancy',
                  discrepancy_cents = ?,
                  stripe_settlement_amount_cents = ?,
                  updated_at = ?
              WHERE reconciliation_date = ?`,
        args: [discrepancy, actualSettlementAmount, new Date().toISOString(), reconciliationDate]
      });

      return { hasDiscrepancy: true, discrepancy, threshold };
    } else {
      // Mark as reconciled
      await this.db.execute({
        sql: `UPDATE daily_reconciliation
              SET reconciliation_status = 'reconciled',
                  stripe_settlement_amount_cents = ?,
                  updated_at = ?
              WHERE reconciliation_date = ?`,
        args: [actualSettlementAmount, new Date().toISOString(), reconciliationDate]
      });

      return { hasDiscrepancy: false, discrepancy, threshold };
    }
  }

  /**
   * Track Stripe settlement/payout
   */
  async trackSettlement(payoutData) {
    await this.ensureInitialized();

    const settlement = {
      payout_id: payoutData.id,
      arrival_date: new Date(payoutData.arrival_date * 1000).toISOString().split('T')[0],
      amount_cents: payoutData.amount,
      currency: payoutData.currency.toUpperCase(),
      method: payoutData.method,
      status: payoutData.status,
      stripe_fees_cents: payoutData.automatic ? 0 : 25, // $0.25 for manual payouts
      transaction_fees_cents: 0 // Calculated separately
    };

    await this.db.execute({
      sql: `INSERT OR REPLACE INTO settlement_tracking (
        payout_id, arrival_date, amount_cents, currency, method, status,
        stripe_fees_cents, transaction_fees_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        settlement.payout_id,
        settlement.arrival_date,
        settlement.amount_cents,
        settlement.currency,
        settlement.method,
        settlement.status,
        settlement.stripe_fees_cents,
        settlement.transaction_fees_cents
      ]
    });

    // Try to reconcile with existing daily reconciliation
    const reconciliation = await this.getReconciliation(settlement.arrival_date);
    if (reconciliation) {
      await this.detectDiscrepancies(settlement.arrival_date, settlement.amount_cents);
    }

    return settlement;
  }

  /**
   * Calculate fee accuracy
   */
  async validateFeeCalculations(reconciliationDate) {
    await this.ensureInitialized();

    const reconciliation = await this.getReconciliation(reconciliationDate);
    if (!reconciliation) {
      throw new Error(`No reconciliation found for date: ${reconciliationDate}`);
    }

    // Get actual fee data from audit logs
    const events = await auditService.queryAuditLogs({
      eventType: 'financial_event',
      limit: 1000
    });

    let actualFeesFromMetadata = 0;
    let transactionsWithFeeData = 0;

    for (const event of events.logs) {
      if (event.metadata) {
        try {
          const metadata = JSON.parse(event.metadata);
          if (metadata.stripe_fees_cents) {
            actualFeesFromMetadata += metadata.stripe_fees_cents;
            transactionsWithFeeData++;
          }
        } catch (e) {
          // Ignore malformed metadata
        }
      }
    }

    const estimatedFees = reconciliation.total_fees_cents;
    const feeAccuracy = actualFeesFromMetadata > 0
      ? Math.abs(estimatedFees - actualFeesFromMetadata) / actualFeesFromMetadata
      : null;

    return {
      estimated_fees: estimatedFees,
      actual_fees: actualFeesFromMetadata,
      fee_accuracy: feeAccuracy,
      transactions_with_fee_data: transactionsWithFeeData,
      total_transactions: reconciliation.transaction_count
    };
  }

  /**
   * Automated reconciliation status updates
   */
  async updateReconciliationStatus(reconciliationDate, status, notes = null) {
    await this.ensureInitialized();

    await this.db.execute({
      sql: `UPDATE daily_reconciliation
            SET reconciliation_status = ?, notes = ?, updated_at = ?
            WHERE reconciliation_date = ?`,
      args: [status, notes, new Date().toISOString(), reconciliationDate]
    });

    return { updated: true, status, notes };
  }

  /**
   * Get reconciliation data
   */
  async getReconciliation(date) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: 'SELECT * FROM daily_reconciliation WHERE reconciliation_date = ?',
      args: [date]
    });

    return result.rows[0] || null;
  }

  /**
   * Get all discrepancies
   */
  async getDiscrepancies(resolved = null) {
    await this.ensureInitialized();

    let sql = 'SELECT * FROM reconciliation_discrepancies';
    const args = [];

    if (resolved !== null) {
      sql += ' WHERE resolved = ?';
      args.push(resolved);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await this.db.execute({ sql, args });
    return result.rows;
  }
}

describe('Financial Reconciliation Tests', () => {
  let db;
  let reconciliationService;

  beforeEach(async () => {
    db = await getDatabaseClient();
    reconciliationService = new FinancialReconciliationService();

    // Initialize services first (creates tables if needed)
    await auditService.ensureInitialized();
    await reconciliationService.ensureInitialized();

    // Clean up tables
    try {
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
    } catch (error) {
      // Ignore if table doesn't exist yet
    }

    try {
      await db.execute('DROP TABLE IF EXISTS daily_reconciliation');
      await db.execute('DROP TABLE IF EXISTS settlement_tracking');
      await db.execute('DROP TABLE IF EXISTS reconciliation_discrepancies');
    } catch (error) {
      // Ignore if tables don't exist
    }

    // Create fresh instance after cleanup to ensure clean tables
    reconciliationService = new FinancialReconciliationService();
    await reconciliationService.ensureInitialized();
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
      await db.execute('DROP TABLE IF EXISTS daily_reconciliation');
      await db.execute('DROP TABLE IF EXISTS settlement_tracking');
      await db.execute('DROP TABLE IF EXISTS reconciliation_discrepancies');
    } catch (error) {
      // Ignore cleanup errors in case table doesn't exist
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Daily Reconciliation Calculations', () => {
    it('should calculate daily reconciliation correctly', async () => {
      const reconciliationDate = '2026-05-15';

      // Add sample financial events for the day
      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: 'txn_001',
        paymentStatus: 'completed'
      });

      await auditService.logFinancialEvent({
        requestId: 'req_002',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 7500,
        currency: 'USD',
        transactionReference: 'txn_002',
        paymentStatus: 'completed'
      });

      await auditService.logFinancialEvent({
        requestId: 'req_003',
        action: 'REFUND_FULL',
        amountCents: 2500,
        currency: 'USD',
        transactionReference: 'refund_001',
        paymentStatus: 'refunded'
      });

      const reconciliation = await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      expect(reconciliation.total_gross_revenue_cents).toBe(12500); // $125.00
      expect(reconciliation.total_refunds_cents).toBe(2500); // $25.00
      expect(reconciliation.transaction_count).toBe(2);
      expect(reconciliation.refund_count).toBe(1);

      // Verify fee calculation (2.9% + 30¢ per transaction)
      const expectedFees = Math.round(12500 * 0.029) + (2 * 30); // $3.63 + $0.60 = $4.23
      expect(reconciliation.total_fees_cents).toBe(expectedFees);

      // Net revenue = gross - fees - refunds
      const expectedNet = 12500 - expectedFees - 2500;
      expect(reconciliation.total_net_revenue_cents).toBe(expectedNet);

      expect(reconciliation.reconciliation_status).toBe('pending');
    });

    it('should handle empty reconciliation day', async () => {
      const reconciliationDate = '2026-05-16';

      const reconciliation = await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      expect(reconciliation.total_gross_revenue_cents).toBe(0);
      expect(reconciliation.total_refunds_cents).toBe(0);
      expect(reconciliation.transaction_count).toBe(0);
      expect(reconciliation.refund_count).toBe(0);
      expect(reconciliation.total_fees_cents).toBe(0);
      expect(reconciliation.total_net_revenue_cents).toBe(0);
    });

    it('should not double-count duplicate transactions', async () => {
      const reconciliationDate = '2026-05-17';

      // Add duplicate events for same transaction
      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        transactionReference: 'txn_duplicate',
        paymentStatus: 'completed'
      });

      await auditService.logFinancialEvent({
        requestId: 'req_002',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        transactionReference: 'txn_duplicate', // Same transaction reference
        paymentStatus: 'completed'
      });

      const reconciliation = await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      expect(reconciliation.total_gross_revenue_cents).toBe(5000); // Should only count once
      expect(reconciliation.transaction_count).toBe(1);
    });
  });

  describe('Discrepancy Detection', () => {
    it('should detect significant discrepancy', async () => {
      const reconciliationDate = '2026-05-18';

      // Create reconciliation with expected amount
      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 10000,
        transactionReference: 'txn_001',
        paymentStatus: 'completed'
      });

      await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      // Simulate Stripe settlement with different amount
      const actualSettlement = 8000; // $20 less than expected
      const result = await reconciliationService.detectDiscrepancies(reconciliationDate, actualSettlement);

      expect(result.hasDiscrepancy).toBe(true);
      expect(Math.abs(result.discrepancy)).toBeGreaterThan(result.threshold);

      // Verify discrepancy was recorded
      const discrepancies = await reconciliationService.getDiscrepancies();
      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].discrepancy_type).toBe('underpayment');
      expect(discrepancies[0].difference_cents).toBeLessThan(0);

      // Verify reconciliation status updated
      const reconciliation = await reconciliationService.getReconciliation(reconciliationDate);
      expect(reconciliation.reconciliation_status).toBe('discrepancy');
    });

    it('should not flag minor discrepancies within threshold', async () => {
      const reconciliationDate = '2026-05-19';

      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 10000,
        transactionReference: 'txn_001',
        paymentStatus: 'completed'
      });

      await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      // Simulate settlement with minor difference (within 1% threshold)
      const reconciliation = await reconciliationService.getReconciliation(reconciliationDate);
      const actualSettlement = reconciliation.total_net_revenue_cents - 50; // $0.50 difference

      const result = await reconciliationService.detectDiscrepancies(reconciliationDate, actualSettlement);

      expect(result.hasDiscrepancy).toBe(false);

      // Verify no discrepancy recorded
      const discrepancies = await reconciliationService.getDiscrepancies();
      expect(discrepancies).toHaveLength(0);

      // Verify status set to reconciled
      const updatedReconciliation = await reconciliationService.getReconciliation(reconciliationDate);
      expect(updatedReconciliation.reconciliation_status).toBe('reconciled');
    });

    it('should handle overpayment discrepancies', async () => {
      const reconciliationDate = '2026-05-20';

      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        transactionReference: 'txn_001',
        paymentStatus: 'completed'
      });

      await reconciliationService.calculateDailyReconciliation(reconciliationDate);
      const reconciliation = await reconciliationService.getReconciliation(reconciliationDate);

      // Simulate higher settlement amount
      const actualSettlement = reconciliation.total_net_revenue_cents + 1000; // $10 more

      const result = await reconciliationService.detectDiscrepancies(reconciliationDate, actualSettlement);

      expect(result.hasDiscrepancy).toBe(true);
      expect(result.discrepancy).toBeGreaterThan(0);

      const discrepancies = await reconciliationService.getDiscrepancies();
      expect(discrepancies[0].discrepancy_type).toBe('overpayment');
    });
  });

  describe('Settlement Tracking', () => {
    it('should track Stripe payout correctly', async () => {
      const payoutData = {
        id: 'po_test_payout_001',
        arrival_date: Math.floor(Date.now() / 1000), // Current timestamp
        amount: 47500, // $475.00
        currency: 'usd',
        method: 'standard',
        status: 'paid',
        automatic: true
      };

      const settlement = await reconciliationService.trackSettlement(payoutData);

      expect(settlement.payout_id).toBe('po_test_payout_001');
      expect(settlement.amount_cents).toBe(47500);
      expect(settlement.currency).toBe('USD');
      expect(settlement.method).toBe('standard');
      expect(settlement.status).toBe('paid');
      expect(settlement.stripe_fees_cents).toBe(0); // Automatic payout

      // Verify settlement was saved
      const result = await db.execute({
        sql: 'SELECT * FROM settlement_tracking WHERE payout_id = ?',
        args: ['po_test_payout_001']
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].amount_cents).toBe(47500);
    });

    it('should handle manual payout fees', async () => {
      const payoutData = {
        id: 'po_manual_001',
        arrival_date: Math.floor(Date.now() / 1000),
        amount: 50000,
        currency: 'usd',
        method: 'instant',
        status: 'paid',
        automatic: false // Manual payout
      };

      const settlement = await reconciliationService.trackSettlement(payoutData);

      expect(settlement.stripe_fees_cents).toBe(25); // $0.25 for manual payouts
    });

    it('should automatically reconcile with existing daily data', async () => {
      const reconciliationDate = new Date().toISOString().split('T')[0];

      // Create daily reconciliation first
      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        transactionReference: 'txn_001',
        paymentStatus: 'completed'
      });

      await reconciliationService.calculateDailyReconciliation(reconciliationDate);
      const reconciliation = await reconciliationService.getReconciliation(reconciliationDate);

      // Track settlement for same date
      const payoutData = {
        id: 'po_auto_reconcile_001',
        arrival_date: Math.floor(Date.now() / 1000),
        amount: reconciliation.total_net_revenue_cents, // Exact match
        currency: 'usd',
        method: 'standard',
        status: 'paid',
        automatic: true
      };

      await reconciliationService.trackSettlement(payoutData);

      // Check that reconciliation was automatically updated
      const updatedReconciliation = await reconciliationService.getReconciliation(reconciliationDate);
      expect(updatedReconciliation.reconciliation_status).toBe('reconciled');
      expect(updatedReconciliation.stripe_settlement_amount_cents).toBe(reconciliation.total_net_revenue_cents);
    });
  });

  describe('Fee Calculation Accuracy', () => {
    it('should validate fee calculations with actual data', async () => {
      const reconciliationDate = '2026-05-21';

      // Add events with fee metadata
      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        transactionReference: 'txn_001',
        paymentStatus: 'completed',
        metadata: {
          stripe_fees_cents: 175 // Actual fee: $1.75
        }
      });

      await auditService.logFinancialEvent({
        requestId: 'req_002',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 7500,
        transactionReference: 'txn_002',
        paymentStatus: 'completed',
        metadata: {
          stripe_fees_cents: 248 // Actual fee: $2.48
        }
      });

      await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      const feeValidation = await reconciliationService.validateFeeCalculations(reconciliationDate);

      expect(feeValidation.actual_fees).toBe(423); // $1.75 + $2.48 = $4.23
      expect(feeValidation.transactions_with_fee_data).toBe(2);
      expect(feeValidation.total_transactions).toBe(2);
      expect(feeValidation.fee_accuracy).toBeLessThan(0.05); // Less than 5% difference
    });

    it('should handle missing fee data gracefully', async () => {
      const reconciliationDate = '2026-05-22';

      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        transactionReference: 'txn_001',
        paymentStatus: 'completed'
        // No fee metadata
      });

      await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      const feeValidation = await reconciliationService.validateFeeCalculations(reconciliationDate);

      expect(feeValidation.actual_fees).toBe(0);
      expect(feeValidation.transactions_with_fee_data).toBe(0);
      expect(feeValidation.total_transactions).toBe(1);
      expect(feeValidation.fee_accuracy).toBe(null);
    });
  });

  describe('Automated Status Updates', () => {
    it('should update reconciliation status and notes', async () => {
      const reconciliationDate = '2026-05-23';

      // Create reconciliation
      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        transactionReference: 'txn_001',
        paymentStatus: 'completed'
      });

      await reconciliationService.calculateDailyReconciliation(reconciliationDate);

      // Update status
      const result = await reconciliationService.updateReconciliationStatus(
        reconciliationDate,
        'reconciled',
        'Manually verified and approved'
      );

      expect(result.updated).toBe(true);
      expect(result.status).toBe('reconciled');

      // Verify update
      const reconciliation = await reconciliationService.getReconciliation(reconciliationDate);
      expect(reconciliation.reconciliation_status).toBe('reconciled');
      expect(reconciliation.notes).toBe('Manually verified and approved');
    });
  });

  describe('Performance with Large Datasets', () => {
    it('should handle reconciliation with many transactions efficiently', async () => {
      const reconciliationDate = '2026-05-24';

      // Create 100 transactions
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          auditService.logFinancialEvent({
            requestId: `req_${i}`,
            action: 'PAYMENT_SUCCESSFUL',
            amountCents: 1000 + (i * 10), // Varying amounts
            transactionReference: `txn_${i}`,
            paymentStatus: 'completed'
          })
        );
      }

      await Promise.all(promises);

      const startTime = Date.now();
      const reconciliation = await reconciliationService.calculateDailyReconciliation(reconciliationDate);
      const duration = Date.now() - startTime;

      expect(reconciliation.transaction_count).toBe(100);
      expect(reconciliation.total_gross_revenue_cents).toBe(
        100 * 1000 + (99 * 100 * 10) / 2 // Sum of arithmetic sequence
      );
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});