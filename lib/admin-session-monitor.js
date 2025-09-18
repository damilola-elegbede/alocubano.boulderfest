/**
 * Admin Session Monitoring Service
 * Tracks admin sessions, detects anomalous patterns, and provides security scoring
 * Implements comprehensive session security monitoring without disrupting business operations
 */

import { getDatabaseClient } from './database.js';
import { auditService } from './audit-service.js';
import { logger } from './logger.js';
import crypto from 'crypto';

export class AdminSessionMonitor {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;

    // Security thresholds
    this.maxConcurrentSessions = 5;
    this.maxSessionsPerHour = 20;
    this.maxFailedAttemptsPerHour = 10;
    this.suspiciousActivityThreshold = 75; // Score out of 100
    this.criticalActivityThreshold = 90;

    // Session patterns cache
    this.sessionPatterns = new Map();

    // Cleanup interval
    this.cleanupInterval = null;
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
      logger.debug('[SessionMonitor] Initializing admin session monitor...');
      this.db = await getDatabaseClient();

      // Ensure required tables exist
      await this._ensureMonitoringTables();

      // Start background cleanup process
      this._startCleanupProcess();

      this.initialized = true;
      logger.debug('[SessionMonitor] Admin session monitor initialized successfully');
      return this;
    } catch (error) {
      logger.error('[SessionMonitor] Initialization failed:', error.message);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Ensure monitoring tables exist
   */
  async _ensureMonitoringTables() {
    try {
      // Session analytics table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS admin_session_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_token TEXT NOT NULL,
          admin_id TEXT NOT NULL,
          login_time DATETIME NOT NULL,
          logout_time DATETIME,
          duration_seconds INTEGER,
          ip_address TEXT NOT NULL,
          user_agent TEXT,

          -- Activity metrics
          page_views INTEGER DEFAULT 0,
          api_calls INTEGER DEFAULT 0,
          failed_operations INTEGER DEFAULT 0,

          -- Security metrics
          security_score INTEGER DEFAULT 50,
          anomaly_indicators TEXT, -- JSON array of detected anomalies
          mfa_used BOOLEAN DEFAULT FALSE,
          mfa_verified_at DATETIME,

          -- Geographical and device info
          country_code TEXT,
          device_fingerprint TEXT,
          browser_fingerprint TEXT,

          -- Risk assessment
          risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,

          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Session events table for detailed tracking
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS admin_session_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_token TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data TEXT, -- JSON
          ip_address TEXT,
          user_agent TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

          -- Security context
          previous_ip TEXT,
          ip_changed BOOLEAN DEFAULT FALSE,
          user_agent_changed BOOLEAN DEFAULT FALSE,

          -- Event classification
          severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
          requires_investigation BOOLEAN DEFAULT FALSE
        )
      `);

      // Create indexes for performance
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_session_analytics_token ON admin_session_analytics(session_token)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_session_analytics_admin ON admin_session_analytics(admin_id, login_time)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_session_events_token ON admin_session_events(session_token, timestamp)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_session_events_type ON admin_session_events(event_type, timestamp)');

      // Security incidents table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS admin_security_incidents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          incident_id TEXT NOT NULL UNIQUE,
          incident_type TEXT NOT NULL,
          severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

          -- Associated entities
          session_token TEXT,
          admin_id TEXT,
          ip_address TEXT,

          -- Incident details
          title TEXT NOT NULL,
          description TEXT,
          indicators TEXT, -- JSON array
          evidence TEXT, -- JSON object

          -- Response tracking
          status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
          assigned_to TEXT,
          resolution_notes TEXT,

          -- Timestamps
          detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME,

          -- Automation
          auto_resolved BOOLEAN DEFAULT FALSE,
          escalated BOOLEAN DEFAULT FALSE
        )
      `);

      // Create indexes for security incidents
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON admin_security_incidents(incident_type, severity)');
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON admin_security_incidents(status, detected_at)');

      logger.debug('[SessionMonitor] Monitoring tables verified/created');
    } catch (error) {
      logger.error('[SessionMonitor] Failed to ensure monitoring tables:', error.message);
      throw error;
    }
  }

  /**
   * Track session creation with initial security assessment
   */
  async trackSessionStart(params) {
    await this.ensureInitialized();

    const {
      sessionToken,
      adminId,
      ipAddress,
      userAgent,
      mfaUsed = false,
      loginMethod = 'password'
    } = params;

    try {
      // Generate device and browser fingerprints
      const deviceFingerprint = this._generateDeviceFingerprint(userAgent, ipAddress);
      const browserFingerprint = this._generateBrowserFingerprint(userAgent);

      // Calculate initial security score
      const securityScore = await this._calculateSecurityScore({
        ipAddress,
        userAgent,
        mfaUsed,
        loginMethod,
        sessionToken
      });

      // Determine risk level
      const riskLevel = this._determineRiskLevel(securityScore);

      // Check for concurrent sessions
      const concurrentSessions = await this._getConcurrentSessionCount(adminId);

      // Insert session analytics record
      await this.db.execute({
        sql: `INSERT INTO admin_session_analytics (
          session_token, admin_id, login_time, ip_address, user_agent,
          security_score, mfa_used, device_fingerprint, browser_fingerprint,
          risk_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          sessionToken.substring(0, 16) + '...', // Truncate for security
          adminId,
          new Date().toISOString(),
          ipAddress,
          userAgent,
          securityScore,
          mfaUsed,
          deviceFingerprint,
          browserFingerprint,
          riskLevel
        ]
      });

      // Record session start event
      await this._recordSessionEvent({
        sessionToken,
        eventType: 'session_start',
        eventData: {
          loginMethod,
          mfaUsed,
          concurrentSessions,
          securityScore,
          riskLevel
        },
        ipAddress,
        userAgent,
        severity: riskLevel === 'critical' ? 'error' : riskLevel === 'high' ? 'warning' : 'info'
      });

      // Check for suspicious patterns
      await this._checkForSuspiciousPatterns({
        sessionToken,
        adminId,
        ipAddress,
        userAgent,
        securityScore,
        concurrentSessions
      });

      // Audit log the session start
      await auditService.logAdminAccess({
        adminUser: adminId,
        sessionId: sessionToken.substring(0, 16) + '...',
        ipAddress,
        userAgent,
        requestMethod: 'LOGIN',
        requestUrl: '/api/admin/login',
        responseStatus: 200,
        metadata: {
          sessionMonitoring: {
            securityScore,
            riskLevel,
            mfaUsed,
            concurrentSessions,
            deviceFingerprint
          }
        }
      });

      return {
        success: true,
        securityScore,
        riskLevel,
        concurrentSessions,
        sessionId: sessionToken.substring(0, 16) + '...'
      };

    } catch (error) {
      logger.error('[SessionMonitor] Failed to track session start:', error.message);
      // Don't fail authentication if monitoring fails
      return {
        success: false,
        error: error.message,
        fallbackMode: true
      };
    }
  }

  /**
   * Track session activity and update security metrics
   */
  async trackSessionActivity(params) {
    await this.ensureInitialized();

    const {
      sessionToken,
      activityType,
      ipAddress,
      userAgent,
      requestUrl,
      responseStatus,
      metadata = {}
    } = params;

    try {
      // Get current session analytics
      const sessionAnalytics = await this._getSessionAnalytics(sessionToken);
      if (!sessionAnalytics) {
        logger.warn(`[SessionMonitor] Session analytics not found for token: ${sessionToken.substring(0, 16)}...`);
        return { success: false, reason: 'session_not_found' };
      }

      // Check for IP or user agent changes
      const ipChanged = sessionAnalytics.ip_address !== ipAddress;
      const userAgentChanged = sessionAnalytics.user_agent !== userAgent;

      // Update activity counters
      const updates = {};
      switch (activityType) {
        case 'page_view':
          updates.page_views = (sessionAnalytics.page_views || 0) + 1;
          break;
        case 'api_call':
          updates.api_calls = (sessionAnalytics.api_calls || 0) + 1;
          break;
        case 'failed_operation':
          updates.failed_operations = (sessionAnalytics.failed_operations || 0) + 1;
          break;
      }

      // Recalculate security score if needed
      let newSecurityScore = sessionAnalytics.security_score;
      if (ipChanged || userAgentChanged || activityType === 'failed_operation') {
        newSecurityScore = await this._calculateSecurityScore({
          ipAddress,
          userAgent,
          sessionToken,
          existingScore: sessionAnalytics.security_score,
          ipChanged,
          userAgentChanged,
          failedOperations: updates.failed_operations || sessionAnalytics.failed_operations
        });
        updates.security_score = newSecurityScore;
        updates.risk_level = this._determineRiskLevel(newSecurityScore);
      }

      // Update session analytics
      const updateQuery = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      if (updateQuery) {
        const updateValues = Object.values(updates);
        await this.db.execute({
          sql: `UPDATE admin_session_analytics
                SET ${updateQuery}, last_activity = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE session_token = ?`,
          args: [...updateValues, sessionToken.substring(0, 16) + '...']
        });
      }

      // Record session event
      await this._recordSessionEvent({
        sessionToken,
        eventType: activityType,
        eventData: {
          requestUrl,
          responseStatus,
          ...metadata
        },
        ipAddress,
        userAgent,
        previousIp: sessionAnalytics.ip_address,
        ipChanged,
        userAgentChanged,
        severity: this._determineEventSeverity(activityType, responseStatus, ipChanged, userAgentChanged)
      });

      // Check for security incidents
      if (newSecurityScore >= this.suspiciousActivityThreshold) {
        await this._checkForSecurityIncidents({
          sessionToken,
          adminId: sessionAnalytics.admin_id,
          ipAddress,
          userAgent,
          securityScore: newSecurityScore,
          ipChanged,
          userAgentChanged,
          activityType
        });
      }

      return {
        success: true,
        securityScore: newSecurityScore,
        riskLevel: updates.risk_level || sessionAnalytics.risk_level,
        anomaliesDetected: ipChanged || userAgentChanged
      };

    } catch (error) {
      logger.error('[SessionMonitor] Failed to track session activity:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Track session end and calculate final metrics
   */
  async trackSessionEnd(sessionToken, logoutType = 'manual') {
    await this.ensureInitialized();

    try {
      const sessionAnalytics = await this._getSessionAnalytics(sessionToken);
      if (!sessionAnalytics) {
        return { success: false, reason: 'session_not_found' };
      }

      const endTime = new Date();
      const startTime = new Date(sessionAnalytics.login_time);
      const durationSeconds = Math.floor((endTime - startTime) / 1000);

      // Update session analytics with end time and duration
      await this.db.execute({
        sql: `UPDATE admin_session_analytics
              SET logout_time = ?, duration_seconds = ?, updated_at = CURRENT_TIMESTAMP
              WHERE session_token = ?`,
        args: [
          endTime.toISOString(),
          durationSeconds,
          sessionToken.substring(0, 16) + '...'
        ]
      });

      // Record session end event
      await this._recordSessionEvent({
        sessionToken,
        eventType: 'session_end',
        eventData: {
          logoutType,
          durationSeconds,
          finalSecurityScore: sessionAnalytics.security_score
        },
        ipAddress: sessionAnalytics.ip_address,
        userAgent: sessionAnalytics.user_agent,
        severity: 'info'
      });

      return {
        success: true,
        durationSeconds,
        finalSecurityScore: sessionAnalytics.security_score
      };

    } catch (error) {
      logger.error('[SessionMonitor] Failed to track session end:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get session security dashboard data
   */
  async getSessionDashboard(timeframeHours = 24) {
    await this.ensureInitialized();

    try {
      const timeframeStart = new Date(Date.now() - (timeframeHours * 60 * 60 * 1000));

      // Active sessions
      const activeSessions = await this.db.execute({
        sql: `SELECT COUNT(*) as count,
                     AVG(security_score) as avg_security_score,
                     COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_sessions,
                     COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_sessions
              FROM admin_session_analytics
              WHERE logout_time IS NULL`,
        args: []
      });

      // Recent session statistics
      const recentStats = await this.db.execute({
        sql: `SELECT
                COUNT(*) as total_sessions,
                AVG(duration_seconds) as avg_duration,
                AVG(security_score) as avg_security_score,
                COUNT(CASE WHEN mfa_used = TRUE THEN 1 END) as mfa_sessions,
                COUNT(DISTINCT ip_address) as unique_ips
              FROM admin_session_analytics
              WHERE login_time >= ?`,
        args: [timeframeStart.toISOString()]
      });

      // Security incidents
      const incidents = await this.db.execute({
        sql: `SELECT severity, status, COUNT(*) as count
              FROM admin_security_incidents
              WHERE detected_at >= ?
              GROUP BY severity, status`,
        args: [timeframeStart.toISOString()]
      });

      return {
        timeframe: `${timeframeHours}h`,
        activeSessions: activeSessions.rows[0],
        recentStats: recentStats.rows[0],
        incidents: incidents.rows,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[SessionMonitor] Failed to get session dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Calculate security score based on multiple factors
   */
  async _calculateSecurityScore(params) {
    const {
      ipAddress,
      userAgent,
      mfaUsed,
      loginMethod = 'password',
      sessionToken,
      existingScore = 50,
      ipChanged = false,
      userAgentChanged = false,
      failedOperations = 0
    } = params;

    let score = existingScore;

    // MFA usage bonus
    if (mfaUsed) {
      score += 20;
    } else {
      score -= 10;
    }

    // Login method assessment
    if (loginMethod === 'password_only') {
      score -= 15;
    }

    // IP and User Agent changes (security concerns)
    if (ipChanged) {
      score -= 25;
    }
    if (userAgentChanged) {
      score -= 15;
    }

    // Failed operations penalty
    score -= (failedOperations * 5);

    // Check for known bad patterns
    if (await this._isKnownBadIP(ipAddress)) {
      score -= 30;
    }

    if (this._isSuspiciousUserAgent(userAgent)) {
      score -= 20;
    }

    // Time-based factors
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      score -= 5; // Off-hours login
    }

    // Ensure score stays within bounds
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine risk level from security score
   */
  _determineRiskLevel(securityScore) {
    if (securityScore >= 90) return 'critical';
    if (securityScore >= 75) return 'high';
    if (securityScore >= 50) return 'medium';
    return 'low';
  }

  /**
   * Generate device fingerprint
   */
  _generateDeviceFingerprint(userAgent, ipAddress) {
    // Handle null/undefined values with safe defaults
    const safeUserAgent = userAgent || 'unknown-agent';
    const safeIpAddress = ipAddress || 'unknown-ip';

    const hash = crypto.createHash('sha256');
    hash.update(safeUserAgent + safeIpAddress);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Generate browser fingerprint
   */
  _generateBrowserFingerprint(userAgent) {
    // Handle null/undefined values with safe default
    const safeUserAgent = userAgent || 'unknown-agent';

    const hash = crypto.createHash('sha256');
    hash.update(safeUserAgent);
    return hash.digest('hex').substring(0, 12);
  }

  /**
   * Check for suspicious patterns and create incidents
   */
  async _checkForSuspiciousPatterns(params) {
    const { sessionToken, adminId, ipAddress, securityScore, concurrentSessions } = params;

    try {
      // Too many concurrent sessions
      if (concurrentSessions > this.maxConcurrentSessions) {
        await this._createSecurityIncident({
          incidentType: 'excessive_concurrent_sessions',
          severity: 'medium',
          sessionToken,
          adminId,
          ipAddress,
          title: 'Excessive Concurrent Sessions',
          description: `Admin has ${concurrentSessions} concurrent sessions (limit: ${this.maxConcurrentSessions})`,
          indicators: ['concurrent_sessions', 'session_management']
        });
      }

      // Low security score
      if (securityScore < 30) {
        await this._createSecurityIncident({
          incidentType: 'low_security_score',
          severity: 'high',
          sessionToken,
          adminId,
          ipAddress,
          title: 'Low Security Score Session',
          description: `Session has security score of ${securityScore}/100`,
          indicators: ['security_score', 'authentication_risk']
        });
      }
    } catch (error) {
      logger.error('[SessionMonitor] Failed to check suspicious patterns:', error.message);
    }
  }

  /**
   * Helper methods
   */
  async _getSessionAnalytics(sessionToken) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM admin_session_analytics WHERE session_token = ?',
      args: [sessionToken.substring(0, 16) + '...']
    });
    return result.rows[0] || null;
  }

  async _getConcurrentSessionCount(adminId) {
    const result = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM admin_session_analytics WHERE admin_id = ? AND logout_time IS NULL',
      args: [adminId]
    });
    return result.rows[0].count;
  }

  async _recordSessionEvent(params) {
    const {
      sessionToken,
      eventType,
      eventData,
      ipAddress,
      userAgent,
      previousIp = null,
      ipChanged = false,
      userAgentChanged = false,
      severity = 'info'
    } = params;

    await this.db.execute({
      sql: `INSERT INTO admin_session_events (
        session_token, event_type, event_data, ip_address, user_agent,
        previous_ip, ip_changed, user_agent_changed, severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sessionToken.substring(0, 16) + '...',
        eventType,
        JSON.stringify(eventData),
        ipAddress,
        userAgent,
        previousIp,
        ipChanged,
        userAgentChanged,
        severity
      ]
    });
  }

  _determineEventSeverity(activityType, responseStatus, ipChanged, userAgentChanged) {
    if (responseStatus >= 500) return 'error';
    if (ipChanged || userAgentChanged) return 'warning';
    if (activityType === 'failed_operation') return 'warning';
    if (responseStatus >= 400) return 'warning';
    return 'info';
  }

  async _checkForSecurityIncidents(params) {
    // Additional security incident checks can be implemented here
    logger.debug('[SessionMonitor] Security incident check completed');
  }

  async _createSecurityIncident(params) {
    const {
      incidentType,
      severity,
      sessionToken,
      adminId,
      ipAddress,
      title,
      description,
      indicators = []
    } = params;

    const incidentId = `inc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    await this.db.execute({
      sql: `INSERT INTO admin_security_incidents (
        incident_id, incident_type, severity, session_token, admin_id,
        ip_address, title, description, indicators
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        incidentId,
        incidentType,
        severity,
        sessionToken ? sessionToken.substring(0, 16) + '...' : null,
        adminId,
        ipAddress,
        title,
        description,
        JSON.stringify(indicators)
      ]
    });

    logger.warn(`[SessionMonitor] Security incident created: ${incidentId} - ${title}`);
    return incidentId;
  }

  async _isKnownBadIP(ipAddress) {
    // Placeholder for IP reputation checking
    // In production, this could check against threat intelligence feeds
    return false;
  }

  _isSuspiciousUserAgent(userAgent) {
    // Basic suspicious user agent detection
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /curl/i,
      /wget/i,
      /python/i,
      /perl/i,
      /^$/
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent || ''));
  }

  _startCleanupProcess() {
    // Clean up old records every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        const cutoffDate = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)); // 90 days

        await this.db.execute({
          sql: 'DELETE FROM admin_session_events WHERE timestamp < ?',
          args: [cutoffDate.toISOString()]
        });

        await this.db.execute({
          sql: 'DELETE FROM admin_session_analytics WHERE login_time < ? AND logout_time IS NOT NULL',
          args: [cutoffDate.toISOString()]
        });

        logger.debug('[SessionMonitor] Cleanup completed');
      } catch (error) {
        logger.error('[SessionMonitor] Cleanup failed:', error.message);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Health check for session monitor
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();

      const activeSessionsResult = await this.db.execute(
        'SELECT COUNT(*) as count FROM admin_session_analytics WHERE logout_time IS NULL'
      );

      const recentIncidentsResult = await this.db.execute(
        `SELECT COUNT(*) as count FROM admin_security_incidents
         WHERE detected_at >= datetime('now', '-24 hours')`
      );

      return {
        status: 'healthy',
        initialized: this.initialized,
        activeSessions: activeSessionsResult.rows[0].count,
        recentIncidents: recentIncidentsResult.rows[0].count,
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
const adminSessionMonitor = new AdminSessionMonitor();

// Export both the instance and the class
export default adminSessionMonitor;
export { adminSessionMonitor };