#!/usr/bin/env node

/**
 * Script to add missing npm scripts referenced in GitHub workflows
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

// Add missing quality gate scripts
const missingScripts = {
  'quality:gates': 'node scripts/quality-gates.js',
  'quality:gates:report': 'node scripts/quality-gates.js report',
  'quality:gates:ci': 'node scripts/quality-gates.js ci',
  'quality:gates:verbose': 'node scripts/quality-gates.js ci --verbose'
};

let modified = false;

for (const [scriptName, scriptCommand] of Object.entries(missingScripts)) {
  if (!packageJson.scripts[scriptName]) {
    console.log(`✅ Adding missing script: ${scriptName}`);
    packageJson.scripts[scriptName] = scriptCommand;
    modified = true;
  } else {
    console.log(`ℹ️ Script already exists: ${scriptName}`);
  }
}

if (modified) {
  // Sort scripts alphabetically within categories
  const scripts = packageJson.scripts;
  const sortedScripts = {};

  // Group scripts by category
  const categories = {
    build: [],
    test: [],
    lint: [],
    start: [],
    migrate: [],
    db: [],
    health: [],
    deploy: [],
    quality: [],
    other: []
  };

  for (const [name, command] of Object.entries(scripts)) {
    const category = name.split(':')[0];
    if (categories[category]) {
      categories[category].push([name, command]);
    } else {
      categories.other.push([name, command]);
    }
  }

  // Sort within categories and rebuild
  for (const [category, items] of Object.entries(categories)) {
    items.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, command] of items) {
      sortedScripts[name] = command;
    }
  }

  packageJson.scripts = sortedScripts;

  // Write back to package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('✅ package.json updated with missing scripts');
} else {
  console.log('ℹ️ No scripts needed to be added');
}