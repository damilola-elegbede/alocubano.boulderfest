/**
 * Circuit Breaker Status Endpoint
 * Provides real-time monitoring of audit circuit breaker health
 * CRITICAL: Allows monitoring team to see if audit system is healthy
 */

import auditCircuitBreaker from "../../lib/audit-circuit-breaker.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";
import authService from "../../lib/auth-service.js";

async function handler(req, res) {
  // Only allow GET method
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const status = auditCircuitBreaker.getStatus();

    // Add human-readable status
    const healthStatus = {
      ...status,
      healthLevel: getHealthLevel(status),
      recommendations: getRecommendations(status),
      lastChecked: new Date().toISOString()
    };

    // Set appropriate HTTP status based on circuit health
    const httpStatus = status.state === 'OPEN' ? 503 : 200;

    res.status(httpStatus).json({
      service: 'audit-circuit-breaker',
      status: healthStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CircuitBreakerStatus] Error retrieving status:', error);
    res.status(500).json({
      error: 'Failed to retrieve circuit breaker status',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Determine overall health level based on circuit state and metrics
 */
function getHealthLevel(status) {
  if (status.state === 'OPEN') {
    return 'CRITICAL';
  }

  if (status.state === 'HALF_OPEN') {
    return 'WARNING';
  }

  // Check success rate for CLOSED state
  const successRate = parseFloat(status.metrics.successRate);
  const bypassRate = parseFloat(status.metrics.bypassRate);

  if (successRate < 95 || bypassRate > 5) {
    return 'WARNING';
  }

  if (successRate < 99) {
    return 'CAUTION';
  }

  return 'HEALTHY';
}

/**
 * Provide actionable recommendations based on circuit status
 */
function getRecommendations(status) {
  const recommendations = [];

  if (status.state === 'OPEN') {
    recommendations.push('URGENT: Audit system is down - investigate database connectivity');
    recommendations.push('Business operations continue but audit logging is bypassed');
    recommendations.push('Check database health and network connectivity');
  }

  if (status.state === 'HALF_OPEN') {
    recommendations.push('Circuit is testing recovery - monitor closely');
    recommendations.push('Avoid manual interventions during recovery testing');
  }

  const successRate = parseFloat(status.metrics.successRate);
  if (successRate < 95) {
    recommendations.push('Low success rate detected - investigate audit service health');
  }

  const bypassRate = parseFloat(status.metrics.bypassRate);
  if (bypassRate > 10) {
    recommendations.push('High bypass rate - audit system may be unreliable');
  }

  if (status.failures > 0 && status.state === 'CLOSED') {
    recommendations.push('Recent failures detected - monitor for pattern development');
  }

  if (recommendations.length === 0) {
    recommendations.push('Audit circuit breaker is healthy and functioning normally');
  }

  return recommendations;
}

// Wrap with minimal auth - this is a monitoring endpoint
export default withSecurityHeaders(authService.requireAuth(handler));