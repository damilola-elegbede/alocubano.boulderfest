#!/usr/bin/env node
/**
 * Gallery Image Sync Script
 * Downloads images from Google Drive, processes them with Sharp,
 * and uploads optimized variants to Vercel Blob storage.
 *
 * Features:
 * - Smart delta detection (only sync changed/new images)
 * - Multi-format generation (AVIF, WebP)
 * - Multiple sizes (thumbnail 400px, full 1920px)
 * - Persistent manifest cache
 * - Progress tracking and reporting
 *
 * Usage:
 *   npm run sync-gallery              # Sync all images
 *   npm run sync-gallery -- --event=boulder-fest-2025  # Specific event
 *   npm run sync-gallery -- --force   # Force re-sync all
 */

// Load environment variables from .env.local for local development
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { uploadImage, listImages, validateToken, getStorageStats } from './utils/blob-client.js';
import { processImage, validateImage } from './utils/image-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MANIFEST_PATH = path.join(__dirname, '../.gallery-sync-cache.json');
const GOOGLE_DRIVE_FOLDER_ID =
  process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;

// Parse CLI arguments
const args = process.argv.slice(2);
const forceSync = args.includes('--force');
const dryRun = args.includes('--dry-run');
const eventFilter = args.find(arg => arg.startsWith('--event='))?.split('=')[1];

/**
 * Main sync orchestration
 */
async function main() {
  console.log('🚀 Gallery Image Sync Started\n');

  // Validate environment
  if (!validateEnvironment()) {
    process.exit(1);
  }

  try {
    // Load existing manifest
    const manifest = loadManifest();
    console.log(`📦 Loaded manifest: ${Object.keys(manifest.files).length} files tracked\n`);

    // Initialize Google Drive
    const drive = await initializeGoogleDrive();

    // Fetch file list from Google Drive
    console.log('📥 Fetching file list from Google Drive...');
    const driveFiles = await fetchGalleryFiles(drive, eventFilter);
    console.log(`✓ Found ${driveFiles.length} files in Google Drive\n`);

    // Determine what needs syncing (delta detection)
    const syncPlan = determineSyncPlan(driveFiles, manifest, forceSync);
    console.log(`📊 Sync Plan:`);
    console.log(`   - Total files: ${driveFiles.length}`);
    console.log(`   - Already synced: ${syncPlan.skip.length}`);
    console.log(`   - New files: ${syncPlan.new.length}`);
    console.log(`   - Changed files: ${syncPlan.changed.length}`);
    console.log(`   - To sync: ${syncPlan.toSync.length}\n`);

    if (syncPlan.toSync.length === 0) {
      console.log('✅ Everything is up to date! No sync needed.');
      return;
    }

    if (dryRun) {
      console.log('🔍 Dry run mode - would sync:');
      syncPlan.toSync.forEach(file => {
        console.log(`   - ${file.name} (${file.id})`);
      });
      return;
    }

    // Sync images
    console.log('🔄 Starting sync...\n');
    const results = await syncImages(drive, syncPlan.toSync, manifest);

    // Update manifest
    manifest.lastSync = new Date().toISOString();
    saveManifest(manifest);

    // Print summary
    printSummary(results, syncPlan);

    // Print storage stats
    console.log('\n📊 Vercel Blob Storage Stats:');
    const stats = await getStorageStats();
    if (stats) {
      console.log(`   - Total files: ${stats.totalFiles}`);
      console.log(`   - Total size: ${stats.totalSizeMB} MB`);
      console.log(`   - Thumbnails: ${stats.bySize.thumbMB} MB`);
      console.log(`   - Full images: ${stats.bySize.fullMB} MB`);
      console.log(`   - By format:`, stats.byFormat);
    }

    console.log('\n✅ Sync completed successfully!');

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Validate environment and prerequisites
 */
function validateEnvironment() {
  const errors = [];

  if (!validateToken()) {
    errors.push('Missing BLOB_READ_WRITE_TOKEN');
  }

  if (!GOOGLE_DRIVE_FOLDER_ID) {
    errors.push('Missing GOOGLE_DRIVE_GALLERY_FOLDER_ID (or legacy GOOGLE_DRIVE_FOLDER_ID) environment variable');
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    errors.push('Missing Google Drive service account credentials');
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(err => console.error(`   - ${err}`));
    return false;
  }

  return true;
}

/**
 * Initialize Google Drive API client
 */
async function initializeGoogleDrive() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * Fetch all gallery images from Google Drive folder hierarchy
 * Navigates: root folder → event folder → category folders → images
 * Matches the logic in lib/google-drive-service.js for consistency
 */
async function fetchGalleryFiles(drive, eventFilter = null) {
  // Determine target event folder (default to current year)
  const year = new Date().getFullYear();
  const targetFolder = eventFilter || `boulder-fest-${year}`;

  console.log(`📂 Searching for event folder: "${targetFolder}"`);

  // Step 1: Find event folder within root gallery folder
  const eventFolders = await drive.files.list({
    q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolder}' and trashed = false`,
    fields: 'files(id, name)',
  });

  if (!eventFolders.data.files || eventFolders.data.files.length === 0) {
    console.warn(`⚠️  No event folder found: "${targetFolder}"`);
    console.warn(`   Searched in root folder: ${GOOGLE_DRIVE_FOLDER_ID}`);
    console.warn(`   Make sure the folder exists and is named exactly "${targetFolder}"`);
    return [];
  }

  const eventFolder = eventFolders.data.files[0];
  const eventFolderId = eventFolder.id;
  console.log(`✅ Found event folder: "${eventFolder.name}" (${eventFolderId})`);

  // Step 2: Get category folders within the event folder
  const categoryFolders = await drive.files.list({
    q: `'${eventFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    orderBy: 'name',
  });

  if (!categoryFolders.data.files || categoryFolders.data.files.length === 0) {
    console.warn(`⚠️  No category folders found in "${eventFolder.name}"`);
    console.warn(`   Expected folders like: workshops, socials, performances`);
    return [];
  }

  console.log(`📁 Found ${categoryFolders.data.files.length} category folders`);

  // Step 3: Fetch images from all category folders with pagination
  const allFiles = [];
  for (const folder of categoryFolders.data.files) {
    console.log(`   Scanning: ${folder.name}`);

    // Implement pagination to handle folders with >1000 images
    let pageToken = null;
    let folderFileCount = 0;
    
    do {
      const filesResponse = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, thumbnailLink, imageMediaMetadata)',
        pageSize: 1000,
        orderBy: 'createdTime desc',
        pageToken: pageToken || undefined
      });

      const files = filesResponse.data.files || [];
      allFiles.push(...files);
      folderFileCount += files.length;
      
      pageToken = filesResponse.data.nextPageToken;
      
      if (pageToken) {
        console.log(`      Found ${files.length} images (fetching more...)`);
      }
    } while (pageToken);
    
    console.log(`      Found ${folderFileCount} images total`);
  }

  return allFiles;
}

/**
 * Determine what files need syncing (smart delta detection)
 */
function determineSyncPlan(driveFiles, manifest, forceSync) {
  const plan = {
    skip: [],
    new: [],
    changed: [],
    toSync: []
  };

  for (const file of driveFiles) {
    const cached = manifest.files[file.id];

    if (forceSync) {
      plan.toSync.push(file);
      continue;
    }

    if (!cached) {
      // New file
      plan.new.push(file);
      plan.toSync.push(file);
    } else if (cached.googleModified !== file.modifiedTime) {
      // File changed
      plan.changed.push(file);
      plan.toSync.push(file);
    } else if (!cached.synced || !cached.blobUrls?.thumb_avif || !cached.blobUrls?.full_avif) {
      // Incomplete sync
      plan.changed.push(file);
      plan.toSync.push(file);
    } else {
      // Already synced and unchanged
      plan.skip.push(file);
    }
  }

  return plan;
}

/**
 * Sync images to Vercel Blob
 */
async function syncImages(drive, files, manifest) {
  const results = {
    success: [],
    failed: [],
    totalBytesProcessed: 0,
    totalBytesSaved: 0
  };

  let processed = 0;

  for (const file of files) {
    processed++;
    console.log(`[${processed}/${files.length}] Processing: ${file.name}`);

    try {
      // Download from Google Drive
      const response = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      const originalBuffer = Buffer.from(response.data);

      // Validate image
      if (!await validateImage(originalBuffer)) {
        console.log(`   ⚠️  Skipped: Invalid image format`);
        results.failed.push({ file: file.name, error: 'Invalid image format' });
        continue;
      }

      // Process image into variants
      console.log(`   🔄 Processing variants...`);
      const variants = await processImage(originalBuffer);

      // Upload to Vercel Blob
      const blobUrls = {};
      let totalSize = 0;

      // Upload thumbnails
      if (variants.thumbnail) {
        for (const [format, data] of Object.entries(variants.thumbnail)) {
          const path = `gallery/${file.id}/thumb.${format}`;
          const result = await uploadImage(path, data.buffer);
          blobUrls[`thumb_${format}`] = result.url;
          totalSize += data.size;
          console.log(`   ✓ Uploaded ${format} thumbnail (${(data.size / 1024).toFixed(1)}KB, ${data.compression}% compression)`);
        }
      }

      // Upload full-size variants
      if (variants.full) {
        for (const [format, data] of Object.entries(variants.full)) {
          const path = `gallery/${file.id}/full.${format}`;
          const result = await uploadImage(path, data.buffer);
          blobUrls[`full_${format}`] = result.url;
          totalSize += data.size;
          console.log(`   ✓ Uploaded ${format} full (${(data.size / 1024).toFixed(1)}KB, ${data.compression}% compression)`);
        }
      }

      // Update manifest
      manifest.files[file.id] = {
        name: file.name,
        googleModified: file.modifiedTime,
        blobUrls,
        metadata: variants.metadata,
        synced: true,
        syncedAt: new Date().toISOString(),
        originalSize: originalBuffer.length,
        optimizedSize: totalSize,
        savings: ((1 - (totalSize / originalBuffer.length)) * 100).toFixed(1)
      };

      results.success.push(file.name);
      results.totalBytesProcessed += originalBuffer.length;
      results.totalBytesSaved += (originalBuffer.length - totalSize);

      console.log(`   ✅ Completed (saved ${manifest.files[file.id].savings}%)\n`);

    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
      results.failed.push({ file: file.name, error: error.message });
    }
  }

  return results;
}

/**
 * Load manifest from disk
 */
function loadManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch (error) {
      console.warn('⚠️  Failed to parse manifest, starting fresh');
    }
  }

  return {
    version: '1.0',
    lastSync: null,
    files: {}
  };
}

/**
 * Save manifest to disk
 */
function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n💾 Manifest saved: ${Object.keys(manifest.files).length} files tracked`);
}

/**
 * Print sync summary
 */
function printSummary(results, syncPlan) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 SYNC SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully synced: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏭️  Skipped (up to date): ${syncPlan.skip.length}`);
  console.log(`\n💾 Bandwidth saved: ${(results.totalBytesSaved / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📦 Total processed: ${(results.totalBytesProcessed / 1024 / 1024).toFixed(2)} MB`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed files:');
    results.failed.forEach(f => console.log(`   - ${f.file}: ${f.error}`));
  }
}

// Run the sync
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
