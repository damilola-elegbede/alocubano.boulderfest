#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const metrics = {
  old_suite: { 
    time: null, 
    memory: null, 
    failures: [],
    test_count: 0,
    files_count: 0
  },
  new_suite: { 
    time: null, 
    memory: null, 
    failures: [],
    test_count: 0,
    files_count: 0
  },
  comparison: { 
    time_delta: null, 
    memory_delta: null,
    test_count_delta: null
  },
  timestamp: new Date().toISOString()
};

function runCommand(command, label) {
  console.log(`\n📊 Running: ${label}`);
  console.log(`Command: ${command}`);
  const start = Date.now();
  let maxMemory = 0;
  
  try {
    const memoryInterval = setInterval(() => {
      try {
        const memInfo = execSync('ps aux | grep "node.*test" | grep -v grep | awk \'{print $6}\'', { encoding: 'utf8' });
        const currentMem = parseInt(memInfo.trim()) / 1024; // Convert KB to MB
        if (!isNaN(currentMem) && currentMem > maxMemory) {
          maxMemory = currentMem;
        }
      } catch (e) {
        // Process might not be running yet
      }
    }, 100);

    const output = execSync(command, { 
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: 'true' }
    });
    
    clearInterval(memoryInterval);
    const duration = (Date.now() - start) / 1000;
    
    console.log(`✅ Completed in ${duration}s`);
    console.log(`💾 Peak memory: ${maxMemory.toFixed(2)}MB`);
    
    // Parse test count from output
    const testMatch = output.match(/(\d+) test/);
    const fileMatch = output.match(/(\d+) file/);
    
    return {
      success: true,
      duration,
      memory: maxMemory,
      output,
      test_count: testMatch ? parseInt(testMatch[1]) : 0,
      files_count: fileMatch ? parseInt(fileMatch[1]) : 0,
      failures: []
    };
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    console.log(`❌ Failed after ${duration}s`);
    
    // Extract failure information
    const failures = [];
    const failureMatch = error.stdout?.match(/✖ (.+)/g);
    if (failureMatch) {
      failures.push(...failureMatch.map(f => f.replace('✖ ', '')));
    }
    
    return {
      success: false,
      duration,
      memory: maxMemory,
      output: error.stdout || error.message,
      test_count: 0,
      files_count: 0,
      failures
    };
  }
}

function validateOldSuite() {
  console.log('\n🔍 Validating OLD test suite (tests/)...');
  const result = runCommand('npm test 2>&1', 'Old Test Suite');
  
  metrics.old_suite.time = result.duration;
  metrics.old_suite.memory = result.memory;
  metrics.old_suite.failures = result.failures;
  metrics.old_suite.test_count = result.test_count;
  metrics.old_suite.files_count = result.files_count;
  
  return result;
}

function validateNewSuite() {
  console.log('\n🔍 Validating NEW test suite (tests-new/)...');
  
  // Temporarily update package.json to point to tests-new
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageContent = fs.readFileSync(packagePath, 'utf8');
  const packageJson = JSON.parse(packageContent);
  
  // Backup original test script
  const originalTestScript = packageJson.scripts.test;
  
  // Update to use tests-new
  packageJson.scripts.test = "vitest run --dir tests-new";
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  
  try {
    const result = runCommand('npm test 2>&1', 'New Test Suite');
    
    metrics.new_suite.time = result.duration;
    metrics.new_suite.memory = result.memory;
    metrics.new_suite.failures = result.failures;
    metrics.new_suite.test_count = result.test_count;
    metrics.new_suite.files_count = result.files_count;
    
    return result;
  } finally {
    // Restore original package.json
    packageJson.scripts.test = originalTestScript;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  }
}

function runFlakinesCheck() {
  console.log('\n🔄 Running flakiness check (10 runs)...');
  
  const runs = [];
  let flaky = false;
  const failures = new Set();
  
  for (let i = 1; i <= 10; i++) {
    console.log(`\n  Run ${i}/10...`);
    const result = validateNewSuite();
    runs.push(result);
    
    if (result.failures.length > 0) {
      result.failures.forEach(f => failures.add(f));
    }
    
    // Check if different tests fail in different runs
    if (i > 1 && runs.some(r => r.success) && runs.some(r => !r.success)) {
      flaky = true;
    }
  }
  
  const successRate = (runs.filter(r => r.success).length / runs.length) * 100;
  console.log(`\n📊 Flakiness Check Results:`);
  console.log(`  Success rate: ${successRate}%`);
  console.log(`  Flaky: ${flaky ? 'YES ⚠️' : 'NO ✅'}`);
  if (failures.size > 0) {
    console.log(`  Failures detected: ${Array.from(failures).join(', ')}`);
  }
  
  return { flaky, successRate, failures: Array.from(failures) };
}

function compareMetrics() {
  console.log('\n📈 Calculating comparison metrics...');
  
  metrics.comparison.time_delta = metrics.new_suite.time - metrics.old_suite.time;
  metrics.comparison.memory_delta = metrics.new_suite.memory - metrics.old_suite.memory;
  metrics.comparison.test_count_delta = metrics.new_suite.test_count - metrics.old_suite.test_count;
  
  // Calculate percentage improvements
  const timeImprovement = ((metrics.old_suite.time - metrics.new_suite.time) / metrics.old_suite.time * 100).toFixed(1);
  const memoryImprovement = ((metrics.old_suite.memory - metrics.new_suite.memory) / metrics.old_suite.memory * 100).toFixed(1);
  
  console.log('\n📊 COMPARISON RESULTS:');
  console.log('═'.repeat(50));
  console.log(`⏱️  Execution Time:`);
  console.log(`   Old: ${metrics.old_suite.time}s`);
  console.log(`   New: ${metrics.new_suite.time}s`);
  console.log(`   Improvement: ${timeImprovement}%`);
  
  console.log(`\n💾 Memory Usage:`);
  console.log(`   Old: ${metrics.old_suite.memory.toFixed(2)}MB`);
  console.log(`   New: ${metrics.new_suite.memory.toFixed(2)}MB`);
  console.log(`   Improvement: ${memoryImprovement}%`);
  
  console.log(`\n📋 Test Count:`);
  console.log(`   Old: ${metrics.old_suite.test_count} tests in ${metrics.old_suite.files_count} files`);
  console.log(`   New: ${metrics.new_suite.test_count} tests in ${metrics.new_suite.files_count} files`);
  
  console.log(`\n❌ Failures:`);
  console.log(`   Old: ${metrics.old_suite.failures.length}`);
  console.log(`   New: ${metrics.new_suite.failures.length}`);
  
  // Check GO/NO-GO criteria
  console.log('\n🎯 GO/NO-GO CRITERIA:');
  console.log('═'.repeat(50));
  
  const criteria = {
    execution_time: metrics.new_suite.time < 30,
    memory_usage: metrics.new_suite.memory < 512,
    no_failures: metrics.new_suite.failures.length === 0,
    performance_improved: timeImprovement > 0 && memoryImprovement > 0
  };
  
  console.log(`✅ Execution time <30s: ${criteria.execution_time ? 'PASS' : 'FAIL'} (${metrics.new_suite.time}s)`);
  console.log(`✅ Memory <512MB: ${criteria.memory_usage ? 'PASS' : 'FAIL'} (${metrics.new_suite.memory.toFixed(2)}MB)`);
  console.log(`✅ Zero failures: ${criteria.no_failures ? 'PASS' : 'FAIL'} (${metrics.new_suite.failures.length} failures)`);
  console.log(`✅ Performance improved: ${criteria.performance_improved ? 'PASS' : 'FAIL'}`);
  
  const allPass = Object.values(criteria).every(v => v);
  console.log(`\n${allPass ? '🟢 GO' : '🔴 NO-GO'} - ${allPass ? 'All criteria met!' : 'Some criteria not met'}`);
  
  return criteria;
}

function saveReport() {
  const reportPath = path.join(process.cwd(), '.tmp/test-infrastructure-rebuild/validation-report.json');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);
}

async function main() {
  console.log('🚀 Test Suite Validation Tool');
  console.log('═'.repeat(50));
  
  const args = process.argv.slice(2);
  
  if (args.includes('--flaky-check')) {
    runFlakinesCheck();
  } else if (args.includes('--parallel')) {
    // Run both suites in parallel
    console.log('\n⚡ Running validation in PARALLEL mode...');
    
    const oldPromise = new Promise(resolve => {
      setTimeout(() => resolve(validateOldSuite()), 0);
    });
    
    const newPromise = new Promise(resolve => {
      setTimeout(() => resolve(validateNewSuite()), 0);
    });
    
    await Promise.all([oldPromise, newPromise]);
    compareMetrics();
  } else {
    // Run sequentially
    validateOldSuite();
    validateNewSuite();
    compareMetrics();
  }
  
  saveReport();
}

main().catch(console.error);

export { metrics, validateOldSuite, validateNewSuite, compareMetrics };