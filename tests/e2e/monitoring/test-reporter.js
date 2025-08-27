/**
 * Playwright Test Reporter Integration for Flakiness Detection
 * 
 * This reporter integrates with the FlakinessDetector to automatically
 * monitor test executions and collect reliability data
 */

import { getFlakinessDetector } from './flakiness-detector.js';

/**
 * Custom Playwright reporter that integrates with flakiness detection
 */
class FlakinessReporter {
  constructor(options = {}) {
    this.options = {
      enableEnvironmentValidation: options.enableEnvironmentValidation ?? true,
      generateDashboard: options.generateDashboard ?? true,
      cleanupInterval: options.cleanupInterval ?? 24 * 60 * 60 * 1000, // 24 hours
      ...options
    };
    
    this.detector = getFlakinessDetector();
    this.testResults = new Map();
    this.lastCleanup = Date.now();
  }

  /**
   * Called when test run begins
   */
  async onBegin(config, suite) {
    console.log('\n🔍 Flakiness Detection and Reliability Monitoring Active\n');
    
    // Validate environment consistency if enabled
    if (this.options.enableEnvironmentValidation) {
      try {
        const envCheck = await this.detector.validateEnvironmentConsistency();
        if (!envCheck.consistent) {
          console.warn('⚠️  Environment inconsistencies detected - monitoring may be affected');
        }
      } catch (error) {
        console.warn('⚠️  Environment validation failed:', error.message);
      }
    }

    // Cleanup old data if needed
    if (Date.now() - this.lastCleanup > this.options.cleanupInterval) {
      await this.detector.cleanupOldData();
      this.lastCleanup = Date.now();
    }
  }

  /**
   * Called when a test begins
   */
  async onTestBegin(test, result) {
    const testKey = this.getTestKey(test);
    const executionId = `${testKey}::${Date.now()}::${Math.random().toString(36).substr(2, 9)}`;
    
    // Track concurrent execution
    await this.detector.trackConcurrentExecution(testKey, executionId);
    
    // Store execution info for later use
    this.testResults.set(test.id, {
      testKey,
      executionId,
      startTime: Date.now(),
      test,
      result
    });
  }

  /**
   * Called when a test ends
   */
  async onTestEnd(test, result) {
    const testInfo = this.testResults.get(test.id);
    if (!testInfo) return;

    const { testKey, executionId } = testInfo;
    
    try {
      // Create test execution record
      const testExecution = {
        file: test.location.file,
        title: test.title,
        project: test.parent?.project || { name: 'unknown' },
        workerIndex: result.workerIndex,
        parallelIndex: result.parallelIndex
      };

      const executionResult = {
        status: result.status,
        duration: result.duration,
        retry: result.retry,
        startTime: testInfo.startTime,
        error: result.error ? {
          message: result.error.message,
          stack: result.error.stack,
          location: result.error.location
        } : null
      };

      // Record the test execution
      await this.detector.recordTestExecution(testExecution, executionResult);
      
      // Complete concurrent execution tracking
      await this.detector.completeConcurrentExecution(executionId, {
        status: result.status,
        duration: result.duration
      });

      // Clean up
      this.testResults.delete(test.id);
      
    } catch (error) {
      console.error('❌ Failed to record test execution:', error);
    }
  }

  /**
   * Called when test run ends
   */
  async onEnd(result) {
    console.log('\n📊 Generating stability metrics...');
    
    try {
      if (this.options.generateDashboard) {
        const dashboard = await this.detector.generateStabilityMetrics();
        if (dashboard) {
          console.log(`✅ Stability dashboard generated with ${dashboard.summary.totalTests} tests monitored`);
          
          // Print summary
          if (dashboard.summary.flakyTests > 0) {
            console.warn(`🔄 ${dashboard.summary.flakyTests} flaky tests detected`);
          }
          
          if (dashboard.summary.performanceRegressions > 0) {
            console.warn(`📈 ${dashboard.summary.performanceRegressions} performance regressions detected`);
          }
          
          if (dashboard.recommendations.length > 0) {
            console.log(`💡 ${dashboard.recommendations.length} recommendations available`);
            
            // Show high priority recommendations
            const highPriorityRecs = dashboard.recommendations.filter(r => r.priority === 'high');
            if (highPriorityRecs.length > 0) {
              console.warn('\n⚠️  High Priority Recommendations:');
              highPriorityRecs.forEach(rec => {
                console.warn(`   ${rec.test}: ${rec.issue}`);
                console.warn(`   Action: ${rec.action}`);
              });
            }
          }

          console.log(`\n📈 Overall reliability: ${(dashboard.summary.overallReliability * 100).toFixed(1)}%`);
        }
      }
      
      console.log('\n🔍 Flakiness monitoring complete\n');
      
    } catch (error) {
      console.error('❌ Failed to generate final metrics:', error);
    }
  }

  /**
   * Get standardized test key
   */
  getTestKey(test) {
    return `${test.location.file}::${test.title}`;
  }
}

/**
 * Export reporter for Playwright configuration
 */
export default FlakinessReporter;