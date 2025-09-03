# CI Fallback System

This directory contains comprehensive fallback mechanisms designed to achieve 98%+ CI pipeline success rate by implementing graceful degradation instead of hard failures.

## 🛡️ System Overview

The fallback system addresses **Issue #11: No Fallback Mechanisms** by providing:

- **Service Health Monitoring**: Proactive detection of service outages with fallback strategies
- **Preview URL Fallback Chain**: Multi-strategy URL extraction with production fallback
- **Graceful E2E Test Orchestration**: Intelligent test execution with retry and skip logic
- **Real-time Notification System**: Transparent reporting of fallback usage
- **Resilient Pipeline Architecture**: Continue-on-error strategies with comprehensive reporting

## 🔧 Components

### 1. Service Health Check (`service-health-check.js`)

Validates availability of critical services before pipeline execution:

```bash
# Run standalone health check
node scripts/ci/service-health-check.js --output-file health.env --report-file health.json

# Generated outputs
TURSO_AVAILABLE=false
GITHUB_API_AVAILABLE=true  
USE_SQLITE_FALLBACK=true
```

**Monitored Services:**
- **Turso Database** → Fallback: SQLite local database
- **Vercel API** → Fallback: Skip preview deployment checks  
- **GitHub API** → Critical: No fallback (pipeline stops)
- **NPM Registry** → Fallback: Retry with cache

### 2. Fallback Preview URL Extractor (`fallback-preview-url.js`)

Comprehensive URL extraction with 6-strategy fallback chain:

```bash
# Extract preview URL with fallbacks
node scripts/ci/fallback-preview-url.js --output-file preview.env

# Strategy Chain
1. Environment Variables (PREVIEW_URL, VERCEL_URL)
2. Vercel Bot Comments (GitHub PR API)
3. GitHub Deployments API
4. Vercel CLI Integration  
5. Vercel API Direct
6. Production URL Fallback
```

**Exit Codes:**
- `0` - Success (URL extracted)
- `1` - Critical failure (stop pipeline)
- `2` - Graceful failure (skip E2E with warning)

### 3. Graceful E2E Orchestrator (`graceful-e2e-orchestrator.js`)

Intelligent E2E test orchestration with comprehensive error handling:

```bash
# Run E2E tests with orchestration
node scripts/ci/graceful-e2e-orchestrator.js --output-file e2e-report.json

# Orchestration Flow
1. Service Health Validation
2. Target URL Determination (with fallbacks)
3. Environment Pre-flight Checks
4. Test Execution with Retries
5. Graceful Failure Handling
```

**Test Strategies:**
- **Preview Deployment** (preferred)
- **Production URL Fallback** (degraded functionality warning)
- **Graceful Skip** (with detailed reporting)

### 4. Fallback Notifier (`fallback-notifier.js`)

Real-time notification system for fallback events:

```bash
# Process and notify fallback events
node scripts/ci/fallback-notifier.js --data-file fallback-data.json

# Notification Channels
- Console output (always)
- GitHub PR comments (when available)
- JSON reports for external processing
```

**Notification Types:**
- 🔄 **Service Fallback**: Service unavailable, fallback active
- 🔗 **URL Fallback**: Preview URL extraction used alternative method
- 🎭 **E2E Fallback**: E2E tests using fallback strategy  
- ⏭️ **Test Skip**: Tests skipped with reason

## 🚀 CI Integration

The fallback system is integrated into the main CI pipeline (`main-ci-with-fallbacks.yml`):

### Pipeline Architecture

```yaml
health-check:           # Stage 0: Service validation
  ├── unit-tests        # Stage 1: With SQLite fallback
  ├── build             # Stage 2: With retry logic
  ├── extract-url       # Stage 3: Multi-strategy URL extraction
  ├── e2e-tests         # Stage 4: Graceful orchestration
  ├── performance       # Stage 5: Optional with continue-on-error
  ├── security-scan     # Stage 6: Resilient scanning
  ├── notifications     # Stage 7: Fallback reporting
  └── ci-status         # Stage 8: Comprehensive status
```

### Key Principles

1. **Never Fail Hard**: Use `continue-on-error: true` for non-critical steps
2. **Graceful Degradation**: Provide fallback strategies for all services
3. **Transparent Communication**: Report all fallback usage with context
4. **Comprehensive Metrics**: Track fallback frequency for optimization

## 📊 Success Metrics

The fallback system targets **98%+ pipeline success rate** through:

- **Service Resilience**: Multiple fallback strategies per service
- **Retry Logic**: Exponential backoff for transient failures  
- **Skip Logic**: Graceful skipping with detailed explanations
- **Monitoring**: Real-time visibility into fallback usage

### Expected Outcomes

| Scenario | Traditional CI | With Fallbacks |
|----------|----------------|----------------|
| Turso Database Down | ❌ Pipeline fails | ✅ Uses SQLite |
| Preview URL Missing | ❌ E2E tests fail | ⚠️ Uses production URL |
| Vercel API Issues | ❌ Deployment fails | ⚠️ Skips with notification |
| NPM Registry Slow | ❌ Timeout failure | ✅ Retries with cache |
| Network Transient | ❌ Random failures | ✅ Retry with backoff |

## 🔍 Monitoring & Debugging

### Health Check Outputs

```bash
# Service health environment variables
CAN_CONTINUE_CI=true
TURSO_AVAILABLE=false  
USE_SQLITE_FALLBACK=true
FALLBACKS_REQUIRED=2
SERVICE_HEALTH_STATUS=HEALTHY
```

### E2E Orchestration Report

```json
{
  "success": true,
  "url": "https://preview-abc123.vercel.app",
  "testStrategy": "PREVIEW_DEPLOYMENT", 
  "fallbackUsed": false,
  "testsRun": 12,
  "testsPassed": 11,
  "testsFailed": 0,
  "testsSkipped": 1,
  "warnings": [
    {
      "type": "SERVICE_FALLBACK",
      "message": "Using SQLite fallback for database tests"
    }
  ]
}
```

### Notification Output

```markdown
## 🛡️ CI Pipeline Fallback Report

### ⚠️ High Priority Fallbacks

#### 🔄 Service Fallback: turso
Service **turso** is unavailable, using fallback: **SQLite local database**

💡 **Recommendation**: Verify Turso credentials and connectivity. Tests will use SQLite fallback.

### 📊 Summary
- **Total Fallbacks**: 2
- **Critical Fallbacks**: 0  
- **Impact Level**: MEDIUM
- **Pipeline Status**: ✅ Operating normally

### 💡 What This Means
Fallback mechanisms have activated to maintain CI/CD pipeline reliability. The pipeline is operating normally using backup systems where needed. This is expected behavior designed to maintain high availability.
```

## 🧪 Testing the Fallback System

### Standalone Testing

```bash
# Test service health check
node scripts/ci/service-health-check.js

# Test URL extraction with no environment
GITHUB_TOKEN="" VERCEL_TOKEN="" node scripts/ci/fallback-preview-url.js

# Test E2E orchestration with fallback data
echo '{"healthCheck":{"canContinue":"true","tursoAvailable":"false"}}' | \
node scripts/ci/graceful-e2e-orchestrator.js

# Test notification system  
echo '{"fallbacksUsed":2,"services":{"turso":{"healthy":false,"fallbackAvailable":true}}}' | \
node scripts/ci/fallback-notifier.js
```

### Integration Testing

```bash
# Run the fallback-enabled CI pipeline locally
act -W .github/workflows/main-ci-with-fallbacks.yml

# Simulate service failures
TURSO_DATABASE_URL="" TURSO_AUTH_TOKEN="" act -W .github/workflows/main-ci-with-fallbacks.yml

# Test with missing GitHub token
GITHUB_TOKEN="" act -W .github/workflows/main-ci-with-fallbacks.yml
```

## 🔧 Configuration

### Environment Variables

The fallback system respects these configuration variables:

```bash
# Fallback behavior
FALLBACK_RETRY_COUNT=3              # Number of retries before fallback
FALLBACK_RETRY_DELAY=5000           # Delay between retries (ms)
HEALTH_CHECK_TIMEOUT=30000          # Health check timeout (ms)
E2E_FALLBACK_ENABLED=true           # Enable E2E fallbacks
NOTIFICATION_ENABLED=true           # Enable fallback notifications

# Service credentials (optional with fallbacks)
TURSO_DATABASE_URL=                 # Turso DB → SQLite fallback
TURSO_AUTH_TOKEN=                   # Turso auth → SQLite fallback
VERCEL_TOKEN=                       # Vercel API → CLI fallback
GITHUB_TOKEN=                       # GitHub API → Critical (no fallback)
```

### Customization

To modify fallback behavior, edit the configuration objects in each script:

```javascript
// service-health-check.js
this.services = {
  turso: {
    name: 'Turso Database',
    required: false,    // Can use fallback
    fallback: 'SQLite local database'
  }
}

// fallback-preview-url.js  
this.maxRetries = 3;
this.retryDelayMs = 5000;
this.productionUrl = 'https://alocubano-boulderfest.vercel.app';

// graceful-e2e-orchestrator.js
this.config = {
  maxRetries: 3,
  testTimeout: 600000,  // 10 minutes
  browsers: ['chromium', 'firefox']
}
```

## 🎯 Troubleshooting

### Common Issues

**Q: Health check always reports services as down**
```bash
# Check network connectivity
curl -I https://api.github.com/user -H "Authorization: token $GITHUB_TOKEN"

# Verify credentials
echo $TURSO_DATABASE_URL | cut -d'/' -f3  # Should show hostname
```

**Q: Preview URL extraction always fails**
```bash
# Test GitHub API access
gh pr view $PR_NUMBER --json comments

# Check PR number detection
echo "PR: ${GITHUB_PR_NUMBER:-${PR_NUMBER:-Not Set}}"
```

**Q: E2E tests always skip**
```bash
# Check Playwright installation
npx playwright --version
npx playwright install --dry-run

# Test URL accessibility
curl -I $PREVIEW_URL/api/health/check
```

**Q: Notifications not appearing**
```bash
# Verify GitHub token permissions
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$GITHUB_REPOSITORY

# Check PR comment permissions
curl -X POST -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments \
  -d '{"body":"Test comment"}'
```

## 🔮 Future Enhancements

- **Metrics Dashboard**: Historical fallback usage tracking
- **Predictive Fallbacks**: ML-based service failure prediction
- **Auto-Recovery**: Automatic retry of failed services
- **Regional Fallbacks**: Geographic failover for global resilience
- **Cost Optimization**: Fallback usage cost analysis

## 📞 Support

For issues with the fallback system:

1. **Check the logs**: All fallback scripts provide detailed logging
2. **Review artifacts**: CI uploads comprehensive debug information
3. **Test standalone**: Run scripts individually to isolate issues
4. **Monitor notifications**: GitHub PR comments show real-time status

The fallback system is designed to **fail gracefully** - if something isn't working, it will provide clear information about what failed and why, while still allowing the pipeline to continue.