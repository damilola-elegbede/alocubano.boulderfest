#!/usr/bin/env node

/**
 * CI Failure Analysis Script
 * Helps identify and diagnose CI test failures
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔍 Analyzing CI Test Configuration...\n');

// Check for test directories
const testDirs = ['tests/unit', 'tests/integration', 'tests/e2e'];
console.log('📂 Test Directory Structure:');
testDirs.forEach(dir => {
  const exists = existsSync(dir);
  console.log(`  ${exists ? '✅' : '❌'} ${dir}`);
});

// Check critical files
console.log('\n📄 Critical Files:');
const criticalFiles = [
  'tests/vitest.config.js',
  'tests/config/vitest.unit.config.js',
  'tests/setup-unit.js',
  'tests/config/test-environment.js',
  '.env.local',
  '.env.test'
];

criticalFiles.forEach(file => {
  const exists = existsSync(file);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
});

// Check Node.js version
console.log('\n🔧 Environment:');
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
  console.log(`  Node.js: ${nodeVersion}`);
  const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
  console.log(`  npm: ${npmVersion}`);
} catch (error) {
  console.log('  ❌ Could not detect Node.js/npm versions');
}

// Check for required dependencies
console.log('\n📦 Required Dependencies:');
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
const requiredDeps = ['vitest', '@vitest/coverage-v8', 'dotenv', 'sqlite3', '@libsql/client'];

requiredDeps.forEach(dep => {
  const inDev = packageJson.devDependencies && packageJson.devDependencies[dep];
  const inProd = packageJson.dependencies && packageJson.dependencies[dep];
  const version = inDev || inProd;
  console.log(`  ${version ? '✅' : '❌'} ${dep}: ${version || 'NOT INSTALLED'}`);
});

// Try to run the test configuration validation
console.log('\n🧪 Test Configuration Validation:');
try {
  const configPath = resolve('./tests/config/vitest.unit.config.js');
  if (existsSync(configPath)) {
    console.log('  ✅ Unit test config exists');
    
    // Check if we can import it
    try {
      await import(configPath);
      console.log('  ✅ Unit test config is valid');
    } catch (error) {
      console.log('  ❌ Unit test config has errors:', error.message);
    }
  } else {
    console.log('  ❌ Unit test config not found');
  }
} catch (error) {
  console.log('  ❌ Could not validate test config:', error.message);
}

// Check for test files
console.log('\n📝 Test Files:');
try {
  const unitTestsExist = existsSync('tests/unit');
  if (unitTestsExist) {
    const testFiles = execSync('find tests/unit -name "*.test.js" 2>/dev/null | wc -l', { encoding: 'utf-8' }).trim();
    console.log(`  Unit test files: ${testFiles}`);
  } else {
    console.log('  ❌ No tests/unit directory found');
  }
} catch (error) {
  console.log('  ⚠️ Could not count test files');
}

// Attempt a dry run
console.log('\n🏃 Attempting Test Dry Run:');
console.log('  Running: npm run test:unit -- --run --reporter=json --outputFile=test-output.json\n');

try {
  execSync('npm run test:unit -- --run --reporter=json --outputFile=test-output.json', { 
    stdio: 'pipe',
    encoding: 'utf-8',
    env: { ...process.env, CI: 'true' }
  });
  
  // Read and analyze output
  if (existsSync('test-output.json')) {
    const results = JSON.parse(readFileSync('test-output.json', 'utf-8'));
    console.log('  ✅ Tests executed successfully');
    console.log(`  Total tests: ${results.numTotalTests || 0}`);
    console.log(`  Passed: ${results.numPassedTests || 0}`);
    console.log(`  Failed: ${results.numFailedTests || 0}`);
  }
} catch (error) {
  console.log('  ❌ Test execution failed');
  console.log('  Error:', error.message);
  if (error.stdout) {
    console.log('\n  Output:', error.stdout.toString());
  }
  if (error.stderr) {
    console.log('\n  Errors:', error.stderr.toString());
  }
}

console.log('\n📊 Analysis Complete\n');
console.log('Recommendations:');
console.log('1. Ensure tests/unit directory exists with test files');
console.log('2. Verify all required dependencies are installed');
console.log('3. Check that test configuration files are valid');
console.log('4. Run "npm install" to ensure all dependencies are up to date');
console.log('5. Try running "npm run test:unit" locally to reproduce CI failures');