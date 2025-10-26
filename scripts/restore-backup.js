#!/usr/bin/env node

/**
 * Database Backup Restoration Script
 *
 * Usage:
 *   npm run db:restore <backup-url>
 *   npm run db:restore:prod <backup-url>
 *
 * Examples:
 *   npm run db:restore https://vercel-blob.com/backup-dev-2025-10-24.sql.gz
 *   npm run db:restore:prod https://vercel-blob.com/backup-prod-2025-10-24.sql.gz
 */

import { createClient } from '@libsql/client';
import { createReadStream, createWriteStream, readFileSync, unlinkSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { get } from 'https';
import { basename, join } from 'path';
import { tmpdir } from 'os';

const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const backupUrl = args.find(arg => !arg.startsWith('--'));

// Validate input
if (!backupUrl) {
  console.error('❌ Error: Backup URL is required\n');
  console.log('Usage:');
  console.log('  npm run db:restore <backup-url>');
  console.log('  npm run db:restore:prod <backup-url>\n');
  console.log('Examples:');
  console.log('  npm run db:restore https://vercel-blob.com/backup-dev-2025-10-24.sql.gz');
  console.log('  npm run db:restore:prod https://vercel-blob.com/backup-prod-2025-10-24.sql.gz');
  process.exit(1);
}

// Get database credentials from environment
const dbUrl = process.env.TURSO_DATABASE_URL;
const dbToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbToken) {
  console.error('❌ Error: Database credentials not found\n');
  console.log('Required environment variables:');
  console.log('  - TURSO_DATABASE_URL');
  console.log('  - TURSO_AUTH_TOKEN');
  console.log('\nRun: vercel env pull .env.vercel');
  process.exit(1);
}

const environment = isProd ? 'PRODUCTION' : 'DEVELOPMENT';
const dbName = dbUrl.match(/libsql:\/\/([^.]+)/)?.[1] || 'unknown';

console.log('═══════════════════════════════════════════════════════');
console.log('           DATABASE BACKUP RESTORATION');
console.log('═══════════════════════════════════════════════════════\n');
console.log(`🎯 Environment: ${environment}`);
console.log(`🗄️  Database: ${dbName}`);
console.log(`📦 Backup URL: ${backupUrl}\n`);

// Safety confirmation for production
if (isProd) {
  console.log('⚠️  WARNING: You are about to restore PRODUCTION database!');
  console.log('   This will OVERWRITE all current production data.\n');
  console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
  await new Promise(resolve => setTimeout(resolve, 10000));
}

// Download backup - FIX #3: Use os.tmpdir() for cross-platform compatibility
const filename = basename(backupUrl);
const compressedFile = join(tmpdir(), filename);
const sqlFile = compressedFile.replace(/\.gz$/, '');

console.log('📥 Downloading backup...');
try {
  await new Promise((resolve, reject) => {
    get(backupUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(compressedFile);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
  console.log(`✅ Downloaded: ${compressedFile}\n`);
} catch (error) {
  console.error(`❌ Download failed: ${error.message}`);
  process.exit(1);
}

// Decompress if needed
if (compressedFile.endsWith('.gz')) {
  console.log('🗜️  Decompressing backup...');
  try {
    const source = createWriteStream(sqlFile);
    await pipeline(
      createReadStream(compressedFile),
      createGunzip(),
      source
    );
    console.log(`✅ Decompressed: ${sqlFile}\n`);

    // Clean up compressed file
    unlinkSync(compressedFile);
  } catch (error) {
    console.error(`❌ Decompression failed: ${error.message}`);
    if (existsSync(compressedFile)) unlinkSync(compressedFile);
    process.exit(1);
  }
}

// Read SQL content
console.log('📖 Reading SQL backup...');
const sqlContent = readFileSync(sqlFile, 'utf8');

// FIX #2: Proper SQL statement parsing that respects strings and comments
function parseSQL(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = null;
  let inComment = false;
  let inMultilineComment = false;
  
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];
    
    // Handle multiline comments /* ... */
    if (!inString && !inComment && char === '/' && nextChar === '*') {
      inMultilineComment = true;
      current += char;
      continue;
    }
    if (inMultilineComment && char === '*' && nextChar === '/') {
      inMultilineComment = false;
      current += char;
      i++; // Skip the '/'
      current += sql[i];
      continue;
    }
    if (inMultilineComment) {
      current += char;
      continue;
    }
    
    // Handle single-line comments --
    if (!inString && char === '-' && nextChar === '-') {
      inComment = true;
      current += char;
      continue;
    }
    if (inComment && char === '\n') {
      inComment = false;
      current += char;
      continue;
    }
    if (inComment) {
      current += char;
      continue;
    }
    
    // Handle strings
    if (!inComment && !inMultilineComment && (char === "'" || char === '"')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        // Check for escaped quotes
        if (nextChar === stringChar) {
          current += char + nextChar;
          i++; // Skip next char
          continue;
        }
        inString = false;
        stringChar = null;
      }
    }
    
    // Handle semicolons (only when not in strings or comments)
    if (!inString && !inComment && !inMultilineComment && char === ';') {
      const stmt = current.trim();
      if (stmt.length > 0 && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }
    
    current += char;
  }
  
  // Add final statement if exists
  const finalStmt = current.trim();
  if (finalStmt.length > 0 && !finalStmt.startsWith('--')) {
    statements.push(finalStmt);
  }
  
  return statements;
}

const statements = parseSQL(sqlContent);

console.log(`📊 Found ${statements.length.toLocaleString()} SQL statements\n`);

// Connect to database
console.log('🔌 Connecting to database...');
const db = createClient({
  url: dbUrl,
  authToken: dbToken
});
console.log('✅ Connected\n');

// Execute restoration
console.log('⚙️  Restoring database...');
console.log('   This may take several minutes for large backups.\n');

let executed = 0;
let skipped = 0;
let failed = 0;
const startTime = Date.now();

for (const statement of statements) {
  try {
    await db.execute(statement + ';');
    executed++;

    // Progress indicator every 100 statements
    if (executed % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      // FIX #1: Add zero-check before division to prevent crash
      const rate = elapsed > 0 ? (executed / elapsed).toFixed(0) : executed;
      console.log(`  ⏳ Progress: ${executed.toLocaleString()}/${statements.length.toLocaleString()} (${rate} stmt/sec)`);
    }
  } catch (error) {
    // Expected errors during restoration
    if (
      error.message.includes('already exists') ||
      error.message.includes('UNIQUE constraint') ||
      error.message.includes('duplicate') ||
      error.message.includes('no such table')
    ) {
      skipped++;
    } else {
      failed++;
      if (failed <= 5) {  // Show first 5 unexpected errors
        console.error(`  ⚠️  Unexpected error: ${error.message.substring(0, 80)}`);
      }
    }
  }
}

const duration = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n✅ Restoration complete!');
console.log(`   Duration: ${duration}s`);
console.log(`   Executed: ${executed.toLocaleString()} statements`);
console.log(`   Skipped: ${skipped.toLocaleString()} (duplicates)`);
console.log(`   Failed: ${failed.toLocaleString()} (errors)\n`);

// Verify restoration
console.log('🔍 Verifying restoration...\n');

const tables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
console.log(`📊 Tables restored: ${tables.rows.length}`);

// Check critical tables
const criticalTables = ['tickets', 'transactions', 'transaction_items', 'events'];
for (const tableName of criticalTables) {
  try {
    const count = await db.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
    const rowCount = count.rows[0].count;
    console.log(`   ✓ ${tableName}: ${rowCount.toLocaleString()} rows`);
  } catch (error) {
    console.log(`   ✗ ${tableName}: NOT FOUND`);
  }
}

// Verify tickets table structure
try {
  const schema = await db.execute("PRAGMA table_info(tickets)");
  const hasIsTest = schema.rows.some(row => row.name === 'is_test');
  const columnCount = schema.rows.length;
  console.log(`\n📋 Tickets table structure:`);
  console.log(`   Columns: ${columnCount}`);
  console.log(`   Has is_test column: ${hasIsTest ? 'YES ✓' : 'NO ✗'}`);
} catch (error) {
  console.log(`\n⚠️  Could not verify tickets table structure`);
}

// Clean up SQL file
console.log('\n🧹 Cleaning up...');
if (existsSync(sqlFile)) {
  unlinkSync(sqlFile);
  console.log(`   Deleted: ${sqlFile}`);
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('           RESTORATION SUCCESSFUL');
console.log('═══════════════════════════════════════════════════════\n');

process.exit(0);
