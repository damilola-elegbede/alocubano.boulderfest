/**
 * Flagged Tickets Analytics API Endpoint
 * Provides monitoring and analysis of validation false positives
 *
 * Purpose: Track effectiveness of false positive mitigation changes
 */

import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import timeUtils from "../../lib/time-utils.js";

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await getDatabaseClient();
    const { period = '30d', report_type = 'summary' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case '30d':
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      case '90d':
        startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        break;
      case 'all':
        startDate = new Date('2020-01-01'); // All time
        break;
      default:
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    }

    const startDateISO = startDate.toISOString();

    // =========================================================================
    // QUERY 1: Overall Flagged Tickets Metrics
    // =========================================================================
    const overallMetrics = await db.execute({
      sql: `
        SELECT
          COUNT(*) as total_flagged,
          COUNT(DISTINCT DATE(created_at)) as days_with_flags,
          MIN(created_at) as first_flagged,
          MAX(created_at) as last_flagged,
          AVG(price_cents) as avg_price_cents,
          SUM(price_cents) as total_flagged_value_cents
        FROM tickets
        WHERE status = 'flagged_for_review'
          AND created_at >= ?
      `,
      args: [startDateISO]
    });

    // =========================================================================
    // QUERY 2: Validation Error Breakdown
    // =========================================================================
    // Parse ticket_metadata JSON to extract validation errors
    const flaggedTickets = await db.execute({
      sql: `
        SELECT
          ticket_id,
          ticket_metadata,
          created_at,
          price_cents,
          ticket_type
        FROM tickets
        WHERE status = 'flagged_for_review'
          AND created_at >= ?
        ORDER BY created_at DESC
      `,
      args: [startDateISO]
    });

    // Analyze validation errors from metadata
    const errorBreakdown = {
      event_id_mismatch: 0,
      price_mismatch: 0,
      quantity_exceeded: 0,
      invalid_ticket_status: 0,
      invalid_event_status: 0,
      ticket_not_found: 0,
      validation_system_error: 0,
      unknown: 0
    };

    const webhookDelayAnalysis = {
      immediate: 0,        // < 1 min
      normal: 0,           // 1-5 min
      delayed: 0,          // 5-15 min
      very_delayed: 0,     // > 15 min
      unknown: 0
    };

    const detailedErrors = [];

    for (const ticket of (flaggedTickets.rows || [])) {
      let metadata = null;
      try {
        metadata = ticket.ticket_metadata ? JSON.parse(ticket.ticket_metadata) : null;
      } catch (e) {
        console.error(`Failed to parse metadata for ticket ${ticket.ticket_id}`);
        continue;
      }

      if (!metadata || !metadata.validation) {
        errorBreakdown.unknown++;
        continue;
      }

      const validation = metadata.validation;
      const errors = validation.errors || [];
      const warnings = validation.warnings || [];
      const webhookTiming = validation.webhook_timing || {};

      // Categorize by webhook delay
      const delaySeconds = webhookTiming.delay_seconds || 0;
      if (delaySeconds < 60) {
        webhookDelayAnalysis.immediate++;
      } else if (delaySeconds < 300) {
        webhookDelayAnalysis.normal++;
      } else if (delaySeconds < 900) {
        webhookDelayAnalysis.delayed++;
      } else if (delaySeconds > 0) {
        webhookDelayAnalysis.very_delayed++;
      } else {
        webhookDelayAnalysis.unknown++;
      }

      // Categorize errors
      for (const error of errors) {
        const errorLower = error.toLowerCase();

        if (errorLower.includes('event id mismatch') || errorLower.includes('event_id mismatch')) {
          errorBreakdown.event_id_mismatch++;
        } else if (errorLower.includes('price mismatch')) {
          errorBreakdown.price_mismatch++;
        } else if (errorLower.includes('insufficient quantity') || errorLower.includes('quantity exceeds')) {
          errorBreakdown.quantity_exceeded++;
        } else if (errorLower.includes('invalid status') && errorLower.includes('ticket')) {
          errorBreakdown.invalid_ticket_status++;
        } else if (errorLower.includes('not active') || (errorLower.includes('invalid status') && errorLower.includes('event'))) {
          errorBreakdown.invalid_event_status++;
        } else if (errorLower.includes('does not exist')) {
          errorBreakdown.ticket_not_found++;
        } else if (errorLower.includes('validation system error')) {
          errorBreakdown.validation_system_error++;
        } else {
          errorBreakdown.unknown++;
        }
      }

      // Store detailed error for analysis
      detailedErrors.push({
        ticket_id: ticket.ticket_id,
        ticket_type: ticket.ticket_type,
        created_at: ticket.created_at,
        price_cents: ticket.price_cents,
        errors: errors,
        warnings: warnings,
        webhook_delay_seconds: delaySeconds,
        lenient_validation_applied: webhookTiming.lenient_validation_applied || false
      });
    }

    // =========================================================================
    // QUERY 3: Time-Series Analysis (Daily Flagged Count)
    // =========================================================================
    const timeSeriesData = await db.execute({
      sql: `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as count,
          COUNT(DISTINCT ticket_type) as unique_ticket_types,
          AVG(price_cents) as avg_price
        FROM tickets
        WHERE status = 'flagged_for_review'
          AND created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 90
      `,
      args: [startDateISO]
    });

    // =========================================================================
    // QUERY 4: Validation Success vs Failure Rates from Audit Logs
    // =========================================================================
    const validationStats = await db.execute({
      sql: `
        SELECT
          action,
          COUNT(*) as count,
          DATE(created_at) as date
        FROM audit_logs
        WHERE action IN ('WEBHOOK_METADATA_VALIDATION_PASSED', 'WEBHOOK_METADATA_VALIDATION_FAILED')
          AND created_at >= ?
        GROUP BY action, DATE(created_at)
        ORDER BY date DESC
        LIMIT 90
      `,
      args: [startDateISO]
    });

    // Aggregate validation stats
    let totalPassed = 0;
    let totalFailed = 0;
    const dailyValidationRates = {};

    for (const row of (validationStats.rows || [])) {
      const date = row.date;
      const action = row.action;
      const count = row.count;

      if (!dailyValidationRates[date]) {
        dailyValidationRates[date] = { passed: 0, failed: 0, date };
      }

      if (action === 'WEBHOOK_METADATA_VALIDATION_PASSED') {
        totalPassed += count;
        dailyValidationRates[date].passed = count;
      } else if (action === 'WEBHOOK_METADATA_VALIDATION_FAILED') {
        totalFailed += count;
        dailyValidationRates[date].failed = count;
      }
    }

    const totalValidations = totalPassed + totalFailed;
    const falsePositiveRate = totalValidations > 0
      ? ((totalFailed / totalValidations) * 100).toFixed(2)
      : 0;

    // =========================================================================
    // QUERY 5: Most Common Ticket Types Flagged
    // =========================================================================
    const ticketTypeBreakdown = await db.execute({
      sql: `
        SELECT
          ticket_type,
          COUNT(*) as count,
          AVG(price_cents) as avg_price,
          MIN(created_at) as first_occurrence,
          MAX(created_at) as last_occurrence
        FROM tickets
        WHERE status = 'flagged_for_review'
          AND created_at >= ?
        GROUP BY ticket_type
        ORDER BY count DESC
        LIMIT 20
      `,
      args: [startDateISO]
    });

    // =========================================================================
    // Build Response Based on Report Type
    // =========================================================================
    const responseData = {
      period: period,
      start_date: startDateISO,
      end_date: now.toISOString(),
      generated_at: now.toISOString(),

      summary: {
        total_flagged: overallMetrics.rows[0]?.total_flagged || 0,
        total_validations: totalValidations,
        validation_pass_rate: totalValidations > 0
          ? ((totalPassed / totalValidations) * 100).toFixed(2) + '%'
          : 'N/A',
        false_positive_rate: falsePositiveRate + '%',
        days_with_flags: overallMetrics.rows[0]?.days_with_flags || 0,
        avg_flagged_per_day: overallMetrics.rows[0]?.days_with_flags > 0
          ? ((overallMetrics.rows[0]?.total_flagged || 0) / overallMetrics.rows[0]?.days_with_flags).toFixed(2)
          : 0,
        total_flagged_value: ((overallMetrics.rows[0]?.total_flagged_value_cents || 0) / 100).toFixed(2),
        first_flagged: overallMetrics.rows[0]?.first_flagged || null,
        last_flagged: overallMetrics.rows[0]?.last_flagged || null
      },

      error_breakdown: errorBreakdown,

      webhook_delay_analysis: {
        ...webhookDelayAnalysis,
        delayed_webhook_percentage: flaggedTickets.rows?.length > 0
          ? (((webhookDelayAnalysis.delayed + webhookDelayAnalysis.very_delayed) / flaggedTickets.rows.length) * 100).toFixed(2) + '%'
          : '0%'
      },

      ticket_type_breakdown: ticketTypeBreakdown.rows || [],

      time_series: timeSeriesData.rows || [],

      daily_validation_rates: Object.values(dailyValidationRates).sort((a, b) =>
        new Date(b.date) - new Date(a.date)
      ).slice(0, 30),

      // Key insights for monitoring
      insights: {
        most_common_error: Object.entries(errorBreakdown)
          .sort((a, b) => b[1] - a[1])
          .filter(([_, count]) => count > 0)[0]?.[0] || 'none',

        high_delay_correlation: webhookDelayAnalysis.delayed + webhookDelayAnalysis.very_delayed >
          (webhookDelayAnalysis.immediate + webhookDelayAnalysis.normal) * 0.5,

        trending: timeSeriesData.rows?.length >= 7
          ? (() => {
              const recent7Days = timeSeriesData.rows.slice(0, 7).reduce((sum, row) => sum + (row.count || 0), 0);
              const previous7Days = timeSeriesData.rows.slice(7, 14).reduce((sum, row) => sum + (row.count || 0), 0);
              const change = previous7Days > 0
                ? (((recent7Days - previous7Days) / previous7Days) * 100).toFixed(1)
                : 'N/A';
              return {
                recent_7d: recent7Days,
                previous_7d: previous7Days,
                change_percent: change,
                direction: recent7Days > previous7Days ? 'increasing' : recent7Days < previous7Days ? 'decreasing' : 'stable'
              };
            })()
          : null
      }
    };

    // Include detailed errors for 'detailed' report type
    if (report_type === 'detailed') {
      responseData.detailed_errors = detailedErrors.slice(0, 100); // Limit to 100 most recent
    }

    // Set cache headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Enhance with Mountain Time fields per coding guidelines
    const timestampFields = ['generated_at', 'start_date', 'end_date', 'first_flagged', 'last_flagged'];
    const enhanced = timeUtils.enhanceApiResponse(responseData, timestampFields);

    res.status(200).json(processDatabaseResult(enhanced));

  } catch (error) {
    console.error('Flagged tickets analytics error:', error);

    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';

    res.status(500).json({
      error: 'Internal server error',
      ...(isDevelopment && {
        details: error.message,
        stack: error.stack?.substring(0, 500)
      })
    });
  }
}

// Build middleware chain
const securedHandler = withSecurityHeaders(
  authService.requireAuth(handler)
);

// Wrap in error handler
async function safeHandler(req, res) {
  console.log(`[${new Date().toISOString()}] Flagged tickets analytics endpoint called`);
  console.log(`Request: ${req.method} ${req.url}`);

  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in flagged tickets analytics endpoint:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? error.message
          : 'A server error occurred',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default safeHandler;
