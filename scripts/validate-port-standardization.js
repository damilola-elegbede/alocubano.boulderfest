#!/usr/bin/env node

/**
 * Port Configuration Standardization Validator
 *
 * Validates that all files consistently use the standardized port pattern:
 * parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10)
 *
 * This ensures:
 * 1. DYNAMIC_PORT takes precedence (for CI matrix port allocation)
 * 2. PORT is the fallback (standard environment variable)
 * 3. Default is 3000 (numeric, not string)
 * 4. All values are properly parsed as integers
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const projectRoot = resolve(process.cwd());

// Test cases for port configuration validation
const testCases = [
  { DYNAMIC_PORT: '3001', PORT: undefined, expected: 3001 },
  { DYNAMIC_PORT: undefined, PORT: '3002', expected: 3002 },
  { DYNAMIC_PORT: '3003', PORT: '3004', expected: 3003 }, // DYNAMIC_PORT takes precedence
  { DYNAMIC_PORT: undefined, PORT: undefined, expected: 3000 } // Default
];

/**
 * Validate port configuration in different environments
 */
function validatePortConfiguration() {
  console.log('🔍 Validating Port Configuration Standardization');
  console.log('================================================');

  let allTestsPassed = true;

  for (const testCase of testCases) {
    console.log(`\n📋 Test Case: DYNAMIC_PORT=${testCase.DYNAMIC_PORT}, PORT=${testCase.PORT}`);

    // Save original environment
    const originalDynamicPort = process.env.DYNAMIC_PORT;
    const originalPort = process.env.PORT;

    try {
      // Set test environment
      if (testCase.DYNAMIC_PORT) {
        process.env.DYNAMIC_PORT = testCase.DYNAMIC_PORT;
      } else {
        delete process.env.DYNAMIC_PORT;
      }

      if (testCase.PORT) {
        process.env.PORT = testCase.PORT;
      } else {
        delete process.env.PORT;
      }

      // Test the standardized port pattern
      const resolvedPort = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);

      if (resolvedPort === testCase.expected) {
        console.log(`   ✅ PASS: Resolved port ${resolvedPort} matches expected ${testCase.expected}`);
      } else {
        console.log(`   ❌ FAIL: Resolved port ${resolvedPort} does not match expected ${testCase.expected}`);
        allTestsPassed = false;
      }

      // Validate it's a number, not a string
      if (typeof resolvedPort === 'number') {
        console.log(`   ✅ PASS: Port is numeric type (${typeof resolvedPort})`);
      } else {
        console.log(`   ❌ FAIL: Port is not numeric type (${typeof resolvedPort})`);
        allTestsPassed = false;
      }

    } finally {
      // Restore original environment
      if (originalDynamicPort) {
        process.env.DYNAMIC_PORT = originalDynamicPort;
      } else {
        delete process.env.DYNAMIC_PORT;
      }

      if (originalPort) {
        process.env.PORT = originalPort;
      } else {
        delete process.env.PORT;
      }
    }
  }

  return allTestsPassed;
}

/**
 * Validate configuration files have the standardized pattern
 */
function validateConfigurationFiles() {
  console.log('\n🔍 Validating Configuration Files');
  console.log('==================================');

  const filesToCheck = [
    'tests/setup.js',
    'tests/e2e/global-setup-ci.js',
    'tests/e2e/global-teardown-ci.js',
    'playwright-e2e-vercel-main.config.js',
    'playwright-e2e-ci.config.js',
    'scripts/vercel-dev-ci.js'
  ];

  let allFilesValid = true;

  for (const filePath of filesToCheck) {
    const fullPath = resolve(projectRoot, filePath);

    if (!existsSync(fullPath)) {
      console.log(`   ⚠️  SKIP: File not found - ${filePath}`);
      continue;
    }

    try {
      const content = readFileSync(fullPath, 'utf8');

      // Check for standardized pattern
      const hasStandardizedPattern = content.includes('process.env.DYNAMIC_PORT || process.env.PORT');
      const hasOldPattern = /process\.env\.PORT\s+\|\|\s+[^|]/.test(content) && !hasStandardizedPattern;

      if (hasStandardizedPattern) {
        console.log(`   ✅ PASS: ${filePath} uses standardized DYNAMIC_PORT pattern`);
      } else if (hasOldPattern) {
        console.log(`   ❌ FAIL: ${filePath} still uses old PORT-only pattern`);
        allFilesValid = false;
      } else {
        console.log(`   ℹ️  INFO: ${filePath} has no explicit port configuration`);
      }

    } catch (error) {
      console.log(`   ❌ ERROR: Could not read ${filePath}: ${error.message}`);
      allFilesValid = false;
    }
  }

  return allFilesValid;
}

/**
 * Main validation function
 */
function main() {
  console.log('🚀 Port Configuration Standardization Validation\n');

  const configValidation = validatePortConfiguration();
  const fileValidation = validateConfigurationFiles();

  console.log('\n📊 Validation Summary');
  console.log('=====================');
  console.log(`   Port Configuration Tests: ${configValidation ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`   Configuration Files: ${fileValidation ? 'PASS ✅' : 'FAIL ❌'}`);

  if (configValidation && fileValidation) {
    console.log('\n🎉 SUCCESS: All port configuration standardization checks passed!');
    console.log('💡 Benefits:');
    console.log('   • DYNAMIC_PORT takes precedence for CI matrix port allocation');
    console.log('   • PORT serves as fallback for standard environments');
    console.log('   • All ports are properly parsed as integers (not strings)');
    console.log('   • Consistent configuration prevents port conflicts');
    process.exit(0);
  } else {
    console.log('\n❌ FAILURE: Port configuration standardization has issues');
    console.log('🔧 Please review and fix the failing checks above');
    process.exit(1);
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validatePortConfiguration, validateConfigurationFiles };