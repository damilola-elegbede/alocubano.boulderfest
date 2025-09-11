import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";

/**
 * Mock events data for development when events table doesn't exist yet
 */
const MOCK_EVENTS = [
  {
    id: 1,
    slug: "boulderfest-2026",
    name: "A Lo Cubano Boulder Fest 2026",
    type: "festival",
    status: "upcoming",
    start_date: "2026-05-15",
    end_date: "2026-05-17"
  },
  {
    id: 2,
    slug: "spring-weekender-2026",
    name: "Spring Salsa Weekender 2026",
    type: "weekender",
    status: "upcoming",
    start_date: "2026-03-20",
    end_date: "2026-03-22"
  },
  {
    id: 3,
    slug: "winter-weekender-2025",
    name: "Winter Salsa Weekender 2025",
    type: "weekender",
    status: "completed",
    start_date: "2025-02-14",
    end_date: "2025-02-16"
  }
];

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const db = await getDatabaseClient();

    // Check if events table exists by trying to query it
    let events;
    try {
      const result = await db.execute(`
        SELECT 
          id,
          slug,
          name,
          type,
          status,
          start_date,
          end_date
        FROM events
        WHERE is_visible = TRUE
        ORDER BY start_date DESC
      `);
      
      events = result.rows;
    } catch (error) {
      // If events table doesn't exist yet, return mock data
      if (error.message.includes("no such table: events") || 
          error.message.includes("table events doesn't exist")) {
        console.log("Events table not found, returning mock data for development");
        events = MOCK_EVENTS;
      } else {
        // Re-throw other database errors
        throw error;
      }
    }

    res.status(200).json({
      events: events,
      total: events.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // SECURITY: Log detailed error for debugging but return generic message to client
    console.error("Events API error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // SECURITY: Return generic error message to prevent information disclosure
    res.status(500).json({ 
      error: "Failed to fetch events",
      // SECURITY: Remove error.message to prevent DB schema/structure leakage
      timestamp: new Date().toISOString()
    });
  }
}

// Wrap with auth middleware and security headers
export default withSecurityHeaders(authService.requireAuth(handler));