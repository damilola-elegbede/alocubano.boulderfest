#!/usr/bin/env node

/**
 * CI Performance Optimizer and Monitoring
 * 
 * Optimizes CI pipeline performance to meet <5 minute execution targets:
 * - Intelligent test parallelization and resource allocation
 * - Dependency caching optimization with cache-aware installation
 * - Browser installation caching and selective updates
 * - Resource usage monitoring and cost optimization
 * - Performance metrics tracking with regression detection
 * - CI pipeline efficiency analysis and recommendations
 * 
 * Target: Complete E2E test suite execution in under 5 minutes consistently
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { mkdir, access } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// CI Performance Manager using Promise-based Singleton Pattern
class CIPerformanceManager {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.state = {
      startTime: Date.now(),
      executionMetrics: new Map(),
      cacheMetrics: new Map(),
      resourceUsage: {
        memory: { max: 0, current: 0, average: 0, samples: [] },
        cpu: { max: 0, current: 0, average: 0, samples: [] },
        network: { totalBytes: 0, requests: 0 }
      },
      optimizations: [],
      recommendations: [],
      parallelization: {
        maxWorkers: process.env.CI ? 2 : 4,
        optimalWorkers: 2,
        browserDistribution: new Map()
      }
    };
  }

  async ensureInitialized() {
    if (this.initialized) {
      return this.state;
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._performInitialization();
    
    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      return result;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    console.log('📊 Initializing CI Performance Optimizer...');
    
    // Create directories for metrics and reports
    await this._initializeDirectories();
    
    // Load existing performance baselines
    await this._loadPerformanceBaselines();
    
    // Detect optimal parallelization settings
    await this._calculateOptimalParallelization();
    
    console.log(' CI Performance Optimizer initialized');
    return this.state;
  }

  async _initializeDirectories() {
    const directories = [
      '.tmp/performance',
      '.tmp/cache-metrics', 
      '.tmp/resource-usage',
      'reports/ci-performance',
      'reports/cache-analysis'
    ];

    for (const dir of directories) {
      const fullPath = resolve(projectRoot, dir);
      try {
        await mkdir(fullPath, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  async _loadPerformanceBaselines() {
    const baselinePath = resolve(projectRoot, '.tmp/performance/baselines.json');
    
    if (existsSync(baselinePath)) {
      try {
        const baselines = JSON.parse(readFileSync(baselinePath, 'utf8'));
        this.state.baselines = baselines;
        console.log('📊 Loaded performance baselines:', Object.keys(baselines).length, 'metrics');
      } catch (error) {
        console.warn('📊 Failed to load performance baselines:', error.message);
        this.state.baselines = {};
      }
    } else {
      this.state.baselines = {};
    }
  }

  async _calculateOptimalParallelization() {
    // Detect CI environment resources
    const cpuCount = process.env.CI ? 2 : 4; // GitHub Actions runners typically have 2 cores
    const memoryGB = process.env.CI ? 7 : 8; // GitHub Actions runners have ~7GB
    
    // Calculate optimal workers based on:
    // - Browser memory usage (Chrome ~500MB, Firefox ~400MB, Safari ~450MB)
    // - Test execution patterns
    // - CI resource constraints
    
    const browserMemoryUsage = {
      chromium: 500,
      firefox: 400, 
      webkit: 450,
      'mobile-chrome': 400,
      'mobile-safari': 350
    };
    
    const totalBrowsers = Object.keys(browserMemoryUsage).length;
    const estimatedMemoryUsage = Object.values(browserMemoryUsage).reduce((sum, mem) => sum + mem, 0);
    
    // Reserve memory for Node.js, test runner, and system
    const availableMemory = (memoryGB * 1024) - 1024; // Reserve 1GB
    
    const optimalWorkers = Math.min(
      cpuCount,
      Math.floor(availableMemory / (estimatedMemoryUsage / totalBrowsers)),
      4 // Maximum practical limit
    );
    
    this.state.parallelization.optimalWorkers = optimalWorkers;
    this.state.parallelization.maxWorkers = optimalWorkers;
    
    console.log(`>📊 Calculated optimal parallelization: ${optimalWorkers} workers (CPU: ${cpuCount}, Memory: ${memoryGB}GB)`);
  }

  recordExecutionMetric(phase, duration, metadata = {}) {
    this.state.executionMetrics.set(phase, {
      duration,
      metadata,
      timestamp: Date.now()
    });
  }

  recordCacheMetric(cacheType, hit, size = 0) {
    if (!this.state.cacheMetrics.has(cacheType)) {
      this.state.cacheMetrics.set(cacheType, { hits: 0, misses: 0, totalSize: 0 });
    }
    
    const cache = this.state.cacheMetrics.get(cacheType);
    if (hit) {
      cache.hits++;
    } else {
      cache.misses++;
    }
    cache.totalSize += size;
  }

  recordResourceUsage() {
    try {
      const memUsage = process.memoryUsage();
      const currentMemory = Math.round(memUsage.heapUsed / 1024 / 1024); // MB
      
      // Add bounds checking to prevent memory exhaustion
      if (currentMemory < 0 || currentMemory > 32000) { // 32GB upper bound
        console.warn(`⚠️  Invalid memory reading: ${currentMemory}MB`);
        return;
      }
      
      this.state.resourceUsage.memory.current = currentMemory;
      this.state.resourceUsage.memory.max = Math.max(
        this.state.resourceUsage.memory.max,
        currentMemory
      );
      
      // Prevent memory leak in samples array
      const samples = this.state.resourceUsage.memory.samples;
      samples.push(currentMemory);
      
      // Aggressively limit samples to prevent memory growth
      const maxSamples = 50; // Reduced from 100
      if (samples.length > maxSamples) {
        // Remove oldest samples more aggressively
        samples.splice(0, samples.length - maxSamples);
      }
      
      // Calculate running average with safety check
      if (samples.length > 0) {
        this.state.resourceUsage.memory.average = Math.round(
          samples.reduce((sum, val) => sum + val, 0) / samples.length
        );
      }
      
      // Trigger garbage collection if memory usage is high
      if (currentMemory > 1000 && global.gc) { // 1GB threshold
        try {
          global.gc();
        } catch (gcError) {
          // GC not available, ignore
        }
      }
    } catch (error) {
      console.warn(`⚠️  Resource usage recording error: ${error.message}`);
    }
  }

  addOptimization(type, description, impact) {
    this.state.optimizations.push({
      type,
      description,
      impact,
      timestamp: Date.now()
    });
  }

  addRecommendation(priority, description, estimatedSavings) {
    this.state.recommendations.push({
      priority,
      description,
      estimatedSavings,
      timestamp: Date.now()
    });
  }
}

// Global performance manager instance
const performanceManager = new CIPerformanceManager();

/**
 * Intelligent Dependency Caching
 */
async function optimizeDependencyCaching() {
  console.log('\n=📊 Optimizing dependency caching...');
  const startTime = Date.now();
  
  const lockFilePath = resolve(projectRoot, 'package-lock.json');
  const nodeModulesPath = resolve(projectRoot, 'node_modules');
  
  if (!existsSync(lockFilePath)) {
    console.warn('📊 package-lock.json not found, skipping cache optimization');
    return;
  }
  
  // Calculate cache key based on lock file content
  const lockContent = readFileSync(lockFilePath, 'utf8');
  const cacheKey = createHash('sha256').update(lockContent).digest('hex').substring(0, 16);
  
  // Check if node_modules exists and is current
  const nodeModulesExists = existsSync(nodeModulesPath);
  let cacheHit = false;
  
  if (nodeModulesExists) {
    try {
      const lockStat = statSync(lockFilePath);
      const nodeModulesStat = statSync(nodeModulesPath);
      
      if (nodeModulesStat.mtime > lockStat.mtime) {
        console.log(' Dependencies cache hit - node_modules is up to date');
        cacheHit = true;
        performanceManager.recordCacheMetric('dependencies', true);
      }
    } catch (error) {
      console.warn('📊 Failed to check dependency cache:', error.message);
    }
  }
  
  if (!cacheHit) {
    console.log('=📊 Dependencies cache miss - installing...');
    performanceManager.recordCacheMetric('dependencies', false);
    
    // Optimize npm install with CI-friendly flags
    const npmArgs = [
      'ci',
      '--prefer-offline',
      '--no-audit', 
      '--no-fund',
      '--progress=false',
      '--loglevel=error'
    ];
    
    if (process.env.CI) {
      npmArgs.push('--cache', './.npm-cache');
    }
    
    const installStart = Date.now();
    await runCommand('npm', npmArgs, 'Dependency installation');
    const installDuration = Date.now() - installStart;
    
    performanceManager.recordExecutionMetric('dependency_install', installDuration);
    
    if (installDuration > 60000) { // More than 1 minute
      performanceManager.addRecommendation(
        'medium',
        'Consider using npm ci cache or switching to pnpm for faster installs',
        `${Math.round((installDuration - 30000) / 1000)}s`
      );
    }
  }
  
  const duration = Date.now() - startTime;
  console.log(`📊 Dependency caching completed in ${duration}ms`);
}

/**
 * Browser Installation Optimization with Caching
 */
async function optimizeBrowserInstallation() {
  console.log('\n<📊 Optimizing browser installation...');
  const startTime = Date.now();
  
  // Check if browsers are already installed
  const playwrightCachePath = process.env.PLAYWRIGHT_BROWSERS_PATH || 
    resolve(process.env.HOME || '/tmp', '.cache/ms-playwright');
  
  let browsersInstalled = false;
  try {
    if (existsSync(playwrightCachePath)) {
      // Check if Chromium executable exists as a proxy for browser installation
      const chromiumExists = await checkBrowserExists('chromium');
      if (chromiumExists) {
        console.log(' Browsers cache hit - using cached installation');
        browsersInstalled = true;
        performanceManager.recordCacheMetric('browsers', true);
      }
    }
  } catch (error) {
    console.warn('📊 Failed to check browser cache:', error.message);
  }
  
  if (!browsersInstalled) {
    console.log('=📊 Browsers cache miss - installing...');
    performanceManager.recordCacheMetric('browsers', false);
    
    const installStart = Date.now();
    
    // Install only required browsers for current test run
    const requiredBrowsers = process.env.PLAYWRIGHT_BROWSERS || 'chromium firefox webkit';
    const browsers = requiredBrowsers.split(' ');
    
    try {
      await runCommand('npx', [
        'playwright',
        'install',
        ...browsers,
        '--with-deps'
      ], 'Browser installation');
      
      const installDuration = Date.now() - installStart;
      performanceManager.recordExecutionMetric('browser_install', installDuration);
      
      if (installDuration > 120000) { // More than 2 minutes
        performanceManager.addRecommendation(
          'high',
          'Browser installation is slow - ensure browsers are cached between CI runs',
          `${Math.round((installDuration - 60000) / 1000)}s`
        );
      }
      
    } catch (error) {
      console.warn('📊 Browser installation failed, trying dependencies only:', error.message);
      
      // Fallback: install system dependencies only
      await runCommand('npx', [
        'playwright',
        'install-deps'
      ], 'Browser dependencies installation');
    }
  } else {
    // Even with cached browsers, we might need to update system dependencies
    try {
      await runCommand('npx', ['playwright', 'install-deps'], 'System dependencies update');
    } catch (error) {
      console.warn('📊 System dependencies update failed:', error.message);
    }
  }
  
  const duration = Date.now() - startTime;
  console.log(`📊 Browser optimization completed in ${duration}ms`);
}

/**
 * Intelligent Test Parallelization
 */
async function optimizeTestParallelization() {
  console.log('\n📊 Optimizing test parallelization...');
  const startTime = Date.now();
  
  const state = await performanceManager.ensureInitialized();
  
  // Analyze test patterns to optimize browser distribution
  const testFiles = await findTestFiles();
  const totalTests = testFiles.length;
  
  console.log(`=📊 Found ${totalTests} test files`);
  
  // Calculate optimal worker distribution per browser
  const browsers = ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'];
  const workersPerBrowser = Math.max(1, Math.floor(state.parallelization.optimalWorkers / browsers.length));
  
  // Set environment variables for optimal execution
  process.env.PLAYWRIGHT_WORKERS = workersPerBrowser.toString();
  process.env.PLAYWRIGHT_MAX_FAILURES = '3'; // Fail fast to save time
  
  console.log(`<📊 Optimized parallelization: ${workersPerBrowser} workers per browser`);
  
  performanceManager.addOptimization(
    'parallelization',
    `Set optimal worker count: ${workersPerBrowser} per browser`,
    'high'
  );
  
  const duration = Date.now() - startTime;
  performanceManager.recordExecutionMetric('parallelization_optimization', duration);
  
  return {
    workersPerBrowser,
    totalWorkers: workersPerBrowser * browsers.length,
    estimatedTimeReduction: '30-50%'
  };
}

/**
 * Resource Usage Monitoring
 */
async function monitorResourceUsage() {
  console.log('\n=📊 Starting resource usage monitoring...');
  
  // Start periodic resource monitoring
  const monitoringInterval = setInterval(() => {
    performanceManager.recordResourceUsage();
  }, 1000); // Every second
  
  // Return cleanup function
  return () => {
    clearInterval(monitoringInterval);
    console.log('=📊 Resource monitoring stopped');
    
    const state = performanceManager.state.resourceUsage;
    console.log(`   =📊 Memory usage - Max: ${state.memory.max}MB, Avg: ${state.memory.average}MB`);
    
    // Add recommendations based on resource usage
    if (state.memory.max > 1500) { // More than 1.5GB
      performanceManager.addRecommendation(
        'high',
        'High memory usage detected - consider reducing parallel workers or optimizing test isolation',
        '15-30s'
      );
    }
  };
}

/**
 * CI Pipeline Efficiency Analysis
 */
async function analyzePipelineEfficiency() {
  console.log('\n📊 Analyzing CI pipeline efficiency...');
  const startTime = Date.now();
  
  const state = await performanceManager.ensureInitialized();
  const metrics = state.executionMetrics;
  
  // Calculate total execution time from metrics
  let totalDuration = 0;
  const phases = [];
  
  for (const [phase, data] of metrics) {
    totalDuration += data.duration;
    phases.push({
      phase,
      duration: data.duration,
      percentage: 0 // Will calculate after total is known
    });
  }
  
  // Calculate percentages
  phases.forEach(phase => {
    phase.percentage = Math.round((phase.duration / totalDuration) * 100);
  });
  
  // Sort by duration (longest first)
  phases.sort((a, b) => b.duration - a.duration);
  
  console.log('=📊 Pipeline phase analysis:');
  phases.forEach(phase => {
    const seconds = Math.round(phase.duration / 1000);
    console.log(`   ${phase.phase}: ${seconds}s (${phase.percentage}%)`);
  });
  
  // Generate efficiency recommendations
  const longestPhase = phases[0];
  if (longestPhase && longestPhase.duration > 120000) { // More than 2 minutes
    performanceManager.addRecommendation(
      'high',
      `${longestPhase.phase} phase is taking too long (${Math.round(longestPhase.duration/1000)}s) - investigate optimization opportunities`,
      '60-120s'
    );
  }
  
  // Overall efficiency score (target: under 5 minutes = 300s)
  const targetDuration = 300000; // 5 minutes in ms
  const efficiencyScore = Math.max(0, Math.min(100, (targetDuration / totalDuration) * 100));
  
  console.log(`<📊 Pipeline efficiency score: ${Math.round(efficiencyScore)}% (target: 100%)`);
  
  if (totalDuration > targetDuration) {
    const excessTime = Math.round((totalDuration - targetDuration) / 1000);
    console.log(`📊 Pipeline exceeds 5-minute target by ${excessTime}s`);
    
    performanceManager.addRecommendation(
      'critical',
      'Pipeline exceeds 5-minute target - implement aggressive optimizations',
      `${excessTime}s`
    );
  } else {
    const timeBuffer = Math.round((targetDuration - totalDuration) / 1000);
    console.log(` Pipeline within target with ${timeBuffer}s buffer`);
  }
  
  const duration = Date.now() - startTime;
  performanceManager.recordExecutionMetric('efficiency_analysis', duration);
  
  return {
    totalDuration,
    efficiencyScore,
    phases,
    recommendations: state.recommendations
  };
}

/**
 * Performance Metrics Tracking and Regression Detection
 */
async function trackPerformanceMetrics() {
  console.log('\n=📊 Tracking performance metrics...');
  const startTime = Date.now();
  
  const state = await performanceManager.ensureInitialized();
  
  // Create performance report
  const report = {
    timestamp: new Date().toISOString(),
    ciRun: process.env.GITHUB_RUN_NUMBER || Date.now().toString(),
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'unknown',
    commit: process.env.GITHUB_SHA?.substring(0, 8) || 'unknown',
    metrics: {
      execution: Object.fromEntries(state.executionMetrics),
      cache: Object.fromEntries(state.cacheMetrics),
      resources: state.resourceUsage
    },
    optimizations: state.optimizations,
    recommendations: state.recommendations
  };
  
  // Save performance report
  const reportPath = resolve(projectRoot, '.tmp/performance/ci-performance-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`=📊 Performance report saved: ${reportPath}`);
  
  // Compare against baselines for regression detection
  await detectPerformanceRegressions(report);
  
  // Update baselines if this is a main branch build
  if (process.env.GITHUB_REF_NAME === 'main' || process.env.GITHUB_REF === 'refs/heads/main') {
    await updatePerformanceBaselines(report);
  }
  
  const duration = Date.now() - startTime;
  console.log(`📊 Performance tracking completed in ${duration}ms`);
  
  return report;
}

/**
 * Performance Regression Detection
 */
async function detectPerformanceRegressions(currentReport) {
  console.log('📊 Detecting performance regressions...');
  
  const state = await performanceManager.ensureInitialized();
  const baselines = state.baselines;
  
  if (!baselines || Object.keys(baselines).length === 0) {
    console.log('9 No performance baselines available - skipping regression detection');
    console.log('ℹ️  No performance baselines available - skipping regression detection');
  }
  
  const regressions = [];
  const threshold = 0.15; // 15% degradation threshold
  
  // Check execution metrics for regressions
  for (const [phase, current] of Object.entries(currentReport.metrics.execution)) {
    const baseline = baselines[phase];
    
    if (baseline && baseline.duration) {
      const degradation = (current.duration - baseline.duration) / baseline.duration;
      
      if (degradation > threshold) {
        const regressionPercent = Math.round(degradation * 100);
        const regressionTime = Math.round((current.duration - baseline.duration) / 1000);
        
        regressions.push({
          phase,
          type: 'execution_time',
          degradation: regressionPercent,
          regressionTime,
          current: current.duration,
          baseline: baseline.duration
        });
        
        console.log(`📊 Performance regression detected in ${phase}: +${regressionPercent}% (+${regressionTime}s)`);
      }
    }
  }
  
  // Check cache hit rates
  for (const [cacheType, current] of Object.entries(currentReport.metrics.cache)) {
    const baseline = baselines.cache?.[cacheType];
    
    if (baseline && baseline.hits && baseline.misses) {
      const currentHitRate = current.hits / (current.hits + current.misses);
      const baselineHitRate = baseline.hits / (baseline.hits + baseline.misses);
      const hitRateDrop = baselineHitRate - currentHitRate;
      
      if (hitRateDrop > 0.1) { // 10% hit rate drop
        regressions.push({
          phase: cacheType,
          type: 'cache_hit_rate',
          degradation: Math.round(hitRateDrop * 100),
          current: Math.round(currentHitRate * 100),
          baseline: Math.round(baselineHitRate * 100)
        });
        
        console.log(`📊 Cache hit rate regression in ${cacheType}: -${Math.round(hitRateDrop * 100)}%`);
      }
    }
  }
  
  if (regressions.length === 0) {
    console.log(' No performance regressions detected');
  }
  
  return regressions;
}

/**
 * Update Performance Baselines
 */
async function updatePerformanceBaselines(report) {
  console.log('=📊 Updating performance baselines...');
  
  const baselinePath = resolve(projectRoot, '.tmp/performance/baselines.json');
  
  // Create baseline from current metrics
  const newBaselines = {
    ...report.metrics.execution,
    cache: report.metrics.cache,
    resources: {
      memory: report.metrics.resources.memory.max,
      average_memory: report.metrics.resources.memory.average
    },
    updatedAt: report.timestamp,
    commit: report.commit,
    branch: report.branch
  };
  
  writeFileSync(baselinePath, JSON.stringify(newBaselines, null, 2));
  console.log(' Performance baselines updated');
}

/**
 * Generate Final Performance Report
 */
async function generatePerformanceReport() {
  console.log('\n=📊 Generating final performance report...');
  
  const state = await performanceManager.ensureInitialized();
  const totalDuration = Date.now() - state.startTime;
  
  // Calculate efficiency metrics
  const analysis = await analyzePipelineEfficiency();
  
  // Generate summary
  const summary = {
    executionTime: Math.round(totalDuration / 1000),
    targetTime: 300, // 5 minutes
    efficiency: analysis.efficiencyScore,
    withinTarget: totalDuration <= 300000,
    optimizations: state.optimizations.length,
    recommendations: state.recommendations.length,
    cacheHitRate: calculateOverallCacheHitRate()
  };
  
  console.log('\n<📊 CI Performance Summary');
  console.log('='.repeat(50));
  console.log(`Total execution time: ${summary.executionTime}s`);
  console.log(`Target execution time: ${summary.targetTime}s`);
  console.log(`Efficiency score: ${Math.round(summary.efficiency)}%`);
  console.log(`Within target: ${summary.withinTarget ? ' Yes' : '❌ No'}`);
  console.log(`Cache hit rate: ${Math.round(summary.cacheHitRate * 100)}%`);
  console.log(`Optimizations applied: ${summary.optimizations}`);
  console.log(`Recommendations: ${summary.recommendations}`);
  console.log('='.repeat(50));
  
  // Print recommendations if any
  if (state.recommendations.length > 0) {
    console.log('\n=📊 Performance Recommendations:');
    state.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.description}`);
      if (rec.estimatedSavings) {
        console.log(`   =📊 Estimated savings: ${rec.estimatedSavings}`);
      }
    });
  }
  
  // Save final report
  const reportPath = resolve(projectRoot, 'reports/ci-performance/final-report.json');
  const finalReport = {
    summary,
    analysis,
    state: {
      metrics: Object.fromEntries(state.executionMetrics),
      cache: Object.fromEntries(state.cacheMetrics),
      resources: state.resourceUsage,
      optimizations: state.optimizations,
      recommendations: state.recommendations
    },
    timestamp: new Date().toISOString()
  };
  
  writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
  console.log(`=📊 Final performance report saved: ${reportPath}`);
  
  return finalReport;
}

/**
 * Helper Functions
 */
async function checkBrowserExists(browser) {
  let childProcess = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const result = await runCommand('npx', ['playwright', 'install', browser, '--dry-run'], null, { 
      stdio: 'pipe',
      timeout: 5000,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch (error) {
    // Ensure any spawned process is properly cleaned up
    if (childProcess && !childProcess.killed) {
      try {
        childProcess.kill('SIGTERM');
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 1000);
      } catch (killError) {
        console.warn(`⚠️  Failed to cleanup browser check process: ${killError.message}`);
      }
    }
    return false;
  }
}

async function findTestFiles() {
  try {
    const result = await runCommand('find', [
      resolve(projectRoot, 'tests/e2e'),
      '-name', '*.test.js',
      '-o', '-name', '*.e2e.js',
      '-o', '-name', '*.spec.js'
    ], null, { stdio: 'pipe' });
    
    return result.stdout.split('\n').filter(line => line.trim());
  } catch (error) {
    console.warn('📊 Failed to find test files:', error.message);
    return [];
  }
}

function calculateOverallCacheHitRate() {
  const state = performanceManager.state.cacheMetrics;
  let totalHits = 0;
  let totalRequests = 0;
  
  for (const [, cache] of state) {
    totalHits += cache.hits;
    totalRequests += cache.hits + cache.misses;
  }
  
  return totalRequests > 0 ? totalHits / totalRequests : 0;
}

async function runCommand(command, args, description = null, options = {}) {
  return new Promise((resolve, reject) => {
    if (description) {
      console.log(`=' ${description}...`);
    }
    
    let isResolved = false;
    let timeoutId = null;
    
    try {
      const child = spawn(command, args, {
        cwd: projectRoot,
        stdio: options.stdio || 'inherit',
        ...options
      });
      
      let stdout = '';
      let stderr = '';
      
      // Prevent memory exhaustion from large outputs
      const maxOutputSize = 10 * 1024 * 1024; // 10MB limit
      
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          if (stdout.length < maxOutputSize) {
            stdout += data.toString();
          } else {
            console.warn(`⚠️  Stdout truncated due to size limit`);
          }
        });
      }
      
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          if (stderr.length < maxOutputSize) {
            stderr += data.toString();
          } else {
            console.warn(`⚠️  Stderr truncated due to size limit`);
          }
        });
      }
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (!child.killed) {
          try {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            }, 2000);
          } catch (killError) {
            // Process may already be terminated
          }
        }
      };
      
      child.on('close', (code, signal) => {
        if (isResolved) return;
        isResolved = true;
        
        if (timeoutId) clearTimeout(timeoutId);
        
        if (code === 0) {
          resolve({ stdout, stderr, code, signal });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });
      
      child.on('error', (error) => {
        if (isResolved) return;
        isResolved = true;
        
        cleanup();
        reject(error);
      });
      
      // Set up timeout with proper cleanup
      const timeoutMs = options.timeout || 120000; // Default 2 minutes
      timeoutId = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        
        console.warn(`⚠️  Command timeout after ${timeoutMs}ms`);
        cleanup();
        reject(new Error(`Command timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Handle process signals for graceful shutdown
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      
    } catch (spawnError) {
      if (timeoutId) clearTimeout(timeoutId);
      reject(spawnError);
    }
  });
}

/**
 * Main Optimization Function
 */
async function main() {
  const command = process.argv[2] || 'optimize';
  
  console.log('\n📊 CI Performance Optimizer');
  console.log('='.repeat(50));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Command: ${command}`);
  
  try {
    // Initialize performance manager
    await performanceManager.ensureInitialized();
    
    // Start resource monitoring
    const stopMonitoring = await monitorResourceUsage();
    
    switch (command) {
      case 'optimize':
        await optimizeDependencyCaching();
        await optimizeBrowserInstallation();
        await optimizeTestParallelization();
        break;
        
      case 'analyze':
        await analyzePipelineEfficiency();
        await trackPerformanceMetrics();
        break;
        
      case 'monitor':
        console.log('=📊 Monitoring mode - tracking resource usage...');
        // Keep monitoring until interrupted
        process.on('SIGINT', () => {
          stopMonitoring();
          process.exit(0);
        });
        return;
        
      case 'report':
        await generatePerformanceReport();
        break;
        
      default:
        console.error(`L Unknown command: ${command}`);
        console.log('Available commands: optimize, analyze, monitor, report');
        process.exit(1);
    }
    
    // Stop monitoring and generate final report
    stopMonitoring();
    const report = await generatePerformanceReport();
    
    console.log('\n CI Performance Optimization completed!');
    
    // Exit with appropriate code based on performance
    const withinTarget = Date.now() - performanceManager.state.startTime <= 300000; // 5 minutes
    process.exit(withinTarget ? 0 : 1);
    
  } catch (error) {
    console.error('\nL CI Performance Optimization failed:', error.message);
    console.log('='.repeat(50));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📊 Graceful shutdown requested...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n📊 Termination requested...');
  process.exit(0);
});

// Run main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;