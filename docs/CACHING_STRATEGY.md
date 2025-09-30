# Caching Strategy

Complete guide to the multi-layered caching architecture for A Lo Cubano Boulder Fest.

## Overview

The application implements a sophisticated multi-tier caching strategy designed to optimize performance while ensuring data freshness and consistency.

## Cache Architecture

### Two-Tier System

The caching system operates on two distinct layers:

1. **HTTP Cache (CDN/Browser)** - 24 hours
2. **Application Cache (Server-side)** - 7 days

```text
Request Flow:
┌──────────────┐     24h HTTP Cache     ┌──────────────┐     7d Server Cache     ┌──────────────┐
│   Browser    │ ───────────────────► │ CDN/Vercel   │ ───────────────────► │   Database   │
│   Client     │ ◄─────────────────── │   Edge       │ ◄─────────────────── │   Origin     │
└──────────────┘                       └──────────────┘                       └──────────────┘
```

### Layer 1: HTTP Cache (24 Hours)

**Purpose**: Fast content delivery via CDN/browser caching

**Implementation**:

```javascript
// Example from Google Drive service
res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
```

**Characteristics**:

- **Duration**: 24 hours (86400 seconds)
- **Scope**: Public (cacheable by browsers and CDN)
- **Location**: Browser cache and CDN edge locations
- **Invalidation**: Time-based expiration only
- **Use Case**: Static or rarely-changing content

**What Gets Cached**:

- Google Drive gallery images
- Static event data
- Artist information
- Schedule data

### Layer 2: Application Cache (7 Days)

**Purpose**: Reduce database queries and API calls

**Implementation**:

```javascript
// Example from Google Drive service
this.cacheTTL = 30 * 60 * 1000; // 30 minutes in-memory
// Plus 7-day Redis persistence (if available)
```

**Characteristics**:

- **Duration**: 7 days (604800 seconds)
- **Scope**: Server-side only
- **Location**: Redis (L2) and Memory (L1)
- **Invalidation**: Manual + time-based
- **Use Case**: API responses, computed data

**What Gets Cached**:

- Google Drive API responses
- Gallery metadata
- Ticket availability
- Analytics data
- Session information

## Cache Types and TTLs

### Static Content (Long TTL)

**Use Case**: Content that rarely changes

```javascript
CACHE_TYPES.STATIC: {
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  namespace: 'static',
  description: 'Static event data, artist info'
}
```

**Examples**:

- Event information
- Artist profiles
- Schedule data
- Configuration settings

### Dynamic Content (Short TTL)

**Use Case**: Frequently updated data

```javascript
CACHE_TYPES.DYNAMIC: {
  ttl: 5 * 60 * 1000, // 5 minutes
  namespace: 'dynamic',
  description: 'Ticket availability, user sessions'
}
```

**Examples**:

- Ticket availability
- Real-time inventory
- User sessions
- Shopping cart state

### Gallery Content (Medium TTL)

**Use Case**: Gallery images and metadata

```javascript
CACHE_TYPES.GALLERY: {
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  namespace: 'gallery',
  description: 'Gallery images and metadata'
}
```

**Examples**:

- Google Drive images
- Photo metadata
- Video thumbnails
- Category groupings

### Analytics Content (Short TTL)

**Use Case**: Metrics and analytics data

```javascript
CACHE_TYPES.ANALYTICS: {
  ttl: 15 * 60 * 1000, // 15 minutes
  namespace: 'analytics',
  description: 'Performance metrics, user engagement'
}
```

**Examples**:

- Page view counts
- Conversion metrics
- Performance data
- User engagement stats

## Google Drive Caching

The Google Drive integration implements a sophisticated dual-layer caching strategy:

### Server-Side Cache (30 Minutes)

**Purpose**: Reduce Google Drive API calls and quota usage

**Implementation**:

```javascript
// lib/google-drive-service.js
class GoogleDriveService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes
    this.maxCacheSize = 20; // LRU eviction
  }
}
```

**Features**:

- **LRU Eviction**: Automatically removes least recently used entries
- **Hit Ratio Tracking**: Monitors cache effectiveness
- **Automatic Retry**: Handles rate limits with exponential backoff

**Cache Key Strategy**:

```javascript
// Cache key includes all query parameters for proper isolation
const cacheKey = `${eventId || year}-${maxResults}-${includeVideos}`;
```

### HTTP Cache (24 Hours)

**Purpose**: Deliver images quickly from CDN/browser cache

**Headers**:

```http
Cache-Control: public, max-age=86400
Content-Type: image/jpeg
ETag: "abc123"
```

**Why 24 Hours?**:

- Gallery images rarely change after upload
- Reduces bandwidth costs significantly
- Improves page load performance
- Users rarely need real-time gallery updates

## Cache Invalidation

### Manual Invalidation

**Admin API Endpoint**: `POST /api/cache`

**Clear All Cache**:

```bash
curl -X POST https://alocubano.boulderfest/api/cache \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"action": "clear", "type": "all"}'
```

**Clear Google Drive Cache**:

```bash
curl -X POST https://alocubano.boulderfest/api/cache \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"action": "clear", "type": "google-drive"}'
```

**Clear by Pattern**:

```bash
curl -X POST https://alocubano.boulderfest/api/cache \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"action": "clear", "pattern": "gallery:*"}'
```

**Clear by Namespace**:

```bash
curl -X POST https://alocubano.boulderfest/api/cache \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"action": "clear", "namespace": "tickets"}'
```

### Automatic Invalidation

**Time-Based Expiration**:

- Cache entries automatically expire after TTL
- No manual intervention required
- Configurable per cache type

**Event-Based Invalidation**:

```javascript
// Example: Invalidate ticket cache after purchase
await cacheService.invalidateTicketCache();

// Example: Invalidate gallery cache after upload
await cacheService.invalidateGalleryCache();
```

## Cache Warming

**Purpose**: Pre-populate cache with frequently accessed data

**Admin API**: `POST /api/cache`

**Warm All Sections**:

```bash
curl -X POST https://alocubano.boulderfest/api/cache \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"action": "warm", "sections": ["all"]}'
```

**Warm Specific Section**:

```bash
curl -X POST https://alocubano.boulderfest/api/cache \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"action": "warm", "sections": ["gallery", "tickets"]}'
```

**Available Sections**:

- `event` - Static event data
- `tickets` - Ticket configuration and availability
- `gallery` - Gallery years and featured photos
- `analytics` - Analytics configuration
- `all` - All sections

**Warm with Priority**:

```bash
curl -X POST https://alocubano.boulderfest/api/cache \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"action": "warm", "sections": ["gallery"], "priority": "high"}'
```

**Priority Levels**:

- `low`: TTL = 30 minutes
- `normal`: TTL = 1 hour (default)
- `high`: TTL = 2 hours + force memory storage

## Performance Monitoring

### Cache Statistics

**Endpoint**: `GET /api/cache`

**Response**:

```json
{
  "timestamp": "2025-09-30T12:00:00Z",
  "summary": {
    "status": "multi-tier",
    "hitRatio": "87.5%",
    "totalRequests": 1247,
    "uptime": "2d 5h",
    "effectiveness": {
      "score": 92,
      "grade": "A"
    }
  },
  "performance": {
    "l1Cache": {
      "hits": 1092,
      "hitRatio": "87.5%",
      "memoryUsage": "12.5MB / 50MB",
      "utilization": "25.0%"
    },
    "l2Cache": {
      "hits": 95,
      "available": true,
      "promotions": 23,
      "fallbacks": 5
    }
  }
}
```

### Google Drive Metrics

**Endpoint**: `GET /api/cache?type=google-drive`

**Response**:

```json
{
  "action": "status",
  "type": "google-drive",
  "cache": {
    "size": 15,
    "hitRatio": "78.3%",
    "hits": 234,
    "misses": 65
  },
  "metrics": {
    "apiCalls": 65,
    "cacheHits": 234,
    "cacheMisses": 65,
    "avgResponseTime": "142.5ms",
    "rateLimitHits": 0,
    "errors": 0
  }
}
```

## Troubleshooting

### Problem: Low Cache Hit Ratio

**Symptoms**:

- Hit ratio below 70%
- Slow API responses
- High database load

**Solutions**:

1. **Warm the cache**:

   ```bash
   curl -X POST /api/cache -d '{"action": "warm", "sections": ["all"]}'
   ```

2. **Check cache TTL settings** - May need adjustment for access patterns

3. **Review cache key generation** - Ensure consistent key patterns

4. **Monitor cache eviction** - May need to increase cache size

### Problem: Stale Data

**Symptoms**:

- Old gallery images displayed
- Outdated ticket availability
- Incorrect event information

**Solutions**:

1. **Clear affected cache**:

   ```bash
   curl -X POST /api/cache -d '{"action": "clear", "namespace": "gallery"}'
   ```

2. **Reduce TTL** for frequently changing data

3. **Implement event-based invalidation** for critical updates

### Problem: High Memory Usage

**Symptoms**:

- Memory cache near capacity
- Frequent evictions
- Performance degradation

**Solutions**:

1. **Clear unnecessary cache entries**:

   ```bash
   curl -X POST /api/cache -d '{"action": "clear", "pattern": "old-data:*"}'
   ```

2. **Reduce cache size** or TTL values

3. **Enable Redis** for L2 caching (offloads memory)

### Problem: Google Drive Rate Limits

**Symptoms**:

- `rateLimitHits` metric increasing
- API errors in logs
- Slow gallery loading

**Solutions**:

1. **Increase cache TTL** to reduce API calls

2. **Check metrics**:

   ```bash
   curl -X GET /api/cache?type=google-drive
   ```

3. **System handles this automatically** with exponential backoff retry

4. **If persistent**, consider upgrading Google Drive API quota

## Best Practices

### Cache Key Design

**Good**:

```javascript
// Consistent, sortable, includes all parameters
`GET:/api/gallery:{"eventId":"boulder-fest-2025","maxResults":100}`
```

**Bad**:

```javascript
// Inconsistent parameter order, causes cache misses
`GET:/api/gallery:{"maxResults":100,"eventId":"boulder-fest-2025"}`
```

### TTL Selection

**Guidelines**:

- **Static data**: 7 days (event info, artist profiles)
- **Semi-static data**: 24 hours (gallery images, schedule)
- **Dynamic data**: 5-15 minutes (ticket availability, sessions)
- **Real-time data**: 1-5 minutes (analytics, live metrics)

### Invalidation Strategy

**Event-Driven** (Preferred):

```javascript
// Invalidate when data changes
await payment.process();
await cacheService.invalidateTicketCache();
```

**Time-Driven** (Fallback):

```javascript
// Let TTL handle expiration for non-critical data
// Good for: gallery, static content
```

### Monitoring and Alerts

**Set up alerts for**:

- Hit ratio < 70%
- Memory usage > 90%
- High fallback rate (> 5%)
- Rate limit hits

**Regular reviews**:

- Weekly cache effectiveness reports
- Monthly TTL optimization
- Quarterly capacity planning

## Configuration

### Environment Variables

```bash
# Redis configuration (optional for L2 cache)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-password

# Cache sizing
CACHE_MAX_MEMORY_MB=50
CACHE_MAX_ENTRIES=1000

# TTL overrides (milliseconds)
CACHE_STATIC_TTL=604800000    # 7 days
CACHE_DYNAMIC_TTL=300000      # 5 minutes
CACHE_GALLERY_TTL=86400000    # 24 hours
```

### Code Configuration

```javascript
// lib/cache/index.js
export const CACHE_TYPES = {
  STATIC: { ttl: 7 * 24 * 60 * 60 * 1000 },
  DYNAMIC: { ttl: 5 * 60 * 1000 },
  GALLERY: { ttl: 24 * 60 * 60 * 1000 },
  ANALYTICS: { ttl: 15 * 60 * 1000 }
};
```

## Related Documentation

- [API Documentation](./api/README.md)
- [Performance Optimization](./PERFORMANCE.md)
- [Admin Panel Guide](./ADMIN_GUIDE.md)