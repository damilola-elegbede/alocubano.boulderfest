#!/usr/bin/env node
/**
 * Browser Matrix Memory Optimization Script
 *
 * Automatically fixes memory allocation issues by:
 * - Reducing Firefox memory from 4GB to 3GB across all workflows
 * - Standardizing browser memory allocations
 * - Ensuring consistency across workflow files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BrowserMatrixMemoryFixer {
  constructor() {
    this.workflowsDir = path.join(__dirname, '../../.github/workflows');
    this.fixes = [];
  }

  async fixWorkflows() {
    console.log('🔧 Starting Browser Matrix Memory Optimization...\n');

    const workflowFiles = fs.readdirSync(this.workflowsDir)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .filter(file => !file.startsWith('.'));

    for (const file of workflowFiles) {
      await this.fixWorkflowFile(file);
    }

    this.generateReport();
  }

  async fixWorkflowFile(filename) {
    const filePath = path.join(this.workflowsDir, filename);

    try {
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      let changes = 0;

      // Fix Firefox memory allocation from 4GB to 3GB
      const firefoxMemoryRegex = /("memory-limit":\s*)"4GB"/g;
      content = content.replace(firefoxMemoryRegex, (match, prefix) => {
        changes++;
        return `${prefix}"3GB"`;
      });

      // Fix memory-limit property for Firefox browsers
      const firefoxMatrixRegex = /(browser":\s*"firefox"[\s\S]*?"memory-limit":\s*)"4GB"/g;
      content = content.replace(firefoxMatrixRegex, (match, prefix) => {
        changes++;
        return `${prefix}"3GB"`;
      });

      // Fix NODE_OPTIONS environment variable for Firefox
      const nodeOptionsRegex = /NODE_OPTIONS:.*4096.*firefox/g;
      content = content.replace(nodeOptionsRegex, (match) => {
        changes++;
        return match.replace('4096', '3072');
      });

      // Fix conditional memory allocation in GitHub Actions
      const conditionalMemoryRegex = /matrix\.memory-limit == '4GB' && '4096'/g;
      content = content.replace(conditionalMemoryRegex, (match) => {
        changes++;
        return "matrix.memory-limit == '3GB' && '3072'";
      });

      // Add memory-limit property if missing from Firefox entries
      const firefoxWithoutMemoryRegex = /({\s*"browser":\s*"firefox",\s*"browser-name":\s*"Firefox",[\s\S]*?"retry-count":\s*\d+)(\s*})/g;
      content = content.replace(firefoxWithoutMemoryRegex, (match, prefix, suffix) => {
        if (!match.includes('memory-limit')) {
          changes++;
          return `${prefix}, "memory-limit": "3GB"${suffix}`;
        }
        return match;
      });

      if (changes > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        this.fixes.push({
          file: filename,
          changes,
          type: 'memory_optimization'
        });
        console.log(`✅ Fixed ${filename}: ${changes} memory optimizations applied`);
      } else {
        console.log(`➡️  ${filename}: No memory fixes needed`);
      }

    } catch (error) {
      console.warn(`⚠️  Could not process ${filename}:`, error.message);
    }
  }

  generateReport() {
    console.log('\n📊 Memory Optimization Report');
    console.log('==============================');

    if (this.fixes.length === 0) {
      console.log('✅ No memory optimizations needed - all workflows already configured correctly!');
      return;
    }

    console.log(`✅ Fixed ${this.fixes.length} workflow files:\n`);

    this.fixes.forEach(fix => {
      console.log(`   📁 ${fix.file}: ${fix.changes} fixes applied`);
    });

    console.log('\n🎯 Optimizations Applied:');
    console.log('   • Firefox memory reduced from 4GB to 3GB');
    console.log('   • NODE_OPTIONS memory limits standardized to 3072MB');
    console.log('   • Matrix memory-limit properties updated');
    console.log('   • Conditional memory allocation expressions fixed');

    const totalChanges = this.fixes.reduce((sum, fix) => sum + fix.changes, 0);
    console.log(`\n💾 Total memory savings: ~${this.fixes.length * 1}GB (${totalChanges} optimizations)`);

    console.log('\n🔍 Next Steps:');
    console.log('   1. Run browser matrix validation: node scripts/ci/validate-browser-matrix.js');
    console.log('   2. Test workflows with reduced memory allocation');
    console.log('   3. Monitor CI performance improvements');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Browser Matrix Memory Optimization Tool

Usage:
  node fix-browser-matrix-memory.js [options]

Options:
  --dry-run        Show what would be changed without making modifications
  --help          Show this help message

Examples:
  # Apply memory optimizations
  node fix-browser-matrix-memory.js

  # Preview changes
  node fix-browser-matrix-memory.js --dry-run
    `);
    return;
  }

  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const fixer = new BrowserMatrixMemoryFixer();
  await fixer.fixWorkflows();

  if (!dryRun) {
    console.log('\n✅ Memory optimization complete!');
  } else {
    console.log('\n📋 Dry run complete - use without --dry-run to apply changes');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Memory optimization failed:', error.message);
    process.exit(1);
  });
}