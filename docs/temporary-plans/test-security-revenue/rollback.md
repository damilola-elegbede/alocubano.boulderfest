# Rollback Plan: Test Infrastructure Security & Revenue Protection

## Quick Rollback Commands

```bash
# Complete rollback to original state
git checkout -- tests/basic-validation.test.js
git checkout -- tests/helpers.js
rm -f tests/security-critical.test.js
rm -f tests/payment-critical.test.js
npm test  # Verify original tests pass
```

## Rollback Scenarios

### Scenario 1: Test Execution Time Degradation
**Trigger**: Test suite exceeds 500ms  
**Impact**: Slower developer feedback loop  

**Steps**:
1. Remove security-critical.test.js and payment-critical.test.js
2. Keep SQL injection test if <50ms impact
3. Monitor execution time: `time npm test`
4. Document which tests caused slowdown

### Scenario 2: CI/CD Pipeline Failures
**Trigger**: Tests fail in CI but pass locally  
**Impact**: Blocked deployments  

**Steps**:
1. Identify failing test: `npm test -- --reporter=verbose`
2. Comment out failing test temporarily
3. Create issue for investigation
4. Rollback if not resolved in 1 hour

### Scenario 3: False Positive Security Alerts
**Trigger**: Legitimate requests blocked by security tests  
**Impact**: Valid user operations rejected  

**Steps**:
1. Identify overly restrictive test
2. Adjust test patterns or remove
3. Document legitimate patterns that triggered false positive
4. Update test with more precise patterns

### Scenario 4: Payment Test Failures
**Trigger**: Stripe API changes or rate limits  
**Impact**: Payment tests fail consistently  

**Steps**:
1. Check Stripe status page
2. Temporarily skip payment tests: `test.skip('payment webhook...')`
3. Monitor Stripe changelog
4. Update tests when API stabilizes

## File-by-File Rollback

### tests/basic-validation.test.js
```bash
# Remove SQL injection test only
git diff HEAD -- tests/basic-validation.test.js
git checkout -p HEAD -- tests/basic-validation.test.js
# Select 'n' for SQL injection test, 'y' for other hunks
```

### tests/helpers.js
```bash
# Remove HTTP_STATUS constants only
# Edit file and remove last 8 lines (HTTP_STATUS export)
vim tests/helpers.js
# Or
sed -i '' -e '/export const HTTP_STATUS/,/};/d' tests/helpers.js
```

### tests/security-critical.test.js
```bash
# Complete removal
rm tests/security-critical.test.js
```

### tests/payment-critical.test.js
```bash
# Complete removal
rm tests/payment-critical.test.js
```

## Validation After Rollback

```bash
# Verify test count returns to original
npm test 2>&1 | grep "Tests"
# Should show: Tests 22 passed (22)

# Verify execution time
time npm test
# Should be ~395ms

# Verify line count
wc -l tests/*.test.js tests/helpers.js | tail -1
# Should show ~419 total

# Run full validation
npm run deploy:check
```

## Partial Rollback Strategy

Keep high-value, low-risk improvements:

1. **Keep**: Network error handling (already proven)
2. **Keep**: Timeout implementation (already proven)
3. **Evaluate**: SQL injection test (15 lines)
4. **Remove if needed**: Security-critical tests (25 lines)
5. **Remove if needed**: Payment-critical tests (25 lines)
6. **Optional**: HTTP constants (6 lines)

## Recovery Timeline

- **Immediate** (< 5 min): Full rollback via git
- **Quick** (< 15 min): Selective test removal
- **Measured** (< 1 hour): Fix and re-enable tests
- **Strategic** (< 1 day): Redesign problematic tests

## Post-Rollback Analysis

Document in `.tmp/test-security-revenue/postmortem.md`:
- What triggered rollback
- Which components failed
- Root cause analysis
- Lessons learned
- Revised approach

## Emergency Contacts

- **Stripe Support**: dashboard.stripe.com/support
- **CI/CD**: GitHub Actions logs
- **Monitoring**: Vercel dashboard
- **Database**: Turso dashboard

## Success Criteria for Re-Implementation

Before attempting again:
- [ ] Root cause identified
- [ ] Fix validated locally
- [ ] Execution time confirmed <500ms
- [ ] No false positives in 24 hours
- [ ] CI/CD passing consistently