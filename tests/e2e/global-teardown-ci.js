/**
 * Global Teardown for E2E Tests - CI Environment
 * 
 * Handles:
 * - Resource cleanup after test execution
 * - Port cleanup to prevent conflicts
 * - Database cleanup for isolated environments
 * - CI-specific cleanup tasks
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(process.cwd());

async function globalTeardown() {
  console.log('🧹 Global E2E Teardown - CI Environment');
  console.log('========================================');
  
  const port = process.env.PORT || process.env.DYNAMIC_PORT || '3000';
  const databaseFile = process.env.DATABASE_URL || `./data/e2e-ci-test.db`;
  const suite = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  
  console.log(`📡 Port: ${port}`);
  console.log(`🗄️ Database: ${databaseFile}`);
  console.log(`🎭 Suite: ${suite}`);
  
  try {
    // Clean up any remaining processes on the port
    console.log('🔌 Cleaning up port resources...');
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        stdio: 'pipe',
        shell: true
      });
      console.log(`✅ Port ${port} cleanup completed`);
    } catch (portError) {
      console.log(`ℹ️ No processes found on port ${port} (expected)`);
    }
    
    // Clean up Vercel dev processes
    console.log('🔧 Cleaning up Vercel dev processes...');
    try {
      execSync(`pkill -f "vercel dev.*--listen ${port}" || true`, {
        stdio: 'pipe',
        shell: true
      });
      execSync(`pkill -f "next-server.*${port}" || true`, {
        stdio: 'pipe',
        shell: true
      });
      console.log('✅ Vercel dev processes cleanup completed');
    } catch (processError) {
      console.log('ℹ️ No Vercel dev processes found (expected)');
    }
    
    // Clean up isolated test database if it exists
    const cleanupDatabase = process.env.CLEANUP_TEST_DATABASE !== 'false';
    if (cleanupDatabase && databaseFile.includes('e2e-ci-test')) {
      console.log('🗄️ Cleaning up isolated test database...');
      const dbPath = databaseFile.startsWith('./') 
        ? resolve(PROJECT_ROOT, databaseFile.slice(2))
        : databaseFile;
      
      if (existsSync(dbPath)) {
        try {
          unlinkSync(dbPath);
          console.log(`✅ Removed test database: ${databaseFile}`);
        } catch (dbError) {
          console.warn(`⚠️ Could not remove test database: ${dbError.message}`);
        }
      } else {
        console.log('ℹ️ Test database file not found (may have been cleaned already)');
      }
    } else {
      console.log('ℹ️ Skipping database cleanup (disabled or not test database)');
    }
    
    // Clean up any temporary test files
    console.log('📁 Cleaning up temporary test files...');
    try {
      execSync('find ./data -name "*.tmp" -delete 2>/dev/null || true', {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        shell: true
      });
      console.log('✅ Temporary files cleanup completed');
    } catch (tempError) {
      console.log('ℹ️ No temporary files found (expected)');
    }
    
    // Display cleanup summary
    console.log('');
    console.log('📊 Teardown Summary:');
    console.log(`   Port cleaned: ${port}`);
    console.log(`   Database: ${cleanupDatabase ? 'Cleaned' : 'Preserved'}`);
    console.log(`   Suite: ${suite}`);
    console.log(`   CI Mode: ${process.env.CI ? 'Yes' : 'No'}`);
    console.log('');
    
    console.log('✅ Global teardown completed successfully');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Global teardown encountered an error:', error.message);
    console.error('   This may not prevent test completion, but resources may not be fully cleaned');
    console.error('Stack trace:', error.stack);
    
    // Don't throw error in teardown to avoid masking test failures
    console.log('⚠️ Continuing despite teardown errors...');
  }
}

export default globalTeardown;