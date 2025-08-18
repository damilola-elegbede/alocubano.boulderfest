/**
 * Simple Vitest Configuration - No Complexity
 * Minimal configuration that just works.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10000,
    setupFiles: ['./tests/setup.js'],
    globals: true,
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**']
  }
});