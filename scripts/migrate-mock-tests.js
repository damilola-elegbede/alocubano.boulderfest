#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import { promisify } from 'util';

const globAsync = promisify(glob);

async function migrateMockTests() {
  const testFiles = await globAsync('tests/**/*.test.js');
  let migratedCount = 0;
  let skippedCount = 0;
  
  for (const file of testFiles) {
    try {
      let content = await readFile(file, 'utf8');
      let modified = false;
      
      // Skip if file uses TestMockManager
      if (content.includes('TestMockManager')) {
        console.log(`⚠️  Skipping ${file} - uses TestMockManager (needs manual migration)`);
        skippedCount++;
        continue;
      }
      
      // Replace service-mock-factory imports
      if (content.includes('service-mock-factory')) {
        content = content.replace(
          /import.*from.*['"].*service-mock-factory.*['"];?/g,
          "import { mockBrevoService, mockStripeService, mockDatabaseClient } from '../helpers/mocks';"
        );
        modified = true;
      }
      
      // Replace mock-services imports
      if (content.includes('mock-services')) {
        content = content.replace(
          /import.*from.*['"].*mock-services.*['"];?/g,
          "import { mockBrevoService, mockStripeService, mockFetch } from '../helpers/mocks';"
        );
        modified = true;
      }
      
      // Replace database-mock-sync imports
      if (content.includes('database-mock-sync')) {
        content = content.replace(
          /import.*DatabaseMockSync.*from.*['"].*database-mock-sync.*['"];?/g,
          "import { mockDatabaseClient } from '../helpers/mocks';"
        );
        
        // Replace DatabaseMockSync usage
        content = content.replace(
          /const\s+\w+\s*=\s*new\s+DatabaseMockSync\(\);?/g,
          'const mockDb = mockDatabaseClient();'
        );
        
        content = content.replace(
          /new\s+DatabaseMockSync\(\)/g,
          'mockDatabaseClient()'
        );
        
        modified = true;
      }
      
      // Update mock patterns if modified
      if (modified) {
        // Fix import paths based on file location
        const depth = file.split('/').length - 2; // Calculate depth from tests/
        const helperPath = depth === 1 ? './helpers/mocks' : '../'.repeat(depth - 1) + 'helpers/mocks';
        
        content = content.replace(
          /from ['"]\.\.\/helpers\/mocks['"];?/g,
          `from '${helperPath}';`
        );
        
        await writeFile(file, content);
        console.log(`✅ Migrated: ${file}`);
        migratedCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Migrated: ${migratedCount} files`);
  console.log(`   ⚠️  Skipped: ${skippedCount} files (need manual migration)`);
  
  if (skippedCount > 0) {
    console.log(`\n⚠️  Files requiring manual migration:`);
    const skippedFiles = await globAsync('tests/**/*.test.js');
    for (const file of skippedFiles) {
      const content = await readFile(file, 'utf8');
      if (content.includes('TestMockManager')) {
        console.log(`   - ${file}`);
      }
    }
  }
}

// Run migration
migrateMockTests().catch(console.error);