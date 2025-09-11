/**
 * E2E Test Setup Helper
 * 
 * Provides utilities for individual test files to validate secrets
 * and setup required environment before test execution.
 */

import { validateSecretsForTestFile, quickValidateBasicSecrets } from '../secret-validator.js';

/**
 * Setup function to be called at the beginning of each test file
 * 
 * @param {Object} options - Setup options
 * @param {Array<string>} options.testTypes - Types of tests in this file
 * @param {boolean} options.requireSecrets - Whether to fail on missing secrets
 * @param {string} options.testFile - Name of the test file (for automatic type detection)
 * @returns {Object} Setup result
 */
export function setupTest(options = {}) {
  const {
    testTypes = ['basic'],
    requireSecrets = true,
    testFile = ''
  } = options;

  // Quick validation for basic secrets
  if (!quickValidateBasicSecrets()) {
    if (requireSecrets) {
      throw new Error('Basic secrets validation failed');
    }
    console.warn('⚠️ Basic secrets missing - some tests may fail');
  }

  // Full validation if test file provided
  if (testFile) {
    try {
      const validation = validateSecretsForTestFile(testFile);
      
      if (!validation.passed && requireSecrets) {
        throw new Error(`Secret validation failed for test file: ${testFile}`);
      }
      
      return {
        passed: validation.passed,
        secrets: validation,
        canRunTests: validation.passed || !requireSecrets
      };
    } catch (error) {
      if (requireSecrets) {
        throw error;
      }
      console.warn(`⚠️ Secret validation warning: ${error.message}`);
      return {
        passed: false,
        secrets: null,
        canRunTests: true
      };
    }
  }

  return {
    passed: true,
    secrets: null,
    canRunTests: true
  };
}

/**
 * Skip test if required secrets are missing
 * Usage in test files:
 * 
 * import { skipTestIfSecretsUnavailable } from './helpers/test-setup.js';
 * 
 * test.describe('Admin Tests', () => {
 *   skipTestIfSecretsUnavailable(['admin'], 'admin-auth.test.js');
 *   // ... rest of tests
 * });
 */
export function skipTestIfSecretsUnavailable(testTypes, testFile) {
  try {
    // Enhanced environment variable loading for E2E tests
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'test';
    }
    if (!process.env.E2E_TEST_MODE) {
      process.env.E2E_TEST_MODE = 'true';
    }
    
    // Check for test environment file and load if needed
    // Note: For E2E tests against preview deployments, local environment files are not needed
    // Environment variables come from GitHub secrets and Vercel deployment configuration
    
    const setup = setupTest({ testTypes, requireSecrets: false, testFile }); // Changed to false for graceful degradation
    
    if (!setup.canRunTests) {
      console.log(`⏭️ Skipping tests in ${testFile} due to missing required secrets`);
      // In Playwright, we can use test.skip() to skip entire describe blocks
      return true; // Should skip
    }
    
    return false; // Don't skip
  } catch (error) {
    console.log(`⏭️ Skipping tests in ${testFile} due to secret validation error: ${error.message}`);
    return true; // Should skip
  }
}

/**
 * Warning helper for tests that can run with degraded functionality
 */
export function warnIfOptionalSecretsUnavailable(testTypes, testFile) {
  try {
    const setup = setupTest({ testTypes, requireSecrets: false, testFile });
    
    if (setup.secrets && setup.secrets.warnings.length > 0) {
      console.log(`⚠️ ${testFile}: ${setup.secrets.warnings.length} optional secrets missing`);
      console.log('   Some tests may run with reduced functionality or mock data');
      
      return {
        hasWarnings: true,
        warnings: setup.secrets.warnings,
        shouldUseMocks: true
      };
    }
    
    return {
      hasWarnings: false,
      warnings: [],
      shouldUseMocks: false
    };
  } catch (error) {
    console.warn(`Warning check failed for ${testFile}: ${error.message}`);
    return {
      hasWarnings: true,
      warnings: [error.message],
      shouldUseMocks: true
    };
  }
}

export default {
  setupTest,
  skipTestIfSecretsUnavailable,
  warnIfOptionalSecretsUnavailable
};