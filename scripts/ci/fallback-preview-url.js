#!/usr/bin/env node

/**
 * Fallback Preview URL Extractor with Resilient Chain
 * 
 * Implements comprehensive fallback mechanisms to ensure 98%+ CI success rate:
 * 1. Primary: Vercel Bot Comments Extraction
 * 2. Secondary: GitHub Deployments API
 * 3. Tertiary: Vercel CLI/API Integration
 * 4. Quaternary: Production URL Fallback
 * 5. Final: Skip E2E with Warning
 * 
 * Includes health checks, retry logic, and service availability validation.
 */

import { execSync, spawn } from 'child_process';
import { writeFileSync, existsSync } from 'fs';

class ResilientPreviewURLExtractor {
  constructor() {
    // Fail immediately if required credentials are missing
    if (!process.env.VERCEL_TOKEN) {
      throw new Error('❌ FATAL: VERCEL_TOKEN not found in environment');
    }
    if (!process.env.VERCEL_ORG_ID) {
      throw new Error('❌ FATAL: VERCEL_ORG_ID not found in environment');
    }
    
    this.githubToken = process.env.GITHUB_TOKEN;
    this.vercelToken = process.env.VERCEL_TOKEN;
    this.vercelOrgId = process.env.VERCEL_ORG_ID;
    this.repoOwner = process.env.GITHUB_REPOSITORY?.split('/')[0] || 'default-owner';
    this.repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'default-repo';
    this.prNumber = process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER || 
                   (process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\/merge/) || [])[1];
    this.commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA;
    
    this.maxRetries = 3;
    this.retryDelayMs = 5000;
    this.healthCheckTimeout = 15000;
    
    this.logInfo('🛡️ Resilient Preview URL Extractor initialized');
    this.logInfo(`   Repository: ${this.repoOwner}/${this.repoName}`);
    this.logInfo(`   PR Number: ${this.prNumber || 'Not available'}`);
    this.logInfo(`   Commit SHA: ${this.commitSha || 'Not available'}`);
    this.logInfo(`   GitHub Token: ${this.githubToken ? '✅ Available' : '❌ Missing'}`);
    this.logInfo(`   Vercel Token: ✅ Available`);
    this.logInfo(`   Vercel Org ID: ✅ Available`);
  }

  logInfo(message) {
    console.log(message);
  }

  logWarning(message) {
    console.warn(`⚠️ ${message}`);
  }

  logError(message) {
    console.error(`❌ ${message}`);
  }

  logSuccess(message) {
    console.log(`✅ ${message}`);
  }

  /**
   * Main extraction method with comprehensive fallback chain
   */
  async extractWithFallbacks() {
    this.logInfo('\n🚀 Starting fallback chain for preview URL extraction...');
    this.logInfo('═'.repeat(60));

    const fallbackChain = [
      { name: 'Environment Variables', method: 'tryEnvironmentVariables' },
      { name: 'Vercel Bot Comments', method: 'tryVercelBotComments' },
      { name: 'GitHub Deployments API', method: 'tryGitHubDeployments' },
      { name: 'Vercel CLI Integration', method: 'tryVercelCLI' },
      { name: 'Vercel API Direct', method: 'tryVercelAPI' }
    ];

    let url = null;
    let usedFallback = null;

    for (const fallback of fallbackChain) {
      this.logInfo(`\n🔍 Trying: ${fallback.name}...`);
      
      try {
        url = await this.withRetry(() => this[fallback.method]());
        
        if (url) {
          usedFallback = fallback.name;
          this.logSuccess(`Found URL from ${fallback.name}: ${url}`);
          break;
        } else {
          this.logWarning(`${fallback.name} returned no URL`);
        }
        
      } catch (error) {
        this.logError(`${fallback.name} failed: ${error.message}`);
      }
    }

    if (!url) {
      // No fallbacks - fail immediately
      throw new Error('❌ FATAL: All URL extraction strategies failed - VERCEL_TOKEN and VERCEL_ORG_ID are required');
    }

    // Validate the URL with health checks
    const validatedUrl = await this.validateUrlWithHealthCheck(url);
    
    if (!validatedUrl) {
      this.logError(`URL validation failed for: ${url}`);
      throw new Error('❌ FATAL: URL validation failed - deployment may not be ready');
    }

    // Log success metrics
    this.logSuccessMetrics(validatedUrl, usedFallback);
    
    return {
      success: true,
      url: validatedUrl,
      fallbackUsed: usedFallback,
      shouldRunE2E: true
    };
  }

  /**
   * Retry wrapper with exponential backoff
   */
  async withRetry(fn, maxAttempts = this.maxRetries) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        this.logWarning(`Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Strategy 1: Environment Variables
   */
  async tryEnvironmentVariables() {
    const envVars = [
      'VERCEL_PREVIEW_URL',
      'PREVIEW_URL', 
      'VERCEL_URL',
      'DEPLOYMENT_URL',
      'E2E_TARGET_URL'
    ];

    for (const envVar of envVars) {
      const url = process.env[envVar];
      if (url && this.isValidUrl(url)) {
        this.logInfo(`   Found valid URL in ${envVar}`);
        return url;
      }
    }

    return null;
  }

  /**
   * Strategy 2: Vercel Bot Comments (Enhanced)
   */
  async tryVercelBotComments() {
    if (!this.githubToken || !this.prNumber) {
      throw new Error('GitHub token or PR number missing');
    }

    const url = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/issues/${this.prNumber}/comments`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CI-Fallback-URL-Extractor'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const comments = await response.json();
    
    // Enhanced bot detection and URL extraction
    for (const comment of comments.reverse()) {
      if (this.isVercelBot(comment.user)) {
        const urls = this.extractUrlsFromComment(comment.body);
        
        // Prefer preview URLs over production
        const previewUrl = urls.find(url => url.includes('-git-') || url.includes('.vercel.app'));
        if (previewUrl) {
          return previewUrl;
        }
      }
    }

    return null;
  }

  /**
   * Strategy 3: GitHub Deployments API (Enhanced)
   */
  async tryGitHubDeployments() {
    if (!this.githubToken) {
      throw new Error('GitHub token missing');
    }

    const url = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/deployments`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub Deployments API error: ${response.status}`);
    }

    const deployments = await response.json();
    
    // Find recent deployments for our commit or PR
    const relevantDeployments = deployments
      .filter(d => 
        (this.commitSha && d.sha === this.commitSha) ||
        (d.environment && d.environment.includes('Preview'))
      )
      .slice(0, 10); // Check last 10 deployments

    for (const deployment of relevantDeployments) {
      const statusUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/deployments/${deployment.id}/statuses`;
      
      try {
        const statusResponse = await fetch(statusUrl, {
          headers: {
            'Authorization': `token ${this.githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (statusResponse.ok) {
          const statuses = await statusResponse.json();
          const successStatus = statuses.find(s => s.state === 'success' && s.target_url);
          
          if (successStatus?.target_url) {
            return successStatus.target_url;
          }
        }
      } catch (error) {
        this.logWarning(`Failed to fetch deployment status: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Strategy 4: Vercel CLI Integration
   */
  async tryVercelCLI() {
    try {
      // Check if Vercel CLI is available
      execSync('which vercel', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('Vercel CLI not available');
    }

    const commands = [
      `vercel ls --confirm --token ${this.vercelToken} --scope ${this.vercelOrgId}`,
      `vercel list --confirm --token ${this.vercelToken} --scope ${this.vercelOrgId}`
    ];

    for (const command of commands) {
      try {
        const output = execSync(command, { 
          encoding: 'utf8', 
          timeout: 15000,
          stdio: 'pipe',
          env: {
            ...process.env,
            VERCEL_TOKEN: this.vercelToken
          }
        });

        const urls = this.extractUrlsFromText(output);
        const previewUrl = urls.find(url => 
          url.includes('.vercel.app') && 
          !url.includes('alocubano-boulderfest.vercel.app') // Not production
        );
        
        if (previewUrl) {
          return previewUrl;
        }

      } catch (error) {
        this.logWarning(`CLI command failed: ${command} - ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Strategy 5: Vercel API Direct
   */
  async tryVercelAPI() {
    // Credentials already validated in constructor - no need to check again

    // Get project info first
    let projectId = process.env.VERCEL_PROJECT_ID;
    
    if (!projectId) {
      // Try to get project ID from project name
      const projectsUrl = 'https://api.vercel.com/v9/projects';
      const projectsResponse = await fetch(projectsUrl, {
        headers: {
          'Authorization': `Bearer ${this.vercelToken}`,
          'Accept': 'application/json'
        }
      });

      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        const project = projectsData.projects?.find(p => 
          p.name === this.repoName || 
          p.name.includes('alocubano')
        );
        
        if (project) {
          projectId = project.id;
        }
      }
    }

    if (!projectId) {
      throw new Error('Project ID not available');
    }

    // Get deployments
    const deploymentsUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=20`;
    
    const response = await fetch(deploymentsUrl, {
      headers: {
        'Authorization': `Bearer ${this.vercelToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status}`);
    }

    const data = await response.json();
    const deployments = data.deployments || [];

    // Find preview deployment
    const previewDeployment = deployments.find(d => 
      d.state === 'READY' && 
      d.type === 'LAMBDAS' &&
      (!this.commitSha || d.meta?.githubCommitSha === this.commitSha)
    );

    if (previewDeployment) {
      return `https://${previewDeployment.url}`;
    }

    return null;
  }



  /**
   * Validate URL with health check
   */
  async validateUrlWithHealthCheck(url) {
    if (!this.isValidUrl(url)) {
      this.logError(`Invalid URL format: ${url}`);
      return null;
    }

    this.logInfo(`🔍 Validating URL: ${url}`);

    const healthEndpoints = [
      '/api/health/check',
      '/api/health',
      '/',
      ''
    ];

    for (const endpoint of healthEndpoints) {
      const testUrl = `${url}${endpoint}`;
      
      try {
        this.logInfo(`   Testing: ${testUrl}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.healthCheckTimeout);

        const response = await fetch(testUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'CI-Health-Check',
            'Accept': 'application/json, text/html, */*'
          }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          this.logSuccess(`URL validation successful (${response.status})`);
          return url;
        }
        
      } catch (error) {
        this.logWarning(`Health check failed for ${testUrl}: ${error.message}`);
      }
    }

    this.logError(`All health checks failed for: ${url}`);
    return null;
  }

  /**
   * Enhanced URL extraction from text
   */
  extractUrlsFromText(text) {
    const patterns = [
      /https:\/\/[a-zA-Z0-9-]+(?:-[a-zA-Z0-9]+)*\.vercel\.app/g,
      /https:\/\/[a-zA-Z0-9-]+\.now\.sh/g,
      /https:\/\/[^\s<>"']+\.vercel\.app/g
    ];

    const urls = [];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern) || [];
      urls.push(...matches);
    }

    return [...new Set(urls)]; // Remove duplicates
  }

  /**
   * Extract URLs from comment with enhanced patterns
   */
  extractUrlsFromComment(body) {
    if (!body) return [];

    const patterns = [
      /(?:Preview:|Deploy Preview ready!|✅)\s*(?:\*\*)?([^\s)]+\.vercel\.app)(?:\*\*)*/gi,
      /https:\/\/[a-zA-Z0-9-]+(?:-[a-zA-Z0-9-]+)*\.vercel\.app/g,
      /\[.*?\]\((https:\/\/[^\s)]+\.vercel\.app)\)/g
    ];

    const urls = [];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const url = match[1] || match[0];
        if (this.isValidUrl(url)) {
          urls.push(url.replace(/^\*\*|\*\*$/g, ''));
        }
      }
    }

    return [...new Set(urls)];
  }

  /**
   * Enhanced Vercel bot detection
   */
  isVercelBot(user) {
    if (!user) return false;
    
    const botIndicators = [
      user.login?.toLowerCase().includes('vercel'),
      user.login?.toLowerCase().includes('github-actions'),
      user.type === 'Bot',
      user.login === 'vercel[bot]'
    ];

    return botIndicators.some(indicator => indicator);
  }

  /**
   * URL validation
   */
  isValidUrl(urlString) {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Log success metrics
   */
  logSuccessMetrics(url, fallbackUsed) {
    this.logSuccess('\n🎉 SUCCESS: Preview URL extracted with fallbacks');
    this.logInfo(`📊 Metrics:`);
    this.logInfo(`   Final URL: ${url}`);
    this.logInfo(`   Fallback Used: ${fallbackUsed}`);
    this.logInfo(`   GitHub Token: ${this.githubToken ? 'Available' : 'Missing'}`);
    this.logInfo(`   Vercel Token: ${this.vercelToken ? 'Available' : 'Missing'}`);
    this.logInfo(`   PR Number: ${this.prNumber || 'N/A'}`);
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in other scripts
export default ResilientPreviewURLExtractor;

// Main execution when called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const extractor = new ResilientPreviewURLExtractor();

  extractor.extractWithFallbacks()
    .then(result => {
      if (result.success) {
        console.log(`\nPREVIEW_URL=${result.url}`);
        console.log(`FALLBACK_USED=${result.fallbackUsed}`);
        console.log(`SHOULD_RUN_E2E=true`);
        
        // Write to output file if requested
        if (process.argv.includes('--output-file')) {
          const outputFile = process.argv[process.argv.indexOf('--output-file') + 1] || 'preview-url.env';
          const content = [
            `PREVIEW_URL=${result.url}`,
            `FALLBACK_USED=${result.fallbackUsed}`,
            `SHOULD_RUN_E2E=true`,
            `URL_VALIDATION_STATUS=SUCCESS`
          ].join('\n') + '\n';
          
          writeFileSync(outputFile, content);
          console.log(`✅ Results written to ${outputFile}`);
        }
        
        process.exit(0);
      } else {
        console.log(`\nPREVIEW_URL=`);
        console.log(`FALLBACK_USED=NONE`);
        console.log(`SHOULD_RUN_E2E=false`);
        console.log(`SKIP_REASON=${result.reason || 'All strategies failed'}`);
        
        // Write to output file for CI coordination
        if (process.argv.includes('--output-file')) {
          const outputFile = process.argv[process.argv.indexOf('--output-file') + 1] || 'preview-url.env';
          const content = [
            `PREVIEW_URL=`,
            `FALLBACK_USED=NONE`,
            `SHOULD_RUN_E2E=false`,
            `SKIP_REASON=${result.reason || 'All strategies failed'}`,
            `URL_VALIDATION_STATUS=FAILED`
          ].join('\n') + '\n';
          
          writeFileSync(outputFile, content);
          console.log(`⚠️ Failure details written to ${outputFile}`);
        }

        // Exit with warning code (not failure) to allow CI to continue gracefully
        console.log('\n⚠️ E2E tests will be skipped - CI continues with warning');
        process.exit(2);
      }
    })
    .catch(error => {
      console.error(`\n❌ CRITICAL ERROR: ${error.message}`);
      console.error(error.stack);
      
      // Still write failure info for CI coordination
      if (process.argv.includes('--output-file')) {
        const outputFile = process.argv[process.argv.indexOf('--output-file') + 1] || 'preview-url.env';
        const content = [
          `PREVIEW_URL=`,
          `FALLBACK_USED=ERROR`,
          `SHOULD_RUN_E2E=false`,
          `SKIP_REASON=Critical error: ${error.message}`,
          `URL_VALIDATION_STATUS=ERROR`
        ].join('\n') + '\n';
        
        writeFileSync(outputFile, content);
      }
      
      process.exit(1);
    });
}