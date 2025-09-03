# Test Troubleshooting Guide - Phase 3

**A Lo Cubano Boulder Fest** - Comprehensive troubleshooting guide for three-layer test architecture issues.

## Quick Diagnosis

### Test Failure Symptoms

| Symptom | Layer | Likely Cause | Quick Fix |
|---------|-------|--------------|-----------|
| Tests pass locally, fail in CI | Unit | Environment differences | Check env vars |
| Tests >2s execution | Unit | Memory/performance | Increase memory allocation |
| Random test failures | Unit | Race conditions | Check async operations |
| Database connection errors | Integration | Database setup | Verify DB initialization |
| Browser timeouts | E2E | Slow page loads | Increase timeout values |
| Memory errors | All | Resource limits | Increase memory allocation |

### Emergency Quick Fixes

```bash
# Unit test quick fixes
NODE_OPTIONS="--max-old-space-size=6144" npm test

# Clear caches and reinstall
rm -rf node_modules package-lock.json
npm install

# Reset database
npm run db:e2e:reset

# Skip problematic tests temporarily (use sparingly)
npm test -- --reporter=verbose --bail=1
```

## Layer 1: Unit Test Troubleshooting

### Performance Issues

#### Symptom: Tests exceed 2-second target
```bash
# Diagnosis
npm run test:phase2:performance
time npm test

# Check memory usage
NODE_OPTIONS="--max-old-space-size=6144 --inspect" npm test
```

**Common Causes:**
1. **Memory Pressure**: Insufficient memory allocation
2. **Synchronous Operations**: Blocking operations in tests
3. **Large Test Suite**: Too many tests loading simultaneously
4. **Resource Leaks**: Memory leaks in test code

**Solutions:**
```bash
# Increase memory allocation
NODE_OPTIONS="--max-old-space-size=8192" npm test

# Use single fork for consistency
# Update tests/vitest.config.js:
poolOptions: {
  forks: {
    singleFork: true
  }
}

# Optimize test parallelization
maxConcurrency: process.env.CI === 'true' ? 1 : 3
```

#### Symptom: Random test failures (flaky tests)
```bash
# Run tests multiple times to identify flaky tests
for i in {1..10}; do echo "Run $i"; npm test || echo "Failed on run $i"; done
```

**Common Causes:**
1. **Async Race Conditions**: Improper promise handling
2. **Shared State**: Tests affecting each other
3. **Timing Issues**: setTimeout/setInterval problems
4. **External Dependencies**: Network or file system deps

**Solutions:**
```javascript
// Proper async handling
describe('Async operations', () => {
  it('should handle promises correctly', async () => {
    // ✅ Good: Proper await
    const result = await asyncOperation();
    expect(result).toBe('expected');
    
    // ❌ Bad: Missing await
    // const result = asyncOperation();
  });
});

// Clean test isolation
describe('Stateful operations', () => {
  beforeEach(() => {
    // Reset state before each test
    TestState.reset();
  });
  
  afterEach(() => {
    // Clean up after each test
    TestState.cleanup();
  });
});
```

### Memory Issues

#### Symptom: Out of memory errors
```bash
# Check memory usage patterns
NODE_OPTIONS="--max-old-space-size=8192 --trace-gc" npm test
```

**Common Causes:**
1. **Large Mock Objects**: Oversized test data
2. **Memory Leaks**: Objects not garbage collected
3. **Circular References**: Objects referencing each other
4. **Global Variables**: Accumulating test state

**Solutions:**
```javascript
// Optimize mock data
const createMockData = () => ({
  // ✅ Good: Minimal necessary data
  id: 1,
  name: 'Test User',
  email: 'test@example.com'
});

// ❌ Bad: Excessive mock data
// const mockData = {
//   id: 1,
//   name: 'Test User',
//   email: 'test@example.com',
//   fullProfile: { /* huge object */ },
//   history: { /* massive array */ }
// };

// Clean up resources
afterEach(() => {
  // Clear large objects
  mockData = null;
  testCache.clear();
  
  // Force garbage collection in tests (if needed)
  if (global.gc) {
    global.gc();
  }
});
```

### Database Issues

#### Symptom: Database connection failures
```bash
# Check database file
ls -la data/
sqlite3 data/ci-test.db ".tables"

# Verify database initialization
npm run migrate:status
```

**Common Causes:**
1. **Missing Database File**: Database not created
2. **Permission Issues**: File access problems
3. **Migration Failures**: Schema not up to date
4. **Concurrent Access**: Multiple processes accessing DB

**Solutions:**
```bash
# Ensure database directory exists
mkdir -p data

# Reset database
rm -f data/ci-test.db
npm run migrate:up

# Check permissions
chmod 755 data
chmod 644 data/*.db
```

```javascript
// Proper database setup in tests
beforeAll(async () => {
  // Ensure clean database state
  await DatabaseService.initialize();
  await DatabaseService.migrate();
});

afterAll(async () => {
  // Clean up database connections
  await DatabaseService.close();
});

beforeEach(async () => {
  // Clean slate for each test
  await DatabaseService.clearTestData();
});
```

## Layer 2: Integration Test Troubleshooting

### API Testing Issues

#### Symptom: API endpoint failures
```bash
# Test API endpoints directly
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check server logs
npm run dev 2>&1 | tee server.log
```

**Common Causes:**
1. **Server Not Started**: API server not running
2. **Port Conflicts**: Port already in use
3. **Authentication Issues**: Missing auth headers
4. **Request Format**: Incorrect request structure

**Solutions:**
```javascript
// Proper API test setup
describe('API Integration', () => {
  let server;
  
  beforeAll(async () => {
    // Start test server
    server = await startTestServer(3001);
    await server.waitForReady();
  });
  
  afterAll(async () => {
    // Clean server shutdown
    await server.close();
  });
  
  it('should handle API requests', async () => {
    const response = await fetch(`${server.baseURL}/api/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(testData)
    });
    
    expect(response.status).toBe(200);
  });
});
```

### Database Integration Issues

#### Symptom: Database transactions failing
```bash
# Check database integrity
sqlite3 data/test.db "PRAGMA integrity_check;"

# Verify transaction isolation
npm run test:integration 2>&1 | grep -i "transaction\|rollback"
```

**Common Causes:**
1. **Transaction Conflicts**: Overlapping transactions
2. **Deadlocks**: Circular waiting conditions
3. **Connection Pooling**: Too many connections
4. **Migration Issues**: Schema inconsistencies

**Solutions:**
```javascript
// Proper transaction handling
describe('Database Transactions', () => {
  let transaction;
  
  beforeEach(async () => {
    // Start transaction for isolation
    transaction = await db.beginTransaction();
  });
  
  afterEach(async () => {
    // Always rollback test transactions
    if (transaction) {
      await transaction.rollback();
    }
  });
  
  it('should handle database operations', async () => {
    // Use transaction for test operations
    const result = await transaction.insert('users', userData);
    expect(result.id).toBeGreaterThan(0);
    
    // Verify within same transaction
    const user = await transaction.findById('users', result.id);
    expect(user.name).toBe(userData.name);
  });
});
```

### Service Integration Issues

#### Symptom: Service communication failures
```bash
# Check service dependencies
npm run health:check

# Verify service endpoints
curl -f http://localhost:3000/api/health/check
```

**Common Causes:**
1. **Service Unavailability**: External service down
2. **Network Issues**: Connectivity problems
3. **Authentication Failures**: Invalid credentials
4. **Rate Limiting**: Too many requests

**Solutions:**
```javascript
// Mock external services in integration tests
describe('Service Integration', () => {
  beforeAll(() => {
    // Mock external service calls
    nock('https://api.external-service.com')
      .post('/endpoint')
      .reply(200, mockResponse);
  });
  
  afterAll(() => {
    // Clean up mocks
    nock.cleanAll();
  });
  
  it('should integrate with external service', async () => {
    const result = await ServiceIntegration.callExternalAPI(testData);
    expect(result.status).toBe('success');
  });
});

// Service health checks
describe('Service Health', () => {
  it('should verify service availability', async () => {
    const health = await HealthCheck.verifyServices();
    expect(health.database).toBe('healthy');
    expect(health.external_api).toBe('healthy');
  });
});
```

## Layer 3: E2E Test Troubleshooting

### Browser Issues

#### Symptom: Browser launch failures
```bash
# Check Playwright installation
npx playwright install --dry-run

# Verify browser binaries
npx playwright install chromium firefox webkit
```

**Common Causes:**
1. **Missing Dependencies**: Browser deps not installed
2. **Permission Issues**: Browser execution permissions
3. **System Resources**: Insufficient memory/CPU
4. **Environment Issues**: Display/graphics problems

**Solutions:**
```bash
# Install browser dependencies
npx playwright install-deps

# Check system resources
free -h
ps aux | grep -i playwright

# Run with specific browser
npx playwright test --project=chromium

# Debug mode for investigation
npx playwright test --debug --headed
```

#### Symptom: Page timeouts
```bash
# Run with increased timeouts
E2E_NAVIGATION_TIMEOUT=90000 npm run test:e2e

# Check network issues
curl -I https://preview-url.vercel.app
```

**Common Causes:**
1. **Slow Page Loads**: Performance issues
2. **Network Delays**: Connectivity problems  
3. **Resource Loading**: Large assets/slow CDN
4. **Server Issues**: Backend performance problems

**Solutions:**
```javascript
// Increase timeouts for slow operations
test('should handle slow operations', async ({ page }) => {
  // Increase timeout for this specific test
  test.setTimeout(120000); // 2 minutes
  
  // Wait for specific conditions
  await page.goto(baseURL);
  await page.waitForLoadState('networkidle');
  
  // Wait for specific elements
  await page.waitForSelector('[data-testid="content"]', {
    timeout: 60000
  });
  
  // Handle slow API calls
  await page.waitForResponse(
    response => response.url().includes('/api/data') && response.status() === 200,
    { timeout: 30000 }
  );
});
```

### Deployment Issues

#### Symptom: Preview deployment unavailable
```bash
# Check deployment status
gh pr view --json deployments

# Verify Vercel deployment
vercel list --scope=your-team

# Test deployment URL manually
curl -I https://preview-url.vercel.app
```

**Common Causes:**
1. **Build Failures**: Deployment build errors
2. **Environment Variables**: Missing configuration
3. **Domain Issues**: DNS or routing problems
4. **Resource Limits**: Vercel function limits

**Solutions:**
```bash
# Check build logs
vercel logs https://preview-url.vercel.app

# Verify environment variables
vercel env ls

# Test local build
vercel build
vercel dev
```

### Mobile Testing Issues

#### Symptom: Mobile tests failing
```bash
# Run mobile-specific tests
npm run test:e2e -- --project="mobile-chrome"

# Check mobile viewport issues
npx playwright test --headed --project="mobile-safari"
```

**Common Causes:**
1. **Viewport Issues**: Incorrect mobile sizing
2. **Touch Events**: Mouse vs touch interactions
3. **Mobile-Specific Features**: Device capabilities
4. **Network Conditions**: Mobile network simulation

**Solutions:**
```javascript
// Mobile-specific test configuration
test.describe('Mobile Tests', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2
  });
  
  test('should work on mobile', async ({ page }) => {
    await page.goto('/');
    
    // Use touch interactions
    await page.tap('[data-testid="mobile-menu"]');
    
    // Check mobile-specific elements
    await expect(page.locator('.mobile-navigation')).toBeVisible();
    
    // Simulate mobile network
    await page.route('**/*', route => {
      // Simulate slow 3G
      setTimeout(() => route.continue(), 100);
    });
  });
});
```

## Cross-Layer Issues

### Environment Configuration

#### Symptom: Environment variable issues
```bash
# Check environment variables
env | grep -E "(NODE_|CI|DATABASE_|TEST_)"

# Verify .env files
ls -la .env*
cat .env.local | grep -v "SECRET\|KEY\|TOKEN"
```

**Common Causes:**
1. **Missing Variables**: Required vars not set
2. **Wrong Environment**: Development vs production vars
3. **Variable Conflicts**: Conflicting variable values
4. **Encoding Issues**: Special characters in values

**Solutions:**
```bash
# Set required environment variables
export NODE_ENV=test
export CI=true
export DATABASE_URL="file:./data/test.db"

# Validate environment setup
node -e "console.log('Node:', process.version, 'Env:', process.env.NODE_ENV)"

# Check variable loading
node -r dotenv/config -e "console.log(process.env.DATABASE_URL)"
```

### Memory Management

#### Symptom: System memory exhaustion
```bash
# Monitor memory usage
watch -n 1 'free -h && ps aux | grep -E "(node|npm)" | head -10'

# Check Node.js memory usage
NODE_OPTIONS="--trace-gc --max-old-space-size=8192" npm test
```

**Common Causes:**
1. **Memory Leaks**: Objects not released
2. **Large Test Data**: Excessive mock objects
3. **Concurrent Tests**: Too many parallel processes
4. **Browser Memory**: Multiple browser instances

**Solutions:**
```bash
# Layer-specific memory allocation
NODE_OPTIONS="--max-old-space-size=6144" npm test           # Unit tests
NODE_OPTIONS="--max-old-space-size=4096" npm run test:integration  # Integration  
NODE_OPTIONS="--max-old-space-size=3072" npm run test:e2e   # E2E per browser

# Limit concurrency
export VITEST_MAX_CONCURRENCY=1  # Force single-threaded
export PLAYWRIGHT_WORKERS=1      # Single browser at a time
```

### CI/CD Pipeline Issues

#### Symptom: Pipeline timeouts
```bash
# Check pipeline duration
gh run list --workflow=main-ci-phase3.yml --limit=5

# Monitor specific job
gh run view <run-id> --job=<job-name>
```

**Common Causes:**
1. **Resource Contention**: Multiple jobs competing
2. **Slow Tests**: Performance regression
3. **Network Issues**: Dependency installation delays
4. **Hanging Processes**: Tests not completing

**Solutions:**
```yaml
# Optimize pipeline configuration
jobs:
  unit-tests:
    timeout-minutes: 8  # Strict timeout
    
  integration-tests:
    timeout-minutes: 20 # More time for DB operations
    
  e2e-tests:
    timeout-minutes: 15 # Per browser
    strategy:
      max-parallel: 2   # Limit concurrent browsers
```

## Monitoring & Alerting

### Performance Monitoring

#### Set up continuous monitoring
```bash
# Enable performance tracking
npm run test:phase2:performance

# Monitor success rates
npm run test:monitoring -- --analysis-period=24
```

#### Performance alerts
```javascript
// Custom performance monitoring
const performanceThresholds = {
  unitTests: 2000,        // 2 seconds max
  integrationTests: 30000, // 30 seconds max
  e2eTests: 300000        // 5 minutes max
};

function checkPerformance(layer, duration) {
  const threshold = performanceThresholds[layer];
  if (duration > threshold) {
    console.warn(`⚠️ ${layer} exceeded threshold: ${duration}ms > ${threshold}ms`);
    return false;
  }
  return true;
}
```

### Failure Pattern Detection

#### Common patterns to monitor
1. **Memory-related failures**: "out of memory", "heap"
2. **Timeout failures**: "timeout", "timed out"
3. **Database failures**: "database", "connection", "sqlite"
4. **Dependency failures**: "cannot find module", "import"

#### Automated pattern detection
```bash
# Run pattern detection
npm run test 2>&1 | grep -E "(memory|timeout|database|module)" || echo "No patterns detected"
```

## Recovery Procedures

### Quick Recovery Steps

1. **Identify Failure Layer**
   - Unit tests: Local environment issues
   - Integration tests: Database/API problems  
   - E2E tests: Browser/deployment issues

2. **Apply Layer-Specific Fixes**
   - Unit: Memory, environment, dependencies
   - Integration: Database, services, auth
   - E2E: Browser, deployment, network

3. **Verify Fix**
   - Run specific layer tests
   - Check CI pipeline
   - Monitor for recurrence

### Emergency Procedures

#### Complete test failure
```bash
# Skip all tests temporarily (emergency only)
npm run build # Verify build still works
git commit --no-verify -m "Emergency: bypass failing tests"

# Then fix tests immediately
npm test -- --reporter=verbose --bail=1
```

#### CI pipeline completely broken
```bash
# Use manual deployment (with extreme caution)
vercel --prod --force

# Then fix CI immediately
gh workflow run main-ci-phase3.yml --field force_deployment=true
```

## Prevention Strategies

### Best Practices

1. **Test Isolation**: Each test should be independent
2. **Resource Management**: Clean up after tests
3. **Error Handling**: Proper async/await usage
4. **Environment Consistency**: Same setup across environments
5. **Performance Monitoring**: Regular performance checks

### Continuous Improvement

1. **Regular Reviews**: Weekly test performance analysis
2. **Flaky Test Tracking**: Identify and fix unreliable tests
3. **Performance Trends**: Monitor test execution times
4. **Environment Updates**: Keep dependencies current
5. **Team Training**: Share troubleshooting knowledge

---

**Remember**: The three-layer test architecture is designed for reliability. Most issues can be resolved by understanding which layer is affected and applying the appropriate solutions from this guide.