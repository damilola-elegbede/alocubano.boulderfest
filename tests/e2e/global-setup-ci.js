/**
 * Global setup for E2E tests in CI environment
 * Uses SQLite database instead of Turso for faster, more reliable CI testing
 * Optimized for GitHub Actions with minimal external dependencies
 */

import { config } from 'dotenv';
import { promises as fs } from 'fs';

async function globalSetup() {
  console.log('\n🚀 E2E Global Setup Starting (CI Environment - SQLite)...\n');
  
  // Load environment variables
  config({ path: '.env.local' });
  
  // Set E2E test mode for CI compatibility
  process.env.E2E_TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE_RESET_ALLOWED = 'true';
  
  // Use SQLite for CI testing (faster and more reliable than external database)
  if (process.env.CI) {
    process.env.DATABASE_URL = 'file:./data/e2e-test.db';
    // Don't require Turso credentials in CI
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
  }
  
  console.log('✅ CI E2E Test Mode enabled with SQLite database');
  
  // Skip complex database setup for CI - use mock server instead
  console.log('📦 Database setup skipped for CI - using mock server...');
  
  // Ensure data directory exists
  await fs.mkdir('./data', { recursive: true });
  
  console.log('✅ SQLite database directory ready\n');
  
  // Set default test admin credentials for CI
  if (!process.env.TEST_ADMIN_PASSWORD) {
    process.env.TEST_ADMIN_PASSWORD = 'test-admin-password';
  }
  if (!process.env.ADMIN_SECRET) {
    process.env.ADMIN_SECRET = 'test-admin-secret-key-minimum-32-characters';
  }
  
  // Log service configuration for CI debugging
  console.log('📋 CI Service Configuration:');
  console.log('  🔐 Admin authentication: Mock credentials set');
  console.log('  📧 Email service: Mock mode (no external API calls)');
  console.log('  💳 Payment service: Mock mode (no Stripe calls)');
  console.log('  🗄️  Database: SQLite (CI-optimized)');
  console.log('  🌐 External services: Mocked for reliability\n');
  
  console.log('✨ CI E2E Global Setup Complete\n');
}

export default globalSetup;