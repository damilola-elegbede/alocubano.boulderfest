#!/usr/bin/env node

/**
 * Test E2E Configuration Module
 *
 * This script demonstrates the centralized environment variable configuration
 * and validates the module can be imported and used correctly.
 */

import { E2E_CONFIG, validateE2EEnvironment, logE2EEnvironment, getWebServerEnv } from '../config/e2e-env-config.js';

console.log('🧪 Testing E2E Configuration Module');
console.log('===================================');

// Test 1: Module imports successfully
console.log('✅ Module imported successfully');

// Test 2: Check configuration object structure
console.log('\n📋 Configuration Structure:');
console.log(`- DYNAMIC_PORT: ${E2E_CONFIG.DYNAMIC_PORT}`);
console.log(`- CI: ${E2E_CONFIG.CI}`);
console.log(`- NODE_ENV: ${E2E_CONFIG.NODE_ENV}`);
console.log(`- ADVANCED_SCENARIOS: ${E2E_CONFIG.ADVANCED_SCENARIOS}`);

// Test 3: Test validation (non-throwing)
console.log('\n🔍 Validation Test:');
const validationResult = validateE2EEnvironment({
  adminTests: false,
  ciMode: false,
  emailTests: false,
  paymentTests: false,
  walletTests: false,
  throwOnMissing: false,
});

console.log(`- Valid: ${validationResult.isValid}`);
console.log(`- Missing: ${validationResult.missing.length} variables`);
console.log(`- Warnings: ${validationResult.warnings.length} warnings`);

// Test 4: Test webServer environment generation
console.log('\n🌍 WebServer Environment:');
const webServerEnv = getWebServerEnv({
  port: 3000,
  includeServices: false,
  includeVercel: false,
});

console.log(`- Variables: ${Object.keys(webServerEnv).length}`);
console.log(`- PORT: ${webServerEnv.PORT}`);
console.log(`- NODE_ENV: ${webServerEnv.NODE_ENV}`);
console.log(`- E2E_TEST_MODE: ${webServerEnv.E2E_TEST_MODE}`);

// Test 5: Test boolean parsing
console.log('\n🔢 Type Conversion Tests:');
console.log(`- CI (boolean): ${typeof E2E_CONFIG.CI} = ${E2E_CONFIG.CI}`);
console.log(`- DYNAMIC_PORT (number): ${typeof E2E_CONFIG.DYNAMIC_PORT} = ${E2E_CONFIG.DYNAMIC_PORT}`);
console.log(`- NODE_ENV (string): ${typeof E2E_CONFIG.NODE_ENV} = ${E2E_CONFIG.NODE_ENV}`);

// Test 6: Log environment (verbose)
console.log('\n📊 Environment Logging Test:');
logE2EEnvironment(false); // Non-verbose mode for cleaner output

console.log('\n✅ All tests completed successfully!');
console.log('====================================');