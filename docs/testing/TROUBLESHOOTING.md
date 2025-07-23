# Test Troubleshooting Guide

## Common Issues and Solutions

### Test Failures

#### "Module not found" Errors
**Symptom**: Tests fail with import/require errors
**Cause**: Incorrect file paths or missing dependencies
**Solution**:
1. Verify file paths match actual directory structure
2. Check that source files exist and are exported correctly
3. Ensure Jest moduleNameMapper is configured correctly

#### "0% Coverage Despite Passing Tests"
**Symptom**: Tests pass but show no coverage
**Cause**: Tests are mocking everything instead of testing source code
**Solution**:
1. Verify tests import actual source files
2. Remove excessive mocking of internal functions
3. Only mock external dependencies (APIs, browser APIs)

#### Flaky Tests
**Symptom**: Tests pass/fail intermittently
**Cause**: Timing dependencies, shared state, race conditions
**Solution**:
1. Run `node scripts/test-runner.js health` to identify flaky tests
2. Add proper async/await handling
3. Reset state between tests with beforeEach/afterEach
4. Avoid shared global state

### Performance Issues

#### Slow Test Execution
**Symptom**: Tests take > 60 seconds to run
**Cause**: Excessive DOM manipulation, unoptimized async operations
**Solution**:
1. Use `npm run test:fast` for development
2. Optimize expensive test setup/teardown
3. Consider test parallelization
4. Profile tests with `--verbose` flag

### Coverage Issues

#### Coverage Below Threshold
**Symptom**: Coverage check fails CI/CD
**Cause**: New code not covered by tests
**Solution**:
1. Run `npm run test:coverage` locally
2. Review uncovered lines in coverage report
3. Add tests for uncovered functionality
4. Do not lower coverage thresholds

## Debugging Commands

### Test Isolation
```bash
# Run single test file
npm test -- tests/unit/gallery-consolidated.test.js

# Run tests matching pattern
npm test -- --testNamePattern="Gallery.*loading"

# Run with verbose output
npm test -- --verbose
```

### Coverage Analysis
```bash
# Generate detailed coverage report
npm run test:coverage

# Open coverage report in browser
npm run coverage:open

# Coverage for specific files
npm run test:coverage -- --collectCoverageOnlyFrom="js/gallery-detail.js"
```

### Performance Debugging
```bash
# Run performance tests only
npm run test:performance

# Profile test execution
npm test -- --verbose --detectOpenHandles
```

## Emergency Procedures

### All Tests Failing
1. Verify Node.js version compatibility (18.x or 20.x)
2. Clear npm cache: `npm cache clean --force`
3. Reinstall dependencies: `rm -rf node_modules && npm install`
4. Check for configuration file corruption

### CI/CD Pipeline Failure
1. Check GitHub Actions logs for specific error
2. Reproduce failure locally with same Node version
3. Verify all required environment variables are set
4. Check for dependency version conflicts

### Coverage Regression
1. Compare coverage reports between commits
2. Identify newly uncovered code
3. Add missing tests before merge
4. Do not bypass coverage checks