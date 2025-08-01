/**
 * Comprehensive Alerting System
 * Multi-channel notifications for payment failures, performance issues, and security incidents
 */

import EventEmitter from 'events';

/**
 * Alert severity levels
 */
export const ALERT_SEVERITY = {
  CRITICAL: 'critical',    // System down, immediate action required
  HIGH: 'high',           // Major functionality impacted
  MEDIUM: 'medium',       // Performance degradation
  LOW: 'low',            // Informational
  INFO: 'info'           // Status updates
};

/**
 * Alert categories
 */
export const ALERT_CATEGORIES = {
  PAYMENT: 'payment',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  INVENTORY: 'inventory',
  SYSTEM: 'system',
  BUSINESS: 'business'
};

/**
 * Notification channels
 */
export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SLACK: 'slack',
  SMS: 'sms',
  WEBHOOK: 'webhook',
  PAGERDUTY: 'pagerduty',
  DISCORD: 'discord'
};

/**
 * Main Alerting System
 */
export class AlertingSystem extends EventEmitter {
  constructor() {
    super();
    this.alerts = new Map();
    this.alertRules = new Map();
    this.channels = new Map();
    this.cooldowns = new Map();
    this.escalationPolicies = new Map();
    
    this.setupDefaultAlertRules();
  }

  /**
   * Register notification channel
   */
  registerChannel(channelId, channelConfig) {
    this.channels.set(channelId, {
      ...channelConfig,
      enabled: true,
      lastUsed: null,
      successCount: 0,
      errorCount: 0
    });
  }

  /**
   * Add alert rule
   */
  addAlertRule(ruleId, rule) {
    this.alertRules.set(ruleId, {
      id: ruleId,
      ...rule,
      enabled: true,
      triggerCount: 0,
      lastTriggered: null
    });
  }

  /**
   * Process and route alert
   */
  async processAlert(alert) {
    const alertId = this.generateAlertId(alert);
    const timestamp = Date.now();

    // Check if alert is in cooldown
    if (this.isInCooldown(alertId, alert.severity)) {
      console.log(`Alert ${alertId} is in cooldown, skipping`);
      return;
    }

    // Enrich alert with metadata
    const enrichedAlert = {
      ...alert,
      id: alertId,
      timestamp,
      status: 'active',
      acknowledgments: [],
      escalationLevel: 0
    };

    // Store alert
    this.alerts.set(alertId, enrichedAlert);

    // Apply alert rules
    const matchingRules = this.findMatchingRules(enrichedAlert);
    
    for (const rule of matchingRules) {
      await this.executeAlertRule(enrichedAlert, rule);
    }

    // Set cooldown
    this.setCooldown(alertId, alert.severity);

    // Emit alert event
    this.emit('alert', enrichedAlert);

    return enrichedAlert;
  }

  /**
   * Send notification through specified channels
   */
  async sendNotification(alert, channels) {
    const results = [];

    for (const channelId of channels) {
      try {
        const result = await this.sendToChannel(alert, channelId);
        results.push({ channelId, success: true, result });
      } catch (error) {
        console.error(`Failed to send alert to ${channelId}:`, error);
        results.push({ channelId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Send alert to specific channel
   */
  async sendToChannel(alert, channelId) {
    const channel = this.channels.get(channelId);
    if (!channel || !channel.enabled) {
      throw new Error(`Channel ${channelId} not found or disabled`);
    }

    switch (channel.type) {
      case NOTIFICATION_CHANNELS.EMAIL:
        return await this.sendEmailAlert(alert, channel);
      
      case NOTIFICATION_CHANNELS.SLACK:
        return await this.sendSlackAlert(alert, channel);
      
      case NOTIFICATION_CHANNELS.SMS:
        return await this.sendSMSAlert(alert, channel);
      
      case NOTIFICATION_CHANNELS.WEBHOOK:
        return await this.sendWebhookAlert(alert, channel);
      
      case NOTIFICATION_CHANNELS.PAGERDUTY:
        return await this.sendPagerDutyAlert(alert, channel);
      
      case NOTIFICATION_CHANNELS.DISCORD:
        return await this.sendDiscordAlert(alert, channel);
      
      default:
        throw new Error(`Unknown channel type: ${channel.type}`);
    }
  }

  /**
   * Email notification implementation
   */
  async sendEmailAlert(alert, channel) {
    const subject = this.generateEmailSubject(alert);
    const body = this.generateEmailBody(alert);

    // Integration with your email service
    const emailPayload = {
      to: channel.recipients,
      subject,
      html: body,
      priority: alert.severity === ALERT_SEVERITY.CRITICAL ? 'high' : 'normal'
    };

    // This would integrate with your actual email service
    console.log('Sending email alert:', emailPayload);
    
    return { messageId: `email_${Date.now()}`, recipients: channel.recipients };
  }

  /**
   * Slack notification implementation
   */
  async sendSlackAlert(alert, channel) {
    const slackMessage = this.generateSlackMessage(alert);

    const payload = {
      channel: channel.channel,
      ...slackMessage
    };

    // Integration with Slack API
    if (channel.webhookUrl) {
      const response = await fetch(channel.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }

      return { platform: 'slack', channel: channel.channel };
    }

    throw new Error('Slack webhook URL not configured');
  }

  /**
   * SMS notification implementation
   */
  async sendSMSAlert(alert, channel) {
    const message = this.generateSMSMessage(alert);

    // Integration with SMS service (Twilio, AWS SNS, etc.)
    console.log('Sending SMS alert:', {
      to: channel.phoneNumbers,
      message
    });

    return { platform: 'sms', recipients: channel.phoneNumbers };
  }

  /**
   * Webhook notification implementation
   */
  async sendWebhookAlert(alert, channel) {
    const payload = {
      alert,
      timestamp: Date.now(),
      source: 'alocubano-payment-system'
    };

    const response = await fetch(channel.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ALC-AlertingSystem/1.0',
        ...(channel.headers || {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.status}`);
    }

    return { platform: 'webhook', url: channel.url };
  }

  /**
   * PagerDuty notification implementation
   */
  async sendPagerDutyAlert(alert, channel) {
    const payload = {
      routing_key: channel.integrationKey,
      event_action: 'trigger',
      payload: {
        summary: `${alert.title} - ${alert.category}`,
        source: 'alocubano-payment-system',
        severity: this.mapToPagerDutySeverity(alert.severity),
        component: alert.component || 'payment-system',
        group: alert.category,
        class: alert.type,
        custom_details: {
          description: alert.description,
          metadata: alert.metadata,
          timestamp: alert.timestamp
        }
      }
    };

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status}`);
    }

    const result = await response.json();
    return { platform: 'pagerduty', dedup_key: result.dedup_key };
  }

  /**
   * Discord notification implementation
   */
  async sendDiscordAlert(alert, channel) {
    const embed = this.generateDiscordEmbed(alert);

    const payload = {
      embeds: [embed]
    };

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    return { platform: 'discord', channel: channel.channelName };
  }

  /**
   * Setup default alert rules
   */
  setupDefaultAlertRules() {
    // Critical payment failures
    this.addAlertRule('critical_payment_failure', {
      condition: (alert) => 
        alert.category === ALERT_CATEGORIES.PAYMENT && 
        alert.severity === ALERT_SEVERITY.CRITICAL,
      channels: ['email_ops', 'slack_alerts', 'pagerduty'],
      escalation: {
        enabled: true,
        timeoutMinutes: 15,
        levels: [
          { channels: ['email_ops', 'slack_alerts'] },
          { channels: ['sms_oncall', 'pagerduty'] },
          { channels: ['email_executives'] }
        ]
      }
    });

    // High payment error rate
    this.addAlertRule('high_payment_error_rate', {
      condition: (alert) => 
        alert.category === ALERT_CATEGORIES.PAYMENT && 
        alert.type === 'high_error_rate',
      channels: ['slack_alerts', 'email_dev'],
      threshold: {
        count: 5,
        windowMinutes: 10
      }
    });

    // Performance degradation
    this.addAlertRule('performance_degradation', {
      condition: (alert) => 
        alert.category === ALERT_CATEGORIES.PERFORMANCE && 
        alert.severity === ALERT_SEVERITY.MEDIUM,
      channels: ['slack_alerts'],
      cooldownMinutes: 30
    });

    // Security incidents
    this.addAlertRule('security_incident', {
      condition: (alert) => alert.category === ALERT_CATEGORIES.SECURITY,
      channels: ['email_security', 'slack_security', 'pagerduty'],
      escalation: {
        enabled: true,
        timeoutMinutes: 5,
        levels: [
          { channels: ['email_security', 'slack_security'] },
          { channels: ['sms_security', 'pagerduty'] }
        ]
      }
    });

    // Low inventory warnings
    this.addAlertRule('low_inventory', {
      condition: (alert) => 
        alert.category === ALERT_CATEGORIES.INVENTORY && 
        alert.type === 'low_stock',
      channels: ['email_business', 'slack_business'],
      cooldownMinutes: 240 // 4 hours
    });

    // Business metrics alerts
    this.addAlertRule('revenue_anomaly', {
      condition: (alert) => 
        alert.category === ALERT_CATEGORIES.BUSINESS && 
        alert.type === 'revenue_anomaly',
      channels: ['email_business', 'slack_business']
    });
  }

  // Helper methods
  generateAlertId(alert) {
    const hash = Buffer.from(
      `${alert.category}_${alert.type}_${alert.component || 'unknown'}_${alert.title}`
    ).toString('base64').substring(0, 8);
    
    return `alert_${hash}_${Date.now()}`;
  }

  isInCooldown(alertId, severity) {
    const cooldownKey = this.getCooldownKey(alertId, severity);
    const cooldownUntil = this.cooldowns.get(cooldownKey);
    
    return cooldownUntil && Date.now() < cooldownUntil;
  }

  setCooldown(alertId, severity) {
    const cooldownKey = this.getCooldownKey(alertId, severity);
    const cooldownDuration = this.getCooldownDuration(severity);
    
    this.cooldowns.set(cooldownKey, Date.now() + cooldownDuration);
  }

  getCooldownKey(alertId, severity) {
    return `${alertId}_${severity}`;
  }

  getCooldownDuration(severity) {
    const durations = {
      [ALERT_SEVERITY.CRITICAL]: 300000,   // 5 minutes
      [ALERT_SEVERITY.HIGH]: 600000,       // 10 minutes
      [ALERT_SEVERITY.MEDIUM]: 1800000,    // 30 minutes
      [ALERT_SEVERITY.LOW]: 3600000,       // 1 hour
      [ALERT_SEVERITY.INFO]: 7200000       // 2 hours
    };
    
    return durations[severity] || 600000;
  }

  findMatchingRules(alert) {
    const matchingRules = [];
    
    for (const rule of this.alertRules.values()) {
      if (rule.enabled && rule.condition(alert)) {
        matchingRules.push(rule);
      }
    }
    
    return matchingRules;
  }

  async executeAlertRule(alert, rule) {
    try {
      await this.sendNotification(alert, rule.channels);
      
      rule.triggerCount++;
      rule.lastTriggered = Date.now();
      
      // Handle escalation if configured
      if (rule.escalation?.enabled) {
        this.scheduleEscalation(alert, rule);
      }
      
    } catch (error) {
      console.error(`Failed to execute alert rule ${rule.id}:`, error);
    }
  }

  scheduleEscalation(alert, rule) {
    const escalationTimeout = rule.escalation.timeoutMinutes * 60000;
    
    setTimeout(() => {
      this.checkEscalation(alert, rule);
    }, escalationTimeout);
  }

  checkEscalation(alert, rule) {
    const currentAlert = this.alerts.get(alert.id);
    
    // If alert is still active and not acknowledged
    if (currentAlert?.status === 'active' && currentAlert.acknowledgments.length === 0) {
      const nextLevel = currentAlert.escalationLevel + 1;
      const escalationLevels = rule.escalation.levels;
      
      if (nextLevel < escalationLevels.length) {
        currentAlert.escalationLevel = nextLevel;
        const levelConfig = escalationLevels[nextLevel];
        
        this.sendNotification(currentAlert, levelConfig.channels);
        
        // Schedule next escalation if available
        if (nextLevel + 1 < escalationLevels.length) {
          this.scheduleEscalation(currentAlert, rule);
        }
      }
    }
  }

  // Message generation methods
  generateEmailSubject(alert) {
    const severityEmoji = {
      [ALERT_SEVERITY.CRITICAL]: '🚨🚨',
      [ALERT_SEVERITY.HIGH]: '🚨',
      [ALERT_SEVERITY.MEDIUM]: '⚠️',
      [ALERT_SEVERITY.LOW]: 'ℹ️',
      [ALERT_SEVERITY.INFO]: '📊'
    };

    return `${severityEmoji[alert.severity]} [${alert.severity.toUpperCase()}] ${alert.title} - A Lo Cubano Payment System`;
  }

  generateEmailBody(alert) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: ${this.getSeverityColor(alert.severity)}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">${alert.title}</h2>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${alert.category.toUpperCase()} - ${alert.severity.toUpperCase()}</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
          <h3>Description</h3>
          <p>${alert.description}</p>
          
          ${alert.metadata ? `
            <h3>Details</h3>
            <pre style="background: white; padding: 15px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(alert.metadata, null, 2)}</pre>
          ` : ''}
          
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p><strong>Alert ID:</strong> ${alert.id}</p>
            <p><strong>Timestamp:</strong> ${new Date(alert.timestamp).toISOString()}</p>
            <p><strong>Component:</strong> ${alert.component || 'Unknown'}</p>
          </div>
        </div>
      </div>
    `;
  }

  generateSlackMessage(alert) {
    return {
      text: `${alert.title}`,
      attachments: [{
        color: this.getSeverityColor(alert.severity),
        fields: [
          { title: 'Category', value: alert.category, short: true },
          { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
          { title: 'Component', value: alert.component || 'Unknown', short: true },
          { title: 'Timestamp', value: new Date(alert.timestamp).toISOString(), short: true }
        ],
        text: alert.description,
        footer: `Alert ID: ${alert.id}`
      }]
    };
  }

  generateSMSMessage(alert) {
    return `🚨 ${alert.severity.toUpperCase()}: ${alert.title}\n${alert.description}\nAlert ID: ${alert.id}`;
  }

  generateDiscordEmbed(alert) {
    return {
      title: alert.title,
      description: alert.description,
      color: parseInt(this.getSeverityColor(alert.severity).substring(1), 16),
      fields: [
        { name: 'Category', value: alert.category, inline: true },
        { name: 'Severity', value: alert.severity.toUpperCase(), inline: true },
        { name: 'Component', value: alert.component || 'Unknown', inline: true }
      ],
      footer: { text: `Alert ID: ${alert.id}` },
      timestamp: new Date(alert.timestamp).toISOString()
    };
  }

  getSeverityColor(severity) {
    const colors = {
      [ALERT_SEVERITY.CRITICAL]: '#dc3545',
      [ALERT_SEVERITY.HIGH]: '#fd7e14',
      [ALERT_SEVERITY.MEDIUM]: '#ffc107',
      [ALERT_SEVERITY.LOW]: '#17a2b8',
      [ALERT_SEVERITY.INFO]: '#6c757d'
    };
    
    return colors[severity] || '#6c757d';
  }

  mapToPagerDutySeverity(severity) {
    const mapping = {
      [ALERT_SEVERITY.CRITICAL]: 'critical',
      [ALERT_SEVERITY.HIGH]: 'error',
      [ALERT_SEVERITY.MEDIUM]: 'warning',
      [ALERT_SEVERITY.LOW]: 'info',
      [ALERT_SEVERITY.INFO]: 'info'
    };
    
    return mapping[severity] || 'info';
  }
}

// Global alerting system instance
export const alertingSystem = new AlertingSystem();

/**
 * Quick alert functions for common scenarios
 */
export const alerts = {
  /**
   * Payment failure alert
   */
  paymentFailed(error, context = {}) {
    return alertingSystem.processAlert({
      category: ALERT_CATEGORIES.PAYMENT,
      severity: ALERT_SEVERITY.HIGH,
      type: 'payment_failed',
      title: 'Payment Processing Failed',
      description: `Payment failed: ${error.message}`,
      component: 'payment-processor',
      metadata: {
        error: error.message,
        errorCode: error.code,
        orderId: context.orderId,
        amount: context.amount,
        paymentMethod: context.paymentMethod
      }
    });
  },

  /**
   * High error rate alert
   */
  highErrorRate(errorRate, threshold, timeWindow) {
    return alertingSystem.processAlert({
      category: ALERT_CATEGORIES.PAYMENT,
      severity: ALERT_SEVERITY.HIGH,
      type: 'high_error_rate',
      title: 'High Payment Error Rate Detected',
      description: `Payment error rate (${errorRate}%) exceeds threshold (${threshold}%) over ${timeWindow} minutes`,
      component: 'payment-processor',
      metadata: { errorRate, threshold, timeWindow }
    });
  },

  /**
   * Performance degradation alert
   */
  performanceDegradation(metric, value, threshold) {
    return alertingSystem.processAlert({
      category: ALERT_CATEGORIES.PERFORMANCE,
      severity: ALERT_SEVERITY.MEDIUM,
      type: 'performance_degradation',
      title: 'Performance Degradation Detected',
      description: `${metric} (${value}ms) exceeds threshold (${threshold}ms)`,
      component: 'payment-api',
      metadata: { metric, value, threshold }
    });
  },

  /**
   * Security incident alert
   */
  securityIncident(incidentType, description, context = {}) {
    return alertingSystem.processAlert({
      category: ALERT_CATEGORIES.SECURITY,
      severity: ALERT_SEVERITY.CRITICAL,
      type: incidentType,
      title: 'Security Incident Detected',
      description,
      component: 'security-monitor',
      metadata: context
    });
  },

  /**
   * Low inventory alert
   */
  lowInventory(itemId, currentLevel, threshold) {
    return alertingSystem.processAlert({
      category: ALERT_CATEGORIES.INVENTORY,
      severity: ALERT_SEVERITY.MEDIUM,
      type: 'low_stock',
      title: 'Low Inventory Warning',
      description: `${itemId} inventory (${currentLevel}) below threshold (${threshold})`,
      component: 'inventory-manager',
      metadata: { itemId, currentLevel, threshold }
    });
  },

  /**
   * Revenue anomaly alert
   */
  revenueAnomaly(anomalyType, details) {
    return alertingSystem.processAlert({
      category: ALERT_CATEGORIES.BUSINESS,
      severity: ALERT_SEVERITY.MEDIUM,
      type: 'revenue_anomaly',
      title: 'Revenue Anomaly Detected',
      description: `${anomalyType} detected in revenue patterns`,
      component: 'business-intelligence',
      metadata: details
    });
  }
};

export default {
  AlertingSystem,
  alertingSystem,
  alerts,
  ALERT_SEVERITY,
  ALERT_CATEGORIES,
  NOTIFICATION_CHANNELS
};