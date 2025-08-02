import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default environment is jsdom for browser-based tests
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup-vitest.js'],
    globalTeardown: './tests/global-teardown.js',
    
    // Test file patterns
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js'
    ],
    exclude: [
      'tests/e2e/**/*.test.js', // Exclude E2E tests (need Playwright)
      'node_modules/**'
    ],
    
    // Memory-conscious performance settings
    threads: true,
    maxConcurrency: 2, // Reduced from 8 to prevent memory exhaustion
    minThreads: 1,
    maxThreads: 2,
    testTimeout: 10000,
    
    // Pool options for memory management
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 2,
        minThreads: 1,
        isolate: true
      }
    },
    
    // Enhanced cleanup options
    clearMocks: true,
    restoreMocks: true,
    
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