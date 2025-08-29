/**
 * Global setup for E2E tests
 * Ensures database is properly initialized before tests run
 * Compatible with Vercel dev server (localhost:3000)
 */

import { config } from 'dotenv';
import { execSync } from 'child_process';
import { setupTestDatabase } from '../../scripts/reset-test-database.js';
import { seedTestData, getTestDataConstants } from '../../scripts/seed-test-data.js';

async function globalSetup() {
  console.log('\n🚀 E2E Global Setup Starting (Production-like testing with Turso)...\n');
  
  // Load environment variables
  config({ path: '.env.local' });
  
  // Set E2E test mode for compatibility with Vercel dev server
  process.env.E2E_TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE_RESET_ALLOWED = 'true'; // Allow database reset in test mode
  console.log('✅ E2E Test Mode enabled for Vercel dev server');
  
  // Check for Turso configuration with fallback support
  console.log('🔍 Checking database configuration...');
  
  let databaseMode = 'turso';
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.warn('⚠️  Turso credentials not available, falling back to SQLite mode');
    console.warn('   Missing environment variables:');
    if (!process.env.TURSO_DATABASE_URL) {
      console.warn('   - TURSO_DATABASE_URL');
    }
    if (!process.env.TURSO_AUTH_TOKEN) {
      console.warn('   - TURSO_AUTH_TOKEN');
    }
    
    // Fallback to SQLite for local testing
    databaseMode = 'sqlite';
    process.env.DATABASE_URL = 'file:./data/e2e-test.db';
    
    // Remove Turso credentials to force SQLite mode
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    
    console.warn('\n   📁 Fallback: Using SQLite database for E2E tests');
    console.warn('   This is acceptable for local development but not ideal for production-like testing\n');
  } else {
    console.log('✅ Turso credentials available - using production-like testing environment');
  }
  
  // Setup database with deterministic reset
  console.log(`📦 Setting up ${databaseMode} database with clean state...`);
  try {
    if (databaseMode === 'turso') {
      console.log('  Using Turso database (production-like environment)');
      console.log('  Database URL:', process.env.TURSO_DATABASE_URL);
    } else {
      console.log('  Using SQLite database (local development fallback)');
      console.log('  Database file: ./data/e2e-test.db');
    }
    
    // Use the new database reset mechanism for deterministic test state
    console.log('  🔄 Resetting database to clean state...');
    const resetResult = await setupTestDatabase();
    
    console.log('  ✅ Database reset complete:');
    console.log(`     Mode: ${resetResult.mode}`);
    console.log(`     Tables: ${resetResult.health?.tableCount || 'unknown'}`);
    console.log(`     Migrations: ${resetResult.health?.migrationsApplied || 'unknown'}`);
    console.log(`     Duration: ${resetResult.duration}ms`);
    
    console.log(`✅ ${databaseMode === 'turso' ? 'Turso' : 'SQLite'} database setup complete\n`);
  } catch (error) {
    console.error(`❌ ${databaseMode === 'turso' ? 'Turso' : 'SQLite'} database setup failed:`, error.message);
    
    // Fallback to legacy migration approach
    console.warn('  ⚠️  Attempting fallback migration approach...');
    try {
      execSync('npm run migrate:e2e:up', { stdio: 'inherit' });
      console.log('  ✅ Fallback migrations applied successfully');
    } catch (migrationError) {
      console.warn('  ⚠️  Fallback migration also failed, continuing with existing database state');
      console.warn('     This may be normal if database is already migrated');
    }
  }
  
  // Seed deterministic test data for all E2E scenarios
  console.log('🌱 Seeding deterministic test data...');
  try {
    const testDataConstants = getTestDataConstants();
    console.log('  📋 Test data configuration:');
    console.log(`     Admin Email: ${testDataConstants.ADMIN_EMAIL}`);
    console.log(`     Test Prefix: ${testDataConstants.TEST_PREFIX}`);
    
    // Use 'standard' profile for comprehensive E2E testing
    const seedResult = await seedTestData('standard');
    
    console.log('  ✅ Test data seeded successfully:');
    console.log(`     Profile: ${seedResult.profile}`);
    console.log(`     Duration: ${seedResult.duration}ms`);
    
    // Log validation results for debugging
    if (seedResult.validation) {
      console.log('  📊 Seeded data validation:');
      for (const [type, result] of Object.entries(seedResult.validation)) {
        if (result.exists && result.count > 0) {
          console.log(`     ${type}: ${result.count} records`);
        }
      }
    }
    
    // Store test data constants for use by tests
    global.testDataConstants = testDataConstants;
    global.seededTestData = seedResult.seededData;
    
    console.log('✅ Test data seeding complete\n');
  } catch (seedError) {
    console.error('❌ Test data seeding failed:', seedError.message);
    console.warn('  ⚠️  Tests will continue but may not have expected seed data');
    console.warn('     Some tests may fail due to missing test data\n');
  }
  
  // Verify environment (optional in E2E test mode since we mock services)
  const optionalEnvVars = [
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY', 
    'BREVO_API_KEY',
    'ADMIN_PASSWORD',
    'ADMIN_SECRET'
  ];
  
  const missing = optionalEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn('ℹ️  Info: Some services will run in mock mode due to missing environment variables:', missing.join(', '));
    console.warn('   This is expected for local E2E testing without external service credentials\n');
  } else {
    console.log('✅ All external service credentials available\n');
  }
  
  console.log('✨ E2E Global Setup Complete\n');
}

export default globalSetup;