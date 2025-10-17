import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { safeParseInt } from "../../lib/db-utils.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import timeUtils from "../../lib/time-utils.js";

async function handler(req, res) {
  let db;

  try {
    db = await getDatabaseClient();

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).end('Method Not Allowed');
    }

    // Get query parameters
    const eventId = safeParseInt(req.query?.eventId);

    // Base WHERE condition for scan_logs
    // Join with tickets for event filtering if needed
    const baseConditions = [];
    const baseParams = [];

    // Build base query - optionally filter by event
    let fromClause = 'FROM scan_logs sl';
    if (eventId) {
      fromClause = 'FROM scan_logs sl JOIN tickets t ON sl.ticket_id = t.ticket_id';
      baseConditions.push('t.event_id = ?');
      baseParams.push(eventId);
    }

    const baseWhere = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';

    // Calculate Mountain Time offset for 'today' filter
    const timezoneInfo = timeUtils.getTimezoneInfo();
    const offsetHours = Math.abs(timezoneInfo.offsetHours);

    // Build all count queries
    const queries = [];

    // 1. Today's scans (Mountain Time)
    const todayConditions = [...baseConditions];
    todayConditions.push(`date(sl.scanned_at, '-${offsetHours} hours') = date('now', '-${offsetHours} hours')`);
    const todayWhere = todayConditions.length > 0 ? `WHERE ${todayConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${todayWhere}`,
        args: baseParams
      })
    );

    // 2. Total scans (all time) - count unique tickets
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${baseWhere}`,
        args: baseParams
      })
    );

    // 3. Valid scans
    const validConditions = [...baseConditions, "sl.scan_status = 'valid'"];
    const validWhere = validConditions.length > 0 ? `WHERE ${validConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${validWhere}`,
        args: baseParams
      })
    );

    // 4. Failed scans (invalid, expired, suspicious)
    const failedConditions = [...baseConditions, "sl.scan_status IN ('invalid', 'expired', 'suspicious')"];
    const failedWhere = failedConditions.length > 0 ? `WHERE ${failedConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${failedWhere}`,
        args: baseParams
      })
    );

    // 5. Rate limited scans
    const rateLimitedConditions = [...baseConditions, "sl.scan_status = 'rate_limited'"];
    const rateLimitedWhere = rateLimitedConditions.length > 0 ? `WHERE ${rateLimitedConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${rateLimitedWhere}`,
        args: baseParams
      })
    );

    // 6. Already scanned tickets (re-scans after initial successful scan)
    const alreadyScannedConditions = [...baseConditions, "sl.scan_status = 'already_scanned'"];
    const alreadyScannedWhere = alreadyScannedConditions.length > 0 ? `WHERE ${alreadyScannedConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${alreadyScannedWhere}`,
        args: baseParams
      })
    );

    // 7. Average scan time (only for valid scans with duration data)
    const avgTimeConditions = [...baseConditions, "sl.scan_status = 'valid'", "sl.scan_duration_ms IS NOT NULL"];
    const avgTimeWhere = avgTimeConditions.length > 0 ? `WHERE ${avgTimeConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT AVG(sl.scan_duration_ms) as avg_time ${fromClause} ${avgTimeWhere}`,
        args: baseParams
      })
    );

    // Execute all queries in parallel
    const results = await Promise.all(queries);

    // Extract counts (using camelCase for frontend compatibility)
    const stats = {
      today: results[0].rows[0]?.count || 0,
      total: results[1].rows[0]?.count || 0,
      valid: results[2].rows[0]?.count || 0,
      failed: results[3].rows[0]?.count || 0,
      rateLimited: results[4].rows[0]?.count || 0,
      alreadyScanned: results[5].rows[0]?.count || 0,
      avgScanTimeMs: results[6].rows[0]?.avg_time ? Math.round(results[6].rows[0].avg_time) : null,
      session: 0 // Session data is browser-local only
    };

    // Set security headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Prepare response data
    const responseData = {
      stats,
      timezone: 'America/Denver',
      timestamp: new Date().toISOString()
    };

    // Enhance with Mountain Time fields
    const enhancedResponse = timeUtils.enhanceApiResponse(
      responseData,
      ['timestamp']
    );

    res.status(200).json(enhancedResponse);
  } catch (error) {
    console.error('Scanner stats API error:', error);

    // Handle specific errors
    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    if (error.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Request timeout' });
    }

    res.status(500).json({ error: 'Failed to fetch scanner statistics' });
  }
}

// Build the middleware chain
const securedHandler = withSecurityHeaders(
  withAdminAudit(
    authService.requireAuth(handler),
    {
      logBody: false,
      logMetadata: true,
      skipMethods: []
    }
  )
);

// Wrap in error-handling function
async function safeHandler(req, res) {
  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in scanner stats endpoint:', error);

    // Check for auth initialization errors
    if (error.message.includes('ADMIN_SECRET')) {
      return res.status(500).json({
        error: 'Authentication service unavailable',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? `Auth configuration error: ${error.message}`
          : 'Authentication service is temporarily unavailable',
        timestamp: new Date().toISOString()
      });
    }

    // Return JSON error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? error.message
          : 'A server error occurred while processing your request',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default safeHandler;
