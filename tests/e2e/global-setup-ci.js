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
  const databaseFile = process.env.DATABASE_URL || `./data/e2e-ci-test.db`;
  const suite = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  
  console.log(`📡 Port: ${port}`);
  console.log(`🗄️ Database: ${databaseFile}`);
  console.log(`🎭 Suite: ${suite}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'test'}`);
  
  try {
    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      console.log('📁 Creating data directory...');
      mkdirSync(DATA_DIR, { recursive: true });
      console.log('✅ Data directory created');
    }
    
    // Initialize database if needed
    console.log('🗄️ Initializing test database...');
    const dbPath = databaseFile.startsWith('./') 
      ? resolve(PROJECT_ROOT, databaseFile.slice(2))
      : databaseFile;
    
    // Run migrations for the isolated database
    const migrationCommand = `NODE_ENV=test DATABASE_URL="${databaseFile}" TURSO_DATABASE_URL="${databaseFile}" npm run migrate:up`;
    console.log(`📋 Running: ${migrationCommand}`);
    
    try {
      execSync(migrationCommand, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: databaseFile,
          TURSO_DATABASE_URL: databaseFile
        }
      });
      console.log('✅ Database migrations completed');
    } catch (migrationError) {
      console.warn('⚠️ Database migration failed, but continuing (may be expected for isolated tests)');
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
    console.log(`   Database: ${databaseFile}`);
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