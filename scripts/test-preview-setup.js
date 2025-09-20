#!/usr/bin/env node

/**
 * Preview Testing Setup Validation
 *
 * Quick validation script to ensure the preview testing setup is working correctly.
 * Tests all components without actually running E2E tests.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

console.log('🧪 Preview Testing Setup Validation');
console.log('='.repeat(50));

let hasErrors = false;
let hasWarnings = false;

function checkFile(filePath, description, required = true) {
  const fullPath = resolve(process.cwd(), filePath);
  const exists = existsSync(fullPath);

  if (exists) {
    console.log(`✅ ${description}: ${filePath}`);
  } else {
    if (required) {
      console.log(`❌ ${description}: ${filePath} (MISSING)`);
      hasErrors = true;
    } else {
      console.log(`⚠️ ${description}: ${filePath} (optional, not found)`);
      hasWarnings = true;
    }
  }
}

function checkEnvironmentVar(varName, description, required = true) {
  const value = process.env[varName];

  if (value) {
    console.log(`✅ ${description}: ${varName} (set)`);
  } else {
    if (required) {
      console.log(`❌ ${description}: ${varName} (MISSING)`);
      hasErrors = true;
    } else {
      console.log(`⚠️ ${description}: ${varName} (optional, not set)`);
      hasWarnings = true;
    }
  }
}

async function validateSetup() {
  console.log('\n📁 Checking Required Files...');

  // Core scripts
  checkFile('scripts/get-vercel-preview-url.js', 'Preview URL Extractor');
  checkFile('scripts/validate-preview-environment.js', 'Environment Validator');
  checkFile('scripts/run-e2e-preview.js', 'E2E Test Runner');

  // Configuration files
  checkFile('playwright-e2e-preview.config.js', 'Playwright Preview Config');
  checkFile('tests/e2e/global-setup-preview.js', 'Global Setup (Preview)');
  checkFile('tests/e2e/global-teardown-preview.js', 'Global Teardown (Preview)');

  // GitHub workflow
  checkFile('.github/workflows/e2e-preview-tests.yml', 'GitHub Workflow');

  // Documentation
  checkFile('docs/E2E_PREVIEW_TESTING.md', 'Documentation');

  console.log('\n🌍 Checking Environment Variables...');

  // Critical environment variables
  checkEnvironmentVar('GITHUB_TOKEN', 'GitHub API Token', false);
  checkEnvironmentVar('VERCEL_TOKEN', 'Vercel API Token', false);
  checkEnvironmentVar('PREVIEW_URL', 'Direct Preview URL', false);

  // Test configuration
  checkEnvironmentVar('TEST_ADMIN_PASSWORD', 'Admin Test Password', false);

  console.log('\n📦 Checking Package Scripts...');

  try {
    const fs = await import('fs');
    const packageJson = JSON.parse(
      fs.readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    );

    const requiredScripts = [
      'preview:extract-url',
      'preview:validate',
      'preview:test',
      'preview:test:headed',
      'preview:test:debug'
    ];

    requiredScripts.forEach(script => {
      if (packageJson.scripts[script]) {
        console.log(`✅ NPM Script: ${script}`);
      } else {
        console.log(`❌ NPM Script: ${script} (MISSING)`);
        hasErrors = true;
      }
    });

  } catch (error) {
    console.log(`❌ Package.json validation failed: ${error.message}`);
    hasErrors = true;
  }

  console.log('\n🔧 Testing Core Components...');

  try {
    // Test URL extractor import
    await import('./get-vercel-preview-url.js');
    console.log('✅ URL Extractor: Imports successfully');
  } catch (error) {
    console.log(`❌ URL Extractor: Import failed - ${error.message}`);
    hasErrors = true;
  }

  try {
    // Test environment validator import
    await import('./validate-preview-environment.js');
    console.log('✅ Environment Validator: Imports successfully');
  } catch (error) {
    console.log(`❌ Environment Validator: Import failed - ${error.message}`);
    hasErrors = true;
  }

  try {
    // Test runner import
    await import('./run-e2e-preview.js');
    console.log('✅ E2E Test Runner: Imports successfully');
  } catch (error) {
    console.log(`❌ E2E Test Runner: Import failed - ${error.message}`);
    hasErrors = true;
  }

  console.log('\n🎯 Testing Example URLs...');

  // Test URL pattern matching (simulated)
  const testUrls = [
    'https://my-app-abc123.vercel.app',
    'https://my-app-git-main-team.vercel.app',
    'https://my-app.vercel.app'
  ];

  testUrls.forEach(url => {
    const isValid = /^https:\/\/[a-zA-Z0-9-]+(?:-[a-zA-Z0-9-]+)*\.vercel\.app$/.test(url);
    console.log(`${isValid ? '✅' : '❌'} URL Pattern: ${url}`);
    if (!isValid) hasWarnings = true;
  });

  console.log('\n📊 Validation Results');
  console.log('='.repeat(50));

  if (!hasErrors && !hasWarnings) {
    console.log('🎉 All checks passed! Preview testing setup is ready.');
    console.log('\n🚀 Next Steps:');
    console.log('1. Deploy your app to Vercel (or create a PR for automatic deployment)');
    console.log('2. Extract preview URL: npm run preview:extract-url');
    console.log('3. Validate environment: npm run preview:validate');
    console.log('4. Run tests: npm run preview:test');
    console.log('\n📖 Documentation: docs/E2E_PREVIEW_TESTING.md');
    return 0;
  } else if (hasErrors) {
    console.log('❌ Setup validation failed with critical errors.');
    console.log('\n🔧 Required Actions:');
    console.log('1. Fix missing files and scripts shown above');
    console.log('2. Re-run validation: node scripts/test-preview-setup.js');
    console.log('3. Check documentation: docs/E2E_PREVIEW_TESTING.md');
    return 1;
  } else {
    console.log('⚠️ Setup validation completed with warnings.');
    console.log('\n💡 Recommended Actions:');
    console.log('1. Set optional environment variables for full functionality');
    console.log('2. Review warnings shown above');
    console.log('3. Test basic functionality: npm run preview:validate');
    console.log('\n✅ Setup is functional but could be improved.');
    return 0;
  }
}

// Run validation
validateSetup()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('\n💥 Validation failed with error:');
    console.error(error.message);
    console.error('\n🔧 Try running with more details or check the documentation.');
    process.exit(1);
  });