import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import timeUtils from "../../lib/time-utils.js";

/**
 * Timezone Debug Endpoint
 *
 * Provides diagnostic information about timezone calculations and database timestamps.
 * Useful for verifying that Mountain Time offset calculations are correct.
 *
 * Endpoint: GET /api/admin/timezone-debug
 *
 * Response:
 * {
 *   timezoneInfo: { timezone, abbreviation, isDST, offsetHours },
 *   currentTime: { utc, mountain },
 *   recentScans: [...],
 *   todayCount: number,
 *   sqlExample: string
 * }
 */
async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const db = await getDatabaseClient();
    const timezoneInfo = timeUtils.getTimezoneInfo();
    const offsetHours = timezoneInfo.offsetHours;

    // Get current time in both UTC and Mountain Time
    const now = new Date();
    const currentTime = {
      utc: now.toISOString(),
      mountain: timeUtils.toMountainTime(now),
      mountainInfo: timeUtils.getMountainTimeInfo(now)
    };

    // Get recent scans with timezone conversions
    const recentScansQuery = `
      SELECT
        ticket_id,
        scan_status,
        scanned_at,
        datetime(scanned_at, '${offsetHours} hours') as mountain_time,
        date(scanned_at, '${offsetHours} hours') as mountain_date,
        date('now', '${offsetHours} hours') as today_mountain,
        CASE
          WHEN date(scanned_at, '${offsetHours} hours') = date('now', '${offsetHours} hours')
          THEN 1
          ELSE 0
        END as is_today
      FROM scan_logs
      ORDER BY scanned_at DESC
      LIMIT 10
    `;

    const recentScansResult = await db.execute(recentScansQuery);
    const recentScans = recentScansResult.rows.map(row => ({
      ticketId: row.ticket_id,
      scanStatus: row.scan_status,
      utcTime: row.scanned_at,
      mountainTime: row.mountain_time,
      mountainDate: row.mountain_date,
      todayMountain: row.today_mountain,
      isToday: Boolean(row.is_today)
    }));

    // Count today's scans using the same logic as scanner-stats
    const todayCountQuery = `
      SELECT COUNT(DISTINCT ticket_id) as count
      FROM scan_logs
      WHERE date(scanned_at, '${offsetHours} hours') = date('now', '${offsetHours} hours')
    `;
    const todayCountResult = await db.execute(todayCountQuery);
    const todayCount = todayCountResult.rows[0]?.count || 0;

    // Generate SQL example for documentation
    const sqlExample = {
      description: "SQL query used to count today's scans in Mountain Time",
      query: todayCountQuery.trim(),
      explanation: [
        `1. date(scanned_at, '${offsetHours} hours') converts UTC timestamp to Mountain Time date`,
        `2. date('now', '${offsetHours} hours') gets today's date in Mountain Time`,
        `3. Comparison filters for scans that happened today in Mountain Time`,
        `4. COUNT(DISTINCT ticket_id) counts unique tickets scanned today`
      ]
    };

    // Database statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total_scans,
        COUNT(DISTINCT ticket_id) as unique_tickets,
        MIN(scanned_at) as first_scan_utc,
        MAX(scanned_at) as last_scan_utc,
        datetime(MIN(scanned_at), '${offsetHours} hours') as first_scan_mt,
        datetime(MAX(scanned_at), '${offsetHours} hours') as last_scan_mt
      FROM scan_logs
    `;
    const statsResult = await db.execute(statsQuery);
    const dbStats = statsResult.rows[0];

    // Prepare response
    const responseData = {
      timezoneInfo: {
        timezone: timezoneInfo.timezone,
        abbreviation: timezoneInfo.abbreviation,
        isDST: timezoneInfo.isDST,
        offsetHours: timezoneInfo.offsetHours
      },
      currentTime,
      recentScans,
      todayCount,
      databaseStats: {
        totalScans: dbStats.total_scans,
        uniqueTickets: dbStats.unique_tickets,
        firstScan: {
          utc: dbStats.first_scan_utc,
          mountain: dbStats.first_scan_mt
        },
        lastScan: {
          utc: dbStats.last_scan_utc,
          mountain: dbStats.last_scan_mt
        }
      },
      sqlExample,
      notes: [
        'All database timestamps are stored in UTC',
        `Current offset: ${offsetHours} hours (${timezoneInfo.abbreviation})`,
        `DST active: ${timezoneInfo.isDST ? 'Yes' : 'No'}`,
        'SQLite date() function applies offset to convert UTC to Mountain Time',
        '"Today" filter compares dates after both timestamps are converted to Mountain Time'
      ]
    };

    // Set cache headers (don't cache debug endpoint)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('Timezone debug endpoint error:', error);
    return res.status(500).json({
      error: 'Failed to fetch timezone debug information',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

// Secure the endpoint with auth
const securedHandler = withSecurityHeaders(
  authService.requireAuth(handler)
);

export default securedHandler;
