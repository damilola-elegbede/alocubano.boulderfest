import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Configurable timeouts via environment variables for CI/CD flexibility
    testTimeout: Number(process.env.VITEST_TEST_TIMEOUT || (process.env.CI === 'true' ? 60000 : 30000)), // Configurable test timeout
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT || (process.env.CI === 'true' ? 15000 : 10000)), // Configurable hook timeout
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