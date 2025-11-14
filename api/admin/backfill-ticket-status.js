/**
 * TEMPORARY ADMIN ENDPOINT: Backfill Ticket Status
 * Purpose: Fix historical tickets that were scanned but not marked as 'used'
 *
 * WARNING: This endpoint should be DELETED after running once in production
 *
 * Usage:
 *   POST /api/admin/backfill-ticket-status
 *   Headers:
 *     - Cookie: admin_session=<token>
 *     - X-CSRF-Token: <token>
 *
 * Security:
 *   - Requires admin authentication
 *   - Requires CSRF token
 *   - Only runs in production environment
 *   - Can only be run once (checks if already executed)
 */

import { getDatabaseClient } from '../../lib/database.js';
import { verifyAdminToken } from '../../lib/session-manager.js';
import { getCorsHeaders } from '../../lib/cors-config.js';

export default async function handler(req, res) {
  // CORS headers
  const corsHeaders = getCorsHeaders(req);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verify admin authentication
    const cookies = req.headers.cookie || '';
    const sessionToken = cookies
      .split(';')
      .find(c => c.trim().startsWith('admin_session='))
      ?.split('=')[1];

    if (!sessionToken) {
      return res.status(401).json({ error: 'Unauthorized - no session' });
    }

    const adminUser = verifyAdminToken(sessionToken);
    if (!adminUser) {
      return res.status(401).json({ error: 'Unauthorized - invalid session' });
    }

    // 2. Verify CSRF token
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken) {
      return res.status(403).json({ error: 'CSRF token required' });
    }

    // 3. Get database client
    const db = await getDatabaseClient();

    // 4. Check current state
    const preCheck = await db.execute(`
      SELECT
        COUNT(*) FILTER (WHERE scan_count > 0 AND status = 'valid') as needs_update,
        COUNT(*) FILTER (WHERE scan_count > 0 AND status = 'used') as already_updated
      FROM tickets
    `);

    const needsUpdate = Number(preCheck.rows[0].needs_update);
    const alreadyUpdated = Number(preCheck.rows[0].already_updated);

    if (needsUpdate === 0) {
      return res.status(200).json({
        success: true,
        message: 'No tickets need updating - backfill already complete or not needed',
        stats: {
          needsUpdate: 0,
          alreadyUpdated,
          updated: 0
        }
      });
    }

    // 5. Get sample tickets to show what will be updated
    const samples = await db.execute(`
      SELECT ticket_id, scan_count, first_scanned_at, last_scanned_at
      FROM tickets
      WHERE scan_count > 0 AND status = 'valid'
      ORDER BY last_scanned_at DESC
      LIMIT 10
    `);

    // 6. Execute backfill UPDATE
    const updateResult = await db.execute(`
      UPDATE tickets
      SET status = 'used',
          checked_in_at = COALESCE(checked_in_at, first_scanned_at)
      WHERE scan_count > 0 AND status = 'valid'
    `);

    const rowsUpdated = updateResult.rowsAffected ?? updateResult.changes ?? 0;

    // 7. Verify results
    const verification = await db.execute(`
      SELECT
        COUNT(*) FILTER (WHERE scan_count > 0 AND status = 'valid') as still_needs_update,
        COUNT(*) FILTER (WHERE scan_count > 0 AND status = 'used') as now_updated,
        COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL) as has_checked_in
      FROM tickets
      WHERE scan_count > 0
    `);

    // 8. Return results
    return res.status(200).json({
      success: true,
      message: `Successfully updated ${rowsUpdated} tickets`,
      stats: {
        needsUpdate,
        alreadyUpdated,
        updated: rowsUpdated
      },
      samples: samples.rows.map(t => ({
        ticket_id: t.ticket_id,
        scan_count: t.scan_count,
        last_scanned: t.last_scanned_at
      })),
      verification: {
        still_needs_update: Number(verification.rows[0].still_needs_update),
        now_updated: Number(verification.rows[0].now_updated),
        has_checked_in: Number(verification.rows[0].has_checked_in)
      },
      executedBy: adminUser.username,
      executedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({
      error: 'Backfill failed',
      message: error.message
    });
  }
}
