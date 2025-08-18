#!/usr/bin/env node

/**
 * Pre-commit Test Complexity Check
 * 
 * Lightweight pre-commit hook to prevent test infrastructure bloat.
 * Provides warnings and guidance but doesn't block commits.
 * 
 * Usage:
 *   node scripts/pre-commit-complexity-check.js
 * 
 * Add to package.json:
 *   "pre-commit": "node scripts/pre-commit-complexity-check.js"
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Soft thresholds for warnings
const WARNING_THRESHOLDS = {
  TOTAL_LINES: 2500,
  NEW_UTILITY_FILES: 3,
  LARGE_NEW_FILE_LINES: 150
};

// Hard thresholds that suggest reconsidering the commit
const HARD_THRESHOLDS = {
  TOTAL_LINES: 3000,
  SINGLE_FILE_LINES: 300
};

/**
 * Get git staged files in test directories
 */
function getStagedTestFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    return output
      .split('\n')
      .filter(file => file.trim())
      .filter(file => 
        file.startsWith('tests-new/') ||
        file.startsWith('tests/') ||
        (file.startsWith('scripts/') && file.includes('test'))
      )
      .filter(file => file.endsWith('.js'));
  } catch (error) {
    return [];
  }
}

/**
 * Count lines in a file
 */
function countFileLines(filePath) {
  try {
    const fullPath = join(PROJECT_ROOT, filePath);
    if (!existsSync(fullPath)) return 0;
    
    const output = execSync(`wc -l < "${fullPath}"`, { encoding: 'utf-8' });
    return parseInt(output.trim()) || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Get current test infrastructure metrics
 */
function getCurrentMetrics() {
  try {
    const totalLines = execSync(
      'find tests-new -name "*.js" -exec wc -l {} + 2>/dev/null | tail -1 | awk \'{print $1}\'', 
      { encoding: 'utf-8', cwd: PROJECT_ROOT }
    );
    
    const fileCount = execSync(
      'find tests-new -name "*.js" | wc -l', 
      { encoding: 'utf-8', cwd: PROJECT_ROOT }
    );
    
    const utilityCount = execSync(
      'find tests-new/core tests-new/helpers tests-new/fixtures -name "*.js" 2>/dev/null | wc -l || echo 0', 
      { encoding: 'utf-8', cwd: PROJECT_ROOT }
    );
    
    return {
      totalLines: parseInt(totalLines.trim()) || 0,
      fileCount: parseInt(fileCount.trim()) || 0,
      utilityCount: parseInt(utilityCount.trim()) || 0
    };
  } catch (error) {
    return { totalLines: 0, fileCount: 0, utilityCount: 0 };
  }
}

/**
 * Analyze staged changes
 */
function analyzeStagedChanges() {
  const stagedFiles = getStagedTestFiles();
  const currentMetrics = getCurrentMetrics();
  
  if (stagedFiles.length === 0) {
    return { hasChanges: false };
  }

  const analysis = {
    hasChanges: true,
    stagedFiles,
    currentMetrics,
    warnings: [],
    concerns: [],
    recommendations: []
  };

  // Check if we're adding new utility files
  const newUtilityFiles = stagedFiles.filter(file =>
    file.includes('/core/') || file.includes('/helpers/') || file.includes('/fixtures/')
  );

  if (newUtilityFiles.length >= WARNING_THRESHOLDS.NEW_UTILITY_FILES) {
    analysis.warnings.push({
      type: 'NEW_UTILITY_FILES',
      message: `Adding ${newUtilityFiles.length} new utility files - consider if all are necessary`,
      files: newUtilityFiles
    });
  }

  // Check individual file sizes
  for (const file of stagedFiles) {
    const lines = countFileLines(file);
    
    if (lines > HARD_THRESHOLDS.SINGLE_FILE_LINES) {
      analysis.concerns.push({
        type: 'VERY_LARGE_FILE',
        message: `${file} has ${lines} lines - consider breaking into smaller pieces`,
        file,
        lines
      });
    } else if (lines > WARNING_THRESHOLDS.LARGE_NEW_FILE_LINES) {
      analysis.warnings.push({
        type: 'LARGE_FILE',
        message: `${file} has ${lines} lines - getting large`,
        file,
        lines
      });
    }
  }

  // Check total complexity
  if (currentMetrics.totalLines > HARD_THRESHOLDS.TOTAL_LINES) {
    analysis.concerns.push({
      type: 'COMPLEXITY_EXCEEDED',
      message: `Test infrastructure has ${currentMetrics.totalLines} lines (>${HARD_THRESHOLDS.TOTAL_LINES}) - at critical complexity`,
      totalLines: currentMetrics.totalLines
    });
  } else if (currentMetrics.totalLines > WARNING_THRESHOLDS.TOTAL_LINES) {
    analysis.warnings.push({
      type: 'HIGH_COMPLEXITY',
      message: `Test infrastructure has ${currentMetrics.totalLines} lines - approaching complexity limit`,
      totalLines: currentMetrics.totalLines
    });
  }

  // Generate recommendations
  if (newUtilityFiles.length > 0) {
    analysis.recommendations.push({
      type: 'UTILITY_GUIDANCE',
      message: 'Before adding test utilities, ask: "Does this eliminate duplication or add complexity?"'
    });
  }

  if (stagedFiles.some(f => f.includes('.test.js'))) {
    analysis.recommendations.push({
      type: 'TEST_SIMPLICITY',
      message: 'Keep tests focused and simple - prefer direct assertions over helper methods'
    });
  }

  if (analysis.warnings.length > 0 || analysis.concerns.length > 0) {
    analysis.recommendations.push({
      type: 'PREVENTION',
      message: 'Run "npm run test:metrics" to see full complexity analysis'
    });
  }

  return analysis;
}

/**
 * Display analysis results
 */
function displayResults(analysis) {
  if (!analysis.hasChanges) {
    return true; // No test changes, proceed
  }

  console.log('\n🔍 Pre-commit Test Complexity Check');
  console.log('=====================================');
  
  console.log(`📁 Test files in this commit: ${analysis.stagedFiles.length}`);
  
  // Show current metrics
  const { totalLines, fileCount, utilityCount } = analysis.currentMetrics;
  console.log(`📊 Current metrics: ${totalLines} lines, ${fileCount} files, ${utilityCount} utilities`);

  // Show warnings
  if (analysis.warnings.length > 0) {
    console.log('\n⚠️  Complexity Warnings:');
    for (const warning of analysis.warnings) {
      console.log(`   ⚠️  ${warning.message}`);
      if (warning.files) {
        warning.files.forEach(file => console.log(`      - ${file}`));
      }
    }
  }

  // Show concerns
  if (analysis.concerns.length > 0) {
    console.log('\n🚨 Complexity Concerns:');
    for (const concern of analysis.concerns) {
      console.log(`   🚨 ${concern.message}`);
    }
  }

  // Show recommendations
  if (analysis.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    for (const rec of analysis.recommendations) {
      console.log(`   💡 ${rec.message}`);
    }
  }

  // Determine if we should suggest reconsidering
  const shouldReconsider = analysis.concerns.length > 0;
  
  if (shouldReconsider) {
    console.log('\n🤔 Consider if this commit adds necessary complexity or could be simplified.');
    console.log('   This is a warning - the commit will still proceed.');
  } else if (analysis.warnings.length > 0) {
    console.log('\n👍 Warnings noted - commit proceeding with test complexity awareness.');
  } else {
    console.log('\n✅ Test complexity looks good!');
  }

  console.log('');
  return true; // Always allow commit, just provide guidance
}

/**
 * Main execution
 */
function main() {
  try {
    const analysis = analyzeStagedChanges();
    displayResults(analysis);
    
    // Always exit 0 - this is guidance, not enforcement
    process.exit(0);
  } catch (error) {
    console.error('Pre-commit check failed:', error.message);
    // Even on error, allow commit to proceed
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { analyzeStagedChanges, getCurrentMetrics };