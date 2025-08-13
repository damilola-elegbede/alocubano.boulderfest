#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

async function findTestFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await findTestFiles(fullPath, files);
    } else if (entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function migrateDatabaseTests() {
  console.log('🔄 Starting database test migration...\n');
  
  const testFiles = await findTestFiles('tests');
  let migratedCount = 0;
  let skippedCount = 0;
  const issues = [];
  
  for (const file of testFiles) {
    try {
      let content = await readFile(file, 'utf8');
      let modified = false;
      const originalContent = content;
      
      // Skip if already migrated
      if (content.includes('@tests/helpers/db')) {
        console.log(`✓ Already migrated: ${file}`);
        skippedCount++;
        continue;
      }
      
      // Check for database test helpers
      const hasOldHelpers = 
        content.includes('DatabaseTestHelpers') || 
        content.includes('IntegrationTestDatabaseFactory') ||
        content.includes('database-test-helpers') ||
        content.includes('integration-test-database-factory') ||
        content.includes('TestDatabaseClient') ||
        content.includes('MockDatabaseClient');
      
      if (hasOldHelpers) {
        console.log(`📝 Migrating: ${file}`);
        
        // Replace imports
        content = content.replace(
          /import\s*{[^}]*DatabaseTestHelpers[^}]*}\s*from\s*['"][^'"]*database-test-helpers['"]/g,
          "import { createTestDatabase, seedTestData, createLibSQLAdapter } from '@tests/helpers/db'"
        );
        
        content = content.replace(
          /import\s*{[^}]*IntegrationTestDatabaseFactory[^}]*}\s*from\s*['"][^'"]*integration-test-database-factory['"]/g,
          "import { createTestDatabase, seedTestData, createLibSQLAdapter } from '@tests/helpers/db'"
        );
        
        // Replace other database helper imports
        content = content.replace(
          /import\s*{[^}]*}\s*from\s*['"]\.\.\/utils\/database-[^'"]+['"]/g,
          "import { createTestDatabase, seedTestData, createLibSQLAdapter, queryHelper } from '@tests/helpers/db'"
        );
        
        // Replace TestEnvironmentManager with simple pattern
        if (content.includes('TestEnvironmentManager')) {
          content = content.replace(
            /import\s*{[^}]*TestEnvironmentManager[^}]*}\s*from\s*[^;]+;/g,
            "import { createTestDatabase, seedTestData } from '@tests/helpers/db';"
          );
          
          // Remove TestEnvironmentManager usage
          content = content.replace(
            /const\s+testEnv\s*=\s*new\s+TestEnvironmentManager\([^)]*\);?/g,
            ''
          );
          
          content = content.replace(
            /await\s+testEnv\.setup\(\);?/g,
            'db = createTestDatabase();\n  seedTestData(db, "minimal");'
          );
          
          content = content.replace(
            /await\s+testEnv\.cleanup\(\);?/g,
            'db.close();'
          );
        }
        
        // Replace complex beforeEach/afterEach patterns
        content = content.replace(
          /beforeEach\(async\s*\(\)\s*=>\s*{[\s\S]*?const\s+dbHelpers\s*=\s*new\s+DatabaseTestHelpers\(\);[\s\S]*?}\);/gm,
          `beforeEach(() => {
  db = createTestDatabase();
  seedTestData(db, 'minimal');
});`
        );
        
        // Replace complex cleanup
        content = content.replace(
          /afterEach\(async\s*\(\)\s*=>\s*{[\s\S]*?await\s+dbHelpers\.cleanupDatabase\(\);[\s\S]*?}\);/gm,
          `afterEach(() => {
  if (db) db.close();
});`
        );
        
        // Replace factory pattern usage
        content = content.replace(
          /const\s+factory\s*=\s*new\s+IntegrationTestDatabaseFactory\(\);[\s\S]*?const\s+\w+\s*=\s*await\s+factory\.create\w+Client\(\);/gm,
          'const db = createTestDatabase();\n  const client = createLibSQLAdapter(db);'
        );
        
        // Replace getDatabaseClient mocks
        content = content.replace(
          /vi\.mocked\(getDatabaseClient\)\.mockResolvedValue\(mockClient\);/g,
          'vi.mocked(getDatabaseClient).mockResolvedValue(createLibSQLAdapter(db));'
        );
        
        // Add db variable declaration if needed
        if (content.includes('createTestDatabase()') && !content.includes('let db;')) {
          // Find describe block and add db declaration
          content = content.replace(
            /(describe\([^{]+{)/,
            '$1\n  let db;\n'
          );
        }
        
        // Check if modifications were made
        if (content !== originalContent) {
          modified = true;
          migratedCount++;
        }
      }
      
      if (modified) {
        await writeFile(file, content);
        console.log(`✅ Migrated: ${file}`);
      }
    } catch (error) {
      console.error(`❌ Error migrating ${file}:`, error.message);
      issues.push({ file, error: error.message });
    }
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Migrated: ${migratedCount} files`);
  console.log(`   ⏭️  Skipped: ${skippedCount} files (already migrated)`);
  console.log(`   📁 Total: ${testFiles.length} files scanned`);
  
  if (issues.length > 0) {
    console.log('\n⚠️  Issues encountered:');
    issues.forEach(({ file, error }) => {
      console.log(`   - ${file}: ${error}`);
    });
  }
  
  // Provide next steps
  console.log('\n📝 Next steps:');
  console.log('   1. Run "npm test" to verify all tests pass');
  console.log('   2. Review any test failures and fix manually if needed');
  console.log('   3. Delete old database helpers:');
  console.log('      - tests/utils/database-test-helpers.js');
  console.log('      - tests/utils/integration-test-database-factory.js');
  console.log('   4. Commit the changes');
}

// Run the migration
migrateDatabaseTests().catch(console.error);