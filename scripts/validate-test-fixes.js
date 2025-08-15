#!/usr/bin/env node

/**
 * Test Fix Validation Script
 * 
 * Validates that the database initialization fixes are working correctly
 * by running a subset of previously failing tests.
 * 
 * Run with: node scripts/validate-test-fixes.js
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Critical test files that were failing
const CRITICAL_TESTS = [
  'tests/integration/google-sheets.test.js',
  'tests/integration/comprehensive-api.test.js',
  'tests/unit/cart-management-regression.test.js',
  'tests/unit/ui-integration.test.js',
  'tests/unit/database-singleton.test.js'
];

// Test categories for grouped validation
const TEST_CATEGORIES = {
  'Database Tests': [
    'tests/unit/database-singleton.test.js',
    'tests/unit/database-client.test.js',
    'tests/integration/comprehensive-api.test.js'
  ],
  'Frontend Tests': [
    'tests/unit/cart-management-regression.test.js',
    'tests/unit/ui-integration.test.js',
    'tests/unit/gallery-lightbox-integration.test.js'
  ],
  'Integration Tests': [
    'tests/integration/google-sheets.test.js',
    'tests/integration/stripe-webhooks.test.js',
    'tests/integration/performance-integration.test.js'
  ]
};

/**
 * Run a single test file and capture results
 */
function runTest(testFile) {
  return new Promise((resolve) => {
    const testPath = join(rootDir, testFile);
    
    if (!existsSync(testPath)) {
      resolve({
        file: testFile,
        success: false,
        error: 'File not found',
        passed: 0,
        failed: 0,
        skipped: 0
      });
      return;
    }
    
    const child = spawn('npx', ['vitest', 'run', testPath, '--reporter=json'], {
      cwd: rootDir,
      env: { ...process.env, CI: 'true' }
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      try {
        // Try to parse JSON output
        const jsonStart = output.indexOf('{');
        const jsonEnd = output.lastIndexOf('}');
        
        if (jsonStart > -1 && jsonEnd > -1) {
          const jsonStr = output.substring(jsonStart, jsonEnd + 1);
          const results = JSON.parse(jsonStr);
          
          const testFile = results.testResults?.[0];
          const passed = testFile?.assertionResults?.filter(r => r.status === 'passed').length || 0;
          const failed = testFile?.assertionResults?.filter(r => r.status === 'failed').length || 0;
          const skipped = testFile?.assertionResults?.filter(r => r.status === 'skipped').length || 0;
          
          resolve({
            file: testFile,
            success: failed === 0,
            passed,
            failed,
            skipped,
            error: failed > 0 ? 'Tests failed' : null
          });
        } else {
          // Fallback: parse text output
          const passedMatch = output.match(/(\d+) passed/);
          const failedMatch = output.match(/(\d+) failed/);
          const skippedMatch = output.match(/(\d+) skipped/);
          
          resolve({
            file: testFile,
            success: code === 0,
            passed: passedMatch ? parseInt(passedMatch[1]) : 0,
            failed: failedMatch ? parseInt(failedMatch[1]) : 0,
            skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
            error: code !== 0 ? errorOutput || 'Test failed' : null
          });
        }
      } catch (error) {
        resolve({
          file: testFile,
          success: false,
          error: error.message,
          passed: 0,
          failed: 0,
          skipped: 0
        });
      }
    });
  });
}

/**
 * Run tests by category
 */
async function runCategoryTests(category, tests) {
  console.log(`\n📂 ${category}`);
  console.log('─'.repeat(50));
  
  const results = [];
  
  for (const test of tests) {
    process.stdout.write(`  Testing ${test.split('/').pop()}... `);
    const result = await runTest(test);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ PASSED (${result.passed} tests)`);
    } else if (result.error === 'File not found') {
      console.log(`⏭️  SKIPPED (file not found)`);
    } else {
      console.log(`❌ FAILED (${result.failed} failures)`);
      if (result.error && result.error !== 'Tests failed') {
        console.log(`     Error: ${result.error}`);
      }
    }
  }
  
  return results;
}

/**
 * Check if fixes have been applied
 */
async function checkFixesApplied() {
  const fixedFiles = [
    'tests/helpers/db.js',
    'tests/helpers/mocks.js',
    'tests/helpers/browser-polyfills.js'
  ];
  
  console.log('\n🔍 Checking Applied Fixes');
  console.log('─'.repeat(50));
  
  let allFixed = true;
  
  for (const file of fixedFiles) {
    const fullPath = join(rootDir, file);
    if (existsSync(fullPath)) {
      const { readFileSync } = await import('fs');
      const content = readFileSync(fullPath, 'utf8');
      
      // Check for key indicators that fixes are applied
      const indicators = {
        'tests/helpers/db.js': 'createAsyncTestDatabase',
        'tests/helpers/mocks.js': 'createMockDatabaseService',
        'tests/helpers/browser-polyfills.js': 'setupBrowserPolyfills'
      };
      
      const indicator = indicators[file];
      const isFixed = content.includes(indicator);
      
      console.log(`  ${file}: ${isFixed ? '✅ Fixed' : '❌ Not fixed'}`);
      
      if (!isFixed) {
        allFixed = false;
      }
    } else {
      console.log(`  ${file}: ❌ Not found`);
      allFixed = false;
    }
  }
  
  return allFixed;
}

/**
 * Main validation
 */
async function main() {
  console.log('🧪 Test Fix Validation\n');
  console.log('This script validates that the database initialization fixes');
  console.log('are working correctly by running previously failing tests.\n');
  
  // Check if fixes have been applied
  const fixesApplied = await checkFixesApplied();
  
  if (!fixesApplied) {
    console.log('\n⚠️  Warning: Not all fixes have been applied.');
    console.log('Run: node scripts/fix-database-test-initialization.js');
    console.log('Then try this validation again.\n');
  }
  
  // Run tests by category
  const allResults = [];
  
  for (const [category, tests] of Object.entries(TEST_CATEGORIES)) {
    const results = await runCategoryTests(category, tests);
    allResults.push(...results);
  }
  
  // Summary
  console.log('\n📊 Validation Summary');
  console.log('═'.repeat(50));
  
  const totalTests = allResults.length;
  const successfulTests = allResults.filter(r => r.success).length;
  const failedTests = allResults.filter(r => !r.success && r.error !== 'File not found').length;
  const skippedTests = allResults.filter(r => r.error === 'File not found').length;
  
  const totalPassed = allResults.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = allResults.reduce((sum, r) => sum + r.failed, 0);
  const totalSkipped = allResults.reduce((sum, r) => sum + r.skipped, 0);
  
  console.log(`  Test Files:`);
  console.log(`    ✅ Successful: ${successfulTests}/${totalTests}`);
  console.log(`    ❌ Failed: ${failedTests}/${totalTests}`);
  console.log(`    ⏭️  Not Found: ${skippedTests}/${totalTests}`);
  
  console.log(`\n  Individual Tests:`);
  console.log(`    ✅ Passed: ${totalPassed}`);
  console.log(`    ❌ Failed: ${totalFailed}`);
  console.log(`    ⏭️  Skipped: ${totalSkipped}`);
  
  // Recommendations
  console.log('\n💡 Recommendations');
  console.log('─'.repeat(50));
  
  if (failedTests === 0 && fixesApplied) {
    console.log('  ✅ All critical tests are passing!');
    console.log('  Next steps:');
    console.log('    1. Run full test suite: npm test');
    console.log('    2. Commit changes: git add -A && git commit -m "fix: database test initialization"');
    console.log('    3. Push to CI: git push');
  } else if (failedTests > 0) {
    console.log('  ⚠️  Some tests are still failing.');
    console.log('  Troubleshooting steps:');
    console.log('    1. Check individual test output above for specific errors');
    console.log('    2. Ensure all helper files have been updated');
    console.log('    3. Look for tests that need manual updates to use new helpers');
    console.log('    4. Run tests individually with: npx vitest run <test-file>');
  } else if (!fixesApplied) {
    console.log('  ⚠️  Fixes have not been applied yet.');
    console.log('  Run: node scripts/fix-database-test-initialization.js');
  }
  
  // Exit code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run validation
main().catch(console.error);