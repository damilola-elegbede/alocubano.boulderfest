# Unified Timeout Strategy

This document describes the unified timeout configuration system that eliminates conflicts and random timeout failures across all E2E tests.

## Overview

The unified timeout strategy makes the **Playwright configuration the single source of truth** for all timeout values. All other timeout configurations derive their values from the Playwright config using a proportional hierarchy.

## Architecture

### Single Source of Truth: Playwright Config

All timeout values start from the main test timeout in `playwright-e2e-optimized.config.js`:

```javascript
// Base timeout that scales all other timeouts
timeout: isCI ? 90000 : 60000,  // Main test timeout

expect: {
  timeout: isCI ? 20000 : 15000,  // ~22% of test timeout
},

use: {
  actionTimeout: isCI ? 30000 : 20000,     // ~33% of test timeout
  navigationTimeout: isCI ? 60000 : 40000, // ~67% of test timeout
}
```

### Proportional Timeout Hierarchy

All timeouts are calculated as percentages of the main test timeout:

| Timeout Type | Percentage | CI Value | Local Value | Purpose |
|-------------|------------|----------|-------------|---------|
| **Test** | 100% | 90s | 60s | Main test execution |
| **Navigation** | 67% | 60s | 40s | Page navigation |
| **Action** | 33% | 30s | 20s | User interactions |
| **Expect** | 22% | 20s | 15s | Assertions |
| **Long Operations** | 50% | 45s | 30s | Heavy operations |
| **Medium Operations** | 17% | 15s | 10s | Normal operations |
| **Quick Operations** | 8% | 7s | 5s | Fast operations |

## Usage in Tests

### Dynamic Timeout Functions

Use the helper functions in `playwright-utils.js` to get dynamic timeout values:

```javascript
import { getTestTimeout, getTimeouts } from '../helpers/playwright-utils.js';

// Get specific timeout pattern
const quickTimeout = getTestTimeout(test.info(), 'quick');      // 7s/5s
const normalTimeout = getTestTimeout(test.info(), 'normal');    // 15s/10s
const slowTimeout = getTestTimeout(test.info(), 'slow');        // 45s/30s
const navTimeout = getTestTimeout(test.info(), 'navigation');   // 60s/40s
const actionTimeout = getTestTimeout(test.info(), 'action');    // 30s/20s
const apiTimeout = getTestTimeout(test.info(), 'api');          // 20s/15s

// Get all timeout values at once
const timeouts = getTimeouts(test.info());
```

### Replacing Hardcoded Timeouts

**Before (hardcoded):**
```javascript
await page.waitForSelector('.element', { timeout: 10000 });
await page.goto('/path', { timeout: 60000 });
await expect(element).toBeVisible({ timeout: 5000 });
```

**After (dynamic):**
```javascript
await page.waitForSelector('.element', { timeout: getTestTimeout(test.info(), 'normal') });
await page.goto('/path', { timeout: getTestTimeout(test.info(), 'navigation') });
await expect(element).toBeVisible({ timeout: getTestTimeout(test.info(), 'quick') });
```

### Helper Functions with Dynamic Timeouts

Pass `test.info()` to helper functions to use dynamic timeouts:

```javascript
// Instead of hardcoded timeout
await waitForPageReady(page, { timeout: 10000 }, test.info());

// Timeout is automatically calculated from test configuration
await waitForPageReady(page, {
  waitForSelector: '[data-testid="element"]',
  checkNetworkIdle: true
}, test.info());
```

### Environment Variable Configuration

The global setup automatically creates environment variables that match the Playwright config:

```bash
# These values are automatically derived from Playwright config
E2E_TEST_TIMEOUT=90000          # Matches Playwright timeout
E2E_ACTION_TIMEOUT=30000        # 33% of test timeout
E2E_NAVIGATION_TIMEOUT=60000    # 67% of test timeout
E2E_EXPECT_TIMEOUT=20000        # 22% of test timeout
```

## Benefits

### 1. Eliminates Timeout Conflicts
- Single source of truth prevents contradictory configurations
- All timeouts scale proportionally with main test timeout
- Browser-specific timeout overrides removed

### 2. Environment Consistency
- CI and local environments use the same proportional scaling
- No hardcoded environment-specific values
- Automatic adaptation to different test execution contexts

### 3. Easy Maintenance
- Change one value in Playwright config to adjust all timeouts
- No need to hunt down hardcoded values across multiple files
- Consistent timeout behavior across all tests

### 4. Better Test Reliability
- Timeouts scale appropriately with test complexity
- No more random timeout failures from competing configurations
- Predictable timeout behavior across different browsers

## Implementation Checklist

When updating existing tests to use the unified timeout strategy:

- [ ] Import `getTestTimeout` or `getTimeouts` from `playwright-utils.js`
- [ ] Replace hardcoded timeout values with dynamic functions
- [ ] Pass `test.info()` to helper functions that need timeouts
- [ ] Remove browser-specific timeout overrides
- [ ] Update function signatures to accept `testInfo` parameter
- [ ] Test with both CI and local configurations

## Example: Complete Test Update

```javascript
import { test, expect } from '@playwright/test';
import { waitForPageReady, getTestTimeout } from '../helpers/playwright-utils.js';

test('example test with unified timeouts', async ({ page }) => {
  // Navigation with dynamic timeout
  await page.goto('/path', {
    timeout: getTestTimeout(test.info(), 'navigation')
  });

  // Wait for page ready with automatic timeout calculation
  await waitForPageReady(page, {
    waitForSelector: '[data-testid="content"]'
  }, test.info());

  // Element assertions with appropriate timeouts
  await expect(page.locator('.fast-element')).toBeVisible({
    timeout: getTestTimeout(test.info(), 'quick')
  });

  await expect(page.locator('.slow-element')).toBeVisible({
    timeout: getTestTimeout(test.info(), 'slow')
  });
});
```

## Troubleshooting

### Common Issues

1. **Test.info() is undefined**: Make sure you're calling the function inside a test context
2. **Timeouts still hardcoded**: Search for `timeout:` followed by numbers and replace with dynamic calls
3. **Helper functions not using dynamic timeouts**: Pass `test.info()` as the last parameter

### Debugging Timeout Values

Add this to any test to see the actual timeout values being used:

```javascript
test('debug timeouts', async ({ page }) => {
  const timeouts = getTimeouts(test.info());
  console.log('Timeout configuration:', timeouts);
});
```

## Migration Guide

### Phase 1: Update Playwright Config ✅
- Unified timeout hierarchy in `playwright-e2e-optimized.config.js`
- Removed browser-specific timeout overrides

### Phase 2: Update Global Setup ✅
- Dynamic timeout calculation in `global-setup-preview.js`
- Environment variables derive from Playwright config

### Phase 3: Update Helper Functions ✅
- Added dynamic timeout support to `playwright-utils.js`
- Helper functions accept `testInfo` parameter

### Phase 4: Update Test Files (In Progress)
- Replace hardcoded timeouts with dynamic functions
- Update function calls to pass `test.info()`
- Remove environment-specific timeout logic

### Phase 5: Validation
- Run full test suite to verify no timeout conflicts
- Monitor for improved test reliability
- Update documentation with lessons learned

## Future Considerations

- **Adaptive Timeouts**: Could extend to adjust timeouts based on historical test performance
- **Test-Specific Scaling**: Could allow individual tests to scale their timeouts up/down
- **Network-Aware Timeouts**: Could adjust timeouts based on detected network conditions