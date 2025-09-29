#!/usr/bin/env node

/**
 * Stripe Price Sync CLI Script
 * Manually trigger synchronization of ticket_types with Stripe
 *
 * Usage:
 *   node scripts/sync-stripe-prices.js              # Sync all ticket types
 *   node scripts/sync-stripe-prices.js [ticket-id]  # Sync specific ticket type
 */

import { stripePriceSyncService } from '../lib/stripe-price-sync-service.js';
import { getDatabaseClient } from '../lib/database.js';

async function main() {
  const ticketTypeId = process.argv[2];

  console.log('='.repeat(60));
  console.log('Stripe Price Synchronization Script');
  console.log('='.repeat(60));
  console.log();

  try {
    // Initialize database
    await getDatabaseClient();
    console.log('✓ Database initialized');

    if (ticketTypeId) {
      // Sync specific ticket type
      console.log(`\nSyncing ticket type: ${ticketTypeId}`);
      console.log('-'.repeat(60));

      const result = await stripePriceSyncService.syncTicketType(ticketTypeId);

      console.log();
      console.log('Result:', result);
      console.log();

    } else {
      // Sync all ticket types
      console.log('\nSyncing all ticket types...');
      console.log('-'.repeat(60));

      const results = await stripePriceSyncService.syncPricesWithStripe();

      console.log();
      console.log('Sync Summary:');
      console.log(`  Created:  ${results.created.length}`);
      console.log(`  Updated:  ${results.updated.length}`);
      console.log(`  Skipped:  ${results.skipped.length}`);
      console.log(`  Errors:   ${results.errors.length}`);
      console.log();

      if (results.created.length > 0) {
        console.log('Created Prices:');
        results.created.forEach((item) => {
          console.log(`  ✓ ${item.ticketTypeName} -> ${item.stripePriceId}`);
        });
        console.log();
      }

      if (results.updated.length > 0) {
        console.log('Updated Prices:');
        results.updated.forEach((item) => {
          console.log(`  ✓ ${item.ticketTypeName} -> ${item.stripePriceId}`);
        });
        console.log();
      }

      if (results.skipped.length > 0) {
        console.log('Skipped:');
        results.skipped.forEach((item) => {
          console.log(`  - ${item.ticketTypeName}: ${item.reason}`);
        });
        console.log();
      }

      if (results.errors.length > 0) {
        console.log('Errors:');
        results.errors.forEach((item) => {
          console.log(`  ✗ ${item.ticketTypeName}: ${item.error}`);
        });
        console.log();
      }
    }

    // Show sync status
    console.log('='.repeat(60));
    console.log('Final Sync Status');
    console.log('='.repeat(60));

    const status = await stripePriceSyncService.getSyncStatus();

    console.log();
    console.log('Summary:');
    console.log(`  Total Ticket Types: ${status.total}`);
    console.log(`  Synced:            ${status.synced}`);
    console.log(`  Needs Sync:        ${status.needsSync}`);
    console.log(`  Coming Soon:       ${status.comingSoon}`);
    console.log();

    if (status.needsSync > 0) {
      console.log('Ticket Types Needing Sync:');
      status.ticketTypes
        .filter(t => t.needsSync)
        .forEach((ticket) => {
          console.log(`  - ${ticket.name} (${ticket.id}): ${ticket.reason}`);
        });
      console.log();
    }

    console.log('='.repeat(60));
    console.log('✅ Sync complete!');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error();
    console.error('❌ Error:', error.message);
    console.error();
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();