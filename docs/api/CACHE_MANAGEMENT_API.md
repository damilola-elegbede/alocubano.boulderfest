# Cache Management API Documentation

## Overview

The A Lo Cubano Boulder Fest application provides comprehensive cache management endpoints for administrators to monitor, clear, and warm the multi-tier cache system. These APIs enable fine-grained control over cache performance and provide detailed analytics.

## Authentication

All cache management endpoints require admin authentication using the same session tokens used for the admin dashboard.

**Authentication Methods:**

- Session cookie: `admin_session`
- Authorization header: `Bearer <token>`

## Rate Limiting

Each endpoint has specific rate limits to prevent system overload:

- **Clear API**: 10 operations per minute per admin
- **Warm API**: 5 operations per 10 minutes per admin
- **Stats API**: 20 requests per minute per admin

Rate limit headers are included in all responses:

- `X-RateLimit-Remaining`: Number of requests remaining
- `X-RateLimit-Reset`: Timestamp when limit resets

## Endpoints

### 1. Cache Clear API

**Endpoint:** `POST /api/cache/clear`

Provides secure cache clearing functionality with pattern-based and selective clearing options.

#### Request Body

```json
{
  "action": "selective|pattern|namespace|all",
  "pattern": "optional_wildcard_pattern",
  "namespace": "optional_namespace",
  "cacheType": "gallery|tickets|sessions|analytics|payments|api",
  "dryRun": false,
  "reason": "Manual admin clear"
}
```

#### Parameters

| Parameter   | Type    | Required | Description                                |
| ----------- | ------- | -------- | ------------------------------------------ |
| `action`    | string  | Yes      | Clear action type                          |
| `pattern`   | string  | No       | Wildcard pattern for pattern clearing      |
| `namespace` | string  | No       | Specific namespace to clear                |
| `cacheType` | string  | No       | Specific cache type for selective clearing |
| `dryRun`    | boolean | No       | Preview mode - shows what would be cleared |
| `reason`    | string  | No       | Audit trail reason                         |

#### Action Types

- **`all`**: Clears all cache layers (memory + Redis)
- **`pattern`**: Clears keys matching wildcard pattern
- **`namespace`**: Clears all keys in specific namespace
- **`selective`**: Clears by cache type or expired entries

#### Response

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

#### Examples

**Clear all caches:**

```bash
curl -X POST https://alocubanoboulderfest.com/api/cache/clear \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "all", "reason": "System maintenance"}'
```

**Clear by pattern (dry run):**

```bash
curl -X POST https://alocubanoboulderfest.com/api/cache/clear \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "pattern",
    "pattern": "gallery:*",
    "namespace": "gallery",
    "dryRun": true
  }'
```

**Clear specific cache type:**

```bash
curl -X POST https://alocubanoboulderfest.com/api/cache/clear \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "selective",
    "cacheType": "tickets",
    "reason": "Ticket update deployment"
  }'
```

### 2. Cache Warm API

**Endpoint:** `POST /api/cache/warm`

Pre-loads critical data into cache for optimal performance with intelligent warming strategies.

#### Request Body

```json
{
  "sections": ["all|event|tickets|gallery|analytics"],
  "priority": "low|normal|high",
  "dryRun": false,
  "force": false
}
```

#### Parameters

| Parameter  | Type    | Required | Description                                        |
| ---------- | ------- | -------- | -------------------------------------------------- |
| `sections` | array   | No       | Cache sections to warm (default: ["all"])          |
| `priority` | string  | No       | Warming priority affecting TTL (default: "normal") |
| `dryRun`   | boolean | No       | Preview mode - shows what would be warmed          |
| `force`    | boolean | No       | Force warming even if data exists                  |

#### Warming Sections

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

#### Response

```json
{
  "success": true,
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

#### Examples

**Warm all sections:**

```bash
curl -X POST https://alocubanoboulderfest.com/api/cache/warm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sections": ["all"], "priority": "normal"}'
```

**Warm specific sections with high priority:**

```bash
curl -X POST https://alocubanoboulderfest.com/api/cache/warm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sections": ["tickets", "event"],
    "priority": "high",
    "force": true
  }'
```

**Preview warming (dry run):**

```bash
curl -X POST https://alocubanoboulderfest.com/api/cache/warm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sections": ["gallery"],
    "dryRun": true
  }'
```

### 3. Cache Stats API

**Endpoint:** `GET /api/cache/stats`

Provides comprehensive cache performance analytics and monitoring with effectiveness scoring.

#### Query Parameters

| Parameter    | Type    | Description                                |
| ------------ | ------- | ------------------------------------------ |
| `detailed`   | boolean | Include detailed breakdown by namespace    |
| `historical` | boolean | Include historical trends (future feature) |
| `format`     | string  | Response format: 'json' or 'summary'       |

#### Response (Full Format)

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
      "recommendations": ["High miss rate - consider increasing TTL values"]
    },
    "insights": {
      "performance": "good",
      "alerts": [],
      "recommendations": [
        {
          "priority": "medium",
          "category": "optimization",
          "description": "Memory utilization could be improved",
          "action": "Review cache promotion thresholds"
        }
      ],
      "trends": []
    }
  }
}
```

#### Response (Summary Format)

```json
{
  "status": "multi-tier",
  "hitRatio": "93.75%",
  "effectiveness": "B",
  "alerts": [],
  "timestamp": "2026-01-15T10:30:00Z"
}
```

#### Effectiveness Scoring

The effectiveness score (0-100) is calculated based on:

- **Hit Ratio** (40 points): Overall cache hit percentage
- **Memory Distribution** (20 points): Optimal L1/L2 hit distribution
- **Promotion Effectiveness** (20 points): L2→L1 promotion success rate
- **Reliability** (20 points): Low fallback/error rates

#### Grade Scale

| Score  | Grade | Description                                 |
| ------ | ----- | ------------------------------------------- |
| 90-100 | A     | Excellent cache performance                 |
| 80-89  | B     | Good performance with room for optimization |
| 70-79  | C     | Fair performance, consider tuning           |
| 60-69  | D     | Poor performance, optimization needed       |
| 0-59   | F     | Critical performance issues                 |

#### Examples

**Get full statistics:**

```bash
curl -H "Authorization: Bearer <token>" \
  https://alocubanoboulderfest.com/api/cache/stats?detailed=true
```

**Get summary view:**

```bash
curl -H "Authorization: Bearer <token>" \
  https://alocubanoboulderfest.com/api/cache/stats?format=summary
```

**Monitor effectiveness:**

```bash
curl -H "Authorization: Bearer <token>" \
  https://alocubanoboulderfest.com/api/cache/stats | \
  jq '.summary.effectiveness.grade'
```

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

## Security Considerations

1. **Admin authentication** required for all operations
2. **Rate limiting** prevents system overload
3. **Audit logging** tracks all cache operations
4. **Session validation** ensures proper authorization
5. **Input validation** prevents injection attacks

## Performance Impact

### Clear Operations

- **Pattern clearing**: Minimal impact, proportional to matches
- **Namespace clearing**: Low impact, isolated to namespace
- **Full clearing**: Moderate impact, temporary performance reduction

### Warm Operations

- **Memory warming**: Low impact, improves subsequent performance
- **Redis warming**: Minimal impact, network I/O during operation
- **High priority warming**: Moderate memory usage increase

### Stats Operations

- **Basic stats**: Negligible impact, cached briefly
- **Detailed stats**: Low impact, comprehensive analysis
- **Historical stats**: Future feature, expected low impact

## Integration Examples

### Automated Cache Management

```bash
#!/bin/bash
# Daily cache maintenance script

# Get auth token
TOKEN=$(curl -s -X POST https://alocubanoboulderfest.com/api/admin/login \
  -d '{"password":"'$ADMIN_PASSWORD'"}' \
  -H "Content-Type: application/json" | jq -r '.token')

# Clear expired entries
curl -X POST https://alocubanoboulderfest.com/api/cache/clear \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"selective","reason":"Daily maintenance"}'

# Warm critical sections
curl -X POST https://alocubanoboulderfest.com/api/cache/warm \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"sections":["event","tickets"],"priority":"normal"}'

# Check effectiveness
GRADE=$(curl -H "Authorization: Bearer $TOKEN" \
  https://alocubanoboulderfest.com/api/cache/stats?format=summary | \
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
      const response = await fetch("/api/cache/stats", {
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
