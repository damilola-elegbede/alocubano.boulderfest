/**
 * Comprehensive Test Flakiness Detection and Reliability System
 *
 * Provides statistical analysis, retry logic, performance tracking,
 * and environment consistency validation for E2E tests
 *
 * Features:
 * - Statistical flaky test detection (<5% failure rate threshold)
 * - Exponential backoff retry strategies
 * - Performance regression detection (>20% increase)
 * - Stability metrics dashboard generation
 * - Deterministic test execution validation
 * - Environment consistency checks
 * - Historical trend analysis
 * - Concurrent test execution tracking
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../../..');

// Configuration constants
const CONFIG = {
  FLAKINESS_THRESHOLD: 0.05, // 5% failure rate threshold
  PERFORMANCE_REGRESSION_THRESHOLD: 0.20, // 20% increase threshold
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 1000, // Base delay for exponential backoff
  RETRY_MAX_DELAY: 30000, // Maximum retry delay
  DATA_RETENTION_DAYS: 30,
  CONCURRENT_EXECUTION_LIMIT: 10,
  STABILITY_SAMPLE_SIZE: 10, // Minimum runs for stability analysis
  ENVIRONMENT_CHECK_TIMEOUT: 5000,
  PERFORMANCE_HISTORY_SIZE: 100,
  // Resource monitoring optimization
  RESOURCE_MONITORING_INTERVAL: process.env.CI === 'true' ? 10000 : 5000, // 10s in CI, 5s locally
  RESOURCE_MONITORING_ENABLED: process.env.NODE_ENV !== 'test', // Disable in unit tests
};

/**
 * Flakiness Detection and Reliability Monitor
 */
class FlakinessDetector {
  constructor() {
    this.dataDir = path.join(projectRoot, '.tmp/e2e-monitoring');
    this.historicalDataFile = path.join(this.dataDir, 'test-history.json');
    this.metricsFile = path.join(this.dataDir, 'stability-metrics.json');
    this.environmentFile = path.join(this.dataDir, 'environment-snapshots.json');
    this.concurrentExecutions = new Map();
    this.performanceBaselines = new Map();
    this.retryStrategies = new Map();

    // Resource monitoring state
    this.resourceMonitoringInterval = null;
    this.isResourceMonitoringActive = false;
    this.resourceData = {
      cpu: [],
      memory: [],
      timestamps: []
    };

    this.initializeDataDirectory();
  }

  /**
   * Initialize monitoring data directory
   */
  async initializeDataDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });

      // Initialize data files if they don't exist
      const files = [
        { path: this.historicalDataFile, data: { tests: {}, metadata: { created: Date.now(), version: '1.0' } } },
        { path: this.metricsFile, data: { stability: {}, performance: {}, flakiness: {} } },
        { path: this.environmentFile, data: { snapshots: [], baselines: {} } }
      ];

      for (const { path: filePath, data } of files) {
        try {
          await fs.access(filePath);
        } catch {
          await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        }
      }
    } catch (error) {
      console.warn('⚠️  Failed to initialize monitoring directory:', error.message);
    }
  }

  /**
   * Record test execution result with comprehensive metrics
   */
  async recordTestExecution(testInfo, result) {
    const timestamp = Date.now();
    const testKey = `${testInfo.file}::${testInfo.title}`;

    try {
      const execution = {
        timestamp,
        testKey,
        file: testInfo.file,
        title: testInfo.title,
        project: testInfo.project?.name || 'unknown',
        browser: testInfo.project?.use?.browserName || 'unknown',
        status: result.status,
        duration: result.duration,
        retries: result.retry || 0,
        workerIndex: testInfo.workerIndex,
        parallelIndex: testInfo.parallelIndex,
        error: result.error ? {
          message: result.error.message,
          stack: result.error.stack?.substring(0, 1000), // Truncate stack trace
          location: result.error.location
        } : null,
        environment: await this.captureEnvironmentSnapshot(),
        performance: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          timing: {
            start: result.startTime || timestamp - result.duration,
            end: timestamp,
            duration: result.duration
          }
        }
      };

      // Load historical data
      const history = await this.loadHistoricalData();

      if (!history.tests[testKey]) {
        history.tests[testKey] = {
          executions: [],
          statistics: this.initializeTestStatistics(),
          baselines: {}
        };
      }

      // Add execution and maintain history size
      history.tests[testKey].executions.unshift(execution);
      if (history.tests[testKey].executions.length > CONFIG.PERFORMANCE_HISTORY_SIZE) {
        history.tests[testKey].executions = history.tests[testKey].executions.slice(0, CONFIG.PERFORMANCE_HISTORY_SIZE);
      }

      // Update statistics
      await this.updateTestStatistics(testKey, history.tests[testKey]);

      // Save updated history
      await this.saveHistoricalData(history);

      // Analyze flakiness and performance
      await this.analyzeTestReliability(testKey, history.tests[testKey]);

      return execution;
    } catch (error) {
      console.error('❌ Failed to record test execution:', error);
      return null;
    }
  }

  /**
   * Initialize statistics structure for a new test
   */
  initializeTestStatistics() {
    return {
      totalRuns: 0,
      successCount: 0,
      failureCount: 0,
      flakyCount: 0,
      retryCount: 0,
      averageDuration: 0,
      medianDuration: 0,
      standardDeviation: 0,
      reliabilityScore: 1.0,
      performanceScore: 1.0,
      lastUpdated: Date.now()
    };
  }

  /**
   * Update test statistics with new execution data
   */
  async updateTestStatistics(testKey, testData) {
    const { executions, statistics } = testData;
    const recent = executions.slice(0, Math.min(50, executions.length)); // Last 50 executions

    // Basic counts
    statistics.totalRuns = recent.length;
    statistics.successCount = recent.filter(e => e.status === 'passed').length;
    statistics.failureCount = recent.filter(e => e.status === 'failed').length;
    statistics.flakyCount = recent.filter(e => e.retries > 0).length;
    statistics.retryCount = recent.reduce((sum, e) => sum + e.retries, 0);

    // Duration statistics
    const durations = recent.map(e => e.duration).sort((a, b) => a - b);
    statistics.averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    statistics.medianDuration = durations[Math.floor(durations.length / 2)] || 0;

    // Standard deviation
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - statistics.averageDuration, 2), 0) / durations.length;
    statistics.standardDeviation = Math.sqrt(variance);

    // Reliability score (inverse of failure rate with flakiness penalty)
    const baseReliability = statistics.totalRuns > 0 ? statistics.successCount / statistics.totalRuns : 1.0;
    const flakinessReduction = statistics.flakyCount > 0 ? (statistics.flakyCount / statistics.totalRuns) * 0.1 : 0;
    statistics.reliabilityScore = Math.max(0, baseReliability - flakinessReduction);

    // Performance score (based on consistency and regression detection)
    statistics.performanceScore = await this.calculatePerformanceScore(testKey, durations);

    statistics.lastUpdated = Date.now();
  }

  /**
   * Calculate performance score based on consistency and trends
   */
  async calculatePerformanceScore(testKey, durations) {
    if (durations.length < 5) return 1.0;

    // Get baseline performance if available
    const baseline = this.performanceBaselines.get(testKey);
    if (!baseline && durations.length >= CONFIG.STABILITY_SAMPLE_SIZE) {
      // Establish baseline from first stable runs
      const stableDurations = durations.slice(-CONFIG.STABILITY_SAMPLE_SIZE);
      const baselineMedian = stableDurations.sort((a, b) => a - b)[Math.floor(stableDurations.length / 2)];
      this.performanceBaselines.set(testKey, {
        median: baselineMedian,
        established: Date.now(),
        sampleSize: stableDurations.length
      });
      return 1.0;
    }

    if (baseline) {
      const currentMedian = durations[Math.floor(durations.length / 2)];
      const regressionRatio = currentMedian / baseline.median;

      if (regressionRatio > (1 + CONFIG.PERFORMANCE_REGRESSION_THRESHOLD)) {
        // Performance regression detected
        return Math.max(0.1, 1 - (regressionRatio - 1));
      }
    }

    // Score based on consistency (lower standard deviation = higher score)
    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / mean;

    // Score decreases as variance increases
    return Math.max(0.1, 1 - Math.min(coefficientOfVariation, 0.9));
  }

  /**
   * Analyze test reliability and detect flakiness
   */
  async analyzeTestReliability(testKey, testData) {
    const { statistics, executions } = testData;

    if (statistics.totalRuns < CONFIG.STABILITY_SAMPLE_SIZE) {
      return; // Not enough data for reliable analysis
    }

    // Detect flaky tests
    const failureRate = statistics.failureCount / statistics.totalRuns;
    const isFlaky = failureRate > 0 && failureRate <= CONFIG.FLAKINESS_THRESHOLD;

    if (isFlaky) {
      await this.flagFlakyTest(testKey, {
        failureRate,
        totalRuns: statistics.totalRuns,
        pattern: this.analyzeFailurePattern(executions.slice(0, 20))
      });
    }

    // Detect performance regression
    const recentDurations = executions.slice(0, 10).map(e => e.duration);
    const olderDurations = executions.slice(10, 20).map(e => e.duration);

    if (recentDurations.length >= 5 && olderDurations.length >= 5) {
      const recentMedian = [...recentDurations].sort((a, b) => a - b)[Math.floor(recentDurations.length / 2)];
      const olderMedian = [...olderDurations].sort((a, b) => a - b)[Math.floor(olderDurations.length / 2)];

      if (recentMedian > olderMedian * (1 + CONFIG.PERFORMANCE_REGRESSION_THRESHOLD)) {
        await this.flagPerformanceRegression(testKey, {
          recentMedian,
          olderMedian,
          regressionPercentage: ((recentMedian - olderMedian) / olderMedian) * 100
        });
      }
    }
  }

  /**
   * Analyze failure patterns to identify flakiness types
   */
  analyzeFailurePattern(executions) {
    const failures = executions.filter(e => e.status === 'failed');

    if (failures.length === 0) return { type: 'none' };

    // Check for timing-related failures
    const timingKeywords = ['timeout', 'wait', 'timing', 'race', 'async'];
    const timingFailures = failures.filter(f =>
      f.error && timingKeywords.some(keyword =>
        f.error.message?.toLowerCase().includes(keyword)
      )
    );

    // Check for network-related failures
    const networkKeywords = ['network', 'fetch', 'connection', 'cors', 'xhr'];
    const networkFailures = failures.filter(f =>
      f.error && networkKeywords.some(keyword =>
        f.error.message?.toLowerCase().includes(keyword)
      )
    );

    // Check for DOM/selector failures
    const domKeywords = ['selector', 'element', 'locator', 'visible', 'clickable'];
    const domFailures = failures.filter(f =>
      f.error && domKeywords.some(keyword =>
        f.error.message?.toLowerCase().includes(keyword)
      )
    );

    // Determine primary failure type
    const types = [
      { name: 'timing', count: timingFailures.length },
      { name: 'network', count: networkFailures.length },
      { name: 'dom', count: domFailures.length }
    ];

    const primaryType = types.reduce((max, current) =>
      current.count > max.count ? current : max
    );

    return {
      type: primaryType.name,
      distribution: {
        timing: timingFailures.length,
        network: networkFailures.length,
        dom: domFailures.length,
        other: failures.length - timingFailures.length - networkFailures.length - domFailures.length
      },
      commonErrors: this.extractCommonErrors(failures)
    };
  }

  /**
   * Extract common error patterns from failures
   */
  extractCommonErrors(failures) {
    const errorCounts = {};

    failures.forEach(failure => {
      if (failure.error?.message) {
        // Normalize error message (remove dynamic parts)
        const normalized = failure.error.message
          .replace(/\d+/g, 'N') // Replace numbers with N
          .replace(/"[^"]*"/g, '"STRING"') // Replace quoted strings
          .replace(/timeout \d+ms exceeded/g, 'timeout exceeded')
          .substring(0, 200); // Limit length

        errorCounts[normalized] = (errorCounts[normalized] || 0) + 1;
      }
    });

    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));
  }

  /**
   * Flag a flaky test and store analysis
   */
  async flagFlakyTest(testKey, analysis) {
    try {
      const metrics = await this.loadMetrics();

      if (!metrics.flakiness[testKey]) {
        metrics.flakiness[testKey] = {
          firstDetected: Date.now(),
          detections: []
        };
      }

      metrics.flakiness[testKey].detections.push({
        timestamp: Date.now(),
        analysis,
        recommended_action: this.getRecommendedAction(analysis)
      });

      // Keep only recent detections
      metrics.flakiness[testKey].detections = metrics.flakiness[testKey].detections
        .slice(-10);

      await this.saveMetrics(metrics);

      console.warn(`🔄 Flaky test detected: ${testKey}`);
      console.warn(`   Failure rate: ${(analysis.failureRate * 100).toFixed(2)}%`);
      console.warn(`   Pattern: ${analysis.pattern.type}`);
      console.warn(`   Recommended action: ${this.getRecommendedAction(analysis)}`);

    } catch (error) {
      console.error('❌ Failed to flag flaky test:', error);
    }
  }

  /**
   * Flag performance regression
   */
  async flagPerformanceRegression(testKey, analysis) {
    try {
      const metrics = await this.loadMetrics();

      if (!metrics.performance[testKey]) {
        metrics.performance[testKey] = {
          regressions: []
        };
      }

      metrics.performance[testKey].regressions.push({
        timestamp: Date.now(),
        analysis,
        severity: analysis.regressionPercentage > 50 ? 'high' : 'medium'
      });

      // Keep only recent regressions
      metrics.performance[testKey].regressions = metrics.performance[testKey].regressions
        .slice(-5);

      await this.saveMetrics(metrics);

      console.warn(`📈 Performance regression detected: ${testKey}`);
      console.warn(`   Increase: ${analysis.regressionPercentage.toFixed(1)}%`);
      console.warn(`   Recent: ${analysis.recentMedian}ms, Previous: ${analysis.olderMedian}ms`);

    } catch (error) {
      console.error('❌ Failed to flag performance regression:', error);
    }
  }

  /**
   * Get recommended action for flaky test
   */
  getRecommendedAction(analysis) {
    const { pattern, failureRate } = analysis;

    if (failureRate > 0.1) {
      return 'immediate_investigation';
    }

    switch (pattern.type) {
      case 'timing':
        return 'increase_timeouts_or_add_waits';
      case 'network':
        return 'add_network_retry_logic';
      case 'dom':
        return 'improve_element_selectors';
      default:
        return 'detailed_investigation_needed';
    }
  }

  /**
   * Implement intelligent retry logic with exponential backoff
   */
  async executeWithRetry(testFunction, testKey, options = {}) {
    const maxAttempts = options.maxAttempts || CONFIG.MAX_RETRY_ATTEMPTS;
    const baseDelay = options.baseDelay || CONFIG.RETRY_BASE_DELAY;
    const maxDelay = options.maxDelay || CONFIG.RETRY_MAX_DELAY;

    let attempt = 0;
    let lastError;

    // Get custom retry strategy for this test if available
    const customStrategy = this.retryStrategies.get(testKey);

    while (attempt < maxAttempts) {
      try {
        const startTime = Date.now();
        const result = await testFunction();
        const duration = Date.now() - startTime;

        // Record successful execution
        await this.recordTestExecution(
          { file: testKey.split('::')[0], title: testKey.split('::')[1] },
          { status: 'passed', duration, retry: attempt, startTime }
        );

        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt >= maxAttempts) {
          // Record failed execution
          await this.recordTestExecution(
            { file: testKey.split('::')[0], title: testKey.split('::')[1] },
            {
              status: 'failed',
              duration: 0,
              retry: attempt - 1,
              error: {
                message: error.message,
                stack: error.stack
              }
            }
          );
          break;
        }

        // Calculate delay with exponential backoff
        let delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

        // Apply custom strategy if available
        if (customStrategy) {
          delay = customStrategy.calculateDelay(attempt, error, delay);
        }

        // Add jitter to prevent thundering herd
        delay += Math.random() * 1000;

        console.warn(`🔄 Test ${testKey} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
        console.warn(`   Error: ${error.message}`);

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Register custom retry strategy for a test
   */
  registerRetryStrategy(testKey, strategy) {
    this.retryStrategies.set(testKey, {
      calculateDelay: strategy.calculateDelay || ((attempt, error, defaultDelay) => defaultDelay),
      shouldRetry: strategy.shouldRetry || ((error) => true),
      maxAttempts: strategy.maxAttempts || CONFIG.MAX_RETRY_ATTEMPTS
    });
  }

  /**
   * Validate environment consistency before test execution
   */
  async validateEnvironmentConsistency() {
    const snapshot = await this.captureEnvironmentSnapshot();
    const environments = await this.loadEnvironmentSnapshots();

    if (environments.baselines.primary) {
      const baseline = environments.baselines.primary;
      const inconsistencies = this.compareEnvironments(baseline, snapshot);

      if (inconsistencies.length > 0) {
        console.warn('⚠️  Environment inconsistencies detected:');
        inconsistencies.forEach(issue => {
          console.warn(`   ${issue.category}: ${issue.description}`);
        });

        // Store inconsistencies
        environments.snapshots.unshift({
          timestamp: Date.now(),
          snapshot,
          inconsistencies,
          type: 'validation'
        });

        await this.saveEnvironmentSnapshots(environments);

        return {
          consistent: false,
          inconsistencies
        };
      }
    } else {
      // Establish baseline
      environments.baselines.primary = snapshot;
      await this.saveEnvironmentSnapshots(environments);
      console.log('✅ Environment baseline established');
    }

    return { consistent: true };
  }

  /**
   * Capture current environment snapshot
   */
  async captureEnvironmentSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          CI: process.env.CI,
          E2E_TEST_MODE: process.env.E2E_TEST_MODE
        }
      },
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        loadAverage: process.loadavg?.() || []
      },
      browser: {
        // These will be filled by test runner
        userAgent: null,
        viewport: null,
        devicePixelRatio: null
      },
      network: {
        // Basic connectivity check
        online: await this.checkNetworkConnectivity()
      }
    };

    // Add Git information if available
    try {
      snapshot.git = {
        branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
        commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
        dirty: execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
      };
    } catch (error) {
      snapshot.git = { available: false };
    }

    return snapshot;
  }

  /**
   * Check basic network connectivity
   */
  async checkNetworkConnectivity() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.ENVIRONMENT_CHECK_TIMEOUT);

      await fetch('https://httpbin.org/status/200', {
        signal: controller.signal,
        method: 'HEAD'
      });

      clearTimeout(timeout);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Compare two environment snapshots
   */
  compareEnvironments(baseline, current) {
    const inconsistencies = [];

    // Node version
    if (baseline.node.version !== current.node.version) {
      inconsistencies.push({
        category: 'node_version',
        description: `Node version changed: ${baseline.node.version} → ${current.node.version}`
      });
    }

    // Platform
    if (baseline.node.platform !== current.node.platform) {
      inconsistencies.push({
        category: 'platform',
        description: `Platform changed: ${baseline.node.platform} → ${current.node.platform}`
      });
    }

    // Environment variables
    const criticalEnvVars = ['NODE_ENV', 'CI', 'E2E_TEST_MODE'];
    criticalEnvVars.forEach(envVar => {
      if (baseline.node.env[envVar] !== current.node.env[envVar]) {
        inconsistencies.push({
          category: 'environment',
          description: `${envVar} changed: ${baseline.node.env[envVar]} → ${current.node.env[envVar]}`
        });
      }
    });

    // Git changes
    if (baseline.git?.commit !== current.git?.commit) {
      inconsistencies.push({
        category: 'git_commit',
        description: `Git commit changed: ${baseline.git?.commit?.substring(0, 8)} → ${current.git?.commit?.substring(0, 8)}`
      });
    }

    // Network connectivity
    if (baseline.network.online !== current.network.online) {
      inconsistencies.push({
        category: 'network',
        description: `Network connectivity changed: ${baseline.network.online} → ${current.network.online}`
      });
    }

    return inconsistencies;
  }

  /**
   * Track concurrent test execution
   */
  async trackConcurrentExecution(testKey, executionId) {
    const execution = {
      testKey,
      executionId,
      startTime: Date.now(),
      workerInfo: {
        pid: process.pid,
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };

    this.concurrentExecutions.set(executionId, execution);

    // Check for excessive concurrent executions
    if (this.concurrentExecutions.size > CONFIG.CONCURRENT_EXECUTION_LIMIT) {
      console.warn(`⚠️  High concurrent execution count: ${this.concurrentExecutions.size}`);
    }

    return execution;
  }

  /**
   * Complete concurrent execution tracking
   */
  async completeConcurrentExecution(executionId, result) {
    const execution = this.concurrentExecutions.get(executionId);
    if (!execution) return null;

    execution.endTime = Date.now();
    execution.duration = execution.endTime - execution.startTime;
    execution.result = result;
    execution.endWorkerInfo = {
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };

    this.concurrentExecutions.delete(executionId);

    return execution;
  }

  /**
   * Generate stability metrics dashboard data
   */
  async generateStabilityMetrics() {
    try {
      const history = await this.loadHistoricalData();
      const metrics = await this.loadMetrics();

      const dashboard = {
        timestamp: Date.now(),
        summary: {
          totalTests: Object.keys(history.tests).length,
          flakyTests: Object.keys(metrics.flakiness).length,
          performanceRegressions: Object.keys(metrics.performance).length,
          overallReliability: this.calculateOverallReliability(history.tests)
        },
        testDetails: {},
        trends: {
          reliability: this.calculateReliabilityTrends(history.tests),
          performance: this.calculatePerformanceTrends(history.tests),
          flakiness: this.calculateFlakinessTrends(metrics.flakiness)
        },
        recommendations: await this.generateRecommendations(history.tests, metrics),
        lastUpdated: Date.now()
      };

      // Generate detailed metrics for each test
      for (const [testKey, testData] of Object.entries(history.tests)) {
        dashboard.testDetails[testKey] = {
          statistics: testData.statistics,
          recentExecutions: testData.executions.slice(0, 10).map(e => ({
            timestamp: e.timestamp,
            status: e.status,
            duration: e.duration,
            retries: e.retries
          })),
          flakiness: metrics.flakiness[testKey] || null,
          performance: metrics.performance[testKey] || null,
          healthScore: this.calculateTestHealthScore(testData.statistics)
        };
      }

      // Save metrics
      await this.saveMetrics({
        ...metrics,
        dashboard
      });

      return dashboard;
    } catch (error) {
      console.error('❌ Failed to generate stability metrics:', error);
      return null;
    }
  }

  /**
   * Calculate overall reliability score
   */
  calculateOverallReliability(tests) {
    const testKeys = Object.keys(tests);
    if (testKeys.length === 0) return 1.0;

    const reliabilitySum = testKeys.reduce((sum, key) => {
      return sum + (tests[key].statistics.reliabilityScore || 0);
    }, 0);

    return reliabilitySum / testKeys.length;
  }

  /**
   * Calculate reliability trends
   */
  calculateReliabilityTrends(tests) {
    const trends = {};
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const [testKey, testData] of Object.entries(tests)) {
      const executions = testData.executions;

      // Calculate daily reliability for last 7 days
      const dailyReliability = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = now - (i * dayMs);
        const dayEnd = dayStart + dayMs;

        const dayExecutions = executions.filter(e =>
          e.timestamp >= dayStart && e.timestamp < dayEnd
        );

        const reliability = dayExecutions.length > 0
          ? dayExecutions.filter(e => e.status === 'passed').length / dayExecutions.length
          : null;

        dailyReliability.push({
          date: new Date(dayStart).toISOString().split('T')[0],
          reliability,
          executionCount: dayExecutions.length
        });
      }

      trends[testKey] = dailyReliability;
    }

    return trends;
  }

  /**
   * Calculate performance trends
   */
  calculatePerformanceTrends(tests) {
    const trends = {};

    for (const [testKey, testData] of Object.entries(tests)) {
      const executions = testData.executions.slice(0, 30); // Last 30 executions

      if (executions.length < 5) {
        trends[testKey] = { insufficient_data: true };
        continue;
      }

      const durations = executions.map(e => e.duration);
      const timestamps = executions.map(e => e.timestamp);

      // Simple linear regression to detect trends
      const n = durations.length;
      const sumX = timestamps.reduce((a, b) => a + b, 0);
      const sumY = durations.reduce((a, b) => a + b, 0);
      const sumXY = timestamps.reduce((sum, x, i) => sum + x * durations[i], 0);
      const sumXX = timestamps.reduce((sum, x) => sum + x * x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      trends[testKey] = {
        slope, // Positive slope = getting slower
        intercept,
        trend: slope > 0 ? 'slowing' : slope < 0 ? 'improving' : 'stable',
        recentMedian: [...durations.slice(0, 5)].sort((a, b) => a - b)[2],
        historicalMedian: [...durations.slice(-5)].sort((a, b) => a - b)[2]
      };
    }

    return trends;
  }

  /**
   * Calculate flakiness trends
   */
  calculateFlakinessTrends(flakinessData) {
    const trends = {};

    for (const [testKey, data] of Object.entries(flakinessData)) {
      const detections = data.detections || [];

      trends[testKey] = {
        firstDetected: data.firstDetected,
        recentDetections: detections.length,
        trend: detections.length > 5 ? 'worsening' : detections.length > 2 ? 'concerning' : 'stable',
        lastDetection: detections.length > 0 ? detections[0].timestamp : null
      };
    }

    return trends;
  }

  /**
   * Generate actionable recommendations
   */
  async generateRecommendations(tests, metrics) {
    const recommendations = [];

    // Flaky test recommendations
    for (const [testKey, flakinessData] of Object.entries(metrics.flakiness || {})) {
      const recentDetections = flakinessData.detections?.slice(0, 3) || [];
      if (recentDetections.length > 0) {
        const latestAnalysis = recentDetections[0].analysis;
        recommendations.push({
          type: 'flakiness',
          priority: recentDetections.length > 2 ? 'high' : 'medium',
          test: testKey,
          issue: `Test is flaky (${(latestAnalysis.failureRate * 100).toFixed(1)}% failure rate)`,
          action: latestAnalysis.recommended_action || 'investigate_pattern',
          details: latestAnalysis.pattern
        });
      }
    }

    // Performance regression recommendations
    for (const [testKey, performanceData] of Object.entries(metrics.performance || {})) {
      const recentRegressions = performanceData.regressions?.slice(0, 1) || [];
      if (recentRegressions.length > 0) {
        const regression = recentRegressions[0];
        recommendations.push({
          type: 'performance',
          priority: regression.severity === 'high' ? 'high' : 'medium',
          test: testKey,
          issue: `Performance regression detected (${regression.analysis.regressionPercentage.toFixed(1)}% slower)`,
          action: 'optimize_test_performance',
          details: regression.analysis
        });
      }
    }

    // General stability recommendations
    const unstableTests = Object.entries(tests).filter(([, data]) =>
      data.statistics.reliabilityScore < 0.9
    );

    if (unstableTests.length > 0) {
      recommendations.push({
        type: 'stability',
        priority: 'medium',
        test: 'multiple',
        issue: `${unstableTests.length} tests have low reliability scores`,
        action: 'review_test_implementation',
        details: {
          affectedTests: unstableTests.map(([key]) => key).slice(0, 5)
        }
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Calculate test health score (0-1)
   */
  calculateTestHealthScore(statistics) {
    if (!statistics || statistics.totalRuns === 0) return 1.0;

    const reliabilityWeight = 0.6;
    const performanceWeight = 0.3;
    const stabilityWeight = 0.1;

    const reliabilityScore = statistics.reliabilityScore || 0;
    const performanceScore = statistics.performanceScore || 1;

    // Stability based on consistency (lower standard deviation = higher stability)
    const stabilityScore = statistics.averageDuration > 0
      ? Math.max(0, 1 - (statistics.standardDeviation / statistics.averageDuration))
      : 1;

    return (
      reliabilityScore * reliabilityWeight +
      performanceScore * performanceWeight +
      stabilityScore * stabilityWeight
    );
  }

  /**
   * Clean up old data beyond retention period
   */
  async cleanupOldData() {
    const cutoffTime = Date.now() - (CONFIG.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      const history = await this.loadHistoricalData();
      let cleanedCount = 0;

      for (const [testKey, testData] of Object.entries(history.tests)) {
        const originalLength = testData.executions.length;
        testData.executions = testData.executions.filter(e => e.timestamp > cutoffTime);
        cleanedCount += originalLength - testData.executions.length;

        // Update statistics after cleanup
        if (testData.executions.length > 0) {
          await this.updateTestStatistics(testKey, testData);
        }
      }

      if (cleanedCount > 0) {
        await this.saveHistoricalData(history);
        console.log(`🧹 Cleaned up ${cleanedCount} old test executions`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
      return 0;
    }
  }

  /**
   * Utility methods for data persistence
   */
  async loadHistoricalData() {
    try {
      const data = await fs.readFile(this.historicalDataFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { tests: {}, metadata: { created: Date.now(), version: '1.0' } };
    }
  }

  async saveHistoricalData(data) {
    data.metadata.lastUpdated = Date.now();
    await fs.writeFile(this.historicalDataFile, JSON.stringify(data, null, 2));
  }

  async loadMetrics() {
    try {
      const data = await fs.readFile(this.metricsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { stability: {}, performance: {}, flakiness: {} };
    }
  }

  async saveMetrics(metrics) {
    await fs.writeFile(this.metricsFile, JSON.stringify(metrics, null, 2));
  }

  async loadEnvironmentSnapshots() {
    try {
      const data = await fs.readFile(this.environmentFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { snapshots: [], baselines: {} };
    }
  }

  async saveEnvironmentSnapshots(data) {
    await fs.writeFile(this.environmentFile, JSON.stringify(data, null, 2));
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start resource monitoring with optimized interval
   */
  startResourceMonitoring() {
    if (!CONFIG.RESOURCE_MONITORING_ENABLED || this.isResourceMonitoringActive) {
      return;
    }

    this.isResourceMonitoringActive = true;
    this.resourceMonitoringInterval = setInterval(() => {
      const timestamp = Date.now();

      try {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        this.resourceData.memory.push({
          timestamp,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss
        });

        this.resourceData.cpu.push({
          timestamp,
          user: cpuUsage.user,
          system: cpuUsage.system
        });

        this.resourceData.timestamps.push(timestamp);

        // Limit memory usage by keeping only recent data (last 100 entries)
        if (this.resourceData.memory.length > 100) {
          this.resourceData.memory = this.resourceData.memory.slice(-100);
          this.resourceData.cpu = this.resourceData.cpu.slice(-100);
          this.resourceData.timestamps = this.resourceData.timestamps.slice(-100);
        }
      } catch (error) {
        console.warn('⚠️  Resource monitoring error:', error.message);
      }
    }, CONFIG.RESOURCE_MONITORING_INTERVAL);

    // Automatically stop monitoring after 10 minutes to prevent memory leaks
    setTimeout(() => {
      this.stopResourceMonitoring();
    }, 600000); // 10 minutes
  }

  /**
   * Stop resource monitoring and cleanup
   */
  stopResourceMonitoring() {
    if (this.resourceMonitoringInterval) {
      clearInterval(this.resourceMonitoringInterval);
      this.resourceMonitoringInterval = null;
    }
    this.isResourceMonitoringActive = false;
  }

  /**
   * Get current resource statistics
   */
  getResourceStats() {
    const { memory, cpu } = this.resourceData;

    if (memory.length === 0) {
      return { memory: null, cpu: null, monitoring: false };
    }

    const memoryStats = {
      current: memory[memory.length - 1],
      peak: {
        heapUsed: Math.max(...memory.map(m => m.heapUsed)),
        heapTotal: Math.max(...memory.map(m => m.heapTotal)),
        rss: Math.max(...memory.map(m => m.rss))
      },
      average: {
        heapUsed: memory.reduce((sum, m) => sum + m.heapUsed, 0) / memory.length,
        heapTotal: memory.reduce((sum, m) => sum + m.heapTotal, 0) / memory.length,
        rss: memory.reduce((sum, m) => sum + m.rss, 0) / memory.length
      }
    };

    const cpuStats = {
      current: cpu[cpu.length - 1],
      total: cpu.reduce((sum, c) => sum + c.user + c.system, 0)
    };

    return {
      memory: memoryStats,
      cpu: cpuStats,
      monitoring: this.isResourceMonitoringActive,
      dataPoints: memory.length
    };
  }

  /**
   * Cleanup method to prevent memory leaks
   */
  cleanup() {
    this.stopResourceMonitoring();
    this.concurrentExecutions.clear();
    this.performanceBaselines.clear();
    this.retryStrategies.clear();
    this.resourceData.memory = [];
    this.resourceData.cpu = [];
    this.resourceData.timestamps = [];
  }
}

// Singleton instance
let flakinessDetectorInstance = null;

/**
 * Get or create flakiness detector instance
 */
export function getFlakinessDetector() {
  if (!flakinessDetectorInstance) {
    flakinessDetectorInstance = new FlakinessDetector();
  }
  return flakinessDetectorInstance;
}

/**
 * Convenient wrapper for test execution with automatic monitoring
 */
export async function executeTestWithMonitoring(testFunction, testInfo, options = {}) {
  const detector = getFlakinessDetector();
  const testKey = `${testInfo.file}::${testInfo.title}`;
  const executionId = `${testKey}::${Date.now()}::${Math.random().toString(36).substring(2, 11)}`;

  // Start resource monitoring if enabled
  if (options.enableResourceMonitoring) {
    detector.startResourceMonitoring();
  }

  // Track concurrent execution
  await detector.trackConcurrentExecution(testKey, executionId);

  try {
    // Validate environment consistency if requested
    if (options.validateEnvironment) {
      const envCheck = await detector.validateEnvironmentConsistency();
      if (!envCheck.consistent && options.requireConsistentEnvironment) {
        throw new Error('Environment consistency check failed');
      }
    }

    // Execute with retry logic
    const result = await detector.executeWithRetry(testFunction, testKey, options.retry);

    // Complete tracking
    await detector.completeConcurrentExecution(executionId, { status: 'passed' });

    return result;

  } catch (error) {
    await detector.completeConcurrentExecution(executionId, { status: 'failed', error });
    throw error;
  }
}

/**
 * Generate and export stability dashboard data
 */
export async function generateStabilityDashboard() {
  const detector = getFlakinessDetector();
  return detector.generateStabilityMetrics();
}

/**
 * Register custom retry strategy for specific tests
 */
export function registerTestRetryStrategy(testPattern, strategy) {
  const detector = getFlakinessDetector();
  detector.registerRetryStrategy(testPattern, strategy);
}

/**
 * Cleanup flakiness detector resources
 */
export function cleanupFlakinessDetector() {
  if (flakinessDetectorInstance) {
    flakinessDetectorInstance.cleanup();
    flakinessDetectorInstance = null;
  }
}

/**
 * Get resource monitoring statistics
 */
export function getResourceMonitoringStats() {
  const detector = getFlakinessDetector();
  return detector.getResourceStats();
}

/**
 * Export main class for direct usage
 */
export { FlakinessDetector };

/**
 * Default export for common usage
 */
export default {
  getFlakinessDetector,
  executeTestWithMonitoring,
  generateStabilityDashboard,
  registerTestRetryStrategy,
  cleanupFlakinessDetector,
  getResourceMonitoringStats,
  FlakinessDetector
};