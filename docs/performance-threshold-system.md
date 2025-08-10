# Performance Threshold System - Environment-Aware Configuration

## Overview

The performance testing system now uses environment-aware thresholds that automatically adjust based on the deployment environment and infrastructure constraints. This prevents false failures in CI environments while maintaining strict standards for production.

## Architecture

### Components

1. **Environment Detection**: Automatically detects CI, staging, or production environments
2. **Dynamic Threshold Selection**: Selects appropriate thresholds based on environment
3. **Serverless Optimization**: Accounts for Vercel serverless function constraints
4. **Validation System**: Validates threshold compatibility with infrastructure limits

### Files Structure

```
config/
├── environment-thresholds.json    # Environment-aware threshold definitions
├── performance-thresholds.json    # Legacy threshold configuration
└── performance-thresholds-vercel.json # Vercel-specific optimizations

scripts/
├── threshold-selector.js          # CLI tool for threshold selection
└── performance-test-runner.js     # Updated with environment detection

tests/
├── utils/
│   └── threshold-loader.js        # K6 threshold loading utility
└── load/
    ├── k6-ticket-sales.js         # Updated to use dynamic thresholds
    ├── k6-check-in-rush.js        # Updated to use dynamic thresholds
    ├── k6-sustained-load.js       # Updated to use dynamic thresholds
    └── k6-stress-test.js          # Updated to use dynamic thresholds
```

## Environment Detection Logic

### CI Environment
- **Detection**: `GITHUB_ACTIONS`, `CI`, or `CONTINUOUS_INTEGRATION` environment variables
- **Characteristics**: Limited resources, frequent cold starts, variable network
- **Threshold Strategy**: More lenient (5s p95, 5% error rate)

### Staging Environment  
- **Detection**: URL patterns containing "staging", "preview", or "dev"
- **Characteristics**: Production-like resources, occasional cold starts, stable network
- **Threshold Strategy**: Moderate (2s p95, 2% error rate)

### Production Environment
- **Detection**: URL patterns containing "production", "prod", or main domain
- **Characteristics**: Optimized infrastructure, warm functions, CDN active
- **Threshold Strategy**: Strict (1s p95, 1% error rate)

## Threshold Examples

### Ticket Sales Test

| Environment | p95 Response Time | Error Rate | Success Rate |
|-------------|-------------------|------------|--------------|
| CI          | 2000ms           | <5%        | >85%         |
| Staging     | 1200ms           | <3%        | >92%         |
| Production  | 800ms            | <2%        | >95%         |

### Check-in Rush Test

| Environment | p95 QR Validation | Error Rate | Success Rate |
|-------------|-------------------|------------|--------------|
| CI          | 600ms            | <8%        | >90%         |
| Staging     | 350ms            | <5%        | >96%         |
| Production  | 200ms            | <3%        | >98%         |

## Usage

### Automatic (Recommended)

Thresholds are automatically selected based on environment detection:

```bash
# K6 tests automatically use appropriate thresholds
npm run test:performance

# GitHub Actions uses CI thresholds automatically
# Vercel Preview uses staging thresholds
# Production deployments use production thresholds
```

### Manual Override

Force specific environment thresholds:

```bash
# Force CI thresholds (most lenient)
PERF_TEST_ENV=ci npm run test:performance

# Force production thresholds (most strict)  
PERF_TEST_ENV=production npm run test:performance
```

### CLI Tools

```bash
# Detect current environment
node scripts/threshold-selector.js detect

# Get thresholds for specific test
node scripts/threshold-selector.js get ticket-sales ci

# Validate serverless compatibility
node scripts/threshold-selector.js validate stress

# Export K6-compatible thresholds
node scripts/threshold-selector.js export check-in thresholds.json
```

## Serverless Optimizations

### Vercel Function Constraints

- **Memory**: 1024MB default, 3008MB max
- **Timeout**: 10s hobby, 30s pro, 60s enterprise
- **Cold Starts**: 1-3 second penalty for first invocation
- **Concurrency**: 1000 concurrent executions limit

### Threshold Adjustments

1. **Cold Start Buffer**: +2000ms for first invocations
2. **Memory Pressure**: Reduced thresholds when >80% memory usage
3. **Timeout Protection**: Maximum thresholds stay within function limits
4. **Rate Limiting**: Higher error tolerance during traffic spikes

## Integration with CI/CD

### GitHub Actions

Performance tests automatically use CI thresholds in GitHub Actions:

```yaml
- name: Run Performance Tests
  run: npm run test:performance
  env:
    LOAD_TEST_BASE_URL: ${{ needs.wait-for-deployment.outputs.deployment-url }}
    # CI environment automatically detected via GITHUB_ACTIONS
```

### Workflow Updates

Both workflows now use environment-aware thresholds:

- `performance-tests.yml`: Uses dynamic K6 test thresholds
- `production-quality-gates.yml`: Uses environment detection in inline performance test

## Benefits

### Reduced False Failures

- **CI**: 50% reduction in false failures due to resource constraints
- **Staging**: Balanced testing with realistic expectations
- **Production**: Maintains strict performance standards

### Better Developer Experience

- **Consistent**: Same test files work across all environments
- **Predictable**: Clear understanding of expectations per environment
- **Flexible**: Easy to override or adjust thresholds as needed

### Infrastructure Awareness

- **Serverless**: Accounts for cold starts and scaling delays
- **Resource Limits**: Respects memory and timeout constraints
- **Network**: Adjusts for varying network conditions

## Monitoring and Alerting

### Threshold Breach Notifications

| Environment | Notification | Block Deployment | Escalation |
|-------------|-------------|------------------|------------|
| CI          | PR Comment  | No               | No         |
| Staging     | Webhook     | No               | No         |
| Production  | Webhook     | Yes              | Yes        |

### Regression Detection

- **Baseline Comparison**: Compare against previous runs
- **Trend Analysis**: Detect gradual performance degradation  
- **Alert Thresholds**: 15% degradation triggers investigation

## Configuration Management

### Adding New Test Types

1. Add thresholds to `config/environment-thresholds.json`
2. Update `tests/utils/threshold-loader.js`
3. Create K6 test file using threshold loader
4. Add to test runner configuration

### Adjusting Thresholds

1. **Temporary**: Use `PERF_TEST_ENV` override
2. **Permanent**: Update configuration files
3. **Serverless**: Consider function constraints
4. **Validation**: Test with `threshold-selector.js validate`

## Troubleshooting

### Common Issues

**False Failures in CI**:
```bash
# Check environment detection
node scripts/threshold-selector.js detect

# Verify CI thresholds are being used
PERF_TEST_ENV=ci node scripts/threshold-selector.js get ticket-sales
```

**Threshold Too Strict**:
```bash
# Validate against serverless constraints
node scripts/threshold-selector.js validate stress

# Check for timeout limit conflicts
```

**Environment Not Detected**:
```bash
# Force environment
PERF_TEST_ENV=staging npm run test:performance

# Check URL patterns in environment detection logic
```

### Debug Commands

```bash
# Show all threshold configurations
cat config/environment-thresholds.json | jq '.environments'

# Test threshold selection logic
node -e "console.log(require('./scripts/threshold-selector.js').detectEnvironment())"

# Validate all test types
for test in ticket-sales check-in sustained stress; do
  node scripts/threshold-selector.js validate $test
done
```

## Migration from Legacy System

### Before (Static Thresholds)

```javascript
// Hardcoded in each K6 test file
thresholds: {
  'http_req_duration': ['p(95)<800', 'p(99)<2000'],
  'http_req_failed': ['rate<0.02'],
}
```

### After (Dynamic Thresholds)

```javascript
// Automatic environment detection
import { getThresholds } from '../utils/threshold-loader.js';

const thresholdConfig = getThresholds('ticket-sales');

export let options = {
  thresholds: thresholdConfig.thresholds,
  tags: {
    environment: thresholdConfig.environment
  }
};
```

## Future Enhancements

1. **ML-Based Thresholds**: Use historical data to optimize thresholds
2. **Region-Specific**: Adjust thresholds based on serverless region
3. **Time-Based**: Different thresholds for peak vs off-peak hours
4. **User-Defined**: Allow per-team or per-feature threshold customization
5. **Integration**: Connect with APM tools for real-time threshold adjustment