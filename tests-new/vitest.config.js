import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 10000,
    maxConcurrency: 2,
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 2,
        minThreads: 1
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests-new/']
    },
    setupFiles: [],
    include: ['tests-new/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/**'],
    // Support for test sharding
    shard: process.env.VITEST_SHARD ? {
      index: parseInt(process.env.VITEST_SHARD_INDEX) || 1,
      count: parseInt(process.env.VITEST_SHARD_COUNT) || 1
    } : undefined
  },
  resolve: {
    alias: {
      '@': '/api',
      '@lib': '/api/lib'
    }
  }
});