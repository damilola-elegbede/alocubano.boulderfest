#!/usr/bin/env node

/**
 * Cleanup Old Turso Database Branches (Monthly Snapshots)
 *
 * Deletes Turso database branches older than the retention period.
 * Note: This script requires Turso CLI to be installed and authenticated.
 *
 * Usage:
 *   node scripts/cleanup-old-branches.js [options]
 *
 * Options:
 *   --retention-months <months>  Number of months to retain snapshots (default: 12)
 *   --dry-run                    Show what would be deleted without actually deleting
 *   --help                       Show this help message
 *
 * Environment Variables:
 *   TURSO_PROD_DB_NAME: Production database name (optional, uses GitHub var if available)
 *   TURSO_DEV_DB_NAME: Development database name (optional, uses GitHub var if available)
 *
 * Example:
 *   node scripts/cleanup-old-branches.js --retention-months 12
 *   node scripts/cleanup-old-branches.js --dry-run
 *
 * Note: This functionality is automatically handled by the monthly snapshot workflow.
 *       This script is provided for manual cleanup operations if needed.
 */

import { execSync } from 'child_process';

// Parse command line arguments
const args = process.argv.slice(2);
let retentionMonths = 12;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--retention-months' && args[i + 1]) {
    retentionMonths = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  } else if (args[i] === '--help') {
    console.log('Cleanup Old Turso Database Branches (Monthly Snapshots)');
    console.log('');
    console.log('Usage: node scripts/cleanup-old-branches.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --retention-months <months>  Number of months to retain snapshots (default: 12)');
    console.log('  --dry-run                    Show what would be deleted without actually deleting');
    console.log('  --help                       Show this help message');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/cleanup-old-branches.js --retention-months 12');
    console.log('  node scripts/cleanup-old-branches.js --dry-run');
    console.log('');
    console.log('Note: Requires Turso CLI to be installed and authenticated');
    process.exit(0);
  }
}

// Validate retention months
if (isNaN(retentionMonths) || retentionMonths < 1) {
  console.error('❌ Error: Invalid retention-months value. Must be a positive number.');
  process.exit(1);
}

// Database names - try to get from environment or use defaults
const PROD_DB = process.env.TURSO_PROD_DB_NAME || 'alocubano-boulderfest-prod';
const DEV_DB = process.env.TURSO_DEV_DB_NAME || 'alocubano-boulderfest-dev';

function runCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
    return '';
  }
}

function getCutoffDate(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 7); // Format: YYYY-MM
}

async function cleanupOldBranches() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧹 Cleaning Up Old Database Branches');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`📅 Retention Period: ${retentionMonths} months`);
  console.log(`🔍 Dry Run: ${dryRun ? 'Yes' : 'No'}`);
  console.log(`📊 Production DB: ${PROD_DB}`);
  console.log(`📊 Development DB: ${DEV_DB}`);
  console.log('');

  // Check if Turso CLI is installed
  try {
    runCommand('turso --version', { silent: true });
  } catch (error) {
    console.error('❌ Error: Turso CLI is not installed');
    console.error('');
    console.error('Install with: curl -sSfL https://get.tur.so/install.sh | bash');
    console.error('');
    process.exit(1);
  }

  // Check if authenticated
  try {
    runCommand('turso db list', { silent: true });
  } catch (error) {
    console.error('❌ Error: Turso CLI is not authenticated');
    console.error('');
    console.error('Authenticate with: turso auth login');
    console.error('');
    process.exit(1);
  }

  // Calculate cutoff date
  const cutoffDate = getCutoffDate(retentionMonths);
  console.log(`🗓️  Cutoff Date: ${cutoffDate}`);
  console.log(`   Snapshots before this date will be deleted`);
  console.log('');

  // Get all databases
  console.log('📂 Listing Turso databases...');
  const dbListOutput = runCommand('turso db list', { silent: true });
  const lines = dbListOutput.split('\n').filter((line) => line.trim());

  // Skip header line
  const databases = lines
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((db) => db);

  console.log(`   Found ${databases.length} database(s)`);
  console.log('');

  // Filter for snapshots
  const snapshotRegex = /^(.*)-(\d{4}-\d{2})$/;
  const branchesToDelete = [];
  const branchesToKeep = [];

  for (const db of databases) {
    const match = db.match(snapshotRegex);
    if (!match) continue;

    const [, baseName, snapshotDate] = match;

    // Check if this is a snapshot of our databases
    if (baseName !== PROD_DB && baseName !== DEV_DB) continue;

    if (snapshotDate < cutoffDate) {
      branchesToDelete.push({ name: db, date: snapshotDate, base: baseName });
    } else {
      branchesToKeep.push({ name: db, date: snapshotDate, base: baseName });
    }
  }

  // Display branches to delete
  if (branchesToDelete.length > 0) {
    console.log('🗑️  Branches to Delete:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const branch of branchesToDelete) {
      console.log(`   📸 ${branch.name}`);
      console.log(`      Base: ${branch.base}`);
      console.log(`      Date: ${branch.date}`);
      console.log('');
    }
  } else {
    console.log('ℹ️  No old branches found to delete');
    console.log('');
  }

  // Display branches to keep
  if (branchesToKeep.length > 0) {
    console.log('✅ Branches to Keep:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const branch of branchesToKeep) {
      console.log(`   📸 ${branch.name}`);
      console.log(`      Base: ${branch.base}`);
      console.log(`      Date: ${branch.date}`);
      console.log('');
    }
  }

  // Perform deletion
  let deletedCount = 0;
  if (branchesToDelete.length > 0 && !dryRun) {
    console.log('🗑️  Deleting old branches...');
    console.log('');

    for (const branch of branchesToDelete) {
      try {
        console.log(`   Deleting: ${branch.name}...`);
        runCommand(`turso db destroy ${branch.name} --yes`, { silent: true });
        console.log(`   ✅ Deleted: ${branch.name}`);
        deletedCount++;
      } catch (error) {
        console.error(`   ❌ Failed to delete: ${branch.name}`);
        console.error(`      Error: ${error.message}`);
      }
    }
    console.log('');
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Cleanup Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Total Snapshots Found: ${branchesToDelete.length + branchesToKeep.length}`);
  console.log(`   Branches to Delete: ${branchesToDelete.length}`);
  console.log(`   Branches to Keep: ${branchesToKeep.length}`);

  if (dryRun) {
    console.log('');
    console.log('🔍 DRY RUN: No branches were actually deleted');
    console.log('   Run without --dry-run to perform deletion');
  } else if (deletedCount > 0) {
    console.log('');
    console.log(`✅ Cleanup completed: ${deletedCount} branch(es) deleted`);
  } else if (branchesToDelete.length === 0) {
    console.log('');
    console.log('ℹ️  No branches needed to be deleted');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Run cleanup
cleanupOldBranches().catch((error) => {
  console.error('');
  console.error('❌ Cleanup failed:', error.message);
  console.error('');
  process.exit(1);
});
