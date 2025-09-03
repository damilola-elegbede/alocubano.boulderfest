#!/usr/bin/env node

/**
 * Quick CI/CD Validation Script
 * 
 * Performs essential validation checks for CI/CD workflows.
 * Use this for routine validation during development.
 * 
 * Usage: node scripts/validate-ci-quick.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function quickValidation() {
  console.log('🚀 Quick CI/CD Validation');
  console.log('=' .repeat(40));
  
  let issues = 0;
  let checks = 0;

  // 1. Check critical workflow files exist
  const criticalWorkflows = [
    'main-ci.yml',
    'e2e-tests-optimized.yml',
    'deploy-optimized.yml',
    'orchestrator.yml'
  ];

  console.log('\n📋 Critical Workflows:');
  for (const workflow of criticalWorkflows) {
    const filePath = path.join(rootDir, '.github/workflows', workflow);
    try {
      await fs.access(filePath);
      console.log(`✅ ${workflow}`);
      checks++;
    } catch {
      console.log(`❌ ${workflow} - MISSING`);
      issues++;
    }
  }

  // 2. Check path filters
  console.log('\n📁 Path Filters:');
  const pathFiltersPath = path.join(rootDir, '.github/path-filters.yml');
  try {
    await fs.access(pathFiltersPath);
    const content = await fs.readFile(pathFiltersPath, 'utf8');
    
    const requiredFilters = ['frontend', 'backend', 'tests', 'critical'];
    let filtersFound = 0;
    
    for (const filter of requiredFilters) {
      if (content.includes(`${filter}:`)) {
        filtersFound++;
      }
    }
    
    if (filtersFound === requiredFilters.length) {
      console.log(`✅ Path filters configured (${filtersFound}/${requiredFilters.length})`);
      checks++;
    } else {
      console.log(`⚠️  Path filters incomplete (${filtersFound}/${requiredFilters.length})`);
      issues++;
    }
  } catch {
    console.log('❌ Path filters file missing');
    issues++;
  }

  // 3. Check archived workflows
  console.log('\n📦 Archive Status:');
  const archivedDir = path.join(rootDir, '.github/workflows/archived');
  try {
    const archivedFiles = await fs.readdir(archivedDir);
    const yamlFiles = archivedFiles.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    console.log(`✅ ${yamlFiles.length} workflows archived`);
    checks++;
  } catch {
    console.log('⚠️  No archived workflows directory');
  }

  // 4. Check orchestrator configuration
  console.log('\n🎼 Orchestrator:');
  const orchestratorPath = path.join(rootDir, '.github/workflows/orchestrator.yml');
  try {
    const content = await fs.readFile(orchestratorPath, 'utf8');
    
    const features = [
      ['Change Detection', 'dorny/paths-filter'],
      ['Workflow Routing', 'workflows_to_run'],
      ['Health Monitoring', 'workflow-health-monitor'],
      ['Performance Tracking', 'optimization_score']
    ];
    
    let featuresFound = 0;
    for (const [name, pattern] of features) {
      if (content.includes(pattern)) {
        featuresFound++;
        console.log(`✅ ${name}`);
      } else {
        console.log(`❌ ${name} - missing pattern: ${pattern}`);
      }
    }
    
    if (featuresFound >= 3) {
      checks++;
    } else {
      issues++;
    }
  } catch {
    console.log('❌ Orchestrator not accessible');
    issues++;
  }

  // 5. Quick syntax check
  console.log('\n⚙️  Syntax Check:');
  try {
    const workflowsDir = path.join(rootDir, '.github/workflows');
    const files = await fs.readdir(workflowsDir);
    const yamlFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    
    let validFiles = 0;
    for (const file of yamlFiles) {
      const content = await fs.readFile(path.join(workflowsDir, file), 'utf8');
      if (content.includes('name:') && content.includes('on:')) {
        validFiles++;
      }
    }
    
    console.log(`✅ ${validFiles}/${yamlFiles.length} workflows have basic structure`);
    if (validFiles === yamlFiles.length) {
      checks++;
    } else {
      issues++;
    }
  } catch (error) {
    console.log(`❌ Syntax check failed: ${error.message}`);
    issues++;
  }

  // Summary
  console.log('\n' + '=' .repeat(40));
  const score = (checks / (checks + issues)) * 100;
  const status = score >= 90 ? '🟢 EXCELLENT' : 
                 score >= 75 ? '🟡 GOOD' : 
                 score >= 60 ? '🟠 NEEDS WORK' : '🔴 CRITICAL';
  
  console.log(`Status: ${status}`);
  console.log(`Score: ${score.toFixed(1)}%`);
  console.log(`Passed: ${checks}, Issues: ${issues}`);
  
  if (issues === 0) {
    console.log('\n✅ All quick checks passed! CI/CD optimization looks good.');
  } else if (issues <= 2) {
    console.log('\n⚠️  Minor issues found. Consider running full validation.');
  } else {
    console.log('\n❌ Multiple issues found. Run full validation with:');
    console.log('   node scripts/validate-ci-optimization.js --verbose');
  }

  return issues === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  quickValidation().then(code => process.exit(code));
}