import fetch from 'node-fetch';
import { captureMessage } from './sentry-config.js';


/**
 * Alert severity levels
 */
export const AlertSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
};

/**
 * Alert categories
 */
export const AlertCategory = {
  PAYMENT: 'payment',
  DATABASE: 'database',
  EXTERNAL_SERVICE: 'external_service',
  PERFORMANCE: 'performance',
  SECURITY: 'security',
  CAPACITY: 'capacity',
  BUSINESS: 'business'
};

/**
 * Default alert thresholds
 */
const DEFAULT_THRESHOLDS = {
  payment_failure_rate: 0.01, // 1% failure rate
  database_response_time: 1000, // 1 second
  api_response_time: 2000, // 2 seconds
  memory_usage_percent: 80, // 80% memory usage
  error_rate: 0.05, // 5% error rate
  queue_depth: 1000, // 1000 pending items
  disk_usage_percent: 90 // 90% disk usage
};

/**
 * Alert aggregation window (milliseconds)
 */
const AGGREGATION_WINDOW = 5 * 60 * 1000; // 5 minutes
const ESCALATION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

/**
 * Alert state tracking
 */
class AlertState {
  constructor() {
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.suppressedAlerts = new Set();
    this.escalatedAlerts = new Set();
    this.lastAlertTime = new Map();
    this.alertCounts = new Map();
  }
  
  /**
   * Check if alert should be suppressed
   */
  shouldSuppress(alertKey, aggregationWindow = AGGREGATION_WINDOW) {
    const lastTime = this.lastAlertTime.get(alertKey);
    const now = Date.now();
    
    if (!lastTime) {
      return false;
    }
    
    // Suppress if within aggregation window
    return (now - lastTime) < aggregationWindow;
  }
  
  /**
   * Record alert
   */
  recordAlert(alertKey, alert) {
    const now = Date.now();
    
    // Update last alert time
    this.lastAlertTime.set(alertKey, now);
    
    // Update alert count
    const count = this.alertCounts.get(alertKey) || 0;
    this.alertCounts.set(alertKey, count + 1);
    
    // Add to active alerts
    this.activeAlerts.set(alertKey, {
      ...alert,
      firstOccurrence: this.activeAlerts.get(alertKey)?.firstOccurrence || now,
      lastOccurrence: now,
      count: count + 1
    });
    
    // Add to history
    this.alertHistory.push({
      ...alert,
      timestamp: now,
      key: alertKey
    });
    
    // Trim history to last 1000 alerts
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000);
    }
  }
  
  /**
   * Check if alert needs escalation
   */
  needsEscalation(alertKey) {
    const alert = this.activeAlerts.get(alertKey);
    
    if (!alert || this.escalatedAlerts.has(alertKey)) {
      return false;
    }
    
    // Escalate if critical and unacknowledged for escalation timeout
    if (alert.severity === AlertSeverity.CRITICAL) {
      const age = Date.now() - alert.firstOccurrence;
      return age > ESCALATION_TIMEOUT;
    }
    
    return false;
  }
  
  /**
   * Mark alert as escalated
   */
  markEscalated(alertKey) {
    this.escalatedAlerts.add(alertKey);
  }
  
  /**
   * Clear alert
   */
  clearAlert(alertKey) {
    this.activeAlerts.delete(alertKey);
    this.escalatedAlerts.delete(alertKey);
    this.alertCounts.delete(alertKey);
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }
}

/**
 * Alert manager class
 */
export class AlertManager {
  constructor(config = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.alertChannels = config.alertChannels || {};
    this.suppressionRules = config.suppressionRules || {};
    this.maintenanceWindows = config.maintenanceWindows || [];
    this.state = new AlertState();
    this.enabled = config.enabled !== false;
  }
  
  /**
   * Calculate alert severity based on impact
   */
  calculateSeverity(alertData) {
    const { category, metrics = {} } = alertData;
    
    // Payment failures are always critical
    if (category === AlertCategory.PAYMENT && metrics.failure_rate > this.thresholds.payment_failure_rate * 2) {
      return AlertSeverity.CRITICAL;
    }
    
    // Database unavailability is critical
    if (category === AlertCategory.DATABASE && metrics.available === false) {
      return AlertSeverity.CRITICAL;
    }
    
    // High error rates are high severity
    if (metrics.error_rate > this.thresholds.error_rate * 2) {
      return AlertSeverity.HIGH;
    }
    
    // Performance degradation is medium
    if (category === AlertCategory.PERFORMANCE) {
      if (metrics.response_time > this.thresholds.api_response_time * 2) {
        return AlertSeverity.HIGH;
      }
      return AlertSeverity.MEDIUM;
    }
    
    // Capacity warnings are medium
    if (category === AlertCategory.CAPACITY) {
      if (metrics.usage_percent > 95) {
        return AlertSeverity.HIGH;
      }
      return AlertSeverity.MEDIUM;
    }
    
    return AlertSeverity.LOW;
  }
  
  /**
   * Check if in maintenance window
   */
  isInMaintenanceWindow() {
    const now = new Date();
    
    return this.maintenanceWindows.some(window => {
      const start = new Date(window.start);
      const end = new Date(window.end);
      return now >= start && now <= end;
    });
  }
  
  /**
   * Generate alert key for deduplication
   */
  generateAlertKey(alertData) {
    const { category, service, type } = alertData;
    return `${category}:${service || 'system'}:${type || 'general'}`;
  }
  
  /**
   * Should send alert based on rules
   */
  shouldSendAlert(alertData, severity) {
    // Check if alerts are enabled
    if (!this.enabled) {
      return false;
    }
    
    // Check maintenance window
    if (this.isInMaintenanceWindow()) {
      return false;
    }
    
    // Check suppression rules
    const alertKey = this.generateAlertKey(alertData);
    
    // Check if alert is suppressed
    if (this.state.shouldSuppress(alertKey)) {
      return false;
    }
    
    // Check severity threshold
    const severityLevels = {
      [AlertSeverity.CRITICAL]: 5,
      [AlertSeverity.HIGH]: 4,
      [AlertSeverity.MEDIUM]: 3,
      [AlertSeverity.LOW]: 2,
      [AlertSeverity.INFO]: 1
    };
    
    const minSeverity = this.suppressionRules.minSeverity || AlertSeverity.LOW;
    if (severityLevels[severity] < severityLevels[minSeverity]) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Send alert to webhook
   */
  async sendWebhookAlert(alert, webhookUrl) {
    try {
      const payload = {
        text: alert.title,
        username: 'A Lo Cubano Alert System',
        icon_emoji: this.getAlertEmoji(alert.severity),
        attachments: [{
          color: this.getAlertColor(alert.severity),
          title: alert.title,
          text: alert.description,
          fields: Object.entries(alert.details || {}).map(([key, value]) => ({
            title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            value: String(value),
            short: true
          })),
          footer: 'A Lo Cubano Boulder Fest',
          ts: Math.floor(Date.now() / 1000)
        }]
      };
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
      return false;
    }
  }
  
  /**
   * Get alert emoji based on severity
   */
  getAlertEmoji(severity) {
    const emojis = {
      [AlertSeverity.CRITICAL]: ':rotating_light:',
      [AlertSeverity.HIGH]: ':warning:',
      [AlertSeverity.MEDIUM]: ':exclamation:',
      [AlertSeverity.LOW]: ':information_source:',
      [AlertSeverity.INFO]: ':speech_balloon:'
    };
    return emojis[severity] || ':bell:';
  }
  
  /**
   * Get alert color based on severity
   */
  getAlertColor(severity) {
    const colors = {
      [AlertSeverity.CRITICAL]: '#FF0000',
      [AlertSeverity.HIGH]: '#FF8C00',
      [AlertSeverity.MEDIUM]: '#FFD700',
      [AlertSeverity.LOW]: '#00CED1',
      [AlertSeverity.INFO]: '#808080'
    };
    return colors[severity] || '#000000';
  }
  
  /**
   * Format alert message
   */
  formatAlertMessage(alertData, severity) {
    const { category, service, type, metrics, description } = alertData;
    
    const title = `[${severity.toUpperCase()}] ${category}: ${service || 'System'} ${type || 'Alert'}`;
    
    const details = {
      Category: category,
      Service: service || 'System',
      Severity: severity,
      ...metrics
    };
    
    return {
      title,
      description: description || `Alert triggered for ${service || 'system'}`,
      details,
      severity,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Process and send alert
   */
  async processAlert(alertData) {
    try {
      // Calculate severity
      const severity = alertData.severity || this.calculateSeverity(alertData);
      
      // Check if should send
      if (!this.shouldSendAlert(alertData, severity)) {
        return { sent: false, reason: 'suppressed' };
      }
      
      // Generate alert key
      const alertKey = this.generateAlertKey(alertData);
      
      // Format alert message
      const alert = this.formatAlertMessage(alertData, severity);
      
      // Record alert
      this.state.recordAlert(alertKey, alert);
      
      // Send to appropriate channels
      const results = [];
      
      // Send to Sentry
      captureMessage(alert.title, severity, alert.details);
      results.push({ channel: 'sentry', success: true });
      
      // Send to webhook if configured
      if (this.alertChannels.webhookUrl) {
        const webhookResult = await this.sendWebhookAlert(alert, this.alertChannels.webhookUrl);
        results.push({ channel: 'webhook', success: webhookResult });
      }
      
      // Check for escalation
      if (this.state.needsEscalation(alertKey)) {
        await this.escalateAlert(alertKey, alert);
      }
      
      return {
        sent: true,
        alert,
        channels: results,
        key: alertKey
      };
    } catch (error) {
      console.error('Failed to process alert:', error);
      return {
        sent: false,
        error: error.message
      };
    }
  }
  
  /**
   * Escalate alert
   */
  async escalateAlert(alertKey, alert) {
    try {
      // Mark as escalated
      this.state.markEscalated(alertKey);
      
      // Send escalation notification
      const escalationAlert = {
        ...alert,
        title: `[ESCALATED] ${alert.title}`,
        description: `This alert has been unacknowledged for ${ESCALATION_TIMEOUT / 60000} minutes and requires immediate attention.`
      };
      
      // Send to escalation webhook if configured
      if (this.alertChannels.escalationWebhookUrl) {
        await this.sendWebhookAlert(escalationAlert, this.alertChannels.escalationWebhookUrl);
      }
      
      // Log escalation
      console.error('Alert escalated:', escalationAlert);
      
      return true;
    } catch (error) {
      console.error('Failed to escalate alert:', error);
      return false;
    }
  }
  
  /**
   * Clear alert
   */
  clearAlert(alertKey) {
    this.state.clearAlert(alertKey);
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return this.state.getActiveAlerts();
  }
  
  /**
   * Get alert statistics
   */
  getStatistics() {
    const activeAlerts = this.state.getActiveAlerts();
    const severityCounts = {};
    const categoryCounts = {};
    
    activeAlerts.forEach(alert => {
      severityCounts[alert.severity] = (severityCounts[alert.severity] || 0) + 1;
      
      const category = alert.details?.Category || 'unknown';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    return {
      total_active: activeAlerts.length,
      total_escalated: this.state.escalatedAlerts.size,
      severity_breakdown: severityCounts,
      category_breakdown: categoryCounts,
      recent_alerts: this.state.alertHistory.slice(-10)
    };
  }
  
  /**
   * Update configuration
   */
  updateConfiguration(config) {
    if (config.thresholds) {
      this.thresholds = { ...this.thresholds, ...config.thresholds };
    }
    
    if (config.alertChannels) {
      this.alertChannels = { ...this.alertChannels, ...config.alertChannels };
    }
    
    if (config.suppressionRules) {
      this.suppressionRules = { ...this.suppressionRules, ...config.suppressionRules };
    }
    
    if (config.maintenanceWindows) {
      this.maintenanceWindows = config.maintenanceWindows;
    }
    
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
  }
}

// Singleton instance
let alertManager = null;

/**
 * Get or create alert manager instance
 */
export function getAlertManager() {
  if (!alertManager) {
    alertManager = new AlertManager({
      alertChannels: {
        webhookUrl: process.env.ALERT_WEBHOOK_URL,
        escalationWebhookUrl: process.env.ESCALATION_WEBHOOK_URL
      },
      thresholds: {
        payment_failure_rate: Number.isFinite(parseFloat(process.env.PAYMENT_FAILURE_THRESHOLD)) ? parseFloat(process.env.PAYMENT_FAILURE_THRESHOLD) : 0.01,
        database_response_time: Number.isFinite(parseInt(process.env.DB_RESPONSE_THRESHOLD)) ? parseInt(process.env.DB_RESPONSE_THRESHOLD) : 1000,
        api_response_time: Number.isFinite(parseInt(process.env.API_RESPONSE_THRESHOLD)) ? parseInt(process.env.API_RESPONSE_THRESHOLD) : 2000,
        memory_usage_percent: Number.isFinite(parseInt(process.env.MEMORY_USAGE_THRESHOLD)) ? parseInt(process.env.MEMORY_USAGE_THRESHOLD) : 80,
        error_rate: Number.isFinite(parseFloat(process.env.ERROR_RATE_THRESHOLD)) ? parseFloat(process.env.ERROR_RATE_THRESHOLD) : 0.05
      }
    });
  }
  return alertManager;
}

export default {
  AlertManager,
  AlertSeverity,
  AlertCategory,
  getAlertManager
};