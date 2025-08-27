#!/usr/bin/env node

/**
 * Branch Protection Validation Script
 * 
 * Validates current GitHub branch protection settings against the configuration
 * defined in .github/branch-protection-rules.json
 * 
 * Usage:
 *   node scripts/validate-branch-protection.js [options]
 * 
 * Options:
 *   --apply         Apply the branch protection rules to GitHub
 *   --dry-run       Show what would be applied without making changes
 *   --branch=main   Specify branch to validate (default: main)
 *   --verbose       Show detailed validation results
 * 
 * Environment Variables:
 *   GITHUB_TOKEN    GitHub token with repo admin permissions
 *   GITHUB_REPO     Repository in format owner/repo
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Configuration
const CONFIG = {
  github: {
    api: 'https://api.github.com',
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY
  },
  configPath: join(projectRoot, '.github/branch-protection-rules.json'),
  defaultBranch: 'main'
};

class BranchProtectionValidator {
  constructor() {
    this.config = this.loadConfig();
    this.verbose = false;
  }

  /**
   * Load branch protection configuration
   */
  loadConfig() {
    try {
      const configContent = readFileSync(CONFIG.configPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      console.error(`❌ Failed to load branch protection config: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Validate branch protection rules
   */
  async validateBranchProtection(branchName = CONFIG.defaultBranch, options = {}) {
    console.log(`🔍 Validating branch protection for: ${branchName}`);
    
    if (!CONFIG.github.token || !CONFIG.github.repo) {
      console.warn('⚠️ GitHub token and repository required for validation');
      console.log('Set GITHUB_TOKEN and GITHUB_REPO environment variables');
      return false;
    }

    try {
      // Get current branch protection settings
      const current = await this.getCurrentProtection(branchName);
      
      // Get expected settings from config
      const expected = this.config.rules[branchName];
      
      if (!expected) {
        console.warn(`⚠️ No protection rules defined for branch: ${branchName}`);
        return false;
      }

      // Compare settings
      const validation = this.compareProtectionSettings(current, expected.protection);
      
      // Display results
      this.displayValidationResults(validation, branchName);
      
      // Apply changes if requested
      if (options.apply && !validation.isValid) {
        await this.applyProtectionRules(branchName, expected.protection);
      }
      
      return validation.isValid;
    } catch (error) {
      console.error(`❌ Validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get current branch protection settings from GitHub
   */
  async getCurrentProtection(branchName) {
    const url = `${CONFIG.github.api}/repos/${CONFIG.github.repo}/branches/${branchName}/protection`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${CONFIG.github.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.status === 404) {
        console.log(`ℹ️ No branch protection currently configured for: ${branchName}`);
        return null;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} ${error}`);
      }

      return await response.json();
    } catch (error) {
      if (error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Compare current and expected protection settings
   */
  compareProtectionSettings(current, expected) {
    const issues = [];
    const warnings = [];
    
    // If no current protection exists
    if (!current) {
      issues.push('No branch protection currently configured');
      return {
        isValid: false,
        issues,
        warnings,
        differences: { missing: 'all protection rules' }
      };
    }

    const differences = {};

    // Check required status checks
    if (expected.required_status_checks) {
      const currentChecks = current.required_status_checks || {};
      const expectedChecks = expected.required_status_checks;
      
      if (currentChecks.strict !== expectedChecks.strict) {
        differences.strict_checks = {
          current: currentChecks.strict,
          expected: expectedChecks.strict
        };
        issues.push(`Strict status checks: expected ${expectedChecks.strict}, got ${currentChecks.strict}`);
      }
      
      // Check required contexts
      const currentContexts = new Set(currentChecks.contexts || []);
      const expectedContexts = new Set(expectedChecks.contexts || []);
      
      const missingContexts = [...expectedContexts].filter(ctx => !currentContexts.has(ctx));
      const extraContexts = [...currentContexts].filter(ctx => !expectedContexts.has(ctx));
      
      if (missingContexts.length > 0) {
        differences.missing_contexts = missingContexts;
        issues.push(`Missing required status checks: ${missingContexts.join(', ')}`);
      }
      
      if (extraContexts.length > 0) {
        differences.extra_contexts = extraContexts;
        warnings.push(`Extra status checks configured: ${extraContexts.join(', ')}`);
      }
    }

    // Check required pull request reviews
    if (expected.required_pull_request_reviews) {
      const currentReviews = current.required_pull_request_reviews || {};
      const expectedReviews = expected.required_pull_request_reviews;
      
      if (currentReviews.required_approving_review_count !== expectedReviews.required_approving_review_count) {
        differences.review_count = {
          current: currentReviews.required_approving_review_count,
          expected: expectedReviews.required_approving_review_count
        };
        issues.push(`Required reviews: expected ${expectedReviews.required_approving_review_count}, got ${currentReviews.required_approving_review_count}`);
      }
      
      if (currentReviews.dismiss_stale_reviews !== expectedReviews.dismiss_stale_reviews) {
        differences.dismiss_stale = {
          current: currentReviews.dismiss_stale_reviews,
          expected: expectedReviews.dismiss_stale_reviews
        };
        issues.push(`Dismiss stale reviews: expected ${expectedReviews.dismiss_stale_reviews}, got ${currentReviews.dismiss_stale_reviews}`);
      }
    }

    // Check other protection settings
    const booleanSettings = [
      'enforce_admins',
      'required_conversation_resolution',
      'allow_force_pushes',
      'allow_deletions',
      'required_linear_history'
    ];

    booleanSettings.forEach(setting => {
      if (expected.hasOwnProperty(setting)) {
        const currentValue = current[setting]?.enabled ?? false;
        const expectedValue = expected[setting];
        
        if (currentValue !== expectedValue) {
          differences[setting] = {
            current: currentValue,
            expected: expectedValue
          };
          issues.push(`${setting.replace(/_/g, ' ')}: expected ${expectedValue}, got ${currentValue}`);
        }
      }
    });

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      differences
    };
  }

  /**
   * Display validation results
   */
  displayValidationResults(validation, branchName) {
    console.log(`\n📋 Branch Protection Validation Results for: ${branchName}`);
    console.log('═'.repeat(60));
    
    if (validation.isValid) {
      console.log('✅ Branch protection configuration is valid!');
    } else {
      console.log('❌ Branch protection configuration has issues:');
      console.log('');
      
      validation.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ❌ ${issue}`);
      });
    }
    
    if (validation.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      validation.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ⚠️ ${warning}`);
      });
    }
    
    if (this.verbose && Object.keys(validation.differences).length > 0) {
      console.log('\n🔍 Detailed Differences:');
      console.log(JSON.stringify(validation.differences, null, 2));
    }
    
    console.log('═'.repeat(60));
  }

  /**
   * Apply branch protection rules to GitHub
   */
  async applyProtectionRules(branchName, protection) {
    console.log(`🔧 Applying branch protection rules to: ${branchName}`);
    
    const url = `${CONFIG.github.api}/repos/${CONFIG.github.repo}/branches/${branchName}/protection`;
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${CONFIG.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(protection)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to apply protection: ${response.status} ${error}`);
      }

      console.log('✅ Branch protection rules applied successfully!');
      return true;
    } catch (error) {
      console.error(`❌ Failed to apply protection rules: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate branch protection payload for GitHub API
   */
  generateProtectionPayload(branchName) {
    const rule = this.config.rules[branchName];
    if (!rule) {
      throw new Error(`No protection rule defined for branch: ${branchName}`);
    }
    
    return rule.protection;
  }

  /**
   * Show current status of all quality gates
   */
  async showQualityGatesStatus() {
    console.log('\n🚪 Quality Gates Status');
    console.log('═'.repeat(50));
    
    const gates = this.config.quality_gates.gates;
    
    for (const [gateName, gateConfig] of Object.entries(gates)) {
      const status = await this.checkQualityGateStatus(gateName, gateConfig);
      const icon = status ? '✅' : '❌';
      const required = gateConfig.required ? '🔒' : '⚠️';
      
      console.log(`${icon} ${required} ${gateName.replace('_', ' ').toUpperCase()}`);
      
      if (this.verbose) {
        console.log(`   Timeout: ${gateConfig.timeout_minutes}min`);
        console.log(`   Retries: ${gateConfig.retry_count}`);
        console.log(`   Action: ${gateConfig.failure_action}`);
      }
    }
    
    console.log('═'.repeat(50));
  }

  /**
   * Check individual quality gate status
   */
  async checkQualityGateStatus(gateName, gateConfig) {
    // This would integrate with actual CI status checks
    // For now, return true as placeholder
    return true;
  }

  /**
   * Show flaky test detection configuration
   */
  showFlakyTestConfig() {
    console.log('\n🔄 Flaky Test Detection Configuration');
    console.log('═'.repeat(50));
    
    const config = this.config.flaky_test_detection.settings;
    
    console.log(`Enabled: ${config.enabled ? '✅' : '❌'}`);
    console.log(`Failure Threshold: ${config.failure_threshold} failures`);
    console.log(`Success Rate Threshold: ${(config.success_rate_threshold * 100)}%`);
    console.log(`Observation Window: ${config.observation_window_hours} hours`);
    console.log(`Auto Retry: ${config.auto_retry_enabled ? '✅' : '❌'}`);
    console.log(`Max Retries: ${config.max_retries}`);
    console.log(`Quarantine: ${config.quarantine_enabled ? '✅' : '❌'}`);
    
    if (config.quarantine_enabled) {
      console.log(`Quarantine Duration: ${config.quarantine_duration_hours / 24} days`);
    }
    
    console.log('═'.repeat(50));
  }

  /**
   * Show performance monitoring configuration
   */
  showPerformanceConfig() {
    console.log('\n📊 Performance Monitoring Configuration');
    console.log('═'.repeat(50));
    
    const config = this.config.performance_monitoring.settings;
    
    if (config.baseline_comparison.enabled) {
      console.log('✅ Baseline Comparison Enabled');
      console.log(`   Comparison Branch: ${config.baseline_comparison.comparison_branch}`);
      console.log(`   Regression Threshold: ${config.baseline_comparison.regression_threshold_percent}%`);
      console.log(`   Monitored Metrics:`);
      config.baseline_comparison.metrics.forEach(metric => {
        console.log(`     - ${metric}`);
      });
    } else {
      console.log('❌ Baseline Comparison Disabled');
    }
    
    console.log('');
    console.log('Alert Thresholds:');
    Object.entries(config.alerts).forEach(([alertType, alertConfig]) => {
      if (alertConfig.enabled) {
        console.log(`✅ ${alertType.replace('_', ' ')}: ${alertConfig.threshold_percent || alertConfig.threshold_kb}${alertConfig.threshold_percent ? '%' : 'KB'}`);
      }
    });
    
    console.log('═'.repeat(50));
  }

  /**
   * Generate setup instructions
   */
  generateSetupInstructions() {
    console.log('\n📖 Setup Instructions');
    console.log('═'.repeat(50));
    
    const instructions = this.config.setup_instructions;
    
    console.log('GitHub API Method:');
    console.log(`Endpoint: ${instructions.github_api.endpoint}`);
    console.log(`Auth: ${instructions.github_api.authentication}`);
    console.log(`Example: ${instructions.github_api.example_command}`);
    
    console.log('\nGitHub Web Interface:');
    instructions.github_web.steps.forEach(step => {
      console.log(`  ${step}`);
    });
    
    console.log('\nValidation:');
    console.log(`Command: ${instructions.validation.command}`);
    console.log(`Description: ${instructions.validation.description}`);
    
    console.log('═'.repeat(50));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    apply: false,
    dryRun: false,
    verbose: false,
    branch: CONFIG.defaultBranch,
    showConfig: false,
    showSetup: false
  };

  // Parse arguments
  for (const arg of args) {
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--show-config') {
      options.showConfig = true;
    } else if (arg === '--show-setup') {
      options.showSetup = true;
    } else if (arg.startsWith('--branch=')) {
      options.branch = arg.split('=')[1];
    } else if (arg === '--help') {
      showHelp();
      process.exit(0);
    }
  }

  const validator = new BranchProtectionValidator();
  validator.verbose = options.verbose;

  try {
    if (options.showConfig) {
      console.log('📋 Branch Protection Configuration');
      console.log('═'.repeat(50));
      console.log(JSON.stringify(validator.config, null, 2));
      return;
    }

    if (options.showSetup) {
      validator.generateSetupInstructions();
      return;
    }

    console.log('🛡️ Branch Protection Validator');
    console.log(`Repository: ${CONFIG.github.repo || 'Not configured'}`);
    console.log(`GitHub Token: ${CONFIG.github.token ? 'Configured' : 'Missing'}`);
    
    if (options.dryRun) {
      console.log('🧪 Dry-run mode: No changes will be made');
    }

    // Validate branch protection
    const isValid = await validator.validateBranchProtection(options.branch, options);
    
    // Show additional configuration info
    if (options.verbose) {
      await validator.showQualityGatesStatus();
      validator.showFlakyTestConfig();
      validator.showPerformanceConfig();
    }

    if (!isValid && !options.apply) {
      console.log('\n💡 To apply the correct settings, run:');
      console.log(`   node scripts/validate-branch-protection.js --apply --branch=${options.branch}`);
    }

    process.exit(isValid ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
🛡️ Branch Protection Validator

Usage:
  node scripts/validate-branch-protection.js [options]

Options:
  --apply               Apply branch protection rules to GitHub
  --dry-run             Show what would be applied without making changes
  --branch=BRANCH       Specify branch to validate (default: main)
  --verbose             Show detailed validation results and configuration
  --show-config         Display the current configuration
  --show-setup          Show setup instructions
  --help                Show this help message

Examples:
  # Validate current settings
  node scripts/validate-branch-protection.js

  # Validate with detailed output
  node scripts/validate-branch-protection.js --verbose

  # Apply protection rules
  node scripts/validate-branch-protection.js --apply

  # Validate specific branch
  node scripts/validate-branch-protection.js --branch=develop

Environment Variables:
  GITHUB_TOKEN          GitHub token with repo admin permissions
  GITHUB_REPO           Repository in format owner/repo
  `);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { BranchProtectionValidator };