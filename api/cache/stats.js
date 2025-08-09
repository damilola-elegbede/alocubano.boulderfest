import { getMemoryCache } from '../../lib/cache/memory-cache.js';
import { getRedisCache } from '../../lib/cache/redis-cache.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = {
      timestamp: new Date().toISOString(),
      memory: {},
      redis: {},
      overall: {
        totalHits: 0,
        totalMisses: 0,
        totalRequests: 0,
        overallHitRate: 0,
      },
    };

    // Collect memory cache statistics
    const memoryCacheTypes = ['default', 'api', 'database', 'computed', 'session', 'static'];
    stats.memory.instances = {};
    
    for (const cacheType of memoryCacheTypes) {
      const cache = getMemoryCache(cacheType);
      const cacheStats = cache.getCacheStats();
      
      stats.memory.instances[cacheType] = cacheStats;
      stats.overall.totalHits += cacheStats.hits;
      stats.overall.totalMisses += cacheStats.misses;
    }

    // Calculate memory cache totals
    stats.memory.totals = {
      hits: Object.values(stats.memory.instances).reduce((sum, s) => sum + s.hits, 0),
      misses: Object.values(stats.memory.instances).reduce((sum, s) => sum + s.misses, 0),
      keys: Object.values(stats.memory.instances).reduce((sum, s) => sum + s.keys, 0),
      memoryUsageMB: Object.values(stats.memory.instances).reduce((sum, s) => sum + (s.memoryUsageMB || 0), 0),
      evictions: Object.values(stats.memory.instances).reduce((sum, s) => sum + s.evictions, 0),
    };
    
    stats.memory.totals.hitRate = stats.memory.totals.hits + stats.memory.totals.misses > 0
      ? stats.memory.totals.hits / (stats.memory.totals.hits + stats.memory.totals.misses)
      : 0;

    // Collect Redis cache statistics
    const redisCache = getRedisCache();
    
    if (redisCache.connected) {
      const redisStats = redisCache.getCacheStats();
      stats.redis = {
        connected: true,
        stats: redisStats,
      };
      
      stats.overall.totalHits += redisStats.hits;
      stats.overall.totalMisses += redisStats.misses;
      
      // Get Redis server info
      try {
        const client = redisCache.client;
        if (client) {
          const info = await client.info('memory');
          const memoryInfo = parseRedisInfo(info);
          stats.redis.serverInfo = {
            usedMemory: memoryInfo.used_memory_human,
            usedMemoryPeak: memoryInfo.used_memory_peak_human,
            memoryFragmentation: memoryInfo.mem_fragmentation_ratio,
          };
        }
      } catch (error) {
        console.error('Failed to get Redis server info:', error);
      }
    } else {
      stats.redis = {
        connected: false,
        message: 'Redis not connected',
      };
    }

    // Calculate overall statistics
    stats.overall.totalRequests = stats.overall.totalHits + stats.overall.totalMisses;
    stats.overall.overallHitRate = stats.overall.totalRequests > 0
      ? stats.overall.totalHits / stats.overall.totalRequests
      : 0;

    // Add performance recommendations
    stats.recommendations = generateRecommendations(stats);

    // Add cache efficiency score
    stats.efficiencyScore = calculateEfficiencyScore(stats);

    return res.status(200).json(stats);
  } catch (error) {
    console.error('Cache stats error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve cache statistics',
      message: error.message,
    });
  }
}

function parseRedisInfo(info) {
  const result = {};
  const lines = info.split('\r\n');
  
  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        result[key] = value;
      }
    }
  }
  
  return result;
}

function generateRecommendations(stats) {
  const recommendations = [];
  
  // Check overall hit rate
  if (stats.overall.overallHitRate < 0.7) {
    recommendations.push({
      type: 'PERFORMANCE',
      priority: 'HIGH',
      message: `Cache hit rate is ${(stats.overall.overallHitRate * 100).toFixed(1)}%. Consider increasing TTL values or warming cache for frequently accessed data.`,
    });
  }
  
  // Check memory usage
  const totalMemoryMB = stats.memory.totals.memoryUsageMB;
  if (totalMemoryMB > 80) {
    recommendations.push({
      type: 'MEMORY',
      priority: 'MEDIUM',
      message: `Memory cache using ${totalMemoryMB.toFixed(1)}MB. Consider reducing cache size or implementing more aggressive eviction.`,
    });
  }
  
  // Check eviction rate
  const evictionRate = stats.memory.totals.evictions / stats.memory.totals.keys;
  if (evictionRate > 0.3 && stats.memory.totals.keys > 100) {
    recommendations.push({
      type: 'EVICTION',
      priority: 'MEDIUM',
      message: 'High eviction rate detected. Consider increasing cache capacity or optimizing TTL values.',
    });
  }
  
  // Check Redis connectivity
  if (!stats.redis.connected && process.env.REDIS_URL) {
    recommendations.push({
      type: 'CONNECTIVITY',
      priority: 'HIGH',
      message: 'Redis is not connected but URL is configured. Check Redis connection.',
    });
  }
  
  // Check for underutilized caches
  for (const [cacheType, cacheStats] of Object.entries(stats.memory.instances)) {
    if (cacheStats.totalRequests === 0 && cacheType !== 'static') {
      recommendations.push({
        type: 'UTILIZATION',
        priority: 'LOW',
        message: `${cacheType} cache is not being utilized. Consider removing or implementing caching for this type.`,
      });
    }
  }
  
  return recommendations;
}

function calculateEfficiencyScore(stats) {
  let score = 0;
  let weight = 0;
  
  // Hit rate contributes 40% to score
  score += stats.overall.overallHitRate * 40;
  weight += 40;
  
  // Memory efficiency contributes 20%
  const memoryEfficiency = stats.memory.totals.memoryUsageMB < 100 ? 1 : 100 / stats.memory.totals.memoryUsageMB;
  score += memoryEfficiency * 20;
  weight += 20;
  
  // Low eviction rate contributes 20%
  const evictionScore = stats.memory.totals.keys > 0 
    ? Math.max(0, 1 - (stats.memory.totals.evictions / stats.memory.totals.keys))
    : 1;
  score += evictionScore * 20;
  weight += 20;
  
  // Redis connectivity contributes 20%
  if (process.env.REDIS_URL) {
    score += (stats.redis.connected ? 1 : 0) * 20;
    weight += 20;
  } else {
    // If Redis not configured, redistribute weight
    score = (score / weight) * 100;
    return Math.round(score);
  }
  
  return Math.round(score);
}