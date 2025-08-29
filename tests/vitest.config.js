import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 45000, // Increased from 30s for resource-constrained environments
    setupFiles: ['./tests/setup.js'],
    globals: true,
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/e2e/**'],
    // Memory optimization settings
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true // Use single process to avoid memory issues
      }
    }
  }
});