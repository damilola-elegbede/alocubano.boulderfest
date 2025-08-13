import { defineConfig } from 'vitest/config';

// This will become the ONLY config in PR #7
// Simple, clean, no environment detection or CI branching
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup-simplified.js'],
    testTimeout: 5000,
    hookTimeout: 5000,
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**', '**/node_modules/**'],
    // No environment detection, no CI branching
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});