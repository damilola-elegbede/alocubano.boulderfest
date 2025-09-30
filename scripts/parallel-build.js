#!/usr/bin/env node

/**
 * Parallel Build Script
 * Optimizes build time by running independent tasks in parallel
 *
 * Execution flow:
 * 1. Check build cache to determine if rebuild is needed
 * 2. Run migrations (sequential, required)
 * 3. Run bootstrap + embed-docs in parallel
 * 4. Run structure verification (local only)
 * 5. Save build cache
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { shouldRebuild, saveChecksums } from './build-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const env = process.env.VERCEL_ENV || 'local';
const SKIP_CACHE = process.env.SKIP_BUILD_CACHE === 'true';

console.log('');
console.log('🔨 Build Process');
console.log('================');
console.log('Environment:', env);
console.log('Platform:', isVercel ? 'Vercel' : 'Local');
console.log('');

/**
 * Execute a command and return a promise
 */
function execCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });

    child.on('error', (error) => {
      console.error(`❌ ${label} failed:`, error);
      reject(error);
    });

    child.on('exit', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        console.log(`✅ ${label} completed (${duration}ms)`);
        resolve();
      } else {
        console.error(`❌ ${label} failed with code ${code}`);
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
  });
}

/**
 * Main build process
 */
async function build() {
  try {
    const buildStartTime = Date.now();

    // Step 0: Check build cache (unless forced skip)
    if (!SKIP_CACHE) {
      const cacheResult = await shouldRebuild();

      if (!cacheResult.shouldRebuild) {
        console.log('⚡ Build skipped - no changes detected');
        console.log('💡 To force rebuild, set SKIP_BUILD_CACHE=true');
        console.log('');
        process.exit(0);
      }
    } else {
      console.log('⚠️  Build cache check skipped (SKIP_BUILD_CACHE=true)');
      console.log('');
    }

    // Step 1: Run migrations (sequential, required)
    console.log('📋 Step 1: Running migrations...');
    await execCommand('node', ['scripts/migrate-vercel-build.js'], 'Migrations');

    // Step 2: Run bootstrap and embed-docs in parallel
    console.log('');
    console.log('📋 Step 2: Running parallel tasks...');
    const parallelStartTime = Date.now();

    await Promise.all([
      execCommand('node', ['scripts/bootstrap.js'], 'Bootstrap'),
      execCommand('node', ['scripts/embed-docs.cjs'], 'Embed Documentation')
    ]);

    const parallelDuration = Date.now() - parallelStartTime;
    console.log(`✅ Parallel tasks completed (${parallelDuration}ms)`);

    // Step 3: Vercel optimization message or structure verification
    console.log('');
    if (isVercel) {
      console.log('🏗️  Vercel processing build outputs...');
      console.log('⏳ This may take 2-3 minutes for Vercel optimization');
      console.log('📦 Progress: Bundling serverless functions and static assets');
      console.log('🔧 Progress: Applying Vercel-specific optimizations');
      console.log('🚀 Progress: Preparing deployment package');
    } else {
      console.log('📋 Step 3: Running structure verification...');
      await execCommand('npm', ['run', 'verify-structure'], 'Structure Verification');
    }

    const totalDuration = Date.now() - buildStartTime;
    console.log('');
    console.log(`✅ Build script completed in ${totalDuration}ms`);

    // Step 4: Save build cache for next run
    if (!SKIP_CACHE) {
      console.log('');
      console.log('💾 Saving build cache...');
      const { currentChecksums } = await shouldRebuild();
      await saveChecksums(currentChecksums);
    }

    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Build failed:', error.message);
    console.error('');
    process.exit(1);
  }
}

// Run build
build();