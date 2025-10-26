import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import timeUtils from "../../lib/time-utils.js";

/**
 * Events API - Single Event Mode
 * Returns the current event information (not multi-event support)
 *
 * NOTE: This endpoint returns the single active event for the festival.
 * Multi-event architecture (event switching, multiple events) has been removed.
 */

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const db = await getDatabaseClient();

    // Query the events table for the current event
    let events = [];
    try {
      const result = await db.execute(`
        SELECT
          id,
          slug,
          name,
          type,
          status,
          start_date,
          end_date,
          venue_name,
          venue_city,
          venue_state
        FROM events
        WHERE is_visible = TRUE
        ORDER BY start_date DESC
        LIMIT 1
      `);

      if (result.rows && result.rows.length > 0) {
        // Process database results to handle BigInt values
        events = processDatabaseResult(result.rows);

        // Enhance with Mountain Time fields
        events = timeUtils.enhanceApiResponse(events,
          ['start_date', 'end_date'],
          { includeDeadline: false }
        );
      }
    } catch (error) {
      // If events table doesn't exist or query fails, log but don't crash
      console.error('Events query error:', error);

      // Return empty array - consuming code should handle gracefully
      events = [];
    }

    const responseData = {
      events: events,
      total: events.length,
      mode: 'single-event', // Indicate this is single-event mode, not multi-event
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
      error: 'Failed to fetch event information',
      timestamp: new Date().toISOString()
    });
  }
}

// Wrap with auth middleware, audit, and security headers
export default withSecurityHeaders(authService.requireAuth(withAdminAudit(handler, {
  logBody: false, // Events GET requests don't need body logging
  logMetadata: true,
  skipMethods: [] // Log all event access
})));
