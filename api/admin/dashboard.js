import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { columnExists, safeParseInt } from "../../lib/db-utils.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { isTestMode, createTestModeFilter } from "../../lib/test-mode-utils.js";

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
    
    // Support both testMode and includeTestData parameters for backward compatibility
    const rawIncludeTestData = req.query?.includeTestData;
    const rawTestMode = req.query?.testMode;
    
    // Normalize parameters - prefer includeTestData if both exist
    let includeTestData;
    if (rawIncludeTestData !== undefined) {
      includeTestData = rawIncludeTestData === 'true' ? true : 
                       rawIncludeTestData === 'false' ? false : null;
    } else if (rawTestMode !== undefined) {
      includeTestData = rawTestMode === 'true' ? true : 
                       rawTestMode === 'false' ? false : null;
    } else {
      includeTestData = null;
    }

    // Check if event_id and is_test columns exist
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');
    const transactionsHasEventId = await columnExists(db, 'transactions', 'event_id');
    const ticketsHasTestMode = await columnExists(db, 'tickets', 'is_test');
    const transactionsHasTestMode = await columnExists(db, 'transactions', 'is_test');

    // Determine if we should filter test data
    // If includeTestData is explicitly set, use that; otherwise auto-detect based on test mode
    const shouldFilterTestData = includeTestData === null ? !isTestMode(req) : !includeTestData;

    // Build WHERE clauses based on eventId parameter and column existence
    const ticketWhereClause = eventId && ticketsHasEventId ? 'AND event_id = ?' : '';
    const transactionWhereClause = eventId && transactionsHasEventId ? 'AND event_id = ?' : '';

    // Add test mode filtering
    const ticketTestFilter = shouldFilterTestData && ticketsHasTestMode ? 'AND is_test = 0' : '';
    const transactionTestFilter = shouldFilterTestData && transactionsHasTestMode ? 'AND is_test = 0' : '';

    // Parameters for the stats query
    const statsParams = [];

    // Build the stats query dynamically with test mode awareness
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE status = 'valid' ${ticketWhereClause} ${ticketTestFilter}) as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE checked_in_at IS NOT NULL ${ticketWhereClause} ${ticketTestFilter}) as checked_in,
        (SELECT COUNT(DISTINCT transaction_id) FROM tickets WHERE 1=1 ${ticketWhereClause} ${ticketTestFilter}) as total_orders,
        (SELECT SUM(amount_cents) / 100.0 FROM transactions WHERE status = 'completed' ${transactionWhereClause} ${transactionTestFilter}) as total_revenue,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%workshop%' ${ticketWhereClause} ${ticketTestFilter}) as workshop_tickets,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%vip%' ${ticketWhereClause} ${ticketTestFilter}) as vip_tickets,
        (SELECT COUNT(*) FROM tickets WHERE date(created_at) = date('now') ${ticketWhereClause} ${ticketTestFilter}) as today_sales,
        -- Wallet statistics
        (SELECT COUNT(*) FROM tickets WHERE qr_token IS NOT NULL ${ticketWhereClause} ${ticketTestFilter}) as qr_generated,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'apple_wallet' ${ticketWhereClause} ${ticketTestFilter}) as apple_wallet_users,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'google_wallet' ${ticketWhereClause} ${ticketTestFilter}) as google_wallet_users,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'web' ${ticketWhereClause} ${ticketTestFilter}) as web_only_users
        ${ticketsHasTestMode && transactionsHasTestMode ? `,
        -- Test mode statistics (only if test mode columns exist)
        (SELECT COUNT(*) FROM tickets WHERE is_test = 1 ${ticketWhereClause}) as test_tickets,
        (SELECT COUNT(*) FROM transactions WHERE is_test = 1 ${transactionWhereClause}) as test_transactions,
        (SELECT SUM(amount_cents) / 100.0 FROM transactions WHERE is_test = 1 AND status = 'completed' ${transactionWhereClause}) as test_revenue
        ` : ''}
    `;

    // Add parameters for each subquery that uses event_id filtering
    if (eventId && ticketsHasEventId) {
      // Count the subqueries using tickets table:
      // total_tickets, checked_in, total_orders, workshop_tickets, vip_tickets, today_sales,
      // qr_generated, apple_wallet_users, google_wallet_users, web_only_users = 10 subqueries
      for (let i = 0; i < 10; i++) {
        statsParams.push(eventId);
      }

      // Add parameters for test mode subqueries if they exist and use event_id
      if (ticketsHasTestMode && transactionsHasTestMode) {
        // test_tickets subquery uses tickets table
        statsParams.push(eventId);
      }
    }
    if (eventId && transactionsHasEventId) {
      // 1 subquery uses transactions table with event_id filtering (total_revenue)
      statsParams.push(eventId);

      // Add parameters for test mode subqueries if they exist and use event_id
      if (ticketsHasTestMode && transactionsHasTestMode) {
        // test_transactions and test_revenue subqueries use transactions table
        statsParams.push(eventId);
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
      test_revenue: 0
    };

    // Get recent registrations with event filtering and test mode filtering
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
        ${ticketsHasTestMode ? 't.is_test,' : '0 as is_test,'}
        ${transactionsHasTestMode ? 'tr.is_test as transaction_is_test' : '0 as transaction_is_test'}
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

    // Add test mode filtering if in production
    if (shouldFilterTestData && ticketsHasTestMode) {
      whereConditions.push('t.is_test = 0');
    }

    if (whereConditions.length > 0) {
      recentRegistrationsQuery += ' WHERE ' + whereConditions.join(' AND ');
    }

    recentRegistrationsQuery += `
      ORDER BY t.created_at DESC
      LIMIT 10
    `;

    const recentRegistrations = await db.execute(recentRegistrationsQuery, recentRegistrationsParams);

    // Get ticket type breakdown with event filtering and test mode filtering
    let ticketBreakdownQuery = `
      SELECT
        ticket_type,
        COUNT(*) as count,
        SUM(price_cents) / 100.0 as revenue,
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,' : '0 as test_count,'}
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count' : 'COUNT(*) as production_count'}
      FROM tickets
      WHERE status = 'valid'
    `;

    const ticketBreakdownParams = [];
    const breakdownConditions = ['status = \'valid\''];

    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      breakdownConditions.push('event_id = ?');
      ticketBreakdownParams.push(eventId);
    }

    // Add test mode filtering if in production
    if (shouldFilterTestData && ticketsHasTestMode) {
      breakdownConditions.push('is_test = 0');
    }

    ticketBreakdownQuery = `
      SELECT
        ticket_type,
        COUNT(*) as count,
        SUM(price_cents) / 100.0 as revenue,
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,' : '0 as test_count,'}
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count' : 'COUNT(*) as production_count'}
      FROM tickets
      WHERE ${breakdownConditions.join(' AND ')}
    `;

    ticketBreakdownQuery += `
      GROUP BY ticket_type
      ORDER BY count DESC
    `;

    const ticketBreakdown = await db.execute(ticketBreakdownQuery, ticketBreakdownParams);

    // Get daily sales for the last 7 days with event filtering and test mode filtering
    let dailySalesQuery = `
      SELECT
        date(created_at) as date,
        COUNT(*) as tickets_sold,
        SUM(price_cents) / 100.0 as revenue,
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_tickets_sold,' : '0 as test_tickets_sold,'}
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_tickets_sold' : 'COUNT(*) as production_tickets_sold'}
      FROM tickets
      WHERE created_at >= date('now', '-7 days')
    `;

    const dailySalesParams = [];
    const dailySalesConditions = ['created_at >= date(\'now\', \'-7 days\')'];

    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      dailySalesConditions.push('event_id = ?');
      dailySalesParams.push(eventId);
    }

    // Add test mode filtering if in production
    if (shouldFilterTestData && ticketsHasTestMode) {
      dailySalesConditions.push('is_test = 0');
    }

    dailySalesQuery = `
      SELECT
        date(created_at) as date,
        COUNT(*) as tickets_sold,
        SUM(price_cents) / 100.0 as revenue,
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_tickets_sold,' : '0 as test_tickets_sold,'}
        ${ticketsHasTestMode ? 'SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_tickets_sold' : 'COUNT(*) as production_tickets_sold'}
      FROM tickets
      WHERE ${dailySalesConditions.join(' AND ')}
    `;

    dailySalesQuery += `
      GROUP BY date(created_at)
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

    // Set security headers to prevent caching of admin dashboard data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      stats: stats,
      recentRegistrations: recentRegistrations.rows || [],
      ticketBreakdown: ticketBreakdown.rows || [],
      dailySales: dailySales.rows || [],
      eventInfo,
      eventId,
      hasEventFiltering: {
        tickets: ticketsHasEventId,
        transactions: transactionsHasEventId
      },
      testModeInfo: {
        isTestMode: isTestMode(req),
        includeTestData: includeTestData,
        hasTestModeSupport: ticketsHasTestMode && transactionsHasTestMode,
        filteringTestData: shouldFilterTestData,
        testModeColumns: {
          tickets: ticketsHasTestMode,
          transactions: transactionsHasTestMode
        }
      },
      timestamp: new Date().toISOString()
    });
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
