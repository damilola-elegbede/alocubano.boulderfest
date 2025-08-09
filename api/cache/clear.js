import { getMemoryCache } from '../../lib/cache/memory-cache.js';
import { getRedisCache } from '../../lib/cache/redis-cache.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin authentication
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { namespace, pattern, type } = req.body || {};
    const results = {
      memory: { cleared: false, message: '' },
      redis: { cleared: false, message: '' },
      timestamp: new Date().toISOString(),
    };

    // Clear memory cache
    if (!type || type === 'memory' || type === 'all') {
      const memCache = getMemoryCache(namespace || 'default');
      
      if (pattern) {
        const keys = memCache.getKeys();
        const matchingKeys = keys.filter(key => 
          new RegExp(pattern.replace('*', '.*')).test(key)
        );
        const deleted = memCache.deleteMany(matchingKeys);
        
        results.memory.cleared = true;
        results.memory.message = `Cleared ${deleted} keys matching pattern ${pattern}`;
        results.memory.keysCleared = deleted;
      } else if (namespace) {
        // Clear specific namespace
        const cleared = memCache.clear();
        results.memory.cleared = cleared;
        results.memory.message = cleared 
          ? `Cleared all keys in namespace ${namespace}`
          : `Failed to clear namespace ${namespace}`;
      } else {
        // Clear all memory caches
        const cacheTypes = ['default', 'api', 'database', 'computed', 'session', 'static'];
        let totalCleared = 0;
        
        for (const cacheType of cacheTypes) {
          const cache = getMemoryCache(cacheType);
          if (cache.clear()) {
            totalCleared++;
          }
        }
        
        results.memory.cleared = true;
        results.memory.message = `Cleared ${totalCleared} memory cache instances`;
        results.memory.instancesCleared = totalCleared;
      }
    }

    // Clear Redis cache
    if (!type || type === 'redis' || type === 'all') {
      const redisCache = getRedisCache();
      
      if (redisCache.connected) {
        if (pattern && namespace) {
          const cleared = await redisCache.invalidatePattern(pattern, namespace);
          results.redis.cleared = true;
          results.redis.message = `Cleared ${cleared} Redis keys matching pattern ${pattern} in namespace ${namespace}`;
          results.redis.keysCleared = cleared;
        } else if (namespace) {
          const cleared = await redisCache.clearNamespace(namespace);
          results.redis.cleared = true;
          results.redis.message = `Cleared ${cleared} keys in Redis namespace ${namespace}`;
          results.redis.keysCleared = cleared;
        } else {
          // Clear all Redis namespaces
          const namespaces = ['default', 'static', 'dynamic', 'session', 'analytics', 'api', 'tickets', 'queries'];
          let totalCleared = 0;
          
          for (const ns of namespaces) {
            const cleared = await redisCache.clearNamespace(ns);
            totalCleared += cleared;
          }
          
          results.redis.cleared = true;
          results.redis.message = `Cleared ${totalCleared} keys across all Redis namespaces`;
          results.redis.totalKeysCleared = totalCleared;
        }
      } else {
        results.redis.message = 'Redis not connected';
      }
    }

    // Log cache clear event
    console.log('Cache cleared:', {
      namespace,
      pattern,
      type,
      results,
      requestedBy: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    });

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    return res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message,
    });
  }
}