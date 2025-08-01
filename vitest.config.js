import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default environment is jsdom for browser-based tests
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup-vitest.js'],
    
    // Test file patterns
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js'
    ],
    exclude: [
      'tests/e2e/**/*.test.js', // Exclude E2E tests (need Playwright)
      'node_modules/**'
    ],
    
    // Performance optimizations
    threads: true,
    maxConcurrency: 8,
    testTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.js',
        'scripts/',
        'public/',
        'css/',
        'images/'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    
    // Reporter configuration
    reporter: ['verbose']
  }
});