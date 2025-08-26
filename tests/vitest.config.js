import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    setupFiles: ['./tests/setup.js'],
    globalSetup: './tests/global-setup.js',
    globals: true,
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/e2e/**'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
});