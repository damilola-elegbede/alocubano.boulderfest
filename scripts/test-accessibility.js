#!/usr/bin/env node

/**
 * Accessibility Testing Script
 * Quick validation runner for accessibility compliance tests
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const ACCESSIBILITY_TEST = 'tests/e2e/advanced/accessibility-compliance.test.js';

console.log('🔍 A Lo Cubano Boulder Fest - Accessibility Testing');
console.log('================================================');

// Check if test files exist
const testPath = path.join(PROJECT_ROOT, ACCESSIBILITY_TEST);
if (!existsSync(testPath)) {
  console.error(`❌ Test file not found: ${testPath}`);
  process.exit(1);
}

const utilsPath = path.join(PROJECT_ROOT, 'tests/e2e/helpers/accessibility-utilities.js');
if (!existsSync(utilsPath)) {
  console.error(`❌ Utils file not found: ${utilsPath}`);
  process.exit(1);
}

console.log('✅ Test files found');

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'quick';

let testCommand;
let testArgs;

switch (mode) {
  case 'quick':
    console.log('🚀 Running quick accessibility checks...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      '--project=chromium',
      '--grep', 
      'Essential WCAG Compliance',
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'full':
    console.log('🔬 Running comprehensive WCAG 2.1 AA compliance tests...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'mobile':
    console.log('📱 Running mobile accessibility tests...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      '--project=mobile-chrome',
      '--project=mobile-safari',
      '--grep',
      'Mobile Browser Accessibility',
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'contrast':
    console.log('🎨 Running color contrast compliance tests...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      '--grep',
      'Color Contrast Compliance',
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'keyboard':
    console.log('⌨️  Running keyboard navigation tests...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      '--grep',
      'Keyboard Navigation',
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'screen-reader':
    console.log('👁️  Running screen reader compatibility tests...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      '--grep',
      'Screen Reader Compatibility',
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'legacy':
    console.log('🗄️  Running legacy browser compatibility tests...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      '--grep',
      'Legacy Browser Compatibility',
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'debug':
    console.log('🐛 Running accessibility tests in debug mode...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e:headed', 
      '--', 
      '--project=chromium',
      ACCESSIBILITY_TEST
    ];
    break;
    
  case 'report':
    console.log('📊 Running tests with detailed reporting...\n');
    testCommand = 'npm';
    testArgs = [
      'run', 
      'test:e2e', 
      '--', 
      '--reporter=html',
      ACCESSIBILITY_TEST
    ];
    break;
    
  default:
    console.log('❓ Usage: node scripts/test-accessibility.js [mode]');
    console.log('');
    console.log('Available modes:');
    console.log('  quick        - Fast essential compliance checks (default)');
    console.log('  full         - Complete WCAG 2.1 AA compliance suite');
    console.log('  mobile       - Mobile accessibility and touch targets');
    console.log('  contrast     - Color contrast ratio validation');
    console.log('  keyboard     - Keyboard navigation and focus management');
    console.log('  screen-reader - Screen reader compatibility testing');
    console.log('  legacy       - Legacy browser support and graceful degradation');
    console.log('  debug        - Run tests in headed mode for debugging');
    console.log('  report       - Generate detailed HTML reports');
    console.log('');
    console.log('Examples:');
    console.log('  npm run test:accessibility');
    console.log('  node scripts/test-accessibility.js full');
    console.log('  node scripts/test-accessibility.js mobile');
    console.log('  node scripts/test-accessibility.js debug');
    process.exit(0);
}

// Run the test
const testProcess = spawn(testCommand, testArgs, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    E2E_TEST_MODE: 'true'
  }
});

testProcess.on('close', (code) => {
  console.log('\n================================================');
  
  if (code === 0) {
    console.log('✅ Accessibility tests completed successfully!');
    console.log('');
    switch (mode) {
      case 'quick':
        console.log('📋 Quick compliance check passed');
        console.log('💡 Run "node scripts/test-accessibility.js full" for comprehensive testing');
        break;
      case 'full':
        console.log('🏆 Full WCAG 2.1 Level AA compliance validated');
        console.log('🎯 Website meets accessibility standards across all browsers');
        break;
      case 'mobile':
        console.log('📱 Mobile accessibility validated');
        console.log('👆 Touch targets and mobile navigation comply with standards');
        break;
      case 'contrast':
        console.log('🎨 Color contrast meets WCAG 2.1 AA requirements');
        console.log('👁️  All text and UI elements have sufficient contrast ratios');
        break;
      case 'keyboard':
        console.log('⌨️  Keyboard navigation fully accessible');
        console.log('🎯 Tab order, focus management, and skip links working correctly');
        break;
      case 'screen-reader':
        console.log('👁️  Screen reader compatibility validated');
        console.log('🏷️  ARIA labels, landmarks, and semantic structure correct');
        break;
      case 'legacy':
        console.log('🗄️  Legacy browser support confirmed');
        console.log('🔄 Graceful degradation and fallbacks working');
        break;
      case 'debug':
        console.log('🐛 Debug session completed');
        break;
      case 'report':
        console.log('📊 Detailed accessibility report generated');
        console.log('🔍 Check playwright-report/ directory for HTML report');
        break;
    }
  } else {
    console.log('❌ Accessibility tests failed');
    console.log(`💥 Exit code: ${code}`);
    console.log('');
    console.log('🔧 Troubleshooting steps:');
    console.log('  1. Check that the development server is running (npm run start:local)');
    console.log('  2. Verify axe-core is installed: npm install @axe-core/playwright');
    console.log('  3. Run with debug mode: node scripts/test-accessibility.js debug');
    console.log('  4. Check test output above for specific failure details');
    console.log('');
    console.log('📚 For help with accessibility issues:');
    console.log('  - WCAG 2.1 Guidelines: https://www.w3.org/WAI/WCAG21/quickref/');
    console.log('  - Test documentation: tests/e2e/advanced/README.md');
  }
  
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('❌ Failed to start accessibility tests:', error.message);
  process.exit(1);
});