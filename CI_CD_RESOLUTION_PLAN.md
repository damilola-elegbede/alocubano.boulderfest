# CI/CD Resolution Plan - Critical Issues

## Executive Summary
We have been experiencing repeated CI/CD failures with memory issues locally and workflow trigger problems. This plan addresses both issues systematically to ensure we resolve them in ONE final push.

## Issues Identified

### 1. CI/CD Pipeline Not Triggering
**Root Cause**: Branch `feature/brevo-email-integration` is not included in workflow triggers
**Impact**: No automated tests running on pushes
**Files Affected**: 
- `.github/workflows/ci.yml`
- `.github/workflows/test-automation.yml`

### 2. Local Memory Issues with Vitest
**Root Cause**: 
- Tests consuming ~5GB memory per instance
- Memory not being released after test completion
- Running 8 concurrent tests = ~40GB memory usage
**Impact**: System lockup, development blocked

### 3. Rate Limiting Concerns
**Issue**: CodeRabbit reviews are rate-limited
**Impact**: Must minimize push attempts

## Resolution Strategy

### Phase 1: Memory Management (Local Testing)

1. **Implement Test Cleanup**
   - Add global afterEach/afterAll hooks to cleanup resources
   - Force garbage collection between test suites
   - Clear all mocks, timers, and DOM elements

2. **Optimize Test Concurrency**
   - Reduce maxConcurrency from 8 to 4 (or 2 for safety)
   - Implement memory-aware test splitting
   - Add poolOptions to limit worker threads

3. **Memory Monitoring**
   - Add memory usage logging to identify leaks
   - Track which test files consume most memory
   - Implement test timeout to prevent hanging tests

### Phase 2: CI/CD Configuration

1. **Fix Workflow Triggers**
   - Add `feature/brevo-email-integration` to branch triggers
   - Ensure both workflows cover all feature branches
   - Test workflow execution locally using act

2. **Verify ES Module Compatibility**
   - Ensure all scripts work with "type": "module"
   - Test prebuild scripts thoroughly
   - Verify Node.js version compatibility

### Phase 3: Pre-Push Verification

1. **Local Test Suite**
   - Run tests with limited concurrency
   - Monitor memory usage throughout
   - Ensure 100% pass rate

2. **CI/CD Dry Run**
   - Use GitHub Actions locally with `act`
   - Verify all workflows would trigger
   - Check for any configuration issues

3. **Final Checklist**
   - All tests passing locally
   - Memory usage stable
   - No ESM errors
   - Workflows configured correctly
   - CodeRabbit budget considered

## Implementation Steps

### Step 1: Test Infrastructure Fixes

```javascript
// vitest.config.js updates
export default defineConfig({
  test: {
    // Reduce concurrency
    maxConcurrency: 2,
    maxThreads: 2,
    minThreads: 1,
    
    // Add pool options
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 2,
        minThreads: 1,
        isolate: true
      }
    },
    
    // Force cleanup
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    
    // Add teardown
    globalTeardown: './tests/global-teardown.js'
  }
});
```

### Step 2: Global Teardown Script

```javascript
// tests/global-teardown.js
export default async function globalTeardown() {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Clear all timers
  clearInterval();
  clearTimeout();
  
  // Log memory usage
  console.log('Final memory usage:', process.memoryUsage());
}
```

### Step 3: Test Setup Updates

```javascript
// tests/setup-vitest.js additions
afterEach(() => {
  // Clear all mocks
  vi.clearAllMocks();
  vi.clearAllTimers();
  
  // Clear DOM
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  
  // Force GC if available
  if (global.gc) {
    global.gc();
  }
});
```

### Step 4: CI/CD Workflow Updates

```yaml
# .github/workflows/ci.yml
on:
  push:
    branches:
      - main
      - develop
      - 'feature/**'  # This will catch feature/brevo-email-integration
  pull_request:
    branches:
      - main
      - develop
```

## Success Criteria

1. **Memory Usage**: Tests run without exceeding 10GB total
2. **Test Performance**: All tests complete in < 2 minutes
3. **CI/CD**: Workflows trigger on push
4. **Zero Failures**: 100% test pass rate
5. **One Push**: Resolve everything in a single push

## Risk Mitigation

1. **Test locally with act**: `act push -W .github/workflows/ci.yml`
2. **Monitor memory**: Use `npm run test:unit -- --reporter=verbose`
3. **Incremental testing**: Test each change before combining
4. **Backup plan**: If memory issues persist, run tests sequentially

## Timeline

- **15 min**: Implement memory management fixes
- **10 min**: Update CI/CD workflows
- **20 min**: Test everything locally
- **5 min**: Final verification and push

**Total: 50 minutes to resolution**

## Command Sequence

```bash
# 1. Implement fixes (as detailed above)

# 2. Test memory usage
npm run test:unit -- --reporter=verbose --run

# 3. Verify CI/CD locally
act push -W .github/workflows/ci.yml --dryrun

# 4. Run full test suite
npm run test:all

# 5. Final push
git add -A
git commit -m "fix: resolve CI/CD triggers and test memory leaks

- Add feature branch patterns to workflow triggers
- Implement test cleanup and memory management
- Reduce test concurrency to prevent memory exhaustion
- Add global teardown for resource cleanup"
git push
```

## Post-Push Monitoring

1. Watch GitHub Actions for workflow execution
2. Monitor CodeRabbit review
3. Check memory usage metrics
4. Verify all tests pass in CI

## Contingency Plan

If issues persist after this push:
1. Disable parallel testing entirely
2. Split test suites into smaller chunks
3. Use GitHub Actions matrix strategy for test isolation
4. Consider upgrading development machine memory

---

**CRITICAL**: This plan must succeed in ONE push. Follow every step meticulously.