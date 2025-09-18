/**
 * Security Alert Service
 * Provides automated security alerting and incident response framework
 * Implements security event severity levels and automated response actions
 */

import { getDatabaseClient } from './database.js';
import { auditService } from './audit-service.js';
import { logger } from './logger.js';
import crypto from 'crypto';

export class SecurityAlertService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;

    // Alert thresholds and configurations
    this.alertThresholds = {
      // Failed login attempts
      failedLogins: {
        perMinute: 10,
        perHour: 50,
        perDay: 200
      },

      // Concurrent sessions
      concurrentSessions: {
        warning: 3,
        critical: 5
      },

      // Security score thresholds
      securityScore: {
        low: 30,
        critical: 15
      },

      // MFA failures
      mfaFailures: {
        perHour: 10,
        perDay: 50
      },

      // IP reputation
      suspiciousIPs: {
        failedAttemptsThreshold: 20,
        timeWindowHours: 24
      }
    };

    // Alert escalation rules
    this.escalationRules = {
      critical: {
        immediate: true,
        requiresResponse: true,
        autoBlock: false // Never auto-block for business continuity
      },
      high: {
        immediate: false,
        requiresResponse: true,
        autoBlock: false
      },
      medium: {
        immediate: false,
        requiresResponse: false,
        autoBlock: false
      },
      low: {
        immediate: false,
        requiresResponse: false,
        autoBlock: false
      }
    };

    // In-memory alert cache for rate limiting
    this.alertCache = new Map();
    this.alertCooldowns = new Map();
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    if (this.initialized && this.db) {
      return this;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      logger.debug('[SecurityAlert] Initializing security alert service...');
      this.db = await getDatabaseClient();

      // Ensure alert tables exist
      await this._ensureAlertTables();

      this.initialized = true;
      logger.debug('[SecurityAlert] Security alert service initialized successfully');
      return this;
    } catch (error) {
      logger.error('[SecurityAlert] Initialization failed:', error.message);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Ensure alert tables exist
   */
  async _ensureAlertTables() {
    try {
      // Security alerts table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS security_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id TEXT NOT NULL UNIQUE,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

          -- Associated entities
          admin_id TEXT,
          session_token TEXT,
          ip_address TEXT,

          -- Alert details
          title TEXT NOT NULL,
          description TEXT,
          evidence TEXT, -- JSON object
          indicators TEXT, -- JSON array

          -- Context
          trigger_conditions TEXT, -- JSON object
          affected_resources TEXT, -- JSON array

          -- Response tracking
          status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'suppressed')),
          response_actions TEXT, -- JSON array of actions taken
          escalated BOOLEAN DEFAULT FALSE,
          auto_resolved BOOLEAN DEFAULT FALSE,

          -- Timing
          triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          acknowledged_at DATETIME,
          resolved_at DATETIME,

          -- Metadata
          source_service TEXT DEFAULT 'admin-security',
          correlation_id TEXT,
          parent_alert_id TEXT,

          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Alert metrics and analytics
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS security_alert_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          metric_type TEXT NOT NULL,
          metric_value INTEGER NOT NULL,
          timeframe TEXT NOT NULL,

          -- Context
          entity_type TEXT,
          entity_id TEXT,
          ip_address TEXT,

          -- Timing
          measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          window_start DATETIME,
          window_end DATETIME,

          -- Metadata
          metadata TEXT -- JSON object
        )
      `);

      // Create performance indexes for alerts
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_alerts_type_severity ON security_alerts(alert_type, severity, triggered_at)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status, triggered_at)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_alerts_admin ON security_alerts(admin_id, triggered_at)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_alerts_ip ON security_alerts(ip_address, triggered_at)');

      // Create performance indexes for metrics
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_metrics_type_entity ON security_alert_metrics(metric_type, entity_id, measured_at)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_metrics_entity ON security_alert_metrics(entity_type, entity_id)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_metrics_time ON security_alert_metrics(measured_at)');

      logger.debug('[SecurityAlert] Alert tables verified/created');
    } catch (error) {
      logger.error('[SecurityAlert] Failed to ensure alert tables:', error.message);
      throw error;
    }
  }

  /**
   * Trigger a security alert with automated response
   */
  async triggerAlert(params) {
    await this.ensureInitialized();

    const {
      alertType,
      severity,
      title,
      description,
      evidence = {},
      indicators = [],
      adminId = null,
      sessionToken = null,
      ipAddress = null,
      correlationId = null,
      triggerConditions = {},
      affectedResources = []
    } = params;

    try {
      // Check for alert cooldown to prevent spam
      const cooldownKey = `${alertType}:${ipAddress || adminId || 'global'}`;
      if (this._isInCooldown(cooldownKey, severity)) {
        logger.debug(`[SecurityAlert] Alert ${alertType} in cooldown for ${cooldownKey}`);
        return { success: false, reason: 'cooldown_active' };
      }

      const alertId = `alert_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // Store alert in database
      await this.db.execute({
        sql: `INSERT INTO security_alerts (
          alert_id, alert_type, severity, title, description,
          evidence, indicators, admin_id, session_token, ip_address,
          trigger_conditions, affected_resources, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          alertId,
          alertType,
          severity,
          title,
          description,
          JSON.stringify(evidence),
          JSON.stringify(indicators),
          adminId,
          sessionToken ? sessionToken.substring(0, 16) + '...' : null,
          ipAddress,
          JSON.stringify(triggerConditions),
          JSON.stringify(affectedResources),
          correlationId
        ]
      });

      // Set cooldown for this alert type
      this._setCooldown(cooldownKey, severity);

      // Execute automated response actions
      const responseActions = await this._executeResponseActions({
        alertId,
        alertType,
        severity,
        adminId,
        sessionToken,
        ipAddress,
        evidence
      });

      // Log to audit service
      await auditService.logDataChange({
        action: 'SECURITY_ALERT_TRIGGERED',
        targetType: 'security_alert',
        targetId: alertId,
        adminUser: adminId,
        sessionId: sessionToken ? sessionToken.substring(0, 16) + '...' : null,
        ipAddress,
        metadata: {
          securityAlert: {
            alertType,
            severity,
            title,
            evidence,
            indicators,
            responseActions
          }
        },
        severity: this._mapSeverityToAuditLevel(severity)
      });

      // Log based on severity
      const logMethod = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';
      logger[logMethod](`[SecurityAlert] ${severity.toUpperCase()} ALERT: ${title}`, {
        alertId,
        alertType,
        adminId,
        ipAddress: ipAddress?.substring(0, 15) + '...',
        indicators: indicators.slice(0, 3), // Limit for logging
        responseActions: responseActions.map(a => a.action)
      });

      return {
        success: true,
        alertId,
        responseActions,
        severity
      };

    } catch (error) {
      logger.error('[SecurityAlert] Failed to trigger alert:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute automated response actions based on alert severity and type
   */
  async _executeResponseActions(params) {
    const { alertId, alertType, severity, adminId, sessionToken, ipAddress, evidence } = params;
    const actions = [];

    try {
      const escalationRule = this.escalationRules[severity] || this.escalationRules.low;

      // Record metric for analytics
      await this.recordMetric({
        metricType: 'security_alert_triggered',
        metricValue: 1,
        timeframe: '1h',
        entityType: 'alert_type',
        entityId: alertType,
        ipAddress,
        metadata: { severity, alertId }
      });

      // High/Critical severity actions
      if (severity === 'critical' || severity === 'high') {
        // Enhanced monitoring for the session/IP
        if (sessionToken || ipAddress) {
          await this._enableEnhancedMonitoring(sessionToken, ipAddress);
          actions.push({
            action: 'enhanced_monitoring_enabled',
            target: sessionToken || ipAddress,
            timestamp: new Date().toISOString()
          });
        }

        // Notify security team (in production, this would send actual alerts)
        await this._notifySecurityTeam({
          alertId,
          severity,
          alertType,
          title: `${severity.toUpperCase()}: ${alertType}`,
          adminId,
          ipAddress
        });
        actions.push({
          action: 'security_team_notified',
          timestamp: new Date().toISOString()
        });
      }

      // Critical severity actions
      if (severity === 'critical') {
        // Force session re-authentication (without blocking)
        if (sessionToken) {
          await this._requestSessionReauth(sessionToken);
          actions.push({
            action: 'session_reauth_requested',
            target: sessionToken,
            timestamp: new Date().toISOString()
          });
        }

        // Create incident ticket (simulated)
        const incidentId = await this._createIncidentTicket({
          alertId,
          alertType,
          severity,
          adminId,
          ipAddress,
          evidence
        });
        actions.push({
          action: 'incident_ticket_created',
          incidentId,
          timestamp: new Date().toISOString()
        });
      }

      // Update alert with response actions
      await this.db.execute({
        sql: 'UPDATE security_alerts SET response_actions = ?, updated_at = CURRENT_TIMESTAMP WHERE alert_id = ?',
        args: [JSON.stringify(actions), alertId]
      });

      return actions;

    } catch (error) {
      logger.error('[SecurityAlert] Failed to execute response actions:', error.message);
      return actions; // Return what we have so far
    }
  }

  /**
   * Check for common security patterns and trigger alerts
   */
  async checkSecurityPatterns(params) {
    await this.ensureInitialized();

    const {
      adminId,
      sessionToken,
      ipAddress,
      userAgent,
      eventType,
      success,
      metadata = {}
    } = params;

    try {
      const checks = [];

      // Failed login pattern detection
      if (eventType === 'login_attempt' && !success) {
        checks.push(this._checkFailedLoginPattern(ipAddress, adminId));
      }

      // Suspicious user agent detection
      if (userAgent) {
        checks.push(this._checkSuspiciousUserAgent(userAgent, ipAddress, adminId));
      }

      // Concurrent session detection
      if (eventType === 'session_start' && sessionToken) {
        checks.push(this._checkConcurrentSessions(adminId, sessionToken));
      }

      // IP reputation check
      if (ipAddress) {
        checks.push(this._checkIPReputation(ipAddress, adminId));
      }

      // Geographic anomaly detection
      if (ipAddress && adminId) {
        checks.push(this._checkGeographicAnomaly(ipAddress, adminId));
      }

      // Execute all checks in parallel
      const results = await Promise.allSettled(checks);
      const alerts = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);

      return {
        success: true,
        alertsTriggered: alerts.length,
        alerts
      };

    } catch (error) {
      logger.error('[SecurityAlert] Pattern check failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Security pattern check methods
   */
  async _checkFailedLoginPattern(ipAddress, adminId) {
    const recentFailures = await this._getMetricCount({
      metricType: 'failed_login_attempt',
      entityType: 'ip_address',
      entityId: ipAddress,
      timeframeMinutes: 60
    });

    if (recentFailures >= this.alertThresholds.failedLogins.perHour) {
      return await this.triggerAlert({
        alertType: 'excessive_failed_logins',
        severity: recentFailures >= this.alertThresholds.failedLogins.perHour * 2 ? 'critical' : 'high',
        title: 'Excessive Failed Login Attempts',
        description: `${recentFailures} failed login attempts from IP ${ipAddress} in the last hour`,
        evidence: { failedAttempts: recentFailures, timeframe: '1h' },
        indicators: ['brute_force', 'credential_stuffing'],
        ipAddress,
        adminId,
        triggerConditions: { threshold: this.alertThresholds.failedLogins.perHour, actual: recentFailures }
      });
    }

    return null;
  }

  async _checkSuspiciousUserAgent(userAgent, ipAddress, adminId) {
    const suspiciousPatterns = [
      /bot/i, /crawler/i, /spider/i, /curl/i, /wget/i, /python/i, /perl/i, /php/i,
      /scanner/i, /test/i, /exploit/i, /hack/i, /penetration/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));

    if (isSuspicious) {
      return await this.triggerAlert({
        alertType: 'suspicious_user_agent',
        severity: 'medium',
        title: 'Suspicious User Agent Detected',
        description: `Potentially malicious user agent: ${userAgent.substring(0, 100)}`,
        evidence: { userAgent },
        indicators: ['automated_tool', 'suspicious_client'],
        ipAddress,
        adminId
      });
    }

    return null;
  }

  async _checkConcurrentSessions(adminId, sessionToken) {
    const concurrentCount = await this._getMetricCount({
      metricType: 'active_session',
      entityType: 'admin_id',
      entityId: adminId,
      timeframeMinutes: 1440 // 24 hours
    });

    if (concurrentCount >= this.alertThresholds.concurrentSessions.critical) {
      return await this.triggerAlert({
        alertType: 'excessive_concurrent_sessions',
        severity: 'critical',
        title: 'Critical: Excessive Concurrent Sessions',
        description: `Admin ${adminId} has ${concurrentCount} concurrent sessions`,
        evidence: { concurrentSessions: concurrentCount },
        indicators: ['session_hijacking', 'credential_compromise'],
        adminId,
        sessionToken
      });
    } else if (concurrentCount >= this.alertThresholds.concurrentSessions.warning) {
      return await this.triggerAlert({
        alertType: 'high_concurrent_sessions',
        severity: 'medium',
        title: 'High Number of Concurrent Sessions',
        description: `Admin ${adminId} has ${concurrentCount} concurrent sessions`,
        evidence: { concurrentSessions: concurrentCount },
        indicators: ['unusual_activity'],
        adminId,
        sessionToken
      });
    }

    return null;
  }

  async _checkIPReputation(ipAddress, adminId) {
    // In production, this would check against threat intelligence feeds
    // For now, we'll check our own failure history
    const suspiciousActivity = await this._getMetricCount({
      metricType: 'security_violation',
      entityType: 'ip_address',
      entityId: ipAddress,
      timeframeMinutes: 1440 // 24 hours
    });

    if (suspiciousActivity >= this.alertThresholds.suspiciousIPs.failedAttemptsThreshold) {
      return await this.triggerAlert({
        alertType: 'suspicious_ip_activity',
        severity: 'high',
        title: 'Suspicious IP Address Activity',
        description: `IP ${ipAddress} has ${suspiciousActivity} security violations in 24h`,
        evidence: { securityViolations: suspiciousActivity, timeframe: '24h' },
        indicators: ['malicious_ip', 'repeated_violations'],
        ipAddress,
        adminId
      });
    }

    return null;
  }

  async _checkGeographicAnomaly(ipAddress, adminId) {
    // Placeholder for geographic anomaly detection
    // In production, this would use IP geolocation services
    return null;
  }

  /**
   * Helper methods
   */
  async _getMetricCount(params) {
    const { metricType, entityType, entityId, timeframeMinutes } = params;
    const cutoffTime = new Date(Date.now() - (timeframeMinutes * 60 * 1000));

    const result = await this.db.execute({
      sql: `SELECT COALESCE(SUM(metric_value), 0) as total
            FROM security_alert_metrics
            WHERE metric_type = ? AND entity_type = ? AND entity_id = ? AND measured_at >= ?`,
      args: [metricType, entityType, entityId, cutoffTime.toISOString()]
    });

    return result.rows[0].total;
  }

  async recordMetric(params) {
    return this._executeWithRetry(async () => {
      await this.ensureInitialized();

      const {
        metricType,
        metricValue,
        timeframe,
        entityType,
        entityId,
        ipAddress,
        metadata = {}
      } = params;

      await this.db.execute({
        sql: `INSERT INTO security_alert_metrics (
          metric_type, metric_value, timeframe, entity_type, entity_id, ip_address, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          metricType,
          metricValue,
          timeframe,
          entityType,
          entityId,
          ipAddress,
          JSON.stringify(metadata)
        ]
      });
    });
  }

  _isInCooldown(key, severity) {
    const cooldown = this.alertCooldowns.get(key);
    if (!cooldown) return false;

    const cooldownPeriod = this._getCooldownPeriod(severity);
    return Date.now() - cooldown < cooldownPeriod;
  }

  _setCooldown(key, severity) {
    this.alertCooldowns.set(key, Date.now());
  }

  _getCooldownPeriod(severity) {
    const periods = {
      critical: 5 * 60 * 1000,   // 5 minutes
      high: 10 * 60 * 1000,      // 10 minutes
      medium: 30 * 60 * 1000,    // 30 minutes
      low: 60 * 60 * 1000        // 1 hour
    };
    return periods[severity] || periods.low;
  }

  _mapSeverityToAuditLevel(severity) {
    const mapping = {
      critical: 'critical',
      high: 'error',
      medium: 'warning',
      low: 'info'
    };
    return mapping[severity] || 'info';
  }

  async _enableEnhancedMonitoring(sessionToken, ipAddress) {
    // Placeholder for enhanced monitoring activation
    logger.info('[SecurityAlert] Enhanced monitoring enabled', { sessionToken: sessionToken?.substring(0, 16), ipAddress });
  }

  async _notifySecurityTeam(params) {
    // Placeholder for security team notification
    logger.warn('[SecurityAlert] Security team notification', params);
  }

  async _requestSessionReauth(sessionToken) {
    // Placeholder for session re-authentication request
    logger.warn('[SecurityAlert] Session re-authentication requested', { sessionToken: sessionToken?.substring(0, 16) });
  }

  async _createIncidentTicket(params) {
    // Placeholder for incident ticket creation
    const incidentId = `inc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    logger.error('[SecurityAlert] Incident ticket created', { ...params, incidentId });
    return incidentId;
  }

  /**
   * Get security alert dashboard data
   */
  async getAlertDashboard(timeframeHours = 24) {
    await this.ensureInitialized();

    try {
      const timeframeStart = new Date(Date.now() - (timeframeHours * 60 * 60 * 1000));

      // Alert counts by severity
      const alertCounts = await this.db.execute({
        sql: `SELECT severity, status, COUNT(*) as count
              FROM security_alerts
              WHERE triggered_at >= ?
              GROUP BY severity, status`,
        args: [timeframeStart.toISOString()]
      });

      // Top alert types
      const topAlertTypes = await this.db.execute({
        sql: `SELECT alert_type, COUNT(*) as count, MAX(severity) as max_severity
              FROM security_alerts
              WHERE triggered_at >= ?
              GROUP BY alert_type
              ORDER BY count DESC
              LIMIT 10`,
        args: [timeframeStart.toISOString()]
      });

      // Recent high-severity alerts
      const recentHighSeverityAlerts = await this.db.execute({
        sql: `SELECT alert_id, alert_type, severity, title, triggered_at, status
              FROM security_alerts
              WHERE triggered_at >= ? AND severity IN ('high', 'critical')
              ORDER BY triggered_at DESC
              LIMIT 20`,
        args: [timeframeStart.toISOString()]
      });

      return {
        timeframe: `${timeframeHours}h`,
        alertCounts: alertCounts.rows,
        topAlertTypes: topAlertTypes.rows,
        recentHighSeverityAlerts: recentHighSeverityAlerts.rows,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[SecurityAlert] Failed to get alert dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Health check for security alert service
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();

      const recentAlertsResult = await this.db.execute(
        `SELECT COUNT(*) as count FROM security_alerts
         WHERE triggered_at >= datetime('now', '-24 hours')`
      );

      const activeAlertsResult = await this.db.execute(
        `SELECT COUNT(*) as count FROM security_alerts
         WHERE status IN ('open', 'investigating')`
      );

      return {
        status: 'healthy',
        initialized: this.initialized,
        recentAlerts: recentAlertsResult.rows[0].count,
        activeAlerts: activeAlertsResult.rows[0].count,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const securityAlertService = new SecurityAlertService();

// Export both the instance and the class
export default securityAlertService;
export { securityAlertService };