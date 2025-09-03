#!/usr/bin/env node
/**
 * Browser Matrix Conflict Validation
 * 
 * Validates browser matrices across all workflows to ensure:
 * - No resource conflicts
 * - Consistent browser coverage
 * - Proper memory allocation
 * - No parallel execution conflicts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BrowserMatrixValidator {
  constructor() {
    this.workflowsDir = path.join(__dirname, '../../.github/workflows');
    this.workflows = [];
    this.conflicts = [];
    this.loadWorkflows();
  }

  loadWorkflows() {
    const workflowFiles = fs.readdirSync(this.workflowsDir)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .filter(file => !file.startsWith('.'));

    this.workflows = workflowFiles.map(file => {
      const filePath = path.join(this.workflowsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = yaml.load(content);
        return {
          file,
          path: filePath,
          config: parsed,
          browserMatrices: this.extractBrowserMatrices(parsed)
        };
      } catch (error) {
        console.warn(`⚠️ Could not parse workflow ${file}:`, error.message);
        return null;
      }
    }).filter(Boolean);

    console.log(`✅ Loaded ${this.workflows.length} workflow files`);
  }

  extractBrowserMatrices(config) {
    const matrices = [];
    
    if (!config.jobs) return matrices;

    Object.entries(config.jobs).forEach(([jobName, job]) => {
      if (job.strategy?.matrix) {
        const matrix = job.strategy.matrix;
        
        // Handle different matrix formats
        if (matrix.browser) {
          // Simple browser array
          const browsers = Array.isArray(matrix.browser) ? matrix.browser : [matrix.browser];
          matrices.push({
            jobName,
            type: 'simple',
            browsers,
            concurrency: job.concurrency,
            timeout: job['timeout-minutes'] || 20,
            parallelWorkers: job.strategy['max-parallel'] || 1
          });
        } else if (matrix.include) {
          // Complex include matrix
          const browsers = Array.isArray(matrix.include) ? matrix.include : [matrix.include];
          matrices.push({
            jobName,
            type: 'complex',
            browsers: browsers.map(item => ({
              browser: item.browser,
              name: item['browser-name'] || item.browser,
              timeout: item['timeout-minutes'] || 20,
              memory: item['memory-limit'] || '3GB',
              retries: item['retry-count'] || 2,
              priority: item.priority || 1
            })),
            concurrency: job.concurrency,
            parallelWorkers: job.strategy['max-parallel'] || 1
          });
        }
      }
    });

    return matrices;
  }

  validateResourceConflicts() {
    console.log('🔍 Validating resource conflicts...');
    
    const resourceMap = {};
    
    this.workflows.forEach(workflow => {
      workflow.browserMatrices.forEach(matrix => {
        if (matrix.type === 'complex') {
          matrix.browsers.forEach(browser => {
            const key = `${browser.browser}-${browser.memory}`;
            if (!resourceMap[key]) {
              resourceMap[key] = [];
            }
            resourceMap[key].push({
              workflow: workflow.file,
              job: matrix.jobName,
              browser: browser.browser,
              memory: browser.memory,
              parallelWorkers: matrix.parallelWorkers
            });
          });
        } else if (matrix.type === 'simple') {
          matrix.browsers.forEach(browser => {
            const key = `${browser}-3GB`; // Default memory
            if (!resourceMap[key]) {
              resourceMap[key] = [];
            }
            resourceMap[key].push({
              workflow: workflow.file,
              job: matrix.jobName,
              browser,
              memory: '3GB',
              parallelWorkers: matrix.parallelWorkers
            });
          });
        }
      });
    });

    // Check for potential conflicts
    Object.entries(resourceMap).forEach(([resource, usages]) => {
      if (usages.length > 1) {
        const totalParallelWorkers = usages.reduce((sum, usage) => sum + usage.parallelWorkers, 0);
        
        if (totalParallelWorkers > 4) { // Threshold for resource conflicts
          this.conflicts.push({
            type: 'resource_conflict',
            resource,
            usages,
            severity: 'high',
            message: `High parallel resource usage for ${resource}: ${totalParallelWorkers} total workers`
          });
        } else if (totalParallelWorkers > 2) {
          this.conflicts.push({
            type: 'resource_conflict',
            resource,
            usages,
            severity: 'medium',
            message: `Medium parallel resource usage for ${resource}: ${totalParallelWorkers} total workers`
          });
        }
      }
    });

    console.log(`  Found ${this.conflicts.filter(c => c.type === 'resource_conflict').length} resource conflicts`);
  }

  validateConcurrencyGroups() {
    console.log('🔍 Validating concurrency groups...');
    
    const concurrencyGroups = {};
    
    this.workflows.forEach(workflow => {
      workflow.browserMatrices.forEach(matrix => {
        if (matrix.concurrency?.group) {
          const groupTemplate = matrix.concurrency.group;
          if (!concurrencyGroups[groupTemplate]) {
            concurrencyGroups[groupTemplate] = [];
          }
          concurrencyGroups[groupTemplate].push({
            workflow: workflow.file,
            job: matrix.jobName
          });
        }
      });
    });

    // Check for overlapping concurrency groups
    Object.entries(concurrencyGroups).forEach(([group, usages]) => {
      if (usages.length > 1 && !group.includes('${{ matrix.browser }}')) {
        this.conflicts.push({
          type: 'concurrency_conflict',
          group,
          usages,
          severity: 'high',
          message: `Multiple workflows using same concurrency group without browser isolation: ${group}`
        });
      }
    });

    console.log(`  Found ${this.conflicts.filter(c => c.type === 'concurrency_conflict').length} concurrency conflicts`);
  }

  validateBrowserCoverage() {
    console.log('🔍 Validating browser coverage...');
    
    const allBrowsers = new Set();
    const workflowBrowsers = {};
    
    this.workflows.forEach(workflow => {
      workflowBrowsers[workflow.file] = new Set();
      
      workflow.browserMatrices.forEach(matrix => {
        if (matrix.type === 'complex') {
          matrix.browsers.forEach(browser => {
            allBrowsers.add(browser.browser);
            workflowBrowsers[workflow.file].add(browser.browser);
          });
        } else if (matrix.type === 'simple') {
          matrix.browsers.forEach(browser => {
            allBrowsers.add(browser);
            workflowBrowsers[workflow.file].add(browser);
          });
        }
      });
    });

    // Check for missing core browsers
    const coreBrowsers = ['chromium', 'firefox'];
    const missingCore = coreBrowsers.filter(browser => !allBrowsers.has(browser));
    
    if (missingCore.length > 0) {
      this.conflicts.push({
        type: 'coverage_gap',
        severity: 'high',
        message: `Missing core browsers: ${missingCore.join(', ')}`,
        missing: missingCore
      });
    }

    // Check for workflow-specific coverage gaps
    Object.entries(workflowBrowsers).forEach(([workflow, browsers]) => {
      const workflowMissing = coreBrowsers.filter(browser => !browsers.has(browser));
      if (workflowMissing.length > 0) {
        this.conflicts.push({
          type: 'workflow_coverage_gap',
          workflow,
          severity: 'medium',
          message: `Workflow ${workflow} missing core browsers: ${workflowMissing.join(', ')}`,
          missing: workflowMissing
        });
      }
    });

    console.log(`  Found ${this.conflicts.filter(c => c.type.includes('coverage')).length} coverage issues`);
  }

  validateMemoryAllocation() {
    console.log('🔍 Validating memory allocation...');
    
    const memoryUsage = {};
    
    this.workflows.forEach(workflow => {
      workflow.browserMatrices.forEach(matrix => {
        if (matrix.type === 'complex') {
          matrix.browsers.forEach(browser => {
            const memory = parseInt(browser.memory) || 3;
            const key = `${workflow.file}-${matrix.jobName}`;
            
            if (!memoryUsage[key]) {
              memoryUsage[key] = {
                workflow: workflow.file,
                job: matrix.jobName,
                totalMemory: 0,
                browsers: []
              };
            }
            
            memoryUsage[key].totalMemory += memory * matrix.parallelWorkers;
            memoryUsage[key].browsers.push({
              browser: browser.browser,
              memory: browser.memory,
              workers: matrix.parallelWorkers
            });
          });
        }
      });
    });

    // Check for excessive memory usage
    Object.values(memoryUsage).forEach(usage => {
      if (usage.totalMemory > 8) { // 8GB threshold
        this.conflicts.push({
          type: 'memory_conflict',
          severity: 'high',
          workflow: usage.workflow,
          job: usage.job,
          message: `Excessive memory usage: ${usage.totalMemory}GB total`,
          details: usage.browsers
        });
      } else if (usage.totalMemory > 6) {
        this.conflicts.push({
          type: 'memory_conflict',
          severity: 'medium',
          workflow: usage.workflow,
          job: usage.job,
          message: `High memory usage: ${usage.totalMemory}GB total`,
          details: usage.browsers
        });
      }
    });

    console.log(`  Found ${this.conflicts.filter(c => c.type === 'memory_conflict').length} memory issues`);
  }

  generateReport() {
    console.log('\n📊 Browser Matrix Validation Report');
    console.log('=====================================');
    
    if (this.conflicts.length === 0) {
      console.log('✅ No conflicts detected! All browser matrices are properly configured.');
      return true;
    }

    // Group by severity
    const high = this.conflicts.filter(c => c.severity === 'high');
    const medium = this.conflicts.filter(c => c.severity === 'medium');
    const low = this.conflicts.filter(c => c.severity === 'low');

    if (high.length > 0) {
      console.log('\n❌ HIGH SEVERITY ISSUES:');
      high.forEach((conflict, index) => {
        console.log(`${index + 1}. ${conflict.message}`);
        if (conflict.usages) {
          conflict.usages.forEach(usage => {
            console.log(`   - ${usage.workflow} (${usage.job})`);
          });
        }
      });
    }

    if (medium.length > 0) {
      console.log('\n⚠️ MEDIUM SEVERITY ISSUES:');
      medium.forEach((conflict, index) => {
        console.log(`${index + 1}. ${conflict.message}`);
      });
    }

    if (low.length > 0) {
      console.log('\n💡 LOW SEVERITY ISSUES:');
      low.forEach((conflict, index) => {
        console.log(`${index + 1}. ${conflict.message}`);
      });
    }

    console.log('\n🔧 RECOMMENDATIONS:');
    this.generateRecommendations();

    return high.length === 0; // Pass if no high severity issues
  }

  generateRecommendations() {
    const resourceConflicts = this.conflicts.filter(c => c.type === 'resource_conflict');
    const concurrencyConflicts = this.conflicts.filter(c => c.type === 'concurrency_conflict');
    const coverageGaps = this.conflicts.filter(c => c.type.includes('coverage'));
    const memoryConflicts = this.conflicts.filter(c => c.type === 'memory_conflict');

    if (resourceConflicts.length > 0) {
      console.log('1. Reduce parallel workers or use sequential execution for resource-heavy browsers');
      console.log('2. Consider staggering workflow execution times');
    }

    if (concurrencyConflicts.length > 0) {
      console.log('3. Update concurrency groups to include browser-specific identifiers');
      console.log('4. Use unique group names for each workflow type');
    }

    if (coverageGaps.length > 0) {
      console.log('5. Add missing core browsers (chromium, firefox) to all E2E workflows');
      console.log('6. Ensure consistent browser coverage across similar workflows');
    }

    if (memoryConflicts.length > 0) {
      console.log('7. Reduce memory allocation for Firefox to 3GB');
      console.log('8. Limit parallel workers for memory-intensive browsers');
    }

    console.log('9. Use the unified browser matrix configuration for consistency');
    console.log('10. Consider using the browser matrix generator script');
  }

  validate() {
    console.log('🎭 Starting Browser Matrix Validation');
    console.log('====================================\n');
    
    this.validateResourceConflicts();
    this.validateConcurrencyGroups();
    this.validateBrowserCoverage();
    this.validateMemoryAllocation();
    
    return this.generateReport();
  }
}

// CLI Interface
async function main() {
  const validator = new BrowserMatrixValidator();
  const isValid = validator.validate();
  
  if (!isValid) {
    console.log('\n❌ Browser matrix validation failed');
    process.exit(1);
  }
  
  console.log('\n✅ Browser matrix validation passed');
  process.exit(0);
}

// Export for use as module
export default BrowserMatrixValidator;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Validation error:', error.message);
    process.exit(1);
  });
}