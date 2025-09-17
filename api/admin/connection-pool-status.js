/**
 * Connection Pool Status API Endpoint
 *
 * Provides real-time status and metrics for the database connection pool
 * for monitoring and debugging purposes
 */

import { getConnectionManager, getPoolStatistics, getPoolHealthStatus } from '../../lib/connection-manager.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({
        error: 'Method not allowed',
        allowedMethods: ['GET']
      });
    }

    // Initialize connection manager before use
    getConnectionManager();

    // Get comprehensive pool information
    const [statistics, health] = await Promise.all([
      getPoolStatistics(),
      getPoolHealthStatus()
    ]);

    // Calculate additional derived metrics
    const derivedMetrics = {
      utilizationPercentage: statistics.pool ?
        (statistics.pool.activeLeases / statistics.pool.maxConnections) * 100 : 0,

      successRate: statistics.metrics ?
        (statistics.metrics.totalLeasesGranted - statistics.metrics.connectionCreationErrors) /
        Math.max(statistics.metrics.totalLeasesGranted, 1) * 100 : 100,

      averageLeaseAge: statistics.activeLeases ?
        statistics.activeLeases.reduce((sum, lease) => sum + lease.ageMs, 0) /
        statistics.activeLeases.length : 0,

      poolEfficiency: statistics.metrics ?
        statistics.metrics.totalLeasesReleased /
        Math.max(statistics.metrics.totalLeasesGranted, 1) * 100 : 0
    };

    // Compile response
    const response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      connectionPool: {
        health: health.status,
        state: statistics.state,
        issues: health.issues || [],
        statistics,
        derivedMetrics,
        recommendations: generateRecommendations(statistics, health, derivedMetrics)
      }
    };

    // Set appropriate cache headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json(response);

  } catch (error) {
    logger.error('Connection pool status API error:', error.message);

    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve connection pool status',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Generate recommendations based on pool statistics and health
 */
function generateRecommendations(statistics, health, derivedMetrics) {
  const recommendations = [];

  // High utilization warning
  if (derivedMetrics.utilizationPercentage > 80) {
    recommendations.push({
      type: 'warning',
      message: 'High connection pool utilization detected',
      suggestion: 'Consider increasing maxConnections or optimizing query performance',
      priority: 'high'
    });
  }

  // Low success rate
  if (derivedMetrics.successRate < 95) {
    recommendations.push({
      type: 'error',
      message: 'Low connection success rate detected',
      suggestion: 'Check database connectivity and network stability',
      priority: 'critical'
    });
  }

  // Long-running leases
  if (derivedMetrics.averageLeaseAge > 30000) { // 30 seconds
    recommendations.push({
      type: 'warning',
      message: 'Long-running database operations detected',
      suggestion: 'Review and optimize slow queries, consider shorter lease timeouts',
      priority: 'medium'
    });
  }

  // Low efficiency
  if (derivedMetrics.poolEfficiency < 98) {
    recommendations.push({
      type: 'info',
      message: 'Some leases are not being properly released',
      suggestion: 'Ensure all database operations use proper try/finally blocks',
      priority: 'medium'
    });
  }

  // Health issues
  if (health.status === 'unhealthy') {
    recommendations.push({
      type: 'error',
      message: 'Connection pool health check failed',
      suggestion: 'Check database server status and connection configuration',
      priority: 'critical'
    });
  }

  // No active connections (potential issue)
  if (statistics.pool && statistics.pool.totalConnections === 0) {
    recommendations.push({
      type: 'warning',
      message: 'No active database connections',
      suggestion: 'Database may not be properly initialized or accessible',
      priority: 'high'
    });
  }

  // Performance optimization suggestions
  if (statistics.metrics && statistics.metrics.totalConnectionsCreated > statistics.pool?.maxConnections * 2) {
    recommendations.push({
      type: 'info',
      message: 'Frequent connection creation detected',
      suggestion: 'Connection reuse could be improved, consider adjusting pool configuration',
      priority: 'low'
    });
  }

  return recommendations;
}
