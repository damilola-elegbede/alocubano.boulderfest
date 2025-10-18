/**
 * Cash Shifts API Endpoint
 * Returns active cash shifts for manual ticket entry
 */

import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { columnExists } from "../../lib/db-utils.js";

/**
 * Main handler function
 */
async function handler(req, res) {
  // Set security headers to prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const db = await getDatabaseClient();
    const { eventId } = req.query;

    // Check if event_id column exists in cash_shifts table
    const cashShiftsHasEventId = await columnExists(db, 'cash_shifts', 'event_id');

    // Build SQL query
    let sql = `
      SELECT
        cs.id,
        cs.opened_at,
        cs.closed_at,
        cs.status,
        cs.opening_cash_cents,
        cs.cash_sales_count,
        cs.cash_sales_total_cents
    `;

    // Add event_id and event details if column exists
    if (cashShiftsHasEventId) {
      sql += `,
        cs.event_id,
        e.name as event_name,
        e.slug as event_slug
      FROM cash_shifts cs
      LEFT JOIN events e ON cs.event_id = e.id
      `;
    } else {
      sql += `
      FROM cash_shifts cs
      `;
    }

    // Filter by status (only open shifts)
    sql += `WHERE cs.status = 'open'`;

    const args = [];

    // Add event filtering if eventId is provided and column exists
    if (eventId && cashShiftsHasEventId) {
      sql += ' AND cs.event_id = ?';
      args.push(parseInt(eventId, 10));
    }

    // Order by most recently opened first
    sql += ' ORDER BY cs.opened_at DESC';

    // Execute query
    const result = await db.execute({
      sql,
      args
    });

    // Process BigInt values and return
    const cashShifts = processDatabaseResult(result.rows || []);

    return res.status(200).json({
      success: true,
      cashShifts,
      count: cashShifts.length,
      supportsEventFiltering: cashShiftsHasEventId
    });

  } catch (error) {
    console.error('Cash shifts API error:', error);

    // Generic error response
    return res.status(500).json({
      error: 'Failed to fetch cash shifts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Build middleware chain with security features
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

// Wrap in error-handling function to ensure all errors are returned as JSON
async function safeHandler(req, res) {
  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in cash shifts endpoint:', error);

    // Check for authentication errors
    if (error.message?.includes('ADMIN_SECRET') || error.message?.includes('Authentication')) {
      return res.status(500).json({
        error: 'Authentication service unavailable',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? `Auth configuration error: ${error.message}`
          : 'Authentication service is temporarily unavailable',
        timestamp: new Date().toISOString()
      });
    }

    // Generic error response
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
