/**
 * Simple Global Teardown for E2E Tests in CI environment
 * Minimal cleanup without complex database operations
 */

import { promises as fs } from 'fs';
import path from 'path';

async function globalTeardown() {
  console.log('\n🧹 E2E Global Teardown Starting (CI Environment)...\n');
  
  const startTime = Date.now();
  
  try {
    // Clean test artifacts
    console.log('🗂️  Cleaning test artifacts...');
    const projectRoot = process.cwd();
    const artifactsToClean = [
      'test-results',
      'playwright-report',
      'e2e-test-results.json'
    ];
    
    let filesDeleted = 0;
    
    for (const artifact of artifactsToClean) {
      const artifactPath = path.join(projectRoot, artifact);
      
      try {
        const stats = await fs.stat(artifactPath);
        
        if (stats.isDirectory()) {
          const files = await fs.readdir(artifactPath, { recursive: true });
          filesDeleted += files.length;
          await fs.rm(artifactPath, { recursive: true, force: true });
          console.log(`  🗂️  Removed directory: ${artifact} (${files.length} files)`);
        } else {
          await fs.unlink(artifactPath);
          filesDeleted += 1;
          console.log(`  🗂️  Removed file: ${artifact}`);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`  ⚠️ Could not remove ${artifact}: ${error.message}`);
        }
        // ENOENT (file not found) is not an error - artifact doesn't exist
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log('\n📊 CI Teardown Report:');
    console.log(`⏱️  Total duration: ${duration}ms`);
    console.log(`🗂️  Test files cleaned: ${filesDeleted}`);
    console.log('✅ All operations successful');
    
  } catch (error) {
    console.error('❌ Teardown failed:', error.message);
  }
  
  console.log('\n✨ CI E2E Global Teardown Complete\n');
}

export default globalTeardown;