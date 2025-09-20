#!/usr/bin/env node

/**
 * Test CI Setup Script
 * Verifies that the CI environment will work correctly with VERCEL_TOKEN
 */

console.log('🔍 Testing CI Setup Configuration\n');

// Simulate CI environment
process.env.CI = 'true';
process.env.NODE_ENV = 'test';

// Test scenarios
const scenarios = [
  {
    name: 'CI with no token (should use mock)',
    env: { CI: 'true', VERCEL_TOKEN: undefined },
    expected: { useMock: true, hasToken: false }
  },
  {
    name: 'CI with empty token (should use mock)',
    env: { CI: 'true', VERCEL_TOKEN: '' },
    expected: { useMock: true, hasToken: false }
  },
  {
    name: 'CI with whitespace token (should use mock)',
    env: { CI: 'true', VERCEL_TOKEN: '   ' },
    expected: { useMock: true, hasToken: false }
  },
  {
    name: 'CI with valid token (should use real server)',
    env: { CI: 'true', VERCEL_TOKEN: 'test_token_12345' },
    expected: { useMock: false, hasToken: true }
  }
];

console.log('Running detection tests...\n');

for (const scenario of scenarios) {
  // Set environment
  process.env.CI = scenario.env.CI;
  process.env.VERCEL_TOKEN = scenario.env.VERCEL_TOKEN;

  // Test detection logic
  const IS_CI = process.env.CI === 'true';
  const HAS_VERCEL_TOKEN = Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_TOKEN.trim());
  const USE_MOCK_SERVER = IS_CI && !HAS_VERCEL_TOKEN;

  const passed = USE_MOCK_SERVER === scenario.expected.useMock &&
                 HAS_VERCEL_TOKEN === scenario.expected.hasToken;

  console.log(`${passed ? '✅' : '❌'} ${scenario.name}`);
  console.log(`   Token: "${scenario.env.VERCEL_TOKEN || 'undefined'}"`);
  console.log(`   hasToken: ${HAS_VERCEL_TOKEN}, useMock: ${USE_MOCK_SERVER}`);
  console.log(`   Expected: hasToken: ${scenario.expected.hasToken}, useMock: ${scenario.expected.useMock}`);
  console.log();
}

// Test with actual GitHub Actions environment variable format
console.log('Testing GitHub Actions format...\n');
process.env.CI = 'true';
process.env.VERCEL_TOKEN = '${{ secrets.VERCEL_TOKEN }}'; // This would be replaced by GitHub

// In real CI, this would be the actual token value
const simulatedToken = 'actual_vercel_token_from_secrets';
process.env.VERCEL_TOKEN = simulatedToken;

const finalHasToken = Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_TOKEN.trim());
const finalUseMock = process.env.CI === 'true' && !finalHasToken;

console.log('Final CI configuration:');
console.log(`   CI: ${process.env.CI}`);
console.log(`   Token present: ${finalHasToken}`);
console.log(`   Use mock server: ${finalUseMock}`);
console.log(`   Server mode: ${finalUseMock ? 'Mock 🎭' : 'Real Vercel 🔧'}`);

if (!finalHasToken && process.env.CI === 'true') {
  console.log('\n⚠️  Warning: In CI without token - will use mock server');
  console.log('   To use real server, ensure VERCEL_TOKEN is set in GitHub secrets');
} else if (finalHasToken) {
  console.log('\n✅ Ready for CI with real Vercel server');
}

// Test Vercel CLI availability
console.log('\n🔍 Checking Vercel CLI...');
const { execSync } = require('child_process');

try {
  const version = execSync('vercel --version', { encoding: 'utf-8' }).trim();
  console.log(`✅ Vercel CLI installed: ${version}`);
} catch (error) {
  console.log('❌ Vercel CLI not found - install with: npm install -g vercel');
}

console.log('\n✨ CI setup test complete');