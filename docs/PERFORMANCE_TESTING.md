# Performance Testing Infrastructure

Comprehensive performance testing system for the A Lo Cubano Boulder Fest ticketing platform, featuring load testing, regression detection, and automated quality gates.

## Overview

The performance testing infrastructure consists of four main components:

1. **Unit Performance Tests** - Fast, isolated performance benchmarks
2. **Load Integration Tests** - Realistic concurrent user simulations
3. **K6 Load Tests** - High-scale distributed load testing
4. **Regression Detection** - Statistical analysis and trend monitoring

## Quick Start

### Prerequisites

```bash
# Install K6 for load testing
npm run k6:install

# Verify K6 installation
npm run k6:check
```

### Run Performance Tests

```bash
# Run unit performance tests (fast)
npm run performance:load-test

# Run checkout flow benchmarking
npm run performance:checkout-bench

# Run load integration tests
npm run performance:load-integration

# Run K6 load tests
npm run performance:critical

# Run regression analysis
npm run performance:regression

# Run complete performance suite
npm run performance:full-suite
```

## Test Components

### 1. Unit Performance Tests

**Location**: `tests/performance/`

Fast, isolated tests that measure specific component performance:

- **Checkout Performance** (`checkout-performance.test.js`): Benchmarks the complete ticket purchase flow
- **Load Integration** (`load-integration.test.js`): Tests concurrent user scenarios with K6 integration

#### Key Features:

- Performance budgets with automatic validation
- Memory leak detection
- Concurrency testing
- Statistical analysis and trending
- Browser simulation with localStorage mocking

#### Example Usage:

```bash
# Run specific performance test
npm run performance:checkout-bench

# Run with verbose output
npm run performance:load-test -- --reporter=verbose
```

### 2. K6 Load Tests

**Location**: `tests/load/`

High-scale distributed load testing using K6:

- **Ticket Sales** (`k6-ticket-sales.js`): Peak ticket purchasing scenarios
- **Check-in Rush** (`k6-check-in-rush.js`): QR code validation under load
- **Sustained Load** (`k6-sustained-load.js`): Long-running stability tests
- **Stress Testing** (`k6-stress-test.js`): Breaking point analysis

#### K6 Test Features:

- Realistic user behavior simulation
- Environment-aware thresholds
- Vercel serverless optimizations
- Custom business metrics
- Automated warm-up procedures

### 3. Regression Detection

**Location**: `scripts/check-performance-regression.js`

Advanced statistical analysis for performance regression detection:

#### Algorithms:

- **Statistical Regression**: Z-score based analysis with confidence intervals
- **Percentage Regression**: Baseline comparison with moving averages
- **Trend Analysis**: Linear regression with seasonal adjustments
- **Anomaly Detection**: IQR and z-score outlier detection

#### Features:

- Multi-algorithm composite analysis
- Historical trend tracking
- Performance budget validation
- Automated alerting and reporting
- CI/CD integration with quality gates

## Performance Budgets

Performance budgets are defined in `config/performance-budgets.json` and automatically validated:

### Global Budgets

- **Response Time**: P95 < 800ms, Average < 500ms
- **Error Rate**: < 2% HTTP errors, < 1% API errors
- **Throughput**: > 20 RPS minimum, 50 RPS target
- **Availability**: > 99.5% uptime

### Scenario-Specific Budgets

- **Ticket Purchase**: End-to-end < 5s, Conversion > 15%
- **Check-in**: QR validation < 200ms, Success rate > 99%
- **Browsing**: Page load < 2s, API responses < 500ms

## CI/CD Integration

### GitHub Actions Workflow

The performance testing workflow (`.github/workflows/performance-testing.yml`) provides:

- **Automated Test Execution**: Runs on every push to main/develop
- **Pull Request Validation**: Performance gates for PR approval
- **Baseline Management**: Automatic baseline updates on main branch
- **Comprehensive Reporting**: HTML and JSON reports with artifacts
- **Slack Integration**: Real-time alerts for performance issues
- **GitHub Issues**: Automatic issue creation for regressions

### Quality Gates

Performance quality gates are enforced at different levels:

#### Pull Request Gates:

- No critical regressions allowed
- Maximum 2 warning-level regressions
- 1 budget violation allowed
- Minimum 90% success rate

#### Main Branch Gates:

- No critical regressions allowed
- Maximum 1 warning-level regression
- 0 budget violations allowed
- Minimum 95% success rate

#### Release Gates:

- No regressions of any kind
- 0 budget violations allowed
- Minimum 98% success rate
- 99.9% availability requirement

## Environment Configuration

Performance tests adapt to different environments automatically:

### Environment Detection

- **CI**: Detected via `CI=true` or GitHub Actions
- **Staging**: URLs containing 'staging', 'preview', or 'dev'
- **Production**: URLs containing 'prod' or main domain
- **Development**: Local development environment

### Environment Multipliers

Different environments have adjusted thresholds:

```json
{
  "development": { "responseTime": 2.0, "errorRate": 3.0 },
  "staging": { "responseTime": 1.5, "errorRate": 2.0 },
  "ci": { "responseTime": 3.0, "errorRate": 5.0 },
  "production": { "responseTime": 1.0, "errorRate": 1.0 }
}
```

## Advanced Features

### Statistical Analysis

The regression detection system uses multiple statistical methods:

1. **Z-Score Analysis**: Detects outliers based on standard deviation
2. **Percentage Change**: Compares against recent baselines
3. **Trend Analysis**: Uses linear regression for trend prediction
4. **Composite Scoring**: Combines multiple methods with weighted confidence

### Memory Management

Performance tests include comprehensive memory management:

- **Memory Leak Detection**: Tracks heap growth during test execution
- **Garbage Collection Monitoring**: Measures GC impact on performance
- **Resource Cleanup**: Automatic cleanup of test artifacts
- **Memory Budget Validation**: Prevents excessive memory usage

### Vercel Serverless Optimizations

Special handling for Vercel deployment characteristics:

- **Cold Start Detection**: Identifies and accounts for cold start delays
- **Function Warm-up**: Pre-warms serverless functions before testing
- **Timeout Handling**: Handles serverless timeout scenarios gracefully
- **Edge Region Awareness**: Accounts for edge computing performance

## Monitoring and Alerting

### Real-time Monitoring

- **Performance Dashboards**: Grafana integration for real-time metrics
- **Trend Visualization**: Historical performance trend analysis
- **Alert Management**: Multi-channel alerting (Slack, email, GitHub)

### Report Generation

- **HTML Reports**: Comprehensive visual reports with charts
- **JSON Reports**: Machine-readable data for integrations
- **Executive Summaries**: High-level performance overviews
- **Recommendation Engine**: Automated performance improvement suggestions

## Troubleshooting

### Common Issues

#### K6 Not Found

```bash
# Install K6
npm run k6:install

# Or install manually
brew install k6  # macOS
```

#### Test Timeouts

```bash
# Increase timeout for slow environments
export LOAD_TEST_TIMEOUT=180000  # 3 minutes
```

#### Memory Issues

```bash
# Run tests with memory constraints
export NODE_OPTIONS="--max-old-space-size=4096"
npm run performance:load-test
```

### Performance Debugging

#### Enable Debug Mode

```bash
# Verbose performance output
npm run performance:load-test -- --verbose

# Regression analysis with detailed output
npm run performance:regression:verbose
```

#### Memory Profiling

```bash
# Run with memory tracking
npm run performance:checkout-bench -- --reporter=verbose
```

### Environment Variables

Key environment variables for performance testing:

```bash
# Test configuration
LOAD_TEST_BASE_URL=https://your-app.vercel.app
LOAD_TEST_DURATION=5m
LOAD_TEST_MAX_VUS=50
NODE_ENV=production
PERF_TEST_ENV=ci

# Alerting configuration
SLACK_PERFORMANCE_WEBHOOK=https://hooks.slack.com/...
PERFORMANCE_EMAIL_LIST=team@example.com

# Monitoring integration
GRAFANA_PERFORMANCE_DASHBOARD=https://grafana.com/...
DATADOG_API_KEY=your_datadog_key
```

## Best Practices

### Writing Performance Tests

1. **Use Realistic Data**: Test with production-like data volumes
2. **Measure What Matters**: Focus on user-impacting metrics
3. **Set Appropriate Budgets**: Balance performance with practicality
4. **Test Edge Cases**: Include error scenarios and edge conditions
5. **Clean Up Resources**: Always clean up test artifacts

### Performance Optimization

1. **Profile Before Optimizing**: Use data to guide optimization efforts
2. **Optimize Critical Paths**: Focus on high-impact user journeys
3. **Monitor Continuously**: Use automated monitoring for early detection
4. **Test Early and Often**: Integrate performance testing in development
5. **Document Changes**: Track performance impacts of code changes

### CI/CD Best Practices

1. **Run Critical Tests on Every PR**: Catch issues before merge
2. **Update Baselines Regularly**: Keep performance expectations current
3. **Monitor Trends**: Look for gradual performance degradation
4. **Set Clear Quality Gates**: Define clear pass/fail criteria
5. **Automate Everything**: Minimize manual intervention in testing

## Performance Test Results

Performance test results are stored in the following locations:

- **Load Test Results**: `reports/load-test-results/`
- **Performance Baselines**: `reports/performance-baselines/`
- **Regression Analysis**: `reports/regression-analysis/`

### Report Structure

```
reports/
├── load-test-results/
│   ├── ticket-sales-2025-01-11-1234.json
│   ├── check-in-rush-2025-01-11-1235.json
│   └── performance-report-2025-01-11-1236.html
├── performance-baselines/
│   └── performance-baselines.json
└── regression-analysis/
    ├── regression-analysis-2025-01-11.json
    └── regression-analysis-2025-01-11.html
```

## Contributing

When adding new performance tests:

1. Follow the existing test structure and naming conventions
2. Include appropriate performance budgets
3. Add documentation for new metrics or scenarios
4. Update CI/CD configuration if needed
5. Test in multiple environments before merging

## Support

For questions or issues with performance testing:

- Review this documentation first
- Check the GitHub Actions logs for detailed error information
- Look at the generated performance reports
- Create an issue with performance test results attached

---

**Note**: Performance testing results may vary based on system load, network conditions, and other environmental factors. Always analyze trends over time rather than individual test results.
