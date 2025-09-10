#!/usr/bin/env node

/**
 * Build Admin Files Script
 * Copies admin HTML files from pages/admin/ to admin/ for Vercel routing compatibility
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SOURCE_DIR = path.join(projectRoot, 'pages', 'admin');
const TARGET_DIR = path.join(projectRoot, 'admin');

const ADMIN_FILES = [
  'login.html',
  'dashboard.html',
  'analytics.html',
  'reset-password.html',
  'checkin.html',
  'reports.html',
  'backup.html',
  'security.html'
];

async function ensureDirectoryExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function copyAdminFiles() {
  console.log('📁 Building admin files for Vercel deployment...');
  
  // Ensure target directory exists
  await ensureDirectoryExists(TARGET_DIR);
  
  let copiedCount = 0;
  let skippedCount = 0;
  
  for (const file of ADMIN_FILES) {
    const sourcePath = path.join(SOURCE_DIR, file);
    const targetPath = path.join(TARGET_DIR, file);
    
    try {
      // Check if source file exists
      await fs.access(sourcePath);
      
      // Copy the file
      await fs.copyFile(sourcePath, targetPath);
      console.log(`  ✅ Copied: ${file}`);
      copiedCount++;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`  ⚠️  Skipped: ${file} (source not found)`);
        skippedCount++;
      } else {
        console.error(`  ❌ Error copying ${file}:`, error.message);
        throw error;
      }
    }
  }
  
  console.log(`\n✨ Admin files build complete!`);
  console.log(`   📋 Files copied: ${copiedCount}`);
  if (skippedCount > 0) {
    console.log(`   ⚠️  Files skipped: ${skippedCount}`);
  }
  console.log(`   📂 Location: ${TARGET_DIR}`);
}

// Run the build
copyAdminFiles().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});