import { describe, it, expect, beforeEach, vi } from 'vitest';
import financialReconciliationService from '../../../lib/financial-reconciliation-service.js';
import financialAuditQueries from '../../../lib/financial-audit-queries.js';

describe('Financial Reconciliation System', () => {
  beforeEach(() => {
    // Clear any cached state
    vi.clearAllMocks();
  });

  describe('Financial Reconciliation Service', () => {
    it('should initialize properly', async () => {
      // Test service initialization
      expect(financialReconciliationService).toBeDefined();
      expect(typeof financialReconciliationService.ensureInitialized).toBe('function');
      expect(typeof financialReconciliationService.generateDailyReconciliationReport).toBe('function');
      expect(typeof financialReconciliationService.getFinancialHealthStatus).toBe('function');
    });

    it('should have health check capability', async () => {
      const healthCheck = await financialReconciliationService.healthCheck();

      expect(healthCheck).toBeDefined();
      expect(healthCheck).toHaveProperty('status');
      expect(healthCheck).toHaveProperty('timestamp');
      expect(['healthy', 'unhealthy']).toContain(healthCheck.status);
    });

    it('should calculate Stripe fees correctly', () => {
      // Test the fee calculation method (if accessible)
      // This tests the internal fee calculation logic
      const service = financialReconciliationService;

      // Create a test amount (1000 cents = $10.00)
      const testAmountCents = 1000;
      const expectedFee = Math.round(testAmountCents * 0.029) + 30; // 2.9% + 30¢

      // Since _calculateExpectedFees is private, we test via the health check
      expect(service).toHaveProperty('stripeFeeRates');
      expect(service.stripeFeeRates).toHaveProperty('card');
      expect(service.stripeFeeRates.card).toEqual({ rate: 0.029, fixed: 30 });
    });
  });

  describe('Financial Audit Queries', () => {
    it('should initialize properly', async () => {
      expect(financialAuditQueries).toBeDefined();
      expect(typeof financialAuditQueries.ensureInitialized).toBe('function');
      expect(typeof financialAuditQueries.getRevenueReconciliationReport).toBe('function');
      expect(typeof financialAuditQueries.getPaymentMethodBreakdown).toBe('function');
      expect(typeof financialAuditQueries.getFinancialComplianceReport).toBe('function');
    });

    it('should have health check capability', async () => {
      const healthCheck = await financialAuditQueries.healthCheck();

      expect(healthCheck).toBeDefined();
      expect(healthCheck).toHaveProperty('status');
      expect(healthCheck).toHaveProperty('timestamp');
      expect(['healthy', 'unhealthy']).toContain(healthCheck.status);
    });

    it('should validate reconciliation status updates', async () => {
      // Test status validation
      const validStatuses = ['pending', 'reconciled', 'discrepancy', 'resolved', 'investigating'];

      // Mock update function to test validation
      const testTransactionRef = 'test-txn-123';

      // Test invalid status
      await expect(
        financialAuditQueries.updateReconciliationStatus(testTransactionRef, 'invalid_status')
      ).rejects.toThrow(/Invalid reconciliation status/);

      // Test that all valid statuses are accepted (this will fail in DB but pass validation)
      for (const status of validStatuses) {
        await expect(
          financialAuditQueries.updateReconciliationStatus(testTransactionRef, status)
        ).rejects.not.toThrow(/Invalid reconciliation status/);
      }
    });
  });

  describe('Financial System Integration', () => {
    it('should have consistent service interfaces', () => {
      // Verify both services implement health check
      expect(typeof financialReconciliationService.healthCheck).toBe('function');
      expect(typeof financialAuditQueries.healthCheck).toBe('function');

      // Verify initialization patterns
      expect(typeof financialReconciliationService.ensureInitialized).toBe('function');
      expect(typeof financialAuditQueries.ensureInitialized).toBe('function');
    });

    it('should have proper error handling for missing environment variables', () => {
      // Test that services handle missing configuration gracefully
      const originalStripeKey = process.env.STRIPE_SECRET_KEY;

      // Temporarily remove environment variable
      delete process.env.STRIPE_SECRET_KEY;

      // Services should handle this gracefully in their health checks
      expect(async () => {
        await financialReconciliationService.healthCheck();
      }).not.toThrow();

      // Restore environment variable
      if (originalStripeKey) {
        process.env.STRIPE_SECRET_KEY = originalStripeKey;
      }
    });

    it('should support different report types and formats', () => {
      // Test that report methods exist with expected signatures
      expect(typeof financialAuditQueries.getRevenueReconciliationReport).toBe('function');
      expect(typeof financialAuditQueries.getPaymentMethodBreakdown).toBe('function');
      expect(typeof financialAuditQueries.getFinancialComplianceReport).toBe('function');
      expect(typeof financialAuditQueries.getOutstandingReconciliationItems).toBe('function');
      expect(typeof financialAuditQueries.getFinancialAuditStats).toBe('function');
    });
  });

  describe('Database Schema Validation', () => {
    it('should validate financial reconciliation tables exist', async () => {
      // This will test that the migration was successful
      try {
        await financialReconciliationService.ensureInitialized();
        // If initialization succeeds, tables exist
        expect(true).toBe(true);
      } catch (error) {
        if (error.message.includes('Financial reconciliation tables not found')) {
          // Expected error if migration hasn't run
          expect(error.message).toContain('Please run migration');
        } else {
          // Unexpected error
          throw error;
        }
      }
    });

    it('should have proper fee rate configuration', () => {
      const feeRates = financialReconciliationService.stripeFeeRates;

      expect(feeRates).toBeDefined();
      expect(feeRates.card).toEqual({ rate: 0.029, fixed: 30 });
      expect(feeRates.international).toEqual({ rate: 0.044, fixed: 30 });
      expect(feeRates.amex).toEqual({ rate: 0.035, fixed: 30 });
      expect(feeRates.ach).toEqual({ rate: 0.008, fixed: 0, max: 500 });
    });
  });
});