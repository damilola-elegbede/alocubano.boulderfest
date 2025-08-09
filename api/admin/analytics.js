import analyticsService from "../lib/analytics-service.js";
import authService from "../lib/auth-service.js";
import { withSecurityHeaders } from "../lib/security-headers.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { type, eventId = 'boulder-fest-2026', days = 30 } = req.query;

  if (!type) {
    return res.status(400).json({ 
      error: "Missing required parameter: type",
      allowedTypes: ["summary", "statistics", "trend", "hourly", "customers", "checkins", "revenue", "funnel", "wallet"]
    });
  }

  try {
    let data;

    switch (type) {
      case "summary": {
        data = await analyticsService.generateExecutiveSummary(eventId);
        break;
      }

      case "statistics": {
        data = await analyticsService.getEventStatistics(eventId);
        break;
      }

      case "trend": {
        const trendDays = parseInt(days) || 30;
        if (trendDays < 1 || trendDays > 365) {
          return res.status(400).json({ 
            error: "Days parameter must be between 1 and 365" 
          });
        }
        data = await analyticsService.getSalesTrend(trendDays, eventId);
        break;
      }

      case "hourly": {
        data = await analyticsService.getHourlySalesPattern(eventId);
        break;
      }

      case "customers": {
        data = await analyticsService.getCustomerAnalytics(eventId);
        break;
      }

      case "checkins": {
        data = await analyticsService.getCheckinAnalytics(eventId);
        break;
      }

      case "revenue": {
        data = await analyticsService.getRevenueBreakdown(eventId);
        break;
      }

      case "funnel": {
        const funnelDays = parseInt(days) || 30;
        if (funnelDays < 1 || funnelDays > 365) {
          return res.status(400).json({ 
            error: "Days parameter must be between 1 and 365" 
          });
        }
        data = await analyticsService.getConversionFunnel(funnelDays);
        break;
      }

      case "wallet": {
        data = await analyticsService.getWalletAnalytics(eventId);
        break;
      }

      default: {
        return res.status(400).json({ 
          error: `Unknown analytics type: ${type}`,
          allowedTypes: ["summary", "statistics", "trend", "hourly", "customers", "checkins", "revenue", "funnel", "wallet"]
        });
      }
    }

    res.status(200).json({
      type,
      eventId,
      generatedAt: new Date().toISOString(),
      data
    });

  } catch (error) {
    console.error(`Analytics ${type} error:`, error);
    res.status(500).json({ 
      error: `Failed to fetch ${type} analytics`,
      type 
    });
  }
}

export default withSecurityHeaders(authService.requireAuth(handler));