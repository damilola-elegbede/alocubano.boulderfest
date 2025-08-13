/**
 * Placeholder test file for CI when all performance tests are skipped
 * This prevents "No test files found" errors in CI environments
 */

import { describe, it, expect } from 'vitest';

describe('Performance CI Placeholder', () => {
  it('should pass when all performance tests are skipped in CI', () => {
    // This test always passes to prevent CI failures when performance tests are disabled
    expect(true).toBe(true);
  });
});