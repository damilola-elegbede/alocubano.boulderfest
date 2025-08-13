# CI/CD Pipeline Configuration

## Overview

The A Lo Cubano Boulder Fest project uses a comprehensive CI/CD pipeline with automated testing, security scanning, and deployment validation. The pipeline is configured using GitHub Actions and includes multiple testing strategies.

## Pipeline Structure

### Workflow Triggers

- **Push to main/develop**: Full test suite
- **Pull Requests**: Complete validation pipeline
- **Daily Schedule**: Regression testing at 2 AM UTC
- **Manual Dispatch**: Configurable test suite selection

### Test Matrix

| Test Type         | Node Versions | Parallel Execution    | Coverage Target           |
| ----------------- | ------------- | --------------------- | ------------------------- |
| Unit Tests        | 18, 20        | 4 shards              | 60% overall, 80% critical |
| Integration Tests | 20            | Single instance       | Redis service             |
| E2E Tests         | 20            | 3 browsers × 2 shards | All major browsers        |
| Security Tests    | 20            | Single instance       | OWASP compliance          |
| Performance Tests | 20            | K6 load testing       | Regression detection      |

## Configuration Files

### Vitest Configuration (`vitest.config.js`)

- **Coverage**: 60% overall, 80% for critical paths (payments, tickets, admin)
- **Parallel Execution**: 4 threads on CI, 2 locally
- **Retry Logic**: 2 retries for flaky tests in CI
- **Reporting**: JUnit and JSON output for CI integration

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

### 2. Unit Tests (`unit-tests`)

- **Duration**: ~20 minutes
- **Matrix**: Node 18/20 × 4 test shards
- **Coverage**: Codecov integration with coverage reporting
- **Performance**: Regression detection for slow tests (>5s)

### 3. Integration Tests (`integration-tests`)

- **Duration**: ~15 minutes
- **Services**: Redis for caching tests
- **Focus**: API integration, database operations
- **Environment**: Isolated test database

### 4. E2E Tests (`e2e-tests`)

- **Duration**: ~30 minutes
- **Matrix**: 3 browsers × 2 shards = 6 parallel jobs
- **Coverage**: Full user journey testing
- **Artifacts**: Screenshots, videos, traces on failure

### 5. Security Tests (`security-tests`)

- **Duration**: ~15 minutes
- **Tools**: npm audit, custom security tests, OWASP ZAP (scheduled runs)
- **Focus**: Vulnerability scanning, security headers, compliance

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
# Complete CI pipeline
npm run test:ci

# Individual test suites
npm run test:unit:ci        # Unit tests with coverage
npm run test:e2e           # End-to-end tests
npm run test:security      # Security validation
npm run test:integration   # Integration tests

# Quality gates
npm run test:quality-gate  # Full quality validation
npm run test:smoke         # Quick health check
npm run test:regression    # Baseline comparison
```

### Development Commands

```bash
# Local development
npm run test:unit:watch    # Watch mode
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:debug     # Debug mode
npm run test:coverage      # Local coverage report
```

## Performance Monitoring

### Baseline Management

- **Automatic**: First run creates baseline
- **Manual**: `npm run performance:baseline` to update
- **Comparison**: Automatic regression detection
- **Thresholds**: 20% response time, 5% error rate, 15% throughput

### Regression Detection

```bash
# Automated in CI
scripts/compare-performance-results.js

# Manual comparison
npm run performance:baseline
```

## Coverage Targets

### Global Thresholds (60%)

- Branches: 60%
- Functions: 60%
- Lines: 60%
- Statements: 60%

### Critical Path Thresholds (80%)

- `api/payments/**`: Payment processing
- `api/tickets/**`: Ticket management
- `api/admin/**`: Administrative functions

### Moderate Thresholds (75%)

- `js/cart/**`: Shopping cart functionality

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

- **Unit Tests**: 2 retries for flaky tests
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

- **Unit Tests**: 4-way sharding for faster execution
- **E2E Tests**: Browser + shard matrix (6 parallel jobs)
- **Concurrent**: Multiple job types run simultaneously

### Caching Strategy

- **Node modules**: npm cache
- **ESLint**: `.eslintcache` persistence
- **Playwright**: Browser binary caching
- **Coverage**: Incremental coverage collection

### Resource Management

- **Timeouts**: Job-specific timeout limits
- **Memory**: Optimized thread counts
- **Cancellation**: Automatic cancellation of superseded runs

## Maintenance

### Weekly Tasks

1. Review performance baseline trends
2. Update security scanning rules if needed
3. Check artifact storage usage

### Monthly Tasks

1. Update browser versions for E2E tests
2. Review and update coverage thresholds
3. Analyze test execution time trends

### Quarterly Tasks

1. Update Node.js versions in test matrix
2. Review and optimize pipeline performance
3. Update security scanning tools and rules

## Troubleshooting

### Common Issues

**Flaky E2E Tests**

```bash
# Increase timeout in playwright.config.js
timeout: 30 * 1000  // 30 seconds

# Add explicit waits
await page.waitForSelector('[data-testid="element"]')
```

**Coverage Threshold Failures**

```bash
# Check coverage report
npm run test:coverage
open coverage/index.html

# Update thresholds in vitest.config.js if justified
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
# Reduce parallel workers in CI
# Update vitest.config.js or playwright.config.js
workers: process.env.CI ? 2 : 4
```
