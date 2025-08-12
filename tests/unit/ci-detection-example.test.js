/**
 * Example Test File Demonstrating CI Detection Usage
 * Shows how to use the centralized CI detection utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import ciDetection from '../utils/ci-detection.js';

describe('CI Detection Usage Examples', () => {
  beforeEach(() => {
    // Reset environment for each test
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.NODE_ENV;
  });

  describe('Basic CI Detection', () => {
    it('should detect CI environment correctly', () => {
      // Simulate CI environment
      process.env.CI = 'true';
      
      expect(ciDetection.isCI()).toBe(true);
      expect(ciDetection.isAutomatedEnvironment()).toBe(true);
    });

    it('should detect local environment correctly', () => {
      expect(ciDetection.isCI()).toBe(false);
      expect(ciDetection.isAutomatedEnvironment()).toBe(false);
    });

    it('should detect GitHub Actions specifically', () => {
      process.env.GITHUB_ACTIONS = 'true';
      
      expect(ciDetection.isGitHubActions()).toBe(true);
      expect(ciDetection.isAutomatedEnvironment()).toBe(true);
    });
  });

  describe('CI-Aware Configuration', () => {
    it('should provide appropriate timeout multipliers', () => {
      // Local environment
      expect(ciDetection.getCITimeoutMultiplier()).toBe(1);
      
      // CI environment
      process.env.CI = 'true';
      expect(ciDetection.getCITimeoutMultiplier()).toBe(2);
      expect(ciDetection.getCITimeoutMultiplier(3)).toBe(3);
    });

    it('should reduce iteration counts in CI', () => {
      const localIterations = 100;
      
      // Local environment
      expect(ciDetection.getCIIterationCount(localIterations)).toBe(100);
      
      // CI environment
      process.env.CI = 'true';
      expect(ciDetection.getCIIterationCount(localIterations)).toBe(50);
      expect(ciDetection.getCIIterationCount(localIterations, 0.3)).toBe(30);
    });

    it('should reduce concurrency in CI', () => {
      const localConcurrency = 8;
      
      // Local environment
      expect(ciDetection.getCIConcurrency(localConcurrency)).toBe(8);
      
      // CI environment
      process.env.CI = 'true';
      expect(ciDetection.getCIConcurrency(localConcurrency)).toBe(4);
    });
  });

  describe('Memory and Test Configuration', () => {
    it('should provide memory configuration', () => {
      const memoryConfig = ciDetection.getMemoryConfig();
      
      expect(memoryConfig).toHaveProperty('isCI');
      expect(memoryConfig).toHaveProperty('maxOldSpaceSize');
      expect(memoryConfig).toHaveProperty('maxConcurrency');
      expect(memoryConfig).toHaveProperty('poolOptions');
      
      // CI should have more restrictive memory settings
      process.env.CI = 'true';
      const ciMemoryConfig = ciDetection.getMemoryConfig();
      expect(ciMemoryConfig.maxOldSpaceSize).toBe('1024');
      expect(ciMemoryConfig.maxConcurrency).toBe(2);
    });

    it('should provide comprehensive test configuration', () => {
      process.env.CI = 'true';
      
      const testConfig = ciDetection.getTestConfig();
      
      expect(testConfig.ci).toBe(true);
      expect(testConfig.timeouts.test).toBe(30000);
      expect(testConfig.timeouts.hook).toBe(15000);
      expect(testConfig.retries).toBe(2);
      expect(testConfig.bail).toBe(5);
    });
  });

  describe('Test Exclusion Logic', () => {
    it('should skip performance tests in CI when configured', () => {
      process.env.CI = 'true';
      process.env.SKIP_PERFORMANCE_INTENSIVE_TESTS = 'true';
      
      expect(ciDetection.shouldSkipPerformanceTests()).toBe(true);
    });

    it('should skip external tests in CI when configured', () => {
      process.env.CI = 'true';
      process.env.TEST_CI_EXCLUDE_PATTERNS = 'true';
      
      expect(ciDetection.shouldSkipExternalTests()).toBe(true);
      
      const excludePatterns = ciDetection.getCIExcludePatterns();
      expect(excludePatterns).toContain('**/external-integration/**');
      expect(excludePatterns).toContain('**/*.load.test.js');
    });
  });
});

// Example usage in a real test file
describe('Example Usage in Real Tests', () => {
  it('should demonstrate timeout adjustment', async () => {
    const config = ciDetection.getTestConfig();
    const timeout = config.timeouts.test;
    
    // Use CI-appropriate timeout
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(timeout).toBeGreaterThan(0);
  }, ciDetection.getTestConfig().timeouts.test);

  it.skipIf(ciDetection.shouldSkipPerformanceTests())('performance test example', () => {
    // This test will be skipped in CI when SKIP_PERFORMANCE_INTENSIVE_TESTS=true
    const iterations = ciDetection.getCIIterationCount(1000);
    expect(iterations).toBeGreaterThan(0);
  });

  it('should use CI-appropriate concurrency', async () => {
    const concurrency = ciDetection.getCIConcurrency(10);
    const promises = Array.from({ length: concurrency }, (_, i) => 
      Promise.resolve(i)
    );
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(concurrency);
  });
});