/**
 * Simple Vitest Configuration - No Complexity
 * Minimal configuration that just works.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000, // Increased timeout to allow for server startup
    setupFiles: ['./tests/setup.js'],
    globalSetup: './tests/global-setup.js', // Add global setup for server management
    globals: true,
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/e2e/**'],
    // Allow sequential execution to avoid port conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});