import authService from "../lib/auth-service.js";
import { getDatabaseClient } from "../lib/database.js";
import { addSecurityHeaders } from "../lib/security-headers.js";

async function handler(req, res) {
  const db = await getDatabaseClient();

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Get list of available events with metadata from tickets and transactions tables
    const eventsQuery = `
      SELECT 
        event_id,
        MIN(event_date) as earliest_date,
        MAX(event_date) as latest_date,
        COUNT(DISTINCT t.id) as total_tickets,
        COUNT(DISTINCT t.transaction_id) as total_orders,
        SUM(CASE WHEN t.status = 'valid' THEN 1 ELSE 0 END) as active_tickets,
        SUM(CASE WHEN t.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) as checked_in_tickets,
        SUM(t.price_cents) / 100.0 as total_revenue,
        CASE 
          WHEN MAX(t.event_date) < DATE('now') THEN 'past'
          WHEN MIN(t.event_date) > DATE('now') THEN 'upcoming'
          WHEN MIN(t.event_date) <= DATE('now') AND MAX(t.event_date) >= DATE('now') THEN 'active'
          ELSE 'draft'
        END as status,
        MIN(t.created_at) as first_ticket_created,
        MAX(t.created_at) as last_ticket_created
      FROM tickets t
      WHERE t.event_id IS NOT NULL
      GROUP BY t.event_id
      
      UNION ALL
      
      SELECT 
        tr.event_id,
        NULL as earliest_date,
        NULL as latest_date,
        0 as total_tickets,
        COUNT(DISTINCT tr.id) as total_orders,
        0 as active_tickets,
        0 as checked_in_tickets,
        SUM(CASE WHEN tr.status = 'completed' THEN tr.amount_cents ELSE 0 END) / 100.0 as total_revenue,
        CASE 
          WHEN tr.event_id IS NOT NULL THEN 'transaction_only'
          ELSE 'unknown'
        END as status,
        MIN(tr.created_at) as first_ticket_created,
        MAX(tr.created_at) as last_ticket_created
      FROM transactions tr
      WHERE tr.event_id IS NOT NULL 
        AND tr.event_id NOT IN (SELECT DISTINCT event_id FROM tickets WHERE event_id IS NOT NULL)
      GROUP BY tr.event_id
      
      ORDER BY first_ticket_created DESC
    `;

    const eventsResult = await db.execute(eventsQuery);
    
    // Process events to combine ticket and transaction data, and add event names
    const eventsMap = new Map();
    
    eventsResult.rows.forEach(row => {
      const eventId = row.event_id;
      if (eventsMap.has(eventId)) {
        // Merge with existing event data
        const existing = eventsMap.get(eventId);
        existing.total_orders += row.total_orders;
        existing.total_revenue += row.total_revenue;
        if (row.earliest_date && !existing.earliest_date) {
          existing.earliest_date = row.earliest_date;
          existing.latest_date = row.latest_date;
          existing.status = row.status;
        }
      } else {
        // Add new event
        eventsMap.set(eventId, { ...row });
      }
    });

    // Convert to array and add event names
    const events = Array.from(eventsMap.values()).map(event => {
      // Generate human-readable event name based on event_id and dates
      let eventName = event.event_id;
      
      // Try to make event names more readable
      if (event.event_id.includes('2026') || event.event_id.includes('2025') || event.event_id.includes('2024')) {
        // Extract year and make it more readable
        if (event.event_id.includes('boulderfest') || event.event_id.includes('cubano')) {
          eventName = `A Lo Cubano Boulder Fest ${event.event_id.match(/\d{4}/)?.[0] || ''}`;
        }
      }
      
      // Add date range to name if available
      if (event.earliest_date) {
        const startDate = new Date(event.earliest_date).toLocaleDateString();
        if (event.earliest_date === event.latest_date) {
          eventName += ` (${startDate})`;
        } else {
          const endDate = new Date(event.latest_date).toLocaleDateString();
          eventName += ` (${startDate} - ${endDate})`;
        }
      }

      return {
        id: event.event_id,
        name: eventName,
        earliest_date: event.earliest_date,
        latest_date: event.latest_date,
        total_tickets: event.total_tickets || 0,
        total_orders: event.total_orders || 0,
        active_tickets: event.active_tickets || 0,
        checked_in_tickets: event.checked_in_tickets || 0,
        total_revenue: event.total_revenue || 0,
        status: event.status || 'unknown',
        first_ticket_created: event.first_ticket_created,
        last_ticket_created: event.last_ticket_created
      };
    });

    // Sort by status priority (active, upcoming, past, draft, unknown) then by date
    const statusPriority = { 'active': 1, 'upcoming': 2, 'past': 3, 'draft': 4, 'transaction_only': 5, 'unknown': 6 };
    events.sort((a, b) => {
      const priorityDiff = (statusPriority[a.status] || 6) - (statusPriority[b.status] || 6);
      if (priorityDiff !== 0) return priorityDiff;
      
      // If same priority, sort by date (newest first)
      return new Date(b.first_ticket_created || 0) - new Date(a.first_ticket_created || 0);
    });

    res.status(200).json({
      events,
      totalEvents: events.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Events API error:", error);
    res.status(500).json({ 
      error: "Failed to fetch events data",
      message: error.message 
    });
  }
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
    console.error("Events API wrapper error:", error);
    // Always return JSON for errors
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: "Failed to process events request",
        message: error.message 
      });
    }
  }
}

export default wrappedHandler;