# Performance Testing System

A comprehensive automated performance testing orchestration system for A Lo Cubano Boulder Fest, providing load testing, baseline management, regression detection, and detailed reporting.

## 📋 Overview

The performance testing system consists of:

- **K6 Load Tests**: Realistic user journey simulations
- **Test Orchestrator**: Automated execution and management
- **Baseline System**: Performance regression detection
- **Comprehensive Reporting**: HTML/JSON reports with insights
- **CI/CD Integration**: Automated quality gates
- **Alert System**: Real-time notifications for performance issues

## 🚀 Quick Start

### Prerequisites

1. **Install K6**:

   ```bash
   # macOS
   brew install k6

   # Linux
   curl -L "https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz" | tar xvz
   sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

   # Or use npm script
   npm run k6:install
   ```

2. **Verify Installation**:
   ```bash
   npm run k6:check
   ```

### Basic Usage

1. **Run Critical Performance Tests**:

   ```bash
   npm run performance:critical
   ```

2. **Run All Performance Tests**:

   ```bash
   npm run performance:all
   ```

3. **Run Tests in Parallel** (faster execution):

   ```bash
   npm run performance:parallel
   ```

4. **Update Performance Baselines**:
   ```bash
   npm run performance:baseline
   ```

## 🧪 Available Tests

### 1. Ticket Sales Test (`ticket-sales`)

**File**: `tests/load/k6-ticket-sales.js`

Simulates peak ticket purchasing scenarios with:

- 150 concurrent users at peak
- Complete user journey (browse → cart → payment → confirmation)
- Payment processing with Stripe test cards
- Shopping cart operations
- Realistic user behavior patterns

**Key Metrics**:

- Payment success rate > 95%
- Checkout completion rate > 90%
- P95 response time < 500ms
- Error rate < 1%

### 2. Check-in Rush Test (`check-in`)

**File**: `tests/load/k6-check-in-rush.js`

Tests QR code validation during event entry:

- 15 QR validations per second sustained
- 50-75 concurrent check-in devices
- Duplicate scan detection
- Offline/online synchronization
- Mobile device performance simulation

**Key Metrics**:

- Check-in success rate > 98%
- QR validation time < 100ms (P95)
- Duplicate detection accuracy
- Offline sync performance

### 3. Sustained Load Test (`sustained`)

**File**: `tests/load/k6-sustained-load.js`

Long-running stability test:

- 30 minutes duration
- 100 concurrent users
- System stability validation
- Memory leak detection
- Resource utilization monitoring

**Key Metrics**:

- P95 response time < 300ms
- Error rate < 0.5%
- Stable memory usage
- No performance degradation over time

### 4. Stress Test (`stress`)

**File**: `tests/load/k6-stress-test.js`

Breaking point analysis:

- Up to 500 concurrent users
- System capacity limits
- Graceful degradation testing
- Recovery behavior validation

**Key Metrics**:

- Graceful handling of overload
- P95 response time < 1000ms under stress
- Error rate < 5% at breaking point

## 📊 Test Orchestration

### Command Line Interface

```bash
# Basic execution
node scripts/performance-test-runner.js [options]

# Available options:
--tests=<list>          # Comma-separated test list (ticket-sales,check-in,sustained,stress)
--url=<url>             # Target URL for testing
--parallel              # Run tests in parallel
--update-baselines      # Update performance baselines
--skip-health-check     # Skip target system health check
--verbose, -v           # Enable verbose output
--help, -h              # Show help message
```

### NPM Scripts

```bash
# Quick access commands
npm run performance                    # Run default tests
npm run performance:critical           # Ticket sales + check-in tests
npm run performance:all               # All test scenarios
npm run performance:parallel          # Parallel execution
npm run performance:baseline          # Update baselines
npm run performance:staging           # Test against staging
npm run performance:production        # Test against production
```

### Examples

```bash
# Run ticket sales test only
node scripts/performance-test-runner.js --tests=ticket-sales

# Run multiple tests in parallel against staging
node scripts/performance-test-runner.js \
  --tests=ticket-sales,check-in \
  --url=https://staging.alocubano.com \
  --parallel

# Update baselines with verbose output
node scripts/performance-test-runner.js \
  --update-baselines \
  --verbose
```

## 📈 Baseline Management

### How Baselines Work

1. **First Run**: Establishes baseline metrics
2. **Subsequent Runs**: Compare against baseline
3. **Regression Detection**: Alerts when performance degrades
4. **Baseline Updates**: Update when improvements are made

### Baseline Storage

Baselines are stored in:

```
reports/performance-baselines/performance-baselines.json
```

### Regression Thresholds

- **Response Time**: > 10% increase = regression
- **Error Rate**: > 2% increase = regression
- **Throughput**: > 15% decrease = regression
- **Success Rate**: > 5% decrease = regression

## 📋 Reporting System

### Report Types

1. **Console Output**: Real-time progress and summary
2. **JSON Reports**: Machine-readable detailed data
3. **HTML Reports**: Human-readable visual reports
4. **Executive Summary**: High-level status and recommendations

### Report Locations

```
reports/load-test-results/
├── performance-report-TIMESTAMP.html     # Visual report
├── performance-report-TIMESTAMP.json     # Detailed data
├── ticket-sales-TIMESTAMP.json          # Individual test results
├── check-in-TIMESTAMP.json              # Individual test results
└── ...
```

### Sample HTML Report Features

- 📊 Executive dashboard with key metrics
- 🎯 Pass/fail status indicators
- 📈 Performance trend analysis
- ⚠️ Regression highlighting
- 💡 Optimization recommendations
- 📱 Mobile-responsive design

## 🔔 Alert System

### Webhook Integration

Configure webhooks for performance alerts:

```bash
# Environment variables
ALERT_WEBHOOK_URL=https://hooks.slack.com/your/webhook
ESCALATION_WEBHOOK_URL=https://hooks.slack.com/critical/webhook
```

### Alert Levels

- **Info**: Minor performance changes
- **Warning**: Performance regressions detected
- **Critical**: Severe performance degradation

### Notification Examples

```json
{
  "level": "critical",
  "message": "🚨 Performance tests FAILED with 3 critical issues",
  "details": {
    "regressions": [
      "Response Time P95: 45% slower",
      "Error Rate: 3.2% increase"
    ]
  }
}
```

## 🚀 CI/CD Integration

### GitHub Actions Workflow

The system includes a comprehensive GitHub Actions workflow:

**File**: `.github/workflows/performance-tests.yml`

**Triggers**:

- Pull requests to main
- Pushes to main (baseline updates)
- Manual workflow dispatch
- Scheduled runs (daily at 2 AM UTC)

**Features**:

- Multi-environment support (staging/production)
- Parallel test execution
- Automatic baseline updates
- PR comment integration
- Artifact storage
- Performance gates

### Performance Gates

Tests fail the CI/CD pipeline when:

- Any critical regressions detected (>25% degradation)
- Multiple warning regressions (>3)
- Overall test status is FAIL
- Critical business metrics breached

### PR Integration

Automatic PR comments include:

- 📊 Test execution summary
- 📈 Regression analysis
- 🚨 Critical issue alerts
- 📋 Links to detailed reports

## ⚙️ Configuration

### Performance Thresholds

Edit `config/performance-thresholds.json` to customize:

```json
{
  "testSpecificThresholds": {
    "ticket-sales": {
      "response_time": {
        "p95_max": 500,
        "payment_processing_p95": 200
      },
      "success_rates": {
        "ticket_purchase_min": 0.95,
        "checkout_completion_min": 0.9
      }
    }
  },
  "regressionThresholds": {
    "response_time_degradation": {
      "warning": 0.1,
      "critical": 0.25
    }
  }
}
```

### Environment Variables

```bash
# Required for testing
LOAD_TEST_BASE_URL=http://localhost:3000

# Optional for alerts
ALERT_WEBHOOK_URL=https://hooks.slack.com/webhook
ESCALATION_WEBHOOK_URL=https://hooks.slack.com/critical

# Test environment
NODE_ENV=test|staging|production
```

## 🔍 Troubleshooting

### Common Issues

**K6 Not Found**:

```bash
# Install K6
npm run k6:install
npm run k6:check
```

**Target System Not Available**:

```bash
# Check system health first
curl -f http://localhost:3000/api/health/check

# Skip health check if needed
node scripts/performance-test-runner.js --skip-health-check
```

**Memory Issues During Tests**:

```bash
# Run tests sequentially instead of parallel
node scripts/performance-test-runner.js --tests=ticket-sales,check-in
```

**No Baseline Found**:

```bash
# First run will establish baseline
node scripts/performance-test-runner.js --update-baselines
```

### Debug Mode

Enable verbose output for detailed debugging:

```bash
node scripts/performance-test-runner.js --verbose
```

### Log Files

Check log files in the reports directory:

```
reports/load-test-results/
├── test-id-log.txt           # Execution logs
├── test-id-raw.json          # Raw K6 output
└── performance-report.html   # Visual report
```

## 🎯 Best Practices

### 1. Test Environment Preparation

- Ensure target system is healthy before testing
- Use realistic test data
- Configure proper environment variables
- Warm up caches if needed

### 2. Baseline Management

- Update baselines after significant improvements
- Don't update baselines for temporary changes
- Review regression alerts before dismissing
- Document baseline update reasons

### 3. Test Execution

- Run critical tests frequently (every PR)
- Run full test suite on schedule (daily/weekly)
- Use parallel execution for faster feedback
- Monitor system resources during tests

### 4. Results Analysis

- Review HTML reports for insights
- Investigate all regressions
- Share results with the team
- Track performance trends over time

### 5. CI/CD Integration

- Set appropriate failure thresholds
- Use performance gates wisely
- Provide clear feedback in PR comments
- Archive test results for analysis

## 📖 Advanced Usage

### Custom Test Scenarios

Create new K6 tests in `tests/load/`:

```javascript
// tests/load/k6-custom-test.js
import http from "k6/http";
import { check } from "k6";

export let options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 50 },
    { duration: "2m", target: 0 },
  ],
};

export default function () {
  let response = http.get("http://test.k6.io");
  check(response, {
    "status is 200": (r) => r.status === 200,
  });
}
```

Add to `TEST_CONFIGURATIONS` in `performance-test-runner.js`:

```javascript
const TEST_CONFIGURATIONS = {
  // ... existing tests
  custom: {
    file: "k6-custom-test.js",
    name: "Custom Test",
    description: "Custom performance test",
    duration: "9m",
    peakVUs: 50,
    priority: 5,
    tags: ["custom"],
    thresholds: {
      http_req_duration: { p95: 300 },
    },
  },
};
```

### Performance Monitoring Integration

The system integrates with the existing monitoring system from SPEC_02:

- Health check validation before tests
- Metric collection during execution
- Alert integration for critical issues
- Dashboard updates with test results

### Capacity Planning

Use test results for capacity planning:

1. **Peak Load Analysis**: Understand maximum system capacity
2. **Scaling Triggers**: Define auto-scaling thresholds
3. **Resource Planning**: Plan infrastructure improvements
4. **Cost Optimization**: Right-size resources based on actual usage

## 📞 Support

### Getting Help

1. **Check Documentation**: Review this guide and inline comments
2. **Review Logs**: Check execution logs for error details
3. **GitHub Issues**: Create issues for bugs or feature requests
4. **Team Chat**: Discuss performance concerns with the team

### Contributing

1. **Test Improvements**: Enhance existing K6 tests
2. **New Scenarios**: Add relevant test scenarios
3. **Reporting Enhancements**: Improve report generation
4. **CI/CD Integration**: Optimize workflow performance

## 📚 References

- [K6 Documentation](https://k6.io/docs/)
- [Performance Testing Best Practices](https://k6.io/docs/testing-guides/)
- [A Lo Cubano Monitoring System](./monitoring-system.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

_Generated by A Lo Cubano Performance Test Runner v1.0.0_
