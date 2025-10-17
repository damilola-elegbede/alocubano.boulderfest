import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { columnExists, safeParseInt } from "../../lib/db-utils.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";

async function handler(req, res) {
  const startTime = Date.now();
  let db;

  try {
    console.log('[CHECKED-IN-TICKETS] Request received', {
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
    const filter = req.query?.filter || 'total';
    const eventId = safeParseInt(req.query?.eventId);
    const page = Math.max(1, safeParseInt(req.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, safeParseInt(req.query?.limit) || 50));
    const offset = (page - 1) * limit;

    console.log('[CHECKED-IN-TICKETS] Parsed parameters', {
      filter,
      eventId,
      page,
      limit,
      offset,
      scanLogIds: req.query?.scanLogIds ? 'present' : 'not present'
    });

    // Validate filter parameter - updated to match scanner-stats.js
    const validFilters = ['today', 'session', 'total', 'valid', 'failed', 'rateLimited', 'alreadyScanned'];
    if (!validFilters.includes(filter)) {
      return res.status(400).json({
        error: 'Invalid filter parameter',
        validFilters
      });
    }

    // Session filter: query by scan_logs IDs from client
    if (filter === 'session') {
      console.log('[CHECKED-IN-TICKETS] Processing session filter');

      // Get scan log IDs from request body or query parameter
      const scanLogIds = req.query?.scanLogIds || req.body?.scanLogIds;

      console.log('[CHECKED-IN-TICKETS] Scan log IDs received', {
        source: req.query?.scanLogIds ? 'query' : (req.body?.scanLogIds ? 'body' : 'none'),
        type: Array.isArray(scanLogIds) ? 'array' : typeof scanLogIds,
        length: Array.isArray(scanLogIds) ? scanLogIds.length : (scanLogIds ? scanLogIds.length : 0)
      });

      if (!scanLogIds || (Array.isArray(scanLogIds) && scanLogIds.length === 0)) {
        // No IDs provided - return empty array
        return res.status(200).json({
          tickets: [],
          filter: 'session',
          totalCount: 0,
          message: 'No session scan log IDs provided',
          timezone: 'America/Denver'
        });
      }

      // Parse IDs if string (comma-separated)
      const idsArray = Array.isArray(scanLogIds) ? scanLogIds : scanLogIds.split(',').map(id => id.trim()).filter(Boolean);

      if (idsArray.length === 0) {
        return res.status(200).json({
          tickets: [],
          filter: 'session',
          totalCount: 0,
          message: 'No valid scan log IDs provided',
          timezone: 'America/Denver'
        });
      }

      // Query database for these specific scan_logs IDs
      const placeholders = idsArray.map(() => '?').join(',');
      const query = `
        SELECT
          t.ticket_id,
          t.attendee_first_name,
          t.attendee_last_name,
          t.ticket_type,
          t.scan_count,
          t.max_scan_count,
          sl.scanned_at,
          sl.scan_status,
          sl.validation_source,
          sl.scan_duration_ms,
          sl.device_info
        FROM tickets t
        JOIN scan_logs sl ON t.ticket_id = sl.ticket_id
        WHERE sl.id IN (${placeholders})
        ORDER BY sl.scanned_at DESC
      `;

      console.log('[CHECKED-IN-TICKETS] Executing session query', {
        idsCount: idsArray.length,
        idsArray: idsArray.slice(0, 10), // Log first 10 IDs
        queryLength: query.length
      });

      const result = await db.execute({ sql: query, args: idsArray });

      console.log('[CHECKED-IN-TICKETS] Session query result', {
        rowCount: result.rows?.length || 0,
        firstRow: result.rows?.[0]
      });

      // Process BigInt values
      const processedResult = processDatabaseResult(result);
      const tickets = processedResult.rows || [];

      console.log('[CHECKED-IN-TICKETS] BigInt processing complete', {
        ticketCount: tickets.length
      });

      // Enhance with Mountain Time formatted timestamps (keep snake_case for frontend compatibility)
      const enhancedTickets = tickets.map(ticket => ({
        ticket_id: ticket.ticket_id,
        first_name: ticket.attendee_first_name,
        last_name: ticket.attendee_last_name,
        ticket_type: ticket.ticket_type,
        scan_time: ticket.scanned_at ? ticket.scanned_at.replace(' ', 'T') + 'Z' : null,
        scan_time_mt: timeUtils.formatDateTime(ticket.scanned_at),
        scan_count: ticket.scan_count,
        max_scans: ticket.max_scan_count,
        scan_status: ticket.scan_status,
        validation_source: ticket.validation_source,
        scan_duration_ms: ticket.scan_duration_ms,
        device_info: ticket.device_info
      }));

      return res.status(200).json({
        tickets: enhancedTickets,
        filter: 'session',
        totalCount: enhancedTickets.length,
        pagination: {
          page: 1,
          limit: enhancedTickets.length,
          totalCount: enhancedTickets.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        },
        timezone: 'America/Denver',
        timestamp: new Date().toISOString(),
        timestampMt: timeUtils.toMountainTime(new Date())
      });
    }

    console.log('[CHECKED-IN-TICKETS] Processing standard filter', { filter });

    // Check if event_id column exists in tickets table
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');

    console.log('[CHECKED-IN-TICKETS] Database schema check', {
      ticketsHasEventId
    });

    // Build WHERE clauses - separate conditions for subquery vs outer query
    const subqueryScanLogConditions = []; // Scan log conditions for SUBQUERY WHERE clause
    const ticketConditions = [];          // Ticket table conditions for outer WHERE clause
    const queryParams = [];

    // Calculate Mountain Time offset for 'today' filter (same logic as scanner-stats.js)
    const timezoneInfo = timeUtils.getTimezoneInfo();
    const offsetHours = timezoneInfo.offsetHours; // Keep sign: -6 for MDT, -7 for MST

    console.log('[CHECKED-IN-TICKETS] Timezone calculation', {
      timezone: timezoneInfo.timezone,
      abbreviation: timezoneInfo.abbreviation,
      isDST: timezoneInfo.isDST,
      offsetHours: timezoneInfo.offsetHours
    });

    // Apply filter-specific conditions to the SUBQUERY
    // This ensures we get the latest scan MATCHING the filter criteria, not the absolute latest scan
    // For 'failed': Get latest failed scan for each ticket (not latest overall scan)
    // For 'valid': Get latest valid scan for each ticket
    // For 'total': Get absolute latest scan for each ticket (no filter)
    if (filter === 'today') {
      subqueryScanLogConditions.push(`date(scanned_at, '${offsetHours} hours') = date('now', '${offsetHours} hours')`);
    } else if (filter === 'valid') {
      subqueryScanLogConditions.push("scan_status = 'valid'");
    } else if (filter === 'failed') {
      subqueryScanLogConditions.push("scan_status IN ('invalid', 'expired', 'suspicious')");
    } else if (filter === 'rateLimited') {
      subqueryScanLogConditions.push("scan_status = 'rate_limited'");
    } else if (filter === 'alreadyScanned') {
      subqueryScanLogConditions.push("scan_status = 'already_scanned'");
    }
    // 'total' filter has no additional conditions - gets absolute latest scan

    // Add event filtering to ticket conditions (applies to outer query)
    if (eventId && ticketsHasEventId) {
      ticketConditions.push('t.event_id = ?');
      queryParams.push(eventId);
    }

    // Build WHERE clauses
    const subqueryWhere = subqueryScanLogConditions.length > 0 ? `WHERE ${subqueryScanLogConditions.join(' AND ')}` : '';
    const outerWhere = ticketConditions.length > 0 ? `WHERE ${ticketConditions.join(' AND ')}` : '';

    console.log('[CHECKED-IN-TICKETS] Query conditions built', {
      subqueryScanLogConditions,
      ticketConditions,
      queryParams,
      subqueryWhere,
      outerWhere
    });

    // Get total count first
    // Count distinct tickets matching filter criteria
    // The subquery gets the latest scan MATCHING the filter for each ticket
    // For 'failed': Count tickets that have at least one failed scan (by getting latest failed scan per ticket)
    const countQuery = `
      SELECT COUNT(DISTINCT sl.ticket_id) as total
      FROM scan_logs sl
      JOIN tickets t ON sl.ticket_id = t.ticket_id
      JOIN (
        SELECT ticket_id, MAX(scanned_at) as max_scanned_at
        FROM scan_logs
        ${subqueryWhere}
        GROUP BY ticket_id
      ) latest ON sl.ticket_id = latest.ticket_id AND sl.scanned_at = latest.max_scanned_at
      ${outerWhere}
    `;

    console.log('[CHECKED-IN-TICKETS] Executing count query', {
      queryLength: countQuery.length,
      queryParams
    });

    const countResult = await db.execute({ sql: countQuery, args: queryParams });

    // Log raw count result with type information
    console.log('[CHECKED-IN-TICKETS] Raw count query result', {
      rawResult: countResult.rows[0],
      totalType: typeof countResult.rows[0]?.total,
      isBigInt: typeof countResult.rows[0]?.total === 'bigint'
    });

    // Process BigInt BEFORE Number() conversion
    const processedCountResult = processDatabaseResult(countResult);
    const totalCount = processedCountResult.rows[0]?.total || 0;

    console.log('[CHECKED-IN-TICKETS] Count query result processed', {
      totalCount,
      totalCountType: typeof totalCount,
      processedResult: processedCountResult.rows[0]
    });

    // Build the paginated query
    // The subquery gets the latest scan MATCHING the filter for each ticket
    // For 'failed': Shows tickets with at least one failed scan, displaying their latest failed scan
    // For 'valid': Shows tickets with at least one valid scan, displaying their latest valid scan
    // For 'total': Shows all tickets, displaying their absolute latest scan
    const query = `
      SELECT
        t.ticket_id,
        t.attendee_first_name,
        t.attendee_last_name,
        t.ticket_type,
        t.scan_count,
        t.max_scan_count,
        sl.scanned_at,
        sl.scan_status,
        sl.validation_source,
        sl.scan_duration_ms,
        sl.device_info
      FROM tickets t
      JOIN scan_logs sl ON t.ticket_id = sl.ticket_id
      JOIN (
        SELECT ticket_id, MAX(scanned_at) as max_scanned_at
        FROM scan_logs
        ${subqueryWhere}
        GROUP BY ticket_id
      ) latest ON sl.ticket_id = latest.ticket_id AND sl.scanned_at = latest.max_scanned_at
      ${outerWhere}
      ORDER BY sl.scanned_at DESC
      LIMIT ? OFFSET ?
    `;

    const paginatedParams = [...queryParams, limit, offset];

    console.log('[CHECKED-IN-TICKETS] Executing paginated query', {
      queryLength: query.length,
      paginatedParams,
      limit,
      offset
    });

    const result = await db.execute({ sql: query, args: paginatedParams });

    console.log('[CHECKED-IN-TICKETS] Paginated query result', {
      rowCount: result.rows?.length || 0,
      firstRow: result.rows?.[0]
    });

    // Process BigInt values
    const processedResult = processDatabaseResult(result);
    const tickets = processedResult.rows || [];

    console.log('[CHECKED-IN-TICKETS] BigInt processing complete', {
      ticketCount: tickets.length
    });

    // Enhance with Mountain Time formatted timestamps (keep snake_case for frontend compatibility)
    const enhancedTickets = tickets.map(ticket => ({
      ticket_id: ticket.ticket_id,
      first_name: ticket.attendee_first_name,
      last_name: ticket.attendee_last_name,
      ticket_type: ticket.ticket_type,
      scan_time: ticket.scanned_at ? ticket.scanned_at.replace(' ', 'T') + 'Z' : null,
      scan_time_mt: timeUtils.formatDateTime(ticket.scanned_at),
      scan_count: ticket.scan_count,
      max_scans: ticket.max_scan_count,
      scan_status: ticket.scan_status,
      validation_source: ticket.validation_source,
      scan_duration_ms: ticket.scan_duration_ms,
      device_info: ticket.device_info
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    // Set security headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const duration = Date.now() - startTime;
    const responseData = {
      tickets: enhancedTickets,
      filter,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      timezone: 'America/Denver',
      timestamp: new Date().toISOString(),
      timestampMt: timeUtils.toMountainTime(new Date())
    };

    console.log('[CHECKED-IN-TICKETS] Response ready', {
      duration: `${duration}ms`,
      filter,
      ticketCount: enhancedTickets.length,
      totalCount,
      page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });

    res.status(200).json(responseData);
  } catch (error) {
    console.error('[CHECKED-IN-TICKETS] Error occurred', {
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
      console.error('[CHECKED-IN-TICKETS] BigInt conversion error detected - this should not happen after fix');
    }

    // Handle specific errors
    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    if (error.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Request timeout' });
    }

    res.status(500).json({ error: 'Failed to fetch checked-in tickets' });
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
    console.error('Fatal error in checked-in tickets endpoint:', error);

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
