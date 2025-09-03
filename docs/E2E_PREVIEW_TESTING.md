# E2E Testing with Vercel Preview Deployments

This document describes the new E2E testing approach using Vercel preview deployments instead of local servers.

## Overview

The new preview testing system provides:

✅ **Production-like Environment**: Tests run against actual Vercel deployments  
✅ **No Local Server Conflicts**: Eliminates port conflicts and resource issues  
✅ **Better Reliability**: No server startup failures or timeouts  
✅ **Automatic Cleanup**: Preview deployments are ephemeral  
✅ **True CI/CD Integration**: Tests exactly what will be deployed  

## Quick Start

### 1. Basic Usage

```bash
# Extract preview URL and run standard tests
npm run preview:test

# Run with specific preview URL
PREVIEW_URL=https://my-app-abc123.vercel.app npm run preview:test

# Validate environment only (no tests)
npm run preview:validate
```

### 2. Interactive Testing

```bash
# Run tests with visible browser
npm run preview:test:headed

# Run tests in debug mode
npm run preview:test:debug

# Test specific browser
npm run preview:test:chromium
```

### 3. Test Suites

```bash
# Performance testing
npm run preview:test:performance

# Security testing  
npm run preview:test:security

# Custom test pattern
node scripts/run-e2e-preview.js --test-pattern "admin-auth"
```

## Architecture

### Components

1. **URL Extractor** (`scripts/get-vercel-preview-url.js`)
   - Extracts preview URLs from GitHub PR comments
   - Queries Vercel API for deployment status
   - Fallback to Vercel CLI commands

2. **Environment Validator** (`scripts/validate-preview-environment.js`)
   - Validates deployment readiness
   - Checks critical API endpoints
   - Verifies database connectivity

3. **Test Runner** (`scripts/run-e2e-preview.js`)
   - Orchestrates the complete testing pipeline
   - Handles error reporting and cleanup
   - Generates comprehensive test reports

4. **Playwright Config** (`playwright-e2e-preview.config.js`)
   - Optimized for remote deployment testing
   - Extended timeouts for network requests
   - No local webServer configuration

### URL Extraction Strategy

The system tries multiple sources in order:

1. **Direct Environment Variable**: `PREVIEW_URL`
2. **GitHub PR Comments**: Vercel Bot deployment comments
3. **GitHub Deployments API**: Deployment status checks
4. **Vercel API**: Direct deployment queries
5. **Vercel CLI**: Fallback command-line extraction

## Environment Variables

### Required for CI/CD

```bash
# GitHub API access (for PR comment extraction)
GITHUB_TOKEN=ghp_xxxx

# Optional: Vercel API access (for deployment queries)
VERCEL_TOKEN=xxx
VERCEL_PROJECT_ID=prj_xxx
VERCEL_ORG_ID=team_xxx

# Optional: Direct URL override
PREVIEW_URL=https://my-app-abc123.vercel.app
```

### Test Configuration

```bash
# Admin panel testing
TEST_ADMIN_PASSWORD=test-password

# Test suite selection
TEST_SUITE=standard|performance|accessibility|security

# Browser selection
PLAYWRIGHT_BROWSER=chromium|firefox|webkit
```

## GitHub Actions Integration

### Workflow: E2E Tests (Vercel Preview)

The new workflow (`.github/workflows/e2e-preview-tests.yml`) provides:

- **Automatic URL Extraction**: From PR comments and deployments
- **Environment Validation**: Ensures deployment is ready
- **Matrix Testing**: Multiple browsers in parallel
- **Smart Test Selection**: Based on code changes
- **Comprehensive Reporting**: Detailed results and artifacts

### Manual Workflow Dispatch

```yaml
# Workflow inputs available:
test_suite: standard|advanced|performance|accessibility|security
test_pattern: "gallery" # or "admin", etc.
browsers: standard|extended|full|chromium-only
preview_url: "https://custom-url.vercel.app" # optional override
```

## Local Development

### Prerequisites

1. **Vercel CLI** (optional, for fallback URL extraction):
   ```bash
   npm install -g vercel
   ```

2. **Environment Setup**:
   ```bash
   # Copy and configure environment
   cp .env.example .env.local
   # Add GITHUB_TOKEN for PR comment extraction
   ```

### Development Workflow

1. **Deploy to Vercel** (automatically via PR or manual):
   ```bash
   vercel --prod  # or wait for automatic PR deployment
   ```

2. **Extract Preview URL**:
   ```bash
   # Automatic extraction
   npm run preview:extract-url
   
   # Manual specification
   export PREVIEW_URL=https://your-app-abc123.vercel.app
   ```

3. **Validate Environment**:
   ```bash
   npm run preview:validate
   ```

4. **Run Tests**:
   ```bash
   npm run preview:test:headed  # visible browser for development
   ```

### Testing Against Local Deployments

For testing against locally running Vercel dev server:

```bash
# Start Vercel dev server
vercel dev --listen 3000

# Test against localhost
PREVIEW_URL=http://localhost:3000 npm run preview:test
```

## Debugging

### Common Issues

1. **Preview URL Not Found**:
   ```bash
   # Check if deployment exists
   curl https://your-app.vercel.app/api/health/check
   
   # Manual URL extraction
   node scripts/get-vercel-preview-url.js
   ```

2. **Environment Validation Failures**:
   ```bash
   # Run validation with detailed output
   PREVIEW_URL=https://your-app.vercel.app node scripts/validate-preview-environment.js
   ```

3. **Test Failures**:
   ```bash
   # Run specific test pattern
   node scripts/run-e2e-preview.js --test-pattern "failing-test" --debug
   
   # Check artifacts in test-results/ and playwright-report-preview/
   ```

### Debugging Commands

```bash
# Health check
curl https://your-preview-url.vercel.app/api/health/check

# Database connectivity
curl https://your-preview-url.vercel.app/api/health/database

# Gallery API
curl https://your-preview-url.vercel.app/api/gallery

# Manual validation
PREVIEW_URL=https://your-url.vercel.app node scripts/validate-preview-environment.js
```

## Migration from Local Testing

### Old Approach (Deprecated)

```bash
# OLD: Start local server and run tests
npm run test:e2e  # ❌ Deprecated
```

### New Approach (Recommended)

```bash
# NEW: Test against preview deployment
npm run preview:test  # ✅ Recommended
```

### Benefits of Migration

| Aspect | Local Server | Preview Deployment |
|--------|--------------|-------------------|
| Environment | Development-like | Production-like |
| Server Conflicts | Common (port issues) | None |
| Startup Failures | Frequent | Rare |
| Resource Usage | High (local CPU/memory) | Low (remote) |
| CI Reliability | Variable | High |
| Cleanup | Manual | Automatic |
| True Production Testing | No | Yes |

## Best Practices

### 1. CI/CD Integration

- Use the new GitHub workflow for automatic PR testing
- Set up Vercel Bot for automatic deployment comments
- Configure required environment variables in repository secrets

### 2. Development Testing

- Use `--headed` mode for interactive debugging
- Test specific patterns with `--test-pattern` for faster feedback
- Validate environment before running full test suite

### 3. Performance Optimization

- Use appropriate test suites (don't run full suite for small changes)
- Leverage browser-specific testing (`--browser chromium`) for quick feedback
- Run performance tests only when needed

### 4. Error Handling

- Always validate environment first in CI/CD
- Use comprehensive error reporting for debugging
- Preserve test artifacts for failure analysis

## Advanced Usage

### Custom Test Configurations

```javascript
// Custom Playwright config extending preview config
import previewConfig from './playwright-e2e-preview.config.js';

export default {
  ...previewConfig,
  use: {
    ...previewConfig.use,
    // Custom overrides
    actionTimeout: 60000,
    navigationTimeout: 90000,
  }
};
```

### Programmatic Usage

```javascript
import VercelPreviewURLExtractor from './scripts/get-vercel-preview-url.js';
import PreviewEnvironmentValidator from './scripts/validate-preview-environment.js';

// Extract URL
const extractor = new VercelPreviewURLExtractor();
const previewUrl = await extractor.getPreviewURL();

// Validate environment
const validator = new PreviewEnvironmentValidator();
await validator.validate();

// Run custom tests
// ... your test logic
```

## Support and Troubleshooting

### Getting Help

1. **Check Documentation**: This file and code comments
2. **Review Logs**: GitHub Actions logs and Vercel deployment logs
3. **Test Manually**: Use debugging commands above
4. **Check Environment**: Verify all required environment variables

### Reporting Issues

When reporting issues, please include:

1. **Preview URL**: The deployment being tested
2. **Error Messages**: Full error output
3. **Environment**: OS, Node.js version, browser versions
4. **Reproduction Steps**: Commands used to reproduce the issue
5. **Expected vs Actual**: What should happen vs what happened

---

**Note**: This preview testing approach provides a more reliable and production-like testing environment compared to local server-based testing. It's the recommended approach for all E2E testing going forward.