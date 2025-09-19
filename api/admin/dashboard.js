import authService from '../../lib/auth-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';
import { columnExists, safeParseInt } from '../../lib/db-utils.js';
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';

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
    
    // Check if event_id columns exist
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');
    const transactionsHasEventId = await columnExists(db, 'transactions', 'event_id');
    
    // Build WHERE clauses based on eventId parameter and column existence
    const ticketWhereClause = eventId && ticketsHasEventId ? 'AND event_id = ?' : '';
    const transactionWhereClause = eventId && transactionsHasEventId ? 'AND event_id = ?' : '';
    
    // Parameters for the stats query
    const statsParams = [];
    
    // Build the stats query dynamically
    let statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM tickets WHERE status = 'valid' ${ticketWhereClause}) as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE checked_in_at IS NOT NULL ${ticketWhereClause}) as checked_in,
        (SELECT COUNT(DISTINCT transaction_id) FROM tickets WHERE 1=1 ${ticketWhereClause}) as total_orders,
        (SELECT SUM(amount_cents) / 100.0 FROM transactions WHERE status = 'completed' ${transactionWhereClause}) as total_revenue,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%workshop%' ${ticketWhereClause}) as workshop_tickets,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%vip%' ${ticketWhereClause}) as vip_tickets,
        (SELECT COUNT(*) FROM tickets WHERE date(created_at) = date('now') ${ticketWhereClause}) as today_sales,
        -- Wallet statistics
        (SELECT COUNT(*) FROM tickets WHERE qr_token IS NOT NULL ${ticketWhereClause}) as qr_generated,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'apple_wallet' ${ticketWhereClause}) as apple_wallet_users,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'google_wallet' ${ticketWhereClause}) as google_wallet_users,
        (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'web' ${ticketWhereClause}) as web_only_users
    `;
    
    // Add parameters for each subquery that uses event_id filtering
    if (eventId && ticketsHasEventId) {
      // Count the subqueries using tickets table:
      // total_tickets, checked_in, total_orders, workshop_tickets, vip_tickets, today_sales,
      // qr_generated, apple_wallet_users, google_wallet_users, web_only_users = 10 subqueries
      for (let i = 0; i < 10; i++) {
        statsParams.push(eventId);
      }
    }
    if (eventId && transactionsHasEventId) {
      // 1 subquery uses transactions table with event_id filtering
      statsParams.push(eventId);
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
      web_only_users: 0
    };

    // Get recent registrations with event filtering
    let recentRegistrationsQuery = `
      SELECT 
        t.ticket_id,
        t.attendee_first_name || ' ' || t.attendee_last_name as attendee_name,
        t.attendee_email,
        t.ticket_type,
        t.created_at,
        tr.transaction_id
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
    `;
    
    const recentRegistrationsParams = [];
    
    // Add WHERE clause for event filtering if applicable
    if (eventId && ticketsHasEventId) {
      recentRegistrationsQuery += ` WHERE t.event_id = ?`;
      recentRegistrationsParams.push(eventId);
    }
    
    recentRegistrationsQuery += `
      ORDER BY t.created_at DESC
      LIMIT 10
    `;
    
    const recentRegistrations = await db.execute(recentRegistrationsQuery, recentRegistrationsParams);

    // Get ticket type breakdown with event filtering
    let ticketBreakdownQuery = `
      SELECT 
        ticket_type,
        COUNT(*) as count,
        SUM(price_cents) / 100.0 as revenue
      FROM tickets
      WHERE status = 'valid'
    `;
    
    const ticketBreakdownParams = [];
    
    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      ticketBreakdownQuery += ` AND event_id = ?`;
      ticketBreakdownParams.push(eventId);
    }
    
    ticketBreakdownQuery += `
      GROUP BY ticket_type
      ORDER BY count DESC
    `;
    
    const ticketBreakdown = await db.execute(ticketBreakdownQuery, ticketBreakdownParams);

    // Get daily sales for the last 7 days with event filtering
    let dailySalesQuery = `
      SELECT 
        date(created_at) as date,
        COUNT(*) as tickets_sold,
        SUM(price_cents) / 100.0 as revenue
      FROM tickets
      WHERE created_at >= date('now', '-7 days')
    `;
    
    const dailySalesParams = [];
    
    // Add event filtering if applicable
    if (eventId && ticketsHasEventId) {
      dailySalesQuery += ` AND event_id = ?`;
      dailySalesParams.push(eventId);
    }
    
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
        console.warn("Could not fetch event info:", error);
      }
    }

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
