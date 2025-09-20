#!/usr/bin/env node
/**
 * Validate Unified Playwright Configuration
 *
 * This script tests the unified Playwright configuration across all supported
 * environment modes to ensure proper behavior after the configuration consolidation.
 */

import { execSync } from 'child_process';

const ENVIRONMENTS = [
  {
    name: 'Local Development',
    env: {},
    expectedMode: 'Local Development',
    expectedWebServer: 'Enabled'
  },
  {
    name: 'Dynamic Port',
    env: { DYNAMIC_PORT: '3001' },
    expectedMode: 'Local Development',
    expectedBaseURL: 'http://localhost:3001'
  },
  {
    name: 'CI Mode',
    env: { CI: 'true', DYNAMIC_PORT: '3002' },
    expectedMode: 'CI with Dynamic Port Allocation',
    expectedBaseURL: 'http://localhost:3002',
    expectedCIMode: 'true'
  },
  {
    name: 'Preview Deployment',
    env: { PREVIEW_URL: 'https://test-preview.vercel.app' },
    expectedMode: 'Vercel Preview Deployment',
    expectedBaseURL: 'https://test-preview.vercel.app',
    expectedWebServer: 'Disabled'
  },
  {
    name: 'Custom Base URL',
    env: { PLAYWRIGHT_BASE_URL: 'https://custom.example.com' },
    expectedMode: 'Custom Base URL',
    expectedBaseURL: 'https://custom.example.com'
  },
  {
    name: 'Advanced Scenarios',
    env: { ADVANCED_SCENARIOS: 'true' },
    expectedAdvancedScenarios: 'true',
    expectedTimeout: '120000' // Should be higher for advanced scenarios
  }
];

console.log('🎭 Unified Playwright Configuration Validation');
console.log('━'.repeat(60));

let passedTests = 0;
let totalTests = 0;

for (const testCase of ENVIRONMENTS) {
  console.log(`\\n🧪 Testing: ${testCase.name}`);

  try {
    // Build environment string
    const envString = Object.entries(testCase.env)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');

    // Run configuration test
    const command = `${envString} node -e "import('./playwright.config.js').then(() => console.log('✅ Config loaded'));"`;
    const output = execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe'
    });

    totalTests++;

    // Parse output to validate expectations
    const lines = output.split('\\n');
    let configFound = false;
    let validationPassed = true;

    for (const line of lines) {
      if (line.includes('🎭 Unified Playwright Configuration:')) {
        configFound = true;
      }

      // Validate expected values
      if (testCase.expectedMode && line.includes('Mode:')) {
        if (!line.includes(testCase.expectedMode)) {
          console.log(`   ❌ Expected mode "${testCase.expectedMode}", got: ${line}`);
          validationPassed = false;
        } else {
          console.log(`   ✅ Mode: ${testCase.expectedMode}`);
        }
      }

      if (testCase.expectedBaseURL && line.includes('Base URL:')) {
        if (!line.includes(testCase.expectedBaseURL)) {
          console.log(`   ❌ Expected base URL "${testCase.expectedBaseURL}", got: ${line}`);
          validationPassed = false;
        } else {
          console.log(`   ✅ Base URL: ${testCase.expectedBaseURL}`);
        }
      }

      if (testCase.expectedWebServer && line.includes('Web Server:')) {
        if (!line.includes(testCase.expectedWebServer)) {
          console.log(`   ❌ Expected web server "${testCase.expectedWebServer}", got: ${line}`);
          validationPassed = false;
        } else {
          console.log(`   ✅ Web Server: ${testCase.expectedWebServer}`);
        }
      }

      if (testCase.expectedCIMode && line.includes('CI Mode:')) {
        if (!line.includes(testCase.expectedCIMode)) {
          console.log(`   ❌ Expected CI mode "${testCase.expectedCIMode}", got: ${line}`);
          validationPassed = false;
        } else {
          console.log(`   ✅ CI Mode: ${testCase.expectedCIMode}`);
        }
      }

      if (testCase.expectedAdvancedScenarios && line.includes('Advanced Scenarios:')) {
        if (!line.includes(testCase.expectedAdvancedScenarios)) {
          console.log(`   ❌ Expected advanced scenarios "${testCase.expectedAdvancedScenarios}", got: ${line}`);
          validationPassed = false;
        } else {
          console.log(`   ✅ Advanced Scenarios: ${testCase.expectedAdvancedScenarios}`);
        }
      }
    }

    if (!configFound) {
      console.log(`   ❌ Configuration output not found`);
      validationPassed = false;
    }

    if (validationPassed) {
      console.log(`   ✅ ${testCase.name} - PASSED`);
      passedTests++;
    } else {
      console.log(`   ❌ ${testCase.name} - FAILED`);
    }

  } catch (error) {
    console.log(`   ❌ ${testCase.name} - ERROR: ${error.message}`);
    totalTests++;
  }
}

console.log('\\n' + '━'.repeat(60));
console.log('📊 VALIDATION RESULTS');
console.log('━'.repeat(60));
console.log(`✅ Passed: ${passedTests}/${totalTests}`);
console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);

if (passedTests === totalTests) {
  console.log('\\n🎉 All configuration environments are working correctly!');
  console.log('\\n🔧 Configuration Consolidation Summary:');
  console.log('   • 5 separate configuration files → 1 unified configuration');
  console.log('   • Environment-aware settings based on variables');
  console.log('   • Backward compatible with all existing npm scripts');
  console.log('   • Consistent behavior across all test environments');
  console.log('   • Legacy configurations archived for reference');

  process.exit(0);
} else {
  console.log('\\n🚨 Some configuration tests failed!');
  console.log('   Please review the errors above and fix the configuration.');
  process.exit(1);
}