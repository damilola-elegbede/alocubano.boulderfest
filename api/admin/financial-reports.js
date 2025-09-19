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

import { AuthService } from '../../lib/auth-service.js';
import financialReconciliationService from '../../lib/financial-reconciliation-service.js';
import financialAuditQueries from '../../lib/financial-audit-queries.js';
import auditService from '../../lib/audit-service.js';
import { logger } from '../../lib/logger.js';

// Initialize auth service
const authService = new AuthService();

/**
 * Helper function to validate admin authentication
 */
async function validateAdminAuth(req) {
  try {
    const sessionInfo = await authService.validateSession(req);

    if (!sessionInfo.valid) {
      return { valid: false, error: 'Invalid or expired session' };
    }

    if (!sessionInfo.user || sessionInfo.user !== 'admin') {
      return { valid: false, error: 'Insufficient privileges - admin access required' };
    }

    return {
      valid: true,
      sessionInfo,
      adminUser: sessionInfo.user,
      sessionId: sessionInfo.sessionId
    };

  } catch (error) {
    logger.error('[FinancialReports] Authentication error:', error.message);
    return { valid: false, error: 'Authentication failed' };
  }
}

/**
 * Helper function to log admin access
 */
async function logAdminAccess(req, authResult, responseData, startTime) {
  try {
    const responseTime = Date.now() - startTime;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    const ipAddress = forwardedFor || realIP || req.socket?.remoteAddress || 'Unknown';

    await auditService.logAdminAccess({
      adminUser: authResult.valid ? authResult.adminUser : null,
      sessionId: authResult.valid ? authResult.sessionId : null,
      ipAddress,
      userAgent,
      requestMethod: req.method,
      requestUrl: req.url,
      requestBody: req.method === 'POST' ? JSON.stringify(req.body) : null,
      responseStatus: responseData.status || 200,
      responseTimeMs: responseTime,
      metadata: {
        endpoint: 'financial-reports',
        report_type: req.query.type || 'unknown',
        date_range: req.query.startDate || req.query.endDate ? {
          start: req.query.startDate,
          end: req.query.endDate
        } : null,
        response_size: JSON.stringify(responseData).length
      }
    });
  } catch (auditError) {
    logger.error('[FinancialReports] Failed to log admin access:', auditError.message);
    // Never throw - audit failures must not break the API
  }
}

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

export default async function handler(req, res) {
  const startTime = Date.now();
  let responseData = { status: 500, error: 'Internal server error' };

  try {
    // Only allow GET and POST requests
    if (!['GET', 'POST'].includes(req.method)) {
      responseData = { status: 405, error: 'Method not allowed' };
      res.status(405).json(responseData);
      return;
    }

    // Validate admin authentication
    const authResult = await validateAdminAuth(req);
    if (!authResult.valid) {
      responseData = { status: 401, error: authResult.error };
      await logAdminAccess(req, authResult, responseData, startTime);
      res.status(401).json(responseData);
      return;
    }

    // Ensure all services are initialized to prevent race conditions
    if (financialReconciliationService.ensureInitialized) {
      await financialReconciliationService.ensureInitialized();
    }
    if (auditService.ensureInitialized) {
      await auditService.ensureInitialized();
    }

    const { type, format = 'json' } = req.query;

    try {
      switch (type) {
        case 'daily-reconciliation':
          responseData = await handleDailyReconciliation(req, authResult);
          break;

        case 'revenue-reconciliation':
          responseData = await handleRevenueReconciliation(req, authResult);
          break;

        case 'payment-methods':
          responseData = await handlePaymentMethodBreakdown(req, authResult);
          break;

        case 'compliance':
          responseData = await handleComplianceReport(req, authResult);
          break;

        case 'financial-health':
          responseData = await handleFinancialHealth(req, authResult);
          break;

        case 'outstanding-reconciliation':
          responseData = await handleOutstandingReconciliation(req, authResult);
          break;

        case 'discrepancies':
          responseData = await handleDiscrepancyReport(req, authResult);
          break;

        case 'audit-stats':
          responseData = await handleAuditStats(req, authResult);
          break;

        case 'generate-report':
          if (req.method !== 'POST') {
            responseData = { status: 405, error: 'POST method required for report generation' };
            break;
          }
          responseData = await handleGenerateReport(req, authResult);
          break;

        case 'resolve-discrepancy':
          if (req.method !== 'POST') {
            responseData = { status: 405, error: 'POST method required for discrepancy resolution' };
            break;
          }
          responseData = await handleResolveDiscrepancy(req, authResult);
          break;

        default:
          responseData = {
            status: 400,
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
          };
      }

      // Log successful admin access
      await logAdminAccess(req, authResult, responseData, startTime);

      // Handle different response formats
      if (format === 'csv' && responseData.data) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.csv"`);
        res.status(responseData.status || 200).send(convertToCSV(responseData.data));
      } else {
        res.status(responseData.status || 200).json(responseData);
      }

    } catch (serviceError) {
      logger.error(`[FinancialReports] Service error for type ${type}:`, serviceError.message);
      responseData = {
        status: 500,
        error: 'Financial service error',
        details: process.env.NODE_ENV === 'development' ? serviceError.message : 'Internal error'
      };

      await logAdminAccess(req, authResult, responseData, startTime);
      res.status(500).json(responseData);
    }

  } catch (error) {
    logger.error('[FinancialReports] Handler error:', error.message);
    responseData = {
      status: 500,
      error: 'Request processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    };

    res.status(500).json(responseData);
  }
}

/**
 * Handle daily reconciliation report generation
 */
async function handleDailyReconciliation(req, authResult) {
  const { date } = req.query;
  const reportDate = date || new Date().toISOString().split('T')[0];

  const report = await financialReconciliationService.generateDailyReconciliationReport(reportDate);

  return {
    status: 200,
    data: {
      report_type: 'daily_reconciliation',
      report_date: reportDate,
      reconciliation: report,
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle revenue reconciliation report
 */
async function handleRevenueReconciliation(req, authResult) {
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
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle payment method breakdown analysis
 */
async function handlePaymentMethodBreakdown(req, authResult) {
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
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle financial compliance report
 */
async function handleComplianceReport(req, authResult) {
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
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle financial health status
 */
async function handleFinancialHealth(req, authResult) {
  const healthStatus = await financialReconciliationService.getFinancialHealthStatus();

  return {
    status: 200,
    data: {
      report_type: 'financial_health',
      health_status: healthStatus,
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle outstanding reconciliation items
 */
async function handleOutstandingReconciliation(req, authResult) {
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
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle discrepancy report
 */
async function handleDiscrepancyReport(req, authResult) {
  // This would need to be implemented with a query to financial_discrepancies table
  // For now, return a placeholder structure
  return {
    status: 200,
    data: {
      report_type: 'discrepancy_report',
      message: 'Discrepancy reporting implementation pending',
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle audit statistics
 */
async function handleAuditStats(req, authResult) {
  const { timeframe = '24h' } = req.query;

  const auditStats = await financialAuditQueries.getFinancialAuditStats(timeframe);

  return {
    status: 200,
    data: {
      report_type: 'audit_statistics',
      timeframe,
      statistics: auditStats,
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle report generation request
 */
async function handleGenerateReport(req, authResult) {
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
      generated_by: authResult.adminUser,
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Handle discrepancy resolution
 */
async function handleResolveDiscrepancy(req, authResult) {
  const { discrepancyId, notes, action } = req.body;

  if (!discrepancyId || !notes || !action) {
    return {
      status: 400,
      error: 'Missing required fields: discrepancyId, notes, action'
    };
  }

  await financialReconciliationService.resolveDiscrepancy(discrepancyId, {
    notes,
    action,
    resolvedBy: authResult.adminUser
  });

  return {
    status: 200,
    data: {
      message: 'Discrepancy resolved successfully',
      discrepancy_id: discrepancyId,
      resolved_by: authResult.adminUser,
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