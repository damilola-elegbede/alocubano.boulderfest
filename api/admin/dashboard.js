import authService from "../lib/auth-service.js";
import { getDatabaseClient } from "../lib/database.js";
import { addSecurityHeaders } from "../lib/security-headers.js";

async function handler(req, res) {
  const db = await getDatabaseClient();

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Get dashboard statistics including wallet metrics
  const stats = await db.execute(`
    SELECT 
      (SELECT COUNT(*) FROM tickets WHERE status = 'valid') as total_tickets,
      (SELECT COUNT(*) FROM tickets WHERE checked_in_at IS NOT NULL) as checked_in,
      (SELECT COUNT(DISTINCT transaction_id) FROM tickets) as total_orders,
      (SELECT SUM(amount_cents) / 100.0 FROM transactions WHERE status = 'completed') as total_revenue,
      (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%workshop%') as workshop_tickets,
      (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%vip%') as vip_tickets,
      (SELECT COUNT(*) FROM tickets WHERE date(created_at) = date('now')) as today_sales,
      -- Wallet statistics
      (SELECT COUNT(*) FROM tickets WHERE qr_token IS NOT NULL) as qr_generated,
      (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'apple_wallet') as apple_wallet_users,
      (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'google_wallet') as google_wallet_users,
      (SELECT COUNT(*) FROM tickets WHERE qr_access_method = 'web') as web_only_users
  `);

  // Get recent registrations
  const recentRegistrations = await db.execute(`
    SELECT 
      t.ticket_id,
      t.attendee_first_name || ' ' || t.attendee_last_name as attendee_name,
      t.attendee_email,
      t.ticket_type,
      t.created_at,
      tr.transaction_id
    FROM tickets t
    JOIN transactions tr ON t.transaction_id = tr.id
    ORDER BY t.created_at DESC
    LIMIT 10
  `);

  // Get ticket type breakdown
  const ticketBreakdown = await db.execute(`
    SELECT 
      ticket_type,
      COUNT(*) as count,
      SUM(price_cents) / 100.0 as revenue
    FROM tickets
    WHERE status = 'valid'
    GROUP BY ticket_type
    ORDER BY count DESC
  `);

  // Get daily sales for the last 7 days
  const dailySales = await db.execute(`
    SELECT 
      date(created_at) as date,
      COUNT(*) as tickets_sold,
      SUM(price_cents) / 100.0 as revenue
    FROM tickets
    WHERE created_at >= date('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY date DESC
  `);

  res.status(200).json({
    stats: stats.rows[0],
    recentRegistrations: recentRegistrations.rows,
    ticketBreakdown: ticketBreakdown.rows,
    dailySales: dailySales.rows,
    timestamp: new Date().toISOString(),
  });
}

// Wrap with try-catch to ensure JSON errors
async function wrappedHandler(req, res) {
  try {
    // Apply security headers first
    await addSecurityHeaders(req, res, { isAPI: true });
    
    // Check authentication
    const token = authService.getSessionFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const session = authService.verifySessionToken(token);
    if (!session.valid) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    
    // Add admin info to request
    req.admin = session.admin;
    
    // Call the actual handler
    return await handler(req, res);
  } catch (error) {
    console.error("Dashboard API error:", error);
    // Always return JSON for errors
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: "Failed to fetch dashboard data",
        message: error.message 
      });
    }
  }
}

export default wrappedHandler;
