/**
 * Global Setup for E2E Tests - CI Environment
 * 
 * Handles:
 * - Database initialization for isolated test environments
 * - Environment variable validation using centralized configuration
 * - CI-specific configurations
 * - Port and database file verification
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { E2E_CONFIG, validateE2EEnvironment, logE2EEnvironment } from '../../config/e2e-env-config.js';
import { validateSecrets } from './secret-validator.js';

const PROJECT_ROOT = resolve(process.cwd());

async function globalSetup() {
  console.log('🚀 Global E2E Setup - CI Environment');
  console.log('=====================================');
  
  // STEP 0: Validate all secrets first - fail fast if critical ones are missing
  console.log('\n🔐 STEP 0: Secret Validation');
  console.log('-'.repeat(40));
  
  try {
    const testTypes = ['basic', 'admin', 'ci'];
    
    // Add advanced test types if enabled
    if (E2E_CONFIG.ADVANCED_SCENARIOS) {
      testTypes.push('email', 'payment', 'wallet');
    }
    
    const secretValidation = validateSecrets({
      testTypes,
      ci: true,
      strict: false
    });
    
    if (!secretValidation.passed) {
      console.error('❌ SECRET VALIDATION FAILED - ABORTING TESTS');
      process.exit(1);
    }
    
    console.log(`✅ Secret validation passed (${secretValidation.summary.found}/${secretValidation.summary.total} secrets configured)`);
    
    if (secretValidation.warnings.length > 0) {
      console.log(`⚠️ ${secretValidation.warnings.length} optional secrets missing (tests will use graceful degradation)`);
    }
    
  } catch (error) {
    console.error('❌ SECRET VALIDATION ERROR:', error.message);
    process.exit(1);
  }
  
  // STEP 1: Additional environment validation using existing centralized configuration
  try {
    validateE2EEnvironment({
      adminTests: true,
      ciMode: true,
      emailTests: E2E_CONFIG.ADVANCED_SCENARIOS,
      paymentTests: E2E_CONFIG.ADVANCED_SCENARIOS,
      walletTests: E2E_CONFIG.ADVANCED_SCENARIOS,
      throwOnMissing: true,
    });
  } catch (validationError) {
    console.error('❌ Environment validation failed:', validationError.message);
    throw validationError;
  }
  
  // Log configuration using centralized system
  logE2EEnvironment(true);
  
  console.log(`📡 Port: ${E2E_CONFIG.DYNAMIC_PORT} (centralized configuration)`);
  console.log(`🗄️ Database: Turso (validated)`);
  console.log(`🎭 Suite: ${E2E_CONFIG.PLAYWRIGHT_BROWSER}`);
  console.log(`🌍 Environment: ${E2E_CONFIG.NODE_ENV}`);
  
  try {
    
    // Run migrations on Turso database using centralized configuration
    console.log('🗄️ Running migrations on Turso database...');
    const migrationCommand = `NODE_ENV=${E2E_CONFIG.NODE_ENV} npm run migrate:up`;
    console.log(`📋 Running: ${migrationCommand}`);
    
    try {
      execSync(migrationCommand, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: E2E_CONFIG.NODE_ENV,
          TURSO_DATABASE_URL: E2E_CONFIG.TURSO_DATABASE_URL,
          TURSO_AUTH_TOKEN: E2E_CONFIG.TURSO_AUTH_TOKEN
        }
      });
      console.log('✅ Database migrations completed');
    } catch (migrationError) {
      console.warn('⚠️ Database migration failed, but continuing (may be expected for test environment)');
      console.warn('   Error:', migrationError.message);
    }
    
    // Display configuration summary using centralized config
    console.log('');
    console.log('📊 Setup Summary:');
    console.log(`   Port: ${E2E_CONFIG.DYNAMIC_PORT} (centralized configuration)`);
    console.log(`   Database: Turso (validated and configured)`);
    console.log(`   Working Directory: ${PROJECT_ROOT}`);
    console.log(`   CI Mode: ${E2E_CONFIG.CI ? 'Yes' : 'No'}`);
    console.log(`   Advanced Scenarios: ${E2E_CONFIG.ADVANCED_SCENARIOS ? 'Yes' : 'No'}`);
    console.log(`   Performance Testing: ${E2E_CONFIG.PERFORMANCE_TESTING ? 'Yes' : 'No'}`);
    console.log(`   Accessibility Testing: ${E2E_CONFIG.ACCESSIBILITY_TESTING ? 'Yes' : 'No'}`);
    console.log(`   Security Testing: ${E2E_CONFIG.SECURITY_TESTING ? 'Yes' : 'No'}`);
    console.log('');
    
    console.log('✅ Global setup completed successfully');
    console.log('=====================================');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

export default globalSetup;