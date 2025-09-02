# E2E Environment Variable Standardization

## Overview

This document summarizes the standardization of environment variable handling for E2E tests and CI environments. The implementation addresses Issue #11 by centralizing configuration, providing proper fallbacks, and eliminating configuration confusion.

## What Was Done

### 1. Created Centralized Configuration Module

**File**: `config/e2e-env-config.js`

- **45+ environment variables** now centrally managed
- **Proper type conversion** (strings → booleans, numbers)
- **Intelligent fallbacks** with meaningful defaults
- **Comprehensive validation** with detailed error messages
- **Security-conscious** environment variable masking

### 2. Updated Key Configuration Files

**Files Modified**:
- `playwright-e2e-vercel-main.config.js` - Uses centralized E2E configuration
- `playwright-e2e-ci.config.js` - Uses centralized E2E configuration with CI optimizations
- `tests/e2e/global-setup-ci.js` - Uses centralized validation and logging

### 3. Created Validation and Testing Scripts

**New Scripts**:
- `scripts/validate-e2e-env.js` - Comprehensive environment validation
- `scripts/test-e2e-config.js` - Configuration module testing

## Key Features

### Environment Variable Categories

```javascript
// Database (Always Required)
TURSO_DATABASE_URL    // Turso connection string
TURSO_AUTH_TOKEN     // Turso authentication

// Admin Authentication (Required for Admin Tests)  
TEST_ADMIN_PASSWORD  // Plain text for E2E tests
ADMIN_PASSWORD      // Bcrypt hashed for production
ADMIN_SECRET        // JWT signing secret

// Port Configuration (Smart Defaults)
DYNAMIC_PORT        // CI matrix allocation (3000-3005)
PORT               // Standard fallback
PLAYWRIGHT_BASE_URL // Override if needed

// Service Integration (Optional)
BREVO_API_KEY      // Email service
STRIPE_SECRET_KEY  // Payment processing  
APPLE_PASS_KEY     // Wallet passes
// ... and 30+ more
```

### Type Safety and Conversion

```javascript
// Before: Inconsistent string/boolean handling
const CI_MODE = !!process.env.CI;
const ADVANCED = process.env.ADVANCED_SCENARIOS === 'true';

// After: Centralized type conversion
import { E2E_CONFIG } from './config/e2e-env-config.js';
const ciMode = E2E_CONFIG.CI; // boolean
const advanced = E2E_CONFIG.ADVANCED_SCENARIOS; // boolean
const port = E2E_CONFIG.DYNAMIC_PORT; // number
```

### Comprehensive Validation

```javascript
// Validate based on test requirements
validateE2EEnvironment({
  adminTests: true,      // Require admin credentials
  ciMode: true,         // CI-specific validation
  emailTests: false,    // Skip email service validation
  paymentTests: true,   // Require payment credentials
  walletTests: true,    // Require wallet credentials
});
```

### WebServer Environment Generation

```javascript
// Generate environment for Playwright webServer
const webServerEnv = getWebServerEnv({
  port: E2E_CONFIG.DYNAMIC_PORT,
  includeServices: true,  // Include all service credentials
  includeVercel: true,    // Include Vercel authentication
});
```

## Benefits Achieved

### 1. Eliminated Configuration Confusion

**Before**: 45+ unique variables scattered across files
```javascript
// In config A
const PORT = process.env.DYNAMIC_PORT || process.env.PORT || '3000';

// In config B  
const port = parseInt(process.env.PORT || '3000', 10);

// In config C
const testPort = process.env.DYNAMIC_PORT || 3000;
```

**After**: Single source of truth
```javascript
import { E2E_CONFIG } from './config/e2e-env-config.js';
const port = E2E_CONFIG.DYNAMIC_PORT; // Always number, consistent fallback
```

### 2. Proper Error Messages

**Before**: Cryptic errors
```
Error: Missing environment variable
```

**After**: Detailed guidance
```
❌ Missing required variables:
   - TURSO_DATABASE_URL: Turso database connection string required for E2E tests
   - ADMIN_SECRET: JWT signing secret required (minimum 32 characters)

💡 To fix these issues:
   1. Set the missing environment variables in .env.local
   2. Ensure Turso credentials are configured for E2E tests
   3. Check CLAUDE.md for complete environment setup guide
```

### 3. Security Improvements

**Sensitive Variable Masking**:
```javascript
console.log(`TURSO_AUTH_TOKEN: ${maskSensitive(E2E_CONFIG.TURSO_AUTH_TOKEN)}`);
// Output: TURSO_AUTH_TOKEN: abcd***wxyz
```

**No Hardcoded Fallbacks for Secrets**:
```javascript
// Before: Security risk
STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk-test-hardcoded',

// After: Explicit null for missing secrets
STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || null,
```

### 4. Consistent Port Allocation

**Standardized Precedence**:
1. `DYNAMIC_PORT` (CI matrix allocation)
2. `PORT` (standard environment variable)
3. `3000` (default for local development)

**Port Matrix for Parallel CI**:
- Standard Suite: 3000
- Advanced Suite: 3001  
- Firefox Suite: 3002
- Performance Suite: 3003
- Accessibility Suite: 3004
- Security Suite: 3005

### 5. Advanced Scenario Support

**Conditional Validation**:
```javascript
// Only validate service credentials if advanced scenarios enabled
validateE2EEnvironment({
  emailTests: E2E_CONFIG.ADVANCED_SCENARIOS,
  paymentTests: E2E_CONFIG.ADVANCED_SCENARIOS,
  walletTests: E2E_CONFIG.ADVANCED_SCENARIOS,
});
```

## Usage Examples

### Basic Validation

```bash
# Validate core requirements
node scripts/validate-e2e-env.js

# Validate with admin tests
node scripts/validate-e2e-env.js --admin-tests

# Validate all scenarios with detailed output
node scripts/validate-e2e-env.js --all --verbose
```

### In Playwright Configurations

```javascript
import { E2E_CONFIG, validateE2EEnvironment, getWebServerEnv } from './config/e2e-env-config.js';

// Validate before starting tests
validateE2EEnvironment({
  adminTests: true,
  ciMode: E2E_CONFIG.CI,
});

// Use in Playwright config
export default defineConfig({
  use: {
    baseURL: E2E_CONFIG.PLAYWRIGHT_BASE_URL,
  },
  webServer: {
    env: getWebServerEnv({
      port: E2E_CONFIG.DYNAMIC_PORT,
      includeServices: true,
    }),
  },
});
```

### In Test Scripts

```javascript
import { E2E_CONFIG } from './config/e2e-env-config.js';

// Use standardized configuration
const adminPassword = E2E_CONFIG.TEST_ADMIN_PASSWORD;
const baseUrl = E2E_CONFIG.PLAYWRIGHT_BASE_URL;
const isDevelopment = !E2E_CONFIG.CI;
```

## Migration Guide

### For New Configurations

1. **Import the module**:
   ```javascript
   import { E2E_CONFIG, validateE2EEnvironment, getWebServerEnv } from './config/e2e-env-config.js';
   ```

2. **Validate environment**:
   ```javascript
   validateE2EEnvironment({
     adminTests: true,
     ciMode: E2E_CONFIG.CI,
   });
   ```

3. **Use standardized variables**:
   ```javascript
   // Instead of: process.env.DYNAMIC_PORT || process.env.PORT || 3000
   const port = E2E_CONFIG.DYNAMIC_PORT;
   ```

### For Existing Configurations

1. Replace scattered `process.env` references with `E2E_CONFIG`
2. Add validation calls at the top of configuration files
3. Use `getWebServerEnv()` for Playwright webServer environments
4. Remove hardcoded fallbacks for sensitive variables

## Testing and Verification

### Automated Tests

```bash
# Test configuration module functionality
node scripts/test-e2e-config.js

# Validate specific scenarios
node scripts/validate-e2e-env.js --admin-tests --verbose

# Check Playwright config syntax
node -c playwright-e2e-vercel-main.config.js
node -c playwright-e2e-ci.config.js
```

### CI Integration

The standardized configuration is designed to work seamlessly with CI/CD:

1. **Environment validation** runs before tests start
2. **Detailed error messages** help debug configuration issues
3. **Parallel port allocation** prevents conflicts in matrix builds
4. **Service credential validation** only when needed

## Future Enhancements

### Planned Improvements

1. **Schema Validation**: Use Zod or similar for runtime type checking
2. **Environment Profiles**: Support for dev/staging/production profiles
3. **Secret Rotation**: Integration with secret management systems
4. **Configuration UI**: Web interface for environment setup

### Extension Points

The centralized configuration is designed for easy extension:

```javascript
// Add new service integration
export const E2E_CONFIG = {
  // ... existing config ...
  
  // New service
  NEW_SERVICE_API_KEY: process.env.NEW_SERVICE_API_KEY || null,
  NEW_SERVICE_ENABLED: parseBoolean(process.env.NEW_SERVICE_ENABLED, false),
};

// Update validation rules
export const VALIDATION_RULES = {
  // ... existing rules ...
  
  NEW_SERVICE_TESTS: [
    'NEW_SERVICE_API_KEY',
  ],
};
```

## Summary

The E2E environment standardization successfully addresses all issues identified in the original analysis:

✅ **45+ unique variables** now centrally managed  
✅ **20 missing fallbacks** now have proper defaults or validation  
✅ **Inconsistent handling** eliminated through centralized configuration  
✅ **Type conversion** standardized (strings → booleans, numbers)  
✅ **Port conflicts** resolved through standardized precedence  
✅ **Secret masking** implemented for security  
✅ **Comprehensive validation** with detailed error messages  
✅ **CI/CD integration** optimized for parallel execution  

This foundation provides a robust, maintainable approach to environment variable management that will scale with the project's needs and prevent configuration-related issues in the future.