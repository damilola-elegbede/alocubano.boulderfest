import { getMonitoringService } from '../../lib/monitoring/monitoring-service.js';
import { getHealthChecker } from '../../lib/monitoring/health-checker.js';
import { getAlertManager } from '../../lib/monitoring/alert-manager.js';
import { addBreadcrumb } from '../../lib/monitoring/sentry-config.js';

/**
 * Validate API key for metrics access
 */
function validateApiKey(req) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.METRICS_API_KEY;
  
  // If no key is configured, allow access in development only
  if (!validKey) {
    return process.env.VERCEL_ENV === 'development';
  }
  
  return apiKey === validKey;
}

/**
 * Get detailed metrics based on category
 */
async function getDetailedMetrics(category) {
  const monitoringService = getMonitoringService();
  const metrics = monitoringService.getMetricsSummary();
  
  switch (category) {
    case 'system':
      return {
        memory: {
          heap_used: metrics.system['gauge.system.memory.heap_used'],
          heap_total: metrics.system['gauge.system.memory.heap_total'],
          rss: metrics.system['gauge.system.memory.rss'],
          usage_percent: metrics.system['gauge.system.memory.heap_used'] / 
                        metrics.system['gauge.system.memory.heap_total'] * 100
        },
        cpu: {
          user: metrics.system['gauge.system.cpu.user'],
          system: metrics.system['gauge.system.cpu.system']
        },
        process: {
          uptime: process.uptime(),
          pid: process.pid,
          version: process.version
        }
      };
      
    case 'business':
      return {
        payments: metrics.business.payments,
        users: metrics.business.users,
        tickets: metrics.business.tickets,
        revenue: {
          total: metrics.business.payments.revenue,
          average_transaction: metrics.business.payments.attempts > 0 ?
            metrics.business.payments.revenue / metrics.business.payments.successes : 0
        }
      };
      
    case 'performance':
      return {
        api: metrics.performance,
        transactions: metrics.transactions,
        response_times: {
          p50: metrics.performance?.percentiles?.p50,
          p95: metrics.performance?.percentiles?.p95,
          p99: metrics.performance?.percentiles?.p99,
          mean: metrics.performance?.avgResponseTime
        }
      };
      
    case 'errors':
      return {
        total: metrics.system['gauge.errors.total'] || 0,
        by_type: Object.entries(metrics.system)
          .filter(([key]) => key.startsWith('counter.errors'))
          .reduce((acc, [key, value]) => {
            const type = key.split('.').pop();
            acc[type] = value;
            return acc;
          }, {})
      };
      
    case 'alerts':
      return metrics.alerts;
      
    default:
      return metrics;
  }
}

/**
 * Format metrics for different monitoring systems
 */
function formatMetricsForSystem(metrics, format) {
  const monitoringService = getMonitoringService();
  
  switch (format) {
    case 'prometheus':
      return formatPrometheus(metrics);
    case 'datadog':
      return formatDatadog(metrics);
    case 'newrelic':
      return formatNewRelic(metrics);
    case 'cloudwatch':
      return formatCloudWatch(metrics);
    default:
      return metrics;
  }
}

/**
 * Format metrics for Prometheus
 */
function formatPrometheus(metrics) {
  const lines = [];
  const timestamp = Date.now();
  
  // Helper function to format metric name
  const formatName = (name) => name.replace(/[.-]/g, '_').toLowerCase();
  
  // System metrics
  if (metrics.system) {
    Object.entries(metrics.system).forEach(([key, value]) => {
      if (typeof value === 'number' && !isNaN(value)) {
        const metricName = `alocubano_${formatName(key)}`;
        lines.push(`# TYPE ${metricName} gauge`);
        lines.push(`${metricName} ${value} ${timestamp}`);
      }
    });
  }
  
  // Business metrics
  if (metrics.business) {
    const business = metrics.business;
    
    // Payment metrics
    if (business.payments) {
      lines.push('# TYPE alocubano_payments_total counter');
      lines.push(`alocubano_payments_total{status="success"} ${business.payments.successes}`);
      lines.push(`alocubano_payments_total{status="failure"} ${business.payments.failures}`);
      
      lines.push('# TYPE alocubano_revenue_total counter');
      lines.push(`alocubano_revenue_total ${business.payments.revenue}`);
    }
    
    // User metrics
    if (business.users) {
      lines.push('# TYPE alocubano_users_active gauge');
      lines.push(`alocubano_users_active ${business.users.activeCount}`);
      
      lines.push('# TYPE alocubano_users_registered counter');
      lines.push(`alocubano_users_registered ${business.users.registrations}`);
    }
    
    // Ticket metrics
    if (business.tickets) {
      lines.push('# TYPE alocubano_tickets_total counter');
      Object.entries(business.tickets).forEach(([operation, count]) => {
        lines.push(`alocubano_tickets_total{operation="${operation}"} ${count}`);
      });
    }
  }
  
  // Performance metrics
  if (metrics.performance && metrics.performance.percentiles) {
    const perf = metrics.performance.percentiles;
    lines.push('# TYPE alocubano_response_time_milliseconds summary');
    lines.push(`alocubano_response_time_milliseconds{quantile="0.5"} ${perf.p50 || 0}`);
    lines.push(`alocubano_response_time_milliseconds{quantile="0.95"} ${perf.p95 || 0}`);
    lines.push(`alocubano_response_time_milliseconds{quantile="0.99"} ${perf.p99 || 0}`);
  }
  
  return lines.join('\n');
}

/**
 * Format metrics for Datadog
 */
function formatDatadog(metrics) {
  const series = [];
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Helper function to create metric entry
  const createMetric = (name, value, type = 'gauge', tags = []) => ({
    metric: `alocubano.${name}`,
    points: [[timestamp, value]],
    type,
    tags
  });
  
  // System metrics
  if (metrics.system) {
    Object.entries(metrics.system).forEach(([key, value]) => {
      if (typeof value === 'number' && !isNaN(value)) {
        const type = key.includes('counter') ? 'count' : 'gauge';
        series.push(createMetric(key, value, type));
      }
    });
  }
  
  // Business metrics
  if (metrics.business) {
    const business = metrics.business;
    
    if (business.payments) {
      series.push(createMetric('payments.success', business.payments.successes, 'count'));
      series.push(createMetric('payments.failure', business.payments.failures, 'count'));
      series.push(createMetric('revenue.total', business.payments.revenue, 'count'));
    }
    
    if (business.users) {
      series.push(createMetric('users.active', business.users.activeCount, 'gauge'));
      series.push(createMetric('users.registered', business.users.registrations, 'count'));
    }
  }
  
  return { series };
}

/**
 * Format metrics for New Relic
 */
function formatNewRelic(metrics) {
  const metricsData = [];
  const timestamp = Date.now();
  
  // System metrics
  if (metrics.system) {
    Object.entries(metrics.system).forEach(([key, value]) => {
      if (typeof value === 'number' && !isNaN(value)) {
        metricsData.push({
          name: `Custom/ALoCubano/${key}`,
          value,
          timestamp
        });
      }
    });
  }
  
  // Business metrics
  if (metrics.business) {
    metricsData.push({
      name: 'Custom/ALoCubano/Revenue',
      value: metrics.business.payments.revenue,
      timestamp
    });
    
    metricsData.push({
      name: 'Custom/ALoCubano/ActiveUsers',
      value: metrics.business.users.activeCount,
      timestamp
    });
  }
  
  return {
    agent: {
      host: 'alocubano-boulderfest',
      version: '1.0.0'
    },
    metrics: metricsData
  };
}

/**
 * Format metrics for CloudWatch
 */
function formatCloudWatch(metrics) {
  const metricData = [];
  const timestamp = new Date();
  
  // System metrics
  if (metrics.system) {
    Object.entries(metrics.system).forEach(([key, value]) => {
      if (typeof value === 'number' && !isNaN(value)) {
        metricData.push({
          MetricName: key.replace(/[.-]/g, '_'),
          Value: value,
          Unit: key.includes('memory') ? 'Bytes' : 
                 key.includes('time') ? 'Milliseconds' : 'None',
          Timestamp: timestamp
        });
      }
    });
  }
  
  // Business metrics
  if (metrics.business) {
    metricData.push({
      MetricName: 'Revenue',
      Value: metrics.business.payments.revenue,
      Unit: 'None',
      Timestamp: timestamp
    });
    
    metricData.push({
      MetricName: 'ActiveUsers',
      Value: metrics.business.users.activeCount,
      Unit: 'Count',
      Timestamp: timestamp
    });
  }
  
  return {
    Namespace: 'ALoCubano/Production',
    MetricData: metricData
  };
}

/**
 * Main metrics handler
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Validate API key
    if (!validateApiKey(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Add breadcrumb
    addBreadcrumb({
      category: 'monitoring',
      message: 'Metrics requested',
      level: 'info',
      data: {
        path: req.url,
        query: req.query
      }
    });
    
    // Get query parameters
    const { format = 'json', category = 'all', pretty = 'false' } = req.query;
    
    // Get metrics based on category
    const metrics = category === 'all' 
      ? getMonitoringService().getMetricsSummary()
      : await getDetailedMetrics(category);
    
    // Format metrics based on requested format
    let formattedMetrics = formatMetricsForSystem(metrics, format);
    
    // Set appropriate content type
    let contentType = 'application/json';
    if (format === 'prometheus') {
      contentType = 'text/plain; version=0.0.4';
    }
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Metrics-Format', format);
    res.setHeader('X-Metrics-Category', category);
    
    // Send response
    if (format === 'prometheus') {
      res.status(200).send(formattedMetrics);
    } else {
      const jsonResponse = pretty === 'true' 
        ? JSON.stringify(formattedMetrics, null, 2)
        : JSON.stringify(formattedMetrics);
      res.status(200).send(jsonResponse);
    }
    
  } catch (error) {
    console.error('Metrics export error:', error);
    
    // Add error breadcrumb
    addBreadcrumb({
      category: 'monitoring',
      message: 'Metrics export failed',
      level: 'error',
      data: {
        error: error.message
      }
    });
    
    res.status(500).json({
      error: 'Metrics export failure',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Export utilities for use in other monitoring tools
 */
export {
  getDetailedMetrics,
  formatMetricsForSystem,
  formatPrometheus,
  formatDatadog,
  formatNewRelic,
  formatCloudWatch
};