import { getMonitoringService } from '../../lib/monitoring/monitoring-service.js';
import { getHealthChecker } from '../../lib/monitoring/health-checker.js';
import { getAlertManager } from '../../lib/monitoring/alert-manager.js';
import { getUptimeMetrics, calculateSLA } from './uptime.js';
import { addBreadcrumb } from '../../lib/monitoring/sentry-config.js';

/**
 * Dashboard configuration for different monitoring platforms
 */
const DASHBOARD_CONFIGS = {
  grafana: {
    name: 'A Lo Cubano Boulder Fest - Production Monitoring',
    version: '1.0.0',
    panels: [
      {
        id: 1,
        title: 'System Health Overview',
        type: 'stat',
        targets: ['health.status', 'uptime.percentage', 'sla.compliance']
      },
      {
        id: 2,
        title: 'API Response Times',
        type: 'graph',
        targets: ['api.response_time.p50', 'api.response_time.p95', 'api.response_time.p99']
      },
      {
        id: 3,
        title: 'Payment Processing',
        type: 'stat',
        targets: ['payments.success_rate', 'payments.total', 'revenue.total']
      },
      {
        id: 4,
        title: 'Active Users',
        type: 'gauge',
        targets: ['users.active', 'users.registered']
      },
      {
        id: 5,
        title: 'Error Rate',
        type: 'graph',
        targets: ['errors.rate', 'errors.total']
      },
      {
        id: 6,
        title: 'Memory Usage',
        type: 'graph',
        targets: ['system.memory.heap_used', 'system.memory.heap_total']
      },
      {
        id: 7,
        title: 'Alert Status',
        type: 'table',
        targets: ['alerts.active', 'alerts.escalated']
      },
      {
        id: 8,
        title: 'Service Dependencies',
        type: 'heatmap',
        targets: ['dependencies.database', 'dependencies.stripe', 'dependencies.brevo']
      }
    ]
  },
  datadog: {
    name: 'alocubano-production',
    widgets: [
      {
        type: 'timeseries',
        title: 'API Performance',
        queries: [
          'avg:alocubano.api.response_time{*}',
          'p95:alocubano.api.response_time{*}'
        ]
      },
      {
        type: 'query_value',
        title: 'Current Revenue',
        query: 'sum:alocubano.revenue.total{*}'
      },
      {
        type: 'toplist',
        title: 'Top Errors',
        query: 'top(alocubano.errors{*} by {error_type}, 10)'
      }
    ]
  },
  newrelic: {
    name: 'A Lo Cubano Boulder Fest',
    dashboards: [
      {
        name: 'Business Metrics',
        widgets: ['revenue', 'tickets', 'users']
      },
      {
        name: 'Technical Metrics',
        widgets: ['performance', 'errors', 'infrastructure']
      }
    ]
  }
};

/**
 * Get real-time dashboard data
 */
async function getDashboardData() {
  const monitoringService = getMonitoringService();
  const healthChecker = getHealthChecker();
  const alertManager = getAlertManager();
  
  // Get all metrics
  const metrics = monitoringService.getMetricsSummary();
  const health = await healthChecker.executeAll();
  const uptime = getUptimeMetrics();
  const alerts = alertManager.getStatistics();
  
  // Calculate key metrics
  const errorRate = metrics.system['gauge.errors.total'] || 0;
  const requestCount = uptime.requests.total;
  const errorPercent = requestCount > 0 ? (errorRate / requestCount) * 100 : 0;
  
  // Calculate SLA
  const sla = calculateSLA(uptime.requests.successRate, errorPercent);
  
  return {
    timestamp: new Date().toISOString(),
    overview: {
      status: health.status,
      health_score: health.health_score || 0,
      uptime: uptime.uptime.formatted,
      sla_compliance: sla.compliance.overall
    },
    performance: {
      current: {
        response_time: metrics.performance?.avgResponseTime || 0,
        requests_per_minute: metrics.performance?.requestsPerMinute || 0,
        error_rate: errorPercent.toFixed(2) + '%'
      },
      percentiles: metrics.performance?.percentiles || {},
      trends: {
        response_time_trend: calculateTrend(metrics.performance?.history || []),
        error_trend: calculateTrend(metrics.system?.errorHistory || [])
      }
    },
    business: {
      revenue: {
        total: metrics.business.payments.revenue,
        today: calculateTodayRevenue(metrics.business.payments),
        average_transaction: metrics.business.payments.revenue / Math.max(1, metrics.business.payments.successes)
      },
      users: {
        active: metrics.business.users.activeCount,
        registered: metrics.business.users.registrations,
        conversion_rate: calculateConversionRate(metrics.business)
      },
      tickets: metrics.business.tickets
    },
    infrastructure: {
      memory: {
        used: formatBytes(metrics.system['gauge.system.memory.heap_used'] || 0),
        total: formatBytes(metrics.system['gauge.system.memory.heap_total'] || 0),
        percentage: calculateMemoryUsagePercent(metrics.system)
      },
      cpu: {
        user: metrics.system['gauge.system.cpu.user'] || 0,
        system: metrics.system['gauge.system.cpu.system'] || 0
      },
      dependencies: health.services || {}
    },
    alerts: {
      active_count: alerts.total_active,
      escalated_count: alerts.total_escalated,
      by_severity: alerts.severity_breakdown,
      by_category: alerts.category_breakdown,
      recent: alerts.recent_alerts
    }
  };
}

/**
 * Calculate trend from historical data
 */
function calculateTrend(history) {
  if (!history || history.length < 2) {
    return 'stable';
  }
  
  const recent = history.slice(-10);
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const change = firstAvg === 0 ? 0 : ((secondAvg - firstAvg) / firstAvg) * 100;
  
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
}

/**
 * Calculate today's revenue
 */
function calculateTodayRevenue(payments) {
  // This would typically query from database with date filter
  // For now, return a portion of total as estimate
  const dailyEstimate = payments.revenue * 0.1; // Rough estimate
  return dailyEstimate;
}

/**
 * Calculate conversion rate
 */
function calculateConversionRate(business) {
  if (business.users.registrations === 0) {
    return 0;
  }
  
  const conversions = business.tickets.created;
  const rate = (conversions / business.users.registrations) * 100;
  return Math.min(100, rate); // Cap at 100%
}

/**
 * Calculate memory usage percentage
 */
function calculateMemoryUsagePercent(system) {
  const used = system['gauge.system.memory.heap_used'] || 0;
  const total = system['gauge.system.memory.heap_total'] || 1;
  return ((used / total) * 100).toFixed(2);
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Generate dashboard configuration
 */
function generateDashboardConfig(platform, data) {
  const config = DASHBOARD_CONFIGS[platform];
  
  if (!config) {
    return null;
  }
  
  // Add real-time data to configuration
  const enrichedConfig = {
    ...config,
    generated: new Date().toISOString(),
    data_source: {
      url: `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/monitoring/metrics`,
      refresh_interval: 30000
    },
    alerts: {
      webhook_url: process.env.ALERT_WEBHOOK_URL || null,
      escalation_url: process.env.ESCALATION_WEBHOOK_URL || null
    },
    current_values: data
  };
  
  return enrichedConfig;
}

/**
 * Main dashboard handler
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Add breadcrumb
    addBreadcrumb({
      category: 'monitoring',
      message: 'Dashboard data requested',
      level: 'info',
      data: {
        path: req.url,
        query: req.query
      }
    });
    
    // Get query parameters
    const { platform, format = 'json' } = req.query;
    
    // Get dashboard data
    const dashboardData = await getDashboardData();
    
    // Generate platform-specific configuration if requested
    let response = dashboardData;
    
    if (platform) {
      const config = generateDashboardConfig(platform, dashboardData);
      if (!config) {
        return res.status(400).json({
          error: 'Invalid platform',
          supported: Object.keys(DASHBOARD_CONFIGS)
        });
      }
      response = config;
    }
    
    // Format response
    if (format === 'html') {
      // Return HTML dashboard
      const html = generateHTMLDashboard(dashboardData);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Dashboard-Status', dashboardData.overview.status);
    res.setHeader('X-Dashboard-Health', dashboardData.overview.health_score);
    
    // Send JSON response
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Dashboard error:', error);
    
    // Add error breadcrumb
    addBreadcrumb({
      category: 'monitoring',
      message: 'Dashboard generation failed',
      level: 'error',
      data: {
        error: error.message
      }
    });
    
    res.status(500).json({
      error: 'Dashboard generation failure',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Generate HTML dashboard
 */
function generateHTMLDashboard(data) {
  const statusColor = data.overview.status === 'healthy' ? '#4CAF50' :
                      data.overview.status === 'degraded' ? '#FF9800' : '#F44336';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A Lo Cubano - Production Monitoring Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { 
      color: #fff;
      margin-bottom: 30px;
      font-size: 2em;
      border-bottom: 2px solid #333;
      padding-bottom: 15px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: #1a1a1a;
      border-radius: 8px;
      padding: 20px;
      border: 1px solid #333;
    }
    .card h2 {
      color: #fff;
      font-size: 1.2em;
      margin-bottom: 15px;
      border-bottom: 1px solid #333;
      padding-bottom: 10px;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      padding: 8px 0;
      border-bottom: 1px solid #222;
    }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: #999; }
    .metric-value { 
      color: #fff;
      font-weight: 500;
      font-family: 'Courier New', monospace;
    }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: 500;
      color: #fff;
    }
    .status.healthy { background: #4CAF50; }
    .status.degraded { background: #FF9800; }
    .status.unhealthy { background: #F44336; }
    .progress {
      width: 100%;
      height: 20px;
      background: #333;
      border-radius: 4px;
      overflow: hidden;
      margin: 5px 0;
    }
    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #4CAF50, #8BC34A);
      transition: width 0.3s ease;
    }
    .alert {
      background: #2a1a1a;
      border-left: 4px solid #FF9800;
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
    }
    .timestamp {
      color: #666;
      font-size: 0.9em;
      margin-top: 20px;
      text-align: center;
    }
    .refresh-btn {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1em;
      margin: 20px 0;
    }
    .refresh-btn:hover { background: #45a049; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎉 A Lo Cubano Boulder Fest - Production Monitoring</h1>
    
    <div class="grid">
      <div class="card">
        <h2>System Overview</h2>
        <div class="metric">
          <span class="metric-label">Status</span>
          <span class="status ${data.overview.status}">${data.overview.status.toUpperCase()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Health Score</span>
          <span class="metric-value">${data.overview.health_score}/100</span>
        </div>
        <div class="metric">
          <span class="metric-label">Uptime</span>
          <span class="metric-value">${data.overview.uptime}</span>
        </div>
        <div class="metric">
          <span class="metric-label">SLA Compliance</span>
          <span class="metric-value">${data.overview.sla_compliance ? '✅' : '❌'}</span>
        </div>
      </div>
      
      <div class="card">
        <h2>Performance Metrics</h2>
        <div class="metric">
          <span class="metric-label">Avg Response Time</span>
          <span class="metric-value">${data.performance.current.response_time}ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Requests/min</span>
          <span class="metric-value">${data.performance.current.requests_per_minute}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Error Rate</span>
          <span class="metric-value">${data.performance.current.error_rate}</span>
        </div>
        <div class="metric">
          <span class="metric-label">P95 Response</span>
          <span class="metric-value">${data.performance.percentiles.p95 || 0}ms</span>
        </div>
      </div>
      
      <div class="card">
        <h2>Business Metrics</h2>
        <div class="metric">
          <span class="metric-label">Total Revenue</span>
          <span class="metric-value">$${data.business.revenue.total.toFixed(2)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Active Users</span>
          <span class="metric-value">${data.business.users.active}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Tickets Created</span>
          <span class="metric-value">${data.business.tickets.created}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Conversion Rate</span>
          <span class="metric-value">${data.business.users.conversion_rate.toFixed(1)}%</span>
        </div>
      </div>
      
      <div class="card">
        <h2>Infrastructure</h2>
        <div class="metric">
          <span class="metric-label">Memory Usage</span>
          <span class="metric-value">${data.infrastructure.memory.used} / ${data.infrastructure.memory.total}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Memory %</span>
          <div style="flex: 1; margin: 0 10px;">
            <div class="progress">
              <div class="progress-bar" style="width: ${data.infrastructure.memory.percentage}%"></div>
            </div>
          </div>
          <span class="metric-value">${data.infrastructure.memory.percentage}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Database</span>
          <span class="status ${data.infrastructure.dependencies.database?.status || 'unknown'}">
            ${data.infrastructure.dependencies.database?.status || 'UNKNOWN'}
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">Stripe</span>
          <span class="status ${data.infrastructure.dependencies.stripe?.status || 'unknown'}">
            ${data.infrastructure.dependencies.stripe?.status || 'UNKNOWN'}
          </span>
        </div>
      </div>
      
      <div class="card">
        <h2>Active Alerts</h2>
        <div class="metric">
          <span class="metric-label">Active</span>
          <span class="metric-value">${data.alerts.active_count}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Escalated</span>
          <span class="metric-value">${data.alerts.escalated_count}</span>
        </div>
        ${data.alerts.recent && data.alerts.recent.length > 0 ? `
          <div style="margin-top: 15px;">
            ${data.alerts.recent.slice(0, 3).map(alert => `
              <div class="alert">
                <strong>${alert.title || 'Alert'}</strong><br>
                <small>${new Date(alert.timestamp).toLocaleString()}</small>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color: #666; margin-top: 15px;">No recent alerts</p>'}
      </div>
    </div>
    
    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Dashboard</button>
    
    <div class="timestamp">
      Last updated: ${new Date(data.timestamp).toLocaleString()}
    </div>
  </div>
  
  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
  `;
}

/**
 * Export utilities
 */
export {
  getDashboardData,
  generateDashboardConfig,
  generateHTMLDashboard,
  DASHBOARD_CONFIGS
};