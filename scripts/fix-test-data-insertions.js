#!/usr/bin/env node
/**
 * Script to automatically fix test files that insert test data without is_test column
 *
 * This script:
 * 1. Finds all test files with INSERT INTO transactions statements
 * 2. Adds is_test = 1 to the column list and args array
 * 3. Updates the files in place
 *
 * Usage: node scripts/fix-test-data-insertions.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 Finding test files with INSERT INTO transactions...\n');

// Find all test files in tests/integration directory
const testFiles = await glob('tests/integration/**/*.test.js', {
  cwd: projectRoot,
  absolute: true
});

let filesFixed = 0;
let insertionsFixed = 0;

for (const filePath of testFiles) {
  const relativePath = path.relative(projectRoot, filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let fileInsertionsFixed = 0;

  // Pattern 1: INSERT INTO transactions with explicit column list (missing is_test)
  // Use balanced parenthesis matching to handle nested function calls like datetime('now', 1)
  const insertPattern = /INSERT INTO transactions\s*\(((?:[^()]+|\([^)]*\))+)\)\s*VALUES\s*\(((?:[^()]+|\([^)]*\))+)\)/gi;

  content = content.replace(insertPattern, (match, columns, values) => {
    // Check if is_test is already in the column list
    if (columns.includes('is_test')) {
      return match; // Already has is_test, skip
    }

    // Add is_test to columns
    const newColumns = columns.trim() + ', is_test';

    // Add is_test value (1 for test mode) - always use literal 1
    // This preserves any nested function calls like datetime('now', 1)
    const newValues = values.trim() + ', 1';

    modified = true;
    fileInsertionsFixed++;

    return `INSERT INTO transactions (${newColumns}) VALUES (${newValues})`;
  });

  // Pattern 2: Multi-line INSERT INTO transactions with explicit column list
  const multilineInsertPattern = /INSERT INTO transactions\s*\(\s*([^)]+)\s*\)\s*VALUES\s*\(\s*([^)]+)\s*\)/gis;

  content = content.replace(multilineInsertPattern, (match, columns, values) => {
    // Check if is_test is already in the column list
    if (columns.includes('is_test')) {
      return match; // Already has is_test, skip
    }

    // Clean up columns and values (remove extra whitespace)
    const cleanColumns = columns.replace(/\s+/g, ' ').trim();
    const cleanValues = values.replace(/\s+/g, ' ').trim();

    // Add is_test to columns
    const newColumns = cleanColumns + ', is_test';

    // Add is_test value (1 for test mode)
    const newValues = cleanValues + ', 1';

    modified = true;
    // Only count once even if caught by both patterns
    const alreadyCounted = fileInsertionsFixed > 0;
    if (!alreadyCounted) {
      fileInsertionsFixed++;
    }

    // Preserve original formatting style (multi-line)
    if (match.includes('\n')) {
      return `INSERT INTO transactions (\n          ${newColumns}\n        ) VALUES (\n          ${newValues}\n        )`;
    } else {
      return `INSERT INTO transactions (${newColumns}) VALUES (${newValues})`;
    }
  });

  // Write back modified content
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesFixed++;
    insertionsFixed += fileInsertionsFixed;
    console.log(`✅ Fixed ${fileInsertionsFixed} insertion(s) in: ${relativePath}`);
  }
}

console.log('\n📊 Summary:');
console.log(`   Files processed: ${testFiles.length}`);
console.log(`   Files modified: ${filesFixed}`);
console.log(`   Total insertions fixed: ${insertionsFixed}`);

if (filesFixed > 0) {
  console.log('\n✅ All test files have been updated with is_test = 1');
  console.log('🔍 Run integration tests to verify the fixes');
} else {
  console.log('\n✅ No fixes needed - all test files already include is_test column');
}
