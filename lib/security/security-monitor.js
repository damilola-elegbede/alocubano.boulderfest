/**
 * Security Monitor Module
 * Real-time monitoring and analysis of security events
 */

/**
 * Security Monitor Class - Singleton pattern
 */
class SecurityMonitor {
  constructor() {
    this.isInitialized = false;
    this.metrics = {
      apiCalls: new Map(),
      violations: new Map(),
      blockedIPs: new Set(),
      suspiciousPatterns: new Map()
    };
    this.thresholds = {
      maxRequestsPerMinute: 60,
      maxViolationsPerHour: 10,
      maxFailedAuthAttempts: 5
    };
  }

  /**
   * Initialize the security monitor
   */
  async initialize() {
    if (this.isInitialized) return;

    // Set up periodic cleanup
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 5 * 60 * 1000); // Every 5 minutes

    this.isInitialized = true;
  }

  /**
   * Monitor API activity
   * @param {string} clientIP - Client IP address
   * @param {string} endpoint - API endpoint
   * @param {number} statusCode - HTTP status code
   * @param {number} responseTime - Response time in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  monitorAPIActivity(clientIP, endpoint, statusCode, responseTime, metadata = {}) {
    const timestamp = Date.now();
    const key = `${clientIP}:${endpoint}`;

    if (!this.metrics.apiCalls.has(key)) {
      this.metrics.apiCalls.set(key, []);
    }

    this.metrics.apiCalls.get(key).push({
      timestamp,
      statusCode,
      responseTime,
      violations: metadata.violations || [],
      riskScore: metadata.riskScore || 0,
      requestId: metadata.requestId
    });

    // Trigger analysis for suspicious patterns
    this.analyzeActivityPattern(clientIP, endpoint);
  }

  /**
   * Record a security violation
   * @param {string} clientIP - Client IP address
   * @param {string} violationType - Type of violation
   * @param {Object} details - Violation details
   */
  recordViolation(clientIP, violationType, details = {}) {
    const timestamp = Date.now();
    const key = `${clientIP}:${violationType}`;

    if (!this.metrics.violations.has(key)) {
      this.metrics.violations.set(key, []);
    }

    this.metrics.violations.get(key).push({
      timestamp,
      details,
      severity: this.getSeverityScore(violationType)
    });

    // Check if IP should be blocked
    this.evaluateIPForBlocking(clientIP);
  }

  /**
   * Analyze activity patterns for anomalies
   * @param {string} clientIP - Client IP address
   * @param {string} endpoint - API endpoint
   */
  analyzeActivityPattern(clientIP, endpoint) {
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);
    const key = `${clientIP}:${endpoint}`;

    const recentActivity = this.metrics.apiCalls.get(key)?.filter(
      activity => activity.timestamp > oneMinuteAgo
    ) || [];

    // Check for excessive requests
    if (recentActivity.length > this.thresholds.maxRequestsPerMinute) {
      this.recordViolation(clientIP, 'excessive_requests', {
        endpoint,
        requestCount: recentActivity.length,
        timeWindow: '1 minute'
      });
    }

    // Check for high error rates
    const errorCount = recentActivity.filter(
      activity => activity.statusCode >= 400
    ).length;

    if (errorCount > 10 && errorCount / recentActivity.length > 0.5) {
      this.recordViolation(clientIP, 'high_error_rate', {
        endpoint,
        errorCount,
        totalRequests: recentActivity.length,
        errorRate: errorCount / recentActivity.length
      });
    }
  }

  /**
   * Evaluate if an IP should be blocked
   * @param {string} clientIP - Client IP address
   */
  evaluateIPForBlocking(clientIP) {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Count recent violations
    let violationCount = 0;
    let totalSeverity = 0;

    for (const [key, violations] of this.metrics.violations.entries()) {
      if (key.startsWith(clientIP + ':')) {
        const recentViolations = violations.filter(
          v => v.timestamp > oneHourAgo
        );
        violationCount += recentViolations.length;
        totalSeverity += recentViolations.reduce(
          (sum, v) => sum + v.severity, 0
        );
      }
    }

    // Block if too many violations or high severity score
    if (violationCount > this.thresholds.maxViolationsPerHour || totalSeverity > 100) {
      this.blockIP(clientIP, {
        reason: 'excessive_violations',
        violationCount,
        totalSeverity,
        timestamp: now
      });
    }
  }

  /**
   * Block an IP address
   * @param {string} clientIP - IP address to block
   * @param {Object} reason - Reason for blocking
   */
  blockIP(clientIP, reason) {
    this.metrics.blockedIPs.add(clientIP);

    console.warn('[IP BLOCKED]', {
      clientIP,
      reason,
      timestamp: new Date().toISOString()
    });

    // In production, this would also update your firewall/WAF
    // await updateFirewallRules(clientIP, 'block');
  }

  /**
   * Check if an IP is blocked
   * @param {string} clientIP - IP address to check
   * @returns {boolean} True if IP is blocked
   */
  isIPBlocked(clientIP) {
    return this.metrics.blockedIPs.has(clientIP);
  }

  /**
   * Get severity score for violation type
   * @param {string} violationType - Type of violation
   * @returns {number} Severity score (0-100)
   */
  getSeverityScore(violationType) {
    const severityMap = {
      'sql_injection_attempt': 90,
      'command_injection_attempt': 85,
      'path_traversal_attempt': 70,
      'xss_attempt': 60,
      'excessive_requests': 40,
      'high_error_rate': 30,
      'suspicious_user_agent': 20
    };

    return severityMap[violationType] || 10;
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  cleanupOldMetrics() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    // Clean up API calls
    for (const [key, activities] of this.metrics.apiCalls.entries()) {
      const recentActivities = activities.filter(
        activity => activity.timestamp > oneDayAgo
      );

      if (recentActivities.length === 0) {
        this.metrics.apiCalls.delete(key);
      } else {
        this.metrics.apiCalls.set(key, recentActivities);
      }
    }

    // Clean up violations
    for (const [key, violations] of this.metrics.violations.entries()) {
      const recentViolations = violations.filter(
        violation => violation.timestamp > oneDayAgo
      );

      if (recentViolations.length === 0) {
        this.metrics.violations.delete(key);
      } else {
        this.metrics.violations.set(key, recentViolations);
      }
    }
  }

  /**
   * Get current security metrics
   * @returns {Object} Current security metrics
   */
  getMetrics() {
    return {
      activeSessions: this.metrics.apiCalls.size,
      totalViolations: Array.from(this.metrics.violations.values())
        .reduce((sum, violations) => sum + violations.length, 0),
      blockedIPs: this.metrics.blockedIPs.size,
      suspiciousPatterns: this.metrics.suspiciousPatterns.size
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get the security monitor instance
 * @returns {SecurityMonitor} Security monitor singleton
 */
export function getSecurityMonitor() {
  if (!instance) {
    instance = new SecurityMonitor();
    instance.initialize();
  }
  return instance;
}

export default { getSecurityMonitor };
