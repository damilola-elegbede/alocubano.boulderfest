/**
 * Playwright Global Teardown
 * Cleans up test environment after all E2E tests
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs/promises';

const execAsync = promisify(exec);

async function globalTeardown(config) {
  console.log('🧹 Cleaning up E2E test environment...');

  try {
    // Clean test database
    if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL?.includes('_test')) {
      console.log('🗑️ Cleaning test database...');
      await execAsync('npm run db:migrate:reset -- --test');
    }
    
    // Remove authentication state file
    try {
      await unlink('tests/e2e/setup/auth.json');
      console.log('🔐 Removed test authentication state');
    } catch (error) {
      // File might not exist, that's ok
    }
    
    // Clear any test artifacts
    console.log('🗂️ Clearing test artifacts...');
    
    console.log('✅ E2E test environment cleanup complete');
    
  } catch (error) {
    console.error('❌ E2E teardown error:', error);
    // Don't fail the test suite on teardown errors
  }
}

export default globalTeardown;