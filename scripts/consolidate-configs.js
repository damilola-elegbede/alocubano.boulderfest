#!/usr/bin/env node

import { rm, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

async function consolidateConfigs() {
  console.log('📦 Consolidating test configurations...\n');
  
  // Remove old configs
  const oldConfigs = [
    'vitest.integration.config.js',
    'vitest.performance.config.js',
    'vitest.security.config.js',
    'vitest.performance.ci.config.js',
    'vitest.baseline.config.js',
    'vitest.simplified.config.js'
  ];
  
  for (const config of oldConfigs) {
    if (existsSync(config)) {
      await rm(config);
      console.log(`❌ Deleted: ${config}`);
    }
  }
  
  // Update package.json scripts
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  
  // Keep only essential scripts
  const essentialScripts = {
    test: 'vitest run',
    'test:watch': 'vitest watch',
    'test:coverage': 'vitest run --coverage',
    'test:e2e': 'playwright test',
    lint: 'eslint . && htmlhint pages/'
  };
  
  // Preserve non-test scripts
  const preserved = {};
  Object.entries(pkg.scripts).forEach(([key, value]) => {
    if (!key.includes('test') && key !== 'lint') {
      preserved[key] = value;
    }
  });
  
  pkg.scripts = { ...preserved, ...essentialScripts };
  
  await writeFile('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('✅ Updated package.json scripts\n');
  
  // Update CI workflow
  const workflowPath = '.github/workflows/comprehensive-testing.yml';
  if (existsSync(workflowPath)) {
    let workflow = await readFile(workflowPath, 'utf8');
    
    // Replace CI-specific commands with standard ones
    workflow = workflow.replace(/npm run test:unit:ci/g, 'npm test');
    workflow = workflow.replace(/npm run test:integration:ci/g, 'npm test');
    workflow = workflow.replace(/TEST_CI_EXCLUDE_PATTERNS=true /g, '');
    
    await writeFile(workflowPath, workflow);
    console.log('✅ Updated CI workflow\n');
  }
  
  console.log('📊 Configuration consolidation complete!');
  console.log('   - Configs: 6 → 1');
  console.log('   - Scripts: 25+ → 5');
  console.log('   - CI/Local: Aligned');
}

consolidateConfigs();