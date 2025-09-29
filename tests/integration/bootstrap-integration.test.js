/**
 * Bootstrap Integration Tests
 * Tests bootstrap system applies from config/bootstrap.json
 * Verifies events and ticket_types tables populated correctly
 * Tests checksum-based idempotency
 * Tests bootstrap version tracking
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { bootstrapService } from '../../lib/bootstrap-service.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Bootstrap Integration Tests', () => {
  let db;
  const startTime = Date.now();

  beforeEach(async () => {
    db = await getDbClient();
    // Reset bootstrap service state for clean tests
    bootstrapService.initialized = false;
    bootstrapService.initializationPromise = null;
    bootstrapService.lastChecksum = null;
  });

  test('bootstrap applies from config/bootstrap.json and populates events table', async () => {
    const testStart = Date.now();

    // Read bootstrap config
    const bootstrapPath = path.join(process.cwd(), 'config', 'bootstrap.json');
    const bootstrapContent = await fs.readFile(bootstrapPath, 'utf-8');
    const bootstrapData = JSON.parse(bootstrapContent);

    // Apply bootstrap
    const result = await bootstrapService.initialize();

    expect(result).toBeDefined();
    expect(['success', 'already_applied']).toContain(result.status);

    // Verify events table populated
    const eventsResult = await db.execute({
      sql: 'SELECT * FROM events WHERE status != ? ORDER BY id',
      args: ['test']
    });

    expect(eventsResult.rows.length).toBeGreaterThan(0);

    // Count events in bootstrap.json (excluding test events)
    const productionEvents = Object.values(bootstrapData.events).filter(
      e => e.status !== 'test'
    );
    expect(eventsResult.rows.length).toBe(productionEvents.length);

    // Verify event data matches bootstrap config
    const event1 = eventsResult.rows.find(e => e.id === 1);
    expect(event1).toBeDefined();
    expect(event1.name).toBe(bootstrapData.events['1'].name);
    expect(event1.slug).toBe(bootstrapData.events['1'].slug);
    expect(event1.type).toBe(bootstrapData.events['1'].type);

    console.log(`✓ Bootstrap events test completed in ${Date.now() - testStart}ms`);
  });

  test('bootstrap populates ticket_types table correctly', async () => {
    const testStart = Date.now();

    // Read bootstrap config
    const bootstrapPath = path.join(process.cwd(), 'config', 'bootstrap.json');
    const bootstrapContent = await fs.readFile(bootstrapPath, 'utf-8');
    const bootstrapData = JSON.parse(bootstrapContent);

    // Apply bootstrap
    await bootstrapService.initialize();

    // Verify ticket_types table populated
    const ticketTypesResult = await db.execute({
      sql: 'SELECT * FROM ticket_types WHERE status != ? ORDER BY id',
      args: ['test']
    });

    expect(ticketTypesResult.rows.length).toBeGreaterThan(0);

    // Count ticket types in bootstrap.json (excluding test ticket types)
    const productionTicketTypes = Object.values(bootstrapData.ticket_types).filter(
      tt => tt.status !== 'test'
    );
    expect(ticketTypesResult.rows.length).toBe(productionTicketTypes.length);

    // Verify ticket type data matches bootstrap config
    const weekenderFull = ticketTypesResult.rows.find(tt => tt.id === '2025-11-weekender-full');
    expect(weekenderFull).toBeDefined();
    expect(weekenderFull.event_id).toBe(bootstrapData.ticket_types['2025-11-weekender-full'].event_id);
    expect(weekenderFull.name).toBe(bootstrapData.ticket_types['2025-11-weekender-full'].name);
    expect(weekenderFull.price_cents).toBe(bootstrapData.ticket_types['2025-11-weekender-full'].price_cents);
    expect(weekenderFull.status).toBe(bootstrapData.ticket_types['2025-11-weekender-full'].status);

    // Verify ticket_type_id FK populated correctly
    expect(weekenderFull.id).toBe('2025-11-weekender-full');

    console.log(`✓ Bootstrap ticket_types test completed in ${Date.now() - testStart}ms`);
  });

  test('bootstrap uses checksum-based idempotency (apply twice = same result)', async () => {
    const testStart = Date.now();

    // First application
    const result1 = await bootstrapService.initialize();
    expect(result1).toBeDefined();
    expect(['success', 'already_applied']).toContain(result1.status);

    // Get checksum from first application
    const checksum1 = result1.checksum || bootstrapService.lastChecksum;
    expect(checksum1).toBeDefined();
    expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex

    // Get initial row counts
    const eventsCount1 = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM events WHERE status != ?',
      args: ['test']
    });
    const ticketTypesCount1 = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM ticket_types WHERE status != ?',
      args: ['test']
    });

    // Reset bootstrap service to simulate second run
    bootstrapService.initialized = false;
    bootstrapService.initializationPromise = null;

    // Second application
    const result2 = await bootstrapService.initialize();
    expect(result2.status).toBe('already_applied');
    expect(result2.checksum).toBe(checksum1);

    // Verify row counts unchanged
    const eventsCount2 = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM events WHERE status != ?',
      args: ['test']
    });
    const ticketTypesCount2 = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM ticket_types WHERE status != ?',
      args: ['test']
    });

    expect(eventsCount2.rows[0].count).toBe(eventsCount1.rows[0].count);
    expect(ticketTypesCount2.rows[0].count).toBe(ticketTypesCount1.rows[0].count);

    console.log(`✓ Bootstrap idempotency test completed in ${Date.now() - testStart}ms`);
  });

  test('bootstrap version tracking records successful applications', async () => {
    const testStart = Date.now();

    // Apply bootstrap
    const result = await bootstrapService.initialize();
    expect(result).toBeDefined();

    // Verify bootstrap_versions table has record
    const versionsResult = await db.execute({
      sql: 'SELECT * FROM bootstrap_versions WHERE status = ? ORDER BY applied_at DESC LIMIT 1',
      args: ['success']
    });

    expect(versionsResult.rows.length).toBe(1);

    const version = versionsResult.rows[0];
    expect(version.version).toBeDefined();
    expect(version.checksum).toBeDefined();
    expect(version.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    expect(version.status).toBe('success');
    expect(version.applied_at).toBeDefined();
    expect(version.applied_by).toBeDefined();

    console.log(`✓ Bootstrap version tracking test completed in ${Date.now() - testStart}ms`);
  });

  test('bootstrap handles coming-soon tickets with null prices', async () => {
    const testStart = Date.now();

    // Read bootstrap config
    const bootstrapPath = path.join(process.cwd(), 'config', 'bootstrap.json');
    const bootstrapContent = await fs.readFile(bootstrapPath, 'utf-8');
    const bootstrapData = JSON.parse(bootstrapContent);

    // Apply bootstrap
    await bootstrapService.initialize();

    // Find coming-soon ticket types
    const comingSoonTicketTypes = Object.entries(bootstrapData.ticket_types)
      .filter(([_, tt]) => tt.status === 'coming-soon');

    expect(comingSoonTicketTypes.length).toBeGreaterThan(0);

    // Verify coming-soon tickets in database
    for (const [ticketId, ticketData] of comingSoonTicketTypes) {
      const ticketResult = await db.execute({
        sql: 'SELECT * FROM ticket_types WHERE id = ?',
        args: [ticketId]
      });

      expect(ticketResult.rows.length).toBe(1);
      const ticket = ticketResult.rows[0];

      expect(ticket.status).toBe('coming-soon');
      expect(ticket.price_cents).toBeNull();
      expect(ticket.name).toBe(ticketData.name);
    }

    console.log(`✓ Bootstrap coming-soon tickets test completed in ${Date.now() - testStart}ms`);
  });

  test('bootstrap getStatus returns accurate information', async () => {
    const testStart = Date.now();

    // Apply bootstrap
    await bootstrapService.initialize();

    // Get status
    const status = await bootstrapService.getStatus();

    expect(status.initialized).toBe(true);
    expect(status.lastChecksum).toBeDefined();
    expect(status.lastBootstrap).toBeDefined();
    expect(status.lastBootstrap.version).toBeDefined();
    expect(status.lastBootstrap.status).toBe('success');
    expect(status.eventCount).toBeGreaterThan(0);
    expect(status.ticketTypeCount).toBeGreaterThan(0);

    console.log(`✓ Bootstrap getStatus test completed in ${Date.now() - testStart}ms`);
  });

  test('bootstrap validates file structure', async () => {
    const testStart = Date.now();

    // Load bootstrap file directly
    const bootstrapData = await bootstrapService.loadBootstrapFile();

    // Verify required structure
    expect(bootstrapData.version).toBeDefined();
    expect(bootstrapData.events).toBeDefined();
    expect(bootstrapData.ticket_types).toBeDefined();
    expect(bootstrapData.metadata).toBeDefined();

    // Verify metadata
    expect(bootstrapData.metadata.currency).toBe('USD');
    expect(bootstrapData.metadata.timezone).toBe('America/Denver');
    expect(Array.isArray(bootstrapData.metadata.ticket_statuses)).toBe(true);
    expect(Array.isArray(bootstrapData.metadata.event_statuses)).toBe(true);

    console.log(`✓ Bootstrap file structure validation test completed in ${Date.now() - testStart}ms`);
  });

  test('bootstrap calculateChecksum is deterministic', async () => {
    const testStart = Date.now();

    // Load bootstrap file
    const bootstrapData = await bootstrapService.loadBootstrapFile();

    // Calculate checksum twice
    const checksum1 = bootstrapService.calculateChecksum(bootstrapData);
    const checksum2 = bootstrapService.calculateChecksum(bootstrapData);

    // Should be identical
    expect(checksum1).toBe(checksum2);
    expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex

    console.log(`✓ Bootstrap checksum determinism test completed in ${Date.now() - testStart}ms`);
  });

  // Report total test execution time
  test('report total execution time', () => {
    const totalTime = Date.now() - startTime;
    console.log(`\n📊 Bootstrap Integration Test Suite: ${totalTime}ms total`);
    expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
  });
});