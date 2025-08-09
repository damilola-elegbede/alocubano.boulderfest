import { getAlertManager, AlertSeverity, AlertCategory } from '../../lib/monitoring/alert-manager.js';
import { addBreadcrumb, captureMessage } from '../../lib/monitoring/sentry-config.js';

/**
 * Validate admin access for alert management
 */
function validateAdminAccess(req) {
  const apiKey = req.headers['x-admin-key'] || req.query.admin_key;
  const validKey = process.env.ADMIN_API_KEY;
  
  // If no key is configured, allow access in development only
  if (!validKey) {
    return process.env.VERCEL_ENV === 'development';
  }
  
  return apiKey === validKey;
}

/**
 * Test alert configuration
 */
async function testAlertConfiguration(alertManager, channel) {
  const testAlert = {
    category: AlertCategory.EXTERNAL_SERVICE,
    service: 'monitoring',
    type: 'test_alert',
    severity: AlertSeverity.INFO,
    description: 'This is a test alert to verify alert configuration',
    metrics: {
      test: true,
      timestamp: new Date().toISOString(),
      channel
    }
  };
  
  try {
    const result = await alertManager.processAlert(testAlert);
    return {
      success: result.sent,
      channels: result.channels,
      message: result.sent ? 'Test alert sent successfully' : 'Test alert was suppressed or failed'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create alert rule
 */
function createAlertRule(rule) {
  const validatedRule = {
    id: rule.id || `rule_${Date.now()}`,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled !== false,
    conditions: {
      metric: rule.conditions.metric,
      operator: rule.conditions.operator || '>',
      threshold: rule.conditions.threshold,
      duration: rule.conditions.duration || 60000, // Default 1 minute
      aggregation: rule.conditions.aggregation || 'avg'
    },
    actions: {
      severity: rule.actions.severity || AlertSeverity.MEDIUM,
      category: rule.actions.category || AlertCategory.EXTERNAL_SERVICE,
      channels: rule.actions.channels || ['sentry'],
      cooldown: rule.actions.cooldown || 300000 // Default 5 minutes
    },
    metadata: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      ...rule.metadata
    }
  };
  
  return validatedRule;
}

/**
 * Validate alert rule
 */
function validateAlertRule(rule) {
  const errors = [];
  
  if (!rule.name) {
    errors.push('Rule name is required');
  }
  
  if (!rule.conditions?.metric) {
    errors.push('Metric to monitor is required');
  }
  
  if (rule.conditions?.threshold === undefined) {
    errors.push('Threshold value is required');
  }
  
  const validOperators = ['>', '<', '>=', '<=', '==', '!='];
  if (rule.conditions?.operator && !validOperators.includes(rule.conditions.operator)) {
    errors.push(`Invalid operator. Must be one of: ${validOperators.join(', ')}`);
  }
  
  const validSeverities = Object.values(AlertSeverity);
  if (rule.actions?.severity && !validSeverities.includes(rule.actions.severity)) {
    errors.push(`Invalid severity. Must be one of: ${validSeverities.join(', ')}`);
  }
  
  const validCategories = Object.values(AlertCategory);
  if (rule.actions?.category && !validCategories.includes(rule.actions.category)) {
    errors.push(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }
  
  return errors;
}

/**
 * Get predefined alert templates
 */
function getAlertTemplates() {
  return {
    high_error_rate: {
      name: 'High Error Rate',
      description: 'Alert when error rate exceeds threshold',
      conditions: {
        metric: 'errors.rate',
        operator: '>',
        threshold: 0.05,
        duration: 300000,
        aggregation: 'avg'
      },
      actions: {
        severity: AlertSeverity.HIGH,
        category: AlertCategory.EXTERNAL_SERVICE,
        channels: ['sentry', 'webhook']
      }
    },
    payment_failures: {
      name: 'Payment Failures',
      description: 'Alert on high payment failure rate',
      conditions: {
        metric: 'payments.failure_rate',
        operator: '>',
        threshold: 0.01,
        duration: 60000,
        aggregation: 'avg'
      },
      actions: {
        severity: AlertSeverity.CRITICAL,
        category: AlertCategory.PAYMENT,
        channels: ['sentry', 'webhook', 'escalation']
      }
    },
    slow_response: {
      name: 'Slow API Response',
      description: 'Alert when API response time is high',
      conditions: {
        metric: 'api.response_time.p95',
        operator: '>',
        threshold: 2000,
        duration: 180000,
        aggregation: 'p95'
      },
      actions: {
        severity: AlertSeverity.MEDIUM,
        category: AlertCategory.PERFORMANCE,
        channels: ['sentry']
      }
    },
    database_down: {
      name: 'Database Unavailable',
      description: 'Alert when database is not responding',
      conditions: {
        metric: 'database.available',
        operator: '==',
        threshold: false,
        duration: 30000,
        aggregation: 'any'
      },
      actions: {
        severity: AlertSeverity.CRITICAL,
        category: AlertCategory.DATABASE,
        channels: ['sentry', 'webhook', 'escalation']
      }
    },
    memory_usage: {
      name: 'High Memory Usage',
      description: 'Alert when memory usage is too high',
      conditions: {
        metric: 'system.memory.usage_percent',
        operator: '>',
        threshold: 80,
        duration: 600000,
        aggregation: 'avg'
      },
      actions: {
        severity: AlertSeverity.MEDIUM,
        category: AlertCategory.CAPACITY,
        channels: ['sentry']
      }
    },
    low_revenue: {
      name: 'Low Revenue',
      description: 'Alert when hourly revenue is below threshold',
      conditions: {
        metric: 'business.revenue.hourly',
        operator: '<',
        threshold: 100,
        duration: 3600000,
        aggregation: 'sum'
      },
      actions: {
        severity: AlertSeverity.LOW,
        category: AlertCategory.BUSINESS,
        channels: ['webhook']
      }
    }
  };
}

/**
 * Main alerts handler
 */
export default async function handler(req, res) {
  try {
    // Add breadcrumb
    addBreadcrumb({
      category: 'monitoring',
      message: `Alert management: ${req.method} ${req.url}`,
      level: 'info',
      data: {
        method: req.method,
        path: req.url,
        query: req.query
      }
    });
    
    const alertManager = getAlertManager();
    
    switch (req.method) {
      case 'GET': {
        // Get alert status and configuration
        const { action } = req.query;
        
        switch (action) {
          case 'status':
            // Get current alert status
            const status = alertManager.getStatistics();
            return res.status(200).json({
              success: true,
              data: status
            });
            
          case 'active':
            // Get active alerts
            const activeAlerts = alertManager.getActiveAlerts();
            return res.status(200).json({
              success: true,
              count: activeAlerts.length,
              alerts: activeAlerts
            });
            
          case 'templates':
            // Get alert templates
            const templates = getAlertTemplates();
            return res.status(200).json({
              success: true,
              templates
            });
            
          case 'configuration':
            // Get current configuration (admin only)
            if (!validateAdminAccess(req)) {
              return res.status(401).json({ error: 'Unauthorized' });
            }
            
            return res.status(200).json({
              success: true,
              configuration: {
                thresholds: alertManager.thresholds,
                channels: Object.keys(alertManager.alertChannels).map(k => 
                  k.includes('Url') ? k.replace('Url', '') : k
                ),
                suppressionRules: alertManager.suppressionRules,
                maintenanceWindows: alertManager.maintenanceWindows,
                enabled: alertManager.enabled
              }
            });
            
          default:
            // Get alert statistics
            const statistics = alertManager.getStatistics();
            return res.status(200).json({
              success: true,
              statistics,
              available_actions: ['status', 'active', 'templates', 'configuration']
            });
        }
      }
      
      case 'POST': {
        // Admin access required for POST operations
        if (!validateAdminAccess(req)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { action, ...body } = req.body;
        
        switch (action) {
          case 'test':
            // Test alert configuration
            const testResult = await testAlertConfiguration(
              alertManager,
              body.channel || 'all'
            );
            
            // Log test alert
            captureMessage('Alert test performed', 'info', {
              channel: body.channel || 'all',
              result: testResult
            });
            
            return res.status(200).json({
              success: true,
              test: testResult
            });
            
          case 'trigger':
            // Manually trigger an alert
            const alertData = {
              category: body.category || AlertCategory.EXTERNAL_SERVICE,
              service: body.service || 'manual',
              type: body.type || 'manual_alert',
              severity: body.severity || AlertSeverity.INFO,
              description: body.description || 'Manually triggered alert',
              metrics: body.metrics || {}
            };
            
            const result = await alertManager.processAlert(alertData);
            
            return res.status(200).json({
              success: result.sent,
              alert: result.alert,
              channels: result.channels
            });
            
          case 'create_rule':
            // Create a new alert rule
            const validationErrors = validateAlertRule(body);
            if (validationErrors.length > 0) {
              return res.status(400).json({
                success: false,
                errors: validationErrors
              });
            }
            
            const rule = createAlertRule(body);
            
            // TODO: Store rule in database
            // For now, just return the created rule
            return res.status(201).json({
              success: true,
              rule,
              message: 'Alert rule created (not persisted in this version)'
            });
            
          case 'clear':
            // Clear a specific alert
            if (body.alertKey) {
              alertManager.clearAlert(body.alertKey);
              return res.status(200).json({
                success: true,
                message: `Alert ${body.alertKey} cleared`
              });
            }
            return res.status(400).json({
              success: false,
              error: 'Alert key required'
            });
            
          case 'update_config':
            // Update alert configuration
            alertManager.updateConfiguration(body.configuration || {});
            
            return res.status(200).json({
              success: true,
              message: 'Alert configuration updated'
            });
            
          case 'maintenance':
            // Set maintenance window
            const maintenanceWindow = {
              start: body.start || new Date().toISOString(),
              end: body.end || new Date(Date.now() + 3600000).toISOString(),
              reason: body.reason || 'Scheduled maintenance'
            };
            
            alertManager.updateConfiguration({
              maintenanceWindows: [maintenanceWindow]
            });
            
            return res.status(200).json({
              success: true,
              maintenanceWindow,
              message: 'Maintenance window set'
            });
            
          default:
            return res.status(400).json({
              success: false,
              error: 'Invalid action',
              available_actions: ['test', 'trigger', 'create_rule', 'clear', 'update_config', 'maintenance']
            });
        }
      }
      
      case 'DELETE': {
        // Admin access required
        if (!validateAdminAccess(req)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { alertKey } = req.query;
        
        if (!alertKey) {
          return res.status(400).json({
            success: false,
            error: 'Alert key required'
          });
        }
        
        alertManager.clearAlert(alertKey);
        
        return res.status(200).json({
          success: true,
          message: `Alert ${alertKey} deleted`
        });
      }
      
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
  } catch (error) {
    console.error('Alert management error:', error);
    
    // Add error breadcrumb
    addBreadcrumb({
      category: 'monitoring',
      message: 'Alert management failed',
      level: 'error',
      data: {
        error: error.message
      }
    });
    
    res.status(500).json({
      success: false,
      error: 'Alert management failure',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Export utilities
 */
export {
  testAlertConfiguration,
  createAlertRule,
  validateAlertRule,
  getAlertTemplates
};