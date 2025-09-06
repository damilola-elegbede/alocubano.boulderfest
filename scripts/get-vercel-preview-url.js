#!/usr/bin/env node

/**
 * Vercel Preview URL Extractor for E2E Testing
 * 
 * This utility extracts Vercel preview deployment URLs from:
 * 1. GitHub PR comments (Vercel Bot comments)
 * 2. GitHub API deployment status
 * 3. Vercel CLI commands
 * 4. Environment variables
 * 
 * Used by E2E tests to run against live preview deployments instead of local servers.
 * Provides better reliability and production-like testing environment.
 */

import { execSync } from 'child_process';
// fetch is global in Node.js 18+
// import fetch from 'node-fetch';
import { writeFileSync } from 'fs';

class VercelPreviewURLExtractor {
  constructor() {
    this.githubToken = process.env.GITHUB_TOKEN;
    this.vercelToken = process.env.VERCEL_TOKEN;
    this.repoOwner = process.env.GITHUB_REPOSITORY?.split('/')[0] || 'default-owner';
    this.repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'default-repo';
    this.prNumber = process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER;
    this.commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA;
    this.vercelProjectId = process.env.VERCEL_PROJECT_ID;
    this.vercelOrgId = process.env.VERCEL_ORG_ID;

    console.log('🔗 Vercel Preview URL Extractor');
    console.log(`   Repository: ${this.repoOwner}/${this.repoName}`);
    console.log(`   PR Number: ${this.prNumber || 'Not available'}`);
    console.log(`   Commit SHA: ${this.commitSha || 'Not available'}`);
    console.log(`   GitHub Token: ${this.githubToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Vercel Token: ${this.vercelToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Vercel Org ID: ${this.vercelOrgId ? '✅ Available' : '❌ Missing'}`);
  }

  /**
   * Main method to extract preview URL using multiple strategies
   */
  async getPreviewURL() {
    console.log('\n🚀 Extracting Vercel Preview URL...');
    console.log('═'.repeat(50));

    // Strategy 1: Direct environment variable
    const envUrl = await this.getFromEnvironment();
    if (envUrl) {
      return this.validateAndReturn(envUrl, 'Environment Variable');
    }

    // Strategy 2: GitHub PR comments (Vercel Bot)
    if (this.prNumber && this.githubToken) {
      const prUrl = await this.getFromPRComments();
      if (prUrl) {
        return this.validateAndReturn(prUrl, 'GitHub PR Comments');
      }
    }

    // Strategy 3: GitHub Deployments API
    if (this.githubToken && this.commitSha) {
      const deploymentUrl = await this.getFromDeployments();
      if (deploymentUrl) {
        return this.validateAndReturn(deploymentUrl, 'GitHub Deployments API');
      }
    }

    // Strategy 4: Vercel API (requires credentials - fail immediately if missing)
    if (!this.vercelToken || !this.vercelOrgId) {
      throw new Error('❌ FATAL: VERCEL_TOKEN and VERCEL_ORG_ID are required for Vercel API access');
    }
    
    if (this.vercelProjectId) {
      const apiUrl = await this.getFromVercelAPI();
      if (apiUrl) {
        return this.validateAndReturn(apiUrl, 'Vercel API');
      }
    }

    // Strategy 5: Vercel CLI (requires credentials - fail immediately if missing)
    const cliUrl = await this.getFromVercelCLI();
    if (cliUrl) {
      return this.validateAndReturn(cliUrl, 'Vercel CLI');
    }

    throw new Error('Unable to extract Vercel preview URL from any source');
  }

  /**
   * Strategy 1: Check environment variables
   */
  async getFromEnvironment() {
    console.log('🔍 Strategy 1: Checking secrets...');

    const envVars = [
      'VERCEL_PREVIEW_URL',
      'PREVIEW_URL',
      'VERCEL_URL',
      'DEPLOYMENT_URL'
    ];

    for (const envVar of envVars) {
      const url = process.env[envVar];
      if (url) {
        console.log(`   ✅ Found URL in ${envVar}: ${url}`);
        return url;
      }
    }

    console.log('   ❌ No preview URL found in environment variables');
    return null;
  }

  /**
   * Strategy 2: Extract from GitHub PR comments (Vercel Bot)
   */
  async getFromPRComments() {
    console.log('🔍 Strategy 2: Checking GitHub PR comments...');

    if (!this.githubToken || !this.prNumber) {
      console.log('   ⏭️ Skipping: Missing GitHub token or PR number');
      return null;
    }

    try {
      const url = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/issues/${this.prNumber}/comments`;
      console.log(`   📡 Fetching: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'E2E-Preview-URL-Extractor'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const comments = await response.json();
      console.log(`   📝 Found ${comments.length} comments`);

      // Look for Vercel Bot comments with preview URLs
      for (const comment of comments.reverse()) { // Check latest comments first
        if (this.isVercelBot(comment.user)) {
          const previewUrl = this.extractUrlFromComment(comment.body);
          if (previewUrl) {
            console.log(`   ✅ Found preview URL in Vercel Bot comment: ${previewUrl}`);
            return previewUrl;
          }
        }
      }

      console.log('   ❌ No preview URL found in Vercel Bot comments');
      return null;

    } catch (error) {
      console.log(`   ❌ Error fetching PR comments: ${error.message}`);
      return null;
    }
  }

  /**
   * Strategy 3: Get from GitHub Deployments API
   */
  async getFromDeployments() {
    console.log('🔍 Strategy 3: Checking GitHub Deployments API...');

    if (!this.githubToken || !this.commitSha) {
      console.log('   ⏭️ Skipping: Missing GitHub token or commit SHA');
      return null;
    }

    try {
      const url = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/deployments`;
      console.log(`   📡 Fetching: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'E2E-Preview-URL-Extractor'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const deployments = await response.json();
      console.log(`   🚀 Found ${deployments.length} deployments`);

      // Find deployments for our commit
      const relevantDeployments = deployments.filter(d => 
        d.sha === this.commitSha && 
        d.environment === 'Preview'
      );

      for (const deployment of relevantDeployments) {
        // Get deployment statuses
        const statusUrl = `${url}/${deployment.id}/statuses`;
        const statusResponse = await fetch(statusUrl, {
          headers: {
            'Authorization': `token ${this.githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (statusResponse.ok) {
          const statuses = await statusResponse.json();
          const successStatus = statuses.find(s => s.state === 'success');
          
          if (successStatus && successStatus.target_url) {
            console.log(`   ✅ Found deployment URL: ${successStatus.target_url}`);
            return successStatus.target_url;
          }
        }
      }

      console.log('   ❌ No successful preview deployments found');
      return null;

    } catch (error) {
      console.log(`   ❌ Error fetching deployments: ${error.message}`);
      return null;
    }
  }

  /**
   * Strategy 4: Get from Vercel API
   */
  async getFromVercelAPI() {
    console.log('🔍 Strategy 4: Checking Vercel API...');

    if (!this.vercelToken) {
      throw new Error('❌ FATAL: VERCEL_TOKEN secret not configured');
    }
    
    if (!this.vercelOrgId) {
      throw new Error('❌ FATAL: VERCEL_ORG_ID secret not configured');
    }
    
    if (!this.vercelProjectId) {
      console.log('   ⏭️ Skipping: Missing Vercel project ID');
      return null;
    }

    try {
      let url = `https://api.vercel.com/v6/deployments?projectId=${this.vercelProjectId}&limit=10`;
      
      if (this.commitSha) {
        url += `&gitCommitSha=${this.commitSha}`;
      }

      console.log(`   📡 Fetching: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.vercelToken}`,
          'Accept': 'application/json',
          'User-Agent': 'E2E-Preview-URL-Extractor'
        }
      });

      if (!response.ok) {
        throw new Error(`Vercel API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const deployments = data.deployments || [];
      console.log(`   🚀 Found ${deployments.length} deployments`);

      // Find the most recent successful preview deployment
      const previewDeployment = deployments.find(d => 
        d.state === 'READY' && 
        d.type === 'LAMBDAS' &&
        (!this.commitSha || d.meta?.githubCommitSha === this.commitSha)
      );

      if (previewDeployment) {
        const previewUrl = `https://${previewDeployment.url}`;
        console.log(`   ✅ Found deployment URL: ${previewUrl}`);
        return previewUrl;
      }

      console.log('   ❌ No ready preview deployments found');
      return null;

    } catch (error) {
      console.log(`   ❌ Error fetching from Vercel API: ${error.message}`);
      return null;
    }
  }

  /**
   * Strategy 5: Get from Vercel CLI (requires credentials)
   */
  async getFromVercelCLI() {
    console.log('🔍 Strategy 5: Using Vercel CLI...');

    if (!this.vercelToken) {
      throw new Error('❌ FATAL: VERCEL_TOKEN secret not configured');
    }
    
    if (!this.vercelOrgId) {
      throw new Error('❌ FATAL: VERCEL_ORG_ID secret not configured');
    }

    try {
      // Try to get recent deployments using Vercel CLI
      const commands = [
        `vercel ls --confirm --token ${this.vercelToken} --scope ${this.vercelOrgId}`,
        `vercel list --confirm --token ${this.vercelToken} --scope ${this.vercelOrgId}`
      ];

      for (const command of commands) {
        try {
          console.log(`   📋 Running: ${command.replace(this.vercelToken, '[REDACTED]')}`);
          
          const output = execSync(command, { 
            encoding: 'utf8', 
            timeout: 15000,
            stdio: 'pipe',
            env: {
              ...process.env,
              VERCEL_TOKEN: this.vercelToken
            }
          });

          // Parse CLI output for URLs
          const lines = output.split('\n');
          for (const line of lines) {
            const urlMatch = line.match(/https:\/\/[^\s]+\.vercel\.app/);
            if (urlMatch) {
              const url = urlMatch[0];
              console.log(`   ✅ Found URL from CLI: ${url}`);
              return url;
            }
          }

        } catch (cmdError) {
          console.log(`   ⚠️ Command failed: ${cmdError.message}`);
        }
      }

      console.log('   ❌ No URLs found from Vercel CLI');
      return null;

    } catch (error) {
      console.log(`   ❌ Vercel CLI strategy failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if user is Vercel Bot
   */
  isVercelBot(user) {
    const vercelBotPatterns = [
      'vercel[bot]',
      'vercel-bot',
      'vercel',
      'github-actions[bot]'
    ];

    return vercelBotPatterns.some(pattern => 
      user.login?.toLowerCase().includes(pattern.toLowerCase()) ||
      user.type === 'Bot'
    );
  }

  /**
   * Extract URL from comment body
   */
  extractUrlFromComment(body) {
    if (!body) return null;

    // Common patterns for Vercel preview URLs
    const patterns = [
      /https:\/\/[a-zA-Z0-9-]+(?:-[a-zA-Z0-9]+)*\.vercel\.app/g,
      /https:\/\/[a-zA-Z0-9-]+\.now\.sh/g,
      /Preview:\s*(https:\/\/[^\s)]+)/gi,
      /\*\*Preview:\*\*\s*(https:\/\/[^\s)]+)/gi,
      /✅\s*Deploy\s*Preview\s*ready!\s*(https:\/\/[^\s)]+)/gi
    ];

    for (const pattern of patterns) {
      const matches = body.match(pattern);
      if (matches && matches.length > 0) {
        return matches[0].replace(/^.*?(https:\/\/.*)$/, '$1');
      }
    }

    return null;
  }

  /**
   * Validate URL and wait for it to be ready
   */
  async validateAndReturn(url, source) {
    console.log(`\n✅ Preview URL found from ${source}: ${url}`);
    console.log('🔍 Validating preview deployment...');

    // Clean up URL
    const cleanUrl = url.replace(/\/$/, ''); // Remove trailing slash

    try {
      // Wait for deployment to be ready
      const isReady = await this.waitForDeployment(cleanUrl);
      
      if (isReady) {
        console.log('✅ Preview deployment is ready for E2E testing');
        console.log(`🎯 Final URL: ${cleanUrl}`);
        return cleanUrl;
      } else {
        throw new Error('Preview deployment validation timeout');
      }

    } catch (error) {
      console.log(`❌ URL validation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Wait for deployment to be ready
   */
  async waitForDeployment(url, maxAttempts = 20, intervalMs = 15000) {
    console.log(`⏳ Waiting for deployment to be ready (max ${maxAttempts} attempts)...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`   🔍 Attempt ${attempt}/${maxAttempts}: Checking ${url}/api/health/check`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${url}/api/health/check`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'E2E-Preview-Validation'
          }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          console.log(`   ✅ Deployment ready (${response.status}): ${JSON.stringify(data)}`);
          return true;
        } else {
          console.log(`   ⚠️ Not ready yet (${response.status}): ${response.statusText}`);
        }

      } catch (error) {
        console.log(`   ⚠️ Check failed (${attempt}/${maxAttempts}): ${error.message}`);
      }

      if (attempt < maxAttempts) {
        console.log(`   ⏳ Waiting ${intervalMs}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    return false;
  }

  /**
   * Generate fallback URL for development
   */
  generateFallbackUrl() {
    const timestamp = Date.now();
    const branch = process.env.GITHUB_HEAD_REF || 'main';
    const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    
    return `https://${this.repoName}-${safeBranch}-${timestamp.toString(36)}.vercel.app`;
  }
}

// Main execution when called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const extractor = new VercelPreviewURLExtractor();

  extractor.getPreviewURL()
    .then(url => {
      console.log(`\n🎉 SUCCESS: Preview URL extracted`);
      console.log(`URL: ${url}`);
      
      // Output for shell scripts
      console.log(`PREVIEW_URL=${url}`);
      
      // Write to environment file if requested
      if (process.argv.includes('--write-env')) {
        const envFile = process.argv.includes('--env-file') 
          ? process.argv[process.argv.indexOf('--env-file') + 1] 
          : '.env.preview';
        
        try {
          writeFileSync(envFile, `PREVIEW_URL=${url}\n`);
          console.log(`✅ Written to ${envFile}`);
        } catch (error) {
          console.error(`❌ Failed to write env file: ${error.message}`);
        }
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error(`\n❌ FAILED: ${error.message}`);
      
      // Try to provide helpful debugging information
      console.error('\n🔧 Debugging Information:');
      console.error(`   GitHub Repository: ${process.env.GITHUB_REPOSITORY || 'Not set'}`);
      console.error(`   PR Number: ${process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER || 'Not set'}`);
      console.error(`   Commit SHA: ${process.env.GITHUB_SHA || 'Not set'}`);
      console.error(`   GitHub Token: ${process.env.GITHUB_TOKEN ? 'Available' : 'Missing'}`);
      console.error(`   Vercel Token: ${process.env.VERCEL_TOKEN ? 'Available' : 'Missing'}`);
      console.error(`   Vercel Org ID: ${process.env.VERCEL_ORG_ID ? 'Available' : 'Missing'}`);
      
      process.exit(1);
    });
}

export default VercelPreviewURLExtractor;