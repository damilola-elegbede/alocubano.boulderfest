import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { columnExists, safeParseInt } from "../../lib/db-utils.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";

async function handler(req, res) {
  let db;

  try {
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

    // Validate filter parameter - updated to match scanner-stats.js
    const validFilters = ['today', 'session', 'total', 'valid', 'failed', 'rateLimited', 'appleWallet', 'googleWallet'];
    if (!validFilters.includes(filter)) {
      return res.status(400).json({
        error: 'Invalid filter parameter',
        validFilters
      });
    }

    // Session filter returns empty array (session stats are browser-local only)
    if (filter === 'session') {
      return res.status(200).json({
        tickets: [],
        filter: 'session',
        totalCount: 0,
        message: 'Session data is stored locally in browser',
        timezone: 'America/Denver'
      });
    }

    // Check if event_id column exists in tickets table
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');

    // Build WHERE clauses - separate scan_logs conditions from tickets conditions
    const scanLogConditions = [];
    const ticketConditions = [];
    const queryParams = [];

    // Calculate Mountain Time offset for 'today' filter (same logic as scanner-stats.js)
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const mtDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Denver' }));
    const offsetHours = Math.round((utcDate - mtDate) / (1000 * 60 * 60));

    // Apply filter-specific conditions to scan_logs (these go in subquery)
    if (filter === 'today') {
      scanLogConditions.push(`date(scanned_at, '-${Math.abs(offsetHours)} hours') = date('now', '-${Math.abs(offsetHours)} hours')`);
    } else if (filter === 'appleWallet') {
      scanLogConditions.push("validation_source = 'apple_wallet'");
    } else if (filter === 'googleWallet') {
      scanLogConditions.push("validation_source IN ('google_wallet', 'samsung_wallet')");
    } else if (filter === 'valid') {
      scanLogConditions.push("scan_status = 'valid'");
    } else if (filter === 'failed') {
      scanLogConditions.push("scan_status IN ('invalid', 'expired', 'suspicious')");
    } else if (filter === 'rateLimited') {
      scanLogConditions.push("scan_status = 'rate_limited'");
    }
    // 'total' filter has no additional conditions

    // Add event filtering to ticket conditions (applies to outer query)
    if (eventId && ticketsHasEventId) {
      ticketConditions.push('t.event_id = ?');
      queryParams.push(eventId);
    }

    // Build WHERE clauses for different parts of the query
    const subqueryWhere = scanLogConditions.length > 0 ? `WHERE ${scanLogConditions.join(' AND ')}` : '';
    const outerWhere = ticketConditions.length > 0 ? `WHERE ${ticketConditions.join(' AND ')}` : '';

    // Get total count first
    // Count distinct tickets matching filter criteria
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
    const countResult = await db.execute({ sql: countQuery, args: queryParams });
    const totalCount = Number(countResult.rows[0]?.total || 0);

    // Build the paginated query
    // Use a subquery to get the latest scan for each ticket that matches filter criteria
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
    const result = await db.execute({ sql: query, args: paginatedParams });

    // Process BigInt values
    const processedResult = processDatabaseResult(result);
    const tickets = processedResult.rows || [];

    // Enhance with Mountain Time formatted timestamps and convert to camelCase
    const enhancedTickets = tickets.map(ticket => ({
      ticketId: ticket.ticket_id,
      firstName: ticket.attendee_first_name,
      lastName: ticket.attendee_last_name,
      ticketType: ticket.ticket_type,
      scanTime: ticket.scanned_at,
      scanTimeMt: timeUtils.formatDateTime(ticket.scanned_at),
      scanCount: ticket.scan_count,
      maxScans: ticket.max_scan_count,
      scanStatus: ticket.scan_status,
      validationSource: ticket.validation_source,
      scanDurationMs: ticket.scan_duration_ms,
      deviceInfo: ticket.device_info
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    // Set security headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
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
    });
  } catch (error) {
    console.error('Checked-in tickets API error:', error);

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
