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
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      enabled: process.env.COVERAGE === 'true',
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['api/**/*.js'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '.github/**',
        'scripts/**',
        'coverage/**',
        'playwright.config.js',
        'vercel.json'
      ],
      thresholds: {
        global: {
          branches: 50,
          functions: 50,
          lines: 60,
          statements: 60
        }
      }
    }
  }
});