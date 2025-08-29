import {
  getHealthChecker,
  HealthStatus,
  formatHealthResponse,
} from "../../lib/monitoring/health-checker.js";
import { checkDatabaseHealth } from "./database.js";
import { checkStripeHealth } from "./stripe.js";
import { checkBrevoHealth } from "./brevo.js";
import { checkAnalyticsHealth } from "./analytics.js";
import {
  initSentry,
  addBreadcrumb,
} from "../../lib/monitoring/sentry-config.js";

// Initialize Sentry on cold start
initSentry();

/**
 * Register all health checks with the orchestrator
 */
function registerHealthChecks() {
  const healthChecker = getHealthChecker();

  // Register database health check (critical) with more resilient circuit breaker
  healthChecker.registerCheck("database", checkDatabaseHealth, {
    critical: true,
    timeout: 5000,
    weight: 2,
    circuitBreaker: {
      threshold: 5, // Increased from 2 to 5 failures
      timeout: 30000, // Decreased from 60000ms to 30000ms
    },
  });

  // Register Stripe health check (critical for payments)
  healthChecker.registerCheck("stripe", checkStripeHealth, {
    critical: true,
    timeout: 5000,
    weight: 2,
    circuitBreaker: {
      threshold: 3,
      timeout: 30000, // 30 seconds
    },
  });

  // Register Brevo email health check (high priority)
  healthChecker.registerCheck("brevo", checkBrevoHealth, {
    critical: false,
    timeout: 5000,
    weight: 1,
    circuitBreaker: {
      threshold: 5,
      timeout: 30000, // 30 seconds
    },
  });

  // Register Google Sheets analytics health check (medium priority)
  healthChecker.registerCheck("google_sheets", checkAnalyticsHealth, {
    critical: false,
    timeout: 5000,
    weight: 0.5,
    circuitBreaker: {
      threshold: 5,
      timeout: 60000, // 1 minute
    },
  });
}

/**
 * Calculate overall system health score
 */
function calculateHealthScore(health) {
  let score = 100;
  const services = health.services || {};

  // Deduct points based on service status and weight
  const weights = {
    database: 30,
    stripe: 30,
    brevo: 20,
    google_sheets: 10,
  };

  Object.entries(services).forEach(([service, status]) => {
    const weight = weights[service] || 10;

    if (status.status === HealthStatus.UNHEALTHY) {
      score -= weight;
    } else if (status.status === HealthStatus.DEGRADED) {
      score -= weight * 0.5;
    }
  });

  // Additional deductions for performance issues
  const avgResponseTime =
    parseFloat(health.performance?.avg_response_time) || 0;
  if (avgResponseTime > 2000) {
    score -= 5;
  } else if (avgResponseTime > 1000) {
    score -= 2;
  }

  return Math.max(0, Math.round(score));
}

/**
 * Get system recommendations based on health status
 */
function getHealthRecommendations(health) {
  const recommendations = [];
  const services = health.services || {};

  // Check database
  if (services.database?.status === HealthStatus.UNHEALTHY) {
    recommendations.push({
      severity: "critical",
      service: "database",
      action: "Check database connectivity and migrations",
    });
  }

  // Check Stripe
  if (services.stripe?.status === HealthStatus.UNHEALTHY) {
    recommendations.push({
      severity: "critical",
      service: "stripe",
      action: "Verify Stripe API key and webhook configuration",
    });
  } else if (
    services.stripe?.details?.warnings?.includes("API rate limit approaching")
  ) {
    recommendations.push({
      severity: "warning",
      service: "stripe",
      action: "Monitor Stripe API usage to avoid rate limits",
    });
  }

  // Check Brevo
  if (services.brevo?.status === HealthStatus.DEGRADED) {
    const details = services.brevo.details || {};
    if (details.account?.quota_usage_percent > 90) {
      recommendations.push({
        severity: "warning",
        service: "brevo",
        action: "Email quota approaching limit - consider upgrading plan",
      });
    }
  }

  // Check Google Sheets
  if (services.google_sheets?.status === HealthStatus.UNHEALTHY) {
    recommendations.push({
      severity: "info",
      service: "google_sheets",
      action: "Check Google Sheets API credentials and spreadsheet ID",
    });
  }

  // Performance recommendations
  const avgResponseTime =
    parseFloat(health.performance?.avg_response_time) || 0;
  if (avgResponseTime > 2000) {
    recommendations.push({
      severity: "warning",
      service: "performance",
      action: "High average response time detected - investigate slow services",
    });
  }

  return recommendations;
}

/**
 * Main health check handler
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Quick non-blocking health check option
  if (req.query?.quick === "true") {
    const now = new Date().toISOString();
    return res.status(200).json({
      status: "healthy",
      service: "a-lo-cubano-boulder-fest",
      timestamp: now,
      uptime: process.uptime(),
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "development",
      message: "Quick health check - no external services tested"
    });
  }

  try {
    // Add breadcrumb for monitoring
    addBreadcrumb({
      category: "health-check",
      message: "Health check initiated",
      level: "info",
      data: {
        path: req.url,
        query: req.query,
      },
    });

    // Register health checks if not already registered
    registerHealthChecks();

    // Get health checker instance
    const healthChecker = getHealthChecker();

    // Check if specific service is requested
    const service = req.query?.service;

    let health;

    if (service) {
      // Check specific service
      try {
        const serviceHealth = await healthChecker.checkService(service);
        health = {
          status: serviceHealth.status,
          timestamp: new Date().toISOString(),
          service: service,
          ...serviceHealth,
        };
      } catch (error) {
        return res.status(404).json({
          error: `Service '${service}' not found`,
          available_services: ["database", "stripe", "brevo", "google_sheets"],
        });
      }
    } else {
      // Execute all health checks
      health = await healthChecker.executeAll();

      // Add health score
      health.health_score = calculateHealthScore(health);

      // Add recommendations if there are issues
      if (health.status !== HealthStatus.HEALTHY) {
        health.recommendations = getHealthRecommendations(health);
      }

      // Add circuit breaker states if any are open
      const circuitStates = healthChecker.getCircuitBreakerStates();
      const openBreakers = Object.entries(circuitStates).filter(
        ([_, state]) => state.state !== "closed",
      );

      if (openBreakers.length > 0) {
        health.circuit_breakers = Object.fromEntries(openBreakers);
      }
    }

    // Format response
    const { statusCode, headers, body } = formatHealthResponse(health);

    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Add custom headers
    res.setHeader("X-Health-Score", health.health_score ?? "N/A");
    res.setHeader("X-Health-Status", health.status);

    // Log health check result
    if (health.status === HealthStatus.UNHEALTHY) {
      console.error("Health check failed:", health);
    } else if (health.status === HealthStatus.DEGRADED) {
      console.warn("Health check degraded:", health);
    }

    // Send response
    res.status(statusCode).json(body);
  } catch (error) {
    console.error("Health check error:", error);

    // Add error breadcrumb
    addBreadcrumb({
      category: "health-check",
      message: "Health check failed",
      level: "error",
      data: {
        error: error.message,
      },
    });

    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      error: "Health check system failure",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}