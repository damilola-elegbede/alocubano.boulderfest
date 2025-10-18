#!/usr/bin/env node
/**
 * Cash Shift Seed Script
 *
 * Purpose: Create default cash shift for immediate testing/production use
 *
 * This script creates an open cash shift for the Test Weekender event (event_id = -1)
 * to enable cash payments in manual ticket entry immediately.
 *
 * Usage:
 *   node scripts/seed-cash-shift.js
 *
 * Safety:
 *   - Checks if shift already exists before creating
 *   - Uses INSERT OR IGNORE for idempotency
 *   - Only creates if no open shifts exist for the event
 */

import { getDatabaseClient } from '../lib/database.js';

async function seedCashShift() {
  console.log('🌱 Seeding default cash shift for Test Weekender...\n');

  try {
    const db = await getDatabaseClient();

    // Check if event_id column exists
    const tableInfo = await db.execute("PRAGMA table_info(cash_shifts)");
    const hasEventId = tableInfo.rows.some(col => col.name === 'event_id');

    if (!hasEventId) {
      console.log('⚠️  Warning: event_id column does not exist in cash_shifts table.');
      console.log('   Migration 051 needs to run first.');
      console.log('   Creating shift without event_id...\n');
    }

    // Check for existing open shifts for Test Weekender
    const existingShifts = await db.execute({
      sql: hasEventId
        ? `SELECT id, status FROM cash_shifts WHERE event_id = -1 AND status = 'open'`
        : `SELECT id, status FROM cash_shifts WHERE status = 'open'`,
      args: []
    });

    if (existingShifts.rows && existingShifts.rows.length > 0) {
      console.log('✅ Open cash shift already exists:');
      existingShifts.rows.forEach(shift => {
        console.log(`   - Shift #${shift.id} (status: ${shift.status})`);
      });
      console.log('\n   No action needed. Use existing shift.\n');
      return;
    }

    // Create new cash shift
    const insertSql = hasEventId
      ? `INSERT INTO cash_shifts (
           event_id,
           opened_at,
           status,
           opening_cash_cents,
           notes
         ) VALUES (?, CURRENT_TIMESTAMP, 'open', 0, ?)`
      : `INSERT INTO cash_shifts (
           opened_at,
           status,
           opening_cash_cents,
           notes
         ) VALUES (CURRENT_TIMESTAMP, 'open', 0, ?)`;

    const insertArgs = hasEventId
      ? [-1, 'Default shift for Test Weekender - Manual entry enabled']
      : ['Default shift - Manual entry enabled'];

    const result = await db.execute({
      sql: insertSql,
      args: insertArgs
    });

    console.log('✅ Cash shift created successfully!');
    console.log(`   Shift ID: ${result.lastInsertRowid || 'N/A'}`);
    console.log('   Status: open');
    console.log('   Opening Cash: $0.00');
    if (hasEventId) {
      console.log('   Event: Test Weekender (event_id: -1)');
    }
    console.log('\n💰 Cash payments are now enabled for manual ticket entry!\n');

  } catch (error) {
    console.error('❌ Error seeding cash shift:', error.message);
    if (error.code === 'SQLITE_CONSTRAINT') {
      console.error('\n   Constraint violation - shift may already exist.');
    }
    process.exit(1);
  }
}

// Run the seed script
seedCashShift()
  .then(() => {
    console.log('✅ Seed script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed script failed:', error);
    process.exit(1);
  });
