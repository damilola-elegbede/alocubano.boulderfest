# Archived Playwright Configurations

This directory contains the legacy Playwright configuration files that were consolidated into the unified `playwright.config.js` in the project root.

## Configuration Migration (Issue #13)

**Problem Solved**: Multiple conflicting Playwright configuration files with different base URLs, timeout settings, and browser configurations were causing test inconsistencies and configuration conflicts.

## Legacy Configuration Files

### 1. `playwright-e2e-vercel-main.config.js` (Primary - DEPRECATED)
- **Purpose**: Main configuration used by CI and most npm scripts
- **Features**: Dynamic port allocation, Vercel dev server integration, advanced scenarios
- **Base URL**: `http://localhost:${DYNAMIC_PORT}` (default: 3000)
- **Database**: Turso for production-like testing
- **Used by**: Most `test:e2e:*` scripts, GitHub Actions workflows

### 2. `playwright-e2e-preview.config.js` (DEPRECATED)
- **Purpose**: Vercel preview deployment testing
- **Features**: External preview URL testing, no local server management
- **Base URL**: Environment-based preview URLs
- **Database**: Turso via preview deployment
- **Used by**: Preview deployment workflows

### 3. `playwright-e2e-ci.config.js` (DEPRECATED)
- **Purpose**: CI-optimized configuration with advanced scenarios
- **Features**: Dynamic port allocation, comprehensive timeouts, advanced browser flags
- **Base URL**: `http://localhost:${DYNAMIC_PORT}`
- **Database**: Turso for comprehensive testing
- **Used by**: Advanced testing scenarios, archived workflows

### 4. `playwright-e2e-vercel.config.js` (DEPRECATED)
- **Purpose**: Basic Vercel dev server configuration
- **Features**: Simple localhost:3000 setup, basic timeout configuration
- **Base URL**: `http://localhost:3000`
- **Database**: Turso or SQLite fallback
- **Used by**: Local development testing

## Unified Configuration (NEW)

**Location**: `/playwright.config.js` (project root)

**Key Features**:
- **Environment-Aware**: Automatically detects and adapts to different test environments
- **Single Source of Truth**: Consolidates all previous configurations
- **Backward Compatible**: Works with all existing npm scripts and workflows
- **Environment Detection**:
  1. **Preview Mode**: Uses Vercel preview deployments (PREVIEW_URL, CI_EXTRACTED_PREVIEW_URL)
  2. **CI Mode**: Uses local Vercel dev server with dynamic ports (CI + DYNAMIC_PORT)
  3. **Custom Mode**: Direct base URL override (PLAYWRIGHT_BASE_URL)
  4. **Local Mode**: Default localhost:3000 for development

**Environment Variables**:
- `PREVIEW_URL`: Use Vercel preview deployment (highest priority)
- `CI_EXTRACTED_PREVIEW_URL`: CI-extracted preview URL
- `PLAYWRIGHT_BASE_URL`: Direct base URL override
- `DYNAMIC_PORT`: Dynamic port for CI parallel execution
- `CI`: Enable CI optimizations
- `ADVANCED_SCENARIOS`: Enable advanced test scenarios
- `ALL_BROWSERS`: Enable all browser testing
- Various timeout overrides (`E2E_TEST_TIMEOUT`, `E2E_ACTION_TIMEOUT`, etc.)

## Migration Impact

### Package.json Scripts
**Before**: 
```json
"test:e2e": "playwright test --config=playwright-e2e-vercel-main.config.js"
```

**After**: 
```json
"test:e2e": "playwright test"
```

### GitHub Workflows
**Before**: 
```yaml
TEST_CMD="npx playwright test --config=playwright-e2e-vercel-main.config.js --project=chromium"
```

**After**: 
```yaml
TEST_CMD="npx playwright test --project=chromium"
```

## Benefits of Consolidation

1. **No Configuration Conflicts**: Single configuration eliminates conflicts between different files
2. **Environment-Appropriate Settings**: Automatic adaptation to CI, preview, or local environments
3. **Consistent Test Behavior**: Same configuration logic across all test scenarios
4. **Simplified Maintenance**: One file to update instead of five separate configurations
5. **Reduced Complexity**: Developers only need to understand one configuration approach
6. **Better Documentation**: Clear environment variable documentation in one place

## Troubleshooting

If you encounter issues after the migration:

1. **Check Environment Variables**: The new config relies on environment variables for behavior
2. **Verify Base URL**: Ensure the detected base URL matches your expected environment
3. **Review Timeout Settings**: Different environments may have different timeout requirements
4. **Validate Global Setup**: Ensure the correct global setup/teardown files are being used

## Rollback Instructions (Emergency Only)

If urgent rollback is needed:

1. Copy the desired legacy config from this archive to project root
2. Update package.json scripts to reference the specific config file
3. Update GitHub workflow files to use the specific config
4. File a new issue to address the problem with the unified configuration

## Testing the New Configuration

```bash
# Test local development mode
npm run test:e2e

# Test CI mode with dynamic port
DYNAMIC_PORT=3001 npm run test:e2e

# Test preview mode (with external URL)
PREVIEW_URL=https://your-preview-url.vercel.app npm run test:e2e

# Test advanced scenarios
ADVANCED_SCENARIOS=true npm run test:e2e
```

## Archive Date

These configurations were archived on: September 3, 2025
Migration completed as part of: Issue #13 - Playwright Configuration Conflicts