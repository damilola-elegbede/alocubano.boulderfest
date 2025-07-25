#!/usr/bin/env node

// Verify file structure matches Vercel expectations
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('🔍 Verifying File Structure for Vercel Deployment');
console.log('================================================\n');

// Files that should exist for routing to work
const expectedFiles = {
  'Root Files': [
    'index.html',
    'vercel.json',
    '404.html'
  ],
  'Pages Directory': [
    'pages/home.html',
    'pages/about.html',
    'pages/artists.html',
    'pages/donations.html',
    'pages/gallery.html',
    'pages/gallery-2025.html',
    'pages/gallery-test-minimal.html', 
    'pages/schedule.html',
    'pages/tickets.html'
  ],
  'API Directory': [
    'api/debug.js',
    'api/gallery.js',
    'api/featured-photos.js',
    'api/image-proxy/[fileId].js'
  ],
  'Static Assets': [
    'css/base.css',
    'css/typography.css',
    'js/main.js',
    'js/navigation.js',
    'images/logo.png',
    'images/favicons/favicon-32x32.png'
  ]
};

let allGood = true;
let missingFiles = [];
let extraInfo = [];

// Check each category
Object.entries(expectedFiles).forEach(([category, files]) => {
  console.log(`📂 ${category}:`);
  
  files.forEach(file => {
    const filePath = path.join(projectRoot, file);
    const exists = fs.existsSync(filePath);
    
    if (exists) {
      const stats = fs.statSync(filePath);
      const size = Math.round(stats.size / 1024 * 100) / 100; // KB with 2 decimals
      console.log(`  ✅ ${file} (${size} KB)`);
    } else {
      console.log(`  ❌ ${file} - MISSING`);
      allGood = false;
      missingFiles.push(file);
    }
  });
  
  console.log('');
});

// Check vercel.json configuration
console.log('⚙️  Vercel Configuration:');
const vercelJsonPath = path.join(projectRoot, 'vercel.json');
if (fs.existsSync(vercelJsonPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
    console.log('  ✅ vercel.json is valid JSON');
    
    if (config.rewrites && config.rewrites.length > 0) {
      console.log('  ✅ Has rewrite rules:');
      config.rewrites.forEach((rule, index) => {
        console.log(`    ${index + 1}. ${rule.source} -> ${rule.destination}`);
      });
    } else {
      console.log('  ⚠️  No rewrite rules found');
    }
    
    if (config.functions) {
      console.log('  ✅ Has function configurations:');
      Object.entries(config.functions).forEach(([func, settings]) => {
        console.log(`    ${func}: ${JSON.stringify(settings)}`);
      });
    }
    
  } catch (error) {
    console.log(`  ❌ vercel.json has invalid JSON: ${error.message}`);
    allGood = false;
  }
} else {
  console.log('  ❌ vercel.json missing');
  allGood = false;
}
console.log('');

// Check pages directory structure
console.log('📄 Pages Directory Analysis:');
const pagesDir = path.join(projectRoot, 'pages');
if (fs.existsSync(pagesDir)) {
  const pageFiles = fs.readdirSync(pagesDir).filter(file => file.endsWith('.html'));
  console.log(`  Found ${pageFiles.length} HTML pages:`);
  pageFiles.forEach(file => {
    const filePath = path.join(pagesDir, file);
    const stats = fs.statSync(filePath);
    const size = Math.round(stats.size / 1024 * 100) / 100;
    console.log(`    ${file} (${size} KB)`);
  });
} else {
  console.log('  ❌ pages/ directory missing');
  allGood = false;
}
console.log('');

// Check for potential issues
console.log('🚨 Potential Issues:');
const potentialIssues = [];

// Check if there are any .vercelignore exclusions that might be problematic
const vercelIgnorePath = path.join(projectRoot, '.vercelignore');
if (fs.existsSync(vercelIgnorePath)) {
  const ignoreContent = fs.readFileSync(vercelIgnorePath, 'utf8');
  const ignoreLines = ignoreContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  // Check if any critical files are being ignored
  const criticalPatterns = ['pages/', 'index.html', 'api/', 'vercel.json'];
  const problematicIgnores = ignoreLines.filter(line => 
    criticalPatterns.some(pattern => line.includes(pattern))
  );
  
  if (problematicIgnores.length > 0) {
    console.log('  ⚠️  .vercelignore might be excluding critical files:');
    problematicIgnores.forEach(line => console.log(`    - ${line}`));
    potentialIssues.push('Critical files might be ignored during deployment');
  } else {
    console.log('  ✅ .vercelignore looks safe');
  }
} else {
  console.log('  ✅ No .vercelignore file (using defaults)');
}

// Check for case sensitivity issues
const caseIssues = [];
if (process.platform !== 'win32') {
  // Check for files that might have case issues
  const checkCases = ['INDEX.HTML', 'Index.html', 'VERCEL.JSON', 'Vercel.json'];
  checkCases.forEach(file => {
    if (fs.existsSync(path.join(projectRoot, file))) {
      caseIssues.push(file);
    }
  });
}

if (caseIssues.length > 0) {
  console.log('  ⚠️  Case sensitivity issues found:');
  caseIssues.forEach(file => console.log(`    - ${file}`));
  potentialIssues.push('Case sensitivity issues detected');
} else {
  console.log('  ✅ No case sensitivity issues found');
}

console.log('');

// Summary
console.log('📋 Summary:');
console.log('===========');

if (allGood && missingFiles.length === 0) {
  console.log('✅ All critical files present and accounted for!');
  console.log('✅ File structure matches Vercel expectations');
  console.log('');
  console.log('🤔 Since file structure is correct, the 404 issue is likely:');
  console.log('   1. Build process not generating expected files');
  console.log('   2. Deployment environment differences');
  console.log('   3. Vercel configuration interpretation differences');
  console.log('   4. Network/CDN caching issues');
} else {
  console.log('❌ Issues found:');
  if (missingFiles.length > 0) {
    console.log(`   - Missing ${missingFiles.length} files:`, missingFiles.join(', '));
  }
  if (potentialIssues.length > 0) {
    potentialIssues.forEach(issue => console.log(`   - ${issue}`));
  }
}

console.log('');
console.log('🚀 Next Steps:');
console.log('   1. Deploy with debugging enabled');
console.log('   2. Check /api/debug endpoint on live site');
console.log('   3. Monitor Vercel function logs');
console.log('   4. Test each route individually');

// Exit with error code if issues found
process.exit(allGood && missingFiles.length === 0 ? 0 : 1);