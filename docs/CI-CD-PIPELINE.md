# CI/CD Pipeline Configuration

## Overview

The A Lo Cubano Boulder Fest project uses a streamlined CI/CD pipeline with efficient automated testing, security scanning, and deployment validation. The pipeline is configured using GitHub Actions and features a unified streamlined test suite for maximum efficiency.

## Pipeline Structure

### Workflow Triggers

- **Push to main/develop**: Full test suite
- **Pull Requests**: Complete validation pipeline
- **Daily Schedule**: Regression testing at 2 AM UTC
- **Manual Dispatch**: Configurable test suite selection

### Test Matrix

| Test Type         | Node Versions | Execution Time        | Test Count                | Memory Usage |
| ----------------- | ------------- | --------------------- | ------------------------- | ------------ |
| Streamlined Tests | 18, 20        | 255ms (target: <5s)   | 13 tests in 3 files      | <256MB       |
| E2E Tests         | 20            | 3 browsers × 2 shards | Complete user workflows   | Standard     |
| Security Tests    | 20            | Same streamlined suite| API contract validation   | <256MB       |
| Performance Tests | 20            | K6 load testing       | Regression detection      | Standard     |

## Configuration Files

### Vitest Configuration (`vitest.config.js`)

- **Test Count**: 13 tests across 3 files (streamlined suite)
- **Execution Time**: 255ms baseline (target: <5 seconds)
- **Memory Usage**: <256MB for entire test suite
- **Retry Logic**: 2 retries for flaky tests in CI
- **Reporting**: JUnit and JSON output for CI integration
- **Single Command**: `npm test` runs everything

### Playwright Configuration (`playwright.config.js`)

- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome/Safari
- **Retry Strategy**: 2 retries on failure in CI
- **Parallel Workers**: 4 workers in CI
- **Test Sharding**: 2 shards per browser for faster execution

### GitHub Actions Workflow (`.github/workflows/comprehensive-testing.yml`)

## Jobs Overview

### 1. Code Quality & Linting (`quality-check`)

- **Duration**: ~10 minutes
- **Purpose**: Code style, HTML validation, file structure verification
- **Tools**: ESLint, HTMLHint, custom validation scripts
- **Caching**: ESLint cache for faster subsequent runs

### 2. Streamlined Tests (`streamlined-tests`)

- **Duration**: <5 minutes (255ms execution baseline)
- **Matrix**: Node 18/20 (no sharding needed)
- **Test Count**: 13 tests across 3 files
- **Memory**: <256MB usage
- **Performance**: Execution time monitoring (target: <5s total)

### 3. Integration Tests (`integration-tests`)

- **Duration**: <5 minutes (same streamlined suite)
- **Test Count**: Same 13 tests with Redis backend
- **Focus**: Redis functionality testing specifically
- **Environment**: Redis service for rate limiting tests

### 4. E2E Tests (`e2e-tests`)

- **Duration**: ~30 minutes
- **Matrix**: 3 browsers × 2 shards = 6 parallel jobs
- **Coverage**: Full user journey testing
- **Artifacts**: Screenshots, videos, traces on failure

### 5. Security Tests (`security-tests`)

- **Duration**: <5 minutes (same streamlined suite)
- **Test Count**: Same 13 tests include security validation
- **Tools**: npm audit, streamlined security tests, OWASP ZAP (scheduled runs)
- **Focus**: API contract security, vulnerability scanning

### 6. Performance Tests (`performance-tests`)

- **Duration**: ~20 minutes
- **Tools**: K6 load testing
- **Metrics**: Response time, throughput, error rates
- **Regression**: Automated baseline comparison

### 7. Build Tests (`build-tests`)

- **Duration**: ~15 minutes
- **Purpose**: Deployment readiness verification
- **Validation**: Vercel configuration, build artifacts

### 8. Test Aggregation (`test-aggregation`)

- **Duration**: ~10 minutes
- **Purpose**: Combine all test results into unified reports
- **Outputs**: JUnit reports, JSON summaries, GitHub annotations

### 9. Notifications (`notifications`)

- **Triggers**: Only on failure for main branch or scheduled runs
- **Channels**: Slack notifications, GitHub issues
- **Escalation**: Automatic issue creation for repeated failures

## Environment Variables

### Required Secrets

```bash
# Code Coverage
CODECOV_TOKEN=xxxxx

# Slack Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/xxxxx

# Test Environment (optional)
TEST_ADMIN_USERNAME=admin@example.com
TEST_ADMIN_PASSWORD=secure-password
```

### Automatic Variables

```bash
CI=true                    # Enables CI-specific configurations
COVERAGE=true             # Enables coverage collection
NODE_ENV=test             # Sets test environment
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

## Test Scripts

### Primary Commands

```bash
# Streamlined testing (single command for all unit testing)
npm test                   # 13 tests in 255ms - everything needed

# Legacy compatibility commands (all point to streamlined suite)
npm run test:simple        # Same as npm test
npm run test:security      # Same streamlined suite
npm run test:integration   # Same streamlined suite
npm run test:performance   # Same streamlined suite

# Separate E2E testing
npm run test:e2e           # End-to-end tests (separate suite)

# Quality gates
npm run test:coverage      # Coverage report
npm run deploy:check       # Pre-deployment validation
```

### Development Commands

```bash
# Local development
npm test                   # Always use this (255ms execution)
npm run test:simple:watch  # Watch mode for streamlined tests
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:debug     # Debug mode
npm run test:coverage      # Local coverage report
```

## Performance Monitoring

### Test Execution Performance

- **Baseline**: 255ms for 13 tests (3 files)
- **Target**: <5 seconds total execution
- **Memory**: <256MB usage
- **Regression Detection**: Execution time monitoring in CI
- **Alert Threshold**: >5 seconds triggers performance regression alert

### Application Performance Testing

- **Tool**: K6 load testing (separate from unit tests)
- **Baseline**: Automated comparison against previous runs
- **Manual**: `npm run performance:baseline` to update
- **Thresholds**: 20% response time, 5% error rate, 15% throughput

### Streamlined Test Benefits

- **Single Command**: `npm test` does everything
- **Fast Feedback**: 255ms provides instant results
- **CI Efficiency**: No test sharding needed
- **Memory Efficient**: <256MB for entire suite
- **Maintenance**: Only 3 files to maintain

## Artifacts and Reports

### Test Results

- **Location**: `./test-results/`
- **Formats**: JUnit XML, JSON, HTML reports
- **Retention**: 30 days for detailed results, 90 days for summaries

### Coverage Reports

- **HTML**: `./coverage/index.html`
- **LCOV**: `./coverage/lcov.info`
- **Integration**: Automatic Codecov upload

### Performance Reports

- **Results**: `./performance-results.json`
- **Regression**: `./performance-regression-report.md`
- **K6 Reports**: `./k6-report.html`

### Security Reports

- **Location**: `./reports/`
- **OWASP ZAP**: Security scan results
- **Audit**: npm audit JSON output

## Failure Handling

### Retry Strategy

- **Streamlined Tests**: 2 retries for flaky tests (rare due to simplicity)
- **E2E Tests**: 2 retries with full artifact capture
- **Performance Tests**: No retries (deterministic)

### Notification Escalation

1. **Immediate**: Slack notification for main branch failures
2. **Scheduled**: GitHub issue creation for repeated failures
3. **Manual**: Workflow dispatch for targeted debugging

### Debugging Failed Tests

```bash
# Download artifacts from GitHub Actions
# View test reports locally
npm run test:e2e:report

# Debug specific tests
npm run test:e2e:debug -- --grep "failing test name"

# Check performance regressions
cat performance-regression-report.md
```

## Optimization Features

### Parallel Execution

- **Streamlined Tests**: No sharding needed (255ms execution)
- **E2E Tests**: Browser + shard matrix (6 parallel jobs)
- **Concurrent**: Multiple job types run simultaneously
- **Efficiency**: Streamlined tests complete before other jobs even start

### Caching Strategy

- **Node modules**: npm cache
- **ESLint**: `.eslintcache` persistence
- **Playwright**: Browser binary caching
- **Coverage**: Incremental coverage collection

### Resource Management

- **Timeouts**: Reduced timeout limits (5 minutes vs 20 minutes for streamlined tests)
- **Memory**: <256MB for streamlined test suite
- **Cancellation**: Automatic cancellation of superseded runs
- **Efficiency**: Streamlined tests use minimal CI resources

## Maintenance

### Weekly Tasks

1. Monitor streamlined test execution time (should remain ~255ms)
2. Update security scanning rules if needed
3. Check artifact storage usage (reduced due to streamlined tests)

### Monthly Tasks

1. Update browser versions for E2E tests
2. Review streamlined test efficiency
3. Analyze test execution time trends (target: <5s total)

### Quarterly Tasks

1. Update Node.js versions in test matrix
2. Evaluate if additional streamlined tests needed
3. Update security scanning tools and rules
4. Review streamlined architecture benefits

## Troubleshooting

### Common Issues

**Flaky E2E Tests**

```bash
# Increase timeout in playwright.config.js
timeout: 30 * 1000  // 30 seconds

# Add explicit waits
await page.waitForSelector('[data-testid="element"]')
```

**Streamlined Test Performance Regression**

```bash
# Check test execution time
npm test  # Should complete in ~255ms

# If tests are slower than 5 seconds, investigate
# Check for new complexity in test files
# Verify only 13 tests across 3 files are running
```

**Performance Regressions**

```bash
# Check performance report
cat performance-regression-report.md

# Update baseline if changes are expected
npm run performance:baseline
```

**CI Resource Limits**

```bash
# Streamlined tests use minimal resources (<256MB)
# No parallel workers needed for 13-test suite
# Focus optimization on E2E tests if needed:
workers: process.env.CI ? 2 : 4
```
