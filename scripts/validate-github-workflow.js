#!/usr/bin/env node

/**
 * Simple GitHub Workflow YAML Validator
 * Checks basic syntax and structure of workflow files
 */

import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function validateWorkflow(filePath) {
  console.log(`\n🔍 Validating workflow: ${path.basename(filePath)}`);
  
  try {
    // Read the workflow file
    const content = readFileSync(filePath, 'utf8');
    
    // Parse YAML
    const workflow = load(content);
    
    // Basic structure validation
    const errors = [];
    const warnings = [];
    
    // Check required fields
    if (!workflow.name) {
      warnings.push('Missing workflow name');
    }
    
    if (!workflow.on) {
      errors.push('Missing trigger events (on)');
    }
    
    if (!workflow.jobs || Object.keys(workflow.jobs).length === 0) {
      errors.push('No jobs defined');
    }
    
    // Validate jobs
    if (workflow.jobs) {
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        console.log(`  📦 Job: ${jobName}`);
        
        if (!job['runs-on']) {
          errors.push(`Job '${jobName}' missing 'runs-on'`);
        }
        
        if (!job.steps || job.steps.length === 0) {
          warnings.push(`Job '${jobName}' has no steps`);
        }
        
        // Check step structure
        if (job.steps) {
          job.steps.forEach((step, index) => {
            if (!step.name && !step.uses && !step.run) {
              warnings.push(`Step ${index + 1} in job '${jobName}' should have a name`);
            }
            
            if (!step.uses && !step.run) {
              errors.push(`Step ${index + 1} in job '${jobName}' must have either 'uses' or 'run'`);
            }
          });
        }
      }
    }
    
    // Report results
    if (errors.length === 0 && warnings.length === 0) {
      console.log('✅ Workflow is valid!');
      return true;
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      warnings.forEach(w => console.log(`  - ${w}`));
    }
    
    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(e => console.log(`  - ${e}`));
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to parse workflow: ${error.message}`);
    if (error.mark) {
      console.error(`   Line ${error.mark.line + 1}, Column ${error.mark.column + 1}`);
    }
    return false;
  }
}

// Main execution
function main() {
  const workflowPath = path.join(__dirname, '../.github/workflows/phase4-unit-only-ci.yml');
  
  console.log('🚀 GitHub Workflow Validator');
  console.log('============================');
  
  const isValid = validateWorkflow(workflowPath);
  
  if (isValid) {
    console.log('\n✅ All workflow files are valid!');
    process.exit(0);
  } else {
    console.log('\n❌ Workflow validation failed!');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}