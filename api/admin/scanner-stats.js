import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { safeParseInt } from "../../lib/db-utils.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";

async function handler(req, res) {
  const startTime = Date.now();
  let db;

  try {
    console.log('[SCANNER-STATS] Request received', {
      method: req.method,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    db = await getDatabaseClient();

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).end('Method Not Allowed');
    }

    // Get query parameters
    const eventId = safeParseInt(req.query?.eventId);
    console.log('[SCANNER-STATS] Parsed parameters', { eventId });

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

    console.log('[SCANNER-STATS] Query building', {
      fromClause,
      baseConditions,
      baseParams,
      baseWhere
    });

    // Calculate Mountain Time offset for 'today' filter
    // timeUtils returns DST-aware offset: -6 for MDT (summer), -7 for MST (winter)
    // SQLite date() function applies this offset to convert UTC timestamps to Mountain Time
    // Example: date('2025-10-17 09:00:00', '-6 hours') = '2025-10-17 03:00:00' (MDT)
    const timezoneInfo = timeUtils.getTimezoneInfo();
    const offsetHours = timezoneInfo.offsetHours; // Negative value: -6 or -7

    console.log('[SCANNER-STATS] Timezone calculation', {
      timezone: timezoneInfo.timezone,
      abbreviation: timezoneInfo.abbreviation,
      isDST: timezoneInfo.isDST,
      offsetHours: timezoneInfo.offsetHours
    });

    // Build all count queries
    const queries = [];

    // 1. Today's scans (Mountain Time)
    // Converts both scan timestamps and 'now' to Mountain Time before comparing dates
    const todayConditions = [...baseConditions];
    todayConditions.push(`date(sl.scanned_at, '${offsetHours} hours') = date('now', '${offsetHours} hours')`);
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

    // 6. Re-scanned tickets (tickets that have been scanned more than once successfully)
    // Count tickets where scan_count > 1 (indicates multiple successful scans)
    const alreadyScannedConditions = [...baseConditions];
    const alreadyScannedWhere = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')} AND` : 'WHERE';

    // Join with tickets table to check scan_count
    let alreadyScannedFromClause = eventId ? fromClause : 'FROM scan_logs sl JOIN tickets t ON sl.ticket_id = t.ticket_id';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${alreadyScannedFromClause} ${alreadyScannedWhere} t.scan_count > 1`,
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

    // 8. Apple Wallet scans
    const appleWalletConditions = [...baseConditions, "sl.validation_source = 'apple_wallet'"];
    const appleWalletWhere = appleWalletConditions.length > 0 ? `WHERE ${appleWalletConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${appleWalletWhere}`,
        args: baseParams
      })
    );

    // 9. Google Wallet scans (includes Samsung Wallet)
    const googleWalletConditions = [...baseConditions, "sl.validation_source IN ('google_wallet', 'samsung_wallet')"];
    const googleWalletWhere = googleWalletConditions.length > 0 ? `WHERE ${googleWalletConditions.join(' AND ')}` : '';
    queries.push(
      db.execute({
        sql: `SELECT COUNT(DISTINCT sl.ticket_id) as count ${fromClause} ${googleWalletWhere}`,
        args: baseParams
      })
    );

    console.log('[SCANNER-STATS] Executing 9 parallel queries', {
      queryCount: queries.length,
      queryDescriptions: [
        'Today\'s scans (Mountain Time)',
        'Total scans (all time)',
        'Valid scans',
        'Failed scans (invalid/expired/suspicious)',
        'Rate limited scans',
        'Re-scanned tickets (scan_count > 1)',
        'Average scan time (valid scans only)',
        'Apple Wallet scans',
        'Google Wallet scans (includes Samsung)'
      ]
    });

    // Execute all queries in parallel
    const results = await Promise.all(queries);

    console.log('[SCANNER-STATS] Query results received', {
      resultCount: results.length,
      rawResults: results.map((r, i) => ({
        queryIndex: i,
        rowCount: r.rows?.length || 0,
        firstRow: r.rows?.[0],
        // Log types to detect BigInt
        firstRowTypes: r.rows?.[0] ? Object.fromEntries(
          Object.entries(r.rows[0]).map(([k, v]) => [k, typeof v])
        ) : null
      }))
    });

    // Process query results BEFORE extracting values to convert BigInt → Number
    const processedResults = results.map(r => processDatabaseResult(r));

    console.log('[SCANNER-STATS] BigInt processing complete', {
      processedResults: processedResults.map((r, i) => ({
        queryIndex: i,
        firstRow: r.rows?.[0],
        // Log types after processing to verify conversion
        firstRowTypes: r.rows?.[0] ? Object.fromEntries(
          Object.entries(r.rows[0]).map(([k, v]) => [k, typeof v])
        ) : null
      }))
    });

    // Extract counts from PROCESSED results (using camelCase for frontend compatibility)
    const stats = {
      today: processedResults[0].rows[0]?.count || 0,
      total: processedResults[1].rows[0]?.count || 0,
      valid: processedResults[2].rows[0]?.count || 0,
      failed: processedResults[3].rows[0]?.count || 0,
      rateLimited: processedResults[4].rows[0]?.count || 0,
      alreadyScanned: processedResults[5].rows[0]?.count || 0,
      avgScanTimeMs: processedResults[6].rows[0]?.avg_time ? Math.round(processedResults[6].rows[0].avg_time) : null,
      appleWallet: processedResults[7].rows[0]?.count || 0,
      googleWallet: processedResults[8].rows[0]?.count || 0, // Includes Samsung Wallet
      session: 0 // Session data is browser-local only
    };

    console.log('[SCANNER-STATS] Stats object constructed', {
      stats,
      statsBreakdown: {
        today: `${stats.today} unique tickets scanned today`,
        total: `${stats.total} total unique tickets scanned`,
        valid: `${stats.valid} valid scans`,
        failed: `${stats.failed} failed scans`,
        rateLimited: `${stats.rateLimited} rate-limited`,
        alreadyScanned: `${stats.alreadyScanned} tickets re-scanned`,
        avgScanTimeMs: stats.avgScanTimeMs ? `${stats.avgScanTimeMs}ms` : 'null',
        appleWallet: `${stats.appleWallet} Apple Wallet`,
        googleWallet: `${stats.googleWallet} Google Wallet`,
        session: `${stats.session} (browser-local only)`
      }
    });

    // Set security headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Prepare response data with comprehensive timezone info
    const responseData = {
      stats,
      timezone: {
        name: timezoneInfo.timezone,
        abbreviation: timezoneInfo.abbreviation,
        isDST: timezoneInfo.isDST,
        offsetHours: timezoneInfo.offsetHours
      },
      timestamp: new Date().toISOString()
    };

    // Enhance with Mountain Time fields
    const enhancedResponse = timeUtils.enhanceApiResponse(
      responseData,
      ['timestamp']
    );

    const duration = Date.now() - startTime;
    console.log('[SCANNER-STATS] Response ready', {
      duration: `${duration}ms`,
      responseKeys: Object.keys(enhancedResponse),
      timezoneInfo: enhancedResponse.timezone,
      timestamp: enhancedResponse.timestamp,
      statsCount: Object.keys(enhancedResponse.stats).length
    });

    res.status(200).json(enhancedResponse);
  } catch (error) {
    console.error('[SCANNER-STATS] Error occurred', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      // Add context for BigInt errors
      isBigIntError: error.message.includes('BigInt'),
      isTypeError: error.name === 'TypeError'
    });

    // Special handling for BigInt errors
    if (error.message.includes('BigInt') || error.message.includes('Cannot convert')) {
      console.error('[SCANNER-STATS] BigInt conversion error detected - this should not happen after fix');
    }

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
