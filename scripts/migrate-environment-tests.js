#!/usr/bin/env node

/**
 * Automated Migration Script: TestEnvironmentManager → Simple Helpers
 * 
 * This script automatically converts all TestEnvironmentManager usage to simple helpers.
 * It handles different usage patterns and maintains proper error handling.
 * 
 * Usage: node scripts/migrate-environment-tests.js [--dry-run] [--rollback]
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  testsDir: 'tests',
  backupDir: 'migration-backups',
  logFile: 'migration-log.json',
  patterns: {
    // Import pattern matching
    imports: {
      testEnvManager: /import\s*{\s*testEnvManager\s*}\s*from\s*["'][^"']*test-environment-manager\.js["']/g,
      TestEnvironmentManager: /import\s*{\s*TestEnvironmentManager(?:\s*,\s*testEnvManager)?\s*}\s*from\s*["'][^"']*test-environment-manager\.js["']/g,
      both: /import\s*{\s*TestEnvironmentManager\s*,\s*testEnvManager\s*}\s*from\s*["'][^"']*test-environment-manager\.js["']/g
    },
    
    // Usage pattern matching
    usage: {
      backup: /(?:testEnvManager|envManager)\.backup\(\)/g,
      restore: /(?:testEnvManager|envManager)\.restore\(\)/g,
      clearDatabaseEnv: /(?:testEnvManager|envManager)\.clearDatabaseEnv\(\)/g,
      clearAppEnv: /(?:testEnvManager|envManager)\.clearAppEnv\(\)/g,
      setMockEnv: /(?:testEnvManager|envManager)\.setMockEnv\(/g,
      getPreset: /(?:testEnvManager|envManager)\.getPreset\(/g,
      withIsolatedEnv: /(?:testEnvManager|envManager)\.withIsolatedEnv\(/g,
      withCompleteIsolation: /(?:testEnvManager|envManager|TestEnvironmentManager)\.withCompleteIsolation\(/g,
      coordinatedClear: /(?:testEnvManager|envManager)\.coordinatedClear\(\)/g,
      staticWithCompleteIsolation: /TestEnvironmentManager\.withCompleteIsolation\(/g,
      staticWithIsolatedEnv: /TestEnvironmentManager\.withIsolatedEnv\(/g,
      newTestEnvironmentManager: /new TestEnvironmentManager\(\)/g,
      _clearEnvironmentForTesting: /(?:testEnvManager|envManager)\._clearEnvironmentForTesting\(\)/g
    }
  }
};

class MigrationLogger {
  constructor() {
    this.log = {
      timestamp: new Date().toISOString(),
      files: {},
      summary: {
        processed: 0,
        modified: 0,
        skipped: 0,
        errors: 0
      }
    };
  }

  logFile(filepath, action, details = {}) {
    this.log.files[filepath] = {
      action,
      details,
      timestamp: new Date().toISOString()
    };
  }

  logSummary(type) {
    this.log.summary[type]++;
  }

  async save() {
    await fs.writeFile(CONFIG.logFile, JSON.stringify(this.log, null, 2));
  }
}

class TestEnvironmentMigrator {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.rollback = options.rollback || false;
    this.logger = new MigrationLogger();
  }

  /**
   * Main migration entry point
   */
  async migrate() {
    console.log('🔄 Starting TestEnvironmentManager → Simple Helpers migration...');
    
    if (this.rollback) {
      return this.performRollback();
    }

    try {
      // Create backup directory
      await this.ensureBackupDir();

      // Find all test files using TestEnvironmentManager
      const testFiles = await this.findTestFiles();
      console.log(`📁 Found ${testFiles.length} test files to examine`);

      // Process each file
      for (const filepath of testFiles) {
        await this.processFile(filepath);
      }

      // Save migration log
      await this.logger.save();

      // Print summary
      this.printSummary();

      if (!this.dryRun && this.logger.log.summary.modified > 0) {
        console.log('\n✅ Migration completed successfully!');
        console.log('📝 Run tests to verify everything works: npm test');
        console.log('🔄 To rollback: node scripts/migrate-environment-tests.js --rollback');
      }

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  /**
   * Find all test files that might use TestEnvironmentManager
   */
  async findTestFiles() {
    const testFiles = [];
    
    async function scanDirectory(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.name.endsWith('.js') && entry.name.includes('test')) {
          // Check if file contains TestEnvironmentManager
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            if (content.includes('TestEnvironmentManager') || content.includes('testEnvManager')) {
              testFiles.push(fullPath);
            }
          } catch (error) {
            console.warn(`⚠️  Could not read ${fullPath}: ${error.message}`);
          }
        }
      }
    }

    await scanDirectory(CONFIG.testsDir);
    return testFiles;
  }

  /**
   * Process a single test file
   */
  async processFile(filepath) {
    this.logger.logSummary('processed');
    
    try {
      const originalContent = await fs.readFile(filepath, 'utf8');
      let modifiedContent = originalContent;
      
      // Analyze usage patterns
      const usagePattern = this.analyzeUsagePattern(originalContent);
      console.log(`📄 Processing ${filepath} (${usagePattern} pattern)`);

      // Create backup
      if (!this.dryRun) {
        await this.createFileBackup(filepath, originalContent);
      }

      // Apply transformations based on pattern
      modifiedContent = this.transformImports(modifiedContent, usagePattern);
      modifiedContent = this.transformUsage(modifiedContent, usagePattern);

      // Check if content actually changed
      if (modifiedContent === originalContent) {
        console.log(`  ⏭️  No changes needed`);
        this.logger.logFile(filepath, 'skipped', { reason: 'No changes needed' });
        this.logger.logSummary('skipped');
        return;
      }

      // Write changes (unless dry run)
      if (this.dryRun) {
        console.log(`  🔍 Would modify (dry run)`);
        this.logger.logFile(filepath, 'would-modify', { pattern: usagePattern });
      } else {
        await fs.writeFile(filepath, modifiedContent);
        console.log(`  ✅ Modified`);
        this.logger.logFile(filepath, 'modified', { pattern: usagePattern });
        this.logger.logSummary('modified');
      }

    } catch (error) {
      console.error(`  ❌ Error processing ${filepath}:`, error.message);
      this.logger.logFile(filepath, 'error', { error: error.message });
      this.logger.logSummary('errors');
    }
  }

  /**
   * Analyze the usage pattern in the file
   */
  analyzeUsagePattern(content) {
    const patterns = {
      complex: [
        'withCompleteIsolation',
        'coordinatedClear',
        '_clearEnvironmentForTesting',
        'new TestEnvironmentManager'
      ],
      moderate: [
        'withIsolatedEnv',
        'setMockEnv',
        'getPreset'
      ],
      simple: [
        'backup',
        'restore',
        'clearDatabaseEnv',
        'clearAppEnv'
      ]
    };

    // Check for complex patterns first
    for (const pattern of patterns.complex) {
      if (content.includes(pattern)) {
        return 'complex';
      }
    }

    // Check for moderate patterns
    for (const pattern of patterns.moderate) {
      if (content.includes(pattern)) {
        return 'moderate';
      }
    }

    // Default to simple
    return 'simple';
  }

  /**
   * Transform import statements
   */
  transformImports(content, pattern) {
    // Map imports to simple helpers
    const importTransformations = {
      simple: 'import { backupEnv, restoreEnv, clearDatabaseEnv, clearAppEnv } from "../helpers/simple-helpers.js";',
      moderate: 'import { backupEnv, restoreEnv, clearDatabaseEnv, clearAppEnv, getEnvPreset, withIsolatedEnv } from "../helpers/simple-helpers.js";',
      complex: 'import { backupEnv, restoreEnv, withCompleteIsolation, resetDatabaseSingleton, cleanupTest } from "../helpers/simple-helpers.js";'
    };

    let result = content;

    // Remove existing TestEnvironmentManager imports
    result = result.replace(CONFIG.patterns.imports.both, '');
    result = result.replace(CONFIG.patterns.imports.TestEnvironmentManager, '');
    result = result.replace(CONFIG.patterns.imports.testEnvManager, '');

    // Add appropriate simple-helpers import
    const importToAdd = importTransformations[pattern];
    
    // Find a good place to add the import (after existing imports)
    const importRegex = /^import\s+.*from\s+["'][^"']+["'];?\s*$/gm;
    const importMatches = [...result.matchAll(importRegex)];
    
    if (importMatches.length > 0) {
      // Add after the last import
      const lastImport = importMatches[importMatches.length - 1];
      const insertIndex = lastImport.index + lastImport[0].length;
      result = result.slice(0, insertIndex) + '\n' + importToAdd + result.slice(insertIndex);
    } else {
      // Add at the beginning if no imports found
      result = importToAdd + '\n\n' + result;
    }

    return result;
  }

  /**
   * Transform usage patterns
   */
  transformUsage(content, pattern) {
    let result = content;

    switch (pattern) {
      case 'simple':
        result = this.transformSimpleUsage(result);
        break;
      case 'moderate':
        result = this.transformModerateUsage(result);
        break;
      case 'complex':
        result = this.transformComplexUsage(result);
        break;
    }

    return result;
  }

  /**
   * Transform simple usage patterns
   */
  transformSimpleUsage(content) {
    let result = content;

    // Add backup variable declaration at the beginning of test blocks
    result = this.addBackupVariableDeclaration(result);

    // Transform method calls
    result = result.replace(CONFIG.patterns.usage.backup, 'envBackup = backupEnv(Object.keys(process.env))');
    result = result.replace(CONFIG.patterns.usage.restore, 'restoreEnv(envBackup)');
    result = result.replace(CONFIG.patterns.usage.clearDatabaseEnv, 'clearDatabaseEnv()');
    result = result.replace(CONFIG.patterns.usage.clearAppEnv, 'clearAppEnv()');

    return result;
  }

  /**
   * Transform moderate usage patterns
   */
  transformModerateUsage(content) {
    let result = content;

    // Apply simple transformations first
    result = this.transformSimpleUsage(result);

    // Transform moderate-specific patterns
    result = result.replace(/(\w+)\.setMockEnv\(/g, 'Object.assign(process.env, ');
    result = result.replace(/(\w+)\.getPreset\(/g, 'getEnvPreset(');
    result = result.replace(CONFIG.patterns.usage.withIsolatedEnv, 'await withIsolatedEnv(');

    return result;
  }

  /**
   * Transform complex usage patterns
   */
  transformComplexUsage(content) {
    let result = content;

    // Apply simpler transformations first
    result = this.transformModerateUsage(result);

    // Transform complex-specific patterns
    result = result.replace(CONFIG.patterns.usage.withCompleteIsolation, 'await withCompleteIsolation(');
    result = result.replace(CONFIG.patterns.usage.staticWithCompleteIsolation, 'await withCompleteIsolation(');
    result = result.replace(CONFIG.patterns.usage.staticWithIsolatedEnv, 'await withIsolatedEnv(');
    result = result.replace(CONFIG.patterns.usage.coordinatedClear, 'await cleanupTest()');
    result = result.replace(CONFIG.patterns.usage._clearEnvironmentForTesting, '// Environment clearing handled by isolateEnv()');
    result = result.replace(CONFIG.patterns.usage.newTestEnvironmentManager, '// TestEnvironmentManager → Simple helpers (no instantiation needed)');

    return result;
  }

  /**
   * Add backup variable declaration to test blocks
   */
  addBackupVariableDeclaration(content) {
    // Look for test blocks that use backup/restore
    if (content.includes('backupEnv') || content.includes('restoreEnv')) {
      // Add variable declaration after describe/it declarations
      const testBlockRegex = /(describe|it|test).*\{/g;
      let result = content;
      
      // Look for patterns where backup/restore are used
      if (content.includes('envBackup') && !content.includes('let envBackup')) {
        // Add declaration at the beginning of the file's test blocks
        result = result.replace(
          /(describe.*\{[\s\S]*?)(beforeEach|afterEach|it|test)/,
          '$1  let envBackup;\n\n  $2'
        );
      }
      
      return result;
    }
    return content;
  }

  /**
   * Create file backup
   */
  async createFileBackup(filepath, content) {
    const backupPath = join(CONFIG.backupDir, filepath.replace(/\//g, '_') + '.backup');
    await fs.writeFile(backupPath, content);
  }

  /**
   * Ensure backup directory exists
   */
  async ensureBackupDir() {
    try {
      await fs.mkdir(CONFIG.backupDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Perform rollback
   */
  async performRollback() {
    console.log('🔄 Starting rollback...');

    try {
      // Read migration log
      const logContent = await fs.readFile(CONFIG.logFile, 'utf8');
      const log = JSON.parse(logContent);

      let restoredCount = 0;

      for (const [filepath, fileLog] of Object.entries(log.files)) {
        if (fileLog.action === 'modified') {
          try {
            // Find backup file
            const backupPath = join(CONFIG.backupDir, filepath.replace(/\//g, '_') + '.backup');
            const backupContent = await fs.readFile(backupPath, 'utf8');
            
            // Restore original content
            await fs.writeFile(filepath, backupContent);
            console.log(`✅ Restored ${filepath}`);
            restoredCount++;
          } catch (error) {
            console.error(`❌ Failed to restore ${filepath}:`, error.message);
          }
        }
      }

      console.log(`\n🔄 Rollback completed! Restored ${restoredCount} files.`);
      
      // Clean up
      await fs.rm(CONFIG.backupDir, { recursive: true, force: true });
      await fs.unlink(CONFIG.logFile);

    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    }
  }

  /**
   * Print migration summary
   */
  printSummary() {
    const { summary } = this.logger.log;
    
    console.log('\n📊 Migration Summary:');
    console.log(`   Files processed: ${summary.processed}`);
    console.log(`   Files modified: ${summary.modified}`);
    console.log(`   Files skipped: ${summary.skipped}`);
    console.log(`   Errors: ${summary.errors}`);

    if (summary.errors > 0) {
      console.log(`\n⚠️  ${summary.errors} errors occurred. Check ${CONFIG.logFile} for details.`);
    }

    if (this.dryRun) {
      console.log('\n🔍 This was a dry run. No files were actually modified.');
      console.log('   Run without --dry-run to apply changes.');
    }
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rollback = args.includes('--rollback');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
TestEnvironmentManager Migration Script

Usage:
  node scripts/migrate-environment-tests.js [options]

Options:
  --dry-run     Show what would be changed without making changes
  --rollback    Restore files from backup
  --help, -h    Show this help message

Examples:
  # Preview changes
  node scripts/migrate-environment-tests.js --dry-run

  # Apply migration
  node scripts/migrate-environment-tests.js

  # Rollback changes
  node scripts/migrate-environment-tests.js --rollback
`);
    return;
  }

  const migrator = new TestEnvironmentMigrator({ dryRun, rollback });
  await migrator.migrate();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { TestEnvironmentMigrator };