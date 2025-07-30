/**
 * Global test teardown - runs once after all tests
 * Cleans up test database and external connections
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...');

  try {
    // Clean up test database
    if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL?.includes('_test')) {
      console.log('🗑️ Cleaning test database...');
      await execAsync('npm run db:migrate:reset -- --test');
      console.log('✅ Test database cleaned');
    }
    
    // Close any remaining connections
    // Add cleanup for any persistent connections here
    
  } catch (error) {
    console.error('❌ Global teardown error:', error);
    // Don't fail the test suite on teardown errors
  }

  console.log('✅ Test environment cleanup complete');
}