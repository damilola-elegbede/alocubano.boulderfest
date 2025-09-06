/**
 * Vercel E2E global setup - minimal configuration
 */
import { config } from 'dotenv';
import { initializeSecretValidation } from './helpers/secret-validator.js';

config({ path: '.env.local' });

export default async function() {
  console.log('🚀 Global E2E Setup - Minimal Configuration');
  console.log('='.repeat(50));
  
  // Step 0: Validate environment secrets before proceeding
  console.log('🔐 Validating environment secrets...');
  const secretValidation = initializeSecretValidation();
  
  if (!secretValidation.success) {
    throw new Error('❌ Secret validation failed - cannot proceed with E2E tests');
  }
  
  console.log('✅ Secret validation completed successfully\n');
  
  process.env.E2E_TEST_MODE = 'true';
  process.env.TEST_DATABASE_RESET_ALLOWED = 'true';
}