#!/usr/bin/env node

/**
 * CI Resource Cleanup and Reporting
 * Comprehensive CI/CD pipeline cleanup script with resource management and metrics collection
 * Implements async initialization pattern and follows project conventions
 */

import { spawn } from 'child_process';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { rm } from 'fs/promises';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// CI Cleanup State Management (Promise-based singleton pattern)
class CICleanupManager {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.state = {
      startTime: Date.now(),
      processesTerminated: new Map(),
      resourcesFreed: new Map(),
      artifactsProcessed: [],
      metrics: {
        cleanupDuration: 0,
        memoryFreed: 0,
        diskSpaceFreed: 0,
        processesKilled: 0,
        artifactsCollected: 0,
        totalDuration: 0
      },
      errors: [],
      reports: []
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
    console.log('🧹 Initializing CI Cleanup Manager...');
    
    // Load existing setup state if available
    await this._loadSetupState();
    
    console.log('✅ CI Cleanup Manager initialized');
    return this.state;
  }

  async _loadSetupState() {
    const setupReportPath = resolve(projectRoot, '.tmp/ci/setup-report.json');
    
    if (existsSync(setupReportPath)) {
      try {
        const setupReport = JSON.parse(readFileSync(setupReportPath, 'utf-8'));
        this.state.setupReport = setupReport;
        console.log('📄 Loaded setup state from previous run');
      } catch (error) {
        console.log('⚠️  Failed to load setup state:', error.message);
      }
    }
  }

  recordProcessTermination(name, process, success = true) {
    this.state.processesTerminated.set(name, {
      pid: process.pid,
      success,
      terminatedAt: Date.now()
    });
    
    if (success) {
      this.state.metrics.processesKilled++;
    }
  }

  recordResourceFreed(resource, amount, unit = 'bytes') {
    this.state.resourcesFreed.set(resource, { amount, unit });
    
    if (unit === 'bytes') {
      this.state.metrics.memoryFreed += amount;
    }
  }

  recordError(error, context = 'unknown') {
    this.state.errors.push({
      error: error.message,
      context,
      timestamp: Date.now()
    });
  }

  addReport(type, path, metadata = {}) {
    this.state.reports.push({
      type,
      path,
      metadata,
      createdAt: Date.now()
    });
  }
}

// Global cleanup manager instance
const ciCleanup = new CICleanupManager();

/**
 * Process Termination and Memory Cleanup
 */
async function terminateProcesses() {
  console.log('\n🛑 Terminating CI processes...');
  const startTime = Date.now();

  // Get process information before termination
  const initialMemory = process.memoryUsage();

  // Find and terminate known CI processes
  const processPatterns = [
    'node.*ci-server.js',
    'node.*migrate-e2e.js', 
    'node.*setup-e2e-database.js',
    'vercel dev',
    'playwright',
    'chromium.*playwright',
    'firefox.*playwright',
    'webkit.*playwright'
  ];

  try {
    const runningProcesses = await findRunningProcesses(processPatterns);
    
    if (runningProcesses.length === 0) {
      console.log('   ℹ️  No CI processes found to terminate');
      return;
    }

    console.log(`   🔍 Found ${runningProcesses.length} processes to terminate`);

    // Terminate processes gracefully with proper race condition handling
    const terminationPromises = runningProcesses.map(async (processInfo) => {
      try {
        console.log(`   🛑 Terminating PID ${processInfo.pid}: ${processInfo.command}`);
        
        // Check if process still exists before attempting termination
        let processExists = false;
        try {
          process.kill(processInfo.pid, 0); // Check if process exists (doesn't kill)
          processExists = true;
        } catch (error) {
          console.log(`      ℹ️  PID ${processInfo.pid} already terminated`);
          ciCleanup.recordProcessTermination(`PID-${processInfo.pid}`, processInfo, true);
          return;
        }

        if (!processExists) return;

        // Try graceful shutdown first with timeout protection
        const gracefulShutdown = new Promise((resolve) => {
          try {
            process.kill(processInfo.pid, 'SIGTERM');
            
            // Poll for process termination instead of fixed wait
            const checkInterval = setInterval(() => {
              try {
                process.kill(processInfo.pid, 0); // Check if still exists
              } catch (error) {
                // Process terminated gracefully
                clearInterval(checkInterval);
                resolve({ success: true, method: 'graceful' });
              }
            }, 200); // Check every 200ms
            
            // Timeout after 5 seconds
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve({ success: false, method: 'timeout' });
            }, 5000);
          } catch (error) {
            resolve({ success: false, method: 'error', error });
          }
        });

        const shutdownResult = await gracefulShutdown;
        
        if (shutdownResult.success) {
          console.log(`      ✅ PID ${processInfo.pid} terminated gracefully`);
          ciCleanup.recordProcessTermination(`PID-${processInfo.pid}`, processInfo, true);
        } else {
          // Force termination after graceful timeout
          try {
            process.kill(processInfo.pid, 0); // Final check
            process.kill(processInfo.pid, 'SIGKILL');
            console.log(`      ⚡ Force killed PID ${processInfo.pid} after graceful timeout`);
            
            // Wait briefly to ensure process is cleaned up
            await new Promise(resolve => setTimeout(resolve, 500));
            ciCleanup.recordProcessTermination(`PID-${processInfo.pid}`, processInfo, true);
          } catch (error) {
            // Process may have terminated between checks
            console.log(`      ✅ PID ${processInfo.pid} terminated (cleanup race condition)`);
            ciCleanup.recordProcessTermination(`PID-${processInfo.pid}`, processInfo, true);
          }
        }
        
      } catch (error) {
        console.error(`      ❌ Failed to terminate PID ${processInfo.pid}: ${error.message}`);
        ciCleanup.recordProcessTermination(`PID-${processInfo.pid}`, processInfo, false);
        ciCleanup.recordError(error, `process_termination_${processInfo.pid}`);
      }
    });

    // Wait for all termination attempts to complete
    await Promise.allSettled(terminationPromises);

    // Force cleanup of any remaining browser processes
    await forceCleanupBrowsers();

    // Record memory cleanup
    const finalMemory = process.memoryUsage();
    const memoryFreed = initialMemory.heapUsed - finalMemory.heapUsed;
    ciCleanup.recordResourceFreed('heap_memory', Math.max(0, memoryFreed), 'bytes');

    console.log(`   ✅ Process termination completed in ${Date.now() - startTime}ms`);
    
  } catch (error) {
    console.error(`   ❌ Process termination failed: ${error.message}`);
    ciCleanup.recordError(error, 'process_termination');
  }
}

/**
 * Find running processes matching patterns
 */
async function findRunningProcesses(patterns) {
  return new Promise((resolve, reject) => {
    // Add timeout protection to prevent hanging
    const timeout = setTimeout(() => {
      ps.kill('SIGKILL');
      resolve([]); // Return empty on timeout rather than hanging
    }, 10000);

    const ps = spawn('ps', ['aux'], { 
      stdio: 'pipe',
      timeout: 8000 // Built-in timeout
    });
    let output = '';

    ps.stdout.on('data', (data) => {
      output += data.toString();
      // Prevent memory exhaustion from very large output
      if (output.length > 1024 * 1024) { // 1MB limit
        ps.kill('SIGTERM');
        clearTimeout(timeout);
        resolve([]);
      }
    });

    ps.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        resolve([]); // Return empty on error
        return;
      }

      try {
        const lines = output.split('\n').slice(1); // Skip header
        const processes = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          
          const parts = line.trim().split(/\s+/);
          if (parts.length < 11) continue;

          const pid = parseInt(parts[1]);
          
          // Validate PID to prevent injection attacks
          if (!pid || pid <= 0 || pid > 65535) continue;
          
          // Sanitize command string to prevent injection
          const command = parts.slice(10).join(' ').replace(/[^\w\s\-\.\/]/g, '');

          // Check if command matches any pattern with safe regex
          for (const pattern of patterns) {
            try {
              const regex = new RegExp(pattern, 'i');
              if (regex.test(command)) {
                processes.push({ pid, command: command.substring(0, 200), pattern });
                break;
              }
            } catch (regexError) {
              // Skip invalid regex patterns
              console.warn(`   ⚠️  Invalid regex pattern skipped: ${pattern}`);
              continue;
            }
          }
        }

        resolve(processes);
      } catch (parseError) {
        console.warn(`   ⚠️  Process parsing error: ${parseError.message}`);
        resolve([]);
      }
    });

    ps.on('error', (error) => {
      clearTimeout(timeout);
      console.warn(`   ⚠️  Process search error: ${error.message}`);
      resolve([]); // Return empty array on error
    });
  });
}

/**
 * Force cleanup of browser processes
 */
async function forceCleanupBrowsers() {
  console.log('   🔧 Force cleaning browser processes...');
  
  const browserCommands = [
    'pkill -f "chromium.*playwright"',
    'pkill -f "firefox.*playwright"', 
    'pkill -f "webkit.*playwright"',
    'pkill -f "msedge.*playwright"'
  ];

  for (const cmd of browserCommands) {
    try {
      await new Promise((resolve) => {
        const cleanup = spawn('sh', ['-c', cmd], { stdio: 'pipe' });
        cleanup.on('close', () => resolve());
        cleanup.on('error', () => resolve()); // Ignore errors
        setTimeout(() => resolve(), 5000); // Timeout after 5 seconds
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Test Result Aggregation
 */
async function aggregateTestResults() {
  console.log('\n📊 Aggregating test results...');
  const startTime = Date.now();

  const resultsDirectories = [
    'test-results',
    'playwright-report',
    'coverage',
    '.tmp'
  ];

  const aggregatedResults = {
    timestamp: new Date().toISOString(),
    testResults: {},
    coverage: {},
    performance: {},
    errors: [],
    summary: {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0
    }
  };

  for (const directory of resultsDirectories) {
    const fullPath = resolve(projectRoot, directory);
    
    if (!existsSync(fullPath)) {
      console.log(`   ℹ️  Directory not found: ${directory}`);
      continue;
    }

    try {
      const directoryResults = await processResultsDirectory(fullPath, directory);
      aggregatedResults.testResults[directory] = directoryResults;
      
      console.log(`   ✅ Processed ${directory}: ${directoryResults.fileCount} files`);
      
    } catch (error) {
      console.error(`   ❌ Failed to process ${directory}: ${error.message}`);
      aggregatedResults.errors.push({
        directory,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  // Look for specific result files
  await aggregateSpecificResults(aggregatedResults);

  // Save aggregated results
  const resultsPath = resolve(projectRoot, '.tmp/ci/aggregated-results.json');
  writeFileSync(resultsPath, JSON.stringify(aggregatedResults, null, 2));
  
  ciCleanup.addReport('test_results', resultsPath, aggregatedResults.summary);
  
  console.log(`   📄 Results saved: ${resultsPath}`);
  console.log(`   ⏱️  Aggregation completed in ${Date.now() - startTime}ms`);

  return aggregatedResults;
}

/**
 * Process a results directory
 */
async function processResultsDirectory(directoryPath, directoryName) {
  const results = {
    directoryName,
    path: directoryPath,
    fileCount: 0,
    totalSize: 0,
    files: []
  };

  try {
    const items = readdirSync(directoryPath);
    
    for (const item of items) {
      const itemPath = join(directoryPath, item);
      const stats = statSync(itemPath);
      
      if (stats.isFile()) {
        results.fileCount++;
        results.totalSize += stats.size;
        results.files.push({
          name: item,
          size: stats.size,
          modified: stats.mtime,
          type: getFileType(item)
        });
      } else if (stats.isDirectory()) {
        const subResults = await processResultsDirectory(itemPath, item);
        results.fileCount += subResults.fileCount;
        results.totalSize += subResults.totalSize;
        results.files.push(subResults);
      }
    }
  } catch (error) {
    results.error = error.message;
  }

  return results;
}

/**
 * Get file type from extension
 */
function getFileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const typeMap = {
    'json': 'test_results',
    'xml': 'test_results',
    'html': 'report',
    'png': 'screenshot',
    'mp4': 'video',
    'webm': 'video',
    'log': 'log',
    'txt': 'text'
  };
  
  return typeMap[ext] || 'unknown';
}

/**
 * Aggregate specific result files
 */
async function aggregateSpecificResults(aggregatedResults) {
  // JUnit results
  const junitPath = resolve(projectRoot, 'test-results/e2e-results.xml');
  if (existsSync(junitPath)) {
    try {
      const junitContent = readFileSync(junitPath, 'utf-8');
      aggregatedResults.junit = {
        path: junitPath,
        size: junitContent.length,
        content: junitContent.substring(0, 1000) // First 1000 chars
      };
    } catch (error) {
      aggregatedResults.errors.push({
        file: 'junit',
        error: error.message
      });
    }
  }

  // JSON results
  const jsonResultsPath = resolve(projectRoot, 'test-results/e2e-results.json');
  if (existsSync(jsonResultsPath)) {
    try {
      const jsonResults = JSON.parse(readFileSync(jsonResultsPath, 'utf-8'));
      aggregatedResults.summary = {
        ...aggregatedResults.summary,
        ...extractTestSummary(jsonResults)
      };
    } catch (error) {
      aggregatedResults.errors.push({
        file: 'json_results',
        error: error.message
      });
    }
  }

  // Coverage results
  const coveragePath = resolve(projectRoot, 'coverage/coverage-summary.json');
  if (existsSync(coveragePath)) {
    try {
      const coverage = JSON.parse(readFileSync(coveragePath, 'utf-8'));
      aggregatedResults.coverage = coverage;
    } catch (error) {
      aggregatedResults.errors.push({
        file: 'coverage',
        error: error.message
      });
    }
  }
}

/**
 * Extract test summary from JSON results
 */
function extractTestSummary(jsonResults) {
  // This would need to be adapted based on the actual structure
  // of your test results JSON
  const summary = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0
  };

  if (jsonResults.suites) {
    for (const suite of jsonResults.suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          summary.totalTests++;
          if (spec.ok) {
            summary.passedTests++;
          } else {
            summary.failedTests++;
          }
        }
      }
    }
  }

  return summary;
}

/**
 * Artifact Organization
 */
async function organizeArtifacts() {
  console.log('\n📦 Organizing test artifacts...');
  const startTime = Date.now();

  const artifactPaths = {
    screenshots: resolve(projectRoot, 'test-results/screenshots'),
    videos: resolve(projectRoot, 'test-results/videos'),
    reports: resolve(projectRoot, 'playwright-report'),
    coverage: resolve(projectRoot, 'coverage'),
    logs: resolve(projectRoot, '.tmp/ci')
  };

  const organizedArtifacts = {
    timestamp: new Date().toISOString(),
    artifacts: {},
    totalSize: 0,
    totalFiles: 0
  };

  for (const [category, path] of Object.entries(artifactPaths)) {
    if (existsSync(path)) {
      try {
        const categoryInfo = await processArtifactCategory(path, category);
        organizedArtifacts.artifacts[category] = categoryInfo;
        organizedArtifacts.totalSize += categoryInfo.totalSize;
        organizedArtifacts.totalFiles += categoryInfo.fileCount;
        
        console.log(`   ✅ ${category}: ${categoryInfo.fileCount} files (${Math.round(categoryInfo.totalSize / 1024)}KB)`);
      } catch (error) {
        console.error(`   ❌ Failed to process ${category}: ${error.message}`);
        ciCleanup.recordError(error, `artifact_organization_${category}`);
      }
    } else {
      console.log(`   ℹ️  No ${category} artifacts found`);
    }
  }

  // Save artifact manifest
  const manifestPath = resolve(projectRoot, '.tmp/ci/artifact-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(organizedArtifacts, null, 2));
  
  ciCleanup.addReport('artifact_manifest', manifestPath, {
    totalSize: organizedArtifacts.totalSize,
    totalFiles: organizedArtifacts.totalFiles
  });

  console.log(`   📄 Artifact manifest saved: ${manifestPath}`);
  console.log(`   📊 Total artifacts: ${organizedArtifacts.totalFiles} files (${Math.round(organizedArtifacts.totalSize / 1024)}KB)`);
  console.log(`   ⏱️  Organization completed in ${Date.now() - startTime}ms`);

  return organizedArtifacts;
}

/**
 * Process artifacts in a category
 */
async function processArtifactCategory(categoryPath, categoryName) {
  const categoryInfo = {
    category: categoryName,
    path: categoryPath,
    fileCount: 0,
    totalSize: 0,
    files: []
  };

  const items = readdirSync(categoryPath);
  
  for (const item of items) {
    const itemPath = join(categoryPath, item);
    const stats = statSync(itemPath);
    
    if (stats.isFile()) {
      categoryInfo.fileCount++;
      categoryInfo.totalSize += stats.size;
      categoryInfo.files.push({
        name: item,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        extension: item.split('.').pop()?.toLowerCase()
      });
    }
  }

  return categoryInfo;
}

/**
 * Performance Metrics Collection
 */
async function collectPerformanceMetrics() {
  console.log('\n📈 Collecting performance metrics...');
  const startTime = Date.now();

  const metrics = {
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    },
    ci: {
      environment: process.env.CI_ENVIRONMENT || 'unknown',
      runner: process.env.RUNNER_OS || process.platform,
      buildNumber: process.env.BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER
    },
    cleanup: {},
    performance: {}
  };

  // Get system resource usage
  try {
    const resourceUsage = process.resourceUsage();
    metrics.system.resourceUsage = {
      userCPUTime: resourceUsage.userCPUTime,
      systemCPUTime: resourceUsage.systemCPUTime,
      maxRSS: resourceUsage.maxRSS,
      sharedMemorySize: resourceUsage.sharedMemorySize,
      unsharedDataSize: resourceUsage.unsharedDataSize,
      unsharedStackSize: resourceUsage.unsharedStackSize
    };
  } catch (error) {
    console.log('   ⚠️  Resource usage not available');
  }

  // Collect cleanup metrics from state
  const state = await ciCleanup.ensureInitialized();
  metrics.cleanup = {
    processesTerminated: state.processesTerminated.size,
    resourcesFreed: Object.fromEntries(state.resourcesFreed),
    errorsEncountered: state.errors.length,
    reportsGenerated: state.reports.length
  };

  // Load test performance metrics if available
  const performanceFiles = [
    '.tmp/ci/setup-report.json',
    'test-results/performance-metrics.json',
    'test-results/e2e-results.json'
  ];

  for (const file of performanceFiles) {
    const filePath = resolve(projectRoot, file);
    if (existsSync(filePath)) {
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        metrics.performance[basename(file, '.json')] = data;
      } catch (error) {
        console.log(`   ⚠️  Failed to load ${file}: ${error.message}`);
      }
    }
  }

  // Save performance metrics
  const metricsPath = resolve(projectRoot, '.tmp/ci/performance-metrics.json');
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  
  ciCleanup.addReport('performance_metrics', metricsPath, {
    memoryUsage: metrics.system.memory.heapUsed,
    uptime: metrics.system.uptime
  });

  console.log(`   📄 Performance metrics saved: ${metricsPath}`);
  console.log(`   💾 Memory usage: ${Math.round(metrics.system.memory.heapUsed / 1024 / 1024)}MB`);
  console.log(`   ⏱️  Collection completed in ${Date.now() - startTime}ms`);

  return metrics;
}

/**
 * Resource Usage Reporting
 */
async function generateResourceUsageReport() {
  console.log('\n📋 Generating resource usage report...');
  const startTime = Date.now();

  const state = await ciCleanup.ensureInitialized();

  const report = {
    timestamp: new Date().toISOString(),
    duration: Date.now() - state.startTime,
    processTermination: {
      totalProcesses: state.processesTerminated.size,
      successful: Array.from(state.processesTerminated.values()).filter(p => p.success).length,
      failed: Array.from(state.processesTerminated.values()).filter(p => !p.success).length,
      processes: Object.fromEntries(state.processesTerminated)
    },
    resourceCleanup: {
      memoryFreed: state.metrics.memoryFreed,
      diskSpaceFreed: state.metrics.diskSpaceFreed,
      resources: Object.fromEntries(state.resourcesFreed)
    },
    artifacts: {
      collected: state.metrics.artifactsCollected,
      reports: state.reports.length,
      list: state.reports
    },
    errors: {
      count: state.errors.length,
      details: state.errors
    },
    recommendations: generateRecommendations(state)
  };

  const reportPath = resolve(projectRoot, '.tmp/ci/cleanup-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Generate human-readable summary
  const summaryPath = resolve(projectRoot, '.tmp/ci/cleanup-summary.txt');
  const summary = generateHumanReadableSummary(report);
  writeFileSync(summaryPath, summary);

  ciCleanup.addReport('cleanup_report', reportPath, {
    duration: report.duration,
    processesTerminated: report.processTermination.totalProcesses,
    errorsCount: report.errors.count
  });

  console.log(`   📄 Cleanup report saved: ${reportPath}`);
  console.log(`   📝 Summary saved: ${summaryPath}`);
  console.log(`   🕒 Total cleanup duration: ${report.duration}ms`);
  console.log(`   🛑 Processes terminated: ${report.processTermination.totalProcesses}`);
  
  if (report.errors.count > 0) {
    console.log(`   ⚠️  Errors encountered: ${report.errors.count}`);
  }

  console.log(`   ⏱️  Report generation completed in ${Date.now() - startTime}ms`);

  return report;
}

/**
 * Generate recommendations based on cleanup results
 */
function generateRecommendations(state) {
  const recommendations = [];

  if (state.errors.length > 0) {
    recommendations.push({
      type: 'error_reduction',
      message: `${state.errors.length} errors occurred during cleanup. Review error details and improve error handling.`
    });
  }

  if (state.processesTerminated.size > 10) {
    recommendations.push({
      type: 'process_optimization',
      message: `${state.processesTerminated.size} processes were terminated. Consider optimizing process lifecycle management.`
    });
  }

  if (state.metrics.memoryFreed > 100 * 1024 * 1024) { // 100MB
    recommendations.push({
      type: 'memory_optimization',
      message: `${Math.round(state.metrics.memoryFreed / 1024 / 1024)}MB of memory was freed. Consider memory usage optimization.`
    });
  }

  return recommendations;
}

/**
 * Generate human-readable summary
 */
function generateHumanReadableSummary(report) {
  return `
CI Cleanup Summary
==================

Execution Details:
- Started: ${new Date(Date.now() - report.duration).toISOString()}
- Completed: ${report.timestamp}
- Duration: ${Math.round(report.duration / 1000)}s

Process Management:
- Processes terminated: ${report.processTermination.totalProcesses}
- Successful terminations: ${report.processTermination.successful}
- Failed terminations: ${report.processTermination.failed}

Resource Cleanup:
- Memory freed: ${Math.round(report.resourceCleanup.memoryFreed / 1024 / 1024)}MB
- Disk space freed: ${Math.round(report.resourceCleanup.diskSpaceFreed / 1024 / 1024)}MB

Artifacts:
- Reports generated: ${report.artifacts.reports}
- Artifacts collected: ${report.artifacts.collected}

${report.errors.count > 0 ? `
Errors (${report.errors.count}):
${report.errors.details.map(e => `- ${e.context}: ${e.error}`).join('\n')}
` : 'No errors encountered.'}

${report.recommendations.length > 0 ? `
Recommendations:
${report.recommendations.map(r => `- ${r.type}: ${r.message}`).join('\n')}
` : 'No recommendations.'}

Generated by CI Cleanup Manager
`;
}

/**
 * Cleanup temporary files and directories
 */
async function cleanupTemporaryFiles() {
  console.log('\n🗑️  Cleaning up temporary files...');
  const startTime = Date.now();

  const tempPaths = [
    '.tmp/ci/setup-logs',
    '.tmp/performance',
    '.tmp/cache',
    'node_modules/.cache',
    '.vercel/.output'
  ];

  let totalSizeFreed = 0;
  let filesRemoved = 0;

  for (const tempPath of tempPaths) {
    const fullPath = resolve(projectRoot, tempPath);
    
    if (existsSync(fullPath)) {
      try {
        const sizeBefore = await getDirectorySize(fullPath);
        await rm(fullPath, { recursive: true, force: true });
        
        totalSizeFreed += sizeBefore;
        filesRemoved++;
        
        console.log(`   ✅ Removed: ${tempPath} (${Math.round(sizeBefore / 1024)}KB)`);
      } catch (error) {
        console.error(`   ❌ Failed to remove ${tempPath}: ${error.message}`);
      }
    }
  }

  ciCleanup.recordResourceFreed('disk_space', totalSizeFreed, 'bytes');
  ciCleanup.state.metrics.diskSpaceFreed = totalSizeFreed;

  console.log(`   📊 Freed ${Math.round(totalSizeFreed / 1024)}KB across ${filesRemoved} locations`);
  console.log(`   ⏱️  Cleanup completed in ${Date.now() - startTime}ms`);
}

/**
 * Get directory size recursively
 */
async function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const items = readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = join(dirPath, item);
      const stats = statSync(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Ignore errors reading directory
  }

  return totalSize;
}

/**
 * Main CI cleanup function
 */
async function main() {
  console.log('\n🧹 CI Resource Cleanup and Reporting');
  console.log('═'.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  
  let finalReport = null;

  try {
    // Initialize cleanup manager
    await ciCleanup.ensureInitialized();
    
    // Execute cleanup phases
    await terminateProcesses();
    await aggregateTestResults();
    await organizeArtifacts(); 
    await collectPerformanceMetrics();
    await cleanupTemporaryFiles();
    
    // Generate final resource usage report
    finalReport = await generateResourceUsageReport();
    
    console.log('\n✅ CI cleanup completed successfully!');
    console.log('═'.repeat(60));
    
    // Print summary to stdout for CI systems
    if (finalReport) {
      console.log(`\n📊 CLEANUP SUMMARY:`);
      console.log(`Duration: ${Math.round(finalReport.duration / 1000)}s`);
      console.log(`Processes terminated: ${finalReport.processTermination.totalProcesses}`);
      console.log(`Memory freed: ${Math.round(finalReport.resourceCleanup.memoryFreed / 1024 / 1024)}MB`);
      console.log(`Reports generated: ${finalReport.artifacts.reports}`);
      
      if (finalReport.errors.count > 0) {
        console.log(`⚠️  Errors: ${finalReport.errors.count}`);
        process.exit(1); // Exit with error if there were cleanup issues
      }
    }
    
    // Exit with success
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ CI cleanup failed:', error.message);
    
    // Try to generate partial report
    try {
      finalReport = await generateResourceUsageReport();
    } catch (reportError) {
      console.error('   Failed to generate cleanup report:', reportError.message);
    }
    
    console.log('═'.repeat(60));
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT during cleanup, forcing exit...');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Received SIGTERM during cleanup, forcing exit...');
  process.exit(143);
});

// Prevent unhandled promise rejections from crashing cleanup
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled rejection during cleanup:', reason);
  // Don't exit - continue cleanup process
});

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;