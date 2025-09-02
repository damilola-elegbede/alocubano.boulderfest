# Vercel Authentication Fix for CI

## Issue Summary

The Vercel dev server was failing to authenticate in CI environments, causing E2E tests to fail. The server couldn't access private resources or deploy properly due to missing authentication credentials.

## Root Cause

The Playwright E2E configuration and Vercel dev scripts were not passing the required authentication flags:
- `--token` flag with `VERCEL_TOKEN`
- `--scope` flag with `VERCEL_ORG_ID` 
- `--no-clipboard` flag to prevent interactive prompts in CI

## Files Fixed

### 1. Playwright Configuration (`playwright-e2e-ci.config.js`)

**Before:**
```javascript
webServer: {
  command: `vercel dev --yes --listen ${PORT}${process.env.VERCEL_TOKEN ? ' --token=' + process.env.VERCEL_TOKEN : ''}`,
  // ...
}
```

**After:**
```javascript
function buildVercelCommand(port) {
  const args = [
    'vercel', 'dev', '--yes', '--listen', port,
    '--no-clipboard' // Prevent clipboard operations in CI
  ];
  
  // Add authentication if token is available
  if (process.env.VERCEL_TOKEN) {
    args.push('--token', process.env.VERCEL_TOKEN);
  }
  
  // Add scope if org ID is available  
  if (process.env.VERCEL_ORG_ID) {
    args.push('--scope', process.env.VERCEL_ORG_ID);
  }
  
  return args.join(' ');
}

const VERCEL_COMMAND = buildVercelCommand(PORT);

webServer: {
  command: VERCEL_COMMAND,
  // ...
}
```

### 2. Vercel Dev Scripts

Updated all Vercel dev scripts to include authentication:

- `scripts/vercel-dev-e2e.js` - E2E testing server
- `scripts/vercel-dev-ci.js` - CI server with dynamic port allocation  
- `scripts/vercel-dev-start.js` - Enhanced dev starter

**Key changes in each script:**
- Added `buildVercelCommand()` method that constructs authentication flags
- Added `--no-clipboard` flag for non-interactive CI mode
- Added proper token and scope flag handling
- Added authentication status logging

### 3. New Testing Script

Created `scripts/test-vercel-auth.js` to validate authentication setup:
- Tests environment variable configuration
- Validates Vercel CLI authentication  
- Shows example CI configuration
- Provides debugging information

## Required Environment Variables

### For CI/CD (GitHub Actions)

Add these as repository secrets:

```bash
VERCEL_TOKEN=<your-vercel-token>        # Required
VERCEL_ORG_ID=<your-org-id>            # Required  
VERCEL_PROJECT_ID=<your-project-id>    # Optional
```

### GitHub Actions Workflow

```yaml
- name: Run E2E Tests
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
    TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}
  run: npm run test:e2e
```

## How to Get Vercel Credentials

1. **VERCEL_TOKEN**: 
   - Go to https://vercel.com/account/tokens
   - Create a new token with appropriate scope
   
2. **VERCEL_ORG_ID**:
   - Go to your team/organization settings in Vercel
   - Copy the Team ID from the URL or settings

3. **VERCEL_PROJECT_ID**:
   - Go to your project settings in Vercel
   - Copy the Project ID from the General tab

## Testing the Fix

### Test Authentication Setup
```bash
# Set environment variables first
export VERCEL_TOKEN="your-token-here"
export VERCEL_ORG_ID="your-org-id-here"

# Run authentication test
node scripts/test-vercel-auth.js
```

### Test E2E with Authentication
```bash
# With proper environment variables set
npm run test:e2e
```

## Command Examples

### Before Fix (No Authentication)
```bash
vercel dev --yes --listen 3000
# ❌ Fails in CI - no authentication
```

### After Fix (With Authentication)
```bash
vercel dev --yes --listen 3000 --no-clipboard --token YOUR_TOKEN --scope YOUR_ORG_ID
# ✅ Works in CI - properly authenticated
```

## Verification

The fix ensures:
- ✅ Vercel dev server authenticates properly in CI
- ✅ E2E tests can access private resources
- ✅ No interactive prompts block CI execution
- ✅ Proper scope and project access
- ✅ All authentication flags are properly constructed

## Troubleshooting

If E2E tests still fail:

1. **Check environment variables:**
   ```bash
   node scripts/test-vercel-auth.js
   ```

2. **Verify token permissions:**
   - Token should have deployment and project access
   - Org ID should match the project's organization

3. **Check CI logs:**
   - Look for authentication success messages
   - Verify Vercel command construction includes all flags

4. **Test locally with same environment:**
   ```bash
   VERCEL_TOKEN=... VERCEL_ORG_ID=... npm run test:e2e
   ```

This fix resolves the critical CI authentication issue and enables proper E2E testing in CI environments.