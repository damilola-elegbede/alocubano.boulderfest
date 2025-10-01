import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getAdminTestEvents } from "../../lib/test-events.js";

/**
 * Mock events data for development when events table doesn't exist yet
 */
const MOCK_EVENTS = [
  {
    id: 1,
    slug: 'boulderfest-2026',
    name: '[Mock] Boulder Fest 2026',
    type: 'festival',
    status: 'upcoming',
    start_date: '2026-05-15',
    end_date: '2026-05-17'
  },
  {
    id: 2,
    slug: 'weekender-09-2026',
    name: '[Mock] Weekender 09/2026',
    type: 'weekender',
    status: 'upcoming',
    start_date: '2026-09-18',
    end_date: '2026-09-20'
  }
];

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
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

      // Process database results to handle BigInt values
      events = processDatabaseResult(result.rows);

      // Add test events for admin event selector (for development/testing)
      const testEvents = process.env.NODE_ENV !== 'production' ? getAdminTestEvents() : [];
      events = [...testEvents, ...events];
    } catch (error) {
      // If events table doesn't exist yet, return mock data
      if (error.message.includes('no such table: events') ||
          error.message.includes('table events doesn\'t exist')) {
        console.log('Events table not found, returning mock data for development');
        events = MOCK_EVENTS;
      } else {
        // Re-throw other database errors
        throw error;
      }
    }

    const responseData = {
      events: events,
      total: events.length,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(processDatabaseResult(responseData));

  } catch (error) {
    // SECURITY: Log detailed error for debugging but return generic message to client
    console.error('Events API error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // SECURITY: Return generic error message to prevent information disclosure
    res.status(500).json({
      error: 'Failed to fetch events',
      // SECURITY: Remove error.message to prevent DB schema/structure leakage
      timestamp: new Date().toISOString()
    });
  }
}

// Wrap with auth middleware, audit, and security headers
export default withSecurityHeaders(authService.requireAuth(withAdminAudit(handler, {
  logBody: false, // Events GET requests don't need body logging
  logMetadata: true,
  skipMethods: [] // Log all event management access
})));