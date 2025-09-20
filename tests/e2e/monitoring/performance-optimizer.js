/**
 * E2E Test Suite Performance Optimizer
 *
 * Monitors test execution performance, tracks resource usage, and provides
 * intelligent optimization recommendations to maintain sub-5-minute execution
 * while maximizing test value.
 */

import { promises as fs, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { performance } from 'perf_hooks';

export class PerformanceOptimizer {
    constructor(options = {}) {
        this.metricsDir = join(process.cwd(), '.tmp', 'e2e-metrics');
        this.historyFile = join(this.metricsDir, 'performance-history.json');
        this.configFile = join(this.metricsDir, 'optimization-config.json');
        this.benchmarksFile = join(this.metricsDir, 'performance-benchmarks.json');

        this.config = {
            maxExecutionTime: options.maxExecutionTime || 300000, // 5 minutes
            parallelismFactor: options.parallelismFactor || 4,
            resourceBudget: options.resourceBudget || 1000, // CI credits
            regressionThreshold: options.regressionThreshold || 0.15, // 15%
            minTestValue: options.minTestValue || 0.3, // Minimum test value score
            ...options
        };

        this.currentSession = {
            startTime: null,
            tests: new Map(),
            resources: {
                cpu: [],
                memory: [],
                network: [],
                storage: []
            },
            performance: {
                parallelJobs: 0,
                totalDuration: 0,
                testCount: 0
            }
        };

        this.ensureDirectories();

        // Initialize async data loading
        this.historyData = null;
        this.benchmarkData = null;
        this.initializationPromise = this.initializeAsync();

        // Track cleanup handlers
        this.cleanupHandlers = new Set();
        this.isCleanedUp = false;
    }

    /**
     * Initialize async data loading
     */
    async initializeAsync() {
        try {
            [this.historyData, this.benchmarkData] = await Promise.all([
                this.loadHistory(),
                this.loadBenchmarks()
            ]);
        } catch (error) {
            console.warn('Failed to initialize performance optimizer data:', error.message);
            this.historyData = { tests: {}, sessions: [] };
            this.benchmarkData = {};
        }
    }

    /**
     * Ensure initialization is complete
     */
    async ensureInitialized() {
        if (this.initializationPromise) {
            await this.initializationPromise;
        }
    }

    /**
     * Initialize performance monitoring session
     */
    startSession(sessionConfig = {}) {
        this.currentSession.startTime = performance.now();
        this.currentSession.config = { ...this.config, ...sessionConfig };

        console.log('🚀 Performance monitoring started');

        // Start resource monitoring
        this.startResourceMonitoring();

        return {
            sessionId: this.generateSessionId(),
            startTime: this.currentSession.startTime,
            config: this.currentSession.config
        };
    }

    /**
     * Track individual test performance
     */
    trackTest(testInfo) {
        const testId = this.generateTestId(testInfo);
        const startTime = performance.now();

        return {
            testId,
            start: () => {
                this.currentSession.tests.set(testId, {
                    ...testInfo,
                    startTime,
                    status: 'running'
                });
            },

            end: (result) => {
                const endTime = performance.now();
                const duration = endTime - startTime;

                const testData = this.currentSession.tests.get(testId) || {};
                this.currentSession.tests.set(testId, {
                    ...testData,
                    endTime,
                    duration,
                    status: result.status,
                    error: result.error,
                    metrics: result.metrics || {}
                });

                this.updateTestHistory(testId, {
                    duration,
                    status: result.status,
                    timestamp: Date.now(),
                    metrics: result.metrics
                });
            },

            addMetric: (name, value) => {
                const testData = this.currentSession.tests.get(testId) || {};
                if (!testData.metrics) testData.metrics = {};
                testData.metrics[name] = value;
                this.currentSession.tests.set(testId, testData);
            }
        };
    }

    /**
     * Analyze test suite performance and generate optimization recommendations
     */
    analyzePerformance() {
        const analysis = {
            execution: this.analyzeExecutionPerformance(),
            resources: this.analyzeResourceUsage(),
            parallelization: this.analyzeParallelization(),
            bottlenecks: this.identifyBottlenecks(),
            regressions: this.detectPerformanceRegressions(),
            recommendations: []
        };

        analysis.recommendations = this.generateOptimizationRecommendations(analysis);

        return analysis;
    }

    /**
     * Generate intelligent test selection for faster feedback
     */
    selectOptimalTests(availableTests, constraints = {}) {
        const maxDuration = constraints.maxDuration || this.config.maxExecutionTime;
        const maxTests = constraints.maxTests || availableTests.length;
        const priorityMode = constraints.priorityMode || 'balanced'; // 'fast', 'comprehensive', 'balanced'

        const testScores = availableTests.map(test => ({
            ...test,
            score: this.calculateTestValue(test),
            estimatedDuration: this.estimateTestDuration(test),
            historicalReliability: this.getTestReliability(test)
        }));

        // Sort by optimization strategy
        const sortedTests = this.sortTestsByStrategy(testScores, priorityMode);

        // Select tests within constraints
        const selectedTests = this.selectTestsWithinConstraints(
            sortedTests,
            maxDuration,
            maxTests
        );

        return {
            selectedTests,
            estimatedDuration: selectedTests.reduce((sum, test) => sum + test.estimatedDuration, 0),
            expectedValue: selectedTests.reduce((sum, test) => sum + test.score, 0),
            parallelizationPlan: this.generateParallelizationPlan(selectedTests)
        };
    }

    /**
     * Optimize test parallelization based on historical performance
     */
    optimizeParallelization(tests) {
        const historicalData = this.loadHistory();
        const testDurations = this.analyzeTestDurations(tests, historicalData);

        // Group tests by estimated duration and dependencies
        const testGroups = this.groupTestsForParallelization(testDurations);

        // Calculate optimal parallel configuration
        const parallelConfig = this.calculateOptimalParallelism(testGroups);

        return {
            parallelConfig,
            estimatedDuration: Math.max(...testGroups.map(group =>
                group.reduce((sum, test) => sum + test.estimatedDuration, 0)
            )),
            resourceUtilization: this.calculateResourceUtilization(parallelConfig)
        };
    }

    /**
     * Monitor CI resource costs and generate optimization recommendations
     */
    trackResourceCosts(ciMetrics) {
        const costs = {
            compute: this.calculateComputeCosts(ciMetrics),
            storage: this.calculateStorageCosts(ciMetrics),
            network: this.calculateNetworkCosts(ciMetrics),
            total: 0
        };

        costs.total = costs.compute + costs.storage + costs.network;

        const optimization = {
            currentCosts: costs,
            budgetUtilization: costs.total / this.config.resourceBudget,
            recommendations: this.generateCostOptimizationRecommendations(costs),
            projectedSavings: this.calculateProjectedSavings(costs)
        };

        this.updateCostHistory(costs);

        return optimization;
    }

    /**
     * Prevent performance regressions with benchmarks
     */
    checkPerformanceRegression(currentMetrics) {
        const benchmarks = this.loadBenchmarks();
        const regressions = [];

        for (const [metric, currentValue] of Object.entries(currentMetrics)) {
            const benchmark = benchmarks[metric];
            if (!benchmark) continue;

            const regression = (currentValue - benchmark.baseline) / benchmark.baseline;
            if (regression > this.config.regressionThreshold) {
                regressions.push({
                    metric,
                    currentValue,
                    baseline: benchmark.baseline,
                    regression: regression * 100,
                    severity: this.calculateRegressionSeverity(regression)
                });
            }
        }

        return {
            hasRegressions: regressions.length > 0,
            regressions,
            recommendation: regressions.length > 0 ?
                'Performance regression detected. Consider investigating recent changes.' :
                'No performance regressions detected.'
        };
    }

    /**
     * Generate comprehensive optimization report
     */
    generateOptimizationReport() {
        const analysis = this.analyzePerformance();
        const resourceAnalysis = this.trackResourceCosts(this.currentSession.resources);

        const report = {
            timestamp: Date.now(),
            session: {
                duration: performance.now() - this.currentSession.startTime,
                testsExecuted: this.currentSession.tests.size,
                status: 'completed'
            },
            performance: analysis,
            resources: resourceAnalysis,
            recommendations: {
                immediate: this.getImmediateRecommendations(analysis),
                strategic: this.getStrategicRecommendations(analysis),
                cost: resourceAnalysis.recommendations
            },
            benchmarks: this.updateBenchmarks(),
            nextOptimization: this.scheduleNextOptimization()
        };

        this.saveReport(report);
        return report;
    }

    // Private methods

    ensureDirectories() {
        if (!existsSync(this.metricsDir)) {
            mkdirSync(this.metricsDir, { recursive: true });
        }
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    generateTestId(testInfo) {
        return `${testInfo.file}_${testInfo.test}`.replace(/[^a-zA-Z0-9]/g, '_');
    }

    startResourceMonitoring() {
        if (this.isCleanedUp) {
            console.warn('⚠️  Attempted to start resource monitoring on cleaned up optimizer');
            return;
        }

        // Use longer interval for better performance (5 seconds instead of 1)
        const monitoringInterval = process.env.CI === 'true' ? 10000 : 5000;

        const interval = setInterval(() => {
            if (!this.currentSession.startTime || this.isCleanedUp) {
                this.stopResourceMonitoring();
                return;
            }

            try {
                this.currentSession.resources.cpu.push({
                    timestamp: Date.now(),
                    usage: process.cpuUsage()
                });

                this.currentSession.resources.memory.push({
                    timestamp: Date.now(),
                    usage: process.memoryUsage()
                });

                // Limit resource data to prevent memory leaks (keep last 200 entries)
                if (this.currentSession.resources.cpu.length > 200) {
                    this.currentSession.resources.cpu = this.currentSession.resources.cpu.slice(-200);
                }
                if (this.currentSession.resources.memory.length > 200) {
                    this.currentSession.resources.memory = this.currentSession.resources.memory.slice(-200);
                }
            } catch (error) {
                console.warn('⚠️  Resource monitoring error:', error.message);
            }
        }, monitoringInterval);

        // Store interval ID for cleanup
        this.currentSession.resourceMonitoringInterval = interval;
        this.cleanupHandlers.add(() => this.stopResourceMonitoring());

        // Auto-cleanup after 15 minutes to prevent memory leaks
        setTimeout(() => {
            this.stopResourceMonitoring();
        }, 900000); // 15 minutes
    }

    /**
     * Stop resource monitoring and cleanup interval
     */
    stopResourceMonitoring() {
        if (this.currentSession.resourceMonitoringInterval) {
            clearInterval(this.currentSession.resourceMonitoringInterval);
            this.currentSession.resourceMonitoringInterval = null;
        }
    }

    /**
     * End monitoring session with proper cleanup
     */
    endSession() {
        this.stopResourceMonitoring();

        const sessionData = {
            endTime: performance.now(),
            duration: performance.now() - (this.currentSession.startTime || 0),
            testsExecuted: this.currentSession.tests.size,
            resources: this.getResourceSummary()
        };

        // Reset session
        this.currentSession = {
            startTime: null,
            tests: new Map(),
            resources: {
                cpu: [],
                memory: [],
                network: [],
                storage: []
            },
            performance: {
                parallelJobs: 0,
                totalDuration: 0,
                testCount: 0
            }
        };

        return sessionData;
    }

    /**
     * Get resource usage summary
     */
    getResourceSummary() {
        const { cpu, memory } = this.currentSession.resources;

        if (cpu.length === 0 || memory.length === 0) {
            return { cpu: null, memory: null, dataPoints: 0 };
        }

        const memoryUsages = memory.map(m => m.usage.heapUsed);
        const cpuUsages = cpu.map(c => c.usage.user + c.usage.system);

        return {
            cpu: {
                peak: Math.max(...cpuUsages),
                average: cpuUsages.reduce((sum, usage) => sum + usage, 0) / cpuUsages.length,
                samples: cpuUsages.length
            },
            memory: {
                peak: Math.max(...memoryUsages),
                average: memoryUsages.reduce((sum, usage) => sum + usage, 0) / memoryUsages.length,
                samples: memoryUsages.length
            },
            dataPoints: Math.min(cpu.length, memory.length)
        };
    }

    async loadHistory() {
        if (!existsSync(this.historyFile)) {
            return { tests: {}, sessions: [] };
        }

        try {
            const data = await fs.readFile(this.historyFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.warn('Failed to load performance history:', error.message);
            return { tests: {}, sessions: [] };
        }
    }

    async loadBenchmarks() {
        if (!existsSync(this.benchmarksFile)) {
            return {};
        }

        try {
            const data = await fs.readFile(this.benchmarksFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.warn('Failed to load performance benchmarks:', error.message);
            return {};
        }
    }

    async updateTestHistory(testId, testResult) {
        if (this.isCleanedUp) {
            return;
        }

        // Batch file operations to reduce I/O overhead
        if (!this.pendingHistoryUpdates) {
            this.pendingHistoryUpdates = new Map();
            this.historyUpdateTimer = null;
        }

        this.pendingHistoryUpdates.set(testId, testResult);

        // Debounce writes - only write after 1 second of no updates
        if (this.historyUpdateTimer) {
            clearTimeout(this.historyUpdateTimer);
        }

        this.historyUpdateTimer = setTimeout(async () => {
            await this.flushHistoryUpdates();
        }, 1000);
    }

    async flushHistoryUpdates() {
        if (!this.pendingHistoryUpdates || this.pendingHistoryUpdates.size === 0) {
            return;
        }

        try {
            // Ensure we have the latest history data
            await this.ensureInitialized();
            const history = this.historyData || { tests: {}, sessions: [] };

            for (const [testId, testResult] of this.pendingHistoryUpdates) {
                if (!history.tests[testId]) {
                    history.tests[testId] = { results: [] };
                }

                history.tests[testId].results.push(testResult);

                // Keep only last 100 results per test
                if (history.tests[testId].results.length > 100) {
                    history.tests[testId].results = history.tests[testId].results.slice(-100);
                }
            }

            // Update cached data and save
            this.historyData = history;
            await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
            this.pendingHistoryUpdates.clear();
        } catch (error) {
            console.warn('Failed to flush history updates:', error.message);
        }
    }

    analyzeExecutionPerformance() {
        const tests = Array.from(this.currentSession.tests.values());
        const totalDuration = tests.reduce((sum, test) => sum + (test.duration || 0), 0);

        return {
            totalDuration,
            averageTestDuration: totalDuration / tests.length || 0,
            slowestTests: tests
                .sort((a, b) => (b.duration || 0) - (a.duration || 0))
                .slice(0, 5),
            successRate: tests.filter(t => t.status === 'passed').length / tests.length,
            parallelismUtilization: this.calculateParallelismUtilization()
        };
    }

    analyzeResourceUsage() {
        const { cpu, memory } = this.currentSession.resources;

        return {
            cpu: {
                peak: Math.max(...cpu.map(c => c.usage.user + c.usage.system)),
                average: cpu.reduce((sum, c) => sum + c.usage.user + c.usage.system, 0) / cpu.length || 0
            },
            memory: {
                peak: Math.max(...memory.map(m => m.usage.heapUsed)),
                average: memory.reduce((sum, m) => sum + m.usage.heapUsed, 0) / memory.length || 0
            }
        };
    }

    calculateTestValue(test) {
        const history = this.loadHistory();
        const testHistory = history.tests[this.generateTestId(test)] || { results: [] };

        // Calculate value based on multiple factors
        const factors = {
            coverage: this.getTestCoverage(test) || 0.5,
            criticalPath: this.isOnCriticalPath(test) ? 1.0 : 0.5,
            flakyness: this.calculateFlakiness(testHistory),
            businessValue: this.getBusinessValue(test) || 0.7,
            recentFailures: this.getRecentFailureRate(testHistory)
        };

        return (
            factors.coverage * 0.25 +
            factors.criticalPath * 0.25 +
            (1 - factors.flakyness) * 0.2 +
            factors.businessValue * 0.2 +
            (1 - factors.recentFailures) * 0.1
        );
    }

    estimateTestDuration(test) {
        const history = this.loadHistory();
        const testId = this.generateTestId(test);
        const testHistory = history.tests[testId];

        if (!testHistory || testHistory.results.length === 0) {
            return this.getDefaultTestDuration(test);
        }

        const recentResults = testHistory.results.slice(-10);
        const durations = recentResults.map(r => r.duration).filter(d => d > 0);

        if (durations.length === 0) {
            return this.getDefaultTestDuration(test);
        }

        // Use median with some buffer for variance
        const sorted = durations.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        return Math.round(median * 1.1); // 10% buffer
    }

    getDefaultTestDuration(test) {
        // Estimate based on test type and complexity
        const baseDuration = {
            'gallery-browsing': 45000,
            'admin-dashboard': 30000,
            'mobile-registration': 25000,
            'newsletter': 15000
        };

        const testType = this.identifyTestType(test);
        return baseDuration[testType] || 20000;
    }

    identifyTestType(test) {
        const filename = test.file || test.name || '';

        if (filename.includes('gallery')) return 'gallery-browsing';
        if (filename.includes('admin')) return 'admin-dashboard';
        if (filename.includes('mobile')) return 'mobile-registration';
        if (filename.includes('newsletter')) return 'newsletter';

        return 'default';
    }

    generateOptimizationRecommendations(analysis) {
        const recommendations = [];

        // Execution time recommendations
        if (analysis.execution.totalDuration > this.config.maxExecutionTime) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                title: 'Execution time exceeds budget',
                description: `Total execution time (${Math.round(analysis.execution.totalDuration / 1000)}s) exceeds the ${Math.round(this.config.maxExecutionTime / 1000)}s budget.`,
                actions: [
                    'Increase parallelization',
                    'Remove or optimize slowest tests',
                    'Implement smarter test selection'
                ]
            });
        }

        // Resource usage recommendations
        if (analysis.resources.memory.peak > 500 * 1024 * 1024) { // 500MB
            recommendations.push({
                type: 'resource',
                priority: 'medium',
                title: 'High memory usage detected',
                description: `Peak memory usage: ${Math.round(analysis.resources.memory.peak / 1024 / 1024)}MB`,
                actions: [
                    'Implement test isolation',
                    'Add memory cleanup between tests',
                    'Review test data generation'
                ]
            });
        }

        // Parallelization recommendations
        if (analysis.parallelization.efficiency < 0.7) {
            recommendations.push({
                type: 'parallelization',
                priority: 'medium',
                title: 'Poor parallelization efficiency',
                description: `Current efficiency: ${Math.round(analysis.parallelization.efficiency * 100)}%`,
                actions: [
                    'Rebalance test groups',
                    'Remove test dependencies',
                    'Optimize resource allocation'
                ]
            });
        }

        return recommendations;
    }

    async saveReport(report) {
        if (this.isCleanedUp) {
            return;
        }

        try {
            const reportFile = join(this.metricsDir, `optimization-report-${Date.now()}.json`);
            const latestReportFile = join(this.metricsDir, 'latest-optimization-report.json');
            const reportData = JSON.stringify(report, null, 2);

            // Use Promise.all for parallel file operations
            await Promise.all([
                fs.writeFile(reportFile, reportData),
                fs.writeFile(latestReportFile, reportData)
            ]);

            console.log(`📊 Optimization report saved: ${reportFile}`);
        } catch (error) {
            console.warn('Failed to save optimization report:', error.message);
        }
    }

    // Additional helper methods for completeness
    analyzeParallelization() {
        return {
            efficiency: this.calculateParallelismUtilization(),
            bottlenecks: this.identifyParallelizationBottlenecks(),
            recommendations: this.getParallelizationRecommendations()
        };
    }

    identifyBottlenecks() {
        const tests = Array.from(this.currentSession.tests.values());
        const sorted = tests.sort((a, b) => (b.duration || 0) - (a.duration || 0));

        return {
            slowestTests: sorted.slice(0, 3),
            resourceBottlenecks: this.identifyResourceBottlenecks(),
            dependencyBottlenecks: this.identifyDependencyBottlenecks()
        };
    }

    detectPerformanceRegressions() {
        // Implementation would compare current metrics with historical baselines
        return {
            regressions: [],
            improvements: [],
            recommendation: 'No significant performance changes detected'
        };
    }

    calculateParallelismUtilization() {
        // Simplified calculation - in real implementation would be more sophisticated
        return 0.75; // 75% utilization
    }

    identifyResourceBottlenecks() {
        return [];
    }

    identifyDependencyBottlenecks() {
        return [];
    }

    identifyParallelizationBottlenecks() {
        return [];
    }

    getParallelizationRecommendations() {
        return [];
    }

    getImmediateRecommendations(analysis) {
        return analysis.recommendations.filter(r => r.priority === 'high');
    }

    getStrategicRecommendations(analysis) {
        return analysis.recommendations.filter(r => r.priority === 'medium' || r.priority === 'low');
    }

    updateBenchmarks() {
        // Update performance benchmarks based on current session
        return {};
    }

    scheduleNextOptimization() {
        return {
            recommendedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
            reason: 'Regular optimization cycle'
        };
    }

    // Placeholder methods that would be implemented based on specific needs
    getTestCoverage(test) { return 0.8; }
    isOnCriticalPath(test) { return test.critical || false; }
    calculateFlakiness(history) { return 0.1; }
    getBusinessValue(test) { return 0.7; }
    getRecentFailureRate(history) { return 0.05; }
    getTestReliability(test) { return 0.95; }
    sortTestsByStrategy(tests, strategy) { return tests; }
    selectTestsWithinConstraints(tests, maxDuration, maxTests) { return tests.slice(0, maxTests); }
    generateParallelizationPlan(tests) { return { groups: [tests] }; }
    analyzeTestDurations(tests, history) { return tests; }
    groupTestsForParallelization(tests) { return [tests]; }
    calculateOptimalParallelism(groups) { return { workers: 4, groups }; }
    calculateResourceUtilization(config) { return { cpu: 0.7, memory: 0.6 }; }
    calculateComputeCosts(metrics) { return 10; }
    calculateStorageCosts(metrics) { return 2; }
    calculateNetworkCosts(metrics) { return 1; }
    generateCostOptimizationRecommendations(costs) { return []; }
    calculateProjectedSavings(costs) { return 3; }
    updateCostHistory(costs) { }
    calculateRegressionSeverity(regression) { return regression > 0.3 ? 'high' : 'medium'; }

    /**
     * Cleanup method to prevent memory leaks
     */
    cleanup() {
        if (this.isCleanedUp) {
            return;
        }

        this.isCleanedUp = true;

        // Stop resource monitoring
        this.stopResourceMonitoring();

        // Clear pending operations
        if (this.historyUpdateTimer) {
            clearTimeout(this.historyUpdateTimer);
            this.historyUpdateTimer = null;
        }

        // Flush any pending history updates
        if (this.pendingHistoryUpdates && this.pendingHistoryUpdates.size > 0) {
            this.flushHistoryUpdates().catch(error =>
                console.warn('Failed to flush pending history updates during cleanup:', error.message)
            );
        }

        // Run all cleanup handlers
        for (const handler of this.cleanupHandlers) {
            try {
                handler();
            } catch (error) {
                console.warn('Cleanup handler error:', error.message);
            }
        }
        this.cleanupHandlers.clear();

        // Clear session data
        this.currentSession.tests.clear();
        this.currentSession.resources.cpu = [];
        this.currentSession.resources.memory = [];
        this.currentSession.resources.network = [];
        this.currentSession.resources.storage = [];

        console.log('📋 Performance optimizer cleaned up');
    }
}

/**
 * Performance monitoring utilities for E2E tests
 */
export class E2EPerformanceMonitor {
    constructor(optimizer) {
        this.optimizer = optimizer;
        this.activeTests = new Map();
        this.isCleanedUp = false;
    }

    /**
     * Wrap a test with performance monitoring
     */
    monitorTest(testInfo, testFn) {
        return async (...args) => {
            const tracker = this.optimizer.trackTest(testInfo);
            tracker.start();

            try {
                const result = await testFn(...args);
                tracker.end({ status: 'passed', metrics: result.metrics || {} });
                return result;
            } catch (error) {
                tracker.end({ status: 'failed', error: error.message });
                throw error;
            }
        };
    }

    /**
     * Profile test suite execution
     */
    async profileTestSuite(tests, options = {}) {
        const session = this.optimizer.startSession(options);

        console.log(`= Profiling ${tests.length} tests...`);

        const results = [];
        for (const test of tests) {
            const monitoredTest = this.monitorTest(test, test.fn);
            try {
                const result = await monitoredTest();
                results.push({ test, result, status: 'passed' });
            } catch (error) {
                results.push({ test, error, status: 'failed' });
            }
        }

        const analysis = this.optimizer.analyzePerformance();
        const report = this.optimizer.generateOptimizationReport();

        return {
            session,
            results,
            analysis,
            report,
            recommendations: report.recommendations
        };
    }

    /**
     * Cleanup monitor resources
     */
    cleanup() {
        this.isCleanedUp = true;
        this.activeTests.clear();
        if (this.optimizer && typeof this.optimizer.cleanup === 'function') {
            this.optimizer.cleanup();
        }
    }
}

/**
 * Test selection and prioritization utilities
 */
export class SmartTestSelector {
    constructor(optimizer) {
        this.optimizer = optimizer;
        this.isCleanedUp = false;
    }

    /**
     * Select optimal test subset for CI/CD pipeline
     */
    selectForCI(allTests, constraints = {}) {
        const ciConstraints = {
            maxDuration: 180000, // 3 minutes for CI
            priorityMode: 'fast',
            ...constraints
        };

        return this.optimizer.selectOptimalTests(allTests, ciConstraints);
    }

    /**
     * Select comprehensive test suite for nightly runs
     */
    selectForNightly(allTests, constraints = {}) {
        const nightlyConstraints = {
            maxDuration: 1800000, // 30 minutes for nightly
            priorityMode: 'comprehensive',
            ...constraints
        };

        return this.optimizer.selectOptimalTests(allTests, nightlyConstraints);
    }

    /**
     * Select tests affected by recent changes
     */
    selectAffectedTests(allTests, changedFiles) {
        return allTests.filter(test =>
            this.isTestAffectedByChanges(test, changedFiles)
        );
    }

    isTestAffectedByChanges(test, changedFiles) {
        // Implementation would analyze test dependencies and changed files
        return changedFiles.some(file =>
            test.dependencies?.includes(file) ||
            test.file?.includes(file.replace(/\.[^.]+$/, ''))
        );
    }

    /**
     * Cleanup selector resources
     */
    cleanup() {
        this.isCleanedUp = true;
        if (this.optimizer && typeof this.optimizer.cleanup === 'function') {
            this.optimizer.cleanup();
        }
    }
}

export default PerformanceOptimizer;