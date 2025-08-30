import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: process.env.CI === 'true' ? 60000 : 30000, // 60s for CI, 30s for local
    hookTimeout: process.env.CI === 'true' ? 15000 : 10000, // 15s for CI, 10s for local
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
    },
    // CI-specific configurations
    maxConcurrency: process.env.CI === 'true' ? 1 : 5, // Single test at a time in CI
    // Retry failed tests in CI
    retry: process.env.CI === 'true' ? 1 : 0,
    // Better error reporting
    reporter: process.env.CI === 'true' ? ['verbose', 'junit'] : 'verbose',
    outputFile: process.env.CI === 'true' ? './test-results.xml' : undefined
  }
});