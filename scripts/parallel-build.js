#!/usr/bin/env node

/**
 * Parallel Build Script
 * Optimizes build time by running independent tasks in parallel
 *
 * Execution flow:
 * 1. Check build cache to determine if rebuild is needed
 * 2. Run migrations (sequential, required)
 * 3. Run bootstrap + embed-docs in parallel (independent tasks)
 * 4. Run ticket generation (depends on bootstrap.json from step 3)
 * 5. Run structure verification (local only)
 * 6. Save build cache
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';
import path from 'path';
import { shouldRebuild, saveChecksums } from './build-cache.js';
import { saveCacheMetadata, getCacheStats } from './vercel-cache.js';

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
 * Includes timeout handling to prevent hung builds
 */
function execCommand(command, args, label) {
  const TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });

    // Set timeout to prevent hung processes
    const timeout = setTimeout(() => {
      console.error(`⏱️  ${label} timed out after ${TIMEOUT / 1000}s`);
      child.kill('SIGTERM');

      // Give process 5s to cleanup before force killing
      const escalate = setTimeout(() => {
        // Check if process is still running (exitCode and signalCode are null while running)
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill('SIGKILL');
          } catch (error) {
            // Process may have exited between check and kill
            console.error(`⚠️  Failed to send SIGKILL to ${label}:`, error.message);
          }
        }
      }, 5000);

      // Cleanup escalation timer when child exits
      child.once('exit', () => clearTimeout(escalate));

      reject(new Error(`${label} timed out after ${TIMEOUT}ms`));
    }, TIMEOUT);

    child.on('error', (error) => {
      clearTimeout(timeout);
      console.error(`❌ ${label} failed:`, error);
      reject(error);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
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
 * Check if required build artifacts exist
 * These files are gitignored and must be generated during build
 */
function checkRequiredArtifacts() {
  const rootDir = process.cwd();
  const required = [
    'css/bundle-critical.css',
    'css/bundle-deferred.css',
    'css/bundle-admin.css',
    'public/generated/tickets.html'
  ];

  const missing = [];
  for (const file of required) {
    if (!existsSync(path.join(rootDir, file))) {
      missing.push(file);
    }
  }

  return {
    allExist: missing.length === 0,
    missing
  };
}

/**
 * Main build process
 */
async function build() {
  try {
    const buildStartTime = Date.now();

    // Step 0: Check build cache (unless forced skip)
    let cacheResult = null;
    if (!SKIP_CACHE) {
      cacheResult = await shouldRebuild();

      if (!cacheResult.shouldRebuild) {
        // Check if required artifacts exist
        const artifacts = checkRequiredArtifacts();

        if (artifacts.allExist) {
          // Safe to skip - all artifacts present
          console.log('✅ Cache HIT + all artifacts present');
          console.log('⚡ Build skipped - no changes detected');
          console.log('💡 To force rebuild, set SKIP_BUILD_CACHE=true');
          console.log('');
          process.exit(0);
        } else {
          // Not safe to skip - missing artifacts
          console.log('✅ Cache HIT but missing artifacts:', artifacts.missing.join(', '));
          console.log('🔧 Force full build to regenerate artifacts');
          console.log('');
          // Continue with full build
        }
      }
    } else {
      console.log('⚠️  Build cache check skipped (SKIP_BUILD_CACHE=true)');
      console.log('');
    }

    // Step 1: Run migrations (sequential, required)
    console.log('📋 Step 1: Running migrations...');
    await execCommand('node', ['scripts/migrate-vercel-build.js'], 'Migrations');

    // Step 2: Run bootstrap, embed-docs, and CSS bundling in parallel (independent tasks)
    console.log('');
    console.log('📋 Step 2: Running parallel tasks (bootstrap + documentation + CSS)...');
    const parallelStartTime = Date.now();

    // Use Promise.allSettled for better error handling - captures all results even if some fail
    const results = await Promise.allSettled([
      execCommand('node', ['scripts/bootstrap.js'], 'Bootstrap'),
      execCommand('node', ['scripts/embed-docs.cjs'], 'Embed Documentation'),
      execCommand('node', ['scripts/bundle-css.js'], 'CSS Bundling')
    ]);

    // Check if any tasks failed
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error('');
      console.error('❌ Some parallel tasks failed:');
      failures.forEach((failure, index) => {
        const taskNames = ['Bootstrap', 'Embed Documentation', 'CSS Bundling'];
        console.error(`   - ${taskNames[results.findIndex(r => r === failure)]}: ${failure.reason.message}`);
      });
      throw new Error(`${failures.length} parallel task(s) failed`);
    }

    const parallelDuration = Date.now() - parallelStartTime;
    console.log(`✅ Parallel tasks completed (${parallelDuration}ms)`);

    // Step 3: Run ticket generation (depends on bootstrap.json from Step 2)
    console.log('');
    console.log('📋 Step 3: Running ticket generation...');
    await execCommand('node', ['scripts/generate-ticket-html.js'], 'Ticket Generation');

    // Step 4: Vercel optimization message or structure verification
    console.log('');
    if (isVercel) {
      console.log('🏗️  Vercel processing build outputs...');
      console.log('⏳ This may take 2-3 minutes for Vercel optimization');
      console.log('📦 Progress: Bundling serverless functions and static assets');
      console.log('🔧 Progress: Applying Vercel-specific optimizations');
      console.log('🚀 Progress: Preparing deployment package');
    } else {
      console.log('📋 Step 4: Running structure verification...');
      await execCommand('npm', ['run', 'verify-structure'], 'Structure Verification');
    }

    const totalDuration = Date.now() - buildStartTime;
    console.log('');
    console.log(`✅ Build script completed in ${totalDuration}ms`);

    // Step 5: Save build cache for next run
    if (!SKIP_CACHE) {
      console.log('');
      console.log('💾 Saving build cache...');

      // Reuse checksums from earlier if available, otherwise regenerate
      const checksums = cacheResult?.currentChecksums || (await shouldRebuild()).currentChecksums;
      await saveChecksums(checksums);

      // Save Vercel output cache metadata
      await saveCacheMetadata({
        buildDuration: totalDuration,
        environment: env,
        platform: isVercel ? 'Vercel' : 'Local',
        completedSteps: ['migrations', 'bootstrap', 'embed-docs', 'css-bundling', 'ticket-generation']
      });

      // Display cache statistics
      if (isVercel) {
        const cacheStats = await getCacheStats();
        console.log(`📊 Cache stats: ${cacheStats.files.length} files, ${Math.round(cacheStats.totalSize / 1024)} KB`);
      }
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
