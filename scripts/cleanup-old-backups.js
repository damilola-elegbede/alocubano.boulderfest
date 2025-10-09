#!/usr/bin/env node

/**
 * Cleanup Old Database Backups from Vercel Blob Storage
 *
 * Deletes backups older than the specified retention period to manage storage costs.
 *
 * Usage:
 *   node scripts/cleanup-old-backups.js [options]
 *
 * Options:
 *   --retention-days <days>  Number of days to retain backups (default: 30)
 *   --dry-run                Show what would be deleted without actually deleting
 *   --help                   Show this help message
 *
 * Environment Variables:
 *   BLOB_READ_WRITE_TOKEN: Vercel Blob API token (required)
 *
 * Example:
 *   node scripts/cleanup-old-backups.js --retention-days 30
 *   node scripts/cleanup-old-backups.js --dry-run
 */

import { list, del } from '@vercel/blob';

// Parse command line arguments
const args = process.argv.slice(2);
let retentionDays = 30;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--retention-days' && args[i + 1]) {
    retentionDays = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  } else if (args[i] === '--help') {
    console.log('Cleanup Old Database Backups from Vercel Blob Storage');
    console.log('');
    console.log('Usage: node scripts/cleanup-old-backups.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --retention-days <days>  Number of days to retain backups (default: 30)');
    console.log('  --dry-run                Show what would be deleted without actually deleting');
    console.log('  --help                   Show this help message');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/cleanup-old-backups.js --retention-days 30');
    console.log('  node scripts/cleanup-old-backups.js --dry-run');
    process.exit(0);
  }
}

// Validate retention days
if (isNaN(retentionDays) || retentionDays < 1) {
  console.error('❌ Error: Invalid retention-days value. Must be a positive number.');
  process.exit(1);
}

// Validate environment variable
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('❌ Error: BLOB_READ_WRITE_TOKEN environment variable is required');
  console.error('   Set it in GitHub Secrets or run: vercel env pull .env.vercel');
  process.exit(1);
}

async function cleanupOldBackups() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧹 Cleaning Up Old Database Backups');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`📅 Retention Period: ${retentionDays} days`);
    console.log(`🔍 Dry Run: ${dryRun ? 'Yes' : 'No'}`);
    console.log('');

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    console.log(`🗓️  Cutoff Date: ${cutoffDate.toISOString()}`);
    console.log(`   Backups before this date will be deleted`);
    console.log('');

    // List all blobs in the database-backups directory
    console.log('📂 Listing backups from Vercel Blob...');
    const { blobs } = await list({
      prefix: 'database-backups/',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    if (blobs.length === 0) {
      console.log('');
      console.log('ℹ️  No backups found in Vercel Blob Storage');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return {
        success: true,
        totalBackups: 0,
        deletedCount: 0,
        keptCount: 0,
        freedSpace: 0,
      };
    }

    console.log(`   Found ${blobs.length} backup(s)`);
    console.log('');

    // Filter and categorize backups
    const backupsToDelete = [];
    const backupsToKeep = [];
    let totalSize = 0;
    let sizeToFree = 0;

    for (const blob of blobs) {
      totalSize += blob.size;
      const uploadedAt = new Date(blob.uploadedAt);

      if (uploadedAt < cutoffDate) {
        backupsToDelete.push({
          url: blob.url,
          pathname: blob.pathname,
          uploadedAt: blob.uploadedAt,
          size: blob.size,
          age: Math.floor((Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60 * 24)),
        });
        sizeToFree += blob.size;
      } else {
        backupsToKeep.push({
          pathname: blob.pathname,
          uploadedAt: blob.uploadedAt,
          size: blob.size,
          age: Math.floor((Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60 * 24)),
        });
      }
    }

    // Display backups to delete
    if (backupsToDelete.length > 0) {
      console.log('🗑️  Backups to Delete:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      for (const backup of backupsToDelete) {
        console.log(`   📦 ${backup.pathname}`);
        console.log(`      Age: ${backup.age} days`);
        console.log(`      Size: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`      Uploaded: ${backup.uploadedAt}`);
        console.log('');
      }
    }

    // Display backups to keep
    if (backupsToKeep.length > 0) {
      console.log('✅ Backups to Keep:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      for (const backup of backupsToKeep) {
        console.log(`   📦 ${backup.pathname}`);
        console.log(`      Age: ${backup.age} days`);
        console.log(`      Size: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
        console.log('');
      }
    }

    // Perform deletion
    if (backupsToDelete.length > 0 && !dryRun) {
      console.log('🗑️  Deleting old backups...');
      console.log('');

      for (const backup of backupsToDelete) {
        try {
          await del(backup.url, {
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });
          console.log(`   ✅ Deleted: ${backup.pathname}`);
        } catch (error) {
          console.error(`   ❌ Failed to delete: ${backup.pathname}`);
          console.error(`      Error: ${error.message}`);
        }
      }
      console.log('');
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Cleanup Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total Backups: ${blobs.length}`);
    console.log(`   Backups to Delete: ${backupsToDelete.length}`);
    console.log(`   Backups to Keep: ${backupsToKeep.length}`);
    console.log(`   Space to Free: ${(sizeToFree / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total Storage: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    if (dryRun) {
      console.log('');
      console.log('🔍 DRY RUN: No backups were actually deleted');
      console.log('   Run without --dry-run to perform deletion');
    } else if (backupsToDelete.length > 0) {
      console.log('');
      console.log(`✅ Cleanup completed: ${backupsToDelete.length} backup(s) deleted`);
    } else {
      console.log('');
      console.log('ℹ️  No backups needed to be deleted');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
      success: true,
      totalBackups: blobs.length,
      deletedCount: dryRun ? 0 : backupsToDelete.length,
      keptCount: backupsToKeep.length,
      freedSpace: dryRun ? 0 : sizeToFree,
    };
  } catch (error) {
    console.error('');
    console.error('❌ Cleanup failed:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('   - Check that BLOB_READ_WRITE_TOKEN is valid');
    console.error('   - Verify network connectivity');
    console.error('   - Ensure you have permission to delete blobs');
    console.error('');

    // If this is an API error, show more details
    if (error.response) {
      console.error('API Response:', error.response.status, error.response.statusText);
      if (error.response.data) {
        console.error('API Data:', JSON.stringify(error.response.data, null, 2));
      }
    }

    process.exit(1);
  }
}

// Run the cleanup
cleanupOldBackups();
