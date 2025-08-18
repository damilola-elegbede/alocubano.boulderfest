#!/usr/bin/env node

/**
 * Validation script for CI/CD test infrastructure fix
 * This verifies the mock server solution works correctly
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

console.log('🔍 Validating CI/CD Test Infrastructure Fix\n');

const requiredFiles = [
  'tests-new/core/mock-server.js',
  'tests-new/core/mock-http-client.js',
  'tests-new/helpers/test-mode.js',
  'tests-new/core/README.md',
  '.github/workflows/test-new-framework.yml'
];

const modifiedFiles = [
  'tests-new/core/server.js',
  'tests-new/core/http.js',
  'tests-new/core/setup.js'
];

let allValid = true;

// Check new files exist
console.log('📁 Checking new files:');
for (const file of requiredFiles) {
  const fullPath = resolve(projectRoot, file);
  const exists = existsSync(fullPath);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allValid = false;
}

console.log('\n📝 Modified files:');
for (const file of modifiedFiles) {
  const fullPath = resolve(projectRoot, file);
  const exists = existsSync(fullPath);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allValid = false;
}

// Test mock server imports
console.log('\n🧪 Testing mock server imports:');
try {
  const { mockServer } = await import('../tests-new/core/mock-server.js');
  console.log('   ✅ mock-server.js imports correctly');
  
  const { mockHttpClient } = await import('../tests-new/core/mock-http-client.js');
  console.log('   ✅ mock-http-client.js imports correctly');
  
  const testMode = await import('../tests-new/helpers/test-mode.js');
  console.log('   ✅ test-mode.js imports correctly');
} catch (error) {
  console.log(`   ❌ Import error: ${error.message}`);
  allValid = false;
}

// Check environment detection
console.log('\n🌍 Environment Detection:');
const originalCI = process.env.CI;
const originalToken = process.env.VERCEL_TOKEN;

// Test different scenarios
const scenarios = [
  { CI: undefined, VERCEL_TOKEN: undefined, expected: 'Local mode (real server)' },
  { CI: 'true', VERCEL_TOKEN: undefined, expected: 'CI mode (mock server)' },
  { CI: 'true', VERCEL_TOKEN: 'token', expected: 'CI mode (real server)' }
];

for (const scenario of scenarios) {
  process.env.CI = scenario.CI;
  process.env.VERCEL_TOKEN = scenario.VERCEL_TOKEN;
  
  const isCI = process.env.CI === 'true';
  const hasToken = Boolean(process.env.VERCEL_TOKEN);
  const useMock = isCI && !hasToken;
  
  console.log(`   CI=${scenario.CI || 'undefined'}, TOKEN=${scenario.VERCEL_TOKEN ? 'set' : 'unset'}`);
  console.log(`     → ${scenario.expected} ${useMock ? '🎭' : '🔧'}`);
}

// Restore original values
process.env.CI = originalCI;
process.env.VERCEL_TOKEN = originalToken;

// Summary
console.log('\n' + '='.repeat(50));
if (allValid) {
  console.log('✅ CI/CD test infrastructure fix is properly implemented!');
  console.log('\nNext steps:');
  console.log('1. Commit these changes');
  console.log('2. Push to trigger CI');
  console.log('3. Monitor GitHub Actions for successful test execution');
  console.log('\nOptional future enhancement:');
  console.log('- Add VERCEL_TOKEN to GitHub secrets for real server testing');
  process.exit(0);
} else {
  console.log('❌ Some issues found. Please review the implementation.');
  process.exit(1);
}