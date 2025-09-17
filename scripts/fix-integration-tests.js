#!/usr/bin/env node

/**
 * Fix all integration tests to use proper lifecycle management
 *
 * This script ensures all integration tests:
 * 1. Import getDbClient from setup-integration.js
 * 2. Get fresh database client in beforeEach
 * 3. Don't manage their own database lifecycle
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const INTEGRATION_DIR = 'tests/integration';

function findAllTestFiles(dir) {
  const files = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const path = join(dir, item);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...findAllTestFiles(path));
    } else if (item.endsWith('.test.js')) {
      files.push(path);
    }
  }

  return files;
}

function getRelativeImportPath(testFile) {
  // Calculate relative path from test file to setup-integration.js
  const depth = testFile.split('/').length - 2; // -2 for 'tests/integration'
  const prefix = '../'.repeat(depth - 1);
  return `${prefix}setup-integration.js`;
}

function fixTestFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Calculate relative import path
  const relativePath = relative('tests/integration', filePath);
  const importPath = getRelativeImportPath(filePath);

  // 1. Fix imports
  // Remove any direct database imports
  content = content.replace(/import\s+{\s*getDatabaseClient[^}]*}\s+from\s+['"][^'"]*database\.js['"]/g, '');
  content = content.replace(/import\s+{\s*resetDatabaseInstance[^}]*}\s+from\s+['"][^'"]*database\.js['"]/g, '');

  // Add getDbClient import if not present
  if (!content.includes('getDbClient')) {
    // Find the first import statement and add after it
    const importMatch = content.match(/import .* from .*/);
    if (importMatch) {
      const insertPos = content.indexOf(importMatch[0]) + importMatch[0].length;
      content = content.slice(0, insertPos) +
                `\nimport { getDbClient } from '${importPath}';` +
                content.slice(insertPos);
    }
  }

  // 2. Fix beforeAll hooks
  // Remove setting DATABASE_URL
  content = content.replace(/process\.env\.DATABASE_URL\s*=\s*[`'"][^`'"]*[`'"]/g, '');

  // Remove resetDatabaseInstance calls
  content = content.replace(/await\s+resetDatabaseInstance\(\)/g, '');

  // Fix getDatabaseClient calls to getDbClient
  content = content.replace(/await\s+getDatabaseClient\(\)/g, 'await getDbClient()');
  content = content.replace(/getDatabaseClient\(\)/g, 'getDbClient()');

  // 3. Add fresh client retrieval in beforeEach if it has db operations
  if (content.includes('beforeEach') && content.includes('db.execute')) {
    // Check if beforeEach already gets fresh client
    const beforeEachMatch = content.match(/beforeEach\(async[^{]*{([^}]*)}/);
    if (beforeEachMatch && !beforeEachMatch[1].includes('getDbClient')) {
      // Add getDbClient at the start of beforeEach
      content = content.replace(
        /beforeEach\(async[^{]*{\s*/,
        `beforeEach(async () => {
    // Get fresh database client for each test
    db = await getDbClient();
    `
      );
    }
  }

  // 4. Clean up afterAll hooks
  // Remove manual connection closing
  content = content.replace(/if\s*\(db.*?\)\s*{[\s\S]*?db\.close\(\)[\s\S]*?}/g, '');
  content = content.replace(/await\s+db\.close\(\)/g, '');
  content = content.replace(/await\s+resetDatabaseInstance\(\)/g, '');

  if (content !== originalContent) {
    console.log(`✅ Fixed: ${relativePath}`);
    writeFileSync(filePath, content);
    return true;
  }

  return false;
}

// Main execution
console.log('🔧 Fixing integration tests...\n');

const testFiles = findAllTestFiles(INTEGRATION_DIR);
console.log(`Found ${testFiles.length} test files\n`);

let fixedCount = 0;

for (const file of testFiles) {
  if (fixTestFile(file)) {
    fixedCount++;
  }
}

console.log(`\n📊 Summary: Fixed ${fixedCount} of ${testFiles.length} test files`);

if (fixedCount > 0) {
  console.log('\n⚠️  Please review the changes and run tests to verify they work correctly');
}