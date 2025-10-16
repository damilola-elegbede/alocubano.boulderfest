import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { columnExists, safeParseInt } from "../../lib/db-utils.js";
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

    // Check if required columns exist
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');
    const ticketsHasQrAccessMethod = await columnExists(db, 'tickets', 'qr_access_method');

    // Base WHERE condition for all stats: only checked-in tickets
    // This matches api/admin/checked-in-tickets.js logic
    const baseConditions = ['(last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL)'];
    const baseParams = [];

    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      baseConditions.push('event_id = ?');
      baseParams.push(eventId);
    }

    const baseWhere = baseConditions.join(' AND ');

    // Calculate Mountain Time offset for 'today' filter
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const mtDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Denver' }));
    const offsetHours = Math.round((utcDate - mtDate) / (1000 * 60 * 60));

    // Build all count queries
    const queries = {};

    // 1. Today's check-ins (Mountain Time)
    const todayConditions = [
      ...baseConditions,
      `date(COALESCE(last_scanned_at, checked_in_at), '-${Math.abs(offsetHours)} hours') = date('now', '-${Math.abs(offsetHours)} hours')`
    ];
    queries.today = {
      sql: `SELECT COUNT(*) as count FROM tickets WHERE ${todayConditions.join(' AND ')}`,
      params: baseParams
    };

    // 2. Total check-ins (all time)
    queries.total = {
      sql: `SELECT COUNT(*) as count FROM tickets WHERE ${baseWhere}`,
      params: baseParams
    };

    // 3. Apple Wallet check-ins
    if (ticketsHasQrAccessMethod) {
      const appleConditions = [...baseConditions, "qr_access_method = 'apple_wallet'"];
      queries.apple_wallet = {
        sql: `SELECT COUNT(*) as count FROM tickets WHERE ${appleConditions.join(' AND ')}`,
        params: baseParams
      };

      // 4. Google Wallet check-ins
      const googleConditions = [...baseConditions, "qr_access_method IN ('google_wallet', 'samsung_wallet')"];
      queries.google_wallet = {
        sql: `SELECT COUNT(*) as count FROM tickets WHERE ${googleConditions.join(' AND ')}`,
        params: baseParams
      };
    } else {
      // If column doesn't exist, set wallet stats to 0
      queries.apple_wallet = { count: 0 };
      queries.google_wallet = { count: 0 };
    }

    // Execute all queries
    const results = await Promise.all([
      db.execute(queries.today.sql, queries.today.params),
      db.execute(queries.total.sql, queries.total.params),
      ticketsHasQrAccessMethod ? db.execute(queries.apple_wallet.sql, queries.apple_wallet.params) : Promise.resolve({ rows: [{ count: 0 }] }),
      ticketsHasQrAccessMethod ? db.execute(queries.google_wallet.sql, queries.google_wallet.params) : Promise.resolve({ rows: [{ count: 0 }] })
    ]);

    // Extract counts
    const stats = {
      today: results[0].rows[0]?.count || 0,
      total: results[1].rows[0]?.count || 0,
      apple_wallet: results[2].rows[0]?.count || 0,
      google_wallet: results[3].rows[0]?.count || 0,
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
