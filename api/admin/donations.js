import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withHighSecurityAudit } from "../../lib/admin-audit-middleware.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import timeUtils from "../../lib/time-utils.js";

async function handler(req, res) {
  let db;

  try {
    db = await getDatabaseClient();

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      donationType = 'real',  // 'real' | 'test' - default to real donations
      days = '30'
    } = req.query;

    // Calculate date filter
    const daysNum = days === 'all' ? null : parseInt(days, 10);
    const dateFilter = daysNum ?
      new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString() : null;

    // Build WHERE clauses
    const whereConditions = ['ti.item_type = ?'];
    const queryArgs = ['donation'];

    // Filter by donation type (real vs test)
    if (donationType === 'real') {
      whereConditions.push('ti.is_test = 0');
    } else if (donationType === 'test') {
      whereConditions.push('ti.is_test = 1');
    }

    if (dateFilter) {
      whereConditions.push('ti.created_at >= ?');
      queryArgs.push(dateFilter);
    }

    const whereClause = whereConditions.join(' AND ');

    // Main metrics query
    const metricsQuery = `
      SELECT
        COUNT(DISTINCT ti.id) as total_donations,
        SUM(ti.total_price_cents) as donation_revenue_cents,
        COUNT(DISTINCT ti.transaction_id) as transactions_with_donations,
        AVG(ti.total_price_cents) as average_donation_cents
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE ${whereClause}
    `;

    const metricsResult = await db.execute({
      sql: metricsQuery,
      args: queryArgs
    });

    // Detailed donations query with transaction info
    const donationsQuery = `
      SELECT
        ti.id,
        ti.item_name,
        ti.total_price_cents,
        ti.created_at,
        ti.is_test,
        t.id as transaction_db_id,
        t.transaction_id,
        t.customer_email,
        t.customer_name,
        t.status
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE ${whereClause}
      ORDER BY ti.created_at DESC
      LIMIT 100
    `;

    const donationsResult = await db.execute({
      sql: donationsQuery,
      args: queryArgs
    });

    // Process metrics (convert cents to dollars)
    const metrics = metricsResult.rows[0] || {};
    const processedMetrics = {
      totalDonations: Number(metrics.total_donations) || 0,
      donationRevenue: ((Number(metrics.donation_revenue_cents) || 0) / 100).toFixed(2),
      transactionsWithDonations: Number(metrics.transactions_with_donations) || 0,
      averageDonation: ((Number(metrics.average_donation_cents) || 0) / 100).toFixed(2)
    };

    // Process donations (handle BigInt and enhance with Mountain Time)
    const processedDonations = processDatabaseResult(donationsResult.rows);
    const enhancedDonations = timeUtils.enhanceApiResponse(
      processedDonations,
      ['created_at'],
      { includeDeadline: false }
    );

    // Convert cents to dollars for display
    const donationsWithDollars = enhancedDonations.map(donation => ({
      ...donation,
      amount: ((donation.total_price_cents || 0) / 100).toFixed(2)
    }));

    return res.status(200).json({
      success: true,
      metrics: processedMetrics,
      donations: donationsWithDollars,
      filters: {
        donationType,
        days
      }
    });

  } catch (error) {
    console.error('Donations API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch donations data',
      details: error.message
    });
  }
}

export default withSecurityHeaders(
  authService.requireAuth(withHighSecurityAudit(handler))
);
