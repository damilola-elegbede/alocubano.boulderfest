# E2E Testing Workflows Guide

This document explains the GitHub Actions workflows for End-to-End (E2E) testing with comprehensive browser coverage and performance optimization.

## 🎭 Workflow Overview

### 1. E2E Tests (`e2e-tests.yml`)
**Purpose**: Fast, targeted E2E testing for PRs and main branch pushes  
**Target Runtime**: Under 5 minutes  
**Triggers**: Pull requests, push to main, manual dispatch  

### 2. Nightly E2E (`e2e-nightly.yml`)
**Purpose**: Comprehensive nightly testing with full coverage  
**Target Runtime**: 30-45 minutes  
**Triggers**: Daily at 2 AM UTC, manual dispatch  

## 🚀 Quick Start

### Run E2E Tests Locally
```bash
# Run all E2E tests
npm run test:e2e

# Run specific browser
npm run test:e2e -- --project=chromium

# Run specific test pattern
npm run test:e2e -- tests/e2e/flows/gallery-browsing.test.js

# Interactive UI mode
npm run test:e2e:ui
```

### Manual Workflow Triggers

#### Trigger E2E Tests
```bash
# Basic trigger
gh workflow run "E2E Testing Suite"

# With specific test pattern
gh workflow run "E2E Testing Suite" -f test_pattern="gallery"

# With specific browsers
gh workflow run "E2E Testing Suite" -f browsers="chromium,firefox"
```

#### Trigger Nightly Tests
```bash
# Against staging environment
gh workflow run "Nightly E2E Comprehensive Testing" -f environment="staging"

# With load testing enabled
gh workflow run "Nightly E2E Comprehensive Testing" \
  -f environment="staging" \
  -f load_testing=true \
  -f performance_profiling=true
```

## 📋 Test Matrix

### E2E Tests (Fast)
| Browser | Device Type | Target | Notes |
|---------|-------------|--------|-------|
| Chromium | Desktop | Chrome | Primary browser |
| Firefox | Desktop | Firefox | Cross-browser validation |
| WebKit | Desktop | Safari | macOS/iOS compatibility |
| Mobile Chrome | Mobile | Android | Mobile experience |
| Mobile Safari | Mobile | iPhone | iOS experience |

### Nightly Tests (Comprehensive)
| Browser | Device Type | Extended Features |
|---------|-------------|------------------|
| All above | + | Performance profiling |
| Edge | Desktop | Windows compatibility |
| iPad | Tablet | Tablet experience |
| Load Testing | - | Stress testing |
| Accessibility | All | a11y compliance |

## 🔧 Configuration

### Environment Variables

**Required for CI:**
```yaml
NODE_VERSION: "20"
E2E_TEST_MODE: true
DATABASE_URL: "file:./data/e2e-test.db"
```

**Optional Secrets:**
```yaml
TEST_ADMIN_PASSWORD: "test-admin-password"
BREVO_API_KEY_TEST: "xkeysib-..."
STRIPE_SECRET_KEY_TEST: "sk_test_..."
ADMIN_SECRET_TEST: "32-character-minimum-secret"
```

### Performance Targets

**E2E Tests:**
- Total workflow time: < 5 minutes
- Per-browser execution: < 3 minutes
- Server startup: < 30 seconds
- Test execution: < 2 minutes per browser

**Nightly Tests:**
- Total workflow time: < 45 minutes
- Per-browser execution: < 15 minutes
- Load testing: < 10 minutes
- Analysis and reporting: < 5 minutes

## 📊 Test Artifacts

### E2E Tests Artifacts
- **Test Results**: `playwright-report/`, `test-results/`
- **Screenshots**: On failure only (retention: 7 days)
- **Videos**: On failure in CI (retention: 7 days)
- **Performance**: Basic metrics (retention: 7 days)

### Nightly Test Artifacts
- **Comprehensive Results**: All browsers (retention: 30 days)
- **Failure Analysis**: Screenshots, videos, traces (retention: 45 days)
- **Performance Reports**: Detailed profiling (retention: 30 days)
- **Load Test Results**: k6 output (retention: 30 days)
- **Analysis Reports**: Summary and trends (retention: 60 days)

## 🎯 Test Flow Patterns

### PR Testing Flow
1. **Pre-flight**: Change detection, scope analysis
2. **Parallel E2E**: 5 browsers simultaneously
3. **Performance**: Basic benchmark (Chromium only)
4. **Reporting**: Summary with artifacts

### Nightly Testing Flow
1. **Preparation**: Environment validation, matrix generation
2. **Comprehensive E2E**: Full browser matrix (6+ browsers)
3. **Load Testing**: k6 stress testing (optional)
4. **Analysis**: Aggregate results, trend analysis
5. **Notification**: Status summary (configurable)

## 🔍 Monitoring and Debugging

### View Test Results
```bash
# Show latest Playwright report
npm run test:e2e:report

# View specific test artifacts
ls -la test-results/playwright/

# Check workflow status
gh run list --workflow="E2E Testing Suite"
```

### Debug Failed Tests
```bash
# Run with browser UI
npm run test:e2e:headed

# Debug specific test
npm run test:e2e:debug -- --grep="gallery"

# View traces
npx playwright show-trace test-results/trace.zip
```

### Common Issues

**Server Startup Failures:**
- Check port conflicts (3000)
- Verify environment variables
- Review server logs in artifacts

**Browser Launch Failures:**
- Clear Playwright browser cache
- Run `npx playwright install`
- Check system dependencies

**Test Timeouts:**
- Increase timeout in `playwright.config.js`
- Check network connectivity
- Review performance bottlenecks

## 📈 Performance Optimization

### Workflow Optimizations
- **Parallel Execution**: Multiple browsers simultaneously
- **Browser Caching**: Cached Playwright browsers
- **Dependency Caching**: npm cache between runs
- **Smart Triggers**: Skip unnecessary runs for drafts
- **Change Detection**: Run only relevant test suites

### Test Optimizations
- **Global Setup**: Single server per test run
- **Browser Warmup**: Pre-launch browsers
- **Endpoint Warmup**: Pre-call critical APIs
- **Resource Cleanup**: Prevent memory leaks

## 🚦 Quality Gates

### PR Requirements
- All E2E tests must pass
- Performance benchmarks within limits
- No critical accessibility violations
- Screenshots available for failures

### Nightly Requirements  
- 95%+ test success rate
- Load testing thresholds met
- Memory usage within bounds
- Comprehensive analysis complete

## 📧 Notifications

### Success Notifications
- GitHub Step Summary
- PR comments (on demand)
- Artifact links

### Failure Notifications
- Detailed error summary
- Link to failure artifacts
- Retry instructions
- Debug recommendations

**Future Integrations:**
- Slack webhooks
- Email notifications
- Discord alerts
- Microsoft Teams

## 🔒 Security Considerations

### Safe Testing Practices
- Never test against production URLs
- Use test-specific credentials
- Sanitize sensitive data in logs
- Validate environment before testing

### Environment Validation
```yaml
# Production URL protection
prohibited_urls:
  - '://alocubanoboulderfest.com'
  - '://www.alocubanoboulderfest.com'
  - 'production'
  - 'prod.vercel'

# Allowed test environments
allowed_patterns:
  - 'staging.alocubanoboulderfest.com'
  - 'test.alocubanoboulderfest.com'
  - 'localhost:3000'
```

## 📚 References

- [Playwright Documentation](https://playwright.dev/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Project Testing Strategy](/docs/testing/TESTING_STRATEGY.md)
- [E2E Test Flows](/tests/e2e/flows/README.md)

## 🤝 Contributing

### Adding New Tests
1. Create test file in `tests/e2e/flows/`
2. Follow existing patterns and naming
3. Include performance assertions
4. Test across all device types

### Modifying Workflows
1. Test changes in fork first
2. Verify performance impact
3. Update documentation
4. Consider backward compatibility

### Reporting Issues
1. Include workflow run URL
2. Attach relevant artifacts
3. Describe expected vs actual behavior
4. Provide reproduction steps