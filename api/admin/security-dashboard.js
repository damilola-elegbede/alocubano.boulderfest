/**
 * Admin Security Dashboard API
 * Provides comprehensive security monitoring data for admin panel
 */

import authService from "../../lib/auth-service.js";
import adminSessionMonitor from "../../lib/admin-session-monitor.js";
import securityAlertService from "../../lib/security-alert-service.js";
import auditService from "../../lib/audit-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withActivityAudit } from "../../lib/admin-audit-middleware.js";

async function securityDashboardHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Verify admin authentication
    const session = await authService.verifySessionFromRequest(req);
    if (!session.valid) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const timeframe = parseInt(req.query.timeframe) || 24; // Default 24 hours

    // Ensure all services are initialized to prevent race conditions before parallel operations
    if (adminSessionMonitor.ensureInitialized) {
      await adminSessionMonitor.ensureInitialized();
    }
    if (securityAlertService.ensureInitialized) {
      await securityAlertService.ensureInitialized();
    }
    if (auditService.ensureInitialized) {
      await auditService.ensureInitialized();
    }

    // Gather comprehensive security data in parallel
    const [
      sessionDashboard,
      alertDashboard,
      auditStats,
      sessionHealthCheck,
      alertHealthCheck,
      auditHealthCheck
    ] = await Promise.allSettled([
      adminSessionMonitor.getSessionDashboard(timeframe),
      securityAlertService.getAlertDashboard(timeframe),
      auditService.getAuditStats(timeframe + 'h'),
      adminSessionMonitor.healthCheck(),
      securityAlertService.healthCheck(),
      auditService.healthCheck()
    ]);

    // Process results and handle any errors gracefully
    const dashboard = {
      timeframe: `${timeframe}h`,
      generatedAt: new Date().toISOString(),

      // Session monitoring data
      sessions: sessionDashboard.status === 'fulfilled' ? sessionDashboard.value : {
        error: sessionDashboard.reason?.message || 'Session monitoring unavailable'
      },

      // Security alerts data
      alerts: alertDashboard.status === 'fulfilled' ? alertDashboard.value : {
        error: alertDashboard.reason?.message || 'Alert monitoring unavailable'
      },

      // Audit statistics
      audit: auditStats.status === 'fulfilled' ? auditStats.value : {
        error: auditStats.reason?.message || 'Audit statistics unavailable'
      },

      // Health status
      health: {
        sessionMonitor: sessionHealthCheck.status === 'fulfilled' ? sessionHealthCheck.value : {
          status: 'unhealthy',
          error: sessionHealthCheck.reason?.message
        },
        alertService: alertHealthCheck.status === 'fulfilled' ? alertHealthCheck.value : {
          status: 'unhealthy',
          error: alertHealthCheck.reason?.message
        },
        auditService: auditHealthCheck.status === 'fulfilled' ? auditHealthCheck.value : {
          status: 'unhealthy',
          error: auditHealthCheck.reason?.message
        }
      },

      // Overall security status
      securityStatus: calculateOverallSecurityStatus({
        sessions: sessionDashboard.status === 'fulfilled' ? sessionDashboard.value : null,
        alerts: alertDashboard.status === 'fulfilled' ? alertDashboard.value : null,
        health: {
          sessionMonitor: sessionHealthCheck.status === 'fulfilled' ? sessionHealthCheck.value : null,
          alertService: alertHealthCheck.status === 'fulfilled' ? alertHealthCheck.value : null,
          auditService: auditHealthCheck.status === 'fulfilled' ? auditHealthCheck.value : null
        }
      })
    };

    res.status(200).json(dashboard);

  } catch (error) {
    console.error('[SecurityDashboard] Error generating dashboard:', error);
    res.status(500).json({
      error: 'Failed to generate security dashboard',
      message: error.message
    });
  }
}

/**
 * Calculate overall security status based on all monitoring systems
 */
function calculateOverallSecurityStatus(data) {
  const status = {
    level: 'normal', // normal, warning, critical
    score: 100, // 0-100
    issues: [],
    recommendations: []
  };

  // Check health status
  if (data.health) {
    const healthServices = ['sessionMonitor', 'alertService', 'auditService'];
    const unhealthyServices = healthServices.filter(service =>
      data.health[service]?.status !== 'healthy'
    );

    if (unhealthyServices.length > 0) {
      status.level = 'warning';
      status.score -= unhealthyServices.length * 15;
      status.issues.push(`${unhealthyServices.length} monitoring service(s) unhealthy: ${unhealthyServices.join(', ')}`);
      status.recommendations.push('Check monitoring service logs and restart if necessary');
    }
  }

  // Check active sessions
  if (data.sessions?.activeSessions) {
    const { high_risk_sessions, critical_risk_sessions } = data.sessions.activeSessions;

    if (critical_risk_sessions > 0) {
      status.level = 'critical';
      status.score -= critical_risk_sessions * 20;
      status.issues.push(`${critical_risk_sessions} critical risk session(s) active`);
      status.recommendations.push('Review critical risk sessions immediately');
    } else if (high_risk_sessions > 0) {
      status.level = status.level === 'normal' ? 'warning' : status.level;
      status.score -= high_risk_sessions * 10;
      status.issues.push(`${high_risk_sessions} high risk session(s) active`);
      status.recommendations.push('Monitor high risk sessions closely');
    }
  }

  // Check recent alerts
  if (data.alerts?.alertCounts) {
    const criticalAlerts = data.alerts.alertCounts.filter(alert =>
      alert.severity === 'critical' && alert.status === 'open'
    ).reduce((sum, alert) => sum + alert.count, 0);

    const highAlerts = data.alerts.alertCounts.filter(alert =>
      alert.severity === 'high' && alert.status === 'open'
    ).reduce((sum, alert) => sum + alert.count, 0);

    if (criticalAlerts > 0) {
      status.level = 'critical';
      status.score -= criticalAlerts * 15;
      status.issues.push(`${criticalAlerts} unresolved critical alert(s)`);
      status.recommendations.push('Address critical security alerts immediately');
    } else if (highAlerts > 0) {
      status.level = status.level === 'normal' ? 'warning' : status.level;
      status.score -= highAlerts * 5;
      status.issues.push(`${highAlerts} unresolved high-priority alert(s)`);
      status.recommendations.push('Review and address high-priority alerts');
    }
  }

  // Ensure score doesn't go below 0
  status.score = Math.max(0, status.score);

  // Add positive recommendations if status is good
  if (status.level === 'normal' && status.issues.length === 0) {
    status.recommendations.push('Security monitoring is operating normally');
    status.recommendations.push('Continue regular security review practices');
  }

  return status;
}

// Export with enhanced audit middleware for sensitive admin operations
export default withSecurityHeaders(
  withActivityAudit(securityDashboardHandler, {
    activityType: 'security_dashboard_access',
    trackAccess: true
  })
);