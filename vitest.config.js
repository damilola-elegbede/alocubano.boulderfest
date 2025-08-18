/**
 * Vitest Configuration - Post-Migration Stub
 * 
 * The test framework has been migrated to tests-new/ directory.
 * This configuration provides basic functionality for compatibility.
 * 
 * For full integration testing, use:
 *   npm run test:integration (when configured)
 * 
 * Current status: The Great Deletion completed - old test infrastructure removed.
 * New test framework available in tests-new/ directory.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Basic stub configuration
    environment: 'jsdom',
    globals: true,
    testTimeout: 5000,
    
    // No tests included by default - prevents accidental runs
    include: [
      // Intentionally empty - use tests-new framework for actual testing
    ],
    exclude: [
      'node_modules/**',
      'tests-new/**', // Exclude integration tests that require special setup
      '**/*.config.js'
    ],
    
    // Minimal reporters
    reporters: ['verbose'],
    
    // Environment setup
    env: {
      NODE_ENV: 'test',
      TEST_TYPE: 'stub'
    }
  }
});