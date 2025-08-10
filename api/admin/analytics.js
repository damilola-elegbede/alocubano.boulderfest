import analyticsService from "../lib/analytics-service.js";
import authService from "../lib/auth-service.js";
import { withSecurityHeaders } from "../lib/security-headers.js";
import rateLimitService from "../lib/rate-limit-service.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Apply rate limiting
  const rateLimitResult = await rateLimitService.checkLimit(req, "analytics", {
    maxAttempts: 100,
    windowMs: 60000, // 100 requests per minute
  });

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
      retryAfter: rateLimitResult.retryAfter,
    });
  }

  // Input validation and sanitization
  const { type, eventId = "boulder-fest-2026", days = 30 } = req.query;

  // Validate eventId to prevent injection
  const validEventId = /^[a-zA-Z0-9-_]+$/.test(eventId)
    ? eventId
    : "boulder-fest-2026";
  if (validEventId !== eventId) {
    return res.status(400).json({
      error:
        "Invalid eventId format. Only alphanumeric characters, hyphens and underscores allowed.",
    });
  }

  if (!type) {
    return res.status(400).json({
      error: "Missing required parameter: type",
      allowedTypes: [
        "summary",
        "statistics",
        "trend",
        "hourly",
        "customers",
        "checkins",
        "revenue",
        "funnel",
        "wallet",
      ],
    });
  }

  try {
    let data;

    switch (type) {
      case "summary": {
        data = await analyticsService.generateExecutiveSummary(validEventId);
        break;
      }

      case "statistics": {
        data = await analyticsService.getEventStatistics(validEventId);
        break;
      }

      case "trend": {
        const trendDays = parseInt(days) || 30;
        if (trendDays < 1 || trendDays > 365) {
          return res.status(400).json({
            error: "Days parameter must be between 1 and 365",
          });
        }
        data = await analyticsService.getSalesTrend(trendDays, validEventId);
        break;
      }

      case "hourly": {
        data = await analyticsService.getHourlySalesPattern(validEventId);
        break;
      }

      case "customers": {
        data = await analyticsService.getCustomerAnalytics(validEventId);
        break;
      }

      case "checkins": {
        data = await analyticsService.getCheckinAnalytics(validEventId);
        break;
      }

      case "revenue": {
        data = await analyticsService.getRevenueBreakdown(validEventId);
        break;
      }

      case "funnel": {
        const funnelDays = parseInt(days) || 30;
        if (funnelDays < 1 || funnelDays > 365) {
          return res.status(400).json({
            error: "Days parameter must be between 1 and 365",
          });
        }
        data = await analyticsService.getConversionFunnel(
          funnelDays,
          validEventId,
        );
        break;
      }

      case "wallet": {
        data = await analyticsService.getWalletAnalytics(validEventId);
        break;
      }

      default: {
        return res.status(400).json({
          error: `Unknown analytics type: ${type}`,
          allowedTypes: [
            "summary",
            "statistics",
            "trend",
            "hourly",
            "customers",
            "checkins",
            "revenue",
            "funnel",
            "wallet",
          ],
        });
      }
    }

    res.status(200).json({
      type,
      eventId: validEventId,
      generatedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    console.error(`Analytics ${type} error:`, error);
    res.status(500).json({
      error: `Failed to fetch ${type} analytics`,
      type,
    });
  }
}

export default withSecurityHeaders(authService.requireAuth(handler));
