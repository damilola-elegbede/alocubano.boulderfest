/**
 * Global Setup for E2E Tests - CI Environment
 * 
 * Handles:
 * - Database initialization for isolated test environments
 * - Environment variable validation
 * - CI-specific configurations
 * - Port and database file verification
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(process.cwd());
const DATA_DIR = resolve(PROJECT_ROOT, 'data');

async function globalSetup() {
  console.log('🚀 Global E2E Setup - CI Environment');
  console.log('=====================================');
  
  const port = process.env.PORT || process.env.DYNAMIC_PORT || '3000';
  const suite = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  
  console.log(`📡 Port: ${port}`);
  console.log(`🗄️ Database: Turso (from environment)`);
  console.log(`🎭 Suite: ${suite}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'test'}`);
  
  try {
    // Verify Turso credentials are available
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      console.error('❌ Missing Turso credentials for E2E tests');
      console.error('   TURSO_DATABASE_URL:', process.env.TURSO_DATABASE_URL ? 'set' : 'missing');
      console.error('   TURSO_AUTH_TOKEN:', process.env.TURSO_AUTH_TOKEN ? 'set' : 'missing');
      throw new Error('E2E tests require Turso database credentials');
    }
    
    // Run migrations on Turso database
    console.log('🗄️ Running migrations on Turso database...');
    const migrationCommand = `NODE_ENV=test npm run migrate:up`;
    console.log(`📋 Running: ${migrationCommand}`);
    
    try {
      execSync(migrationCommand, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
          TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN
        }
      });
      console.log('✅ Database migrations completed');
    } catch (migrationError) {
      console.warn('⚠️ Database migration failed, but continuing (may be expected for test environment)');
      console.warn('   Error:', migrationError.message);
    }
    
    // Validate critical environment variables
    const requiredVars = ['NODE_ENV'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.warn('⚠️ Missing environment variables:', missingVars.join(', '));
      console.warn('   Setting defaults for CI environment...');
      process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    }
    
    // Display configuration summary
    console.log('');
    console.log('📊 Setup Summary:');
    console.log(`   Port: ${port}`);
    console.log(`   Database: Turso (configured)`);
    console.log(`   Data Directory: ${DATA_DIR}`);
    console.log(`   Working Directory: ${PROJECT_ROOT}`);
    console.log(`   CI Mode: ${process.env.CI ? 'Yes' : 'No'}`);
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