#!/usr/bin/env node

/**
 * Test runner for the 3 specific failing tests
 * Runs each test individually and reports results
 */

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  {
    file: 'tests/unit/advanced-caching.test.js',
    name: 'should implement cache-first strategy',
    description: 'Cache persistence test'
  },
  {
    file: 'tests/unit/test-mock-manager.test.js',
    name: 'second test - should not see previous test calls',
    description: 'Mock isolation test'
  },
  {
    file: 'tests/integration/cart-synchronization.test.js',
    name: 'should handle dual event dispatch',
    description: 'Event dispatch test'
  }
];

console.log('🔍 Running specific failing tests...\n');

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  console.log(`Test ${index + 1}/3: ${test.description}`);
  console.log(`File: ${test.file}`);
  console.log(`Test: "${test.name}"`);
  
  try {
    const cmd = `npm test -- ${test.file} -t "${test.name}" 2>&1`;
    const output = execSync(cmd, { 
      cwd: path.dirname(__dirname),
      encoding: 'utf8'
    });
    
    if (output.includes('✓') && !output.includes('✗')) {
      console.log('✅ PASSED\n');
      passed++;
    } else {
      console.log('❌ FAILED');
      // Show relevant error output
      const lines = output.split('\n');
      const errorLines = lines.filter(line => 
        line.includes('Error:') || 
        line.includes('Expected') || 
        line.includes('Received') ||
        line.includes('AssertionError')
      ).slice(0, 5);
      
      if (errorLines.length > 0) {
        console.log('Error details:');
        errorLines.forEach(line => console.log('  ', line));
      }
      console.log('');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAILED (test execution error)');
    console.log('Error:', error.message.split('\n')[0]);
    console.log('');
    failed++;
  }
});

console.log('=' .repeat(50));
console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (passed === 3) {
  console.log('🎉 All 3 tests are now passing!');
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} test(s) still failing. Review the fixes.`);
  process.exit(1);
}