import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { columnExists, safeParseInt } from "../../lib/db-utils.js";
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

    // Get query parameters with proper NaN handling
    const eventId = safeParseInt(req.query?.eventId);

    // Calculate Mountain Time offset dynamically (handles DST correctly)
    // MST = UTC-7, MDT = UTC-6
    const timezoneInfo = timeUtils.getTimezoneInfo();
    if (!timezoneInfo || typeof timezoneInfo.offsetHours !== 'number') {
      throw new Error('Failed to get timezone information');
    }
    
    const offsetHours = timezoneInfo.offsetHours; // Negative value: -6 or -7

    // Validate offset is within Mountain Time range (UTC-6 or UTC-7)
    if (Math.abs(offsetHours) < 6 || Math.abs(offsetHours) > 7) {
      throw new Error(`Invalid MT offset: ${offsetHours} (expected -6 or -7)`);
    }

    // Format offset for SQLite date() function (e.g., '-6 hours' or '-7 hours')
    const mtOffset = `'${offsetHours} hours'`;

    // Check if event_id column exists
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');
    const transactionsHasEventId = await columnExists(db, 'transactions', 'event_id');

    // Build WHERE clauses based on eventId parameter and column existence
    const ticketWhereClause = eventId && ticketsHasEventId ? 'AND event_id = ?' : '';
    const transactionWhereClause = eventId && transactionsHasEventId ? 'AND event_id = ?' : '';
    // For JOIN queries that use table alias 't' for tickets
    const ticketWhereClauseWithAlias = eventId && ticketsHasEventId ? 'AND t.event_id = ?' : '';

    // Parameters for the stats query
    const statsParams = [];

    // Build the stats query dynamically
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE status = 'valid' ${ticketWhereClause}) as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE (last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL) ${ticketWhereClause}) as checked_in,
        (SELECT COUNT(DISTINCT transaction_id) FROM tickets WHERE 1=1 ${ticketWhereClause}) as total_orders,
        (SELECT COALESCE(SUM(t.price_cents), 0) / 100.0 FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE t.status = 'valid' AND COALESCE(tr.payment_processor, '') <> 'comp' AND tr.status = 'completed' ${ticketWhereClauseWithAlias}) as total_revenue,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%workshop%' ${ticketWhereClause}) as workshop_tickets,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%vip%' ${ticketWhereClause}) as vip_tickets,
        -- Today's sales (using dynamic DST-aware Mountain Time offset)
        (SELECT COUNT(*) FROM tickets WHERE date(created_at, ${mtOffset}) = date('now', ${mtOffset}) ${ticketWhereClause}) as today_sales,
        -- Wallet statistics
        (SELECT COUNT(*) FROM tickets WHERE qr_token IS NOT NULL ${ticketWhereClause}) as qr_generated,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'apple_wallet' ${ticketWhereClause}) as apple_wallet_users,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'google_wallet' ${ticketWhereClause}) as google_wallet_users,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'web' ${ticketWhereClause}) as web_only_users,
        -- Test mode statistics
        (SELECT COUNT(*) FROM tickets WHERE is_test = 1 ${ticketWhereClause}) as test_tickets,
        (SELECT COUNT(*) FROM transactions WHERE is_test = 1 AND id IN (SELECT DISTINCT transaction_id FROM tickets WHERE 1=1 ${ticketWhereClause})) as test_transactions,
        (SELECT COALESCE(SUM(t.price_cents), 0) / 100.0 FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE t.status = 'valid' AND tr.is_test = 1 AND COALESCE(tr.payment_processor, '') <> 'comp' AND tr.status = 'completed' ${ticketWhereClauseWithAlias}) as test_revenue,
        -- Check-in statistics (using actual scan timestamps with Mountain Time, not UTC)
        (SELECT COUNT(*) FROM tickets WHERE (last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL) AND date(COALESCE(last_scanned_at, checked_in_at), ${mtOffset}) = date('now', ${mtOffset}) ${ticketWhereClause}) as today_checkins,
        (SELECT COUNT(*) FROM tickets WHERE (last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL) AND qr_access_method IN ('apple_wallet', 'google_wallet', 'samsung_wallet') ${ticketWhereClause}) as wallet_checkins,
        -- Manual entry statistics
        (SELECT COUNT(DISTINCT id) FROM transactions WHERE source = 'manual_entry' AND status = 'completed' AND id IN (SELECT DISTINCT transaction_id FROM tickets WHERE 1=1 ${ticketWhereClause})) as manual_transactions,
        (SELECT COUNT(*) FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE tr.source = 'manual_entry' AND t.status = 'valid' ${ticketWhereClauseWithAlias}) as manual_tickets,
        (SELECT COUNT(*) FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'cash' AND t.status = 'valid' ${ticketWhereClauseWithAlias}) as manual_cash_tickets,
        (SELECT COUNT(*) FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'card_terminal' AND t.status = 'valid' ${ticketWhereClauseWithAlias}) as manual_card_tickets,
        (SELECT COUNT(*) FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'venmo' AND t.status = 'valid' ${ticketWhereClauseWithAlias}) as manual_venmo_tickets,
        (SELECT COUNT(*) FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'comp' AND t.status = 'valid' ${ticketWhereClauseWithAlias}) as manual_comp_tickets,
        (SELECT COALESCE(SUM(t.price_cents), 0) / 100.0 FROM tickets t JOIN transactions tr ON t.transaction_id = tr.id WHERE t.status = 'valid' AND tr.source = 'manual_entry' AND COALESCE(tr.payment_processor, '') <> 'comp' AND tr.status = 'completed' ${ticketWhereClauseWithAlias}) as manual_revenue
    `;

    // Add parameters for each subquery that uses event_id filtering
    if (eventId && ticketsHasEventId) {
      // Count all subqueries that use ${ticketWhereClause} or ${ticketWhereClauseWithAlias}:
      // 1. total_tickets
      // 2. checked_in
      // 3. total_orders
      // 4. total_revenue (subquery: SELECT DISTINCT transaction_id FROM tickets...)
      // 5. workshop_tickets
      // 6. vip_tickets
      // 7. today_sales
      // 8. qr_generated
      // 9. apple_wallet_users
      // 10. google_wallet_users
      // 11. web_only_users
      // 12. test_tickets
      // 13. test_transactions (subquery: SELECT DISTINCT transaction_id FROM tickets...)
      // 14. test_revenue (subquery: SELECT DISTINCT transaction_id FROM tickets...)
      // 15. today_checkins
      // 16. wallet_checkins
      // 17. manual_transactions (subquery: SELECT DISTINCT transaction_id FROM tickets...)
      // 18. manual_tickets (uses ticketWhereClauseWithAlias)
      // 19. manual_cash_tickets (uses ticketWhereClauseWithAlias)
      // 20. manual_card_tickets (uses ticketWhereClauseWithAlias)
      // 21. manual_venmo_tickets (uses ticketWhereClauseWithAlias)
      // 22. manual_comp_tickets (uses ticketWhereClauseWithAlias)
      // 23. manual_revenue (subquery: SELECT DISTINCT transaction_id FROM tickets...)
      // Total: 23 parameters needed
      for (let i = 0; i < 23; i++) {
        statsParams.push(eventId);
      }
    }

    const statsResult = await db.execute(statsQuery, statsParams);

    // Handle empty results gracefully
    const stats = statsResult.rows[0] || {
      total_tickets: 0,
      checked_in: 0,
      total_orders: 0,
      total_revenue: 0,
      workshop_tickets: 0,
      vip_tickets: 0,
      today_sales: 0,
      qr_generated: 0,
      apple_wallet_users: 0,
      google_wallet_users: 0,
      web_only_users: 0,
      // Test mode stats (will be 0 if columns don't exist)
      test_tickets: 0,
      test_transactions: 0,
      test_revenue: 0,
      // Check-in stats
      today_checkins: 0,
      wallet_checkins: 0,
      // Manual entry stats
      manual_transactions: 0,
      manual_tickets: 0,
      manual_cash_tickets: 0,
      manual_card_tickets: 0,
      manual_venmo_tickets: 0,
      manual_comp_tickets: 0,
      manual_revenue: 0
    };

    // Get recent registrations with event filtering
    let recentRegistrationsQuery = `
      SELECT
        t.ticket_id,
        t.attendee_first_name || ' ' || t.attendee_last_name as attendee_name,
        t.attendee_email,
        t.ticket_type,
        t.created_at,
        tr.transaction_id,
        tr.payment_processor,
        tr.stripe_session_id,
        tr.paypal_order_id,
        tr.paypal_capture_id,
        t.is_test,
        tr.is_test as transaction_is_test
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
    `;

    const recentRegistrationsParams = [];
    const whereConditions = [];

    // Add WHERE clause for event filtering if applicable
    if (eventId && ticketsHasEventId) {
      whereConditions.push('t.event_id = ?');
      recentRegistrationsParams.push(eventId);
    }

    if (whereConditions.length > 0) {
      recentRegistrationsQuery += ' WHERE ' + whereConditions.join(' AND ');
    }

    recentRegistrationsQuery += `
      ORDER BY t.created_at DESC
      LIMIT 10
    `;

    const recentRegistrations = await db.execute(recentRegistrationsQuery, recentRegistrationsParams);

    // Get ticket type breakdown with event filtering
    const ticketBreakdownParams = [];
    const breakdownConditions = ['t.status = \'valid\''];

    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      breakdownConditions.push('t.event_id = ?');
      ticketBreakdownParams.push(eventId);
    }

    const ticketBreakdownQuery = `
      SELECT
        t.ticket_type,
        COUNT(*) as count,
        SUM(t.price_cents) / 100.0 as revenue,
        SUM(CASE WHEN t.is_test = 1 THEN 1 ELSE 0 END) as test_count,
        SUM(CASE WHEN t.is_test = 0 THEN 1 ELSE 0 END) as production_count
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE ${breakdownConditions.join(' AND ')}
        AND COALESCE(tr.payment_processor, '') <> 'comp'
      GROUP BY t.ticket_type
      ORDER BY count DESC
    `;

    const ticketBreakdown = await db.execute(ticketBreakdownQuery, ticketBreakdownParams);

    // Get daily sales for the last 7 days with event filtering (using dynamic DST-aware Mountain Time offset)
    const dailySalesParams = [];
    const dailySalesConditions = [`created_at >= date('now', ${mtOffset}, '-7 days')`];

    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      dailySalesConditions.push('event_id = ?');
      dailySalesParams.push(eventId);
    }

    const dailySalesQuery = `
      SELECT
        date(created_at, ${mtOffset}) as date,
        COUNT(*) as tickets_sold,
        SUM(price_cents) / 100.0 as revenue,
        SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_tickets_sold,
        SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_tickets_sold
      FROM tickets
      WHERE ${dailySalesConditions.join(' AND ')}
      GROUP BY date(created_at, ${mtOffset})
      ORDER BY date DESC
    `;

    const dailySales = await db.execute(dailySalesQuery, dailySalesParams);

    // Get event information if filtering by specific event
    let eventInfo = null;
    if (eventId) {
      try {
        const eventResult = await db.execute(
          `SELECT id, name, slug, type, status, start_date, end_date
           FROM events WHERE id = ?`,
          [eventId]
        );
        eventInfo = eventResult.rows[0] || null;
      } catch (error) {
        console.warn('Could not fetch event info:', error);
      }
    }

    // Get all events from database
    let events = [];
    try {
      const eventsQuery = `
        SELECT
          id,
          name,
          slug,
          type,
          status,
          start_date,
          end_date,
          venue_name,
          venue_city,
          venue_state,
          max_capacity,
          is_featured,
          is_visible,
          display_order
        FROM events
        WHERE 1=1
        -- Always show test events in admin dashboard
        ORDER BY display_order, start_date DESC
      `;
      const eventsResult = await db.execute(eventsQuery);
      events = eventsResult.rows || [];
    } catch (error) {
      console.warn('Could not fetch events list:', error);
    }

    // Get ticket types with sold_count from database
    let ticketTypes = [];
    try {
      const ticketTypesQuery = `
        SELECT
          tt.id,
          tt.event_id,
          tt.name,
          tt.description,
          tt.price_cents,
          tt.currency,
          tt.status,
          tt.max_quantity,
          tt.sold_count,
          tt.display_order,
          e.name as event_name,
          e.slug as event_slug,
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
            (SELECT SUM(t.price_cents)
             FROM tickets t
             JOIN transactions tr ON t.transaction_id = tr.id
             WHERE t.ticket_type_id = tt.id
             AND t.status = 'valid'
             AND COALESCE(tr.payment_processor, '') <> 'comp'),
            0
          ) as total_revenue_cents
        FROM ticket_types tt
        LEFT JOIN events e ON tt.event_id = e.id
        WHERE 1=1
        ORDER BY tt.event_id, tt.display_order, tt.name
      `;
      const ticketTypesParams = [];
      const ticketTypesResult = await db.execute(ticketTypesQuery, ticketTypesParams);
      ticketTypes = ticketTypesResult.rows || [];
    } catch (error) {
      console.warn('Could not fetch ticket types:', error);
    }

    // Set security headers to prevent caching of admin dashboard data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const responseData = {
      stats: stats,
      recentRegistrations: timeUtils.enhanceApiResponse(recentRegistrations.rows || [], ['created_at']),
      ticketBreakdown: ticketBreakdown.rows || [],
      dailySales: dailySales.rows || [],
      events: timeUtils.enhanceApiResponse(events, ['start_date', 'end_date']),
      ticketTypes: timeUtils.enhanceApiResponse(ticketTypes, []),
      eventInfo: eventInfo ? timeUtils.enhanceApiResponse(eventInfo, ['start_date', 'end_date']) : null,
      eventId,
      hasEventFiltering: {
        tickets: ticketsHasEventId,
        transactions: transactionsHasEventId
      },
      timezone: 'America/Denver',
      currentTime: timeUtils.getCurrentTime(),
      timestamp: new Date().toISOString(),
      timestamp_mt: timeUtils.toMountainTime(new Date())
    };

    res.status(200).json(processDatabaseResult(responseData));
  } catch (error) {
    console.error('Dashboard API error:', error);

    // More specific error handling
    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    if (error.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Request timeout' });
    }

    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
}

// Build the middleware chain once, outside of request handling
// IMPORTANT: Audit middleware must be outside auth middleware to capture unauthorized access
const securedHandler = withSecurityHeaders(
  withAdminAudit(
    authService.requireAuth(handler),
    {
      logBody: false, // Dashboard requests don't need body logging
      logMetadata: true,
      skipMethods: [] // Log all methods including GET for dashboard access tracking
    }
  )
);

// Wrap the secured handler in an error-handling function
// to ensure all errors are returned as JSON
async function safeHandler(req, res) {
  try {
    // Execute the pre-built secured handler
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in dashboard endpoint:', error);

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

    // Always return JSON error response for other errors
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
