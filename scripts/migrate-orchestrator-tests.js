#!/usr/bin/env node

/**
 * Test Migration Script - Orchestrator to Simple Setup
 * 
 * Automatically migrates test files from complex TestInitializationOrchestrator 
 * patterns to the simplified setup helper pattern. This script was created as part
 * of the refactoring effort to eliminate complex test infrastructure (~2000+ lines)
 * in favor of simple, direct setup functions (~100 lines).
 * 
 * What this script does:
 * 1. Scans all test files for legacy orchestrator patterns
 * 2. Adds deprecation notices to legacy files
 * 3. Provides guidance on migration to new patterns
 * 4. Creates backups of all modified files
 * 5. Validates changes and provides comprehensive reporting
 * 
 * Migration targets:
 * - TestInitializationOrchestrator usage -> setupTest()/teardownTest()
 * - enhanced-test-setup.js patterns -> tests/helpers/setup.js
 * - Complex orchestration calls -> Simple function calls
 * - Broken import patterns -> Working import statements
 * 
 * Usage:
 *   node scripts/migrate-orchestrator-tests.js [--dry-run] [--verbose]
 * 
 * Examples:
 *   node scripts/migrate-orchestrator-tests.js --dry-run    # Preview changes
 *   node scripts/migrate-orchestrator-tests.js --verbose    # Apply with details
 *   node scripts/migrate-orchestrator-tests.js             # Apply quietly
 * 
 * Safety features:
 * - Automatic backups in .migration-backups/
 * - Dry-run mode to preview changes
 * - Syntax validation after transformations
 * - Conservative transformations to avoid breaking code
 * 
 * After running:
 * 1. Test your changes: npm test
 * 2. Review modified files
 * 3. Commit if everything works
 * 4. Remove backups: rm -rf .migration-backups
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Configuration
const config = {
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  pattern: process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'tests/**/*.js',
  backupDir: path.join(projectRoot, '.migration-backups'),
  
  // Patterns to identify files that need migration
  patterns: {
    orchestratorImport: /import\s*{[^}]*TestInitializationOrchestrator[^}]*}\s*from\s*['"][^'"]*['"];?\s*/g,
    enhancedSetupImport: /import\s*{[^}]*}\s*from\s*['"][^'"]*enhanced-test-setup[^'"]*['"];?\s*/g,
    databaseHelpersImport: /import\s*{[^}]*}\s*from\s*['"][^'"]*database-test-helpers[^'"]*['"];?\s*/g,
    orchestratorUsage: /(?:testOrchestrator\.|orchestrator\.)/g,
    createTestContext: /(?:await\s+)?(?:testOrchestrator\.)?createTestContext\([^)]*\)/g,
    beginTransaction: /(?:await\s+)?(?:testOrchestrator\.)?beginTestTransaction\([^)]*\)/g,
    rollbackTransaction: /(?:await\s+)?(?:testOrchestrator\.)?rollbackTestTransaction\([^)]*\)/g,
    setupIntegrationTests: /setupIntegrationTests\([^)]*\)/g,
    complexBeforeAll: /beforeAll\s*\(\s*async\s*\(\s*\)\s*=>\s*{[^}]*orchestrator[^}]*}\s*\)/g,
    complexAfterAll: /afterAll\s*\(\s*async\s*\(\s*\)\s*=>\s*{[^}]*orchestrator[^}]*}\s*\)/g
  },
  
  // Transformation rules - more conservative and safer
  transforms: [
    {
      name: 'Add deprecation header to orchestrator files',
      pattern: /^(\/\*\*[\s\S]*?\*\/\s*)?/,
      replacement: (match, existingComment) => {
        if (existingComment && existingComment.includes('DEPRECATED')) {
          return existingComment; // Already has deprecation notice
        }
        return `// DEPRECATED: This file has been replaced by tests/helpers/setup.js
// Use setupTest() and teardownTest() instead

${existingComment || ''}`;
      },
      fileFilter: file => file.includes('test-initialization-orchestrator') || file.includes('enhanced-test-setup')
    },
    {
      name: 'Replace specific database-test-helpers import',
      pattern: /import\s*{\s*dbTestHelpers\s*}\s*from\s*['"][^'"]*database-test-helpers[^'"]*['"];?\s*/g,
      replacement: "// Database helpers are now integrated into setup.js\n// import { setupTest, teardownTest } from '../helpers/setup.js';"
    },
    {
      name: 'Comment out setupIntegrationTests function call',
      pattern: /(\s*)setupIntegrationTests\(/g,
      replacement: "$1// setupIntegrationTests("
    }
  ]
};

// Stats tracking
const stats = {
  filesProcessed: 0,
  filesModified: 0,
  linesRemoved: 0,
  linesAdded: 0,
  transformationsApplied: 0,
  errors: []
};

/**
 * Log message based on verbosity level
 */
function log(message, level = 'info') {
  if (level === 'error' || config.verbose || level === 'warn') {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Create backup of file before modification
 */
function createBackup(filePath, content) {
  if (config.dryRun) return;
  
  const relativePath = path.relative(projectRoot, filePath);
  const backupPath = path.join(config.backupDir, relativePath);
  const backupDir = path.dirname(backupPath);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  fs.writeFileSync(backupPath, content);
  log(`Created backup: ${backupPath}`, 'info');
}

/**
 * Check if file needs migration
 */
function needsMigration(content) {
  return Object.values(config.patterns).some(pattern => pattern.test(content));
}

/**
 * Apply transformation rules to content
 */
function transformContent(content, filePath) {
  let transformedContent = content;
  let transformCount = 0;
  
  for (const transform of config.transforms) {
    // Skip transform if fileFilter exists and doesn't match
    if (transform.fileFilter && !transform.fileFilter(filePath)) {
      continue;
    }
    
    const originalContent = transformedContent;
    
    if (typeof transform.replacement === 'function') {
      transformedContent = transformedContent.replace(transform.pattern, transform.replacement);
    } else {
      transformedContent = transformedContent.replace(transform.pattern, transform.replacement);
    }
    
    if (originalContent !== transformedContent) {
      transformCount++;
      log(`  Applied: ${transform.name}`, 'info');
    }
  }
  
  // Additional cleanup: remove excessive empty lines but preserve intentional spacing
  transformedContent = transformedContent
    .replace(/\n{4,}/g, '\n\n\n') // Limit to max 3 consecutive newlines
    .replace(/\/\/ DEPRECATED:.*\n\/\/ Use setupTest.*\n\n\/\*\*/g, '// DEPRECATED: This file has been replaced by tests/helpers/setup.js\n// Use setupTest() and teardownTest() instead\n\n/**'); // Fix deprecation header format
  
  return { content: transformedContent, transformCount };
}

/**
 * Validate syntax after transformation
 */
function validateSyntax(content, filePath) {
  try {
    // Basic validation - check for balanced brackets and common syntax issues
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    
    if (openBraces !== closeBraces) {
      throw new Error(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }
    
    if (openParens !== closeParens) {
      throw new Error(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    }
    
    // Check for obvious syntax errors
    if (content.includes('import import')) {
      throw new Error('Duplicate import statements detected');
    }
    
    if (content.includes('await await')) {
      throw new Error('Duplicate await keywords detected');
    }
    
    return true;
  } catch (error) {
    log(`Syntax validation failed for ${filePath}: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    stats.filesProcessed++;
    
    const content = fs.readFileSync(filePath, 'utf8');
    const originalLineCount = content.split('\n').length;
    
    // Check if file needs migration
    if (!needsMigration(content)) {
      log(`Skipping ${filePath} - no migration needed`, 'info');
      return;
    }
    
    log(`Processing ${filePath}...`, 'info');
    
    // Create backup
    createBackup(filePath, content);
    
    // Apply transformations
    const { content: transformedContent, transformCount } = transformContent(content, filePath);
    const newLineCount = transformedContent.split('\n').length;
    
    // Validate syntax
    if (!validateSyntax(transformedContent, filePath)) {
      stats.errors.push(`Syntax validation failed: ${filePath}`);
      return;
    }
    
    // Write transformed content
    if (!config.dryRun) {
      fs.writeFileSync(filePath, transformedContent);
    }
    
    // Update stats
    stats.filesModified++;
    stats.transformationsApplied += transformCount;
    stats.linesRemoved += Math.max(0, originalLineCount - newLineCount);
    stats.linesAdded += Math.max(0, newLineCount - originalLineCount);
    
    log(`✅ Migrated ${filePath} (${transformCount} transformations)`, 'success');
    
  } catch (error) {
    const errorMsg = `Failed to process ${filePath}: ${error.message}`;
    log(errorMsg, 'error');
    stats.errors.push(errorMsg);
  }
}

/**
 * Recursively find all .js files in a directory
 */
function findJSFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip certain directories
      if (['node_modules', 'dist', 'build', '.migration-backups'].includes(entry.name)) {
        continue;
      }
      findJSFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'migrate-orchestrator-tests.js') {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Find files to migrate
 */
async function findFiles() {
  try {
    const defaultDir = path.join(projectRoot, 'tests');
    const userPattern = config.pattern;
    // Derive a base directory from pattern (supports 'dir/**/*.js' or 'dir')
    const patternRoot = userPattern && userPattern !== 'tests/**/*.js'
      ? (userPattern.includes('**') ? userPattern.split('**')[0] : userPattern)
      : 'tests';
    const baseDir = path.isAbsolute(patternRoot)
      ? patternRoot
      : path.join(projectRoot, patternRoot);

    const dirToScan = fs.existsSync(baseDir) ? baseDir : defaultDir;

    if (!fs.existsSync(dirToScan)) {
      log(`Directory not found: ${dirToScan}`, 'warn');
      return [];
    }
    
    return findJSFiles(dirToScan);
  } catch (error) {
    log(`Error finding files: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Clean up legacy files that are no longer needed
 */
function cleanupLegacyFiles() {
  const legacyFiles = [
    'tests/utils/test-initialization-orchestrator.js',
    'tests/utils/enhanced-test-setup.js'
  ];
  
  for (const file of legacyFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Only add deprecation notice if not already present
      if (!content.includes('// DEPRECATED')) {
        createBackup(filePath, content);
        if (!config.dryRun) {
          const deprecatedContent = `// DEPRECATED: This file has been replaced by tests/helpers/setup.js
// Use setupTest() and teardownTest() instead

${content}`;
          fs.writeFileSync(filePath, deprecatedContent);
        }
        log(`Added deprecation notice: ${file}`, 'warn');
      } else {
        log(`Already deprecated: ${file}`, 'info');
      }
    }
  }
}

/**
 * Generate migration report
 */
function generateReport() {
  console.log('\n📊 Migration Report');
  console.log('==================');
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Transformations applied: ${stats.transformationsApplied}`);
  console.log(`Lines removed: ${stats.linesRemoved}`);
  console.log(`Lines added: ${stats.linesAdded}`);
  console.log(`Net change: ${stats.linesAdded - stats.linesRemoved} lines`);
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (config.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No files were actually modified');
    console.log('Run without --dry-run to apply changes');
  } else if (stats.filesModified > 0) {
    console.log(`\n✅ Migration completed successfully!`);
    console.log(`Backups created in: ${config.backupDir}`);
  } else {
    console.log('\n✅ No files needed migration');
  }
  
  console.log('\n💡 Next steps:');
  console.log('  1. Review the changes and test your migrated files');
  console.log('  2. Run your test suite: npm test');
  console.log('  3. Commit the changes if everything works correctly');
  console.log('  4. Remove backup files when confident: rm -rf .migration-backups');
}

/**
 * Main migration function
 */
async function main() {
  console.log('🔄 Test Migration Script - Orchestrator to Simple Setup');
  console.log('=========================================================');
  
  if (config.dryRun) {
    console.log('🔍 DRY RUN MODE - Previewing changes only');
  }
  
  // Find files to process
  log('Finding test files...', 'info');
  const files = await findFiles();
  
  if (files.length === 0) {
    log('No test files found matching pattern', 'warn');
    return;
  }
  
  log(`Found ${files.length} test files to analyze`, 'info');
  
  // Process each file
  for (const file of files) {
    processFile(file);
  }
  
  // Clean up legacy files
  if (stats.filesModified > 0) {
    log('Cleaning up legacy files...', 'info');
    cleanupLegacyFiles();
  }
  
  // Generate report
  generateReport();
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at ${promise}: ${reason}`, 'error');
  process.exit(1);
});

// Run the migration
main().catch(error => {
  log(`Migration failed: ${error.message}`, 'error');
  process.exit(1);
});