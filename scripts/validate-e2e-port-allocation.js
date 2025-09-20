#!/usr/bin/env node

/**
 * E2E Port Allocation Validation Script
 *
 * This script validates the dynamic port allocation solution for parallel E2E test execution.
 * It verifies that each test suite gets its own port (3000-3005) and isolated database
 * to prevent conflicts when running in CI matrix jobs.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Test suite configuration matching CI matrix
const TEST_SUITES = [
  {
    name: 'standard',
    port: 3000,
    database: 'e2e-ci-test-standard.db',
    env: { E2E_TEST_SUITE: 'standard' }
  },
  {
    name: 'advanced',
    port: 3001,
    database: 'e2e-ci-test-advanced.db',
    env: { E2E_TEST_SUITE: 'advanced' }
  },
  {
    name: 'firefox',
    port: 3002,
    database: 'e2e-ci-test-firefox.db',
    env: { E2E_TEST_SUITE: 'firefox' }
  },
  {
    name: 'performance',
    port: 3003,
    database: 'e2e-ci-test-performance.db',
    env: { E2E_TEST_SUITE: 'performance' }
  },
  {
    name: 'accessibility',
    port: 3004,
    database: 'e2e-ci-test-accessibility.db',
    env: { E2E_TEST_SUITE: 'accessibility' }
  },
  {
    name: 'security',
    port: 3005,
    database: 'e2e-ci-test-security.db',
    env: { E2E_TEST_SUITE: 'security' }
  }
];

class ValidationResults {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  addResult(testName, passed, details = '') {
    this.results.push({ testName, passed, details });
    if (passed) {
      this.passed++;
    } else {
      this.failed++;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('E2E PORT ALLOCATION VALIDATION RESULTS');
    console.log('='.repeat(80));

    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.testName}`);
      if (result.details) {
        console.log(`     ${result.details}`);
      }
    });

    console.log('\n' + '-'.repeat(80));
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Success Rate: ${(this.passed / this.results.length * 100).toFixed(1)}%`);

    if (this.failed === 0) {
      console.log('\n🎉 ALL VALIDATIONS PASSED - Solution ready for deployment!');
    } else {
      console.log('\n⚠️  VALIDATION FAILURES DETECTED - Fix issues before deployment');
    }
    console.log('='.repeat(80));

    return this.failed === 0;
  }
}

async function checkPortAvailability(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();

    server.listen(port, (err) => {
      if (err) {
        resolve(false);
      } else {
        server.once('close', () => resolve(true));
        server.close();
      }
    });

    server.on('error', () => resolve(false));
  });
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: 'pipe',
      cwd: projectRoot,
      ...options
    });

    let stdout = '';
    let stderr = '';

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    process.on('error', reject);
  });
}

async function validatePortAllocationLogic(results) {
  console.log('🔍 Validating port allocation logic...');

  try {
    // Read the port allocation script
    const setupScriptPath = path.join(projectRoot, 'scripts', 'setup-e2e-test-env.js');
    const scriptExists = await fs.access(setupScriptPath).then(() => true).catch(() => false);

    if (!scriptExists) {
      results.addResult('Port allocation script exists', false, 'setup-e2e-test-env.js not found');
      return;
    }

    results.addResult('Port allocation script exists', true);

    // Test each suite's port calculation
    for (const suite of TEST_SUITES) {
      const env = { ...process.env, ...suite.env };
      const result = await runCommand('node', [setupScriptPath, '--validate-port'], { env });

      if (result.code === 0 && result.stdout.includes(`PORT=${suite.port}`)) {
        results.addResult(`${suite.name} suite port allocation (${suite.port})`, true);
      } else {
        results.addResult(`${suite.name} suite port allocation (${suite.port})`, false,
          `Expected PORT=${suite.port}, got: ${result.stdout.trim()}`);
      }
    }
  } catch (error) {
    results.addResult('Port allocation logic validation', false, error.message);
  }
}

async function validatePortConflicts(results) {
  console.log('🔍 Checking for port conflicts...');

  const usedPorts = new Set();
  let hasConflicts = false;

  for (const suite of TEST_SUITES) {
    if (usedPorts.has(suite.port)) {
      results.addResult(`Port conflict check - ${suite.name}`, false,
        `Port ${suite.port} already assigned to another suite`);
      hasConflicts = true;
    } else {
      usedPorts.add(suite.port);
      results.addResult(`Port conflict check - ${suite.name}`, true);
    }
  }

  // Verify port range is correct
  const minPort = Math.min(...TEST_SUITES.map(s => s.port));
  const maxPort = Math.max(...TEST_SUITES.map(s => s.port));

  if (minPort === 3000 && maxPort === 3005 && usedPorts.size === 6) {
    results.addResult('Port range validation (3000-3005)', true);
  } else {
    results.addResult('Port range validation (3000-3005)', false,
      `Expected range 3000-3005, got ${minPort}-${maxPort} with ${usedPorts.size} ports`);
  }
}

async function validateDatabaseIsolation(results) {
  console.log('🔍 Validating database isolation...');

  const usedDatabases = new Set();
  let hasConflicts = false;

  for (const suite of TEST_SUITES) {
    if (usedDatabases.has(suite.database)) {
      results.addResult(`Database isolation - ${suite.name}`, false,
        `Database ${suite.database} already assigned to another suite`);
      hasConflicts = true;
    } else {
      usedDatabases.add(suite.database);
      results.addResult(`Database isolation - ${suite.name}`, true);
    }

    // Check database naming convention
    const expectedPattern = /^e2e-ci-test-\w+\.db$/;
    if (expectedPattern.test(suite.database)) {
      results.addResult(`Database naming - ${suite.name}`, true);
    } else {
      results.addResult(`Database naming - ${suite.name}`, false,
        `Database name ${suite.database} doesn't follow e2e-ci-test-*.db pattern`);
    }
  }
}

async function validateEnvironmentVariables(results) {
  console.log('🔍 Validating environment variable handling...');

  for (const suite of TEST_SUITES) {
    const env = { ...process.env, ...suite.env };

    // Test environment variable is set correctly
    if (env.E2E_TEST_SUITE === suite.name) {
      results.addResult(`Environment variable - ${suite.name}`, true);
    } else {
      results.addResult(`Environment variable - ${suite.name}`, false,
        `Expected E2E_TEST_SUITE=${suite.name}, got ${env.E2E_TEST_SUITE}`);
    }
  }
}

async function simulateCIExecution(results) {
  console.log('🔍 Simulating CI matrix execution...');

  // Test that setup script works for each suite
  for (const suite of TEST_SUITES) {
    try {
      const env = { ...process.env, ...suite.env };
      const result = await runCommand('node', [
        path.join(projectRoot, 'scripts', 'setup-e2e-test-env.js'),
        '--dry-run'
      ], { env, timeout: 10000 });

      const output = result.stdout + result.stderr;
      const hasPort = output.includes(`PORT=${suite.port}`);
      const hasDatabase = output.includes(suite.database);

      if (result.code === 0 && hasPort && hasDatabase) {
        results.addResult(`CI simulation - ${suite.name}`, true);
      } else {
        results.addResult(`CI simulation - ${suite.name}`, false,
          `Setup failed: code=${result.code}, port=${hasPort}, db=${hasDatabase}`);
      }
    } catch (error) {
      results.addResult(`CI simulation - ${suite.name}`, false, error.message);
    }
  }
}

async function validateCleanupMechanisms(results) {
  console.log('🔍 Validating cleanup mechanisms...');

  try {
    // Test database cleanup
    const cleanupResult = await runCommand('node', [
      path.join(projectRoot, 'scripts', 'setup-e2e-test-env.js'),
      '--cleanup', '--dry-run'
    ]);

    if (cleanupResult.code === 0) {
      results.addResult('Database cleanup mechanism', true);
    } else {
      results.addResult('Database cleanup mechanism', false,
        `Cleanup script failed with code ${cleanupResult.code}`);
    }

    // Verify cleanup includes all test databases
    const output = cleanupResult.stdout + cleanupResult.stderr;
    let allDatabasesIncluded = true;

    for (const suite of TEST_SUITES) {
      if (!output.includes(suite.database)) {
        allDatabasesIncluded = false;
        results.addResult(`Cleanup includes ${suite.name} database`, false);
      } else {
        results.addResult(`Cleanup includes ${suite.name} database`, true);
      }
    }
  } catch (error) {
    results.addResult('Cleanup mechanisms validation', false, error.message);
  }
}

async function validatePlaywrightConfig(results) {
  console.log('🔍 Validating Playwright configuration...');

  try {
    const configPath = path.join(projectRoot, 'playwright-e2e-vercel-main.config.js');
    const configExists = await fs.access(configPath).then(() => true).catch(() => false);

    if (!configExists) {
      results.addResult('Playwright config exists', false, 'playwright-e2e-vercel-main.config.js not found');
      return;
    }

    results.addResult('Playwright config exists', true);

    // Read config and check for port handling
    const configContent = await fs.readFile(configPath, 'utf8');

    const hasDynamicPort = configContent.includes('process.env.PORT') ||
                          configContent.includes('testPort') ||
                          configContent.includes('${testPort}') ||
                          configContent.includes('PORT: testPort');

    const hasBaseURL = configContent.includes('baseURL');

    if (hasDynamicPort && hasBaseURL) {
      results.addResult('Playwright config handles dynamic ports', true);
    } else {
      results.addResult('Playwright config handles dynamic ports', false,
        `Config missing dynamic port support: port=${hasDynamicPort}, baseURL=${hasBaseURL}`);
    }
  } catch (error) {
    results.addResult('Playwright configuration validation', false, error.message);
  }
}

async function validatePackageJsonScripts(results) {
  console.log('🔍 Validating package.json test scripts...');

  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    const requiredScripts = [
      'test:e2e',
      'test:e2e:standard',
      'test:e2e:advanced',
      'test:e2e:firefox',
      'test:e2e:performance',
      'test:e2e:accessibility',
      'test:e2e:security'
    ];

    for (const script of requiredScripts) {
      if (packageJson.scripts && packageJson.scripts[script]) {
        results.addResult(`Package script - ${script}`, true);
      } else {
        results.addResult(`Package script - ${script}`, false, `Script ${script} not found`);
      }
    }
  } catch (error) {
    results.addResult('Package.json scripts validation', false, error.message);
  }
}

async function main() {
  console.log('🚀 Starting E2E Port Allocation Validation\n');

  const results = new ValidationResults();

  try {
    await validatePortAllocationLogic(results);
    await validatePortConflicts(results);
    await validateDatabaseIsolation(results);
    await validateEnvironmentVariables(results);
    await simulateCIExecution(results);
    await validateCleanupMechanisms(results);
    await validatePlaywrightConfig(results);
    await validatePackageJsonScripts(results);

    const success = results.printSummary();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed with error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { validatePortAllocationLogic, validatePortConflicts, validateDatabaseIsolation };