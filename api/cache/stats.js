/**
 * Cache Statistics API - A Lo Cubano Boulder Fest
 * Provides comprehensive cache performance analytics and monitoring
 *
 * Features:
 * - Hit/miss ratios across cache layers
 * - Memory usage statistics
 * - TTL analysis and expiration tracking
 * - Performance metrics and trends
 * - Cache effectiveness scoring
 * - Multi-tier cache insights
 * - Admin authentication required
 */

import authService from "../../lib/auth-service.js";
import { getCacheService } from "../../lib/cache-service.js";
import { getCache } from "../../lib/cache/index.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";

// Rate limiting: max 20 stats requests per minute per admin
const rateLimitMap = new Map();
const MAX_STATS_REQUESTS = 20;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(adminId) {
  const now = Date.now();
  const key = `stats_${adminId}`;
  const window = rateLimitMap.get(key) || {
    count: 0,
    resetTime: now + RATE_LIMIT_WINDOW
  };

  if (now > window.resetTime) {
    window.count = 1;
    window.resetTime = now + RATE_LIMIT_WINDOW;
  } else {
    window.count++;
  }

  rateLimitMap.set(key, window);

  return {
    allowed: window.count <= MAX_STATS_REQUESTS,
    remaining: Math.max(0, MAX_STATS_REQUESTS - window.count),
    resetTime: window.resetTime
  };
}

/**
 * Calculate cache effectiveness score based on hit ratios and performance
 */
function calculateEffectivenessScore(stats) {
  const { overall } = stats;

  let score = 0;
  const maxScore = 100;

  // Hit ratio scoring (40 points max)
  const hitRatio = parseFloat(overall.overallHitRatio?.replace('%', '') || '0');
  score += Math.min(40, (hitRatio / 100) * 40);

  // Memory vs Redis distribution (20 points max)
  const totalHits = overall.l1Hits + overall.l2Hits;
  if (totalHits > 0) {
    const memoryRatio = overall.l1Hits / totalHits;
    // Optimal memory ratio is around 70-80%
    const optimalMemoryRatio = 0.75;
    const memoryScore =
      20 -
      (Math.abs(memoryRatio - optimalMemoryRatio) * 20) / optimalMemoryRatio;
    score += Math.max(0, memoryScore);
  }

  // Promotion effectiveness (20 points max)
  if (overall.promotions > 0 && overall.l2Hits > 0) {
    const promotionRatio = overall.promotions / overall.l2Hits;
    // Good promotion ratio is 10-30%
    if (promotionRatio >= 0.1 && promotionRatio <= 0.3) {
      score += 20;
    } else {
      score += Math.max(0, 20 - Math.abs(promotionRatio - 0.2) * 100);
    }
  }

  // Fallback rate penalty (20 points max, deducted for high fallbacks)
  const totalRequests = overall.totalRequests || 1;
  const fallbackRatio = overall.fallbacks / totalRequests;
  score += Math.max(0, 20 - fallbackRatio * 200); // Penalty for > 10% fallbacks

  return {
    score: Math.round(score),
    maxScore,
    grade:
      score >= 90
        ? 'A'
        : score >= 80
          ? 'B'
          : score >= 70
            ? 'C'
            : score >= 60
              ? 'D'
              : 'F',
    factors: {
      hitRatio: hitRatio,
      memoryDistribution:
        totalHits > 0
          ? ((overall.l1Hits / totalHits) * 100).toFixed(1) + '%'
          : 'N/A',
      promotionRate:
        overall.l2Hits > 0
          ? ((overall.promotions / overall.l2Hits) * 100).toFixed(1) + '%'
          : 'N/A',
      fallbackRate: (fallbackRatio * 100).toFixed(2) + '%'
    }
  };
}

/**
 * Analyze TTL distribution and expiration patterns
 */
function analyzeTtlPatterns(stats) {
  const analysis = {
    avgTtl: 'N/A',
    expirationPrediction: 'N/A',
    recommendations: []
  };

  // TTL analysis would require more detailed cache inspection
  // For now, provide general recommendations based on stats
  const { overall } = stats;

  if (overall.misses > overall.l1Hits + overall.l2Hits) {
    analysis.recommendations.push(
      'High miss rate - consider increasing TTL values'
    );
  }

  if (overall.l1Hits < overall.l2Hits) {
    analysis.recommendations.push(
      'Low L1 cache utilization - consider adjusting promotion thresholds'
    );
  }

  if (overall.fallbacks > overall.totalRequests * 0.05) {
    analysis.recommendations.push(
      'High Redis fallback rate - check Redis connectivity'
    );
  }

  return analysis;
}

/**
 * Generate performance insights and recommendations
 */
function generateInsights(stats, effectiveness) {
  const insights = {
    performance: 'good',
    alerts: [],
    recommendations: [],
    trends: []
  };

  const { overall } = stats;

  // Performance assessment
  if (effectiveness.score < 60) {
    insights.performance = 'poor';
    insights.alerts.push('Cache effectiveness below acceptable threshold');
  } else if (effectiveness.score < 80) {
    insights.performance = 'fair';
  } else if (effectiveness.score >= 90) {
    insights.performance = 'excellent';
  }

  // Generate specific recommendations
  if (parseFloat(overall.overallHitRatio?.replace('%', '') || '0') < 70) {
    insights.recommendations.push({
      priority: 'high',
      category: 'hit_ratio',
      description: 'Low hit ratio detected',
      action: 'Review cache key patterns and TTL settings'
    });
  }

  if (overall.fallbacks > overall.totalRequests * 0.02) {
    insights.recommendations.push({
      priority: 'medium',
      category: 'reliability',
      description: 'High Redis fallback rate',
      action: 'Check Redis connection stability'
    });
  }

  if (overall.promotions === 0 && overall.l2Hits > 0) {
    insights.recommendations.push({
      priority: 'low',
      category: 'optimization',
      description: 'No L2 to L1 promotions occurring',
      action: 'Review promotion threshold settings'
    });
  }

  // Memory usage insights
  if (
    stats.memory?.memoryUsageMB &&
    parseFloat(stats.memory.memoryUsageMB) > stats.memory.maxMemoryMB * 0.9
  ) {
    insights.alerts.push('Memory cache near capacity limit');
    insights.recommendations.push({
      priority: 'high',
      category: 'capacity',
      description: 'Memory cache approaching limit',
      action: 'Consider increasing memory limit or reducing TTL'
    });
  }

  return insights;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authentication check
    const sessionToken = authService.getSessionFromRequest(req);
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const verification = await authService.verifySessionToken(sessionToken);
    if (!verification.valid) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const adminId = verification.admin.id;

    // Rate limiting check
    const rateLimit = checkRateLimit(adminId);
    if (!rateLimit.allowed) {
      res.setHeader(
        'Retry-After',
        Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
      );
      res.setHeader('X-RateLimit-Limit', MAX_STATS_REQUESTS);
      res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
      res.setHeader(
        'X-RateLimit-Reset',
        new Date(rateLimit.resetTime).toISOString()
      );
      return res.status(429).json({
        error: 'Rate limit exceeded',
        remaining: rateLimit.remaining,
        resetTime: new Date(rateLimit.resetTime).toISOString()
      });
    }

    // Parse query parameters
    const {
      detailed = 'false', // Include detailed breakdown by namespace
      historical = 'false', // Include historical trends (if available)
      format = 'json' // Response format: 'json' or 'summary'
    } = req.query;

    console.log(`[CACHE-STATS] Admin ${adminId} requesting cache statistics`);

    // Get cache service and statistics
    const cacheService = getCacheService();
    const cache = await cacheService.ensureInitialized();

    let baseStats = {};

    // Get base statistics from cache
    if (typeof cache.getStats === 'function') {
      baseStats = await cache.getStats();
    } else {
      // Fallback for caches without getStats
      baseStats = {
        overall: {
          l1Hits: 0,
          l2Hits: 0,
          misses: 0,
          totalHits: 0,
          totalRequests: 0,
          overallHitRatio: '0%',
          promotions: 0,
          fallbacks: 0,
          uptime: Date.now() - (Date.now() - 3600000), // Assume 1 hour uptime
          redisAvailable: false
        },
        memory: {
          size: 0,
          maxSize: 500,
          memoryUsageMB: 0,
          maxMemoryMB: 50,
          hitRatio: '0%'
        },
        redis: null
      };
    }

    // Calculate effectiveness score
    const effectiveness = calculateEffectivenessScore(baseStats);

    // Analyze TTL patterns
    const ttlAnalysis = analyzeTtlPatterns(baseStats);

    // Generate insights and recommendations
    const insights = generateInsights(baseStats, effectiveness);

    // Build response
    let response = {
      timestamp: new Date().toISOString(),
      adminId,
      summary: {
        status: baseStats.overall?.redisAvailable
          ? 'multi-tier'
          : 'memory-only',
        hitRatio: baseStats.overall?.overallHitRatio || '0%',
        totalRequests: baseStats.overall?.totalRequests || 0,
        uptime: formatUptime(baseStats.overall?.uptime || 0),
        effectiveness: effectiveness
      },
      performance: {
        l1Cache: {
          hits: baseStats.overall?.l1Hits || 0,
          hitRatio: baseStats.memory?.hitRatio || '0%',
          memoryUsage: `${baseStats.memory?.memoryUsageMB || 0}MB / ${baseStats.memory?.maxMemoryMB || 50}MB`,
          utilization: baseStats.memory?.maxMemoryMB
            ? `${((parseFloat(baseStats.memory.memoryUsageMB || 0) / baseStats.memory.maxMemoryMB) * 100).toFixed(1)}%`
            : '0%'
        },
        l2Cache: baseStats.redis
          ? {
            hits: baseStats.overall?.l2Hits || 0,
            available: baseStats.overall?.redisAvailable || false,
            promotions: baseStats.overall?.promotions || 0,
            fallbacks: baseStats.overall?.fallbacks || 0
          }
          : null
      },
      analysis: {
        ttl: ttlAnalysis,
        insights,
        recommendations: insights.recommendations
      }
    };

    // Add detailed breakdown if requested
    if (detailed === 'true') {
      response.detailed = {
        rawStats: baseStats,
        namespaceBreakdown: 'Not implemented yet',
        keyPatterns: 'Not implemented yet'
      };
    }

    // Add historical data if requested and available
    if (historical === 'true') {
      response.historical = {
        note: 'Historical data collection not implemented',
        trends: []
      };
    }

    // Format response based on requested format
    if (format === 'summary') {
      response = {
        status: response.summary.status,
        hitRatio: response.summary.hitRatio,
        effectiveness: effectiveness.grade,
        alerts: insights.alerts,
        timestamp: response.timestamp
      };
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader(
      'X-RateLimit-Reset',
      new Date(rateLimit.resetTime).toISOString()
    );

    // Cache the stats response briefly to avoid overwhelming cache system
    res.setHeader('Cache-Control', 'private, max-age=30');

    return res.status(200).json(response);
  } catch (error) {
    console.error('[CACHE-STATS] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Cache statistics retrieval failed'
    });
  }
}

/**
 * Format uptime milliseconds into human-readable string
 */
function formatUptime(uptimeMs) {
  if (!uptimeMs || uptimeMs <= 0) {
    return '0s';
  }

  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export default withSecurityHeaders(handler);

// Export utility functions for testing
export {
  calculateEffectivenessScore,
  analyzeTtlPatterns,
  generateInsights,
  formatUptime,
  checkRateLimit
};
