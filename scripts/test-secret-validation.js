#!/usr/bin/env node

/**
 * Test Script for Secret Validation System
 * 
 * This script tests the secret validation functionality without running
 * the full E2E test suite. Useful for debugging and validation.
 */

import { validateSecrets } from '../tests/e2e/secret-validator.js';
import { setupTest, skipTestIfSecretsUnavailable } from '../tests/e2e/helpers/test-setup.js';

console.log('🧪 Testing Secret Validation System');
console.log('===================================\n');

// Set basic environment variables for testing
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.E2E_TEST_MODE = process.env.E2E_TEST_MODE || 'true';

// Backup the original process.exit so we can restore it
const originalExit = process.exit;

// Override process.exit to prevent the script from exiting during tests
process.exit = (code) => {
  console.log(`⚠️ process.exit(${code}) called but captured for testing`);
  // Don't actually exit
};

// Test 1: Basic validation
console.log('TEST 1: Basic Secret Validation');
console.log('-'.repeat(30));

try {
  const basicResult = validateSecrets({
    testTypes: ['basic'],
    strict: false,
    ci: false
  });
  
  console.log('✅ Basic validation completed');
  console.log(`   Found: ${basicResult.summary.found}`);
  console.log(`   Missing: ${basicResult.summary.missing}`);
  console.log(`   Warnings: ${basicResult.summary.warnings}\n`);
} catch (error) {
  console.log('❌ Basic validation failed:', error.message, '\n');
}

// Test 2: Admin tests validation
console.log('TEST 2: Admin Test Validation');
console.log('-'.repeat(30));

try {
  const adminResult = validateSecrets({
    testTypes: ['basic', 'admin'],
    strict: false,
    ci: false
  });
  
  console.log('✅ Admin validation completed');
  console.log(`   Found: ${adminResult.summary.found}`);
  console.log(`   Missing: ${adminResult.summary.missing}`);
  console.log(`   Warnings: ${adminResult.summary.warnings}\n`);
} catch (error) {
  console.log('❌ Admin validation failed:', error.message, '\n');
}

// Test 3: Full CI validation
console.log('TEST 3: Full CI Validation');
console.log('-'.repeat(30));

try {
  const ciResult = validateSecrets({
    testTypes: ['basic', 'admin', 'email', 'payment', 'wallet', 'ci'],
    strict: false,
    ci: true
  });
  
  console.log('✅ CI validation completed');
  console.log(`   Found: ${ciResult.summary.found}`);
  console.log(`   Missing: ${ciResult.summary.missing}`);
  console.log(`   Warnings: ${ciResult.summary.warnings}\n`);
} catch (error) {
  console.log('❌ CI validation failed:', error.message, '\n');
}

// Test 4: Test setup helper
console.log('TEST 4: Test Setup Helper');
console.log('-'.repeat(30));

try {
  const setupResult = setupTest({
    testTypes: ['admin'],
    requireSecrets: false,
    testFile: 'admin-auth.test.js'
  });
  
  console.log('✅ Test setup completed');
  console.log(`   Can run tests: ${setupResult.canRunTests}`);
  console.log(`   Validation passed: ${setupResult.passed}\n`);
} catch (error) {
  console.log('❌ Test setup failed:', error.message, '\n');
}

// Test 5: Skip logic test
console.log('TEST 5: Skip Logic Test');
console.log('-'.repeat(30));

try {
  const shouldSkipAdmin = skipTestIfSecretsUnavailable(['admin'], 'admin-auth.test.js');
  const shouldSkipPayment = skipTestIfSecretsUnavailable(['payment'], 'payment-flow.test.js');
  
  console.log(`✅ Skip logic test completed`);
  console.log(`   Should skip admin tests: ${shouldSkipAdmin}`);
  console.log(`   Should skip payment tests: ${shouldSkipPayment}\n`);
} catch (error) {
  console.log('❌ Skip logic test failed:', error.message, '\n');
}

console.log('🎯 Secret Validation Testing Complete');
console.log('=====================================');

// Summary recommendations
console.log('\n💡 RECOMMENDATIONS:');

const hasTestAdminPassword = Boolean(process.env.TEST_ADMIN_PASSWORD);
const hasAdminSecret = Boolean(process.env.ADMIN_SECRET);
const hasTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

if (!hasTestAdminPassword) {
  console.log('   ❌ Set TEST_ADMIN_PASSWORD for admin panel tests');
}

if (!hasAdminSecret) {
  console.log('   ❌ Set ADMIN_SECRET (32+ chars) for JWT authentication');
}

if (!hasTurso) {
  console.log('   ⚠️ Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for production-like testing');
}

const hasBrevo = Boolean(process.env.BREVO_API_KEY);
const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY);

if (!hasBrevo) {
  console.log('   ⚠️ Set BREVO_API_KEY for email functionality testing (optional)');
}

if (!hasStripe) {
  console.log('   ⚠️ Set STRIPE_SECRET_KEY for payment testing (optional)');
}

if (hasTestAdminPassword && hasAdminSecret && hasTurso) {
  console.log('   ✅ All critical secrets configured - E2E tests should run successfully');
} else {
  console.log('   ⚠️ Some required secrets missing - certain tests may be skipped');
}

// Restore original process.exit
process.exit = originalExit;

console.log('\nRun with: node scripts/test-secret-validation.js');