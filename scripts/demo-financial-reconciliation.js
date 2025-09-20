#!/usr/bin/env node

/**
 * Financial Reconciliation System Demo
 *
 * This script demonstrates the key features of the financial reconciliation system:
 * - Health check validation
 * - Service initialization
 * - Report structure examples
 * - API endpoint testing (if admin credentials available)
 *
 * Usage:
 * node scripts/demo-financial-reconciliation.js
 */

import financialReconciliationService from '../lib/financial-reconciliation-service.js';
import financialAuditQueries from '../lib/financial-audit-queries.js';
import { logger } from '../lib/logger.js';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runDemo() {
  colorLog('cyan', '\n🏦 Financial Reconciliation System Demo');
  colorLog('cyan', '=====================================\n');

  try {
    // 1. Test Service Health Checks
    colorLog('blue', '1. Testing Service Health Checks');
    colorLog('blue', '--------------------------------');

    console.log('Checking Financial Reconciliation Service...');
    const reconHealth = await financialReconciliationService.healthCheck();

    if (reconHealth.status === 'healthy') {
      colorLog('green', '✅ Financial Reconciliation Service: HEALTHY');
      console.log(`   - Database Connected: ${reconHealth.database_connected}`);
      console.log(`   - Stripe Connected: ${reconHealth.stripe_connected}`);
      console.log(`   - Total Reports: ${reconHealth.total_reports}`);
    } else {
      colorLog('red', '❌ Financial Reconciliation Service: UNHEALTHY');
      console.log(`   - Error: ${reconHealth.error}`);
    }

    console.log('\nChecking Financial Audit Queries Service...');
    const auditHealth = await financialAuditQueries.healthCheck();

    if (auditHealth.status === 'healthy') {
      colorLog('green', '✅ Financial Audit Queries Service: HEALTHY');
      console.log(`   - Database Connected: ${auditHealth.database_connected}`);
      console.log(`   - Financial Events: ${auditHealth.financial_events_count}`);
    } else {
      colorLog('red', '❌ Financial Audit Queries Service: UNHEALTHY');
      console.log(`   - Error: ${auditHealth.error}`);
    }

    // 2. Test Financial Health Status
    colorLog('blue', '\n2. Financial Health Status');
    colorLog('blue', '--------------------------');

    try {
      const healthStatus = await financialReconciliationService.getFinancialHealthStatus();

      console.log(`Overall Status: ${healthStatus.status.toUpperCase()}`);
      console.log(`Reconciliation Rate: ${healthStatus.reconciliation_rate}%`);
      console.log(`Unreconciled Transactions: ${healthStatus.unreconciled_transactions}`);
      console.log(`Total Unresolved Discrepancies: ${healthStatus.unresolved_discrepancies.total}`);

      if (healthStatus.recent_reports.length > 0) {
        console.log('\nRecent Reports:');
        healthStatus.recent_reports.slice(0, 3).forEach((report, index) => {
          console.log(`  ${index + 1}. ${report.report_date}: ${report.reconciliation_status}`);
        });
      }
    } catch (error) {
      colorLog('yellow', `⚠️  Financial health check failed: ${error.message}`);
    }

    // 3. Test Audit Statistics
    colorLog('blue', '\n3. Financial Audit Statistics');
    colorLog('blue', '-----------------------------');

    try {
      const auditStats = await financialAuditQueries.getFinancialAuditStats('24h');

      console.log('Last 24 Hours Summary:');
      console.log(`  Total Financial Events: ${auditStats.raw_stats.total_financial_events}`);
      console.log(`  Unique Transactions: ${auditStats.raw_stats.unique_transactions}`);
      console.log(`  Total Volume: $${(auditStats.raw_stats.total_volume_cents / 100).toFixed(2)}`);
      console.log(`  Completed Payments: ${auditStats.raw_stats.completed_payments}`);
      console.log(`  Failed Payments: ${auditStats.raw_stats.failed_payments}`);
      console.log(`  Refunds: ${auditStats.raw_stats.refunds}`);
      console.log(`  Disputes: ${auditStats.raw_stats.disputes}`);

      console.log('\nCalculated Metrics:');
      console.log(`  Reconciliation Rate: ${auditStats.calculated_metrics.reconciliation_rate}%`);
      console.log(`  Success Rate: ${auditStats.calculated_metrics.success_rate}%`);
      console.log(`  Effective Fee Rate: ${auditStats.calculated_metrics.effective_fee_rate}%`);
      console.log(`  Average Transaction: $${auditStats.calculated_metrics.avg_transaction_value}`);

      console.log('\nHealth Indicators:');
      console.log(`  Reconciliation Health: ${auditStats.health_indicators.reconciliation_health.toUpperCase()}`);
      console.log(`  Payment Health: ${auditStats.health_indicators.payment_health.toUpperCase()}`);
      console.log(`  Dispute Health: ${auditStats.health_indicators.dispute_health.toUpperCase()}`);

    } catch (error) {
      colorLog('yellow', `⚠️  Audit statistics failed: ${error.message}`);
    }

    // 4. Test Outstanding Reconciliation Items
    colorLog('blue', '\n4. Outstanding Reconciliation Items');
    colorLog('blue', '----------------------------------');

    try {
      const outstandingItems = await financialAuditQueries.getOutstandingReconciliationItems({
        status: 'pending',
        daysOld: 0, // Include today's items
        limit: 5
      });

      console.log(`Status: ${outstandingItems.status}`);
      console.log(`Total Outstanding: ${outstandingItems.pagination.total}`);

      if (outstandingItems.outstanding_items.length > 0) {
        console.log('\nSample Outstanding Items:');
        outstandingItems.outstanding_items.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.transaction_reference} - $${(item.amount_cents / 100).toFixed(2)} (${item.age_days} days old)`);
        });
      } else {
        colorLog('green', '✅ No outstanding reconciliation items found!');
      }
    } catch (error) {
      colorLog('yellow', `⚠️  Outstanding items check failed: ${error.message}`);
    }

    // 5. Demo Reconciliation Status Update
    colorLog('blue', '\n5. Reconciliation Status Update Demo');
    colorLog('blue', '-----------------------------------');

    try {
      // Test the validation logic (this will fail on actual update but tests validation)
      const testTxnRef = `DEMO-TXN-${Date.now()}`;

      // Test invalid status (should fail)
      try {
        await financialAuditQueries.updateReconciliationStatus(testTxnRef, 'invalid_status');
      } catch (validationError) {
        if (validationError.message.includes('Invalid reconciliation status')) {
          colorLog('green', '✅ Status validation working correctly');
        } else {
          throw validationError;
        }
      }

      // Show valid statuses
      console.log('\nValid reconciliation statuses:');
      const validStatuses = ['pending', 'reconciled', 'discrepancy', 'resolved', 'investigating'];
      validStatuses.forEach((status, index) => {
        console.log(`  ${index + 1}. ${status}`);
      });

    } catch (error) {
      colorLog('yellow', `⚠️  Status update demo failed: ${error.message}`);
    }

    // 6. Show Configuration
    colorLog('blue', '\n6. System Configuration');
    colorLog('blue', '----------------------');

    console.log('Stripe Fee Rates Configuration:');
    const feeRates = financialReconciliationService.stripeFeeRates;
    Object.entries(feeRates).forEach(([method, rates]) => {
      console.log(`  ${method}: ${(rates.rate * 100).toFixed(1)}% + ${rates.fixed}¢${rates.max ? ` (max $${rates.max/100})` : ''}`);
    });

    console.log('\nEnvironment Check:');
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`  STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? 'configured' : 'not configured'}`);
    console.log(`  TURSO_DATABASE_URL: ${process.env.TURSO_DATABASE_URL ? 'configured' : 'not configured'}`);

    // 7. API Endpoint Examples
    colorLog('blue', '\n7. API Endpoint Examples');
    colorLog('blue', '------------------------');

    console.log('Available financial reporting endpoints:');
    const endpoints = [
      'daily-reconciliation',
      'revenue-reconciliation',
      'payment-methods',
      'compliance',
      'financial-health',
      'outstanding-reconciliation',
      'audit-stats'
    ];

    endpoints.forEach((endpoint, index) => {
      console.log(`  ${index + 1}. GET /api/admin/financial-reports?type=${endpoint}`);
    });

    console.log('\nExample API calls:');
    console.log('  # Get financial health status');
    console.log('  curl -H "Cookie: session=<admin-session>" \\');
    console.log('    "https://your-domain.com/api/admin/financial-reports?type=financial-health"');

    console.log('\n  # Generate daily reconciliation report');
    console.log('  curl -X POST -H "Cookie: session=<admin-session>" \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"reportType":"daily-reconciliation","date":"2025-01-15"}\' \\');
    console.log('    "https://your-domain.com/api/admin/financial-reports?type=generate-report"');

    // 8. Summary
    colorLog('green', '\n🎉 Financial Reconciliation System Demo Complete!');
    colorLog('green', '================================================');

    console.log('\nKey Features Demonstrated:');
    console.log('✅ Service health monitoring');
    console.log('✅ Financial health assessment');
    console.log('✅ Audit statistics generation');
    console.log('✅ Outstanding item tracking');
    console.log('✅ Status validation');
    console.log('✅ Configuration management');
    console.log('✅ API endpoint documentation');

    console.log('\nNext Steps:');
    console.log('1. Configure environment variables for full functionality');
    console.log('2. Set up admin authentication for API access');
    console.log('3. Schedule daily reconciliation reports');
    console.log('4. Configure monitoring and alerting');
    console.log('5. Review and customize fee rate calculations');

  } catch (error) {
    colorLog('red', `\n❌ Demo failed with error: ${error.message}`);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(error => {
    colorLog('red', `Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export { runDemo };