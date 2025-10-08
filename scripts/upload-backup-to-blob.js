#!/usr/bin/env node

/**
 * Upload Database Backup to Vercel Blob Storage
 *
 * Uploads a compressed SQL backup file to Vercel Blob Storage with metadata.
 *
 * Usage:
 *   node scripts/upload-backup-to-blob.js <backup-file> <environment>
 *
 * Arguments:
 *   backup-file: Path to the compressed backup file (.sql.gz)
 *   environment: Database environment (prod or dev)
 *
 * Environment Variables:
 *   BLOB_READ_WRITE_TOKEN: Vercel Blob API token (required)
 *
 * Example:
 *   node scripts/upload-backup-to-blob.js backup-prod-2025-01-15.sql.gz prod
 */

import { put } from '@vercel/blob';
import fs from 'fs/promises';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('❌ Error: Missing required arguments');
  console.error('');
  console.error('Usage: node scripts/upload-backup-to-blob.js <backup-file> <environment>');
  console.error('');
  console.error('Arguments:');
  console.error('  backup-file: Path to the compressed backup file (.sql.gz)');
  console.error('  environment: Database environment (prod or dev)');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/upload-backup-to-blob.js backup-prod-2025-01-15.sql.gz prod');
  process.exit(1);
}

const [backupFilePath, environment] = args;

// Validate environment
if (!['prod', 'dev'].includes(environment)) {
  console.error(`❌ Error: Invalid environment "${environment}"`);
  console.error('   Must be either "prod" or "dev"');
  process.exit(1);
}

// Validate environment variable
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('❌ Error: BLOB_READ_WRITE_TOKEN environment variable is required');
  console.error('   Set it in GitHub Secrets or run: vercel env pull .env.vercel');
  process.exit(1);
}

async function uploadBackup() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('☁️  Uploading Backup to Vercel Blob Storage');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Check if backup file exists
    try {
      await fs.access(backupFilePath);
    } catch (error) {
      console.error(`❌ Error: Backup file not found: ${backupFilePath}`);
      process.exit(1);
    }

    // Read backup file
    console.log(`📂 Reading backup file: ${backupFilePath}`);
    const fileBuffer = await fs.readFile(backupFilePath);
    const fileStats = await fs.stat(backupFilePath);

    console.log(`   Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

    // Generate blob path with environment prefix
    const filename = path.basename(backupFilePath);
    const blobPath = `database-backups/${environment}/${filename}`;

    console.log(`☁️  Uploading to Vercel Blob...`);
    console.log(`   Path: ${blobPath}`);
    console.log(`   Environment: ${environment}`);

    // Upload to Vercel Blob
    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false, // Keep exact filename for predictability
    });

    console.log('');
    console.log('✅ Upload successful!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Blob Details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   URL: ${blob.url}`);
    console.log(`   Pathname: ${blob.pathname}`);
    console.log(`   Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Content Type: ${blob.contentType || 'application/gzip'}`);
    console.log(`   Uploaded At: ${blob.uploadedAt}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Return success
    return {
      success: true,
      blob,
    };
  } catch (error) {
    console.error('');
    console.error('❌ Upload failed:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('   - Check that BLOB_READ_WRITE_TOKEN is valid');
    console.error('   - Verify you have sufficient Vercel Blob storage quota');
    console.error('   - Ensure the backup file is not corrupted');
    console.error('   - Check network connectivity');
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

// Run the upload
uploadBackup();
