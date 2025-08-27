# E2E Test Flakiness Detection & Reliability System

A comprehensive system for detecting flaky tests, monitoring test reliability, and providing actionable insights to improve E2E test stability.

## Features

### 🔍 Statistical Flakiness Detection
- **Threshold-based detection**: Automatically flags tests with >5% failure rate
- **Pattern analysis**: Identifies timing, network, or DOM-related issues
- **Historical tracking**: Maintains test execution history for trend analysis

### ⚡ Intelligent Retry Logic
- **Exponential backoff**: Automatically increases retry delays
- **Custom retry strategies**: Per-test retry configuration
- **Error pattern recognition**: Different retry logic for different failure types

### 📈 Performance Monitoring
- **Regression detection**: Identifies >20% performance degradations
- **Baseline tracking**: Establishes performance baselines for comparison
- **Execution time analysis**: Tracks test duration trends over time

### 🔧 Environment Consistency
- **Environment snapshots**: Captures system state for each test run
- **Consistency validation**: Detects environment changes that affect test reliability
- **Git integration**: Tracks code changes and their impact on test stability

### 📊 Dashboard & Metrics
- **Stability dashboard**: Comprehensive overview of test health
- **Actionable recommendations**: Specific suggestions for improving flaky tests
- **Trend analysis**: Historical reliability and performance trends

## Quick Start

### 1. Integration with Playwright

The system is automatically integrated with Playwright via the custom reporter in `playwright.config.js`:

```javascript
reporter: [
  // ... other reporters
  ["./tests/e2e/monitoring/test-reporter.js", { 
    enableEnvironmentValidation: true,
    generateDashboard: true 
  }],
]
```

### 2. Running Tests with Monitoring

Simply run your E2E tests as usual - monitoring happens automatically:

```bash
# Run E2E tests with automatic monitoring
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/flows/gallery-browsing.test.js
```

### 3. Viewing Stability Dashboard

Use the built-in dashboard viewer to analyze test reliability:

```bash
# View dashboard summary
npm run test:stability

# Generate fresh dashboard data
npm run test:stability:generate

# View only flaky tests
npm run test:stability:flaky

# View performance regressions
npm run test:stability:performance

# View recommendations
npm run test:stability:recommendations
```

## Advanced Usage

### Manual Test Monitoring

For enhanced control, use `executeTestWithMonitoring()`:

```javascript
import { executeTestWithMonitoring } from '../monitoring/flakiness-detector.js';

test('Enhanced monitoring example', async ({ page }) => {
  const testInfo = {
    file: __filename,
    title: 'my-test-name',
    project: { name: 'chromium' }
  };

  await executeTestWithMonitoring(
    async () => {
      // Your test logic here
      await page.goto('/gallery');
      await expect(page.locator('.gallery-container')).toBeVisible();
      return { success: true };
    },
    testInfo,
    {
      validateEnvironment: true,
      requireConsistentEnvironment: false,
      retry: {
        maxAttempts: 3,
        baseDelay: 1000
      }
    }
  );
});
```

### Custom Retry Strategies

Register custom retry strategies for specific test patterns:

```javascript
import { registerTestRetryStrategy } from '../monitoring/flakiness-detector.js';

// Network-sensitive tests
registerTestRetryStrategy('**/network-*', {
  maxAttempts: 4,
  calculateDelay: (attempt, error, defaultDelay) => {
    if (error.message.includes('timeout')) {
      return 5000 * attempt; // Longer delays for network issues
    }
    return defaultDelay;
  }
});

// DOM-related tests
registerTestRetryStrategy('**/dom-*', {
  maxAttempts: 3,
  calculateDelay: (attempt) => 500 * attempt, // Quick retries for DOM races
});
```

### Environment Validation

Enable strict environment consistency checking:

```javascript
await executeTestWithMonitoring(
  testFunction,
  testInfo,
  {
    validateEnvironment: true,
    requireConsistentEnvironment: true // Fail if environment changed
  }
);
```

## Dashboard Interpretation

### Reliability Scores
- **✅ >95%**: Excellent reliability
- **⚠️ 85-95%**: Good reliability, monitor for issues
- **❌ <85%**: Poor reliability, requires attention

### Flakiness Patterns
- **Timing**: Add waits, increase timeouts
- **Network**: Add retry logic, improve error handling
- **DOM**: Improve selectors, add element state checks

### Performance Metrics
- **Regression**: >20% increase in execution time
- **Stability**: Consistent execution times indicate stable tests
- **Trends**: Watch for gradual performance degradation

## Configuration

### System Configuration

Located in `tests/e2e/monitoring/flakiness-detector.js`:

```javascript
const CONFIG = {
  FLAKINESS_THRESHOLD: 0.05, // 5% failure rate threshold
  PERFORMANCE_REGRESSION_THRESHOLD: 0.20, // 20% increase threshold
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 1000, // Base delay for exponential backoff
  DATA_RETENTION_DAYS: 30,
  CONCURRENT_EXECUTION_LIMIT: 10,
  STABILITY_SAMPLE_SIZE: 10, // Minimum runs for stability analysis
};
```

### Reporter Configuration

In `playwright.config.js`:

```javascript
["./tests/e2e/monitoring/test-reporter.js", { 
  enableEnvironmentValidation: true,  // Check environment consistency
  generateDashboard: true,            // Generate dashboard after run
  cleanupInterval: 24 * 60 * 60 * 1000 // 24-hour cleanup cycle
}]
```

## Data Storage

Monitoring data is stored in `.tmp/e2e-monitoring/`:

```
.tmp/e2e-monitoring/
├── test-history.json          # Test execution history
├── stability-metrics.json     # Dashboard and metrics data
└── environment-snapshots.json # Environment consistency data
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run test:stability` | View dashboard summary |
| `npm run test:stability:generate` | Generate fresh dashboard data |
| `npm run test:stability:flaky` | Show flaky tests only |
| `npm run test:stability:performance` | Show performance regressions |
| `npm run test:stability:recommendations` | Show actionable recommendations |

### Command Line Options

```bash
# View all dashboard sections
node scripts/view-test-stability.js

# Generate fresh data and show flaky tests
node scripts/view-test-stability.js --generate --flaky

# Show performance and recommendations
node scripts/view-test-stability.js --performance --recommendations

# Show help
node scripts/view-test-stability.js --help
```

## Troubleshooting

### Common Issues

1. **No dashboard data found**
   - Run tests to generate data: `npm run test:e2e`
   - Or generate manually: `npm run test:stability:generate`

2. **Environment consistency failures**
   - Check for system changes (Node version, Git branch)
   - Disable strict checking: `requireConsistentEnvironment: false`

3. **High flakiness detection**
   - Review recommended actions in dashboard
   - Implement suggested retry strategies
   - Investigate test implementation patterns

### Debug Mode

Enable debug logging:

```bash
DEBUG=true node scripts/view-test-stability.js
```

## Integration Examples

See `tests/e2e/examples/flakiness-monitoring-example.test.js` for comprehensive usage examples including:

- Basic monitoring integration
- Custom retry strategies
- Environment validation
- Performance monitoring
- Concurrent execution tracking

## Best Practices

### 1. Test Implementation
- Use stable selectors (avoid dynamic IDs)
- Implement proper waits (not fixed timeouts)
- Handle network errors gracefully
- Use data attributes for test selectors

### 2. Retry Strategies
- Network tests: Longer delays, more attempts
- DOM tests: Quick retries for race conditions
- Performance tests: Fewer retries to maintain accuracy

### 3. Environment Management
- Keep test environments stable
- Use consistent Node.js versions
- Maintain clean Git state during testing
- Monitor system resources

### 4. Dashboard Monitoring
- Review dashboard after CI runs
- Address high-priority recommendations promptly
- Track reliability trends over time
- Use metrics to guide test improvements

## Contributing

To extend the flakiness detection system:

1. **Add new analysis patterns** in `analyzeFailurePattern()`
2. **Implement custom retry strategies** via `registerTestRetryStrategy()`
3. **Extend environment checks** in `captureEnvironmentSnapshot()`
4. **Add dashboard metrics** in `generateStabilityMetrics()`

The system is designed to be extensible and production-ready with comprehensive error handling and performance optimization.