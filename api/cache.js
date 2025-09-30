/**
 * Unified Cache Management API - A Lo Cubano Boulder Fest
 * Consolidated endpoint for all cache operations: stats, warming, and clearing
 *
 * Endpoints:
 * - GET /api/cache - Get cache statistics and metrics
 * - POST /api/cache - Perform cache operations (warm, clear)
 * - DELETE /api/cache - Clear cache (shorthand for POST with clear action)
 *
 * Features:
 * - Comprehensive cache statistics and analytics
 * - Cache warming with intelligent strategies
 * - Pattern-based and selective cache clearing
 * - Google Drive cache management
 * - Admin authentication required
 * - Rate limiting protection
 * - Audit logging with detailed operations
 */

import authService from "../lib/auth-service.js";
import { getCacheService } from "../lib/cache-service.js";
import { getCache, CACHE_TYPES } from "../lib/cache/index.js";
import { withSecurityHeaders } from "../lib/security-headers.js";
import {
  getGoogleDriveService,
  clearGoogleDriveCache,
  getGoogleDriveMetrics
} from "../lib/google-drive-service.js";

// Rate limiting configuration per operation type
const rateLimitMap = new Map();
const RATE_LIMITS = {
  stats: { max: 20, window: 60 * 1000 }, // 20 per minute
  warm: { max: 5, window: 10 * 60 * 1000 }, // 5 per 10 minutes
  clear: { max: 10, window: 60 * 1000 } // 10 per minute
};

/**
 * Check rate limit for specific operation type
 */
function checkRateLimit(adminId, operation) {
  const config = RATE_LIMITS[operation];
  if (!config) {
    return { allowed: true, remaining: 999, resetTime: Date.now() + 60000 };
  }

  const now = Date.now();
  const key = `${operation}_${adminId}`;
  const window = rateLimitMap.get(key) || {
    count: 0,
    resetTime: now + config.window
  };

  if (now > window.resetTime) {
    window.count = 1;
    window.resetTime = now + config.window;
  } else {
    window.count++;
  }

  rateLimitMap.set(key, window);

  return {
    allowed: window.count <= config.max,
    remaining: Math.max(0, config.max - window.count),
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
    const optimalMemoryRatio = 0.75;
    const memoryScore = 20 - (Math.abs(memoryRatio - optimalMemoryRatio) * 20) / optimalMemoryRatio;
    score += Math.max(0, memoryScore);
  }

  // Promotion effectiveness (20 points max)
  if (overall.promotions > 0 && overall.l2Hits > 0) {
    const promotionRatio = overall.promotions / overall.l2Hits;
    if (promotionRatio >= 0.1 && promotionRatio <= 0.3) {
      score += 20;
    } else {
      score += Math.max(0, 20 - Math.abs(promotionRatio - 0.2) * 100);
    }
  }

  // Fallback rate penalty (20 points max, deducted for high fallbacks)
  const totalRequests = overall.totalRequests || 1;
  const fallbackRatio = overall.fallbacks / totalRequests;
  score += Math.max(0, 20 - fallbackRatio * 200);

  return {
    score: Math.round(score),
    maxScore,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    factors: {
      hitRatio: hitRatio,
      memoryDistribution: totalHits > 0 ? ((overall.l1Hits / totalHits) * 100).toFixed(1) + '%' : 'N/A',
      promotionRate: overall.l2Hits > 0 ? ((overall.promotions / overall.l2Hits) * 100).toFixed(1) + '%' : 'N/A',
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

  const { overall } = stats;

  if (overall.misses > overall.l1Hits + overall.l2Hits) {
    analysis.recommendations.push('High miss rate - consider increasing TTL values');
  }

  if (overall.l1Hits < overall.l2Hits) {
    analysis.recommendations.push('Low L1 cache utilization - consider adjusting promotion thresholds');
  }

  if (overall.fallbacks > overall.totalRequests * 0.05) {
    analysis.recommendations.push('High Redis fallback rate - check Redis connectivity');
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
  if (stats.memory?.memoryUsageMB && parseFloat(stats.memory.memoryUsageMB) > stats.memory.maxMemoryMB * 0.9) {
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

/**
 * Generate critical event data for warming
 */
async function getEventWarmingData() {
  return {
    'event:boulder-fest-2026': {
      name: 'A Lo Cubano Boulder Fest 2026',
      dates: 'May 15-17, 2026',
      location: 'Avalon Ballroom, Boulder, CO',
      status: 'upcoming',
      timezone: 'America/Denver',
      capacity: 500,
      lastUpdated: new Date().toISOString()
    },
    'tickets:config': {
      earlyBird: { price: 125, available: true, limit: 100, description: 'Early Bird Special' },
      regular: { price: 150, available: true, limit: 300, description: 'Regular Admission' },
      vip: { price: 250, available: true, limit: 50, description: 'VIP Experience' },
      workshop: { price: 75, available: true, limit: 100, description: 'Workshop Access' }
    },
    'artists:featured': ['Maykel Fonts', 'Dayme y El High', 'Chacal', 'El Micha', 'Gente de Zona', 'Jacob Forever'],
    'schedule:highlights': {
      friday: { '19:00': 'Opening Ceremony', '20:00': 'Maykel Fonts Performance', '22:00': 'Social Dancing' },
      saturday: { '10:00': 'Workshop Sessions', '14:00': 'Lunch Break', '16:00': 'Artist Panels', '20:00': 'Main Show', '23:00': 'Late Night Social' },
      sunday: { '10:00': 'Final Workshops', '14:00': 'Closing Ceremony', '16:00': 'Farewell Social' }
    }
  };
}

/**
 * Generate ticket availability data for warming
 */
async function getTicketWarmingData() {
  return {
    'tickets:availability:earlybird': { total: 100, sold: 45, remaining: 55, price: 125, status: 'available' },
    'tickets:availability:regular': { total: 300, sold: 125, remaining: 175, price: 150, status: 'available' },
    'tickets:availability:vip': { total: 50, sold: 32, remaining: 18, price: 250, status: 'low_stock' },
    'tickets:availability:workshop': { total: 100, sold: 67, remaining: 33, price: 75, status: 'available' }
  };
}

/**
 * Generate gallery data for warming
 */
async function getGalleryWarmingData() {
  return {
    'gallery:years': ['2023', '2024', '2025', '2026'],
    'gallery:featured:2025': [
      { id: 'photo_001', title: 'Opening Night Magic', year: '2025', featured: true, thumbnail: 'https://drive.google.com/thumbnail?id=example1' },
      { id: 'photo_002', title: 'Dance Floor Energy', year: '2025', featured: true, thumbnail: 'https://drive.google.com/thumbnail?id=example2' }
    ],
    'gallery:stats:2025': { totalPhotos: 247, totalVideos: 18, categories: ['performances', 'workshops', 'social', 'backstage'], lastUpdated: new Date().toISOString() }
  };
}

/**
 * Generate analytics data for warming
 */
async function getAnalyticsWarmingData() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    'analytics:config': { trackingEnabled: true, sampleRate: 0.1, endpoints: ['tickets', 'gallery', 'subscribe', 'artists'], retentionDays: 90 },
    [`analytics:daily:${yesterday.toISOString().split('T')[0]}`]: { pageViews: 1247, uniqueVisitors: 892, ticketSales: 23, bounceRate: 0.35, avgSessionDuration: 180 },
    'analytics:popular_pages': [
      { path: '/tickets', views: 2341, conversions: 89 },
      { path: '/artists', views: 1876, conversions: 12 },
      { path: '/gallery', views: 1654, conversions: 5 },
      { path: '/schedule', views: 987, conversions: 3 }
    ]
  };
}

/**
 * Handle GET requests - Cache statistics
 */
async function handleGetStats(req, res, adminId) {
  const rateLimit = checkRateLimit(adminId, 'stats');
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil((rateLimit.resetTime - Date.now()) / 1000));
    res.setHeader('X-RateLimit-Limit', RATE_LIMITS.stats.max);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());
    return res.status(429).json({
      error: 'Rate limit exceeded',
      remaining: rateLimit.remaining,
      resetTime: new Date(rateLimit.resetTime).toISOString()
    });
  }

  const { detailed = 'false', historical = 'false', format = 'json', type } = req.query;

  console.log(`[CACHE] Admin ${adminId} requesting cache statistics (type: ${type || 'general'})`);

  // Handle Google Drive cache stats
  if (type === 'google-drive') {
    const metrics = getGoogleDriveMetrics();
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());
    res.setHeader('Cache-Control', 'private, max-age=30');

    return res.status(200).json({
      action: 'status',
      type: 'google-drive',
      cache: {
        size: metrics.cacheSize,
        hitRatio: metrics.cacheHitRatio,
        hits: metrics.cacheHits,
        misses: metrics.cacheMisses
      },
      metrics,
      api: {
        version: '1.0',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local'
      }
    });
  }

  // Get general cache statistics
  const cacheService = getCacheService();
  const cache = await cacheService.ensureInitialized();

  let baseStats = {};

  if (typeof cache.getStats === 'function') {
    baseStats = await cache.getStats();
  } else {
    baseStats = {
      overall: {
        l1Hits: 0, l2Hits: 0, misses: 0, totalHits: 0, totalRequests: 0,
        overallHitRatio: '0%', promotions: 0, fallbacks: 0,
        uptime: Date.now() - (Date.now() - 3600000), redisAvailable: false
      },
      memory: { size: 0, maxSize: 500, memoryUsageMB: 0, maxMemoryMB: 50, hitRatio: '0%' },
      redis: null
    };
  }

  const effectiveness = calculateEffectivenessScore(baseStats);
  const ttlAnalysis = analyzeTtlPatterns(baseStats);
  const insights = generateInsights(baseStats, effectiveness);

  let response = {
    timestamp: new Date().toISOString(),
    adminId,
    summary: {
      status: baseStats.overall?.redisAvailable ? 'multi-tier' : 'memory-only',
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
      l2Cache: baseStats.redis ? {
        hits: baseStats.overall?.l2Hits || 0,
        available: baseStats.overall?.redisAvailable || false,
        promotions: baseStats.overall?.promotions || 0,
        fallbacks: baseStats.overall?.fallbacks || 0
      } : null
    },
    analysis: {
      ttl: ttlAnalysis,
      insights,
      recommendations: insights.recommendations
    }
  };

  if (detailed === 'true') {
    response.detailed = {
      rawStats: baseStats,
      namespaceBreakdown: 'Not implemented yet',
      keyPatterns: 'Not implemented yet'
    };
  }

  if (historical === 'true') {
    response.historical = { note: 'Historical data collection not implemented', trends: [] };
  }

  if (format === 'summary') {
    response = {
      status: response.summary.status,
      hitRatio: response.summary.hitRatio,
      effectiveness: effectiveness.grade,
      alerts: insights.alerts,
      timestamp: response.timestamp
    };
  }

  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());
  res.setHeader('Cache-Control', 'private, max-age=30');

  return res.status(200).json(response);
}

/**
 * Handle POST requests - Cache operations (warm/clear)
 */
async function handlePostOperations(req, res, adminId) {
  const body = req.body || {};
  const { action, type } = body;

  // Handle Google Drive cache operations
  if (type === 'google-drive') {
    if (action === 'warm') {
      const rateLimit = checkRateLimit(adminId, 'warm');
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          remaining: rateLimit.remaining,
          resetTime: new Date(rateLimit.resetTime).toISOString()
        });
      }

      const { year, eventId, maxResults = 100 } = body;

      try {
        const googleDriveService = getGoogleDriveService();
        const data = await googleDriveService.fetchImages({
          year,
          eventId,
          maxResults: parseInt(maxResults, 10)
        });

        const warmedMetrics = getGoogleDriveMetrics();

        res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
        res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

        return res.status(200).json({
          action: 'warmed',
          type: 'google-drive',
          success: true,
          message: 'Google Drive cache warmed successfully',
          data: {
            itemsFetched: data.totalCount,
            source: data.source,
            categories: Object.keys(data.categories || {})
          },
          cache: {
            size: warmedMetrics.cacheSize,
            hitRatio: warmedMetrics.cacheHitRatio
          },
          api: {
            version: '1.0',
            timestamp: new Date().toISOString(),
            adminId
          }
        });
      } catch (warmupError) {
        return res.status(500).json({
          action: 'warmed',
          type: 'google-drive',
          success: false,
          message: 'Google Drive cache warmup failed',
          error: warmupError.message
        });
      }
    }

    return res.status(400).json({
      error: 'Invalid action for Google Drive cache',
      validActions: ['warm']
    });
  }

  // Route to warming or clearing handlers
  if (action === 'warm') {
    return handleWarmCache(req, res, adminId, body);
  } else if (action === 'clear') {
    return handleClearCache(req, res, adminId, body);
  }

  return res.status(400).json({
    error: 'Invalid action',
    validActions: ['warm', 'clear'],
    message: 'Specify action=warm or action=clear in request body'
  });
}

/**
 * Handle cache warming operation
 */
async function handleWarmCache(req, res, adminId, body) {
  const rateLimit = checkRateLimit(adminId, 'warm');
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      remaining: rateLimit.remaining,
      resetTime: new Date(rateLimit.resetTime).toISOString()
    });
  }

  let {
    sections = ['all'],
    priority = 'normal',
    dryRun = false,
    force = false
  } = body;

  if (typeof sections === 'string') {
    sections = [sections];
  } else if (!Array.isArray(sections)) {
    sections = ['all'];
  }

  dryRun = Boolean(dryRun);
  force = Boolean(force);

  console.log(`[CACHE-WARM] Admin ${adminId} initiated warming for sections:`, sections);

  const cacheService = getCacheService();
  const cache = await cacheService.ensureInitialized();

  const result = {
    success: false,
    action: 'warm',
    sections,
    priority,
    warmedCount: 0,
    operations: [],
    dryRun,
    force,
    timestamp: new Date().toISOString(),
    adminId,
    progress: { total: 0, completed: 0, failed: 0 }
  };

  const ttlMap = { low: 1800, normal: 3600, high: 7200 };
  const warmTtl = ttlMap[priority] || ttlMap.normal;

  const sectionsToProcess = sections.includes('all')
    ? ['event', 'tickets', 'gallery', 'analytics']
    : sections;

  let totalOperations = 0;

  for (const section of sectionsToProcess) {
    try {
      let warmingData = {};
      let namespace = section;
      let cacheType = CACHE_TYPES.STATIC;

      switch (section) {
      case 'event':
        warmingData = await getEventWarmingData();
        namespace = 'event';
        cacheType = CACHE_TYPES.STATIC;
        break;
      case 'tickets':
        warmingData = await getTicketWarmingData();
        namespace = 'tickets';
        cacheType = CACHE_TYPES.DYNAMIC;
        break;
      case 'gallery':
        warmingData = await getGalleryWarmingData();
        namespace = 'gallery';
        cacheType = CACHE_TYPES.GALLERY;
        break;
      case 'analytics':
        warmingData = await getAnalyticsWarmingData();
        namespace = 'analytics';
        cacheType = CACHE_TYPES.ANALYTICS;
        break;
      default:
        result.operations.push({
          section,
          status: 'error',
          error: `Unknown section: ${section}`
        });
        result.progress.failed++;
        continue;
      }

      const keys = Object.keys(warmingData);
      totalOperations += keys.length;
      result.progress.total += keys.length;

      if (dryRun) {
        result.operations.push({
          section,
          status: 'preview',
          keysToWarm: keys.length,
          keys: keys.slice(0, 5),
          ttl: warmTtl,
          cacheType
        });
        result.progress.completed += keys.length;
      } else {
        let sectionWarmedCount = 0;

        for (const [key, value] of Object.entries(warmingData)) {
          try {
            if (!force && (await cache.exists(key, { namespace }))) {
              continue;
            }

            const success = await cache.set(key, value, {
              namespace,
              ttl: warmTtl,
              type: cacheType,
              forceMemory: priority === 'high'
            });

            if (success) {
              sectionWarmedCount++;
              result.progress.completed++;
            }
          } catch (keyError) {
            console.warn(`[CACHE-WARM] Failed to warm key ${key}:`, keyError);
            result.progress.failed++;
          }
        }

        result.operations.push({
          section,
          status: 'completed',
          warmedKeys: sectionWarmedCount,
          totalKeys: keys.length,
          ttl: warmTtl,
          cacheType,
          namespace
        });

        result.warmedCount += sectionWarmedCount;
      }
    } catch (sectionError) {
      console.error(`[CACHE-WARM] Error warming section ${section}:`, sectionError);
      result.operations.push({
        section,
        status: 'error',
        error: sectionError.message
      });
      result.progress.failed++;
    }
  }

  result.success = true;
  result.progress.total = totalOperations;

  console.log(`[CACHE-WARM] Admin ${adminId} completed warming:`, {
    sections: sectionsToProcess,
    warmedCount: result.warmedCount,
    priority,
    dryRun
  });

  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

  return res.status(200).json(result);
}

/**
 * Handle cache clearing operation
 */
async function handleClearCache(req, res, adminId, body) {
  const rateLimit = checkRateLimit(adminId, 'clear');
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      remaining: rateLimit.remaining,
      resetTime: new Date(rateLimit.resetTime).toISOString()
    });
  }

  const {
    action = 'selective',
    pattern,
    namespace,
    cacheType,
    dryRun = false,
    reason = 'Manual admin clear',
    type
  } = body;

  console.log(`[CACHE-CLEAR] Admin ${adminId} initiated ${action} clear operation (type: ${type || 'general'})`);

  // Handle Google Drive cache clearing
  if (type === 'google-drive') {
    clearGoogleDriveCache();
    const clearedMetrics = getGoogleDriveMetrics();

    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

    return res.status(200).json({
      action: 'cleared',
      type: 'google-drive',
      success: true,
      message: 'Google Drive cache cleared successfully',
      cache: {
        size: clearedMetrics.cacheSize,
        hitRatio: clearedMetrics.cacheHitRatio
      },
      api: {
        version: '1.0',
        timestamp: new Date().toISOString(),
        adminId,
        reason
      }
    });
  }

  // Handle general cache clearing
  const cacheService = getCacheService();
  const cache = await cacheService.ensureInitialized();

  const result = {
    success: false,
    action,
    clearedCount: 0,
    operations: [],
    dryRun,
    timestamp: new Date().toISOString(),
    adminId,
    reason
  };

  switch (action) {
  case 'all':
    if (dryRun) {
      result.operations.push({
        type: 'all_caches',
        description: 'Would clear all cache layers (memory + Redis)',
        estimated: 'All cached data'
      });
    } else {
      if (typeof cache.flushAll === 'function') {
        await cache.flushAll();
        result.clearedCount = 'all';
      } else {
        const namespaces = ['gallery', 'tickets', 'api-responses', 'sessions', 'analytics', 'payments', 'counters'];
        let totalCleared = 0;

        for (const ns of namespaces) {
          try {
            const cleared = await cache.delPattern('*', { namespace: ns });
            totalCleared += cleared;
            result.operations.push({ type: 'namespace_clear', namespace: ns, cleared });
          } catch (error) {
            result.operations.push({ type: 'namespace_clear_error', namespace: ns, error: error.message });
          }
        }

        result.clearedCount = totalCleared;
      }
    }
    result.success = true;
    break;

  case 'pattern':
    if (!pattern) {
      return res.status(400).json({ error: 'Pattern is required for pattern clearing' });
    }

    if (typeof pattern !== 'string') {
      return res.status(400).json({ error: 'Pattern must be a string' });
    }

    if (pattern.length > 2048) {
      return res.status(400).json({ error: 'Pattern exceeds maximum length of 2048 characters' });
    }

    const safePatternRegex = /^[\w\-:*?/.[\]]+$/;
    if (!safePatternRegex.test(pattern)) {
      return res.status(400).json({
        error: 'Pattern contains invalid characters. Only alphanumeric characters, hyphens, underscores, colons, asterisks, question marks, forward slashes, dots, and square brackets are allowed.'
      });
    }

    if (dryRun) {
      result.operations.push({
        type: 'pattern_clear',
        pattern,
        description: `Would clear keys matching pattern: ${pattern}`,
        namespace: namespace || 'all'
      });
    } else {
      const cleared = await cache.delPattern(pattern, { namespace });
      result.clearedCount = cleared;
      result.operations.push({
        type: 'pattern_clear',
        pattern,
        namespace: namespace || 'global',
        cleared
      });
    }
    result.success = true;
    break;

  case 'namespace':
    if (!namespace) {
      return res.status(400).json({ error: 'Namespace is required for namespace clearing' });
    }

    if (dryRun) {
      result.operations.push({
        type: 'namespace_clear',
        namespace,
        description: `Would clear all keys in namespace: ${namespace}`
      });
    } else {
      if (typeof cache.flushNamespace === 'function') {
        const cleared = await cache.flushNamespace(namespace);
        result.clearedCount = cleared;
      } else {
        const cleared = await cache.delPattern('*', { namespace });
        result.clearedCount = cleared;
      }

      result.operations.push({
        type: 'namespace_clear',
        namespace,
        cleared: result.clearedCount
      });
    }
    result.success = true;
    break;

  case 'selective': {
    const operations = [];
    let totalCleared = 0;

    if (cacheType) {
      const typeNamespaceMap = {
        gallery: 'gallery',
        tickets: 'tickets',
        sessions: 'sessions',
        analytics: 'analytics',
        payments: 'payments',
        api: 'api-responses'
      };

      const targetNamespace = typeNamespaceMap[cacheType];
      if (!targetNamespace) {
        return res.status(400).json({
          error: 'Invalid cache type',
          validTypes: Object.keys(typeNamespaceMap)
        });
      }

      if (dryRun) {
        operations.push({
          type: 'selective_clear',
          cacheType,
          namespace: targetNamespace,
          description: `Would clear ${cacheType} cache`
        });
      } else {
        const cleared = await cache.delPattern('*', { namespace: targetNamespace });
        totalCleared += cleared;
        operations.push({
          type: 'selective_clear',
          cacheType,
          namespace: targetNamespace,
          cleared
        });
      }
    } else {
      const namespaces = ['gallery', 'tickets', 'api-responses', 'sessions', 'analytics'];

      for (const ns of namespaces) {
        if (dryRun) {
          operations.push({
            type: 'expired_clear',
            namespace: ns,
            description: `Would clear expired entries in ${ns}`
          });
        } else {
          operations.push({
            type: 'expired_check',
            namespace: ns,
            note: 'Expired entry clearing not implemented yet'
          });
        }
      }
    }

    result.clearedCount = totalCleared;
    result.operations = operations;
    result.success = true;
    break;
  }

  default:
    return res.status(400).json({
      error: 'Invalid action',
      validActions: ['all', 'pattern', 'namespace', 'selective']
    });
  }

  console.log(`[CACHE-CLEAR] Admin ${adminId} completed ${action} operation:`, {
    clearedCount: result.clearedCount,
    operations: result.operations.length,
    dryRun,
    reason
  });

  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

  return res.status(200).json(result);
}

/**
 * Handle DELETE requests - Clear cache (shorthand)
 */
async function handleDelete(req, res, adminId) {
  const { type } = req.query;

  // Redirect to POST handler with clear action
  return handleClearCache(req, res, adminId, {
    action: 'all',
    type,
    reason: 'Admin DELETE request'
  });
}

/**
 * Main request handler
 */
async function handler(req, res) {
  try {
    // Authentication check for all methods
    const sessionToken = authService.getSessionFromRequest(req);
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const verification = await authService.verifySessionToken(sessionToken);
    if (!verification.valid) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const adminId = verification.admin.id;

    // Route by HTTP method
    switch (req.method) {
    case 'GET':
      return await handleGetStats(req, res, adminId);
    case 'POST':
      return await handlePostOperations(req, res, adminId);
    case 'DELETE':
      return await handleDelete(req, res, adminId);
    default:
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[CACHE] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Cache operation failed'
    });
  }
}

export default withSecurityHeaders(handler);

// Export utility functions for testing
export {
  checkRateLimit,
  calculateEffectivenessScore,
  analyzeTtlPatterns,
  generateInsights,
  formatUptime,
  getEventWarmingData,
  getTicketWarmingData,
  getGalleryWarmingData,
  getAnalyticsWarmingData
};