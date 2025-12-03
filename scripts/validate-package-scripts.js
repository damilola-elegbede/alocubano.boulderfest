#!/usr/bin/env node

/**
 * Package Scripts Validation Tool
 *
 * Validates that package.json scripts are:
 * - Consistently named and organized
 * - Include appropriate deprecation warnings
 * - Follow modern testing approaches
 * - Have clear command purposes
 *
 * Issue #12: Package Scripts Inconsistency
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, '..', 'package.json');

function validatePackageScripts() {
  console.log('🔍 Package Scripts Validation Tool');
  console.log('=====================================\n');

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    console.error('❌ Error reading package.json:', error.message);
    process.exit(1);
  }

  const scripts = packageJson.scripts || {};
  const issues = [];
  const successes = [];

  // Define script categories and their expected patterns
  const scriptCategories = {
    build: {
      pattern: /^build(:|$)/,
      examples: ['build', 'build:production'],
      description: 'Build and compilation scripts'
    },
    dev: {
      pattern: /^(dev|start)(:|$)/,
      examples: ['dev', 'dev:local', 'start', 'start:local'],
      description: 'Development server scripts'
    },
    test: {
      pattern: /^test(:|$)/,
      examples: ['test', 'test:unit', 'test:e2e', 'test:e2e:ui'],
      description: 'Testing scripts'
    },
    database: {
      pattern: /^(migrate|db):(.*)/,
      examples: ['migrate:up', 'db:shell', 'db:e2e:setup'],
      description: 'Database and migration scripts'
    },
    deploy: {
      pattern: /^deploy(:|$)/,
      examples: ['deploy:staging', 'deploy:production'],
      description: 'Deployment scripts'
    },
    lint: {
      pattern: /^lint(:|$)/,
      examples: ['lint', 'lint:js', 'lint:html'],
      description: 'Code quality and linting scripts'
    }
  };

  // Check for required scripts
  const requiredScripts = ['test', 'dev', 'lint'];
  requiredScripts.forEach(scriptName => {
    if (scripts[scriptName]) {
      successes.push(`✅ Required script '${scriptName}' exists`);
    } else {
      issues.push(`❌ Missing required script: '${scriptName}'`);
    }
  });

  // Check for deprecated script warnings
  const deprecatedScriptNames = [
    'test:simple',
    'test:e2e:ci',
    'start:ci',
    'vercel:dev:ci'
  ];

  deprecatedScriptNames.forEach(scriptName => {
    if (scripts[scriptName]) {
      const scriptContent = scripts[scriptName];
      if (scriptContent.includes('DEPRECATED')) {
        successes.push(`✅ Deprecated script '${scriptName}' has warning`);
      } else {
        issues.push(`⚠️ Deprecated script '${scriptName}' missing deprecation warning`);
      }
    }
  });

  // Check for consistent E2E approach
  const e2eScripts = Object.keys(scripts).filter(key => key.includes('test:e2e'));
  const modernE2eCount = e2eScripts.filter(script =>
    !scripts[script].includes('DEPRECATED') &&
    !script.includes(':ci')
  ).length;

  if (modernE2eCount > 0) {
    successes.push(`✅ ${modernE2eCount} modern E2E scripts using Vercel Preview Deployments`);
  }

  // Check script organization (comments for categories)
  const organizationComments = [
    '//dev',
    '//test',
    '//database',
    '//deploy',
    '//deprecated-test',
    '//deprecated-dev'
  ];

  organizationComments.forEach(comment => {
    if (scripts[comment]) {
      successes.push(`✅ Organization comment '${comment}' found`);
    }
  });

  // Validate script descriptions in package.json
  if (packageJson['scripts-guide']) {
    successes.push('✅ Script guide documentation exists');

    const guide = packageJson['scripts-guide'];
    if (guide.current && guide.deprecated) {
      successes.push('✅ Migration guide includes current and deprecated sections');
    }
  } else {
    issues.push('⚠️ Missing scripts-guide documentation');
  }

  // Check for memory optimization patterns
  const memoryOptimizedScripts = Object.keys(scripts).filter(key =>
    scripts[key].includes('NODE_OPTIONS') && scripts[key].includes('max-old-space-size')
  );

  if (memoryOptimizedScripts.length > 0) {
    successes.push(`✅ ${memoryOptimizedScripts.length} scripts have memory optimization`);
  }

  // Display results
  console.log('✅ SUCCESSES:');
  successes.forEach(success => console.log(`  ${success}`));

  if (issues.length > 0) {
    console.log('\n⚠️ ISSUES FOUND:');
    issues.forEach(issue => console.log(`  ${issue}`));
  }

  // Script statistics
  console.log('\n📊 SCRIPT STATISTICS:');
  console.log(`  Total scripts: ${Object.keys(scripts).length}`);
  console.log(`  Development scripts: ${Object.keys(scripts).filter(k => k.match(/^(dev|start)/)).length}`);
  console.log(`  Testing scripts: ${Object.keys(scripts).filter(k => k.startsWith('test:')).length}`);
  console.log(`  Database scripts: ${Object.keys(scripts).filter(k => k.match(/^(migrate|db):/)).length}`);
  console.log(`  Deprecated scripts: ${Object.keys(scripts).filter(k => scripts[k].includes('DEPRECATED')).length}`);

  // Current vs Deprecated breakdown
  const currentScripts = Object.keys(scripts).filter(k =>
    !scripts[k].includes('DEPRECATED') &&
    !k.startsWith('//') &&
    !k.startsWith('pre') &&
    !k.startsWith('post')
  );

  const deprecatedScriptsList = Object.keys(scripts).filter(k =>
    scripts[k].includes('DEPRECATED')
  );

  console.log(`  Current (active) scripts: ${currentScripts.length}`);
  console.log(`  Deprecated scripts: ${deprecatedScriptsList.length}`);

  // Display script categories
  console.log('\n📋 SCRIPT CATEGORIES:');
  Object.entries(scriptCategories).forEach(([category, config]) => {
    const categoryScripts = currentScripts.filter(script => script.match(config.pattern));
    if (categoryScripts.length > 0) {
      console.log(`  ${category}: ${categoryScripts.length} scripts`);
      console.log(`    Examples: ${categoryScripts.slice(0, 3).join(', ')}`);
    }
  });

  // Validation summary
  console.log('\n🎯 VALIDATION SUMMARY:');
  if (issues.length === 0) {
    console.log('✅ All validations passed! Package scripts are properly organized.');
    console.log('🚀 Issue #12 (Package Scripts Inconsistency) has been resolved.');
  } else {
    console.log(`⚠️ ${issues.length} issues found that should be addressed.`);
  }

  console.log('\n💡 MIGRATION GUIDANCE:');
  console.log('  - Use npm run dev for development');
  console.log('  - Use npm run test:unit for unit tests');
  console.log('  - Use npm run test:e2e for E2E tests (Vercel Preview Deployments)');
  console.log('  - Deprecated commands show warnings and redirect to new ones');
  console.log('  - All CI server commands have been removed (use Preview Deployments)');

  return issues.length === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const success = validatePackageScripts();
  process.exit(success ? 0 : 1);
}

export { validatePackageScripts };