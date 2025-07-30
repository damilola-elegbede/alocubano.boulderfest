/**
 * Global test setup - runs once before all tests
 * Sets up test database, environment variables, and external service mocks
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

export default async function globalSetup() {
  console.log('🔧 Setting up test environment...');

  // Load test environment variables
  dotenv.config({ path: '.env.test' });

  // Set Node environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost/alocubano_test';
  
  // Set test-specific configurations
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake_key';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_secret';
  process.env.SENDGRID_API_KEY = 'SG.fake_sendgrid_key';
  
  // Disable external services for testing
  process.env.DISABLE_EXTERNAL_APIS = 'true';
  process.env.MOCK_PAYMENTS = 'true';
  process.env.MOCK_EMAILS = 'true';

  try {
    // Setup test database (skip if no database configured)
    if (process.env.SKIP_DB_TESTS !== 'true' && process.env.DATABASE_URL) {
      console.log('📊 Setting up test database...');
      
      // Drop and recreate test database (be careful - only in test!)
      if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL.includes('_test')) {
        await execAsync('npm run db:migrate:reset -- --test');
        await execAsync('npm run db:migrate -- --test');
        console.log('✅ Test database setup complete');
      }
      
      // Seed test data
      console.log('🌱 Seeding test data...');
      // Add any test data seeding here
    } else {
      console.log('⏭️  Skipping database setup (SKIP_DB_TESTS=true or no DATABASE_URL)');
    }
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    // Don't exit if we're skipping DB tests and it's a DB-related error
    if (process.env.SKIP_DB_TESTS === 'true' && error.message.includes('database')) {
      console.log('⚠️  Database error ignored due to SKIP_DB_TESTS=true');
    } else {
      process.exit(1);
    }
  }

  console.log('✅ Test environment ready');
}