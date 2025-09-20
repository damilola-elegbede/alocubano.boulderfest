#!/usr/bin/env node

/**
 * Service Health Check with Fallback Strategy
 *
 * Validates availability of critical services before running CI steps:
 * - Turso Database connectivity
 * - Vercel API accessibility
 * - GitHub API accessibility
 * - Preview deployment readiness
 *
 * Provides graceful degradation strategies when services are unavailable.
 */

import { execSync } from 'child_process';

class ServiceHealthChecker {
  constructor() {
    this.services = {
      turso: {
        name: 'Turso Database',
        required: false, // Can fallback to SQLite
        url: process.env.TURSO_DATABASE_URL,
        token: process.env.TURSO_AUTH_TOKEN,
        fallback: 'SQLite local database'
      },
      vercel: {
        name: 'Vercel API',
        required: false, // Can skip preview deployments
        url: 'https://api.vercel.com/v2/user',
        token: process.env.VERCEL_TOKEN,
        fallback: 'Skip preview deployment checks'
      },
      github: {
        name: 'GitHub API',
        required: true, // Critical for CI/CD
        url: 'https://api.github.com/user',
        token: process.env.GITHUB_TOKEN,
        fallback: 'None - Critical service'
      },
      npm: {
        name: 'NPM Registry',
        required: true, // Critical for dependencies
        url: 'https://registry.npmjs.org/-/ping',
        token: null,
        fallback: 'Retry with cache fallback'
      }
    };

    this.timeout = 10000; // 10 second timeout per service
    this.retryCount = 2;

    console.log('🏥 Service Health Checker initialized');
  }

  /**
   * Run comprehensive health checks
   */
  async runHealthChecks() {
    console.log('\n🔍 Running service health checks...');
    console.log('═'.repeat(50));

    const results = {};
    let criticalFailures = 0;
    let nonCriticalFailures = 0;

    for (const [serviceKey, service] of Object.entries(this.services)) {
      console.log(`\n🔍 Checking: ${service.name}`);

      const result = await this.checkService(service);
      results[serviceKey] = result;

      if (!result.healthy) {
        if (service.required) {
          criticalFailures++;
          console.log(`❌ CRITICAL: ${service.name} is unavailable`);
        } else {
          nonCriticalFailures++;
          console.log(`⚠️ WARNING: ${service.name} is unavailable - using fallback: ${service.fallback}`);
        }
      } else {
        console.log(`✅ ${service.name} is healthy`);
      }
    }

    // Generate health report
    const report = this.generateHealthReport(results, criticalFailures, nonCriticalFailures);

    console.log('\n📊 Health Check Summary:');
    console.log(`   Critical Services: ${4 - criticalFailures}/4 healthy`);
    console.log(`   Optional Services: ${Object.keys(this.services).length - 4 - nonCriticalFailures}/${Object.keys(this.services).length - 4} healthy`);
    console.log(`   Fallbacks Required: ${nonCriticalFailures}`);

    return report;
  }

  /**
   * Check individual service health
   */
  async checkService(service) {
    const result = {
      healthy: false,
      responseTime: null,
      error: null,
      fallbackAvailable: !!service.fallback,
      canContinue: !service.required
    };

    const startTime = Date.now();

    try {
      if (service.name === 'Turso Database') {
        result.healthy = await this.checkTursoDatabase(service);
      } else if (service.name === 'NPM Registry') {
        result.healthy = await this.checkNPMRegistry();
      } else {
        result.healthy = await this.checkHttpService(service);
      }

      result.responseTime = Date.now() - startTime;

    } catch (error) {
      result.error = error.message;
      result.responseTime = Date.now() - startTime;

      // For non-critical services, check if fallback is viable
      if (!service.required && service.fallback) {
        result.canContinue = true;
        console.log(`   ⚠️ Service unavailable, fallback available: ${service.fallback}`);
      }
    }

    return result;
  }

  /**
   * Check Turso database connectivity
   */
  async checkTursoDatabase(service) {
    if (!service.url || !service.token) {
      console.log('   ℹ️ Turso credentials not configured - will use SQLite fallback');
      return false; // Not an error, fallback to SQLite
    }

    try {
      // Simple connectivity check using curl
      const command = `curl -X GET "${service.url.replace('libsql://', 'https://')}" \
        -H "Authorization: Bearer ${service.token}" \
        -m ${this.timeout / 1000} \
        --silent --fail`;

      execSync(command, { stdio: 'ignore' });
      return true;

    } catch (error) {
      console.log(`   ⚠️ Turso connection failed - fallback to SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Check NPM Registry availability
   */
  async checkNPMRegistry() {
    try {
      const response = await fetch('https://registry.npmjs.org/-/ping', {
        signal: AbortSignal.timeout(this.timeout)
      });

      return response.ok;

    } catch (error) {
      // Try npm ping command as fallback
      try {
        execSync('npm ping', {
          stdio: 'ignore',
          timeout: this.timeout
        });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Check HTTP service availability
   */
  async checkHttpService(service) {
    if (!service.url) {
      throw new Error('Service URL not configured');
    }

    const headers = {};
    if (service.token) {
      if (service.name === 'Vercel API') {
        headers['Authorization'] = `Bearer ${service.token}`;
      } else if (service.name === 'GitHub API') {
        headers['Authorization'] = `token ${service.token}`;
      }
    }

    const response = await fetch(service.url, {
      headers: {
        ...headers,
        'User-Agent': 'CI-Service-Health-Check'
      },
      signal: AbortSignal.timeout(this.timeout)
    });

    return response.ok;
  }

  /**
   * Generate comprehensive health report
   */
  generateHealthReport(results, criticalFailures, nonCriticalFailures) {
    const report = {
      timestamp: new Date().toISOString(),
      overallHealth: criticalFailures === 0 ? 'HEALTHY' : 'CRITICAL',
      canContinueCI: criticalFailures === 0,
      servicesDown: nonCriticalFailures + criticalFailures,
      fallbacksRequired: nonCriticalFailures,
      services: results,
      recommendations: []
    };

    // Generate recommendations based on failures
    if (criticalFailures > 0) {
      report.recommendations.push('STOP: Critical services unavailable - cannot continue CI');
    }

    if (!results.turso?.healthy && results.turso?.fallbackAvailable) {
      report.recommendations.push('USE_SQLITE_FALLBACK: Turso unavailable, use SQLite for testing');
    }

    if (!results.vercel?.healthy && results.vercel?.fallbackAvailable) {
      report.recommendations.push('SKIP_PREVIEW_DEPLOY: Vercel unavailable, skip preview deployment checks');
    }

    if (results.npm?.healthy === false) {
      report.recommendations.push('RETRY_NPM: NPM Registry issues detected, retry with cache');
    }

    // Success case
    if (criticalFailures === 0 && nonCriticalFailures === 0) {
      report.recommendations.push('PROCEED_NORMAL: All services healthy, proceed with normal CI flow');
    }

    return report;
  }

  /**
   * Generate environment variables for CI steps
   */
  generateCIEnvironment(report) {
    const env = [];

    env.push(`SERVICE_HEALTH_STATUS=${report.overallHealth}`);
    env.push(`CAN_CONTINUE_CI=${report.canContinueCI}`);
    env.push(`FALLBACKS_REQUIRED=${report.fallbacksRequired}`);

    // Service-specific environment variables
    env.push(`TURSO_AVAILABLE=${report.services.turso?.healthy || false}`);
    env.push(`VERCEL_API_AVAILABLE=${report.services.vercel?.healthy || false}`);
    env.push(`GITHUB_API_AVAILABLE=${report.services.github?.healthy || false}`);
    env.push(`NPM_REGISTRY_AVAILABLE=${report.services.npm?.healthy || false}`);

    // Fallback flags
    if (!report.services.turso?.healthy) {
      env.push(`USE_SQLITE_FALLBACK=true`);
    }

    if (!report.services.vercel?.healthy) {
      env.push(`SKIP_PREVIEW_CHECKS=true`);
    }

    return env;
  }

  /**
   * Write health report to file for CI consumption
   */
  writeHealthReport(report, filename = 'service-health-report.json') {
    const fs = require('fs');
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`📄 Health report written to ${filename}`);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new ServiceHealthChecker();

  checker.runHealthChecks()
    .then(report => {
      // Generate CI environment variables
      const ciEnv = checker.generateCIEnvironment(report);

      console.log('\n🔧 CI Environment Variables:');
      ciEnv.forEach(env => console.log(`   ${env}`));

      // Write outputs for CI consumption
      if (process.argv.includes('--output-file')) {
        const outputFile = process.argv[process.argv.indexOf('--output-file') + 1] || 'service-health.env';
        const fs = require('fs');
        fs.writeFileSync(outputFile, ciEnv.join('\n') + '\n');
        console.log(`✅ CI environment written to ${outputFile}`);
      }

      if (process.argv.includes('--report-file')) {
        const reportFile = process.argv[process.argv.indexOf('--report-file') + 1] || 'service-health-report.json';
        checker.writeHealthReport(report, reportFile);
      }

      // Exit with appropriate code
      if (report.canContinueCI) {
        console.log('\n✅ Service health check passed - CI can continue');
        process.exit(0);
      } else {
        console.log('\n❌ Critical service failures detected - stopping CI');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(`\n❌ Health check failed: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    });
}

export default ServiceHealthChecker;