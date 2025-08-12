/**
 * Test Environment Detector
 * 
 * Provides bulletproof test type detection with multiple validation layers
 * to ensure integration tests use real database clients and unit tests use mocks.
 * 
 * Key Features:
 * - Multi-layer detection strategy (file path, environment, config)
 * - Consensus-based decision making with fallback hierarchy
 * - Extensive edge case handling
 * - Performance optimized with caching
 * 
 * @author Principal Architect
 * @version 1.0.0 - Integration Test Architecture Fix
 */

import path from 'path';

export class TestEnvironmentDetector {
  constructor() {
    this.cache = new Map();
    this.debugMode = process.env.TEST_DEBUG === 'true';
  }

  /**
   * Detect test type using multi-layer strategy
   * @param {Object} testContext - Vitest test context
   * @returns {string} 'integration' | 'unit' | 'performance' | 'e2e'
   */
  detectTestType(testContext) {
    const cacheKey = this._generateCacheKey(testContext);
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Multi-layer detection strategy
    const detectionResults = [
      this.detectByFilePath(testContext),
      this.detectByEnvironment(),
      this.detectByConfig(testContext),
      this.detectByNaming(testContext)
    ];

    // Consensus-based decision with fallback hierarchy
    const testType = this.resolveTestType(detectionResults);
    
    this.cache.set(cacheKey, testType);
    
    if (this.debugMode) {
      console.log(`[TestEnvironmentDetector] ${this._getTestFilePath(testContext)}: ${testType}`, {
        detectionResults,
        consensus: testType
      });
    }
    
    return testType;
  }

  /**
   * Check if test is integration type
   */
  isIntegrationTest(testContext) {
    return this.detectTestType(testContext) === 'integration';
  }

  /**
   * Check if test is unit type
   */
  isUnitTest(testContext) {
    return this.detectTestType(testContext) === 'unit';
  }

  /**
   * Check if test is performance type
   */
  isPerformanceTest(testContext) {
    return this.detectTestType(testContext) === 'performance';
  }

  /**
   * Detect test type by file path analysis
   */
  detectByFilePath(testContext) {
    const filePath = this._getTestFilePath(testContext);
    
    if (!filePath || filePath === 'unknown') {
      return { type: 'unknown', confidence: 0, reason: 'No file path available' };
    }

    const normalizedPath = path.normalize(filePath).toLowerCase();
    
    // High confidence directory-based detection
    if (normalizedPath.includes('/integration/') || normalizedPath.includes('\\integration\\')) {
      return { type: 'integration', confidence: 0.95, reason: 'Integration directory' };
    }
    
    if (normalizedPath.includes('/unit/') || normalizedPath.includes('\\unit\\')) {
      return { type: 'unit', confidence: 0.95, reason: 'Unit directory' };
    }
    
    if (normalizedPath.includes('/performance/') || normalizedPath.includes('\\performance\\')) {
      return { type: 'performance', confidence: 0.95, reason: 'Performance directory' };
    }
    
    if (normalizedPath.includes('/e2e/') || normalizedPath.includes('\\e2e\\')) {
      return { type: 'e2e', confidence: 0.95, reason: 'E2E directory' };
    }

    // Medium confidence file name patterns
    const fileName = path.basename(filePath).toLowerCase();
    
    if (fileName.includes('integration')) {
      return { type: 'integration', confidence: 0.8, reason: 'Integration in filename' };
    }
    
    if (fileName.includes('unit')) {
      return { type: 'unit', confidence: 0.8, reason: 'Unit in filename' };
    }
    
    if (fileName.includes('performance') || fileName.includes('perf')) {
      return { type: 'performance', confidence: 0.8, reason: 'Performance in filename' };
    }

    // Low confidence heuristics
    if (normalizedPath.includes('database') || normalizedPath.includes('api') || normalizedPath.includes('service')) {
      return { type: 'integration', confidence: 0.4, reason: 'Database/API/Service pattern' };
    }

    return { type: 'unit', confidence: 0.3, reason: 'Default fallback' };
  }

  /**
   * Detect test type by environment variables
   */
  detectByEnvironment() {
    // Explicit test type override
    if (process.env.TEST_TYPE) {
      const testType = process.env.TEST_TYPE.toLowerCase();
      if (['integration', 'unit', 'performance', 'e2e'].includes(testType)) {
        return { type: testType, confidence: 1.0, reason: 'Explicit TEST_TYPE environment variable' };
      }
    }

    // Environment patterns that suggest integration testing
    const hasRealDbUrl = process.env.TURSO_DATABASE_URL && 
                        !process.env.TURSO_DATABASE_URL.includes(':memory:') &&
                        !process.env.TURSO_DATABASE_URL.includes('test.db');
    
    const hasRealServices = process.env.BREVO_API_KEY && 
                           !process.env.BREVO_API_KEY.includes('test') &&
                           !process.env.BREVO_API_KEY.includes('mock');

    if (hasRealDbUrl && hasRealServices) {
      return { type: 'integration', confidence: 0.7, reason: 'Real service environment detected' };
    }

    // Mock environment suggests unit testing
    const hasMockEnv = process.env.TURSO_DATABASE_URL === ':memory:' ||
                      (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.includes('test'));

    if (hasMockEnv) {
      return { type: 'unit', confidence: 0.6, reason: 'Mock environment detected' };
    }

    return { type: 'unknown', confidence: 0, reason: 'No clear environment indicators' };
  }

  /**
   * Detect test type by Vitest configuration
   */
  detectByConfig(testContext) {
    try {
      // Check if running in specific test mode
      if (process.env.VITEST_MODE) {
        const mode = process.env.VITEST_MODE.toLowerCase();
        if (['integration', 'unit', 'performance'].includes(mode)) {
          return { type: mode, confidence: 0.9, reason: 'Vitest mode configuration' };
        }
      }

      // Check test environment configuration
      if (testContext?.config?.environment === 'jsdom') {
        return { type: 'unit', confidence: 0.5, reason: 'JSDOM environment (typically unit tests)' };
      }

      if (testContext?.config?.environment === 'node') {
        return { type: 'integration', confidence: 0.5, reason: 'Node environment (typically integration tests)' };
      }

      return { type: 'unknown', confidence: 0, reason: 'No clear config indicators' };
    } catch (error) {
      return { type: 'unknown', confidence: 0, reason: 'Config detection error' };
    }
  }

  /**
   * Detect test type by test naming patterns
   */
  detectByNaming(testContext) {
    const testName = this._getTestName(testContext);
    const fileName = this._getTestFilePath(testContext);
    
    if (!testName && !fileName) {
      return { type: 'unknown', confidence: 0, reason: 'No naming information' };
    }

    const combinedText = `${testName} ${fileName}`.toLowerCase();

    // High confidence naming patterns
    const integrationPatterns = [
      'database operations',
      'api integration',
      'service integration',
      'end-to-end',
      'real database',
      'actual service'
    ];

    const unitPatterns = [
      'unit test',
      'mock',
      'stub',
      'isolated',
      'component test'
    ];

    const performancePatterns = [
      'performance',
      'load test',
      'benchmark',
      'stress test',
      'throughput'
    ];

    for (const pattern of integrationPatterns) {
      if (combinedText.includes(pattern)) {
        return { type: 'integration', confidence: 0.7, reason: `Integration pattern: ${pattern}` };
      }
    }

    for (const pattern of performancePatterns) {
      if (combinedText.includes(pattern)) {
        return { type: 'performance', confidence: 0.7, reason: `Performance pattern: ${pattern}` };
      }
    }

    for (const pattern of unitPatterns) {
      if (combinedText.includes(pattern)) {
        return { type: 'unit', confidence: 0.7, reason: `Unit pattern: ${pattern}` };
      }
    }

    return { type: 'unknown', confidence: 0, reason: 'No clear naming patterns' };
  }

  /**
   * Resolve test type from multiple detection results using consensus
   */
  resolveTestType(detectionResults) {
    // Filter out unknown results
    const validResults = detectionResults.filter(result => result.type !== 'unknown');
    
    if (validResults.length === 0) {
      return 'unit'; // Safe default
    }

    // Calculate weighted scores for each type
    const scores = {};
    
    for (const result of validResults) {
      if (!scores[result.type]) {
        scores[result.type] = 0;
      }
      scores[result.type] += result.confidence;
    }

    // Find the type with highest score
    const sortedTypes = Object.entries(scores)
      .sort(([,a], [,b]) => b - a);

    const [winningType, winningScore] = sortedTypes[0];
    
    // Require minimum confidence threshold
    if (winningScore < 0.4) {
      return 'unit'; // Safe default for low confidence
    }

    // Check for ties and resolve using hierarchy
    if (sortedTypes.length > 1) {
      const [, secondScore] = sortedTypes[1];
      
      if (Math.abs(winningScore - secondScore) < 0.1) {
        // Tie - use hierarchy: integration > performance > unit > e2e
        const hierarchy = ['integration', 'performance', 'unit', 'e2e'];
        
        for (const type of hierarchy) {
          if (scores[type] && scores[type] >= winningScore - 0.1) {
            return type;
          }
        }
      }
    }

    return winningType;
  }

  /**
   * Generate cache key for test context
   */
  _generateCacheKey(testContext) {
    const filePath = this._getTestFilePath(testContext);
    const testName = this._getTestName(testContext);
    const envVars = `${process.env.TEST_TYPE}-${process.env.VITEST_MODE}`;
    
    return `${filePath}:${testName}:${envVars}`;
  }

  /**
   * Extract test file path from context
   */
  _getTestFilePath(testContext) {
    try {
      return testContext?.file?.filepath || 
             testContext?.file?.name || 
             testContext?.filepath ||
             testContext?.meta?.file ||
             process.env.VITEST_TEST_FILE ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Extract test name from context
   */
  _getTestName(testContext) {
    try {
      return testContext?.name || 
             testContext?.task?.name || 
             testContext?.suite?.name ||
             testContext?.fullName ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Clear cache (for testing purposes)
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Enable debug mode
   */
  enableDebug() {
    this.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
  }
}

// Export singleton instance
export const testEnvironmentDetector = new TestEnvironmentDetector();

// Export convenience functions
export function detectTestType(testContext) {
  return testEnvironmentDetector.detectTestType(testContext);
}

export function isIntegrationTest(testContext) {
  return testEnvironmentDetector.isIntegrationTest(testContext);
}

export function isUnitTest(testContext) {
  return testEnvironmentDetector.isUnitTest(testContext);
}

export function isPerformanceTest(testContext) {
  return testEnvironmentDetector.isPerformanceTest(testContext);
}

// Export for testing and debugging
export default TestEnvironmentDetector;