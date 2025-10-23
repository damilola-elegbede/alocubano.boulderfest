#!/usr/bin/env node

/**
 * Smart Build Cache System
 * Tracks changes to critical files and determines if a rebuild is necessary
 *
 * Strategy:
 * - Generate checksums for all critical directories/files
 * - Compare with cached checksums
 * - Skip rebuild if no changes detected
 * - Force rebuild if cache is invalid or missing
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync, statSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Use .vercel/output/cache/ for Vercel builds (guaranteed to be preserved)
// Fallback to .tmp for local builds
const VERCEL_CACHE_DIR = path.join(rootDir, '.vercel', 'output', 'cache');
const LOCAL_CACHE_DIR = path.join(rootDir, '.tmp');
const isVercel = process.env.VERCEL === '1';
const CACHE_DIR = isVercel ? VERCEL_CACHE_DIR : LOCAL_CACHE_DIR;
const CACHE_FILE = path.join(CACHE_DIR, 'build-checksums.json');

/**
 * Directories to track for changes
 */
const TRACKED_DIRS = [
  'migrations',
  'api',
  'lib',
  'docs',
  'js',
  'css',
  'config'
];

/**
 * Files to track for changes
 */
const TRACKED_FILES = [
  'package.json',
  'package-lock.json',
  'vercel.json',
  'config/bootstrap.json'
];

/**
 * Get file metadata for quick change detection
 * Uses size only (mtime is unreliable due to Vercel cache restoration)
 */
function getFileMetadata(filePath) {
  try {
    const stats = statSync(filePath);
    return {
      size: stats.size,
      path: filePath
    };
  } catch (error) {
    return null;
  }
}

/**
 * Generate content-based checksum for a file
 * More reliable than mtime-based hashing, especially after Vercel cache restoration
 */
async function hashFileContent(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (error) {
    return `ERROR:${error.message}`;
  }
}

/**
 * Generate checksum for a file
 * Uses content-based hashing for reliability (critical files are small)
 */
async function hashFile(filePath) {
  try {
    return await hashFileContent(filePath);
  } catch (error) {
    // File doesn't exist or can't be read
    return `ERROR:${error.message}`;
  }
}

/**
 * Generate checksum for a directory (recursive)
 * Uses hybrid strategy: content hashing for reliability with smart batching
 */
async function hashDirectory(dirPath) {
  const hash = crypto.createHash('sha256');

  try {
    const files = await getAllFiles(dirPath);

    // Sort files to ensure consistent ordering
    files.sort();

    // Process files in batches for performance
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (file) => {
          try {
            const relativePath = path.relative(rootDir, file);
            const metadata = getFileMetadata(file);

            if (!metadata) {
              return `MISSING:${relativePath}`;
            }

            // For small files (<10KB), use content hash for accuracy
            // For larger files, use size-based hash to avoid mtime issues
            if (metadata.size < 10 * 1024) {
              const contentHash = await hashFileContent(file);
              return `${relativePath}:content:${contentHash}`;
            } else {
              return `${relativePath}:size:${metadata.size}`;
            }
          } catch (error) {
            return `ERROR:${path.relative(rootDir, file)}:${error.message}`;
          }
        })
      );

      // Add batch results to hash
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          hash.update(result.value);
        } else {
          hash.update(`REJECTED:${result.reason}`);
        }
      }
    }

    return hash.digest('hex');
  } catch (error) {
    return `ERROR:${error.message}`;
  }
}

/**
 * Get all files in a directory recursively
 */
async function getAllFiles(dirPath) {
  const files = [];

  try {
    if (!existsSync(dirPath)) {
      return files;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip node_modules, .git, .tmp, and other build artifacts
      if (entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === '.tmp' ||
          entry.name === '.vercel' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...await getAllFiles(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return files;
}

/**
 * Generate checksums for all tracked resources
 */
export async function generateChecksums() {
  const checksums = {
    timestamp: new Date().toISOString(),
    directories: {},
    files: {}
  };

  console.log('📊 Generating build checksums...');

  // Hash tracked directories
  for (const dir of TRACKED_DIRS) {
    const dirPath = path.join(rootDir, dir);
    if (existsSync(dirPath)) {
      checksums.directories[dir] = await hashDirectory(dirPath);
      console.log(`  ✅ ${dir}/`);
    } else {
      checksums.directories[dir] = 'MISSING';
      console.log(`  ⚠️  ${dir}/ (missing)`);
    }
  }

  // Hash tracked files
  for (const file of TRACKED_FILES) {
    const filePath = path.join(rootDir, file);
    const checksum = await hashFile(filePath);
    checksums.files[file] = checksum;
    const isError = checksum.startsWith('ERROR:') || checksum === 'MISSING';
    console.log(isError ? `  ⚠️  ${file} (error hashing)` : `  ✅ ${file}`);
  }

  return checksums;
}

/**
 * Load cached checksums
 */
export async function loadCachedChecksums() {
  try {
    if (!existsSync(CACHE_FILE)) {
      return null;
    }

    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading cache:', error.message);
    return null;
  }
}

/**
 * Save checksums to cache
 */
export async function saveChecksums(checksums) {
  try {
    // Ensure cache directory exists
    if (!existsSync(CACHE_DIR)) {
      await fs.mkdir(CACHE_DIR, { recursive: true });
    }

    await fs.writeFile(CACHE_FILE, JSON.stringify(checksums, null, 2));
    const cacheLocation = isVercel ? 'Vercel output cache' : 'local cache';
    console.log(`✅ Build cache saved to ${cacheLocation}: ${CACHE_FILE}`);
  } catch (error) {
    console.error('Error saving cache:', error.message);
  }
}

/**
 * Compare two checksum sets and identify changes
 */
export function compareChecksums(cached, current) {
  if (!cached) {
    return {
      hasChanges: true,
      reason: 'No cached checksums found',
      changes: []
    };
  }

  const changes = [];

  // Compare directories
  for (const [dir, checksum] of Object.entries(current.directories)) {
    if (cached.directories[dir] !== checksum) {
      changes.push(`Directory changed: ${dir}/`);
    }
  }

  // Compare files
  for (const [file, checksum] of Object.entries(current.files)) {
    if (cached.files[file] !== checksum) {
      changes.push(`File changed: ${file}`);
    }
  }

  return {
    hasChanges: changes.length > 0,
    reason: changes.length > 0 ? 'Changes detected' : 'No changes',
    changes
  };
}

/**
 * Determine if rebuild is needed
 */
export async function shouldRebuild() {
  console.log('');
  console.log('🔍 Checking build cache...');

  const startTime = Date.now();
  const cachedChecksums = await loadCachedChecksums();
  const currentChecksums = await generateChecksums();
  const cacheCheckDuration = Date.now() - startTime;

  const comparison = compareChecksums(cachedChecksums, currentChecksums);

  // Cache metrics
  const cacheAge = cachedChecksums ?
    Math.round((Date.now() - new Date(cachedChecksums.timestamp).getTime()) / 1000 / 60) :
    null;

  if (comparison.hasChanges) {
    console.log('');
    console.log(`❌ Cache MISS: ${comparison.reason}`);
    console.log(`⏱️  Cache check took ${cacheCheckDuration}ms`);
    if (cacheAge !== null) {
      console.log(`🕐 Cache age: ${cacheAge} minutes`);
    }
    if (comparison.changes.length > 0) {
      console.log('📝 Changes detected:');
      comparison.changes.slice(0, 10).forEach(change => console.log(`   - ${change}`));
      if (comparison.changes.length > 10) {
        console.log(`   ... and ${comparison.changes.length - 10} more changes`);
      }
    }
    console.log('');
  } else {
    console.log('');
    console.log('✅ Cache HIT - no rebuild needed!');
    console.log(`⏱️  Cache check took ${cacheCheckDuration}ms`);
    console.log(`🕐 Cache age: ${cacheAge} minutes`);
    console.log(`💾 Cache location: ${CACHE_FILE}`);
    console.log('⚡ Skipping expensive build operations');
    console.log('');
  }

  return {
    shouldRebuild: comparison.hasChanges,
    reason: comparison.reason,
    changes: comparison.changes,
    currentChecksums,
    cacheMetrics: {
      checkDuration: cacheCheckDuration,
      cacheAge: cacheAge,
      cacheLocation: CACHE_FILE,
      cacheHit: !comparison.hasChanges
    }
  };
}

/**
 * Clear build cache
 */
export async function clearCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      await fs.unlink(CACHE_FILE);
      console.log('🗑️  Build cache cleared');
    }
  } catch (error) {
    console.error('Error clearing cache:', error.message);
  }
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'check') {
    const result = await shouldRebuild();
    process.exit(result.shouldRebuild ? 1 : 0);
  } else if (command === 'clear') {
    await clearCache();
  } else if (command === 'generate') {
    const checksums = await generateChecksums();
    await saveChecksums(checksums);
  } else {
    console.log('Usage:');
    console.log('  node build-cache.js check    - Check if rebuild is needed');
    console.log('  node build-cache.js clear    - Clear build cache');
    console.log('  node build-cache.js generate - Generate and save checksums');
  }
}