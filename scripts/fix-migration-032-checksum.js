#!/usr/bin/env node
/**
 * Fix Migration 032 Checksum
 *
 * This script updates the checksum for migration 032 in the database
 * to match the current file content. This is needed because migration 037
 * was renamed to 032, but the database checksum wasn't updated.
 *
 * IMPORTANT: This should only be run once to fix the checksum mismatch.
 * After running this script, future deployments will pass checksum verification.
 */

import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { createClient } from '@libsql/client';
import { config } from 'dotenv';

// Load environment variables from Vercel cache
config({ path: '.vercel/.env.local.cache' });

const MIGRATION_FILE = '032_scan_tracking_enhancements.sql';

// Environment check
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌ Missing database credentials');
  console.error('   Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
  process.exit(1);
}

async function generateChecksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function fixChecksum() {
  console.log('🔧 Fixing migration 032 checksum...\n');

  // Read current file content
  const filePath = `./migrations/${MIGRATION_FILE}`;
  const content = await readFile(filePath, 'utf8');
  const newChecksum = await generateChecksum(content);

  console.log(`📄 File: ${MIGRATION_FILE}`);
  console.log(`🔐 New checksum: ${newChecksum.substring(0, 16)}...\n`);

  // Connect to database
  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN,
  });

  try {
    // Check current checksum in database
    const result = await client.execute(
      'SELECT checksum FROM migrations WHERE filename = ?',
      [MIGRATION_FILE]
    );

    if (result.rows.length === 0) {
      console.error(`❌ Migration ${MIGRATION_FILE} not found in database`);
      console.error('   This migration may not have been executed yet.');
      process.exit(1);
    }

    const oldChecksum = result.rows[0].checksum;
    console.log(`📊 Current database checksum: ${oldChecksum?.substring(0, 16) || 'null'}...`);

    if (oldChecksum === newChecksum) {
      console.log('✅ Checksums already match - no update needed');
      return;
    }

    // Update checksum
    await client.execute(
      'UPDATE migrations SET checksum = ? WHERE filename = ?',
      [newChecksum, MIGRATION_FILE]
    );

    // Verify update
    const verifyResult = await client.execute(
      'SELECT checksum FROM migrations WHERE filename = ?',
      [MIGRATION_FILE]
    );

    const updatedChecksum = verifyResult.rows[0].checksum;

    if (updatedChecksum === newChecksum) {
      console.log('\n✅ Checksum updated successfully!');
      console.log('   Migration 032 will now pass verification.');
    } else {
      console.error('\n❌ Checksum update verification failed');
      console.error(`   Expected: ${newChecksum.substring(0, 16)}...`);
      console.error(`   Got: ${updatedChecksum?.substring(0, 16) || 'null'}...`);
      process.exit(1);
    }

  } finally {
    client.close();
  }
}

fixChecksum().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
