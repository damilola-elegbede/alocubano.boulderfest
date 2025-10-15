/**
 * Security Alert Service
 * Provides automated security alerting and incident response framework
 * Implements security event severity levels and automated response actions
 */

import { getDatabaseClient } from './database.js';
import auditService from './audit-service.js';
import { logger } from './logger.js';
import crypto from 'crypto';
import { safeStringify } from './bigint-serializer.js';

export class SecurityAlertService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;

    // Retry configuration for database operations
    this.maxRetries = 3;
    this.retryDelay = 100; // ms

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

      // In integration test mode, use the test isolation manager's database
      if (process.env.INTEGRATION_TEST_MODE === 'true') {
        try {
          const { getTestIsolationManager } = await import('./test-isolation-manager.js');
          const isolationManager = getTestIsolationManager();
          this.db = await isolationManager.getScopedDatabaseClient();
        } catch (error) {
          logger.warn('[SecurityAlert] Failed to get test database, falling back to standard database:', error.message);
          this.db = await getDatabaseClient();
        }
      } else {
        this.db = await getDatabaseClient();
      }

      if (!this.db) {
        throw new Error('Failed to get database client - db is null');
      }

      // Check that required tables exist (migration system handles creation)
      await this._checkAlertTables();

      this.initialized = true;
      logger.debug('[SecurityAlert] Security alert service initialized successfully');
      return this;
    } catch (error) {
      logger.error('[SecurityAlert] Initialization failed:', error.message);
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Execute operation with retry logic for database connection issues
   */
  async _executeWithRetry(operation) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (error.message?.includes('CLIENT_CLOSED') && attempt < this.maxRetries) {
          logger.debug(`[SecurityAlert] Database connection closed, retrying... (attempt ${attempt}/${this.maxRetries})`);
          // Reinitialize connection and retry
          this.initialized = false;
          this.initializationPromise = null;
          await this.ensureInitialized();
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Check if required alert tables exist (migration system handles creation)
   * Uses exponential backoff retry for table availability in test environments
   */
  async _checkAlertTables() {
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.INTEGRATION_TEST_MODE === 'true';
    const maxRetries = isTestMode ? 5 : 3;
    const baseDelay = isTestMode ? 100 : 50; // ms

    const tables = ['security_alerts', 'security_alert_metrics'];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if tables exist (created by migration system)
        const missingTables = [];

        for (const tableName of tables) {
          try {
            await this.db.execute(`SELECT 1 FROM ${tableName} LIMIT 1`);
            logger.debug(`[SecurityAlert] Table ${tableName} exists and accessible`);
          } catch (error) {
            if (error.message.includes('no such table')) {
              missingTables.push(tableName);
            } else {
              throw error; // Re-throw non-table errors
            }
          }
        }

        if (missingTables.length === 0) {
          logger.debug('[SecurityAlert] All alert tables verified');
          return; // Success
        }

        // Some tables are missing
        if (isTestMode && attempt < maxRetries) {
          // In test mode, retry with exponential backoff - tables might still be creating
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.debug(`[SecurityAlert] Missing tables: ${missingTables.join(', ')} (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else if (isTestMode) {
          logger.warn(`[SecurityAlert] Tables missing in test mode: ${missingTables.join(', ')} - operations will be skipped`);
          return; // Allow test to continue
        } else {
          throw new Error(`Required tables not found: ${missingTables.join(', ')}. Ensure migrations are run.`);
        }

      } catch (error) {
        // Other errors
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.debug(`[SecurityAlert] Table check error (attempt ${attempt}/${maxRetries}): ${error.message}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // In test mode, don't fail initialization if tables don't exist
        if (isTestMode) {
          logger.warn('[SecurityAlert] Continuing in test mode without alert tables due to error:', error.message);
          return;
        }
        throw error;
      }
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
      // Use correlationId for webhook alerts to avoid global cooldowns blocking legitimate alerts
      const cooldownKey = `${alertType}:${correlationId || ipAddress || adminId || 'global'}`;
      if (this._isInCooldown(cooldownKey, severity)) {
        logger.debug(`[SecurityAlert] Alert ${alertType} in cooldown for ${cooldownKey}`);
        return { success: false, reason: 'cooldown_active' };
      }

      const alertId = `alert_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // Store alert in database (skip if table doesn't exist in test mode)
      try {
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
            safeStringify(evidence),
            safeStringify(indicators),
            adminId,
            sessionToken ? sessionToken.substring(0, 16) + '...' : null,
            ipAddress,
            safeStringify(triggerConditions),
            safeStringify(affectedResources),
            correlationId
          ]
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
          logger.debug('[SecurityAlert] Skipping alert storage in test mode - table not available');
        } else {
          throw error;
        }
      }

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
        ipAddress: ipAddress ? ipAddress.substring(0, 15) + '...' : 'unknown',
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

      // Update alert with response actions (skip if table doesn't exist in test mode)
      try {
        await this.db.execute({
          sql: 'UPDATE security_alerts SET response_actions = ?, updated_at = CURRENT_TIMESTAMP WHERE alert_id = ?',
          args: [safeStringify(actions), alertId]
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
          logger.debug('[SecurityAlert] Skipping response actions update in test mode - table not available');
        } else {
          throw error;
        }
      }

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

    try {
      const result = await this.db.execute({
        sql: `SELECT COALESCE(SUM(metric_value), 0) as total
              FROM security_alert_metrics
              WHERE metric_type = ? AND entity_type = ? AND entity_id = ? AND measured_at >= ?`,
        args: [metricType, entityType, entityId, cutoffTime.toISOString()]
      });

      return result.rows[0].total;
    } catch (error) {
      if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
        logger.debug('[SecurityAlert] Metric table not available in test mode');
        return 0;
      }
      throw error;
    }
  }

  async recordMetric(params) {
    return this._executeWithRetry(async () => {
      await this.ensureInitialized();

      const {
        metricType,
        metricValue = 1,
        timeframe = '1h',
        entityType,
        entityId,
        ipAddress,
        metadata = {}
      } = params;

      // Validate required parameters with safe defaults
      const safeEntityId = entityId || 'unknown';
      const safeIpAddress = ipAddress || 'unknown';
      const safeMetadata = typeof metadata === 'object' ? safeStringify(metadata) : '{}';

      try {
        await this.db.execute({
          sql: `INSERT INTO security_alert_metrics (
            metric_type, metric_value, timeframe, entity_type, entity_id, ip_address, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            metricType,
            metricValue,
            timeframe,
            entityType,
            safeEntityId,
            safeIpAddress,
            safeMetadata
          ]
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
          logger.debug('[SecurityAlert] Skipping metric recording in test mode - table not available');
        } else {
          throw error;
        }
      }
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
    const { alertId, severity, alertType, title, adminId, ipAddress } = params;

    // Only send emails in production
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[SecurityAlert] Security team notification (non-production)', params);
      return;
    }

    try {
      // Import Brevo service for email
      const { getBrevoService } = await import('./brevo-service.js');
      const brevoService = getBrevoService();

      // Admin email from environment or default
      const adminEmail = process.env.ADMIN_EMAIL || 'alocubanoboulderfest@gmail.com';

      const emailHtml = `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1f2937; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 24px;">🚨 Security Alert</h1>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <div style="background: ${severity === 'critical' ? '#ef4444' : '#f59e0b'}; color: white; padding: 10px; border-radius: 4px; margin-bottom: 20px;">
                <strong style="font-size: 16px;">${severity.toUpperCase()}</strong>
              </div>

              <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #1f2937;">${title}</h2>

              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Alert ID:</td>
                  <td style="padding: 8px 0; color: #1f2937; font-family: monospace;">${alertId}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Alert Type:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${alertType}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Severity:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${severity}</td>
                </tr>
                ${adminId ? `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Admin User:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${adminId}</td>
                </tr>` : ''}
                ${ipAddress ? `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">IP Address:</td>
                  <td style="padding: 8px 0; color: #1f2937; font-family: monospace;">${ipAddress}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Timestamp:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })} MT</td>
                </tr>
              </table>

              <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; font-weight: 600; color: #1f2937;">Recommended Actions:</p>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                  <li>Review the audit logs for suspicious activity</li>
                  <li>Check admin panel for unauthorized access attempts</li>
                  ${severity === 'critical' ? '<li><strong>Consider forcing session re-authentication</strong></li>' : ''}
                  <li>Investigate IP address for known threats</li>
                </ul>
              </div>

              <div style="text-align: center; margin-top: 20px;">
                <a href="https://alocubanoboulderfest.org/admin/audit-logs"
                   style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  View Audit Logs
                </a>
              </div>

              <p style="margin-top: 20px; font-size: 12px; color: #9ca3af; text-align: center;">
                This is an automated security alert from A Lo Cubano Boulder Fest Admin System
              </p>
            </div>
          </body>
        </html>
      `;

      // Sender email from environment variable
      const fromEmail = process.env.SECURITY_ALERT_FROM_EMAIL || 'noreply@alocubanoboulderfest.org';
      const fromName = 'A Lo Cubano Security';

      await brevoService.sendTransactionalEmail({
        from: { email: fromEmail, name: fromName },
        to: [{ email: adminEmail }],
        subject: `🚨 ${severity.toUpperCase()} Security Alert: ${alertType}`,
        htmlContent: emailHtml
      });

      logger.info('[SecurityAlert] Security team notified via email', {
        alertId,
        severity,
        recipient: adminEmail
      });
    } catch (error) {
      logger.error('[SecurityAlert] Failed to send email notification:', error.message);
      // Don't throw - notification failure shouldn't break alert processing
    }
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

    // In test mode, return mock dashboard data when tables don't exist
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.INTEGRATION_TEST_MODE === 'true';

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
      if (isTestMode && error.message.includes('no such table')) {
        logger.debug('[SecurityAlert] Returning mock dashboard data in test mode - tables not available');
        return {
          timeframe: `${timeframeHours}h`,
          alertCounts: [],
          topAlertTypes: [],
          recentHighSeverityAlerts: [],
          generatedAt: new Date().toISOString()
        };
      }
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

      // In test mode, skip database queries if tables don't exist
      const isTestMode = process.env.NODE_ENV === 'test' || process.env.INTEGRATION_TEST_MODE === 'true';

      let recentAlerts = 0;
      let activeAlerts = 0;

      try {
        const recentAlertsResult = await this.db.execute(
          `SELECT COUNT(*) as count FROM security_alerts
           WHERE triggered_at >= datetime('now', '-24 hours')`
        );
        recentAlerts = recentAlertsResult.rows[0].count;

        const activeAlertsResult = await this.db.execute(
          `SELECT COUNT(*) as count FROM security_alerts
           WHERE status IN ('open', 'investigating')`
        );
        activeAlerts = activeAlertsResult.rows[0].count;
      } catch (error) {
        if (isTestMode && error.message.includes('no such table')) {
          logger.debug('[SecurityAlert] Using default health check values in test mode - tables not available');
          // Use default values in test mode
        } else {
          throw error;
        }
      }

      return {
        status: 'healthy',
        initialized: this.initialized,
        recentAlerts,
        activeAlerts,
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

/**
 * Get the security alert service singleton instance
 * Ensures proper initialization following Promise-based singleton pattern
 */
export async function getSecurityAlertService() {
  return await securityAlertService.ensureInitialized();
}

// Export both the instance and the class
export default securityAlertService;
export { securityAlertService };