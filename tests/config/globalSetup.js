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
  
  // Set test-specific configurations
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake_key';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_secret';
  process.env.SENDGRID_API_KEY = 'SG.fake_sendgrid_key';
  
  // Disable external services for testing
  process.env.DISABLE_EXTERNAL_APIS = 'true';
  process.env.MOCK_PAYMENTS = 'true';
  process.env.MOCK_EMAILS = 'true';

  // Skip database setup for fast tests
  if (process.env.FAST_TESTS === 'true' || process.env.SKIP_DB_TESTS === 'true') {
    console.log('⏭️  Skipping database setup for fast tests');
    console.log('✅ Test environment ready');
    return;
  }

  try {
    // Only setup database if we have a proper test database URL
    if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL.includes('_test')) {
      console.log('📊 Setting up test database...');
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      
      await execAsync('npm run db:migrate:reset -- --test');
      await execAsync('npm run db:migrate -- --test');
      console.log('✅ Test database setup complete');
      
      // Seed test data
      console.log('🌱 Seeding test data...');
      // Add any test data seeding here
    } else {
      console.log('⏭️  Skipping database setup (no TEST_DATABASE_URL configured)');
    }
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    console.log('⚠️  Database setup failed, continuing with mocked services only');
  }

  console.log('✅ Test environment ready');
}