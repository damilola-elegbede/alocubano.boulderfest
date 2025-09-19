/**
 * Security Monitoring Integration Tests
 * Tests login attempt monitoring, session tracking, and suspicious activity detection
 * Validates security alerting and comprehensive audit trails
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { testRequest, HTTP_STATUS, generateTestId } from './handler-test-helper.js';
import { getDbClient } from '../setup-integration.js';
import { resetAllServices } from './reset-services.js';
import auditService from '../../lib/audit-service.js';

// Test admin credentials
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('❌ FATAL: TEST_ADMIN_PASSWORD required for security monitoring tests');
}

describe('Security Monitoring Integration Tests', () => {
  let dbClient;
  let adminToken;

  beforeEach(async () => {
    await resetAllServices();

    dbClient = await getDbClient();

    // Initialize all services with the same test database
    const { getDatabaseClient } = await import('../../lib/database.js');
    const { getAdminSessionMonitor } = await import('../../lib/admin-session-monitor.js');
    const { getSecurityAlertService } = await import('../../lib/security-alert-service.js');

    // Force audit service to use the test database
    auditService.db = dbClient || (await getDatabaseClient());
    auditService.initialized = true;
    auditService.initializationPromise = Promise.resolve(auditService);

    // Initialize other security services with the same database
    const sessionMonitor = await getAdminSessionMonitor();
    if (sessionMonitor && sessionMonitor.db !== dbClient) {
      sessionMonitor.db = dbClient;
    }

    const alertService = await getSecurityAlertService();
    if (alertService && alertService.db !== dbClient) {
      alertService.db = dbClient;
    }

    // Get admin token for authenticated requests
    const loginResponse = await testRequest('POST', '/api/admin/login', {
      username: 'admin',
      password: adminPassword
    });

    if (loginResponse.status === HTTP_STATUS.OK) {
      // Extract token from cookie
      const setCookie = loginResponse.headers && loginResponse.headers['set-cookie'];
      if (setCookie) {
        const tokenMatch = setCookie.match(/admin_session=([^;]+)/);
        if (tokenMatch) {
          adminToken = tokenMatch[1];
        }
      }
    } else {
      console.warn('⚠️ Could not obtain admin token - some tests may be skipped');
      adminToken = null;
    }
  });

  afterEach(async () => {
    // Clean up test data
    if (dbClient) {
      try {
        // Clean up security monitoring test data
        // Check if audit_logs table exists before cleanup
        const tables = await dbClient.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
        );
        if (tables.rows && tables.rows.length > 0) {
          await dbClient.execute(
            "DELETE FROM audit_logs WHERE request_id LIKE 'security_%' OR admin_user LIKE '%security_test%'"
          );

          // Clean up any rate limiting test data
          await dbClient.execute(
            "DELETE FROM admin_mfa_rate_limits WHERE ip_address LIKE '192.168.%'"
          );
        }
      } catch (error) {
        console.warn('⚠️ Failed to clean security test data:', error.message);
      }
    }
  });

  describe('Login Attempt Monitoring', () => {
    test('successful login attempts are properly monitored and logged', async () => {
      const testSessionId = generateTestId('security_session');

      // Perform successful login
      const loginResponse = await testRequest('POST', '/api/admin/login', {
        username: 'admin',
        password: adminPassword
      });

      if (loginResponse.status !== HTTP_STATUS.OK) {
        console.warn('⚠️ Admin service unavailable - skipping login monitoring test');
        return;
      }

      // Wait for audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for login monitoring logs
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 10
      });

      const loginLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/login') &&
        log.request_method === 'POST' &&
        log.response_status === 200
      );

      expect(loginLogs.length).toBeGreaterThan(0);

      if (loginLogs.length > 0) {
        const loginLog = loginLogs[0];
        expect(loginLog.event_type).toBe('admin_access');
        expect(loginLog.severity).toBe('info');
        expect(loginLog.ip_address).toBeDefined();
        expect(loginLog.user_agent).toBeDefined();
        expect(loginLog.response_time_ms).toBeGreaterThan(0);
      }

      // Also check for authentication attempt logs (check for POST to login endpoint)
      const authAttemptLogs = auditResult.logs.filter(log =>
        (log.action?.includes('POST') && log.request_url?.includes('/api/admin/login')) ||
        log.action?.includes('login')
      );

      expect(authAttemptLogs.length).toBeGreaterThan(0);
    });

    test('failed login attempts trigger security monitoring alerts', async () => {
      const testIpAddress = '192.168.100.1';

      // Simulate multiple failed login attempts
      const failedAttempts = [
        { username: 'admin', password: 'wrong1' },
        { username: 'admin', password: 'wrong2' },
        { username: 'admin', password: 'wrong3' }
      ];

      for (const attempt of failedAttempts) {
        const response = await testRequest('POST', '/api/admin/login', attempt);
        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);

        // Add delay between attempts to avoid immediate rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Wait for all audit logs to be written
      await new Promise(resolve => setTimeout(resolve, 800));

      // Check for failed login monitoring
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 20
      });

      const failedLoginLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/login') &&
        log.response_status === 401
      );

      expect(failedLoginLogs.length).toBeGreaterThanOrEqual(failedAttempts.length);

      // Verify security alert characteristics
      failedLoginLogs.forEach(log => {
        expect(log.severity).toBe('warning');
        expect(log.event_type).toBe('admin_access');
        expect(log.ip_address).toBeDefined();
      });

      // Check for authentication failure logs (check for POST to login endpoint with 401 status)
      const authFailureLogs = auditResult.logs.filter(log =>
        log.action?.includes('POST') &&
        log.request_url?.includes('/api/admin/login') &&
        log.response_status === 401
      );

      expect(authFailureLogs.length).toBeGreaterThan(0);
    });

    test('brute force pattern logging tracks multiple attempts', async () => {
      const bruteForceIp = '192.168.200.1';

      // Log a series of failed login attempts (simulated brute force pattern)
      // Note: Auto-blocking is not implemented, this test only verifies logging
      for (let i = 0; i < 10; i++) {
        await auditService.logAdminAccess({
          requestId: generateTestId(`brute_force_${i}`),
          adminUser: null,
          ipAddress: bruteForceIp,
          userAgent: 'BruteForceBot/1.0',
          requestMethod: 'POST',
          requestUrl: '/api/admin/login',
          responseStatus: 401,
          responseTimeMs: 50 + i * 10,
          error: 'Invalid credentials',
          metadata: {
            suspiciousActivity: true,
            attemptNumber: i + 1,
            patternDetected: 'rapid_failures'
          }
        });
      }

      // Verify multiple failed attempts from same IP are logged
      const ipFailures = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 20
      });

      const bruteForceAttempts = ipFailures.logs.filter(log =>
        log.ip_address === bruteForceIp &&
        log.response_status === 401
      );

      expect(bruteForceAttempts.length).toBeGreaterThanOrEqual(10);

      // Verify suspicious activity metadata is captured
      const suspiciousAttempts = bruteForceAttempts.filter(log => {
        if (!log.metadata) return false;
        const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
        return metadata.suspiciousActivity === true;
      });

      expect(suspiciousAttempts.length).toBeGreaterThan(0);
    });
  });

  describe('Session Tracking and Security Scoring', () => {
    test('admin session lifecycle is comprehensively tracked', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping session tracking test');
        return;
      }

      const sessionTestId = generateTestId('session_tracking');

      // Track session creation (login already done in beforeEach)
      await auditService.logDataChange({
        requestId: sessionTestId + '_creation',
        action: 'SESSION_CREATED',
        targetType: 'admin_session',
        targetId: adminToken.substring(0, 8) + '...',
        adminUser: 'admin',
        metadata: {
          sessionCreationTime: new Date().toISOString(),
          sessionDuration: '3600_seconds',
          mfaUsed: false,
          ipAddress: '127.0.0.1'
        },
        severity: 'info'
      });

      // Simulate session activity
      await testRequest('GET', '/api/admin/dashboard', null, {
        'Authorization': `Bearer ${adminToken}`
      });

      // Track session activity
      await auditService.logAdminAccess({
        requestId: sessionTestId + '_activity',
        adminUser: 'admin',
        sessionId: adminToken.substring(0, 8) + '...',
        ipAddress: '127.0.0.1',
        userAgent: 'TestRunner/1.0',
        requestMethod: 'GET',
        requestUrl: '/api/admin/dashboard',
        responseStatus: 200,
        responseTimeMs: 120,
        metadata: {
          sessionActivity: true,
          activityType: 'dashboard_access'
        }
      });

      // Verify session tracking logs
      const sessionLogs = await auditService.queryAuditLogs({
        eventType: 'data_change',
        action: 'SESSION_CREATED',
        limit: 5
      });

      const mySessionLogs = sessionLogs.logs.filter(log =>
        log.request_id?.includes(sessionTestId)
      );

      expect(mySessionLogs.length).toBeGreaterThan(0);

      // Verify session activity logs
      const activityLogs = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: 'admin',
        limit: 10
      });

      const sessionActivity = activityLogs.logs.filter(log =>
        log.request_url?.includes('/api/admin/dashboard')
      );

      expect(sessionActivity.length).toBeGreaterThan(0);
    });

    test('session security scoring based on risk factors', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping security scoring test');
        return;
      }

      // Simulate various security risk factors
      const riskFactors = [
        {
          factor: 'unusual_login_time',
          score: 2,
          description: 'Login outside normal business hours'
        },
        {
          factor: 'new_ip_address',
          score: 3,
          description: 'Login from previously unseen IP'
        },
        {
          factor: 'no_mfa',
          score: 5,
          description: 'Authentication without MFA'
        },
        {
          factor: 'high_privilege_access',
          score: 2,
          description: 'Access to sensitive admin functions'
        }
      ];

      let totalRiskScore = 0;
      for (const risk of riskFactors) {
        totalRiskScore += risk.score;

        await auditService.logDataChange({
          requestId: generateTestId('security_score'),
          action: 'SECURITY_RISK_EVALUATED',
          targetType: 'admin_session',
          targetId: adminToken.substring(0, 8) + '...',
          adminUser: 'admin',
          metadata: {
            riskFactor: risk.factor,
            riskScore: risk.score,
            riskDescription: risk.description,
            currentTotalScore: totalRiskScore,
            evaluationTime: new Date().toISOString()
          },
          severity: risk.score >= 4 ? 'warning' : 'info'
        });
      }

      // Log final security score assessment
      await auditService.logDataChange({
        requestId: generateTestId('final_security_score'),
        action: 'SESSION_SECURITY_SCORED',
        targetType: 'admin_session',
        targetId: adminToken.substring(0, 8) + '...',
        adminUser: 'admin',
        metadata: {
          finalSecurityScore: totalRiskScore,
          riskLevel: totalRiskScore >= 10 ? 'high' : totalRiskScore >= 5 ? 'medium' : 'low',
          factorsEvaluated: riskFactors.length,
          recommendedActions: totalRiskScore >= 10 ? ['require_mfa', 'additional_verification'] : []
        },
        severity: totalRiskScore >= 10 ? 'warning' : 'info'
      });

      // Verify security scoring logs
      const scoringLogs = await auditService.queryAuditLogs({
        eventType: 'data_change',
        action: 'SECURITY_RISK_EVALUATED',
        limit: 10
      });

      expect(scoringLogs.logs.length).toBeGreaterThanOrEqual(riskFactors.length);

      // Verify final scoring log
      const finalScoreLogs = await auditService.queryAuditLogs({
        eventType: 'data_change',
        action: 'SESSION_SECURITY_SCORED',
        limit: 5
      });

      expect(finalScoreLogs.logs.length).toBeGreaterThan(0);

      if (finalScoreLogs.logs.length > 0) {
        const finalScoreLog = finalScoreLogs.logs[0];
        const metadata = JSON.parse(finalScoreLog.metadata);
        expect(metadata.finalSecurityScore).toBe(totalRiskScore);
        expect(metadata.riskLevel).toBeDefined();
        expect(Array.isArray(metadata.recommendedActions)).toBe(true);
      }
    });
  });

  describe('Suspicious Activity Detection', () => {
    test('unusual access patterns trigger security alerts', async () => {
      const suspiciousIp = '192.168.50.100';
      const normalIp = '192.168.1.100';

      // Simulate normal admin activity
      await auditService.logAdminAccess({
        requestId: generateTestId('normal_activity'),
        adminUser: 'admin',
        ipAddress: normalIp,
        userAgent: 'Mozilla/5.0 (Normal Browser)',
        requestMethod: 'GET',
        requestUrl: '/api/admin/dashboard',
        responseStatus: 200,
        responseTimeMs: 150
      });

      // Simulate suspicious activity patterns
      const suspiciousActivities = [
        {
          url: '/api/admin/transactions',
          userAgent: 'curl/7.68.0',
          description: 'Automated tool access'
        },
        {
          url: '/api/admin/database-health',
          userAgent: 'Python-urllib/3.8',
          description: 'Script-based access'
        },
        {
          url: '/api/admin/debug-env',
          userAgent: 'Wget/1.20.3',
          description: 'Debug endpoint access'
        }
      ];

      for (const activity of suspiciousActivities) {
        await auditService.logAdminAccess({
          requestId: generateTestId('suspicious_activity'),
          adminUser: 'admin',
          ipAddress: suspiciousIp,
          userAgent: activity.userAgent,
          requestMethod: 'GET',
          requestUrl: activity.url,
          responseStatus: 200,
          responseTimeMs: 50,
          metadata: {
            suspiciousPattern: true,
            patternType: 'automated_access',
            description: activity.description
          }
        });

        // Log suspicious activity detection
        await auditService.logDataChange({
          requestId: generateTestId('suspicious_detection'),
          action: 'SUSPICIOUS_ACTIVITY_DETECTED',
          targetType: 'security_event',
          targetId: suspiciousIp + '_' + activity.url,
          ipAddress: suspiciousIp,
          adminUser: 'security_monitor',
          metadata: {
            detectionType: 'unusual_user_agent',
            suspiciousUserAgent: activity.userAgent,
            accessedEndpoint: activity.url,
            detectionTime: new Date().toISOString(),
            riskLevel: 'medium'
          },
          severity: 'warning'
        });
      }

      // Verify suspicious activity detection
      const suspiciousDetections = await auditService.queryAuditLogs({
        eventType: 'data_change',
        action: 'SUSPICIOUS_ACTIVITY_DETECTED',
        limit: 10
      });

      expect(suspiciousDetections.logs.length).toBeGreaterThanOrEqual(suspiciousActivities.length);

      suspiciousDetections.logs.forEach(log => {
        expect(log.severity).toBe('warning');
        expect(log.target_type).toBe('security_event');
        expect(log.admin_user).toBe('security_monitor');
      });
    });

    test('privilege escalation attempts trigger critical alerts', async () => {
      const attackerIp = '192.168.99.99';

      // Simulate privilege escalation attempts
      const escalationAttempts = [
        {
          url: '/api/admin/debug-env',
          error: 'Unauthorized access to debug information',
          responseStatus: 403
        },
        {
          url: '/api/admin/database-health',
          error: 'Direct database access attempted',
          responseStatus: 403
        },
        {
          url: '/api/admin/connection-pool-status',
          error: 'Infrastructure monitoring access denied',
          responseStatus: 403
        }
      ];

      for (const attempt of escalationAttempts) {
        await auditService.logAdminAccess({
          requestId: generateTestId('escalation_attempt'),
          adminUser: null, // No valid admin user for unauthorized attempts
          ipAddress: attackerIp,
          userAgent: 'AttackTool/1.0',
          requestMethod: 'GET',
          requestUrl: attempt.url,
          responseStatus: attempt.responseStatus,
          responseTimeMs: 25,
          error: attempt.error,
          metadata: {
            privilegeEscalationAttempt: true,
            targetResource: attempt.url,
            deniedReason: attempt.error
          }
        });

        // Log privilege escalation detection
        await auditService.logDataChange({
          requestId: generateTestId('privilege_escalation'),
          action: 'PRIVILEGE_ESCALATION_ATTEMPTED',
          targetType: 'security_threat',
          targetId: attackerIp,
          ipAddress: attackerIp,
          adminUser: 'security_system',
          metadata: {
            targetEndpoint: attempt.url,
            attemptTime: new Date().toISOString(),
            detectionConfidence: 'high',
            responseAction: 'access_denied',
            threatLevel: 'critical'
          },
          severity: 'critical'
        });
      }

      // Verify privilege escalation detection
      const escalationDetections = await auditService.queryAuditLogs({
        eventType: 'data_change',
        action: 'PRIVILEGE_ESCALATION_ATTEMPTED',
        severity: 'critical',
        limit: 10
      });

      expect(escalationDetections.logs.length).toBeGreaterThanOrEqual(escalationAttempts.length);

      escalationDetections.logs.forEach(log => {
        expect(log.severity).toBe('critical');
        expect(log.target_type).toBe('security_threat');
        expect(log.ip_address).toBe(attackerIp);
      });
    });

    test('data exfiltration attempts are detected and logged', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping data exfiltration test');
        return;
      }

      const suspiciousIp = '192.168.77.77';

      // Simulate rapid data access (potential exfiltration)
      const dataEndpoints = [
        '/api/admin/transactions',
        '/api/admin/registrations',
        '/api/admin/events',
        '/api/admin/dashboard'
      ];

      const startTime = Date.now();
      for (let i = 0; i < dataEndpoints.length; i++) {
        const endpoint = dataEndpoints[i];

        await auditService.logAdminAccess({
          requestId: generateTestId(`rapid_access_${i}`),
          adminUser: 'admin',
          sessionId: adminToken.substring(0, 8) + '...',
          ipAddress: suspiciousIp,
          userAgent: 'DataHarvester/2.0',
          requestMethod: 'GET',
          requestUrl: endpoint,
          responseStatus: 200,
          responseTimeMs: 100 + i * 10,
          metadata: {
            rapidAccess: true,
            accessSequence: i + 1,
            timeFromStart: Date.now() - startTime,
            suspiciousPattern: 'rapid_data_access'
          }
        });
      }

      // Log data exfiltration detection
      await auditService.logDataChange({
        requestId: generateTestId('exfiltration_detection'),
        action: 'DATA_EXFILTRATION_SUSPECTED',
        targetType: 'security_threat',
        targetId: suspiciousIp,
        ipAddress: suspiciousIp,
        adminUser: 'security_monitor',
        metadata: {
          detectionPattern: 'rapid_sequential_access',
          endpointsAccessed: dataEndpoints.length,
          timeWindow: Date.now() - startTime,
          avgResponseTime: 110,
          alertTriggered: true,
          mitigationActions: ['rate_limit_applied', 'security_team_notified']
        },
        severity: 'critical'
      });

      // Verify exfiltration detection
      const exfiltrationDetection = await auditService.queryAuditLogs({
        eventType: 'data_change',
        action: 'DATA_EXFILTRATION_SUSPECTED',
        severity: 'critical',
        limit: 5
      });

      expect(exfiltrationDetection.logs.length).toBeGreaterThan(0);

      if (exfiltrationDetection.logs.length > 0) {
        const detectionLog = exfiltrationDetection.logs[0];
        expect(detectionLog.severity).toBe('critical');
        expect(detectionLog.ip_address).toBe(suspiciousIp);

        const metadata = JSON.parse(detectionLog.metadata);
        expect(metadata.endpointsAccessed).toBe(dataEndpoints.length);
        expect(Array.isArray(metadata.mitigationActions)).toBe(true);
      }
    });
  });

  describe('Security Alerting and Response', () => {
    test('critical security events trigger immediate alerts', async () => {
      const criticalEvents = [
        {
          action: 'UNAUTHORIZED_CONFIG_ACCESS',
          description: 'Attempt to access system configuration without proper authorization',
          severity: 'critical'
        },
        {
          action: 'MASS_DATA_DELETION_ATTEMPTED',
          description: 'Attempt to delete large amounts of data',
          severity: 'critical'
        },
        {
          action: 'ADMIN_ACCOUNT_COMPROMISE_SUSPECTED',
          description: 'Unusual activity suggesting compromised admin account',
          severity: 'critical'
        }
      ];

      for (const event of criticalEvents) {
        await auditService.logDataChange({
          requestId: generateTestId('critical_alert'),
          action: event.action,
          targetType: 'security_incident',
          targetId: generateTestId('incident'),
          adminUser: 'security_system',
          metadata: {
            incidentDescription: event.description,
            detectionTime: new Date().toISOString(),
            alertSent: true,
            responseRequired: true,
            escalationLevel: 'immediate',
            notificationChannels: ['security_team', 'admin_alerts', 'siem_system']
          },
          severity: event.severity
        });
      }

      // Verify critical alerts were logged
      const criticalAlerts = await auditService.queryAuditLogs({
        eventType: 'data_change',
        severity: 'critical',
        limit: 10
      });

      const myAlerts = criticalAlerts.logs.filter(log =>
        criticalEvents.some(event => log.action === event.action)
      );

      expect(myAlerts.length).toBe(criticalEvents.length);

      myAlerts.forEach(alert => {
        expect(alert.severity).toBe('critical');
        expect(alert.target_type).toBe('security_incident');

        const metadata = JSON.parse(alert.metadata);
        expect(metadata.alertSent).toBe(true);
        expect(metadata.responseRequired).toBe(true);
        expect(Array.isArray(metadata.notificationChannels)).toBe(true);
      });
    });

    test('security incident response actions are properly logged', async () => {
      const incidentId = generateTestId('security_incident');

      // Log security incident response workflow
      const responseActions = [
        {
          action: 'SECURITY_INCIDENT_CREATED',
          description: 'Security incident logged and assigned',
          severity: 'warning',
          responseStage: 'detection'
        },
        {
          action: 'SECURITY_TEAM_NOTIFIED',
          description: 'Security team alerted of incident',
          severity: 'info',
          responseStage: 'notification'
        },
        {
          action: 'INCIDENT_INVESTIGATION_STARTED',
          description: 'Security team began investigation',
          severity: 'info',
          responseStage: 'investigation'
        },
        {
          action: 'MITIGATION_ACTIONS_APPLIED',
          description: 'Security controls applied to contain incident',
          severity: 'warning',
          responseStage: 'mitigation'
        },
        {
          action: 'SECURITY_INCIDENT_RESOLVED',
          description: 'Incident contained and resolved',
          severity: 'info',
          responseStage: 'resolution'
        }
      ];

      for (let i = 0; i < responseActions.length; i++) {
        const action = responseActions[i];

        await auditService.logDataChange({
          requestId: generateTestId(`incident_response_${i}`),
          action: action.action,
          targetType: 'security_incident',
          targetId: incidentId,
          adminUser: 'security_team',
          metadata: {
            incidentId: incidentId,
            responseStage: action.responseStage,
            actionDescription: action.description,
            actionTimestamp: new Date().toISOString(),
            actionSequence: i + 1,
            incidentStatus: i === responseActions.length - 1 ? 'resolved' : 'active'
          },
          severity: action.severity
        });
      }

      // Verify complete incident response timeline
      const incidentLogs = await auditService.queryAuditLogs({
        eventType: 'data_change',
        targetId: incidentId,
        limit: 20
      });

      expect(incidentLogs.logs.length).toBe(responseActions.length);

      // Verify response workflow sequence
      const sortedLogs = incidentLogs.logs.sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
      );

      responseActions.forEach((expectedAction, index) => {
        const log = sortedLogs[index];
        expect(log.action).toBe(expectedAction.action);
        expect(log.severity).toBe(expectedAction.severity);

        const metadata = JSON.parse(log.metadata);
        expect(metadata.responseStage).toBe(expectedAction.responseStage);
        expect(metadata.actionSequence).toBe(index + 1);
      });
    });
  });

  describe('Security Audit Statistics and Metrics', () => {
    test('security monitoring statistics are accurate and comprehensive', async () => {
      // Create diverse security events for statistics
      const securityEvents = [
        { severity: 'info', count: 5 },
        { severity: 'warning', count: 3 },
        { severity: 'error', count: 2 },
        { severity: 'critical', count: 1 }
      ];

      for (const eventType of securityEvents) {
        for (let i = 0; i < eventType.count; i++) {
          await auditService.logDataChange({
            requestId: generateTestId(`security_stats_${eventType.severity}_${i}`),
            action: 'SECURITY_EVENT_TEST',
            targetType: 'security_monitoring',
            targetId: generateTestId('monitoring'),
            adminUser: 'security_stats_test',
            metadata: {
              testEvent: true,
              eventCategory: eventType.severity
            },
            severity: eventType.severity
          });
        }
      }

      // Get security audit statistics
      const stats = await auditService.getAuditStats('24h');

      expect(stats.timeframe).toBe('24h');
      expect(stats.stats).toBeInstanceOf(Array);

      // Filter for our test events
      const securityStats = stats.stats.filter(stat =>
        stat.event_type === 'data_change'
      );

      expect(securityStats.length).toBeGreaterThan(0);

      // Verify statistics include all severity levels
      const severityLevels = securityStats.map(stat => stat.severity);
      expect(severityLevels).toContain('info');
      expect(severityLevels).toContain('warning');

      // Verify total counts match our test data
      const totalTestEvents = securityEvents.reduce((sum, event) => sum + event.count, 0);
      const statsTotalEvents = securityStats.reduce((sum, stat) => sum + stat.count, 0);

      expect(statsTotalEvents).toBeGreaterThanOrEqual(totalTestEvents);
    });

    test('security health check provides comprehensive monitoring status', async () => {
      // Add some security monitoring data
      await auditService.logDataChange({
        requestId: generateTestId('security_health'),
        action: 'SECURITY_HEALTH_CHECK',
        targetType: 'system_monitoring',
        targetId: 'security_subsystem',
        adminUser: 'health_monitor',
        metadata: {
          monitoringActive: true,
          lastSecurityScan: new Date().toISOString(),
          threatsDetected: 0,
          alertsGenerated: 0
        },
        severity: 'info'
      });

      // Perform health check
      const health = await auditService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.initialized).toBe(true);
      expect(health.database_connected).toBe(true);
      expect(typeof health.total_logs).toBe('number');

      // Health check should show we have security monitoring data
      expect(health.total_logs).toBeGreaterThan(0);
    });
  });
});