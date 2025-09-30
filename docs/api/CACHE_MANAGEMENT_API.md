# Unified Cache Management API Documentation

## Overview

The A Lo Cubano Boulder Fest application provides a unified cache management endpoint for administrators to monitor, clear, and warm the multi-tier cache system. This consolidated API combines general cache operations and Google Drive cache management into a single, consistent interface.

## Base Endpoint

**URL**: `/api/cache`

All cache management operations are performed through this unified endpoint using different HTTP methods and parameters.

## Authentication

All cache management operations require admin authentication using session tokens.

**Authentication Methods:**

- Session cookie: `admin_session`
- Authorization header: `Bearer <token>`

## Rate Limiting

Different rate limits apply based on the operation type:

- **Stats (GET)**: 20 requests per minute per admin
- **Warm (POST)**: 5 operations per 10 minutes per admin
- **Clear (POST/DELETE)**: 10 operations per minute per admin

Rate limit headers are included in all responses:

- `X-RateLimit-Remaining`: Number of requests remaining
- `X-RateLimit-Reset`: Timestamp when limit resets

## API Operations

### 1. Get Cache Statistics

**Method**: `GET /api/cache`

Retrieve comprehensive cache performance analytics and monitoring data.

#### Query Parameters

| Parameter    | Type    | Description                                          |
| ------------ | ------- | ---------------------------------------------------- |
| `type`       | string  | Cache type: 'general' (default) or 'google-drive'    |
| `detailed`   | boolean | Include detailed breakdown by namespace (default: false) |
| `historical` | boolean | Include historical trends (future feature, default: false) |
| `format`     | string  | Response format: 'json' (default) or 'summary'       |

#### Example Requests

**Get general cache statistics:**
```bash
curl -H "Authorization: Bearer <token>" \
  https://alocubanoboulderfest.com/api/cache
```

**Get Google Drive cache statistics:**
```bash
curl -H "Authorization: Bearer <token>" \
  https://alocubanoboulderfest.com/api/cache?type=google-drive
```

**Get detailed statistics:**
```bash
curl -H "Authorization: Bearer <token>" \
  https://alocubanoboulderfest.com/api/cache?detailed=true
```

**Get summary view:**
```bash
curl -H "Authorization: Bearer <token>" \
  https://alocubanoboulderfest.com/api/cache?format=summary
```

#### Response (General Cache - Full Format)

```json
{
  "timestamp": "2026-01-15T10:30:00Z",
  "adminId": "admin123",
  "summary": {
    "status": "multi-tier",
    "hitRatio": "93.75%",
    "totalRequests": 1247,
    "uptime": "2d 14h",
    "effectiveness": {
      "score": 89,
      "maxScore": 100,
      "grade": "B",
      "factors": {
        "hitRatio": 93.75,
        "memoryDistribution": "75.2%",
        "promotionRate": "12.5%",
        "fallbackRate": "0.8%"
      }
    }
  },
  "performance": {
    "l1Cache": {
      "hits": 1172,
      "hitRatio": "94.1%",
      "memoryUsage": "35MB / 50MB",
      "utilization": "70.0%"
    },
    "l2Cache": {
      "hits": 389,
      "available": true,
      "promotions": 47,
      "fallbacks": 10
    }
  },
  "analysis": {
    "ttl": {
      "avgTtl": "N/A",
      "expirationPrediction": "N/A",
      "recommendations": []
    },
    "insights": {
      "performance": "good",
      "alerts": [],
      "recommendations": [],
      "trends": []
    }
  }
}
```

#### Response (Google Drive Cache)

```json
{
  "action": "status",
  "type": "google-drive",
  "cache": {
    "size": 15,
    "hitRatio": "85.5%",
    "hits": 342,
    "misses": 58
  },
  "metrics": {
    "cacheSize": 15,
    "cacheHits": 342,
    "cacheMisses": 58,
    "cacheHitRatio": "85.5%",
    "apiCalls": 58,
    "totalItemsFetched": 450
  },
  "api": {
    "version": "1.0",
    "timestamp": "2026-01-15T10:30:00Z",
    "environment": "vercel"
  }
}
```

#### Effectiveness Scoring

The effectiveness score (0-100) is calculated based on:

- **Hit Ratio** (40 points): Overall cache hit percentage
- **Memory Distribution** (20 points): Optimal L1/L2 hit distribution
- **Promotion Effectiveness** (20 points): L2→L1 promotion success rate
- **Reliability** (20 points): Low fallback/error rates

**Grade Scale:**

| Score  | Grade | Description                                 |
| ------ | ----- | ------------------------------------------- |
| 90-100 | A     | Excellent cache performance                 |
| 80-89  | B     | Good performance with room for optimization |
| 70-79  | C     | Fair performance, consider tuning           |
| 60-69  | D     | Poor performance, optimization needed       |
| 0-59   | F     | Critical performance issues                 |

---

### 2. Cache Warming

**Method**: `POST /api/cache`

Pre-load critical data into cache for optimal performance with intelligent warming strategies.

#### Request Body

```json
{
  "action": "warm",
  "type": "general|google-drive",
  "sections": ["all|event|tickets|gallery|analytics"],
  "priority": "low|normal|high",
  "dryRun": false,
  "force": false
}
```

#### Parameters

| Parameter  | Type    | Required | Description                                        |
| ---------- | ------- | -------- | -------------------------------------------------- |
| `action`   | string  | Yes      | Must be "warm"                                     |
| `type`     | string  | No       | Cache type: "general" (default) or "google-drive"  |
| `sections` | array   | No       | Sections to warm (general cache only, default: ["all"]) |
| `priority` | string  | No       | Warming priority affecting TTL (default: "normal") |
| `dryRun`   | boolean | No       | Preview mode without actual warming (default: false) |
| `force`    | boolean | No       | Force warming even if data exists (default: false) |

#### Warming Sections (General Cache)

- **`event`**: Core event information, artists, schedule
- **`tickets`**: Ticket availability, pricing, configuration
- **`gallery`**: Gallery years, featured photos, stats
- **`analytics`**: Analytics configuration, popular pages
- **`all`**: All of the above sections

#### Priority Levels

| Priority | TTL     | Memory Promotion | Use Case                |
| -------- | ------- | ---------------- | ----------------------- |
| `low`    | 30 min  | No               | Testing, development    |
| `normal` | 1 hour  | No               | Regular operations      |
| `high`   | 2 hours | Yes              | Pre-event, high traffic |

#### Example Requests

**Warm general cache (all sections):**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "warm",
    "sections": ["all"],
    "priority": "normal"
  }'
```

**Warm specific sections with high priority:**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "warm",
    "sections": ["tickets", "event"],
    "priority": "high",
    "force": true
  }'
```

**Warm Google Drive cache:**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "warm",
    "type": "google-drive",
    "year": 2026,
    "maxResults": 100
  }'
```

**Preview warming (dry run):**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "warm",
    "sections": ["gallery"],
    "dryRun": true
  }'
```

#### Response (General Cache)

```json
{
  "success": true,
  "action": "warm",
  "sections": ["tickets", "gallery"],
  "priority": "high",
  "warmedCount": 42,
  "operations": [
    {
      "section": "tickets",
      "status": "completed",
      "warmedKeys": 18,
      "totalKeys": 18,
      "ttl": 7200,
      "cacheType": "dynamic",
      "namespace": "tickets"
    },
    {
      "section": "gallery",
      "status": "completed",
      "warmedKeys": 24,
      "totalKeys": 24,
      "ttl": 7200,
      "cacheType": "gallery",
      "namespace": "gallery"
    }
  ],
  "progress": {
    "total": 42,
    "completed": 42,
    "failed": 0
  },
  "dryRun": false,
  "force": false,
  "timestamp": "2026-01-15T10:30:00Z",
  "adminId": "admin123"
}
```

#### Response (Google Drive Cache)

```json
{
  "action": "warmed",
  "type": "google-drive",
  "success": true,
  "message": "Google Drive cache warmed successfully",
  "data": {
    "itemsFetched": 150,
    "source": "google-drive-api",
    "categories": ["workshops", "socials", "performances", "other"]
  },
  "cache": {
    "size": 15,
    "hitRatio": "85.5%"
  },
  "api": {
    "version": "1.0",
    "timestamp": "2026-01-15T10:30:00Z",
    "adminId": "admin123"
  }
}
```

---

### 3. Cache Clearing

**Method**: `POST /api/cache` or `DELETE /api/cache`

Clear cache with pattern-based and selective clearing options.

#### Request Body (POST)

```json
{
  "action": "clear",
  "type": "general|google-drive",
  "clearAction": "selective|pattern|namespace|all",
  "pattern": "optional_wildcard_pattern",
  "namespace": "optional_namespace",
  "cacheType": "gallery|tickets|sessions|analytics|payments|api",
  "dryRun": false,
  "reason": "Manual admin clear"
}
```

#### Parameters

| Parameter     | Type    | Required | Description                                        |
| ------------- | ------- | -------- | -------------------------------------------------- |
| `action`      | string  | Yes      | Must be "clear"                                    |
| `type`        | string  | No       | Cache type: "general" (default) or "google-drive"  |
| `clearAction` | string  | No       | Clear action type (default: "selective")           |
| `pattern`     | string  | No       | Wildcard pattern for pattern clearing              |
| `namespace`   | string  | No       | Specific namespace to clear                        |
| `cacheType`   | string  | No       | Specific cache type for selective clearing         |
| `dryRun`      | boolean | No       | Preview mode without actual clearing (default: false) |
| `reason`      | string  | No       | Audit trail reason                                 |

#### Clear Action Types

- **`all`**: Clears all cache layers (memory + Redis)
- **`pattern`**: Clears keys matching wildcard pattern
- **`namespace`**: Clears all keys in specific namespace
- **`selective`**: Clears by cache type or expired entries

#### Example Requests

**Clear all general caches:**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "clear",
    "clearAction": "all",
    "reason": "System maintenance"
  }'
```

**Clear by pattern:**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "clear",
    "clearAction": "pattern",
    "pattern": "gallery:*",
    "namespace": "gallery"
  }'
```

**Clear specific cache type:**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "clear",
    "clearAction": "selective",
    "cacheType": "tickets",
    "reason": "Ticket update deployment"
  }'
```

**Clear Google Drive cache:**
```bash
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "clear",
    "type": "google-drive",
    "reason": "Force refresh gallery data"
  }'
```

**Clear using DELETE shorthand:**
```bash
curl -X DELETE https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer <token>"
```

**Clear Google Drive cache using DELETE:**
```bash
curl -X DELETE https://alocubanoboulderfest.com/api/cache?type=google-drive \
  -H "Authorization: Bearer <token>"
```

#### Response (General Cache)

```json
{
  "success": true,
  "action": "pattern",
  "clearedCount": 25,
  "operations": [
    {
      "type": "pattern_clear",
      "pattern": "tickets:*",
      "namespace": "tickets",
      "cleared": 25
    }
  ],
  "dryRun": false,
  "timestamp": "2026-01-15T10:30:00Z",
  "adminId": "admin123",
  "reason": "Ticket configuration update"
}
```

#### Response (Google Drive Cache)

```json
{
  "action": "cleared",
  "type": "google-drive",
  "success": true,
  "message": "Google Drive cache cleared successfully",
  "cache": {
    "size": 0,
    "hitRatio": "0%"
  },
  "api": {
    "version": "1.0",
    "timestamp": "2026-01-15T10:30:00Z",
    "adminId": "admin123",
    "reason": "Force refresh gallery data"
  }
}
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "timestamp": "2026-01-15T10:30:00Z"
}
```

### Common Error Codes

| Code | Error              | Description                       |
| ---- | ------------------ | --------------------------------- |
| 401  | Unauthorized       | Missing or invalid authentication |
| 405  | Method Not Allowed | Invalid HTTP method               |
| 429  | Rate Limited       | Too many requests                 |
| 400  | Bad Request        | Invalid parameters                |
| 500  | Server Error       | Internal system error             |

---

## Best Practices

### Cache Clearing

1. **Use dry run first** to preview operations
2. **Provide clear reasons** for audit trails
3. **Use specific patterns** instead of clearing all
4. **Monitor effectiveness** after clearing

### Cache Warming

1. **Warm before high traffic** events
2. **Use appropriate priorities** for different scenarios
3. **Force warming** only when necessary
4. **Monitor progress** for long operations

### Cache Monitoring

1. **Check stats regularly** to identify issues
2. **Set up alerts** for low effectiveness scores
3. **Review recommendations** for optimization
4. **Monitor hit ratios** and fallback rates

---

## Security Considerations

1. **Admin authentication** required for all operations
2. **Rate limiting** prevents system overload
3. **Audit logging** tracks all cache operations
4. **Session validation** ensures proper authorization
5. **Input validation** prevents injection attacks

---

## Integration Examples

### Automated Cache Management Script

```bash
#!/bin/bash
# Daily cache maintenance script

# Get auth token
TOKEN=$(curl -s -X POST https://alocubanoboulderfest.com/api/admin/login \
  -d '{"password":"'$ADMIN_PASSWORD'"}' \
  -H "Content-Type: application/json" | jq -r '.token')

# Clear expired entries
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"clear","clearAction":"selective","reason":"Daily maintenance"}'

# Warm critical sections
curl -X POST https://alocubanoboulderfest.com/api/cache \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"warm","sections":["event","tickets"],"priority":"normal"}'

# Check effectiveness
GRADE=$(curl -H "Authorization: Bearer $TOKEN" \
  https://alocubanoboulderfest.com/api/cache?format=summary | \
  jq -r '.effectiveness')

echo "Cache effectiveness: $GRADE"
```

### Monitoring Dashboard Integration

```javascript
// React component for cache monitoring
const CacheMonitor = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      const response = await fetch("/api/cache", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setStats(data);
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h3>Cache Performance</h3>
      {stats && (
        <>
          <div>Hit Ratio: {stats.summary.hitRatio}</div>
          <div>Effectiveness: {stats.summary.effectiveness.grade}</div>
          <div>Status: {stats.summary.status}</div>
        </>
      )}
    </div>
  );
};
```

---

## Migration from Legacy Endpoints

The following legacy endpoints have been consolidated into `/api/cache`:

| Legacy Endpoint              | New Unified Endpoint                                    |
| ---------------------------- | ------------------------------------------------------- |
| `GET /api/cache/stats`       | `GET /api/cache`                                        |
| `POST /api/cache/warm`       | `POST /api/cache` with `action=warm`                    |
| `POST /api/cache/clear`      | `POST /api/cache` with `action=clear` or `DELETE /api/cache` |
| `GET /api/google-drive-cache` | `GET /api/cache?type=google-drive`                      |
| `POST /api/google-drive-cache` | `POST /api/cache` with `type=google-drive` and `action=warm` |
| `DELETE /api/google-drive-cache` | `DELETE /api/cache?type=google-drive`                   |
| `GET /api/cache-warm`        | Deprecated (edge function, replaced by unified endpoint) |

**Breaking Changes:**

1. All operations now require admin authentication (no more `INTERNAL_API_KEY`)
2. Google Drive cache operations use `type=google-drive` parameter
3. Cache warming and clearing use `action` parameter to specify operation
4. Consistent response format across all cache types

---

## Troubleshooting

### Low Cache Effectiveness

1. Check hit ratios in stats API
2. Review TTL settings for your data patterns
3. Consider warming critical data
4. Monitor Redis connectivity

### High Memory Usage

1. Check memory utilization in stats
2. Clear unnecessary cached data
3. Review TTL values to allow expiration
4. Consider increasing memory limits

### Rate Limit Issues

1. Reduce request frequency
2. Use summary format for frequent monitoring
3. Batch clear operations when possible
4. Implement exponential backoff

### Redis Connectivity Issues

1. Check fallback rates in stats
2. Verify Redis server status
3. Review connection configuration
4. Monitor network connectivity