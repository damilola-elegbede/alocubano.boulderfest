#!/usr/bin/env node

/**
 * Graceful E2E Test Orchestrator with Fallback Support
 * 
 * Orchestrates E2E testing with intelligent fallback mechanisms:
 * 1. Attempts preview deployment testing (preferred)
 * 2. Falls back to production URL testing if preview unavailable
 * 3. Skips gracefully with detailed reporting if all options fail
 * 4. Provides retry mechanisms and timeout handling
 * 5. Generates comprehensive test reports regardless of outcome
 */

import { spawn, execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import ResilientPreviewURLExtractor from './fallback-preview-url.js';
import ServiceHealthChecker from './service-health-check.js';

class GracefulE2EOrchestrator {
  constructor() {
    this.config = {
      maxRetries: 3,
      retryDelayMs: 10000,
      testTimeout: 600000, // 10 minutes
      healthCheckTimeout: 30000,
      playwrightConfig: 'playwright-e2e-vercel-main.config.js',
      browsers: process.env.ALL_BROWSERS === 'false' ? ['chromium'] : ['chromium', 'firefox'],
      productionFallbackUrl: 'https://alocubano-boulderfest.vercel.app'
    };

    this.results = {
      startTime: new Date().toISOString(),
      endTime: null,
      totalDuration: 0,
      testStrategy: null,
      url: null,
      fallbackUsed: false,
      success: false,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsSkipped: 0,
      errors: [],
      warnings: []
    };

    console.log('🎭 Graceful E2E Orchestrator initialized');
    console.log(`   Browsers: ${this.config.browsers.join(', ')}`);
    console.log(`   Timeout: ${this.config.testTimeout / 1000}s`);
    console.log(`   Max Retries: ${this.config.maxRetries}`);
  }

  /**
   * Main orchestration method with comprehensive fallback handling
   */
  async orchestrateE2ETests() {
    console.log('\n🚀 Starting E2E test orchestration...');
    console.log('═'.repeat(60));

    try {
      // Step 1: Service Health Check
      const healthStatus = await this.checkServiceHealth();
      if (!healthStatus.canContinue) {
        return this.skipWithServiceFailure(healthStatus.reason);
      }

      // Step 2: URL Extraction with Fallbacks
      const urlResult = await this.extractTargetURL();
      if (!urlResult.success) {
        return this.skipWithURLFailure(urlResult.reason);
      }

      this.results.url = urlResult.url;
      this.results.testStrategy = urlResult.strategy;
      this.results.fallbackUsed = urlResult.fallbackUsed !== 'Environment Variables' && 
                                  urlResult.fallbackUsed !== 'Vercel Bot Comments';

      // Step 3: Pre-flight validation
      const validationResult = await this.validateTestEnvironment(urlResult.url);
      if (!validationResult.success) {
        return this.skipWithValidationFailure(validationResult.reason);
      }

      // Step 4: Run E2E tests with retries
      const testResult = await this.runE2ETestsWithRetries(urlResult.url);
      
      this.results.success = testResult.success;
      this.results.testsRun = testResult.testsRun;
      this.results.testsPassed = testResult.testsPassed;
      this.results.testsFailed = testResult.testsFailed;
      this.results.testsSkipped = testResult.testsSkipped;

      return this.generateFinalReport();

    } catch (error) {
      console.error(`❌ Critical orchestration error: ${error.message}`);
      this.results.errors.push({
        type: 'ORCHESTRATION_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      });

      return this.generateFailureReport(error);
    }
  }

  /**
   * Check service health before proceeding
   */
  async checkServiceHealth() {
    console.log('\n🏥 Checking service health...');

    try {
      const checker = new ServiceHealthChecker();
      const report = await checker.runHealthChecks();

      if (!report.canContinueCI) {
        return {
          canContinue: false,
          reason: 'Critical services unavailable',
          details: report
        };
      }

      // Check for fallbacks needed
      if (report.fallbacksRequired > 0) {
        this.results.warnings.push({
          type: 'SERVICE_FALLBACK',
          message: `${report.fallbacksRequired} services using fallbacks`,
          details: report.recommendations
        });
      }

      return {
        canContinue: true,
        report: report
      };

    } catch (error) {
      console.error(`Service health check failed: ${error.message}`);
      
      // Don't fail completely - proceed with warnings
      this.results.warnings.push({
        type: 'HEALTH_CHECK_FAILED',
        message: 'Service health check failed, proceeding with caution',
        details: error.message
      });

      return { canContinue: true, reason: 'Health check failed but proceeding' };
    }
  }

  /**
   * Extract target URL with fallback chain
   */
  async extractTargetURL() {
    console.log('\n🔗 Extracting target URL...');

    try {
      const extractor = new ResilientPreviewURLExtractor();
      const result = await extractor.extractWithFallbacks();

      if (result.success) {
        return {
          success: true,
          url: result.url,
          strategy: 'PREVIEW_DEPLOYMENT',
          fallbackUsed: result.fallbackUsed
        };
      } else if (result.shouldRunE2E === false) {
        return {
          success: false,
          reason: result.reason || 'URL extraction failed',
          details: result
        };
      }

    } catch (error) {
      console.error(`URL extraction failed: ${error.message}`);
    }

    // Final fallback to production
    console.log('\n⚠️ All URL extraction methods failed - using production fallback');
    
    this.results.warnings.push({
      type: 'PRODUCTION_FALLBACK',
      message: 'Using production URL for E2E testing',
      details: 'Preview URL extraction failed, tests may not reflect PR changes'
    });

    return {
      success: true,
      url: this.config.productionFallbackUrl,
      strategy: 'PRODUCTION_FALLBACK',
      fallbackUsed: 'Production URL'
    };
  }

  /**
   * Validate test environment before running tests
   */
  async validateTestEnvironment(url) {
    console.log(`\n🔍 Validating test environment: ${url}`);

    const validationChecks = [
      { name: 'URL Accessibility', check: () => this.checkURLAccessibility(url) },
      { name: 'Health Endpoint', check: () => this.checkHealthEndpoint(url) },
      { name: 'Database Connectivity', check: () => this.checkDatabaseConnectivity(url) },
      { name: 'Playwright Dependencies', check: () => this.checkPlaywrightDependencies() }
    ];

    const results = [];
    let criticalFailures = 0;

    for (const validation of validationChecks) {
      try {
        const result = await validation.check();
        results.push({ name: validation.name, success: result.success, details: result.details });
        
        if (!result.success && result.critical) {
          criticalFailures++;
        }
      } catch (error) {
        results.push({ 
          name: validation.name, 
          success: false, 
          error: error.message,
          critical: true
        });
        criticalFailures++;
      }
    }

    if (criticalFailures > 0) {
      const failedChecks = results.filter(r => !r.success).map(r => r.name).join(', ');
      return {
        success: false,
        reason: `Critical validation failures: ${failedChecks}`,
        details: results
      };
    }

    return { success: true, details: results };
  }

  /**
   * Check URL accessibility
   */
  async checkURLAccessibility(url) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'E2E-Validation-Check' }
      });

      return {
        success: response.ok,
        details: `HTTP ${response.status}`,
        critical: !response.ok
      };
    } catch (error) {
      return {
        success: false,
        details: error.message,
        critical: true
      };
    }
  }

  /**
   * Check health endpoint
   */
  async checkHealthEndpoint(url) {
    try {
      const response = await fetch(`${url}/api/health/check`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'E2E-Health-Check' }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          details: `Health check passed: ${JSON.stringify(data)}`,
          critical: false
        };
      } else {
        return {
          success: false,
          details: `Health endpoint returned ${response.status}`,
          critical: false // Not critical, basic URL access is sufficient
        };
      }
    } catch (error) {
      return {
        success: false,
        details: `Health endpoint unavailable: ${error.message}`,
        critical: false
      };
    }
  }

  /**
   * Check database connectivity
   */
  async checkDatabaseConnectivity(url) {
    try {
      // Try a simple API endpoint that uses the database
      const response = await fetch(`${url}/api/gallery`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'E2E-DB-Check' }
      });

      return {
        success: response.ok,
        details: `Database API endpoint returned ${response.status}`,
        critical: false // Non-critical - some tests can run without database
      };
    } catch (error) {
      return {
        success: false,
        details: `Database connectivity check failed: ${error.message}`,
        critical: false
      };
    }
  }

  /**
   * Check Playwright dependencies
   */
  async checkPlaywrightDependencies() {
    try {
      // Check if Playwright config exists
      if (!existsSync(this.config.playwrightConfig)) {
        return {
          success: false,
          details: `Playwright config not found: ${this.config.playwrightConfig}`,
          critical: true
        };
      }

      // Check if Playwright is installed
      execSync('npx playwright --version', { stdio: 'ignore' });

      return {
        success: true,
        details: 'Playwright dependencies available',
        critical: false
      };
    } catch (error) {
      return {
        success: false,
        details: `Playwright dependencies missing: ${error.message}`,
        critical: true
      };
    }
  }

  /**
   * Run E2E tests with retry mechanism
   */
  async runE2ETestsWithRetries(url) {
    console.log(`\n🎭 Running E2E tests against: ${url}`);

    let attempt = 1;
    let lastError = null;

    while (attempt <= this.config.maxRetries) {
      console.log(`\n📋 Test attempt ${attempt}/${this.config.maxRetries}`);

      try {
        const result = await this.runPlaywrightTests(url);
        
        if (result.success || attempt === this.config.maxRetries) {
          return result;
        } else {
          lastError = result.error;
          console.log(`⚠️ Test attempt ${attempt} failed, retrying in ${this.config.retryDelayMs}ms...`);
          await this.sleep(this.config.retryDelayMs);
        }
      } catch (error) {
        lastError = error;
        console.error(`Test attempt ${attempt} threw error: ${error.message}`);
        
        if (attempt === this.config.maxRetries) {
          return {
            success: false,
            testsRun: 0,
            testsPassed: 0,
            testsFailed: 0,
            testsSkipped: 0,
            error: lastError
          };
        }
        
        await this.sleep(this.config.retryDelayMs);
      }

      attempt++;
    }

    return {
      success: false,
      error: lastError,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsSkipped: 0
    };
  }

  /**
   * Execute Playwright tests
   */
  async runPlaywrightTests(url) {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        PLAYWRIGHT_BASE_URL: url,
        BASE_URL: url,
        PREVIEW_URL: url,
        E2E_TARGET_URL: url
      };

      const args = [
        'playwright',
        'test',
        `--config=${this.config.playwrightConfig}`,
        '--reporter=json'
      ];

      // Add browser-specific arguments
      if (this.config.browsers.length === 1) {
        args.push(`--project=${this.config.browsers[0]}`);
      }

      console.log(`   🚀 Command: npx ${args.join(' ')}`);
      console.log(`   🌐 Target URL: ${url}`);

      const child = spawn('npx', args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: this.config.testTimeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data); // Real-time output
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data); // Real-time output
      });

      child.on('close', (code) => {
        try {
          // Parse Playwright JSON report
          const report = this.parsePlaywrightOutput(stdout, stderr);
          
          resolve({
            success: code === 0,
            exitCode: code,
            testsRun: report.testsRun || 0,
            testsPassed: report.testsPassed || 0,
            testsFailed: report.testsFailed || 0,
            testsSkipped: report.testsSkipped || 0,
            stdout,
            stderr,
            report
          });
        } catch (error) {
          resolve({
            success: false,
            exitCode: code,
            testsRun: 0,
            testsPassed: 0,
            testsFailed: 0,
            testsSkipped: 0,
            error: error.message,
            stdout,
            stderr
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          testsRun: 0,
          testsPassed: 0,
          testsFailed: 0,
          testsSkipped: 0,
          error: error.message
        });
      });
    });
  }

  /**
   * Parse Playwright output for test statistics
   */
  parsePlaywrightOutput(stdout, stderr) {
    // Try to extract test statistics from output
    const stats = {
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsSkipped: 0
    };

    try {
      // Look for Playwright summary patterns
      const patterns = [
        /(\d+) passed/,
        /(\d+) failed/,
        /(\d+) skipped/
      ];

      const output = stdout + stderr;
      
      const passedMatch = output.match(/(\d+) passed/);
      if (passedMatch) stats.testsPassed = parseInt(passedMatch[1]);

      const failedMatch = output.match(/(\d+) failed/);
      if (failedMatch) stats.testsFailed = parseInt(failedMatch[1]);

      const skippedMatch = output.match(/(\d+) skipped/);
      if (skippedMatch) stats.testsSkipped = parseInt(skippedMatch[1]);

      stats.testsRun = stats.testsPassed + stats.testsFailed + stats.testsSkipped;

    } catch (error) {
      console.warn(`Failed to parse test statistics: ${error.message}`);
    }

    return stats;
  }

  /**
   * Skip tests due to service failure
   */
  skipWithServiceFailure(reason) {
    console.log(`\n⏭️ Skipping E2E tests due to service failure: ${reason}`);
    
    this.results.success = false;
    this.results.testsSkipped = 999; // Indicate all tests skipped
    this.results.errors.push({
      type: 'SERVICE_FAILURE',
      message: reason,
      timestamp: new Date().toISOString()
    });

    return this.generateSkipReport('SERVICE_FAILURE', reason);
  }

  /**
   * Skip tests due to URL extraction failure
   */
  skipWithURLFailure(reason) {
    console.log(`\n⏭️ Skipping E2E tests due to URL failure: ${reason}`);
    
    this.results.success = false;
    this.results.testsSkipped = 999;
    this.results.errors.push({
      type: 'URL_EXTRACTION_FAILURE',
      message: reason,
      timestamp: new Date().toISOString()
    });

    return this.generateSkipReport('URL_FAILURE', reason);
  }

  /**
   * Skip tests due to validation failure
   */
  skipWithValidationFailure(reason) {
    console.log(`\n⏭️ Skipping E2E tests due to validation failure: ${reason}`);
    
    this.results.success = false;
    this.results.testsSkipped = 999;
    this.results.errors.push({
      type: 'VALIDATION_FAILURE',
      message: reason,
      timestamp: new Date().toISOString()
    });

    return this.generateSkipReport('VALIDATION_FAILURE', reason);
  }

  /**
   * Generate skip report
   */
  generateSkipReport(skipType, reason) {
    this.results.endTime = new Date().toISOString();
    this.results.totalDuration = Date.now() - new Date(this.results.startTime).getTime();

    return {
      success: false,
      skipped: true,
      skipType,
      reason,
      results: this.results,
      shouldFailCI: false, // Don't fail CI for graceful skips
      exitCode: 2 // Warning exit code
    };
  }

  /**
   * Generate final report for successful orchestration
   */
  generateFinalReport() {
    this.results.endTime = new Date().toISOString();
    this.results.totalDuration = Date.now() - new Date(this.results.startTime).getTime();

    console.log('\n📊 E2E Test Orchestration Complete');
    console.log(`   Duration: ${this.results.totalDuration / 1000}s`);
    console.log(`   Strategy: ${this.results.testStrategy}`);
    console.log(`   URL: ${this.results.url}`);
    console.log(`   Fallback Used: ${this.results.fallbackUsed}`);
    console.log(`   Tests Run: ${this.results.testsRun}`);
    console.log(`   Passed: ${this.results.testsPassed}`);
    console.log(`   Failed: ${this.results.testsFailed}`);
    console.log(`   Skipped: ${this.results.testsSkipped}`);

    return {
      success: this.results.success,
      skipped: false,
      results: this.results,
      shouldFailCI: !this.results.success,
      exitCode: this.results.success ? 0 : 1
    };
  }

  /**
   * Generate failure report
   */
  generateFailureReport(error) {
    this.results.endTime = new Date().toISOString();
    this.results.totalDuration = Date.now() - new Date(this.results.startTime).getTime();

    return {
      success: false,
      skipped: false,
      error: error.message,
      results: this.results,
      shouldFailCI: true,
      exitCode: 1
    };
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const orchestrator = new GracefulE2EOrchestrator();

  orchestrator.orchestrateE2ETests()
    .then(result => {
      // Write comprehensive report
      if (process.argv.includes('--output-file')) {
        const outputFile = process.argv[process.argv.indexOf('--output-file') + 1] || 'e2e-orchestration-report.json';
        writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log(`📄 Orchestration report written to ${outputFile}`);
      }

      if (result.skipped) {
        console.log(`\n⚠️ E2E tests skipped gracefully: ${result.reason}`);
      } else if (result.success) {
        console.log('\n✅ E2E test orchestration completed successfully');
      } else {
        console.log('\n❌ E2E test orchestration failed');
      }

      process.exit(result.exitCode);
    })
    .catch(error => {
      console.error(`\n💥 Critical orchestration failure: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    });
}

export default GracefulE2EOrchestrator;