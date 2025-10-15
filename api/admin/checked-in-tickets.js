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

    // Validate filter parameter
    const validFilters = ['today', 'session', 'wallet', 'total'];
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
        total_count: 0,
        message: 'Session data is stored locally in browser',
        timezone: 'America/Denver'
      });
    }

    // Check if event_id column exists
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');

    // Build WHERE clauses based on filter and event ID
    const whereConditions = [];
    const queryParams = [];

    // Base condition: only checked-in tickets
    // We check for either last_scanned_at or checked_in_at being set
    whereConditions.push('(last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL)');

    // Apply filter-specific conditions
    if (filter === 'today') {
      // Calculate current Mountain Time offset (handles DST automatically)
      // During MST (winter): UTC-7, During MDT (summer): UTC-6
      const now = new Date();
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      const mtDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Denver' }));
      const offsetHours = Math.round((utcDate - mtDate) / (1000 * 60 * 60));

      // Convert UTC timestamps to MT by applying offset, then compare dates
      whereConditions.push(`date(COALESCE(last_scanned_at, checked_in_at), '${offsetHours} hours') = date('now', '${offsetHours} hours')`);
    } else if (filter === 'wallet') {
      whereConditions.push("qr_access_method IN ('apple_wallet', 'google_wallet', 'samsung_wallet')");
    }
    // 'total' filter has no additional conditions

    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      whereConditions.push('event_id = ?');
      queryParams.push(eventId);
    }

    // Build the query
    const query = `
      SELECT
        ticket_id,
        attendee_first_name,
        attendee_last_name,
        ticket_type,
        last_scanned_at,
        checked_in_at,
        scan_count,
        max_scan_count,
        qr_access_method,
        COALESCE(last_scanned_at, checked_in_at) as scan_time
      FROM tickets
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY scan_time DESC
      LIMIT 100
    `;

    const result = await db.execute(query, queryParams);

    // Process BigInt values
    const processedResult = processDatabaseResult(result);
    const tickets = processedResult.rows || [];

    // Enhance with Mountain Time formatted timestamps
    const enhancedTickets = tickets.map(ticket => ({
      ticket_id: ticket.ticket_id,
      first_name: ticket.attendee_first_name,
      last_name: ticket.attendee_last_name,
      ticket_type: ticket.ticket_type,
      scan_time: ticket.scan_time,
      scan_time_mt: timeUtils.formatDateTime(ticket.scan_time),
      scan_count: ticket.scan_count,
      max_scans: ticket.max_scan_count,
      wallet_source: ticket.qr_access_method
    }));

    // Set security headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      tickets: enhancedTickets,
      filter,
      total_count: tickets.length,
      timezone: 'America/Denver',
      timestamp: new Date().toISOString(),
      timestamp_mt: timeUtils.toMountainTime(new Date())
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
