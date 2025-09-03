#!/usr/bin/env node
/**
 * Browser Matrix Generator for Unified E2E Testing
 * 
 * Generates consistent browser matrices across all workflows to eliminate
 * conflicts and resource allocation issues.
 * 
 * SOLVES:
 * - Multiple workflows with conflicting browser matrices
 * - Resource conflicts between parallel browser executions
 * - Inconsistent test coverage across environments
 * - Memory allocation issues causing timeouts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BrowserMatrixGenerator {
  constructor() {
    this.configPath = path.join(__dirname, '../../.github/browser-matrix-config.yml');
    this.config = null;
    this.loadConfig();
  }

  loadConfig() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(configContent);
      console.log('✅ Browser matrix configuration loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load browser matrix config:', error.message);
      process.exit(1);
    }
  }

  /**
   * Generate browser matrix for a given strategy
   */
  generateMatrix(strategyName, context = {}) {
    const strategy = this.config.browser_strategies[strategyName];
    if (!strategy) {
      throw new Error(`Unknown browser strategy: ${strategyName}`);
    }

    const matrix = strategy.browsers.map(browser => {
      const memoryProfile = this.getMemoryProfile(strategyName);
      const envOverrides = this.getEnvironmentOverrides(context.environment || 'ci');
      
      return {
        browser: browser.browser,
        'browser-name': browser.name,
        category: browser.category,
        'timeout-minutes': Math.ceil(browser.timeout * envOverrides.timeout_multiplier),
        'retry-count': Math.ceil(browser.retry * envOverrides.retry_multiplier),
        'memory-limit': this.calculateMemoryLimit(browser.memory, memoryProfile),
        priority: browser.priority,
        'cache-key': this.generateCacheKey(browser.browser, strategyName, context),
        'parallel-safe': strategy.parallel_workers > 1
      };
    });

    return {
      matrix,
      strategy: strategyName,
      parallel_workers: strategy.parallel_workers,
      use_case: strategy.use_case,
      quality_gates: this.getQualityGates(matrix)
    };
  }

  /**
   * Determine strategy based on context (dynamic strategy resolution)
   */
  determineStrategy(workflowName, context = {}) {
    const workflowConfig = this.config.workflow_assignments[workflowName];
    if (!workflowConfig) {
      console.warn(`⚠️ No configuration found for workflow: ${workflowName}, using standard strategy`);
      return 'standard';
    }

    if (workflowConfig.strategy !== 'dynamic') {
      return workflowConfig.strategy;
    }

    // Apply dynamic rules
    const rules = workflowConfig.rules || [];
    for (const rule of rules) {
      if (this.evaluateCondition(rule.condition, context)) {
        console.log(`📋 Selected strategy '${rule.strategy}' for condition '${rule.condition}'`);
        return rule.strategy;
      }
    }

    // Default fallback
    return 'standard';
  }

  /**
   * Evaluate dynamic strategy conditions
   */
  evaluateCondition(condition, context) {
    switch (condition) {
      case 'draft_pr':
        return context.is_draft === true || context.is_draft === 'true';
      case 'feature_branch':
        return context.branch_name?.startsWith('feature/') === true;
      case 'nightly_run':
        return context.event_name === 'schedule' || context.is_nightly === true;
      case 'release_branch':
        return context.branch_name?.startsWith('release/') === true;
      case 'manual_dispatch_full':
        return context.event_name === 'workflow_dispatch' && context.browsers === 'full';
      default:
        return false;
    }
  }

  /**
   * Get memory profile for strategy
   */
  getMemoryProfile(strategyName) {
    return this.config.resource_management.memory_profiles[strategyName] || '3GB';
  }

  /**
   * Get environment-specific overrides
   */
  getEnvironmentOverrides(environment) {
    return this.config.environment_overrides[environment] || this.config.environment_overrides.ci;
  }

  /**
   * Calculate memory limit with overrides
   */
  calculateMemoryLimit(browserMemory, profileMemory) {
    const envOverrides = this.getEnvironmentOverrides();
    const baseMemory = parseInt(browserMemory) || parseInt(profileMemory) || 3;
    const bufferMB = parseInt(envOverrides.memory_buffer) || 0;
    
    return `${baseMemory + Math.ceil(bufferMB / 1024)}GB`;
  }

  /**
   * Generate cache key for browser installation
   */
  generateCacheKey(browser, strategy, context) {
    const template = this.config.resource_management.browser_caching.cache_key_template;
    return template
      .replace('{os}', context.os || 'ubuntu-latest')
      .replace('{package-hash}', context.package_hash || 'latest')
      .replace('{browser}', browser)
      .replace('{strategy}', strategy);
  }

  /**
   * Get quality gates for matrix
   */
  getQualityGates(matrix) {
    const gates = this.config.quality_gates;
    const coreBrowsers = matrix.filter(b => gates.core_browsers.includes(b.browser));
    const extendedBrowsers = matrix.filter(b => gates.extended_browsers.includes(b.browser));
    const mobileBrowsers = matrix.filter(b => gates.mobile_browsers.includes(b.browser));

    return {
      core_required: coreBrowsers.length,
      core_pass_rate: gates.required_pass_rate,
      extended_count: extendedBrowsers.length,
      extended_pass_rate: gates.extended_pass_rate,
      mobile_count: mobileBrowsers.length,
      mobile_pass_rate: gates.mobile_pass_rate
    };
  }

  /**
   * Generate concurrency configuration
   */
  generateConcurrencyConfig(strategy, context) {
    const concurrencyConfig = this.config.resource_management.concurrency[strategy];
    if (!concurrencyConfig) {
      return {
        group: `e2e-default-${context.ref || 'main'}`,
        max_parallel: 1
      };
    }

    const group = concurrencyConfig.group_template
      .replace('{ref}', context.ref || 'main')
      .replace('{browser}', context.browser || 'all');

    return {
      group,
      max_parallel: concurrencyConfig.max_parallel,
      cancel_in_progress: true
    };
  }

  /**
   * Generate complete workflow configuration
   */
  generateWorkflowConfig(workflowName, context = {}) {
    const strategy = this.determineStrategy(workflowName, context);
    const matrixData = this.generateMatrix(strategy, context);
    const concurrency = this.generateConcurrencyConfig(strategy, context);

    return {
      strategy: {
        name: strategy,
        ...matrixData
      },
      concurrency,
      resource_management: {
        memory_profile: this.getMemoryProfile(strategy),
        selective_browser_install: this.config.resource_management.browser_caching.selective_install,
        cache_strategy: this.config.resource_management.browser_caching
      },
      quality_gates: matrixData.quality_gates
    };
  }

  /**
   * Validate browser matrix for conflicts
   */
  validateMatrix(matrices) {
    const conflicts = [];
    const resourceUsage = {};

    // Check for resource conflicts
    matrices.forEach((matrix, index) => {
      matrix.matrix.forEach(browser => {
        const key = `${browser.browser}-${browser['memory-limit']}`;
        if (resourceUsage[key]) {
          conflicts.push({
            type: 'resource_conflict',
            browser: browser.browser,
            memory: browser['memory-limit'],
            workflows: [resourceUsage[key], index]
          });
        } else {
          resourceUsage[key] = index;
        }
      });
    });

    // Check for coverage gaps
    const allBrowsers = new Set();
    const coreBrowsers = this.config.quality_gates.core_browsers;
    
    matrices.forEach(matrix => {
      matrix.matrix.forEach(browser => {
        allBrowsers.add(browser.browser);
      });
    });

    const missingCoreBrowsers = coreBrowsers.filter(browser => !allBrowsers.has(browser));
    if (missingCoreBrowsers.length > 0) {
      conflicts.push({
        type: 'coverage_gap',
        missing_browsers: missingCoreBrowsers,
        message: 'Core browsers missing from test coverage'
      });
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
      recommendations: this.generateRecommendations(conflicts)
    };
  }

  /**
   * Generate recommendations for resolving conflicts
   */
  generateRecommendations(conflicts) {
    const recommendations = [];

    conflicts.forEach(conflict => {
      switch (conflict.type) {
        case 'resource_conflict':
          recommendations.push(
            `Reduce memory allocation for ${conflict.browser} or use sequential execution`
          );
          break;
        case 'coverage_gap':
          recommendations.push(
            `Add missing core browsers: ${conflict.missing_browsers.join(', ')}`
          );
          break;
      }
    });

    return recommendations;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const generator = new BrowserMatrixGenerator();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Browser Matrix Generator

Usage:
  node generate-browser-matrix.js [options]

Options:
  --workflow <name>        Workflow name (main-ci, e2e-tests-optimized, etc.)
  --strategy <name>        Override strategy (standard, extended, full, chromium-only)
  --context <json>         Context JSON for dynamic strategy resolution
  --validate               Validate matrices for conflicts
  --output-file <path>     Output file path
  --github-output          Format output for GitHub Actions
  --help                   Show this help

Examples:
  # Generate matrix for main CI
  node generate-browser-matrix.js --workflow main-ci --github-output

  # Generate with custom context
  node generate-browser-matrix.js --workflow e2e-tests-optimized --context '{"is_nightly":true}' --output-file matrix.json

  # Validate all matrices
  node generate-browser-matrix.js --validate
    `);
    process.exit(0);
  }

  try {
    const workflow = getArgValue('--workflow', 'main-ci');
    const strategy = getArgValue('--strategy');
    const contextJson = getArgValue('--context', '{}');
    const outputFile = getArgValue('--output-file');
    const githubOutput = args.includes('--github-output');
    const validate = args.includes('--validate');

    const context = JSON.parse(contextJson);

    if (validate) {
      // Validate all workflow matrices
      const workflows = Object.keys(generator.config.workflow_assignments);
      const matrices = workflows.map(wf => generator.generateMatrix(
        generator.determineStrategy(wf, context), context
      ));
      
      const validation = generator.validateMatrix(matrices);
      console.log('🔍 Validation Results:', JSON.stringify(validation, null, 2));
      
      if (!validation.valid) {
        console.error('❌ Browser matrix validation failed');
        process.exit(1);
      } else {
        console.log('✅ All browser matrices are valid');
      }
      return;
    }

    const config = generator.generateWorkflowConfig(workflow, context);

    if (strategy) {
      // Override strategy if specified
      config.strategy = generator.generateMatrix(strategy, context);
    }

    if (githubOutput) {
      // Format for GitHub Actions
      console.log(`matrix=${JSON.stringify(config.strategy.matrix)}`);
      console.log(`strategy=${config.strategy.name}`);
      console.log(`parallel-workers=${config.strategy.parallel_workers}`);
      console.log(`memory-profile=${config.resource_management.memory_profile}`);
      
      // Set GitHub output if GITHUB_OUTPUT is available
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, 
          `matrix=${JSON.stringify(config.strategy.matrix)}\n` +
          `strategy=${config.strategy.name}\n` +
          `parallel-workers=${config.strategy.parallel_workers}\n` +
          `memory-profile=${config.resource_management.memory_profile}\n`
        );
      }
    } else if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(config, null, 2));
      console.log(`✅ Browser matrix written to ${outputFile}`);
    } else {
      console.log(JSON.stringify(config, null, 2));
    }

    console.log(`✅ Generated ${config.strategy.name} strategy with ${config.strategy.matrix.length} browsers`);

  } catch (error) {
    console.error('❌ Error generating browser matrix:', error.message);
    process.exit(1);
  }
}

function getArgValue(flag, defaultValue = null) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index >= 0 && index < args.length - 1) {
    return args[index + 1];
  }
  return defaultValue;
}

// Export for use as module
export default BrowserMatrixGenerator;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}