/**
 * Monitoring System Integration
 * Central entry point for all monitoring and analytics functionality
 */

// Import all monitoring modules
import sentryConfig from './sentry-config.js';
import analyticsIntegration from './analytics-integration.js';
import performanceMonitor from './performance-monitor.js';
import businessIntelligence from './business-intelligence.js';
import alertingSystem from './alerting-system.js';
import dashboard from './dashboard.js';

/**
 * Initialize all monitoring systems
 */
export async function initializeMonitoring(config = {}) {
  console.log('Initializing comprehensive monitoring system...');

  try {
    // Initialize Sentry for error tracking
    if (config.sentry?.enabled !== false) {
      sentryConfig.initSentry();
      console.log('✓ Sentry error monitoring initialized');
    }

    // Initialize Google Analytics
    if (config.analytics?.enabled !== false && typeof window !== 'undefined') {
      analyticsIntegration.initializeGA4();
      console.log('✓ Google Analytics 4 initialized');
    }

    // Setup performance monitoring
    if (config.performance?.enabled !== false) {
      performanceMonitor.performanceMonitor.on('performance_alert', (alert) => {
        alertingSystem.alerts.performanceDegradation(
          alert.operation,
          alert.duration,
          alert.threshold
        );
      });
      console.log('✓ Performance monitoring initialized');
    }

    // Setup business intelligence
    if (config.businessIntelligence?.enabled !== false) {
      businessIntelligence.businessIntelligence.on('revenue_update', (data) => {
        console.log('Revenue update:', data.amount);
      });

      businessIntelligence.businessIntelligence.on('inventory_alert', (alert) => {
        alertingSystem.alerts.lowInventory(
          alert.itemId,
          alert.currentLevel,
          alert.alert.threshold
        );
      });
      console.log('✓ Business intelligence monitoring initialized');
    }

    // Configure alerting channels
    if (config.alerting?.enabled !== false) {
      await setupAlertingChannels(config.alerting || {});
      console.log('✓ Alerting system configured');
    }

    // Start dashboard
    if (config.dashboard?.enabled !== false) {
      dashboard.monitoringDashboard.startRealTimeUpdates();
      console.log('✓ Real-time dashboard started');
    }

    console.log('🎉 Monitoring system fully initialized');
    return true;

  } catch (error) {
    console.error('Failed to initialize monitoring system:', error);
    throw error;
  }
}

/**
 * Setup alerting channels based on configuration
 */
async function setupAlertingChannels(alertConfig) {
  const { alertingSystem: alerts } = alertingSystem;

  // Email channels
  if (alertConfig.email) {
    alerts.registerChannel('email_ops', {
      type: 'email',
      recipients: alertConfig.email.operations || ['ops@alocubanoboulderfest.com'],
      enabled: true
    });

    alerts.registerChannel('email_dev', {
      type: 'email',
      recipients: alertConfig.email.development || ['dev@alocubanoboulderfest.com'],
      enabled: true
    });

    alerts.registerChannel('email_business', {
      type: 'email',
      recipients: alertConfig.email.business || ['business@alocubanoboulderfest.com'],
      enabled: true
    });

    alerts.registerChannel('email_security', {
      type: 'email',
      recipients: alertConfig.email.security || ['security@alocubanoboulderfest.com'],
      enabled: true
    });
  }

  // Slack channels
  if (alertConfig.slack) {
    alerts.registerChannel('slack_alerts', {
      type: 'slack',
      webhookUrl: alertConfig.slack.webhookUrl,
      channel: alertConfig.slack.alertsChannel || '#alerts',
      enabled: !!alertConfig.slack.webhookUrl
    });

    alerts.registerChannel('slack_business', {
      type: 'slack',
      webhookUrl: alertConfig.slack.webhookUrl,
      channel: alertConfig.slack.businessChannel || '#business',
      enabled: !!alertConfig.slack.webhookUrl
    });

    alerts.registerChannel('slack_security', {
      type: 'slack',
      webhookUrl: alertConfig.slack.webhookUrl,
      channel: alertConfig.slack.securityChannel || '#security',
      enabled: !!alertConfig.slack.webhookUrl
    });
  }

  // SMS channels
  if (alertConfig.sms) {
    alerts.registerChannel('sms_oncall', {
      type: 'sms',
      phoneNumbers: alertConfig.sms.oncallNumbers || [],
      enabled: alertConfig.sms.oncallNumbers?.length > 0
    });

    alerts.registerChannel('sms_security', {
      type: 'sms',
      phoneNumbers: alertConfig.sms.securityNumbers || [],
      enabled: alertConfig.sms.securityNumbers?.length > 0
    });
  }

  // PagerDuty
  if (alertConfig.pagerduty) {
    alerts.registerChannel('pagerduty', {
      type: 'pagerduty',
      integrationKey: alertConfig.pagerduty.integrationKey,
      enabled: !!alertConfig.pagerduty.integrationKey
    });
  }

  // Discord
  if (alertConfig.discord) {
    alerts.registerChannel('discord_alerts', {
      type: 'discord',
      webhookUrl: alertConfig.discord.webhookUrl,
      channelName: alertConfig.discord.channelName || 'alerts',
      enabled: !!alertConfig.discord.webhookUrl
    });
  }

  // Webhook integrations
  if (alertConfig.webhooks) {
    alertConfig.webhooks.forEach((webhook, index) => {
      alerts.registerChannel(`webhook_${index}`, {
        type: 'webhook',
        url: webhook.url,
        headers: webhook.headers,
        enabled: !!webhook.url
      });
    });
  }
}

/**
 * Enhanced payment processing with monitoring
 */
export function withMonitoring(operationName, operation) {
  return sentryConfig.withPaymentMonitoring(operationName, 
    performanceMonitor.withPaymentPerformanceMonitoring(operationName, operation)
  );
}

/**
 * Track ecommerce event with analytics
 */
export function trackEcommerceEvent(eventType, data) {
  if (typeof window !== 'undefined') {
    switch (eventType) {
      case 'view_item':
        analyticsIntegration.trackViewItem(data);
        break;
      case 'add_to_cart':
        analyticsIntegration.trackAddToCart(data.item, data.quantity);
        break;
      case 'begin_checkout':
        analyticsIntegration.trackBeginCheckout(data.items, data.totalValue);
        break;
      case 'purchase':
        analyticsIntegration.trackPurchase(data);
        break;
      case 'payment_failed':
        analyticsIntegration.trackPaymentFailed(data);
        break;
      default:
        console.warn(`Unknown ecommerce event: ${eventType}`);
    }
  }
}

/**
 * Track business metrics
 */
export function trackBusinessMetric(metricType, data) {
  const { businessIntelligence: bi } = businessIntelligence;

  switch (metricType) {
    case 'revenue':
      bi.trackRevenue(data);
      break;
    case 'conversion':
      bi.trackConversionStep(data.step, data.sessionId, data.data);
      break;
    case 'customer_behavior':
      bi.trackCustomerBehavior(data.customerEmail, data.action, data.data);
      break;
    case 'inventory':
      bi.trackInventoryLevel(data.itemId, data.currentLevel, data.reservedLevel);
      break;
    default:
      console.warn(`Unknown business metric: ${metricType}`);
  }
}

/**
 * Send alert
 */
export function sendAlert(alertType, data) {
  const { alerts } = alertingSystem;

  switch (alertType) {
    case 'payment_failed':
      return alerts.paymentFailed(data.error, data.context);
    case 'high_error_rate':
      return alerts.highErrorRate(data.errorRate, data.threshold, data.timeWindow);
    case 'performance_degradation':
      return alerts.performanceDegradation(data.metric, data.value, data.threshold);
    case 'security_incident':
      return alerts.securityIncident(data.incidentType, data.description, data.context);
    case 'low_inventory':
      return alerts.lowInventory(data.itemId, data.currentLevel, data.threshold);
    case 'revenue_anomaly':
      return alerts.revenueAnomaly(data.anomalyType, data.details);
    default:
      console.warn(`Unknown alert type: ${alertType}`);
  }
}

/**
 * Get monitoring dashboard data
 */
export function getDashboardData() {
  return dashboard.dashboardAPI.getDashboard();
}

/**
 * Get executive summary
 */
export function getExecutiveSummary() {
  return dashboard.dashboardAPI.getExecutiveSummary();
}

/**
 * Express.js middleware for automatic monitoring
 */
export function monitoringMiddleware() {
  return [
    // Sentry request handler
    sentryConfig.sentryErrorMiddleware(),
    
    // Performance monitoring
    performanceMonitor.apiPerformanceMiddleware(),
    
    // Request logging and tracking
    (req, res, next) => {
      const startTime = Date.now();
      const originalSend = res.send;
      
      res.send = function(body) {
        const duration = Date.now() - startTime;
        
        // Track API usage
        trackBusinessMetric('api_usage', {
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          duration,
          userAgent: req.headers['user-agent']
        });
        
        // Track errors
        if (res.statusCode >= 400) {
          const errorData = {
            endpoint: req.path,
            method: req.method,
            statusCode: res.statusCode,
            error: body?.error || 'Unknown error',
            duration
          };
          
          if (res.statusCode >= 500) {
            sendAlert('api_error', errorData);
          }
        }
        
        originalSend.call(this, body);
      };
      
      next();
    }
  ];
}

/**
 * Health check endpoint data
 */
export function getHealthCheck() {
  const dashboardData = getDashboardData();
  
  return {
    status: dashboardData.system.status,
    timestamp: Date.now(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    system: {
      health: dashboardData.system.overallHealth,
      alerts: dashboardData.alerts.totalActive,
      performance: {
        responseTime: dashboardData.performance.apis.responseTime,
        errorRate: dashboardData.performance.apis.errorRate
      }
    },
    business: {
      ordersToday: dashboardData.business.orders.today,
      revenueToday: dashboardData.business.revenue.today,
      conversionRate: dashboardData.business.conversion.rate
    }
  };
}

/**
 * Export monitoring configuration for environment setup
 */
export function getRequiredEnvironmentVariables() {
  return [
    // Sentry
    'SENTRY_DSN',
    
    // Google Analytics
    'GA4_MEASUREMENT_ID',
    
    // Alerting
    'SLACK_WEBHOOK_URL',
    'PAGERDUTY_INTEGRATION_KEY',
    'ALERT_EMAIL_RECIPIENTS',
    
    // Business Intelligence
    'DAILY_REVENUE_TARGET',
    'LOW_STOCK_THRESHOLDS'
  ];
}

// Export all monitoring modules for direct access
export {
  sentryConfig,
  analyticsIntegration,
  performanceMonitor,
  businessIntelligence,
  alertingSystem,
  dashboard
};

// Default export
export default {
  initializeMonitoring,
  withMonitoring,
  trackEcommerceEvent,
  trackBusinessMetric,
  sendAlert,
  getDashboardData,
  getExecutiveSummary,
  monitoringMiddleware,
  getHealthCheck,
  getRequiredEnvironmentVariables
};