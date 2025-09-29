import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { isTestMode } from "../../lib/test-mode-utils.js";
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
    const eventId = req.query?.eventId ? parseInt(req.query.eventId, 10) : null;
    const includeTestData = req.query?.includeTestData === 'true';

    // Determine if we should filter test data
    const shouldFilterTestData = !includeTestData && !isTestMode(req);

    // Build query to get ticket types with statistics
    let query = `
      SELECT
        tt.id,
        tt.event_id,
        tt.stripe_price_id,
        tt.name,
        tt.description,
        tt.price_cents,
        tt.currency,
        tt.status,
        tt.max_quantity,
        tt.sold_count,
        tt.display_order,
        tt.metadata,
        tt.availability,
        tt.created_at,
        tt.updated_at,
        e.name as event_name,
        e.slug as event_slug,
        e.start_date as event_start_date,
        e.end_date as event_end_date,
        CASE
          WHEN tt.max_quantity > 0 THEN
            ROUND((CAST(tt.sold_count AS REAL) / CAST(tt.max_quantity AS REAL)) * 100, 2)
          ELSE 0
        END as availability_percentage,
        CASE
          WHEN tt.max_quantity > 0 THEN (tt.max_quantity - tt.sold_count)
          ELSE NULL
        END as remaining_quantity,
        COALESCE(
          (SELECT SUM(t.price_cents) FROM tickets t WHERE t.ticket_type = tt.id AND t.status = 'valid'),
          0
        ) as total_revenue_cents
      FROM ticket_types tt
      LEFT JOIN events e ON tt.event_id = e.id
      WHERE 1=1
    `;

    const params = [];

    // Filter by event if specified
    if (eventId) {
      query += ' AND tt.event_id = ?';
      params.push(eventId);
    }

    // Filter out test tickets in production
    if (shouldFilterTestData) {
      query += ' AND tt.status != ?';
      params.push('test');
    }

    query += ' ORDER BY tt.event_id, tt.display_order, tt.name';

    const result = await db.execute(query, params);

    // Calculate aggregate statistics
    const ticketTypes = result.rows || [];
    const stats = {
      total_ticket_types: ticketTypes.length,
      total_sold: ticketTypes.reduce((sum, tt) => sum + (tt.sold_count || 0), 0),
      total_capacity: ticketTypes.reduce((sum, tt) => sum + (tt.max_quantity || 0), 0),
      total_revenue_cents: ticketTypes.reduce((sum, tt) => sum + (tt.total_revenue_cents || 0), 0),
      by_status: {
        available: ticketTypes.filter(tt => tt.status === 'available').length,
        'sold-out': ticketTypes.filter(tt => tt.status === 'sold-out').length,
        'coming-soon': ticketTypes.filter(tt => tt.status === 'coming-soon').length,
        closed: ticketTypes.filter(tt => tt.status === 'closed').length,
        test: ticketTypes.filter(tt => tt.status === 'test').length
      },
      by_event: {}
    };

    // Group by event
    ticketTypes.forEach(tt => {
      const eventKey = tt.event_id || 'unknown';
      if (!stats.by_event[eventKey]) {
        stats.by_event[eventKey] = {
          event_id: tt.event_id,
          event_name: tt.event_name,
          event_slug: tt.event_slug,
          ticket_types: 0,
          total_sold: 0,
          total_capacity: 0,
          total_revenue_cents: 0
        };
      }
      stats.by_event[eventKey].ticket_types++;
      stats.by_event[eventKey].total_sold += tt.sold_count || 0;
      stats.by_event[eventKey].total_capacity += tt.max_quantity || 0;
      stats.by_event[eventKey].total_revenue_cents += tt.total_revenue_cents || 0;
    });

    // Set security headers to prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const responseData = {
      ticketTypes: timeUtils.enhanceApiResponse(ticketTypes, ['created_at', 'updated_at', 'event_start_date', 'event_end_date']),
      stats,
      filters: {
        eventId,
        includeTestData,
        shouldFilterTestData
      },
      timezone: 'America/Denver',
      currentTime: timeUtils.getCurrentTime(),
      timestamp: new Date().toISOString(),
      timestamp_mt: timeUtils.toMountainTime(new Date())
    };

    res.status(200).json(processDatabaseResult(responseData));
  } catch (error) {
    console.error('Ticket Types API error:', error);

    // More specific error handling
    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    if (error.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Request timeout' });
    }

    res.status(500).json({ error: 'Failed to fetch ticket types data' });
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

// Wrap the secured handler in an error-handling function
async function safeHandler(req, res) {
  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in ticket-types endpoint:', error);

    // Check if this is an auth initialization error
    if (error.message.includes('ADMIN_SECRET')) {
      return res.status(500).json({
        error: 'Authentication service unavailable',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? `Auth configuration error: ${error.message}`
          : 'Authentication service is temporarily unavailable',
        timestamp: new Date().toISOString()
      });
    }

    // Always return JSON error response
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