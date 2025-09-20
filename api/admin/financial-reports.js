/**
 * Financial Reports API
 * Comprehensive financial reporting and reconciliation dashboard for admin panel
 *
 * Features:
 * - Daily, weekly, monthly financial summaries
 * - Transaction status reports with real-time data
 * - Refund and dispute tracking with resolution status
 * - Settlement and payout reports with bank reconciliation
 * - Discrepancy reports with resolution tracking
 * - Real-time financial health monitoring
 * - Regulatory compliance reporting (PCI, SOX, GDPR)
 * - Performance-optimized queries with caching
 */

import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import financialReconciliationService from "../../lib/financial-reconciliation-service.js";
import financialAuditQueries from "../../lib/financial-audit-queries.js";
import auditService from "../../lib/audit-service.js";
import { logger } from "../../lib/logger.js";

/**
 * Parse and validate date parameters
 */
function parseDateParams(query) {
  const { startDate, endDate, period = 'day' } = query;

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (startDate && !dateRegex.test(startDate)) {
    throw new Error('Invalid startDate format. Use YYYY-MM-DD');
  }

  if (endDate && !dateRegex.test(endDate)) {
    throw new Error('Invalid endDate format. Use YYYY-MM-DD');
  }

  // Default to last 30 days if no dates provided
  const defaultEndDate = new Date().toISOString().split('T')[0];
  const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return {
    startDate: startDate || defaultStartDate,
    endDate: endDate || defaultEndDate,
    period: ['day', 'week', 'month'].includes(period) ? period : 'day'
  };
}

async function handler(req, res) {
  try {
    // Only allow GET and POST requests
    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({
        error: 'Method not allowed',
        allowedMethods: ['GET', 'POST']
      });
    }

    // Set no-cache headers for sensitive financial data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Ensure all services are initialized to prevent race conditions
    if (financialReconciliationService.ensureInitialized) {
      await financialReconciliationService.ensureInitialized();
    }
    if (auditService.ensureInitialized) {
      await auditService.ensureInitialized();
    }

    const { type, format = 'json' } = req.query;

    let responseData;

    switch (type) {
    case 'daily-reconciliation':
      responseData = await handleDailyReconciliation(req);
      break;

    case 'revenue-reconciliation':
      responseData = await handleRevenueReconciliation(req);
      break;

    case 'payment-methods':
      responseData = await handlePaymentMethodBreakdown(req);
      break;

    case 'compliance':
      responseData = await handleComplianceReport(req);
      break;

    case 'financial-health':
      responseData = await handleFinancialHealth(req);
      break;

    case 'outstanding-reconciliation':
      responseData = await handleOutstandingReconciliation(req);
      break;

    case 'discrepancies':
      responseData = await handleDiscrepancyReport(req);
      break;

    case 'audit-stats':
      responseData = await handleAuditStats(req);
      break;

    case 'generate-report':
      if (req.method !== 'POST') {
        return res.status(405).json({
          error: 'POST method required for report generation'
        });
      }
      responseData = await handleGenerateReport(req);
      break;

    case 'resolve-discrepancy':
      if (req.method !== 'POST') {
        return res.status(405).json({
          error: 'POST method required for discrepancy resolution'
        });
      }
      responseData = await handleResolveDiscrepancy(req);
      break;

    default:
      return res.status(400).json({
        error: 'Invalid report type',
        available_types: [
          'daily-reconciliation',
          'revenue-reconciliation',
          'payment-methods',
          'compliance',
          'financial-health',
          'outstanding-reconciliation',
          'discrepancies',
          'audit-stats',
          'generate-report',
          'resolve-discrepancy'
        ]
      });
    }

    // Handle different response formats
    if (format === 'csv' && responseData.data) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.csv"`);
      res.status(responseData.status || 200).send(convertToCSV(responseData.data));
    } else {
      res.status(responseData.status || 200).json(responseData);
    }

  } catch (error) {
    logger.error('[FinancialReports] Handler error:', error.message);
    res.status(500).json({
      error: 'Request processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
}

/**
 * Handle daily reconciliation report generation
 */
async function handleDailyReconciliation(req) {
  const { date } = req.query;
  const reportDate = date || new Date().toISOString().split('T')[0];

  const report = await financialReconciliationService.generateDailyReconciliationReport(reportDate);

  return {
    status: 200,
    data: {
      report_type: 'daily_reconciliation',
      report_date: reportDate,
      reconciliation: report,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle revenue reconciliation report
 */
async function handleRevenueReconciliation(req) {
  const { startDate, endDate, period } = parseDateParams(req.query);
  const { currency = 'USD' } = req.query;

  const report = await financialAuditQueries.getRevenueReconciliationReport({
    startDate,
    endDate,
    currency,
    groupBy: period
  });

  return {
    status: 200,
    data: {
      report_type: 'revenue_reconciliation',
      parameters: { startDate, endDate, period, currency },
      report,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle payment method breakdown analysis
 */
async function handlePaymentMethodBreakdown(req) {
  const { startDate, endDate } = parseDateParams(req.query);
  const { currency = 'USD' } = req.query;

  const breakdown = await financialAuditQueries.getPaymentMethodBreakdown({
    startDate,
    endDate,
    currency
  });

  return {
    status: 200,
    data: {
      report_type: 'payment_method_breakdown',
      parameters: { startDate, endDate, currency },
      breakdown,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle financial compliance report
 */
async function handleComplianceReport(req) {
  const { startDate, endDate } = parseDateParams(req.query);
  const { reportType = 'comprehensive' } = req.query;

  const complianceReport = await financialAuditQueries.getFinancialComplianceReport({
    startDate,
    endDate,
    reportType
  });

  return {
    status: 200,
    data: {
      report_type: 'financial_compliance',
      parameters: { startDate, endDate, reportType },
      compliance: complianceReport,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle financial health status
 */
async function handleFinancialHealth(req) {
  const healthStatus = await financialReconciliationService.getFinancialHealthStatus();

  return {
    status: 200,
    data: {
      report_type: 'financial_health',
      health_status: healthStatus,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle outstanding reconciliation items
 */
async function handleOutstandingReconciliation(req) {
  const {
    status = 'pending',
    daysOld = 1,
    limit = 100,
    offset = 0
  } = req.query;

  const outstandingItems = await financialAuditQueries.getOutstandingReconciliationItems({
    status,
    daysOld: parseInt(daysOld),
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  return {
    status: 200,
    data: {
      report_type: 'outstanding_reconciliation',
      parameters: { status, daysOld, limit, offset },
      outstanding_items: outstandingItems,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle discrepancy report
 */
async function handleDiscrepancyReport(req) {
  // This would need to be implemented with a query to financial_discrepancies table
  // For now, return a placeholder structure
  return {
    status: 200,
    data: {
      report_type: 'discrepancy_report',
      message: 'Discrepancy reporting implementation pending',
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle audit statistics
 */
async function handleAuditStats(req) {
  const { timeframe = '24h' } = req.query;

  const auditStats = await financialAuditQueries.getFinancialAuditStats(timeframe);

  return {
    status: 200,
    data: {
      report_type: 'audit_statistics',
      timeframe,
      statistics: auditStats,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle report generation request
 */
async function handleGenerateReport(req) {
  const { reportType, date, parameters = {} } = req.body;

  if (!reportType) {
    return {
      status: 400,
      error: 'Report type is required'
    };
  }

  let report;
  switch (reportType) {
  case 'daily-reconciliation':
    report = await financialReconciliationService.generateDailyReconciliationReport(date);
    break;

  default:
    return {
      status: 400,
      error: `Unsupported report generation type: ${reportType}`
    };
  }

  return {
    status: 201,
    data: {
      report_type: reportType,
      report,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle discrepancy resolution
 */
async function handleResolveDiscrepancy(req) {
  const { discrepancyId, notes, action } = req.body;

  if (!discrepancyId || !notes || !action) {
    return {
      status: 400,
      error: 'Missing required fields: discrepancyId, notes, action'
    };
  }

  await financialReconciliationService.resolveDiscrepancy(discrepancyId, {
    notes,
    action
  });

  return {
    status: 200,
    data: {
      message: 'Discrepancy resolved successfully',
      discrepancy_id: discrepancyId,
      resolved_at: new Date().toISOString()
    }
  };
}

/**
 * Convert data to CSV format (basic implementation)
 */
function convertToCSV(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return 'No data available';
  }

  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  const csvRows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [csvHeaders, ...csvRows].join('\n');
}

export default withSecurityHeaders(
  authService.requireAuth(
    withAdminAudit(handler, {
      logBody: true, // Log request body for financial operations audit
      logMetadata: true, // Log comprehensive metadata for financial reports
      skipMethods: [] // Always audit financial report access
    })
  ),
  { isAPI: true }
);
