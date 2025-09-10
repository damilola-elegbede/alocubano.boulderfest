import analyticsService from '../../lib/analytics-service.js';
import authService from '../../lib/auth-service.js';
import { withSecurityHeaders } from '../../lib/security-headers.js';
import { getDatabaseClient } from '../../lib/database.js';

/**
 * Safely quote and sanitize CSV values to prevent formula injection
 */
function q(value) {
  if (value === null || value === undefined) {
    return '""';
  }
  
  // Convert to string
  const str = String(value);
  
  // Escape double quotes by doubling them
  let escaped = str.replace(/"/g, '""');
  
  // Check for potentially dangerous leading characters that could be interpreted as formulas
  if (escaped.match(/^[=+\-@]/)) {
    // Prefix with single quote to prevent formula execution
    escaped = "'" + escaped;
  }
  
  // Always wrap in double quotes for safety
  return '"' + escaped + '"';
}

/**
 * Convert analytics data to CSV format
 */
function convertToCSV(data, type) {
  let csvContent = `# A Lo Cubano Boulder Fest - ${type} Report\n`;
  csvContent += `# Generated: ${new Date().toISOString()}\n\n`;

  switch (type) {
  case 'summary': {
    csvContent += 'Section,Metric,Value\n';
    csvContent += `${q('Overview')},${q('Tickets Sold')},${q(data.overview.tickets_sold)}\n`;
    csvContent += `${q('Overview')},${q('Gross Revenue')},${q('$' + data.overview.gross_revenue)}\n`;
    csvContent += `${q('Overview')},${q('Unique Customers')},${q(data.overview.unique_customers)}\n`;
    csvContent += `${q('Overview')},${q('Check-in Rate')},${q(data.overview.check_in_rate + '%')}\n`;
    csvContent += `${q('Overview')},${q('Days Until Event')},${q(data.overview.days_until_event)}\n`;
    csvContent += `${q('Performance')},${q('Daily Average')},${q(data.performance.daily_average)}\n`;
    csvContent += `${q('Performance')},${q('Projected Total')},${q(data.performance.projected_total)}\n`;
    csvContent += `${q('Performance')},${q('Top Ticket Type')},${q(data.performance.top_ticket_type)}\n`;
    csvContent += `${q('Performance')},${q('Conversion Rate')},${q(data.performance.conversion_rate + '%')}\n`;
    break;
  }

  case 'trend': {
    csvContent += 'Date,Tickets Sold,Revenue,Orders,Average Price,Cumulative Tickets,Cumulative Revenue\n';
    data.forEach((row) => {
      csvContent += `${q(row.sale_date)},${q(row.tickets_sold)},${q(row.revenue)},${q(row.orders)},${q(row.avg_price)},${q(row.cumulative_tickets)},${q(row.cumulative_revenue)}\n`;
    });
    break;
  }

  case 'revenue': {
    csvContent += 'Ticket Type,Quantity Sold,Average Price,Total Revenue,Revenue Percentage\n';
    data.forEach((row) => {
      csvContent += `${q(row.ticket_type)},${q(row.quantity_sold)},${q('$' + row.avg_price)},${q('$' + row.total_revenue)},${q(row.revenue_percentage + '%')}\n`;
    });
    break;
  }

  case 'customers': {
    csvContent += 'Metric,Value\n';
    csvContent += `${q('Unique Customers')},${q(data.summary.unique_customers)}\n`;
    csvContent += `${q('Average Tickets per Customer')},${q(data.summary.avg_tickets_per_customer)}\n`;
    csvContent += `${q('Average Spend per Customer')},${q('$' + data.summary.avg_spend_per_customer)}\n`;
    csvContent += `${q('Max Tickets (Single Customer)')},${q(data.summary.max_tickets_single_customer)}\n`;
    csvContent += `${q('Repeat Customers')},${q(data.summary.repeat_customers)}\n`;
    csvContent += `${q('Single Ticket Customers')},${q(data.summary.single_ticket_customers)}\n`;
    csvContent += `${q('High Value Customers')},${q(data.summary.high_value_customers)}\n\n`;

    csvContent += 'Top Customers\n';
    csvContent += 'Email,Name,Tickets Purchased,Total Spent,Ticket Types\n';
    data.topCustomers.forEach((customer) => {
      csvContent += `${q(customer.customer_email)},${q(customer.customer_name)},${q(customer.tickets_purchased)},${q('$' + customer.total_spent)},${q(customer.ticket_types)}\n`;
    });
    break;
  }

  default: {
    csvContent += 'Data\n';
    csvContent += q(JSON.stringify(data, null, 2));
  }
  }

  return csvContent;
}

async function handler(req, res) {
  // Initialize database client
  await getDatabaseClient();
  
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const {
    format = 'json',
    eventId = 'boulder-fest-2026',
    types = 'summary,statistics,trend,revenue,customers'
  } = req.query;

  // Validate format
  if (!['json', 'csv'].includes(format.toLowerCase())) {
    return res.status(400).json({
      error: 'Invalid format. Supported formats: json, csv'
    });
  }

  // Parse requested types
  const requestedTypes = types.split(',').map((t) => t.trim());
  const validTypes = [
    'summary',
    'statistics',
    'trend',
    'hourly',
    'customers',
    'checkins',
    'revenue',
    'funnel',
    'wallet'
  ];

  const invalidTypes = requestedTypes.filter((t) => !validTypes.includes(t));
  if (invalidTypes.length > 0) {
    return res.status(400).json({
      error: `Invalid analytics types: ${invalidTypes.join(', ')}`,
      validTypes
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
        format: format.toLowerCase()
      },
      analytics: {}
    };

    // Fetch all requested analytics in parallel
    const analyticsPromises = requestedTypes.map(async(type) => {
      let data;

      switch (type) {
      case 'summary':
        data = await analyticsService.generateExecutiveSummary(eventId);
        break;
      case 'statistics':
        data = await analyticsService.getEventStatistics(eventId);
        break;
      case 'trend':
        data = await analyticsService.getSalesTrend(30, eventId);
        break;
      case 'hourly':
        data = await analyticsService.getHourlySalesPattern(eventId);
        break;
      case 'customers':
        data = await analyticsService.getCustomerAnalytics(eventId);
        break;
      case 'checkins':
        data = await analyticsService.getCheckinAnalytics(eventId);
        break;
      case 'revenue':
        data = await analyticsService.getRevenueBreakdown(eventId);
        break;
      case 'funnel':
        data = await analyticsService.getConversionFunnel(30, eventId);
        break;
      case 'wallet':
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
    if (format.toLowerCase() === 'csv') {
      // For CSV, we'll focus on the most important data
      const primaryType = requestedTypes[0];
      const csvData = convertToCSV(report.analytics[primaryType], primaryType);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `alocubano-${primaryType}-report-${timestamp}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      return res.status(200).send(csvData);
    } else {
      // JSON response
      res.status(200).json(report);
    }
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      error: 'Failed to generate analytics report',
      details: error.message
    });
  }
}

export default withSecurityHeaders(authService.requireAuth(handler));
