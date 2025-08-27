# PR Quality Gates & Status Checks System

## Overview

This document describes the comprehensive PR quality gates and status checks system implemented for the A Lo Cubano Boulder Fest project. The system ensures code quality, reliability, and maintainability through automated testing, performance monitoring, security scanning, and intelligent failure handling.

## 🚪 Quality Gates

The PR quality gates system consists of five primary gates that must pass before a PR can be merged:

### 1. Code Quality Gate (`🧹 Code Quality Gate`)
- **ESLint**: JavaScript code linting and style enforcement
- **HTMLHint**: HTML validation and best practices
- **Timeout**: 5 minutes
- **Required**: Yes
- **Failure Action**: Block merge

### 2. Unit Tests Gate (`🧪 Unit Tests Gate`)
- **Test Suite**: Streamlined unit tests (26 tests)
- **Coverage Reporting**: Integrated with coverage thresholds
- **Database Health**: API contract validation
- **Timeout**: 10 minutes
- **Required**: Yes
- **Failure Action**: Block merge

### 3. E2E Tests Gate (`🎭 E2E Tests Gate`)
- **Cross-browser Testing**: Chrome, Firefox, Safari, Mobile
- **Flaky Test Detection**: Automatic retry and quarantine system
- **Performance Monitoring**: Core Web Vitals tracking
- **Timeout**: 20 minutes per browser
- **Required**: Yes (can be skipped for urgent fixes)
- **Failure Action**: Block merge

### 4. Security Scanning Gate (`🛡️ Security Scanning Gate`)
- **Dependency Audit**: npm audit for vulnerabilities
- **Security Configuration**: Headers and environment validation
- **Secrets Detection**: Basic secrets pattern matching
- **Timeout**: 10 minutes
- **Required**: Yes
- **Failure Action**: Block merge

### 5. Performance Gate (`⚡ Performance Gate`)
- **Response Time Validation**: API and endpoint performance
- **Regression Detection**: Compare against baseline metrics
- **Resource Usage**: Memory and CPU utilization monitoring
- **Timeout**: 15 minutes
- **Required**: No (warning only)
- **Failure Action**: Warning

## 📊 Status Reporting System

### PR Status Reporter (`scripts/pr-status-reporter.js`)

The PR Status Reporter provides comprehensive test result reporting with the following features:

#### Core Features
- **Real-time Status Updates**: Updates GitHub PR status checks in real-time
- **Detailed Test Results**: Pass/fail indicators with failure reasons
- **Coverage Integration**: Automatic test coverage reporting
- **Performance Tracking**: Baseline comparison and regression detection
- **Flaky Test Management**: Detection, retry logic, and quarantine system

#### Usage Examples

```bash
# Initialize test run
node scripts/pr-status-reporter.js --event=test-start --test-suite=unit-tests

# Report test completion
node scripts/pr-status-reporter.js --event=test-complete --test-suite=unit-tests --results='{"total":26,"passed":26,"failed":0}'

# Handle test failure with retry
node scripts/pr-status-reporter.js --event=test-failure --test-suite=e2e-chrome --test-name="gallery-test" --attempt=1

# Check performance regression
node scripts/pr-status-reporter.js --event=performance-check --results='{"page_load_time":1200,"api_response_time":450}'

# Generate coverage report
node scripts/pr-status-reporter.js --event=coverage-report --coverage-file=coverage/coverage-summary.json

# Create comprehensive summary
node scripts/pr-status-reporter.js --event=status-summary
```

### Status Check Context Names

The following status check contexts are reported to GitHub:

- `pr-status-reporter` (overall status)
- `pr-status-reporter/validation` (pre-flight validation)
- `pr-status-reporter/code-quality` (linting and formatting)
- `pr-status-reporter/unit-tests` (unit test execution)
- `pr-status-reporter/e2e-{browser}` (E2E tests per browser)
- `pr-status-reporter/performance` (performance validation)
- `pr-status-reporter/coverage` (test coverage)
- `pr-status-reporter/security` (security scanning)

## 🔄 Flaky Test Detection & Management

### Automatic Detection

The system automatically detects flaky tests based on:
- **Failure Rate**: Tests with 30-70% failure rate over multiple runs
- **Minimum Runs**: At least 3 test executions required for analysis
- **Pattern Recognition**: Common error patterns and timing issues
- **Success Rate Tracking**: Monitoring test reliability over time

### Retry Logic

When a flaky test is detected:
1. **Automatic Retry**: Up to 3 attempts with exponential backoff
2. **Delay Between Retries**: 10-30 seconds depending on attempt number
3. **Error Analysis**: Pattern matching for known flaky indicators
4. **Smart Retry**: Only retry tests likely to succeed on retry

### Quarantine System

Tests with consistently low success rates are automatically quarantined:
- **Quarantine Threshold**: Success rate below 70%
- **Duration**: 7 days by default (configurable)
- **Isolation**: Quarantined tests are temporarily excluded from required checks
- **Monitoring**: Continued tracking for improvement

### Flaky Test Management (`scripts/manage-flaky-tests.js`)

```bash
# Detect flaky tests from recent runs
node scripts/manage-flaky-tests.js detect --days-back=7

# List all known flaky tests
node scripts/manage-flaky-tests.js list --verbose

# Manually quarantine a test
node scripts/manage-flaky-tests.js quarantine "test name" "test suite" --duration=14

# Generate comprehensive report
node scripts/manage-flaky-tests.js report --format=html --output-file=flaky-report.html

# Analyze failure patterns
node scripts/manage-flaky-tests.js analyze --group-by=error --show-top=10

# Clean up old data
node scripts/manage-flaky-tests.js cleanup --days-old=30 --dry-run
```

## 📈 Performance Monitoring

### Baseline Comparison

The system maintains performance baselines for:
- **Page Load Times**: Homepage and critical pages
- **API Response Times**: Key endpoints
- **Bundle Size**: JavaScript and CSS assets
- **Lighthouse Scores**: Performance, accessibility, SEO

### Regression Detection

Performance regressions are detected when:
- **Response times increase by >15%** from baseline
- **Critical thresholds exceeded**: >2 seconds for pages, >500ms for APIs
- **Bundle size increases by >50KB** without justification
- **Lighthouse performance score drops by >5 points**

### Alert Thresholds

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Page Load Time | +15% from baseline | +25% from baseline |
| API Response Time | +20% from baseline | +50% from baseline |
| Bundle Size | +25KB | +50KB |
| Lighthouse Performance | -5 points | -10 points |

## 🔧 Branch Protection Configuration

### Required Status Checks

Branch protection rules require the following status checks to pass:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "🔍 Pre-flight Validation",
      "🎭 E2E Tests (Chrome)",
      "🎭 E2E Tests (Firefox)", 
      "🎭 E2E Tests (Safari)",
      "🎭 E2E Tests (Mobile Chrome)",
      "🎭 E2E Tests (Mobile Safari)",
      "📊 Performance Benchmark",
      "🧪 Pre-deployment Quality",
      "pr-status-reporter"
    ]
  }
}
```

### Quality Gate Configuration

Located in `.github/branch-protection-rules.json`:

```json
{
  "quality_gates": {
    "unit_tests": {
      "required": true,
      "timeout_minutes": 10,
      "retry_count": 1,
      "failure_action": "block_merge"
    },
    "e2e_tests": {
      "required": true,
      "timeout_minutes": 20,
      "retry_count": 2,
      "failure_action": "block_merge",
      "flaky_test_threshold": 3
    }
  }
}
```

## 🚨 Emergency Bypass System

### When to Use Emergency Bypass

Emergency bypass should only be used for:
- **Critical Production Issues**: Security vulnerabilities or outages
- **Urgent Hotfixes**: Time-sensitive fixes that can't wait for full testing
- **Infrastructure Problems**: CI/CD system issues preventing normal testing

### Emergency Bypass Process

1. **Activate via Workflow Dispatch**:
   ```bash
   # Via GitHub UI or API
   curl -X POST \
     -H "Authorization: token $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github.v3+json" \
     https://api.github.com/repos/OWNER/REPO/actions/workflows/pr-quality-gates.yml/dispatches \
     -d '{"ref":"main","inputs":{"emergency_bypass":"true"}}'
   ```

2. **Automatic Audit Log**: System creates detailed audit trail including:
   - Requesting user and timestamp
   - Reason for bypass (required)
   - Which checks were bypassed
   - Follow-up issue creation

3. **Required Follow-up**: Must create issue to address bypassed checks within 24 hours

### Never Bypass

The following checks cannot be bypassed even in emergencies:
- **Security Scanning**: Always required for vulnerability detection
- **Code Quality**: Ensures maintainable code standards

## 📋 Workflow Integration

### Main Workflows

1. **`pr-quality-gates.yml`**: Comprehensive quality gate orchestration
2. **`e2e-tests-with-status.yml`**: Enhanced E2E testing with status reporting
3. **`production-quality-gates.yml`**: Post-merge production validation

### Workflow Triggers

```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
    inputs:
      force_run: 
        description: 'Force run all quality gates'
        type: boolean
      emergency_bypass:
        description: 'Emergency bypass mode'
        type: boolean
```

### Concurrency Control

```yaml
concurrency:
  group: pr-quality-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

## 🔍 Monitoring & Observability

### Test Results Dashboard

Access comprehensive test results via:
- **GitHub Actions**: Workflow summary and artifacts
- **PR Comments**: Automated status comments with details
- **Flaky Test Reports**: HTML reports for failure analysis
- **Performance Dashboards**: Trend analysis and regression tracking

### Key Metrics Tracked

1. **Test Reliability**: Success rates, flaky test counts, retry frequencies
2. **Performance**: Response times, regression detection, improvement tracking  
3. **Coverage**: Test coverage percentages, uncovered lines, trend analysis
4. **Security**: Vulnerability counts, security score, compliance tracking
5. **Quality**: Code quality scores, lint violations, technical debt

### Alert Notifications

Notifications are sent for:
- **Critical Test Failures**: Immediate notification for blocking issues
- **Performance Regressions**: Alerts when thresholds are exceeded
- **Flaky Test Detection**: Notification when tests become unreliable
- **Security Issues**: Immediate alerts for security vulnerabilities

## 🛠️ Configuration & Customization

### Environment Variables

Required environment variables:

```bash
# GitHub Integration
GITHUB_TOKEN=ghp_xxx                    # GitHub API token
GITHUB_REPOSITORY=owner/repo            # Repository identifier

# Quality Gate Configuration  
PR_STATUS_REPORTER_ENABLED=true         # Enable status reporting
QUALITY_GATES_ENABLED=true              # Enable quality gates
FLAKY_TEST_DETECTION=true               # Enable flaky test detection
PERFORMANCE_MONITORING=true             # Enable performance tracking

# Test Configuration
E2E_TEST_MODE=true                      # E2E test environment
NODE_OPTIONS="--max-old-space-size=2048" # Node.js memory settings
```

### Threshold Configuration

Modify thresholds in `scripts/pr-status-reporter.js`:

```javascript
const CONFIG = {
  thresholds: {
    coverage: {
      minimum: 80,        // Minimum coverage percentage
      warning: 85,        // Warning threshold
      excellent: 95       // Excellent coverage target
    },
    performance: {
      regressionThreshold: 15,    // % increase triggers warning
      criticalThreshold: 25,      # % increase triggers failure
      pageLoadTime: 2000,         // Max page load time (ms)
      apiResponseTime: 500        // Max API response time (ms)
    },
    flaky: {
      failureThreshold: 3,        // Failures before marking flaky
      successRateThreshold: 0.7,  // Min success rate before quarantine
      maxRetries: 3               // Max retry attempts
    }
  }
};
```

## 📖 Troubleshooting

### Common Issues

#### Tests Failing Due to Timing
- **Solution**: Enable flaky test detection and retry logic
- **Check**: Review test timeouts and wait conditions
- **Action**: Add appropriate waits for dynamic content

#### Performance Regressions
- **Solution**: Review recent changes for performance impact
- **Check**: Compare metrics with baseline in performance dashboard
- **Action**: Optimize code or update baseline if improvement is expected

#### Security Scan Failures
- **Solution**: Update dependencies and fix security issues
- **Check**: Review `npm audit` output for vulnerabilities
- **Action**: Update packages or add security exceptions if acceptable risk

#### Coverage Drops
- **Solution**: Add tests for new code or uncovered lines
- **Check**: Review coverage report for specific missing coverage
- **Action**: Write tests or exclude non-testable code with comments

### Debug Commands

```bash
# Check current flaky tests
node scripts/manage-flaky-tests.js list --verbose

# Validate branch protection
node scripts/validate-branch-protection.js --verbose

# Test status reporter locally
node scripts/pr-status-reporter.js --event=status-summary --verbose

# Generate comprehensive test report
node scripts/manage-flaky-tests.js report --format=html --output-file=debug-report.html
```

### Log Analysis

Check the following log sources for debugging:
1. **GitHub Actions Logs**: Workflow execution details
2. **PR Status Comments**: Automated status updates
3. **Test Artifacts**: Downloaded test results and screenshots
4. **Performance Metrics**: `.tmp/performance-metrics.json`
5. **Flaky Test Data**: `.tmp/flaky-tests.json`

## 🔮 Future Enhancements

### Planned Features

1. **ML-based Flaky Test Prediction**: Use machine learning to predict test flakiness
2. **Advanced Performance Analytics**: Detailed performance trend analysis
3. **Integration Testing**: Cross-service integration validation
4. **Visual Regression Testing**: Automated UI change detection
5. **Load Testing Integration**: Automated scalability validation

### Configuration Roadmap

1. **Custom Quality Gates**: Per-project configurable quality requirements
2. **Dynamic Thresholds**: Adaptive thresholds based on historical data  
3. **Team-specific Rules**: Different requirements for different code areas
4. **Integration Webhooks**: External tool integration for enhanced reporting

---

## 📞 Support

For questions or issues with the PR quality gates system:

1. **Review Documentation**: Check this guide and inline code comments
2. **Check Logs**: Review GitHub Actions logs and test artifacts
3. **Run Debug Commands**: Use troubleshooting scripts above
4. **Create Issue**: Open GitHub issue with detailed error information

---

*This system ensures high code quality and reliability while maintaining developer productivity through intelligent automation and comprehensive monitoring.*