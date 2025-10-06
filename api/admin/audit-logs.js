/**
 * Admin Audit Logs API
 * Provides query interface for audit log viewing and filtering
 */

import authService from '../../lib/auth-service.js';
import auditService from '../../lib/audit-service.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';
import { processDatabaseResult } from '../../lib/bigint-serializer.js';
import timeUtils from '../../lib/time-utils.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure audit service is initialized
    await auditService.ensureInitialized();

    // Extract query parameters
    const {
      eventType,
      adminUser,
      severity,
      startDate,
      endDate,
      action,
      targetType,
      limit = '50',
      offset = '0',
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = req.query;

    // Parse pagination parameters
    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 1000); // Max 1000 records
    const parsedOffset = parseInt(offset, 10) || 0;

    // Build query filters
    const filters = {
      eventType: eventType || null,
      adminUser: adminUser || null,
      severity: severity || null,
      startDate: startDate || null,
      endDate: endDate || null,
      action: action || null,
      targetType: targetType || null,
      limit: parsedLimit,
      offset: parsedOffset,
      orderBy: orderBy,
      orderDirection: orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    };

    // Query audit logs
    const result = await auditService.queryAuditLogs(filters);

    // Enhance logs with Mountain Time formatting
    const enhancedLogs = timeUtils.enhanceApiResponse(
      result.logs,
      ['created_at'],
      { includeDeadline: false }
    );

    // Get summary statistics for current filters
    const stats = await auditService.getAuditStats('24h'); // Last 24 hours

    const response = {
      logs: enhancedLogs,
      pagination: {
        total: result.total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: result.hasMore,
        nextOffset: result.hasMore ? parsedOffset + parsedLimit : null
      },
      filters: {
        eventType: eventType || 'all',
        adminUser: adminUser || 'all',
        severity: severity || 'all',
        startDate: startDate || null,
        endDate: endDate || null,
        action: action || null,
        targetType: targetType || null
      },
      stats: {
        last24Hours: stats,
        totalInQuery: result.total
      },
      timezone: 'America/Denver',
      timestamp: new Date().toISOString(),
      timestamp_mt: timeUtils.toMountainTime(new Date())
    };

    // Set headers to prevent caching of audit logs
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json(processDatabaseResult(response));
  } catch (error) {
    console.error('[AuditLogs] Query failed:', error);

    // Check for specific error types
    if (error.message?.includes('Invalid filter') || error.message?.includes('Invalid parameter')) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to fetch audit logs',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Build middleware chain: security headers → auth → audit → handler
const protectedHandler = authService.requireAuth
  ? authService.requireAuth(handler)
  : handler;

export default withSecurityHeaders(
  withAdminAudit(protectedHandler, {
    logBody: false, // Don't log query parameters (could be large)
    logMetadata: true,
    skipMethods: [] // Log all audit log queries for security tracking
  })
);
