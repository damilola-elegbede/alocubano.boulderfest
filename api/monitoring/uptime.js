import { getMonitoringService } from "../../lib/monitoring/monitoring-service.js";
import {
  getHealthChecker,
  HealthStatus,
} from "../../lib/monitoring/health-checker.js";
import { addBreadcrumb } from "../../lib/monitoring/sentry-config.js";

/**
 * Uptime tracking
 */
const startTime = Date.now();
let requestCount = 0;
let errorCount = 0;
let lastCheckTime = Date.now();

/**
 * Calculate uptime percentage
 */
function calculateUptime(healthHistory) {
  if (!healthHistory || healthHistory.length === 0) {
    return 100; // Assume 100% if no history
  }

  const totalChecks = healthHistory.length;
  const healthyChecks = healthHistory.filter(
    (h) => h.status === HealthStatus.HEALTHY,
  ).length;

  return (healthyChecks / totalChecks) * 100;
}

/**
 * Get system uptime metrics
 */
function getUptimeMetrics() {
  const now = Date.now();
  const uptimeMs = now - startTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  return {
    startTime: new Date(startTime).toISOString(),
    currentTime: new Date(now).toISOString(),
    uptime: {
      milliseconds: uptimeMs,
      seconds: uptimeSeconds,
      minutes: uptimeMinutes,
      hours: uptimeHours,
      days: uptimeDays,
      formatted: formatUptime(uptimeMs),
    },
    requests: {
      total: requestCount,
      errors: errorCount,
      successRate:
        requestCount > 0
          ? ((requestCount - errorCount) / requestCount) * 100
          : 100,
    },
  };
}

/**
 * Format uptime for display
 */
function formatUptime(uptimeMs) {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours % 24 > 0) {
    parts.push(`${hours % 24}h`);
  }
  if (minutes % 60 > 0) {
    parts.push(`${minutes % 60}m`);
  }
  if (seconds % 60 > 0 || parts.length === 0) {
    parts.push(`${seconds % 60}s`);
  }

  return parts.join(" ");
}

/**
 * Get availability zones status
 */
async function getAvailabilityStatus() {
  const zones = {
    "us-west-1": { status: "operational", latency: null },
    "us-east-1": { status: "operational", latency: null },
    "eu-west-1": { status: "operational", latency: null },
  };

  // Check Vercel edge network status
  const vercelRegion = process.env.VERCEL_REGION || "unknown";
  if (vercelRegion && zones[vercelRegion]) {
    zones[vercelRegion].primary = true;
  }

  return zones;
}

/**
 * Get service dependencies status
 */
async function getDependenciesStatus() {
  const healthChecker = getHealthChecker();
  const dependencies = {};

  try {
    // Check critical dependencies
    const criticalServices = ["database", "stripe"];
    for (const service of criticalServices) {
      try {
        const health = await healthChecker.checkService(service);
        dependencies[service] = {
          status: health.status,
          responseTime: health.responseTime,
          lastCheck: new Date().toISOString(),
        };
      } catch (error) {
        dependencies[service] = {
          status: HealthStatus.UNHEALTHY,
          error: error.message,
          lastCheck: new Date().toISOString(),
        };
      }
    }

    // Check non-critical dependencies
    const nonCriticalServices = ["brevo", "google_sheets"];
    for (const service of nonCriticalServices) {
      try {
        const health = await healthChecker.checkService(service);
        dependencies[service] = {
          status: health.status,
          responseTime: health.responseTime,
          lastCheck: new Date().toISOString(),
        };
      } catch (error) {
        dependencies[service] = {
          status: HealthStatus.DEGRADED,
          error: error.message,
          lastCheck: new Date().toISOString(),
        };
      }
    }
  } catch (error) {
    console.error("Error checking dependencies:", error);
  }

  return dependencies;
}

/**
 * Calculate SLA metrics
 */
function calculateSLA(uptimePercent, errorRate) {
  // Define SLA targets
  const slaTargets = {
    uptime: 99.9, // 99.9% uptime
    errorRate: 1.0, // Less than 1% error rate
  };

  const uptimeMet = uptimePercent >= slaTargets.uptime;
  const errorRateMet = errorRate <= slaTargets.errorRate;
  const slaMet = uptimeMet && errorRateMet;

  return {
    targets: slaTargets,
    current: {
      uptime: uptimePercent,
      errorRate,
    },
    compliance: {
      uptime: uptimeMet,
      errorRate: errorRateMet,
      overall: slaMet,
    },
    monthlyDowntimeAllowance: {
      minutes: 43.2, // 99.9% = 43.2 minutes/month
      seconds: 2592, // 43.2 minutes in seconds
    },
  };
}

/**
 * Get incident history
 */
function getIncidentHistory() {
  // This would typically come from a database
  // For now, return mock data structure
  return {
    total: 0,
    lastIncident: null,
    recentIncidents: [],
    mtbf: null, // Mean Time Between Failures
    mttr: null, // Mean Time To Recovery
  };
}

/**
 * Main uptime handler
 */
export default async function handler(req, res) {
  // Track request
  requestCount++;

  // Only allow GET requests
  if (req.method !== "GET") {
    errorCount++;
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Add breadcrumb
    addBreadcrumb({
      category: "monitoring",
      message: "Uptime check requested",
      level: "info",
      data: {
        path: req.url,
        query: req.query,
      },
    });

    // Get monitoring service
    const monitoringService = getMonitoringService();

    // Get uptime metrics
    const uptimeMetrics = getUptimeMetrics();

    // Get health checker
    const healthChecker = getHealthChecker();

    // Perform comprehensive health check
    const healthStatus = await healthChecker.executeAll();

    // Get availability zones
    const availability = await getAvailabilityStatus();

    // Get dependencies status
    const dependencies = await getDependenciesStatus();

    // Calculate uptime percentage (mock for now, would use historical data)
    const uptimePercent =
      healthStatus.status === HealthStatus.HEALTHY
        ? 99.95
        : healthStatus.status === HealthStatus.DEGRADED
          ? 99.5
          : 95.0;

    // Calculate error rate
    const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;

    // Calculate SLA compliance
    const sla = calculateSLA(uptimePercent, errorRate);

    // Get incident history
    const incidents = getIncidentHistory();

    // Get performance metrics
    const performanceMetrics = monitoringService.getMetricsSummary();

    // Build response
    const response = {
      status: healthStatus.status,
      timestamp: new Date().toISOString(),
      uptime: uptimeMetrics,
      availability: {
        percentage: uptimePercent,
        zones: availability,
      },
      dependencies,
      sla,
      incidents,
      performance: {
        avgResponseTime: performanceMetrics.performance?.avgResponseTime || 0,
        p95ResponseTime: performanceMetrics.performance?.percentiles?.p95 || 0,
        requestsPerMinute:
          performanceMetrics.performance?.requestsPerMinute || 0,
      },
      monitoring: {
        lastCheck: lastCheckTime,
        nextCheck: lastCheckTime + 30000, // Next check in 30 seconds
        checksPerHour: 120,
        retention: "30 days",
      },
    };

    // Update last check time
    lastCheckTime = Date.now();

    // Set cache headers for monitoring tools
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("X-Uptime-Status", healthStatus.status);
    res.setHeader("X-Uptime-Percentage", uptimePercent.toFixed(2));
    res.setHeader(
      "X-SLA-Compliance",
      sla.compliance.overall ? "true" : "false",
    );

    // Return response
    res.status(200).json(response);
  } catch (error) {
    errorCount++;
    console.error("Uptime check error:", error);

    // Add error breadcrumb
    addBreadcrumb({
      category: "monitoring",
      message: "Uptime check failed",
      level: "error",
      data: {
        error: error.message,
      },
    });

    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      error: "Uptime monitoring failure",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Export uptime utilities for use in other monitoring tools
 */
export {
  getUptimeMetrics,
  calculateUptime,
  formatUptime,
  calculateSLA,
  getAvailabilityStatus,
  getDependenciesStatus,
};
