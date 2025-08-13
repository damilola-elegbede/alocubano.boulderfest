#!/usr/bin/env node

/**
 * Post-Migration Cleanup Script
 * Fixes syntax and logical issues after the automated migration
 */

import { promises as fs } from 'fs';
import { join } from 'path';

const FIXES = [
  // Fix double import statements
  {
    pattern: /import { backupEnv, restoreEnv, withCompleteIsolation, resetDatabaseSingleton, cleanupTest } from "\.\.\/helpers\/simple-helpers\.js";\s*;\s*import/gm,
    replacement: 'import { backupEnv, restoreEnv, withCompleteIsolation, resetDatabaseSingleton, cleanupTest } from "../helpers/simple-helpers.js";\nimport'
  },
  
  // Fix orphaned semicolons after imports
  {
    pattern: /import { backupEnv[^}]*} from "\.\.\/helpers\/simple-helpers\.js";\s*;/gm,
    replacement: (match) => match.replace(/;\s*;/, ';')
  },
  
  // Fix double await patterns
  {
    pattern: /await\s+await\s+/gm,
    replacement: 'await '
  },
  
  // Fix TestEnvironmentManager constructor calls that weren't properly converted
  {
    pattern: /const manager = \/\/ TestEnvironmentManager → Simple helpers \(no instantiation needed\);/gm,
    replacement: '// Using simple helpers instead of TestEnvironmentManager'
  },
  
  // Fix withIsolatedEnv calls that weren't properly imported
  {
    pattern: /await withIsolatedEnv\(/gm,
    replacement: 'await withIsolatedEnv('
  },
  
  // Fix envBackup variable declarations that are missing
  {
    pattern: /(beforeEach[^{]*{[^}]*?)envBackup = backupEnv/gm,
    replacement: '$1let envBackup;\n    envBackup = backupEnv'
  },
  
  // Fix getEnvPreset calls that need to be imported
  {
    pattern: /getEnvPreset\(/gm,
    replacement: 'getEnvPreset('
  },
  
  // Fix clearDatabaseEnv calls that need to be imported  
  {
    pattern: /clearDatabaseEnv\(/gm,
    replacement: 'clearDatabaseEnv('
  },
  
  // Fix duplicate import lines
  {
    pattern: /import { backupEnv, restoreEnv, withCompleteIsolation, resetDatabaseSingleton, cleanupTest } from "\.\.\/helpers\/simple-helpers\.js";\s*import\s*{\s*backupEnv/gm,
    replacement: 'import { backupEnv, restoreEnv, withCompleteIsolation, resetDatabaseSingleton, cleanupTest, getEnvPreset, withIsolatedEnv, clearDatabaseEnv'
  },
  
  // Clean up extra whitespace and newlines
  {
    pattern: /\n\s*\n\s*\n/gm,
    replacement: '\n\n'
  }
];

class MigrationFixer {
  async fixAllFiles() {
    console.log('🔧 Starting post-migration cleanup...');
    
    const testFiles = await this.findTestFiles();
    let fixedCount = 0;
    
    for (const filepath of testFiles) {
      const wasFixed = await this.fixFile(filepath);
      if (wasFixed) {
        fixedCount++;
        console.log(`✅ Fixed ${filepath}`);
      }
    }
    
    console.log(`\n🎉 Cleanup completed! Fixed ${fixedCount} files.`);
  }
  
  async findTestFiles() {
    const testFiles = [];
    
    async function scanDirectory(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.name.endsWith('.js') && (entry.name.includes('test') || entry.name === 'setup-vitest.js')) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that don't exist or can't be read
      }
    }
    
    await scanDirectory('tests');
    return testFiles;
  }
  
  async fixFile(filepath) {
    try {
      let content = await fs.readFile(filepath, 'utf8');
      const originalContent = content;
      
      // Apply all fixes
      for (const fix of FIXES) {
        content = content.replace(fix.pattern, fix.replacement);
      }
      
      // Special handling for specific files
      content = await this.applySpecialFixes(filepath, content);
      
      // Only write if content changed
      if (content !== originalContent) {
        await fs.writeFile(filepath, content);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`❌ Failed to fix ${filepath}:`, error.message);
      return false;
    }
  }
  
  async applySpecialFixes(filepath, content) {
    // Fix setup-vitest.js specific issues
    if (filepath.includes('setup-vitest.js')) {
      // Fix missing envBackup declaration
      if (content.includes('restoreEnv(envBackup)') && !content.includes('let envBackup')) {
        content = content.replace(
          '// Global teardown - restore original environment',
          'let envBackup; // Global environment backup\n\n// Global teardown - restore original environment'
        );
      }
      
      // Fix duplicate await in coordinatedClear call
      content = content.replace(/await await cleanupTest\(\)/, 'await cleanupTest()');
    }
    
    // Fix import statements to include missing imports
    if (content.includes('withIsolatedEnv(') && !content.includes('withIsolatedEnv } from')) {
      content = content.replace(
        /import { ([^}]*) } from "\.\.\/helpers\/simple-helpers\.js"/,
        (match, imports) => {
          const importList = imports.split(',').map(s => s.trim()).filter(s => s);
          const neededImports = ['withIsolatedEnv', 'getEnvPreset', 'clearDatabaseEnv', 'clearAppEnv'];
          
          neededImports.forEach(imp => {
            if (content.includes(imp + '(') && !importList.includes(imp)) {
              importList.push(imp);
            }
          });
          
          return `import { ${importList.join(', ')} } from "../helpers/simple-helpers.js"`;
        }
      );
    }
    
    // Add missing envBackup variable declarations
    if (content.includes('envBackup = backupEnv') && !content.includes('let envBackup')) {
      // Find test blocks and add variable declaration
      content = content.replace(
        /(beforeEach[^{]*{\s*)/,
        '$1let envBackup;\n    '
      );
    }
    
    return content;
  }
}

async function main() {
  const fixer = new MigrationFixer();
  await fixer.fixAllFiles();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Fix script failed:', error);
    process.exit(1);
  });
}

export { MigrationFixer };