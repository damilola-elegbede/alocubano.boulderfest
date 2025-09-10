import { getAuthService } from '../../lib/auth-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import { withSecurityHeaders } from '../../lib/security-headers.js';
import { columnExists, safeParseInt } from '../../lib/db-utils.js';

async function handler(req, res) {
  try {
    console.log('Dashboard API: Starting request');
    const db = await getDatabaseClient();
    console.log('Dashboard API: Database client obtained');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).end('Method Not Allowed');
    }

    // Get query parameters with proper NaN handling
    const eventId = safeParseInt(req.query.eventId);
    
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
        (SELECT COUNT(DISTINCT transaction_id) FROM tickets WHERE status = 'valid' ${ticketWhereClause}) as total_orders,
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
    const ticketSubqueryCount = (statsQuery.match(/FROM tickets/g) || []).length;
    if (eventId && ticketsHasEventId) {
      for (let i = 0; i < ticketSubqueryCount; i++) {
        statsParams.push(eventId);
      }
    }
    
    if (eventId && transactionsHasEventId) {
      // Count the subqueries using transactions table: total_revenue
      statsParams.push(eventId);
    }
    
    // Execute stats query
    const statsResult = await db.execute({
      sql: statsQuery,
      args: statsParams
    });
    const stats = statsResult.rows[0] || {};

    // Get recent tickets
    const recentTicketsQuery = ticketsHasEventId && eventId
      ? `SELECT 
          id, 
          customer_email, 
          ticket_type, 
          status,
          created_at
        FROM tickets 
        WHERE event_id = ?
        ORDER BY created_at DESC 
        LIMIT 5`
      : `SELECT 
          id, 
          customer_email, 
          ticket_type, 
          status,
          created_at
        FROM tickets 
        ORDER BY created_at DESC 
        LIMIT 5`;
    
    const recentTicketsParams = ticketsHasEventId && eventId ? [eventId] : [];
    
    const recentTicketsResult = await db.execute({
      sql: recentTicketsQuery,
      args: recentTicketsParams
    });

    // Get sales by day for the chart
    const salesByDayQuery = ticketsHasEventId && eventId
      ? `SELECT 
          date(created_at) as date,
          COUNT(*) as tickets_sold,
          SUM(CASE 
            WHEN ticket_type LIKE '%workshop%' THEN 1 
            ELSE 0 
          END) as workshop_tickets
        FROM tickets 
        WHERE created_at >= date('now', '-30 days')
        AND event_id = ?
        GROUP BY date(created_at)
        ORDER BY date DESC`
      : `SELECT 
          date(created_at) as date,
          COUNT(*) as tickets_sold,
          SUM(CASE 
            WHEN ticket_type LIKE '%workshop%' THEN 1 
            ELSE 0 
          END) as workshop_tickets
        FROM tickets 
        WHERE created_at >= date('now', '-30 days')
        GROUP BY date(created_at)
        ORDER BY date DESC`;
    
    const salesByDayParams = ticketsHasEventId && eventId ? [eventId] : [];
    
    const salesByDayResult = await db.execute({
      sql: salesByDayQuery,
      args: salesByDayParams
    });

    // Get ticket type distribution
    const ticketDistributionQuery = ticketsHasEventId && eventId
      ? `SELECT 
          ticket_type,
          COUNT(*) as count
        FROM tickets 
        WHERE status = 'valid'
        AND event_id = ?
        GROUP BY ticket_type`
      : `SELECT 
          ticket_type,
          COUNT(*) as count
        FROM tickets 
        WHERE status = 'valid'
        GROUP BY ticket_type`;
    
    const ticketDistributionParams = ticketsHasEventId && eventId ? [eventId] : [];
    
    const ticketDistributionResult = await db.execute({
      sql: ticketDistributionQuery,
      args: ticketDistributionParams
    });

    res.status(200).json({
      stats: {
        totalTickets: stats.total_tickets || 0,
        checkedIn: stats.checked_in || 0,
        totalOrders: stats.total_orders || 0,
        totalRevenue: stats.total_revenue || 0,
        workshopTickets: stats.workshop_tickets || 0,
        vipTickets: stats.vip_tickets || 0,
        todaySales: stats.today_sales || 0,
        qrGenerated: stats.qr_generated || 0,
        appleWalletUsers: stats.apple_wallet_users || 0,
        googleWalletUsers: stats.google_wallet_users || 0,
        webOnlyUsers: stats.web_only_users || 0
      },
      recentTickets: recentTicketsResult.rows || [],
      salesByDay: salesByDayResult.rows || [],
      ticketDistribution: ticketDistributionResult.rows || []
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    console.error('Error stack:', error.stack);
    
    // More specific error handling
    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }
    
    if (error.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Request timeout' });
    }
    
    // Return more details in development
    const errorDetails = process.env.NODE_ENV === 'development' 
      ? { error: 'Failed to fetch dashboard data', details: error.message }
      : { error: 'Failed to fetch dashboard data' };
    
    res.status(500).json(errorDetails);
  }
}

// Wrap with auth middleware using lazy initialization
export default withSecurityHeaders(async (req, res) => {
  try {
    const authService = getAuthService();
    return await authService.requireAuth(handler)(req, res);
  } catch (error) {
    console.error('Dashboard auth middleware error:', error);
    if (error.message && error.message.includes('❌ FATAL:')) {
      return res.status(503).json({ 
        error: 'Service temporarily unavailable',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});