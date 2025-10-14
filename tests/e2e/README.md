# E2E Testing Guidelines

## Overview

This directory contains end-to-end (E2E) tests for A Lo Cubano Boulder Fest using Playwright. These tests run against Vercel Preview Deployments to validate real production behavior.

## Critical Best Practices

### 1. Skip Only When Absolutely Necessary

**Rule**: Tests should FAIL when features are broken, not skip. Only skip for external constraints you can't control.

**Valid Skip Reasons** (Only 2!):
- ✅ **Rate Limiting**: External service throttling (temporary)
- ✅ **MFA Required**: Human interaction needed (can't automate)

**Invalid Skip Reasons** (Should FAIL):
- ❌ Admin login failed → Feature broken!
- ❌ CSRF service unavailable → Security bug!
- ❌ Form not found → UI broken!
- ❌ API returns error → Backend bug!

### 2. Never Use Early Returns Without test.skip()

**Problem**: Early returns cause tests to silently pass without executing assertions, creating false positives in the test suite.

```javascript
// ❌ BAD: Silent pass - test appears to succeed but actually skipped all assertions
test('my test', async ({ page }) => {
  const hasFeature = await checkFeature(page);
  if (!hasFeature) {
    console.log('Feature not available');
    return; // WRONG! Test silently passes
  }
  await expect(something).toBe(true); // Never reached
});

// ✅ GOOD: Explicit skip that test framework tracks
test('my test', async ({ page }) => {
  const hasFeature = await checkFeature(page);
  if (!hasFeature) {
    test.skip(true, 'Feature not available in this environment');
    // test.skip() handles everything - no return needed
  }
  await expect(something).toBe(true);
});
```

### 2. Always Use test.skip() with true Parameter Inside Running Tests

**Problem**: Calling `test.skip('reason')` without the `true` parameter inside a running test tries to define a new skipped test instead of skipping the current one.

```javascript
// ❌ BAD: Wrong syntax for conditional skip
test('my test', async ({ page }) => {
  if (condition) {
    test.skip('Skipping test'); // WRONG! Missing true parameter
  }
  // Test continues running even after "skip"
});

// ✅ GOOD: Correct syntax for conditional skip
test('my test', async ({ page }) => {
  if (condition) {
    test.skip(true, 'Skipping test due to condition'); // CORRECT!
  }
  // Test is properly skipped
});

// ✅ ALSO GOOD: Suite-level skip (no true parameter needed)
test.describe('My Suite', () => {
  if (shouldSkip) {
    test.skip('Skipping entire suite'); // OK at suite level
    return; // OK to return after suite-level skip
  }
});
```

### 3. Always Make At Least One Assertion

**Problem**: Tests without assertions can silently pass even when the functionality is broken.

```javascript
// ❌ BAD: No assertions - test always passes
test('page loads', async ({ page }) => {
  await page.goto('/some-page');
  console.log('Page loaded'); // NOT an assertion!
});

// ✅ GOOD: Explicit assertions validate behavior
test('page loads', async ({ page }) => {
  await page.goto('/some-page');
  await expect(page).toHaveURL(/some-page/);
  await expect(page.locator('h1')).toBeVisible();
});
```

### 4. Prefer Explicit Errors Over Silent Returns

**Problem**: Silent returns hide test failures and make debugging harder.

```javascript
// ❌ BAD: Silent return hides failure
test('my test', async ({ page }) => {
  const data = await fetchData(page);
  if (!data) {
    console.log('No data found');
    return; // WRONG! Hides potential bug
  }
  await expect(data.value).toBe(expected);
});

// ✅ GOOD: Explicit error or skip
test('my test', async ({ page }) => {
  const data = await fetchData(page);
  if (!data) {
    // Option 1: Skip if this is expected
    test.skip(true, 'No data available - expected for this deployment');

    // Option 2: Fail if this is unexpected
    throw new Error('Expected data to be available but got null');
  }
  await expect(data.value).toBe(expected);
});
```

## Common Patterns

### Handling Missing Features (Should FAIL)

```javascript
test('critical feature test', async ({ page }) => {
  // Check if feature is available
  const hasFeature = await page.locator('.feature-element').count() > 0;

  if (!hasFeature) {
    // ❌ Don't skip - this is a BUG!
    throw new Error('Feature element not found - this is a critical UI bug!');
  }

  // Test the feature
  await expect(page.locator('.feature-element')).toBeVisible();
});
```

### Handling Login Prerequisites

```javascript
test('authenticated feature', async ({ page }) => {
  const loginSuccess = await loginAsAdmin(page);

  // ✅ Valid skip: External rate limiting (temporary constraint)
  if (loginSuccess === 'rate_limited') {
    test.skip(true, 'Admin account rate limited');
  }

  // ❌ Don't skip: Login failure is a BUG!
  if (!loginSuccess) {
    throw new Error('Admin login failed - authentication system is broken!');
  }

  // Test authenticated functionality
  await expect(page).toHaveURL(/dashboard/);
});
```

### Handling Empty State (Test It, Don't Skip!)

```javascript
test('gallery content', async ({ page }) => {
  await page.goto('/gallery');

  const imageCount = await page.locator('.gallery-item').count();

  // ✅ Don't skip - test the empty state UI!
  if (imageCount === 0) {
    console.log('✅ Gallery is empty - testing empty state handling');
    // Verify page still loads with basic structure
    const bodyText = await page.locator('body').textContent();
    expect(bodyText.length).toBeGreaterThan(100);
    // Look for empty state messaging or basic page structure
    const hasEmptyStateUI = await page.locator('.empty-state, .no-content').count() > 0;
    expect(hasEmptyStateUI).toBe(true);
    return; // Test passes - empty state is handled correctly
  }

  // Test gallery with content
  expect(imageCount).toBeGreaterThan(0);
  await expect(page.locator('.gallery-item').first()).toBeVisible();
});
```

## Historical Issues Fixed (March 2025)

### Issue 1: || true Pattern Hiding Failures

**Problem**: GitHub Actions workflow used `|| true` pattern in secret validation and exit code handling, causing failing tests to appear successful.

**Location**: `.github/workflows/e2e-tests-preview.yml`

**Fix**:
- Removed `|| true` from secret validation checks
- Implemented proper exit code handling that correctly detects test failures
- Added critical vs. optional secret categorization

### Issue 2: Early Returns Creating Silent Passes

**Problem**: 26+ instances across test files where tests would return early without using test.skip(), causing tests to silently pass without running assertions.

**Affected Files**:
- `admin-auth.test.js` (7 instances)
- `dark-mode-admin.test.js` (12 instances)
- `csrf-token-management.test.js` (9 instances)
- `gallery-basic.test.js` (3 instances)
- `ticket-validation.test.js` (2 instances)

**Fix**:
- Replaced all `return;` statements with `test.skip(true, 'reason')`
- Replaced console.log-only paths with explicit error throwing
- Added proper error handling for prerequisite failures

### Issue 3: Improper test.skip() Usage

**Problem**: Tests calling `test.skip('reason')` without the `true` parameter inside running tests, which doesn't actually skip the test.

**Fix**: Updated all conditional skips to use `test.skip(true, 'reason')` syntax.

### Issue 4: Excessive Skipping Hiding Real Bugs

**Problem**: Tests were skipping when they should have been failing. Missing features or broken functionality would cause tests to skip instead of fail, hiding real bugs.

**Examples**:
- ❌ **Before**: "CSRF service not available" → test.skip()
- ✅ **After**: "CSRF service not available" → throw Error() (it's a critical security bug!)
- ❌ **Before**: "Admin login failed" → test.skip()
- ✅ **After**: "Admin login failed" → throw Error() (authentication is broken!)
- ❌ **Before**: "Gallery empty" → test.skip()
- ✅ **After**: "Gallery empty" → Test the empty state UI (passes)

**Impact**:
- Fixed ~15 inappropriate skips → now properly fail when features broken
- Fixed ~6 gallery skips → now test empty state handling
- Kept only 4 valid skips (rate limiting + MFA)
- Tests now accurately reflect system health

## Test Quality Helper

Use the test quality helper for complex tests to ensure proper assertion tracking:

```javascript
import { ensureTestCompletion } from '../helpers/test-quality.js';

test('complex test', async ({ page }) => {
  const tracker = ensureTestCompletion();

  // ... test logic ...
  await expect(something).toBe(true);
  tracker.assertionMade();

  // ... more test logic ...
  await expect(another).toBeVisible();
  tracker.assertionMade();

  // Verify test made assertions
  tracker.complete();
});
```

## CI/CD Integration

E2E tests run in GitHub Actions against Vercel Preview Deployments with the following validations:

1. **Secret Validation**: Ensures required secrets are available before running tests
2. **Exit Code Handling**: Properly detects test failures vs. filtered test runs
3. **Test Pattern Filtering**: Can run specific test patterns while maintaining correct exit codes
4. **Timeout Management**: Configurable timeouts for different deployment environments

See `.github/workflows/e2e-tests-preview.yml` for complete implementation.

## Running Tests Locally

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- tests/e2e/flows/admin-auth.test.js

# Run tests in headed mode (see browser)
npm run test:e2e -- --headed

# Run tests in UI mode (interactive debugging)
npm run test:e2e -- --ui
```

## Debugging Failed Tests

1. **Check Test Output**: Look for actual error messages, not just "test passed"
2. **Verify Prerequisites**: Ensure required secrets and services are available
3. **Check for Silent Passes**: Look for early returns or missing assertions
4. **Use Debug Mode**: Run with `--headed` or `--ui` flags to see browser behavior
5. **Check CI Logs**: GitHub Actions logs show secret validation and exit code details

## Test Organization

```text
tests/e2e/
├── flows/              # E2E test scenarios
│   ├── admin-auth.test.js
│   ├── gallery-browsing.test.js
│   └── ...
├── helpers/            # Test utilities
│   ├── test-quality.js      # Assertion tracking and best practices
│   ├── test-setup.js        # Secret validation and environment setup
│   └── playwright-utils.js  # Playwright helper functions
└── README.md          # This file
```

## Contributing

When adding new E2E tests:

1. ✅ **DO**: Use `test.skip(true, 'reason')` for conditional skips
2. ✅ **DO**: Always include meaningful assertions
3. ✅ **DO**: Throw explicit errors for unexpected failures
4. ✅ **DO**: Handle optional features gracefully
5. ❌ **DON'T**: Use early returns without test.skip()
6. ❌ **DON'T**: Rely only on console.log() for validation
7. ❌ **DON'T**: Use `|| true` to hide failures
8. ❌ **DON'T**: Call test.skip() without the `true` parameter inside tests

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Test Quality Helper](./helpers/test-quality.js)
- [GitHub Actions Workflow](../../.github/workflows/e2e-tests-preview.yml)
- [Project Testing Guide](../../CLAUDE.md#streamlined-testing-strategy)
