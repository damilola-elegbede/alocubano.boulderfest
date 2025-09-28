#!/usr/bin/env node

/**
 * Direct Test of Bootstrap-Driven Ticket Architecture
 * Tests the bootstrap service and ticket cache directly without HTTP server
 */

import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Set up test environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
process.env.NODE_ENV = 'development';
// Use development database for testing
process.env.DATABASE_URL = `file:${join(__dirname, '..', 'data', 'development.db')}`;

console.log('🧪 Direct Bootstrap Architecture Test');
console.log('====================================');
console.log();

const results = {
  tests: 0,
  passed: 0,
  failed: 0,
  performance: {},
  issues: []
};

function logTest(name, status, duration, details = '') {
  results.tests++;
  if (status === 'PASS') {
    results.passed++;
    console.log(`✅ ${name} (${duration}ms) ${details}`);
  } else {
    results.failed++;
    console.log(`❌ ${name} (${duration}ms) ${details}`);
    if (details) results.issues.push({ test: name, issue: details });
  }
}

async function testBootstrapService() {
  console.log('🔧 Testing Bootstrap Service');
  console.log('============================');

  try {
    const start = performance.now();

    // Import bootstrap service
    const { bootstrapService } = await import('../lib/bootstrap-service.js');

    // Test initialization
    const initStart = performance.now();
    const initResult = await bootstrapService.initialize();
    const initDuration = Math.round(performance.now() - initStart);

    results.performance.bootstrap_init = initDuration;

    if (initResult && (initResult.status === 'success' || initResult.status === 'already_applied')) {
      logTest('Bootstrap Service Initialization', 'PASS', initDuration, `Status: ${initResult.status}`);
    } else {
      logTest('Bootstrap Service Initialization', 'FAIL', initDuration, `Unexpected result: ${JSON.stringify(initResult)}`);
    }

    // Test status
    const statusStart = performance.now();
    const status = await bootstrapService.getStatus();
    const statusDuration = Math.round(performance.now() - statusStart);

    results.performance.bootstrap_status = statusDuration;

    if (status && status.initialized) {
      logTest('Bootstrap Service Status', 'PASS', statusDuration, `Events: ${status.eventCount}, Tickets: ${status.ticketTypeCount}`);
    } else {
      logTest('Bootstrap Service Status', 'FAIL', statusDuration, `Not initialized properly: ${JSON.stringify(status)}`);
    }

  } catch (error) {
    logTest('Bootstrap Service', 'FAIL', 0, `Error: ${error.message}`);
  }
}

async function testTicketCache() {
  console.log();
  console.log('💾 Testing Ticket Cache Service');
  console.log('===============================');

  try {
    // Import ticket cache
    const { ticketTypeCache } = await import('../lib/ticket-type-cache.js');

    // Test getting all tickets
    const allStart = performance.now();
    const allTickets = await ticketTypeCache.getAll();
    const allDuration = Math.round(performance.now() - allStart);

    results.performance.cache_get_all = allDuration;

    if (Array.isArray(allTickets) && allTickets.length > 0) {
      logTest('Cache Get All Tickets', 'PASS', allDuration, `Found ${allTickets.length} tickets`);

      // Verify structure
      const firstTicket = allTickets[0];
      const hasRequiredFields = firstTicket.id && firstTicket.name &&
        firstTicket.price_cents !== undefined && firstTicket.status;

      if (hasRequiredFields) {
        logTest('Ticket Structure Validation', 'PASS', 0, 'Required fields present');
      } else {
        logTest('Ticket Structure Validation', 'FAIL', 0, 'Missing required fields');
      }

      // Test cache hit performance
      const cacheHitStart = performance.now();
      const cachedTickets = await ticketTypeCache.getAll();
      const cacheHitDuration = Math.round(performance.now() - cacheHitStart);

      results.performance.cache_hit = cacheHitDuration;

      if (cachedTickets.length === allTickets.length) {
        logTest('Cache Hit Performance', 'PASS', cacheHitDuration, 'Cache returned same data');
      } else {
        logTest('Cache Hit Performance', 'FAIL', cacheHitDuration, 'Cache inconsistency');
      }

    } else {
      logTest('Cache Get All Tickets', 'FAIL', allDuration, 'No tickets found or invalid response');
    }

    // Test filtering
    const eventFilterStart = performance.now();
    const boulderFestTickets = await ticketTypeCache.getByEventId('boulder-fest-2026');
    const eventFilterDuration = Math.round(performance.now() - eventFilterStart);

    results.performance.cache_filter_event = eventFilterDuration;

    if (Array.isArray(boulderFestTickets)) {
      logTest('Cache Event Filter', 'PASS', eventFilterDuration, `Found ${boulderFestTickets.length} tickets for boulder-fest-2026`);
    } else {
      logTest('Cache Event Filter', 'FAIL', eventFilterDuration, 'Filter failed');
    }

    // Test individual ticket retrieval
    const byIdStart = performance.now();
    const specificTicket = await ticketTypeCache.getById('boulder-fest-2026-full-pass');
    const byIdDuration = Math.round(performance.now() - byIdStart);

    results.performance.cache_get_by_id = byIdDuration;

    if (specificTicket && specificTicket.id === 'boulder-fest-2026-full-pass') {
      logTest('Cache Get By ID', 'PASS', byIdDuration, `Found: ${specificTicket.name}`);
    } else {
      logTest('Cache Get By ID', 'FAIL', byIdDuration, 'Specific ticket not found');
    }

    // Test cache stats
    const stats = ticketTypeCache.getStats();
    if (stats && typeof stats.hits === 'number') {
      logTest('Cache Statistics', 'PASS', 0, `Hit rate: ${stats.hitRate}, Cache size: ${stats.cacheSize}`);
    } else {
      logTest('Cache Statistics', 'FAIL', 0, 'Invalid stats');
    }

  } catch (error) {
    logTest('Ticket Cache Service', 'FAIL', 0, `Error: ${error.message}`);
  }
}

async function testDatabaseIntegrity() {
  console.log();
  console.log('🗄️  Testing Database Integrity');
  console.log('==============================');

  try {
    // Import database client
    const { getDatabaseClient } = await import('../lib/database.js');
    const db = await getDatabaseClient();

    // Test basic connectivity
    const connectStart = performance.now();
    const result = await db.execute({ sql: 'SELECT 1 as test', args: [] });
    const connectDuration = Math.round(performance.now() - connectStart);

    results.performance.db_connectivity = connectDuration;

    if (result && result.rows && result.rows[0].test === 1) {
      logTest('Database Connectivity', 'PASS', connectDuration, 'Connection successful');
    } else {
      logTest('Database Connectivity', 'FAIL', connectDuration, 'Connection failed');
      return;
    }

    // Test tables exist
    const tablesQuery = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('events', 'ticket_types', 'bootstrap_versions')`,
      args: []
    });

    const tableNames = tablesQuery.rows.map(row => row.name);
    const requiredTables = ['events', 'ticket_types', 'bootstrap_versions'];
    const missingTables = requiredTables.filter(table => !tableNames.includes(table));

    if (missingTables.length === 0) {
      logTest('Required Tables Exist', 'PASS', 0, `Found: ${tableNames.join(', ')}`);
    } else {
      logTest('Required Tables Exist', 'FAIL', 0, `Missing: ${missingTables.join(', ')}`);
    }

    // Test data integrity
    const eventsCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM events',
      args: []
    });

    const ticketsCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM ticket_types',
      args: []
    });

    const eventCount = eventsCount.rows[0].count;
    const ticketCount = ticketsCount.rows[0].count;

    if (eventCount > 0 && ticketCount > 0) {
      logTest('Data Population', 'PASS', 0, `Events: ${eventCount}, Tickets: ${ticketCount}`);
    } else {
      logTest('Data Population', 'FAIL', 0, `Events: ${eventCount}, Tickets: ${ticketCount}`);
    }

    // Test foreign key relationships
    const orphanTickets = await db.execute({
      sql: `SELECT COUNT(*) as count FROM ticket_types tt
            LEFT JOIN events e ON tt.event_id = e.id
            WHERE e.id IS NULL`,
      args: []
    });

    const orphanCount = orphanTickets.rows[0].count;
    if (orphanCount === 0) {
      logTest('Foreign Key Integrity', 'PASS', 0, 'No orphaned tickets');
    } else {
      logTest('Foreign Key Integrity', 'FAIL', 0, `Found ${orphanCount} orphaned tickets`);
    }

  } catch (error) {
    logTest('Database Integrity', 'FAIL', 0, `Error: ${error.message}`);
  }
}

async function testBootstrapData() {
  console.log();
  console.log('📋 Testing Bootstrap Data Integrity');
  console.log('===================================');

  try {
    // Load bootstrap file directly
    const fs = await import('fs/promises');
    const path = await import('path');

    const bootstrapPath = path.join(__dirname, '..', 'config', 'bootstrap-tickets.json');
    const bootstrapContent = await fs.readFile(bootstrapPath, 'utf-8');
    const bootstrapData = JSON.parse(bootstrapContent);

    // Validate structure
    if (bootstrapData.version && bootstrapData.events && bootstrapData.ticket_types) {
      logTest('Bootstrap File Structure', 'PASS', 0, `Version: ${bootstrapData.version}`);
    } else {
      logTest('Bootstrap File Structure', 'FAIL', 0, 'Missing required sections');
    }

    // Count expected vs actual data
    const expectedEvents = Object.keys(bootstrapData.events).length;
    const expectedTickets = Object.keys(bootstrapData.ticket_types).length;

    // Get database data
    const { getDatabaseClient } = await import('../lib/database.js');
    const db = await getDatabaseClient();

    const actualEvents = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM events',
      args: []
    });

    const actualTickets = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM ticket_types',
      args: []
    });

    const eventMatch = actualEvents.rows[0].count >= expectedEvents;
    const ticketMatch = actualTickets.rows[0].count >= expectedTickets;

    if (eventMatch && ticketMatch) {
      logTest('Bootstrap Data Applied', 'PASS', 0,
        `Expected: ${expectedEvents}/${expectedTickets}, Got: ${actualEvents.rows[0].count}/${actualTickets.rows[0].count}`);
    } else {
      logTest('Bootstrap Data Applied', 'FAIL', 0,
        `Expected: ${expectedEvents}/${expectedTickets}, Got: ${actualEvents.rows[0].count}/${actualTickets.rows[0].count}`);
    }

    // Test specific ticket from bootstrap
    const fullPassTicket = await db.execute({
      sql: 'SELECT * FROM ticket_types WHERE id = ?',
      args: ['boulder-fest-2026-full-pass']
    });

    if (fullPassTicket.rows.length > 0) {
      const ticket = fullPassTicket.rows[0];
      const priceMatch = ticket.price_cents === 25000;
      const maxQuantityMatch = ticket.max_quantity === 200;

      if (priceMatch && maxQuantityMatch) {
        logTest('Specific Ticket Verification', 'PASS', 0, 'Full pass data matches bootstrap');
      } else {
        logTest('Specific Ticket Verification', 'FAIL', 0,
          `Price: ${ticket.price_cents} (expected 25000), Max: ${ticket.max_quantity} (expected 200)`);
      }
    } else {
      logTest('Specific Ticket Verification', 'FAIL', 0, 'Full pass ticket not found');
    }

  } catch (error) {
    logTest('Bootstrap Data Integrity', 'FAIL', 0, `Error: ${error.message}`);
  }
}

async function main() {
  const totalStart = performance.now();

  await testBootstrapService();
  await testTicketCache();
  await testDatabaseIntegrity();
  await testBootstrapData();

  const totalDuration = Math.round(performance.now() - totalStart);

  console.log();
  console.log('📊 Test Summary');
  console.log('===============');
  console.log(`Total Duration: ${totalDuration}ms`);
  console.log(`Tests: ${results.tests} (${results.passed} passed, ${results.failed} failed)`);
  console.log(`Success Rate: ${((results.passed / results.tests) * 100).toFixed(1)}%`);
  console.log();

  console.log('⚡ Performance Metrics:');
  Object.entries(results.performance).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}ms`);
  });

  if (results.issues.length > 0) {
    console.log();
    console.log('🚨 Issues Found:');
    results.issues.forEach(issue => {
      console.log(`   ${issue.test}: ${issue.issue}`);
    });
  }

  console.log();
  if (results.failed === 0) {
    console.log('✅ All tests passed! Bootstrap-driven ticket architecture is working correctly.');
  } else {
    console.log('❌ Some tests failed. Please review the issues above.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Test suite failed with error:', error);
  process.exit(1);
});