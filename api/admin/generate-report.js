import analyticsService from "../lib/analytics-service.js";
import authService from "../lib/auth-service.js";
import { withSecurityHeaders } from "../lib/security-headers.js";

/**
 * Convert analytics data to CSV format
 */
function convertToCSV(data, type) {
  let csvContent = `# A Lo Cubano Boulder Fest - ${type} Report\n`;
  csvContent += `# Generated: ${new Date().toISOString()}\n\n`;

  switch (type) {
    case "summary": {
      csvContent += `Section,Metric,Value\n`;
      csvContent += `Overview,Tickets Sold,${data.overview.tickets_sold}\n`;
      csvContent += `Overview,Gross Revenue,$${data.overview.gross_revenue}\n`;
      csvContent += `Overview,Unique Customers,${data.overview.unique_customers}\n`;
      csvContent += `Overview,Check-in Rate,${data.overview.check_in_rate}%\n`;
      csvContent += `Overview,Days Until Event,${data.overview.days_until_event}\n`;
      csvContent += `Performance,Daily Average,${data.performance.daily_average}\n`;
      csvContent += `Performance,Projected Total,${data.performance.projected_total}\n`;
      csvContent += `Performance,Top Ticket Type,${data.performance.top_ticket_type}\n`;
      csvContent += `Performance,Conversion Rate,${data.performance.conversion_rate}%\n`;
      break;
    }

    case "trend": {
      csvContent += `Date,Tickets Sold,Revenue,Orders,Average Price,Cumulative Tickets,Cumulative Revenue\n`;
      data.forEach((row) => {
        csvContent += `${row.sale_date},${row.tickets_sold},${row.revenue},${row.orders},${row.avg_price},${row.cumulative_tickets},${row.cumulative_revenue}\n`;
      });
      break;
    }

    case "revenue": {
      csvContent += `Ticket Type,Quantity Sold,Average Price,Total Revenue,Revenue Percentage\n`;
      data.forEach((row) => {
        csvContent += `${row.ticket_type},${row.quantity_sold},$${row.avg_price},$${row.total_revenue},${row.revenue_percentage}%\n`;
      });
      break;
    }

    case "customers": {
      csvContent += `Metric,Value\n`;
      csvContent += `Unique Customers,${data.summary.unique_customers}\n`;
      csvContent += `Average Tickets per Customer,${data.summary.avg_tickets_per_customer}\n`;
      csvContent += `Average Spend per Customer,$${data.summary.avg_spend_per_customer}\n`;
      csvContent += `Max Tickets (Single Customer),${data.summary.max_tickets_single_customer}\n`;
      csvContent += `Repeat Customers,${data.summary.repeat_customers}\n`;
      csvContent += `Single Ticket Customers,${data.summary.single_ticket_customers}\n`;
      csvContent += `High Value Customers,${data.summary.high_value_customers}\n\n`;

      csvContent += `Top Customers\n`;
      csvContent += `Email,Name,Tickets Purchased,Total Spent,Ticket Types\n`;
      data.topCustomers.forEach((customer) => {
        csvContent += `${customer.customer_email},"${customer.customer_name}",${customer.tickets_purchased},$${customer.total_spent},"${customer.ticket_types}"\n`;
      });
      break;
    }

    default: {
      csvContent += `Data\n`;
      csvContent += JSON.stringify(data, null, 2);
    }
  }

  return csvContent;
}

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const {
    format = "json",
    eventId = "boulder-fest-2026",
    types = "summary,statistics,trend,revenue,customers",
  } = req.query;

  // Validate format
  if (!["json", "csv"].includes(format.toLowerCase())) {
    return res.status(400).json({
      error: "Invalid format. Supported formats: json, csv",
    });
  }

  // Parse requested types
  const requestedTypes = types.split(",").map((t) => t.trim());
  const validTypes = [
    "summary",
    "statistics",
    "trend",
    "hourly",
    "customers",
    "checkins",
    "revenue",
    "funnel",
    "wallet",
  ];

  const invalidTypes = requestedTypes.filter((t) => !validTypes.includes(t));
  if (invalidTypes.length > 0) {
    return res.status(400).json({
      error: `Invalid analytics types: ${invalidTypes.join(", ")}`,
      validTypes,
    });
  }

  try {
    // Generate comprehensive report
    const report = {
      metadata: {
        eventId,
        generatedAt: new Date().toISOString(),
        generatedBy: req.admin.id,
        requestedTypes,
        format: format.toLowerCase(),
      },
      analytics: {},
    };

    // Fetch all requested analytics in parallel
    const analyticsPromises = requestedTypes.map(async (type) => {
      let data;

      switch (type) {
        case "summary":
          data = await analyticsService.generateExecutiveSummary(eventId);
          break;
        case "statistics":
          data = await analyticsService.getEventStatistics(eventId);
          break;
        case "trend":
          data = await analyticsService.getSalesTrend(30, eventId);
          break;
        case "hourly":
          data = await analyticsService.getHourlySalesPattern(eventId);
          break;
        case "customers":
          data = await analyticsService.getCustomerAnalytics(eventId);
          break;
        case "checkins":
          data = await analyticsService.getCheckinAnalytics(eventId);
          break;
        case "revenue":
          data = await analyticsService.getRevenueBreakdown(eventId);
          break;
        case "funnel":
          data = await analyticsService.getConversionFunnel(30, eventId);
          break;
        case "wallet":
          data = await analyticsService.getWalletAnalytics(eventId);
          break;
        default:
          throw new Error(`Unknown analytics type: ${type}`);
      }

      return { type, data };
    });

    const results = await Promise.all(analyticsPromises);

    // Organize results by type
    results.forEach(({ type, data }) => {
      report.analytics[type] = data;
    });

    // Return appropriate format
    if (format.toLowerCase() === "csv") {
      // For CSV, we'll focus on the most important data
      const primaryType = requestedTypes[0];
      const csvData = convertToCSV(report.analytics[primaryType], primaryType);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `alocubano-${primaryType}-report-${timestamp}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      return res.status(200).send(csvData);
    } else {
      // JSON response
      res.status(200).json(report);
    }
  } catch (error) {
    console.error("Report generation error:", error);
    res.status(500).json({
      error: "Failed to generate analytics report",
      details: error.message,
    });
  }
}

export default withSecurityHeaders(authService.requireAuth(handler));
