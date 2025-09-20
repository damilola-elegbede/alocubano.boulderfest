/**
 * Vercel E2E global setup - minimal configuration with resilient environment handling
 */
import { config } from 'dotenv';
import { initializeSecretValidation } from './helpers/secret-validator.js';

config({ path: '.env.local' });

export default async function() {
  console.log('🚀 Global E2E Setup - Resilient Configuration');
  console.log('='.repeat(50));

  // Step 0: Validate environment secrets before proceeding (non-blocking)
  console.log('🔐 Validating environment secrets...');

  try {
    const secretValidation = initializeSecretValidation();

    if (!secretValidation.success) {
      console.warn('⚠️ Secret validation had issues but proceeding with defaults');
      console.warn('💡 Tests will run with graceful degradation where needed');
    } else {
      console.log('✅ Secret validation completed successfully');
    }

    // Set minimum defaults to ensure tests can run
    if (!process.env.TEST_ADMIN_PASSWORD) {
      process.env.TEST_ADMIN_PASSWORD = 'test-admin-password';
      console.log('🔄 Set default TEST_ADMIN_PASSWORD');
    }

    if (!process.env.ADMIN_SECRET) {
      process.env.ADMIN_SECRET = 'test-secret-for-development-minimum-32-chars';
      console.log('🔄 Set default ADMIN_SECRET');
    }

    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'test';
      console.log('🔄 Set default NODE_ENV=test');
    }

  } catch (error) {
    console.warn('⚠️ Secret validation encountered issues:', error.message);
    console.warn('⚠️ Proceeding with basic defaults to allow tests to run');

    // Set absolute minimum defaults
    process.env.TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'test-admin-password';
    process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-secret-for-development-minimum-32-chars';
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  }

  // Set test mode flags
  process.env.E2E_TEST_MODE = 'true';
  process.env.TEST_DATABASE_RESET_ALLOWED = 'true';

  console.log('✅ Global setup completed with resilient configuration');
  console.log('📊 Environment ready:');
  console.log(`   - TEST_ADMIN_PASSWORD: ${process.env.TEST_ADMIN_PASSWORD ? 'Set' : 'Missing'}`);
  console.log(`   - ADMIN_SECRET: ${process.env.ADMIN_SECRET ? 'Set' : 'Missing'}`);
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   - E2E_TEST_MODE: ${process.env.E2E_TEST_MODE}`);
  console.log('='.repeat(50));
}