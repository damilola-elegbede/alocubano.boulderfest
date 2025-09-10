# A Lo Cubano Boulder Fest - Multi-Layer Caching System

## Overview

This comprehensive caching system provides high-performance, scalable caching for the A Lo Cubano Boulder Fest application. It implements a multi-tier architecture with intelligent cache promotion, automatic failover, and optimized TTL management.

## Architecture

### Multi-Tier Design

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │ -> │  Memory Cache   │ -> │   Redis Cache   │
│                 │    │      (L1)       │    │      (L2)       │
│                 │    │   Fast Access   │    │   Distributed   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**L1 (Memory Cache)**:

- Ultra-fast in-memory storage
- LRU eviction strategy
- Size and memory-based limits
- Perfect for hot data

**L2 (Redis Cache)**:

- Distributed caching
- Persistence across deployments
- Pattern-based invalidation
- Connection pooling with retry

## Cache Types & TTL Configuration

| Cache Type  | TTL        | Use Case            | Examples                         |
| ----------- | ---------- | ------------------- | -------------------------------- |
| `STATIC`    | 6 hours    | Event info, artists | Festival details, performer list |
| `DYNAMIC`   | 5 minutes  | Ticket availability | Real-time inventory              |
| `SESSION`   | 1 hour     | User sessions       | Login state, preferences         |
| `ANALYTICS` | 15 minutes | Analytics data      | Dashboard metrics                |
| `API`       | 2 minutes  | API responses       | Cached endpoints                 |
| `GALLERY`   | 24 hours   | Gallery data        | Photo collections                |
| `PAYMENTS`  | 30 minutes | Payment data        | Transaction details              |
| `USER`      | 1 hour     | User data           | Profile information              |

## Quick Start

### Basic Usage

```javascript
import { getCache, CACHE_TYPES } from "./lib/cache/index.js";

// Get auto-configured cache instance
const cache = getCache();

// Initialize if needed
await cache.init();

// Set with type-specific TTL
await cache.set("event:info", eventData, {
  type: CACHE_TYPES.STATIC,
});

// Get with fallback
const eventInfo = await cache.get("event:info", {
  fallback: null,
});
```

### Using Cache Service

```javascript
import { getCacheService } from "../cache-service.js";

const cacheService = getCacheService();

// Cache ticket availability (5-minute TTL)
await cacheService.cacheTicketAvailability(ticketData);

// Get cached data
const availability = await cacheService.getTicketAvailability();

// Invalidate related cache
await cacheService.invalidateTicketCache();
```

## Cache Implementations

### 1. Memory Cache (`memory-cache.js`)

High-performance in-memory cache with LRU eviction:

```javascript
import { createMemoryCache } from "./lib/cache/memory-cache.js";

const memCache = createMemoryCache({
  maxSize: 1000, // Max entries
  maxMemoryMB: 100, // Memory limit
  defaultTtl: 3600, // 1 hour default
  checkInterval: 60, // Cleanup interval
});
```

**Features**:

- ✅ LRU eviction strategy
- ✅ Memory usage monitoring
- ✅ TTL support with cleanup
- ✅ Pattern-based deletion
- ✅ Atomic operations
- ✅ Comprehensive statistics

### 2. Redis Cache (`redis-cache.js`)

Production-ready Redis implementation:

```javascript
import { createRedisCache } from "./lib/cache/redis-cache.js";

const redisCache = createRedisCache({
  url: process.env.REDIS_URL,
  keyPrefix: "alocubano:",
  defaultTtl: 3600,
  socket: {
    connectTimeout: 5000,
    retryDelayOnClusterDown: 300,
  },
});
```

**Features**:

- ✅ Automatic connection retry
- ✅ Connection pooling
- ✅ Comprehensive error handling
- ✅ Pattern-based operations
- ✅ Atomic increments
- ✅ Memory usage tracking

### 3. Multi-Tier Cache (`multi-tier-cache.js`)

Intelligent L1/L2 cache orchestration:

```javascript
import { createMultiTierCache } from "./lib/cache/multi-tier-cache.js";

const cache = createMultiTierCache({
  promoteToMemoryThreshold: 2, // Promote after 2 hits
  writeThrough: true, // Write to both layers
  fallbackToMemoryOnly: true, // Graceful Redis failures
});
```

**Features**:

- ✅ Intelligent cache promotion
- ✅ Write-through strategy
- ✅ Automatic failover
- ✅ Access pattern tracking
- ✅ Combined statistics

## Environment Configuration

### Development

```bash
# Optional - falls back to memory-only
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

### Production

```bash
# Redis recommended for production
REDIS_URL=redis://production-redis:6379
REDIS_CONNECTION_STRING=redis://user:pass@host:port
NODE_ENV=production
```

The system automatically detects Redis availability and falls back to memory-only caching gracefully.

## API Integration Examples

### 1. Cached API Endpoint

```javascript
export default async function handler(req, res) {
  const { forceRefresh } = req.query;
  const cacheKey = "api:events";

  // Try cache first
  if (!forceRefresh) {
    const cached = await cacheService.get(cacheKey, {
      namespace: "api",
    });

    if (cached) {
      return res.json({ ...cached, cached: true });
    }
  }

  // Expensive operation
  const data = await fetchEventsFromDatabase();

  // Cache result
  await cacheService.set(cacheKey, data, {
    type: CACHE_TYPES.STATIC,
    namespace: "api",
  });

  res.json({ ...data, cached: false });
}
```

### 2. Express Middleware

```javascript
import { createCacheMiddleware } from "./lib/cache/index.js";

// Auto-cache GET requests
app.use(
  "/api/events",
  createCacheMiddleware({
    type: CACHE_TYPES.STATIC,
    namespace: "api",
    ttl: 3600,
    keyGenerator: (req) => `events:${req.path}:${JSON.stringify(req.query)}`,
  }),
);
```

### 3. Rate Limiting

```javascript
const rateLimitKey = `rate:${clientIP}`;
const requestCount = await cacheService.incrementCounter(rateLimitKey, {
  ttl: 60, // 1-minute window
  amount: 1,
});

if (requestCount > 100) {
  return res.status(429).json({ error: "Rate limit exceeded" });
}
```

## Cache Warming

Initialize cache with frequently accessed data:

```javascript
import { initializeCache } from "./lib/cache/index.js";

const warmUpData = {
  "event:info": {
    name: "A Lo Cubano Boulder Fest 2026",
    dates: "May 15-17, 2026",
  },
  "artists:featured": ["Artist 1", "Artist 2"],
  "tickets:config": {
    /* ticket configuration */
  },
};

const cache = await initializeCache(warmUpData);
```

## Cache Invalidation Strategies

### 1. Pattern-Based Invalidation

```javascript
// Invalidate all ticket-related cache
await cache.delPattern("ticket*");

// Invalidate specific namespace
await cache.flushNamespace("gallery");
```

### 2. Event-Driven Invalidation

```javascript
// On ticket purchase
await cacheService.invalidateTicketCache();

// On gallery update
await cacheService.invalidateGalleryCache();

// Specific key invalidation
await cache.del("event:info");
```

### 3. Time-Based Invalidation

TTL-based expiration happens automatically based on cache type.

## Monitoring & Health Checks

### Health Check Endpoint

```javascript
export default async function handler(req, res) {
  const health = await cacheService.getHealthStatus();
  const stats = await cacheService.getStats();

  res.json({
    status: health.status,
    cache: {
      health,
      stats,
    },
  });
}
```

### Available Metrics

- **Hit/Miss Ratios**: Cache effectiveness
- **Memory Usage**: Current and peak usage
- **Eviction Rates**: LRU eviction frequency
- **Connection Status**: Redis connectivity
- **Response Times**: Cache operation latency

## Performance Optimizations

### 1. Cache Promotion Strategy

Frequently accessed items automatically promote from Redis (L2) to Memory (L1):

```javascript
// Items accessed ≥2 times promote to memory
const multiTier = createMultiTierCache({
  promoteToMemoryThreshold: 2,
});
```

### 2. Memory Management

```javascript
const memoryCache = createMemoryCache({
  maxSize: 2000, // Limit entries
  maxMemoryMB: 200, // Limit memory
  checkInterval: 120, // Cleanup frequency
});
```

### 3. Connection Pooling

```javascript
const redisCache = createRedisCache({
  socket: {
    connectTimeout: 5000,
    commandTimeout: 2000,
    keepAlive: true,
    maxRetryCount: 3,
  },
});
```

## Error Handling & Resilience

### Automatic Failover

- Redis failures → Automatic fallback to memory-only
- Connection retries with exponential backoff
- Graceful degradation without service interruption

### Error Recovery

```javascript
// Cache operations never throw - always return fallbacks
const data = await cache.get("key", {
  fallback: defaultValue,
});

// Failed operations return false/null
const success = await cache.set("key", "value");
if (!success) {
  // Handle cache failure gracefully
}
```

## Testing

Run comprehensive test suite:

```bash
# Unit tests
npm run test:unit -- cache-system.test.js

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Test Coverage

- ✅ Basic operations (get/set/delete)
- ✅ TTL management and expiration
- ✅ Memory management and eviction
- ✅ Pattern-based operations
- ✅ Multi-tier coordination
- ✅ Error handling and fallbacks
- ✅ Performance under load
- ✅ Concurrent operations

## Production Deployment

### Environment Variables

```bash
# Required for Redis
REDIS_URL=redis://production-server:6379

# Optional configuration
REDIS_KEY_PREFIX=alocubano:prod:
CACHE_DEFAULT_TTL=3600
CACHE_MAX_MEMORY_MB=500
```

### Monitoring Setup

1. **Health Checks**: `/api/cache/health`
2. **Metrics Dashboard**: `/api/cache/stats`
3. **Alerts**: Configure on high eviction rates
4. **Logging**: Structured cache operation logs

### Scaling Considerations

- **Redis Cluster**: For high-availability setups
- **Memory Limits**: Adjust based on server capacity
- **Connection Pools**: Scale with concurrent requests
- **Cache Warming**: Initialize on deployment

## Common Patterns

### 1. Cache-Aside Pattern

```javascript
async function getEventInfo(eventId) {
  // Try cache first
  let event = await cache.get(`event:${eventId}`);

  if (!event) {
    // Cache miss - load from database
    event = await database.getEvent(eventId);

    // Update cache for next time
    await cache.set(`event:${eventId}`, event, {
      type: CACHE_TYPES.STATIC,
    });
  }

  return event;
}
```

### 2. Write-Through Pattern

```javascript
async function updateEventInfo(eventId, data) {
  // Update database
  await database.updateEvent(eventId, data);

  // Update cache immediately
  await cache.set(`event:${eventId}`, data, {
    type: CACHE_TYPES.STATIC,
  });

  return data;
}
```

### 3. Cache Warming Pattern

```javascript
async function warmEventCache() {
  const upcomingEvents = await database.getUpcomingEvents();

  const cachePromises = upcomingEvents.map((event) =>
    cache.set(`event:${event.id}`, event, {
      type: CACHE_TYPES.STATIC,
    }),
  );

  await Promise.all(cachePromises);
  console.log(`Warmed cache with ${upcomingEvents.length} events`);
}
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce `maxMemoryMB` setting
   - Decrease `maxSize` limit
   - Check for memory leaks in cached objects

2. **Redis Connection Failures**
   - Verify `REDIS_URL` configuration
   - Check network connectivity
   - Review Redis server logs

3. **Poor Cache Hit Rates**
   - Review TTL settings for cache types
   - Check for frequent cache invalidation
   - Monitor access patterns

4. **Performance Issues**
   - Enable connection pooling
   - Optimize serialization of large objects
   - Consider cache key structure

### Debug Mode

Enable detailed logging:

```javascript
const cache = getCache("multi-tier", {
  debug: true,
  logLevel: "verbose",
});
```

### Cache Inspection

```javascript
// Inspect specific key
const info = cache.inspect("event:123");
console.log("Key info:", info);

// List all keys matching pattern
const keys = cache.keys("event:*");
console.log("Event keys:", keys);

// Get memory usage
const memoryInfo = await cache.getMemoryInfo();
console.log("Memory usage:", memoryInfo);
```

## Future Enhancements

### Planned Features

- [ ] **Distributed Locking**: Prevent cache stampede
- [ ] **Compression**: Reduce memory usage for large objects
- [ ] **Encryption**: Encrypt sensitive cached data
- [ ] **Replication**: Master-slave Redis setup
- [ ] **Metrics Export**: Prometheus/Grafana integration
- [ ] **Cache Tags**: Group-based invalidation
- [ ] **Async Loading**: Background cache refresh

### Performance Roadmap

- [ ] **Bloom Filters**: Reduce cache misses
- [ ] **Consistent Hashing**: Better key distribution
- [ ] **Pipeline Operations**: Batch Redis commands
- [ ] **Memory Optimization**: Smarter serialization
- [ ] **Edge Caching**: CDN integration

---

## Support

For issues or questions about the cache system:

1. Check this documentation
2. Review test cases for examples
3. Check logs for error messages
4. Create GitHub issue with details

**Last Updated**: August 2025  
**Version**: 1.0.0