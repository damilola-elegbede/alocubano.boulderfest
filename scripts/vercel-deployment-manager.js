#!/usr/bin/env node

/**
 * Vercel Deployment Manager for E2E Testing
 *
 * Manages Vercel preview deployments with intelligent strategies:
 * - Creates new deployments when code changes
 * - Reuses existing deployments when appropriate
 * - Validates deployment matches current code
 *
 * Usage:
 *   node vercel-deployment-manager.js              # Default: use existing or create new
 *   node vercel-deployment-manager.js --force-new  # Always create new deployment
 *   node vercel-deployment-manager.js --use-latest # Use latest deployment (with validation)
 *   node vercel-deployment-manager.js --preview-url=https://... # Use specific URL
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

class VercelDeploymentManager {
  constructor() {
    // Parse command line arguments
    this.args = this.parseArgs();

    // Get environment configuration
    this.vercelToken = process.env.VERCEL_TOKEN;
    this.vercelOrgId = process.env.VERCEL_ORG_ID;
    this.vercelProjectId = process.env.VERCEL_PROJECT_ID;

    // Git information
    this.currentCommit = this.getCurrentCommit();
    this.currentBranch = this.getCurrentBranch();

    // Deployment cache file in .tmp directory
    this.cacheFile = resolve(process.cwd(), '.tmp', '.vercel-deployment-cache.json');

    // Ensure .tmp directory exists
    const tmpDir = resolve(process.cwd(), '.tmp');
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
  }

  parseArgs() {
    const args = {
      forceNew: false,
      useLatest: false,
      previewUrl: null,
      cleanup: true
    };

    process.argv.slice(2).forEach(arg => {
      if (arg === '--force-new') {
        args.forceNew = true;
      } else if (arg === '--use-latest') {
        args.useLatest = true;
      } else if (arg.startsWith('--preview-url=')) {
        args.previewUrl = arg.split('=')[1];
      } else if (arg === '--no-cleanup') {
        args.cleanup = false;
      }
    });

    return args;
  }

  getCurrentCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch (error) {
      console.error('Failed to get current git commit:', error.message);
      return null;
    }
  }

  getCurrentBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch (error) {
      console.error('Failed to get current git branch:', error.message);
      return null;
    }
  }

  /**
   * Main entry point
   */
  async getDeploymentUrl() {
    console.log('🚀 Vercel Deployment Manager - Smart Detection Mode');
    console.log('='.repeat(60));
    console.log(`📍 Current branch: ${this.currentBranch}`);
    console.log(`📍 Current commit: ${this.currentCommit?.substring(0, 8)}`);
    console.log(`📍 Strategy: ${this.getStrategyDescription()}`);
    console.log('');

    // Check for explicit preview URL
    if (this.args.previewUrl) {
      console.log(`✅ Using provided preview URL: ${this.args.previewUrl}`);
      const isValid = await this.validateDeployment(this.args.previewUrl);
      if (!isValid) {
        console.warn('⚠️  Warning: Provided URL may not match current code');
      }
      return this.args.previewUrl;
    }

    // Force new deployment
    if (this.args.forceNew) {
      return await this.createNewDeployment();
    }

    // Use latest existing deployment
    if (this.args.useLatest) {
      const latest = await this.findLatestDeployment();
      if (latest) {
        console.log(`✅ Using latest deployment: ${latest}`);
        return latest;
      }
      console.log('⚠️  No suitable latest deployment found, creating new...');
      return await this.createNewDeployment();
    }

    // Smart detection strategy: Check for code changes
    console.log('🔍 Checking for code changes since last deployment...');

    // First, check if we have a cached deployment
    const cached = this.getCachedDeployment();
    if (cached) {
      // Check if any files have changed since the cache was created
      const hasChanges = this.hasCodeChangesSince(cached.timestamp);

      if (!hasChanges && await this.validateDeployment(cached.url)) {
        console.log(`✅ No code changes detected. Using cached deployment from ${this.getTimeDiff(cached.timestamp)} ago`);
        console.log(`   URL: ${cached.url}`);
        return cached.url;
      } else if (hasChanges) {
        console.log(`🔄 Code changes detected since last deployment (${this.getTimeDiff(cached.timestamp)} ago)`);
        console.log(`   Creating new deployment for updated code...`);
        return await this.createNewDeployment();
      }
    }

    // Check for existing deployment for current commit
    const existing = await this.findExistingDeployment();
    if (existing) {
      console.log(`✅ Found existing deployment for current commit`);
      this.cacheDeployment(existing);
      return existing;
    }

    console.log('📦 No existing deployment found, creating new...');
    return await this.createNewDeployment();
  }

  getStrategyDescription() {
    if (this.args.previewUrl) return 'Use specific URL';
    if (this.args.forceNew) return 'Force new deployment';
    if (this.args.useLatest) return 'Use latest deployment';
    return 'Smart detection (auto-detect code changes)';
  }

  /**
   * Check if any code files have changed since a given timestamp
   */
  hasCodeChangesSince(timestamp) {
    try {
      const cacheTime = new Date(timestamp).getTime();

      // Get list of changed files using git
      const changedFiles = execSync(
        `git diff --name-only HEAD $(git log -1 --before='${timestamp}' --format=%H) 2>/dev/null || echo "CHANGES_DETECTED"`,
        { encoding: 'utf8' }
      ).trim();

      if (changedFiles === 'CHANGES_DETECTED' || changedFiles.length > 0) {
        // Also check for uncommitted changes
        const uncommittedChanges = execSync('git status --porcelain', { encoding: 'utf8' }).trim();

        if (uncommittedChanges || changedFiles !== '') {
          console.log('   📝 Detected changes in:');

          // Show specific changed files (limit to first 5)
          if (changedFiles && changedFiles !== 'CHANGES_DETECTED') {
            const files = changedFiles.split('\n').filter(f => f).slice(0, 5);
            files.forEach(file => console.log(`      - ${file}`));
            if (changedFiles.split('\n').length > 5) {
              console.log(`      ... and ${changedFiles.split('\n').length - 5} more files`);
            }
          }

          if (uncommittedChanges) {
            console.log('   ⚠️  Plus uncommitted changes');
          }

          return true;
        }
      }

      // Also check if any source files were modified after the cache timestamp
      const sourcePatterns = [
        'api/**/*.js',
        'lib/**/*.js',
        'js/**/*.js',
        'css/**/*.css',
        'pages/**/*.html',
        'migrations/**/*.sql',
        'package.json',
        'vercel.json'
      ];

      for (const pattern of sourcePatterns) {
        try {
          // Use find to check if any matching files were modified after the cache time
          const modifiedFiles = execSync(
            `find . -path "./node_modules" -prune -o -path "./.vercel" -prune -o -name "${pattern.split('/').pop()}" -newer "${this.cacheFile}" -print 2>/dev/null | head -5`,
            { encoding: 'utf8' }
          ).trim();

          if (modifiedFiles) {
            console.log(`   📝 Files modified since last deployment`);
            return true;
          }
        } catch {
          // Ignore find command errors
        }
      }

      return false;
    } catch (error) {
      console.warn('   ⚠️  Could not determine code changes, assuming changes exist');
      return true;
    }
  }

  /**
   * Get human-readable time difference
   */
  getTimeDiff(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return 'less than a minute';
  }

  /**
   * Create a new Vercel deployment
   */
  async createNewDeployment() {
    console.log('\n📦 Creating new Vercel preview deployment...');
    console.log('-'.repeat(40));

    try {
      // Check if Vercel CLI is installed
      try {
        execSync('npx vercel --version', { stdio: 'ignore' });
      } catch {
        console.log('📥 Installing Vercel CLI...');
        execSync('npm install -g vercel', { stdio: 'inherit' });
      }

      // Build the deployment command
      let deployCommand = 'npx vercel deploy';

      // Add authentication if available
      if (this.vercelToken) {
        deployCommand += ` --token="${this.vercelToken}"`;
      }

      // Add team/org if available
      if (this.vercelOrgId) {
        deployCommand += ` --scope="${this.vercelOrgId}"`;
      }

      // Ensure it's a preview deployment (not production)
      deployCommand += ' --target=preview';

      // Skip build confirmation
      deployCommand += ' --yes';

      console.log('🔨 Building and deploying to Vercel...');
      console.log(`   Command: ${deployCommand.replace(this.vercelToken, '***')}`);

      // Execute deployment
      const output = execSync(deployCommand, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
          ...process.env,
          VERCEL_ORG_ID: this.vercelOrgId,
          VERCEL_PROJECT_ID: this.vercelProjectId
        }
      });

      // Extract URL from output
      const urlMatch = output.match(/https:\/\/[^\s]+\.vercel\.app/);
      if (!urlMatch) {
        throw new Error('Failed to extract deployment URL from Vercel output');
      }

      const deploymentUrl = urlMatch[0];
      console.log(`✅ Deployment created: ${deploymentUrl}`);

      // Wait for deployment to be ready
      await this.waitForDeployment(deploymentUrl);

      // Cache the deployment
      this.cacheDeployment(deploymentUrl);

      // Tag the deployment with metadata
      await this.tagDeployment(deploymentUrl);

      return deploymentUrl;

    } catch (error) {
      console.error('❌ Failed to create deployment:', error.message);
      throw error;
    }
  }

  /**
   * Find existing deployment for current commit
   */
  async findExistingDeployment() {
    if (!this.vercelToken || !this.vercelProjectId) {
      console.log('⏭️  Skipping existing deployment check (missing Vercel credentials)');
      return null;
    }

    console.log('\n🔍 Checking for existing deployments...');

    try {
      const url = `https://api.vercel.com/v6/deployments?projectId=${this.vercelProjectId}&limit=20`;

      const response = await fetch(url, {
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

      // Find deployment matching current commit
      const matching = deployments.find(d =>
        d.meta?.githubCommitSha === this.currentCommit &&
        d.state === 'READY' &&
        d.type === 'LAMBDAS'
      );

      if (matching) {
        return `https://${matching.url}`;
      }

      return null;

    } catch (error) {
      console.error('⚠️  Error checking existing deployments:', error.message);
      return null;
    }
  }

  /**
   * Find the latest deployment (regardless of commit)
   */
  async findLatestDeployment() {
    if (!this.vercelToken || !this.vercelProjectId) {
      console.log('⏭️  Skipping latest deployment check (missing Vercel credentials)');
      return null;
    }

    console.log('\n🔍 Finding latest deployment...');

    try {
      const url = `https://api.vercel.com/v6/deployments?projectId=${this.vercelProjectId}&limit=5`;

      const response = await fetch(url, {
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

      // Find first ready deployment
      const latest = deployments.find(d =>
        d.state === 'READY' &&
        d.type === 'LAMBDAS'
      );

      if (latest) {
        const url = `https://${latest.url}`;
        console.log(`   Found: ${url}`);
        console.log(`   Commit: ${latest.meta?.githubCommitSha?.substring(0, 8) || 'unknown'}`);
        console.log(`   Branch: ${latest.meta?.githubCommitRef || 'unknown'}`);
        console.log(`   Age: ${this.getDeploymentAge(latest.created)}`);
        return url;
      }

      return null;

    } catch (error) {
      console.error('⚠️  Error finding latest deployment:', error.message);
      return null;
    }
  }

  /**
   * Wait for deployment to be ready (typically takes ~4 minutes)
   */
  async waitForDeployment(url, maxWaitTime = 300000) { // 5 minutes max
    console.log('\n⏳ Waiting for deployment to be ready (typically ~4 minutes)...');
    const startTime = Date.now();
    const checkInterval = 10000; // Check every 10 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(`${url}/api/health/check`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'healthy') {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            console.log(`✅ Deployment ready after ${minutes}m ${seconds}s`);
            return true;
          }
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        console.log(`   Still waiting... (${minutes}m ${seconds}s elapsed)`);
        await this.sleep(checkInterval);

      } catch (error) {
        // Expected to fail while deployment is building
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        console.log(`   Deployment building... (${minutes}m ${seconds}s elapsed)`);
        await this.sleep(checkInterval);
      }
    }

    throw new Error('Deployment did not become ready in time');
  }

  /**
   * Validate that a deployment URL is accessible and healthy
   */
  async validateDeployment(url) {
    try {
      const response = await fetch(`${url}/api/health/check`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.status === 'healthy';

    } catch (error) {
      console.error(`⚠️  Deployment validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Tag deployment with metadata
   */
  async tagDeployment(url) {
    if (!this.vercelToken) return;

    try {
      // Extract deployment ID from URL
      const deploymentId = url.match(/([a-z0-9]+)\.vercel\.app/)?.[1];
      if (!deploymentId) return;

      const metadata = {
        e2e_test: 'true',
        commit: this.currentCommit,
        branch: this.currentBranch,
        timestamp: new Date().toISOString()
      };

      console.log(`🏷️  Tagging deployment with metadata...`);

      // Note: Vercel API doesn't directly support updating deployment metadata
      // This is a placeholder for future implementation
      // For now, we'll just log the intention

    } catch (error) {
      console.warn('⚠️  Could not tag deployment:', error.message);
    }
  }

  /**
   * Cache deployment information
   */
  cacheDeployment(url) {
    const cache = {
      url,
      commit: this.currentCommit,
      branch: this.currentBranch,
      timestamp: new Date().toISOString()
    };

    try {
      writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));
      console.log(`💾 Cached deployment for commit ${this.currentCommit.substring(0, 8)}`);
    } catch (error) {
      console.warn('⚠️  Could not cache deployment:', error.message);
    }
  }

  /**
   * Get cached deployment if valid
   */
  getCachedDeployment() {
    if (!existsSync(this.cacheFile)) {
      return null;
    }

    try {
      const cache = JSON.parse(readFileSync(this.cacheFile, 'utf8'));

      // Check if cache is for current commit
      if (cache.commit === this.currentCommit) {
        console.log(`💾 Found cached deployment for current commit`);
        return cache;
      }

      // Cache is stale
      console.log(`🔄 Cache is for different commit (${cache.commit.substring(0, 8)})`);
      return null;

    } catch (error) {
      console.warn('⚠️  Could not read deployment cache:', error.message);
      return null;
    }
  }

  /**
   * Get human-readable deployment age
   */
  getDeploymentAge(timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(age / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} old`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} old`;
    return `${minutes} minute${minutes > 1 ? 's' : ''} old`;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new VercelDeploymentManager();
  manager.getDeploymentUrl()
    .then(url => {
      console.log('\n' + '='.repeat(60));
      console.log(`✅ Deployment URL: ${url}`);
      console.log('='.repeat(60));

      // Set environment variable for other scripts
      process.env.PREVIEW_URL = url;

      // Write to .env.preview for test runner
      const envContent = `PREVIEW_URL=${url}\n`;
      writeFileSync('.env.preview', envContent);

      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Failed to get deployment URL:', error.message);
      process.exit(1);
    });
}

export default VercelDeploymentManager;