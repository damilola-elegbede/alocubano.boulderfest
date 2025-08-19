#!/usr/bin/env node
/**
 * Pre-commit Complexity Check
 * Analyzes staged test files and provides non-blocking guidance
 * Part of the streamlined test infrastructure complexity prevention
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function getStagedTestFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
    return output.split('\n').filter(file => 
      file.trim() && 
      file.startsWith('tests/') && 
      file.endsWith('.js')
    );
  } catch (error) {
    // Not in git repository or no staged files
    return [];
  }
}

function analyzeFile(filePath) {
  if (!existsSync(filePath)) {
    return { lines: 0, complexity: 'missing' };
  }
  
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').length;
  
  // Simple complexity indicators
  const hasComplexMocking = content.includes('jest.mock') || content.includes('sinon');
  const hasTestBuilders = content.includes('TestBuilder') || content.includes('Factory');
  const hasComplexSetup = content.split('beforeEach').length > 3;
  const hasNestedDescribe = content.split('describe').length > 4;
  
  let complexity = 'simple';
  if (lines > 200 || hasComplexMocking || hasTestBuilders) {
    complexity = 'complex';
  } else if (lines > 100 || hasComplexSetup || hasNestedDescribe) {
    complexity = 'moderate';
  }
  
  return { lines, complexity, hasComplexMocking, hasTestBuilders, hasComplexSetup };
}

function main() {
  console.log('🔍 Pre-commit complexity check (non-blocking)...\n');
  
  const stagedFiles = getStagedTestFiles();
  
  if (stagedFiles.length === 0) {
    console.log('✅ No staged test files to analyze\n');
    return;
  }
  
  console.log(`📋 Analyzing ${stagedFiles.length} staged test files:\n`);
  
  let warnings = [];
  let totalLines = 0;
  
  for (const file of stagedFiles) {
    const analysis = analyzeFile(file);
    totalLines += analysis.lines;
    
    console.log(`  ${file}: ${analysis.lines} lines (${analysis.complexity})`);
    
    if (analysis.complexity === 'complex') {
      warnings.push(`⚠️  ${file} is complex (${analysis.lines} lines)`);
      if (analysis.hasComplexMocking) warnings.push(`   - Consider removing complex mocking`);
      if (analysis.hasTestBuilders) warnings.push(`   - Consider removing test builders`);
    } else if (analysis.complexity === 'moderate') {
      if (analysis.lines > 150) {
        warnings.push(`💡 ${file} could be simplified (${analysis.lines} lines)`);
      }
    }
  }
  
  console.log(`\n📊 Total staged test changes: ${totalLines} lines\n`);
  
  if (warnings.length > 0) {
    console.log('💡 Suggestions for keeping tests simple:\n');
    warnings.forEach(warning => console.log(warning));
    console.log('\n📖 Streamlined test principles:');
    console.log('   • Direct API calls instead of complex mocking');
    console.log('   • Simple assertions instead of test builders');
    console.log('   • Focus on critical business flows');
    console.log('   • Keep individual files under 200 lines');
    console.log('   • Total test suite under 500 lines\n');
  } else {
    console.log('✅ All staged test files follow streamlined principles\n');
  }
  
  // Always exit 0 - this is non-blocking guidance
  process.exit(0);
}

main();