# Performance Testing for Vercel Serverless Deployment

This document outlines the optimized performance testing strategy for A Lo Cubano Boulder Fest, specifically tailored for Vercel's serverless environment.

## Overview

The performance testing suite has been optimized to address Vercel serverless characteristics:

- **Cold start penalties**: Extended timeouts and warm-up strategies
- **Function timeouts**: Reduced test duration and request timeouts
- **Auto-scaling behavior**: Adjusted load patterns and expectations
- **Edge caching**: Realistic cache hit rate expectations
- **Cost optimization**: Efficient resource usage and test duration

## Test Suite Configuration

### 1. Ticket Sales Test (`k6-ticket-sales.js`)

**Optimizations:**

- **VUs**: Reduced from 150 to 100 concurrent users
- **Thresholds**: P95 < 800ms (was 500ms), P99 < 2000ms (was 1000ms)
- **Error tolerance**: 2% (was 1%) to account for cold starts
- **Cold start mitigation**: Function warm-up on first VU iteration
- **Serverless headers**: Added `X-Vercel-Serverless` for optimization hints

### 2. Check-in Rush Test (`k6-check-in-rush.js`)

**Optimizations:**

- **Rate**: Reduced from 15/sec to 10/sec for serverless stability
- **VUs**: Reduced from 75 to 50 concurrent users
- **Thresholds**: P95 < 200ms (was 100ms), success rate 95% (was 98%)
- **Batch processing**: Limited offline sync batch sizes to 10 items
- **Function timeouts**: 8s max (within Vercel 10s limit)

### 3. Sustained Load Test (`k6-sustained-load.js`)

**Optimizations:**

- **Duration**: Reduced from 30m to 20m for cost efficiency
- **VUs**: Reduced from 100 to 75 concurrent users
- **Memory limits**: 256MB average (Vercel function limits)
- **Cache expectations**: 60% hit rate (was 70%) for edge variability
- **Function warm-up**: Periodic warm-up every 50 iterations

### 4. Stress Test (`k6-stress-test.js`)

**Optimizations:**

- **Peak VUs**: Reduced from 500 to 300 (reasonable for serverless)
- **Duration**: Reduced from 20m to 15m for cost control
- **Thresholds**: P95 < 3000ms, 15% error tolerance for extreme load
- **Recovery time**: 60s (was 30s) for serverless auto-scaling
- **Function limits**: 20s timeouts to stay within Vercel limits

## Serverless-Specific Features

### Cold Start Mitigation

```javascript
// Function warm-up before test execution
function warmUpFunctions() {
  const warmupEndpoints = [
    "/api/health/check",
    "/api/cart/create",
    "/api/tickets/availability",
  ];

  for (const endpoint of warmupEndpoints) {
    http.get(`${BASE_URL}${endpoint}`, {
      tags: { name: "warmup" },
      timeout: "10s",
    });
  }
}
```

### Retry Logic for Cold Starts

```javascript
// Retry failed requests once (likely cold start)
if (response.status === 504 || response.status === 502) {
  sleep(1);
  response = http.get(url, {
    tags: { name: "retry" },
    timeout: "10s",
  });
}
```

### Serverless Context Headers

```javascript
headers: {
  'X-Vercel-Serverless': 'true',
  'X-Vercel-Max-Duration': '20',
  'Content-Type': 'application/json'
}
```

## Performance Baselines

### Vercel-Specific Thresholds

Located in `config/performance-thresholds-vercel.json`:

```json
{
  "ticket-sales": {
    "response_time": {
      "avg": 600,
      "p95": 800,
      "p99": 2000
    },
    "serverless_specific": {
      "cold_start_rate": 0.1,
      "function_timeout_rate": 0.02
    }
  }
}
```

### Performance Gates

- **Preview deployments**: 15% degradation tolerance
- **Production deployments**: 5% degradation tolerance
- **Error rates**: 3-5% depending on test type
- **Cold start tolerance**: Up to 10% of requests

## CI/CD Integration

### GitHub Actions Workflow

File: `.github/workflows/performance-testing.yml`

**Features:**

- Automatic Vercel deployment detection
- Performance gate evaluation
- PR comment with results
- Artifact retention for analysis

**Triggers:**

- Pull requests (performance-related branches)
- Manual workflow dispatch
- Production deployments (optional)

### Usage Examples

#### Manual Performance Test

```bash
# Test against local development
npm run performance:critical

# Test against Vercel preview
VERCEL_URL=https://preview-url.vercel.app npm run performance:vercel:preview

# Test against production
npm run performance:vercel:production
```

#### CI Integration Script

```bash
# Run CI-optimized performance tests
node scripts/performance-ci-integration.js

# With specific deployment URL
LOAD_TEST_BASE_URL=https://your-app.vercel.app node scripts/performance-ci-integration.js
```

## Monitoring and Analysis

### Key Metrics for Serverless

1. **Cold Start Rate**: Percentage of requests with >2s response time
2. **Function Timeout Rate**: 504/502 responses indicating timeouts
3. **Memory Usage**: Track against Vercel function limits
4. **Edge Cache Hit Rate**: CDN and edge function performance
5. **Auto-scaling Behavior**: Response time during load ramp-up

### Recommended Dashboards

#### Vercel Analytics Integration

```javascript
// Custom metrics for Vercel
const serverlessMetrics = {
  coldStarts: new Rate("cold_start_rate"),
  functionTimeouts: new Rate("function_timeout_rate"),
  memoryPressure: new Trend("memory_pressure_mb"),
  edgeCacheHits: new Rate("edge_cache_hit_rate"),
};
```

#### Grafana Dashboards

- Function invocation frequency
- Response time percentiles
- Error rate by function
- Memory and CPU utilization
- Cold start patterns

## Cost Optimization

### Test Execution Guidelines

- **Preview deployments**: Run critical tests only (ticket-sales, check-in)
- **Production testing**: Limit to off-peak hours
- **Parallel execution**: Use cautiously to avoid rate limits
- **Test duration**: Keep under 20 minutes for cost control

### Resource Usage

- **Concurrent VUs**: Limited to 100 max to prevent overwhelming serverless functions
- **Request rate**: Optimized for serverless scaling characteristics
- **Test frequency**: Automated tests only on performance-related changes

## Troubleshooting

### Common Issues

#### High Error Rates

**Symptoms**: >5% HTTP failures
**Causes**: Cold starts, rate limiting, function timeouts
**Solutions**:

- Reduce concurrent load
- Increase warm-up time
- Check function memory allocation

#### Slow Response Times

**Symptoms**: P95 > 2000ms consistently
**Causes**: Cold starts, database connection delays, inefficient code
**Solutions**:

- Implement connection pooling
- Optimize database queries
- Use function keep-warm strategies

#### Test Timeouts

**Symptoms**: K6 tests timeout or hang
**Causes**: Serverless function cold start cascade
**Solutions**:

- Extend test timeouts to 25s max
- Implement exponential backoff
- Pre-warm functions before testing

### Debug Commands

```bash
# Check function cold start patterns
npm run k6:vercel:ticket-sales -- --env DEBUG=true

# Monitor function performance during test
curl "https://your-app.vercel.app/api/monitoring/metrics?serverless=true"

# Test individual endpoints for cold starts
curl -w "@curl-format.txt" "https://your-app.vercel.app/api/cart/create"
```

## Best Practices

### Test Development

1. **Always test locally first** before running against Vercel
2. **Use realistic load patterns** that match actual user behavior
3. **Include serverless context** in all API requests
4. **Monitor cost implications** of test execution
5. **Validate baselines regularly** as Vercel platform evolves

### Production Testing

1. **Schedule during low-traffic periods**
2. **Use graduated load increases** to prevent overwhelming functions
3. **Monitor real user impact** during testing
4. **Have rollback plans** if performance degrades
5. **Document all performance changes** for future reference

### Continuous Improvement

1. **Review baselines monthly** to account for platform improvements
2. **Update thresholds** based on actual production performance
3. **Optimize test efficiency** to reduce execution time and cost
4. **Share performance insights** with development team
5. **Automate performance regression detection** in CI/CD

## References

- [Vercel Serverless Functions Documentation](https://vercel.com/docs/functions/serverless-functions)
- [K6 Performance Testing Documentation](https://k6.io/docs/)
- [Vercel Edge Network Performance](https://vercel.com/docs/edge-network/overview)
- [Performance Monitoring Best Practices](https://web.dev/performance-monitoring-best-practices/)
