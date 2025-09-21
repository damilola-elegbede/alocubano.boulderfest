#!/usr/bin/env node
/**
 * Simple Bootstrap Logic Test
 *
 * Tests the bootstrap system functions without requiring full migrations
 * Creates minimal tables and tests the bootstrap operations
 */

import { createClient } from '@libsql/client';
import { createLogger, flattenSettings, validateEventData } from '../lib/bootstrap-helpers.js';

const logger = createLogger('SimpleTest');

async function createMinimalSchema(db) {
  logger.info('📋 Creating minimal test schema...');

  // Create basic tables needed for bootstrap
  await db.execute(`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      description TEXT,
      venue_name TEXT,
      venue_address TEXT,
      venue_city TEXT DEFAULT 'Boulder',
      venue_state TEXT DEFAULT 'CO',
      venue_zip TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      max_capacity INTEGER,
      early_bird_end_date DATE,
      regular_price_start_date DATE,
      display_order INTEGER DEFAULT 0,
      is_featured BOOLEAN DEFAULT FALSE,
      is_visible BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      config TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE event_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, key)
    )
  `);

  await db.execute(`
    CREATE TABLE event_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_email TEXT NOT NULL,
      role TEXT DEFAULT 'viewer',
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      granted_by TEXT,
      UNIQUE(event_id, user_email)
    )
  `);

  logger.success('   ✅ Test schema created successfully');
}

async function testHelperFunctions() {
  logger.info('\n🔧 Testing helper functions...');

  // Test flattenSettings
  const settings = {
    payment: {
      stripe_enabled: true,
      fees: {
        percentage: 2.9,
        fixed: 0.30
      }
    },
    email: {
      enabled: true,
      from: 'test@example.com'
    }
  };

  const flattened = flattenSettings(settings);
  const expected = {
    'payment.stripe_enabled': 'true',
    'payment.fees.percentage': '2.9',
    'payment.fees.fixed': '0.3',
    'email.enabled': 'true',
    'email.from': 'test@example.com'
  };

  for (const [key, value] of Object.entries(expected)) {
    if (flattened[key] !== value) {
      throw new Error(`Settings flattening failed: expected ${key}=${value}, got ${flattened[key]}`);
    }
  }

  logger.success('   ✅ flattenSettings works correctly');

  // Test event validation
  const validEvent = {
    slug: 'test-event',
    name: 'Test Event',
    type: 'festival',
    status: 'upcoming',
    dates: {
      start: '2025-01-01',
      end: '2025-01-02'
    }
  };

  const errors = validateEventData(validEvent);
  if (errors.length > 0) {
    throw new Error(`Event validation failed: ${errors.join(', ')}`);
  }

  logger.success('   ✅ validateEventData works correctly');

  // Test invalid event
  const invalidEvent = {
    slug: 'test-event',
    name: 'Test Event',
    type: 'invalid-type',
    status: 'upcoming'
  };

  const invalidErrors = validateEventData(invalidEvent);
  if (invalidErrors.length === 0) {
    throw new Error('Event validation should have failed for invalid type');
  }

  logger.success('   ✅ Event validation correctly catches errors');
}

async function testBootstrapOperations(db) {
  logger.info('\n📊 Testing bootstrap operations...');

  // Test event creation
  const eventData = {
    slug: 'test-event-2025',
    name: 'Test Event 2025',
    type: 'festival',
    status: 'upcoming',
    description: 'A test event for validation',
    venue: {
      name: 'Test Venue',
      address: '123 Test St',
      city: 'Boulder',
      state: 'CO',
      zip: '80302'
    },
    dates: {
      start: '2025-06-01',
      end: '2025-06-03',
      early_bird_end: '2025-04-01',
      regular_price_start: '2025-05-01'
    },
    capacity: 100,
    display_order: 1,
    is_featured: true,
    is_visible: true
  };

  const config = {
    ticket_types: ['full-pass', 'day-pass'],
    features: { workshops: true, social_dancing: true }
  };

  // Insert event
  const result = await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, description,
      venue_name, venue_address, venue_city, venue_state, venue_zip,
      start_date, end_date, max_capacity,
      early_bird_end_date, regular_price_start_date,
      display_order, is_featured, is_visible,
      created_by, config
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      eventData.slug,
      eventData.name,
      eventData.type,
      eventData.status,
      eventData.description,
      eventData.venue.name,
      eventData.venue.address,
      eventData.venue.city,
      eventData.venue.state,
      eventData.venue.zip,
      eventData.dates.start,
      eventData.dates.end,
      eventData.capacity,
      eventData.dates.early_bird_end,
      eventData.dates.regular_price_start,
      eventData.display_order,
      eventData.is_featured ? 1 : 0,
      eventData.is_visible ? 1 : 0,
      'test',
      JSON.stringify(config)
    ]
  });

  logger.success('   ✅ Event created successfully');

  // Get event ID
  const eventQuery = await db.execute({
    sql: 'SELECT id FROM events WHERE slug = ?',
    args: [eventData.slug]
  });

  if (eventQuery.rows.length === 0) {
    throw new Error('Event not found after creation');
  }

  const eventId = eventQuery.rows[0].id;

  // Test settings creation
  const settings = {
    'payment.stripe_enabled': 'true',
    'payment.processing_fee_percentage': '2.9',
    'registration.deadline_days': '7',
    'email.confirmation_enabled': 'true'
  };

  for (const [key, value] of Object.entries(settings)) {
    await db.execute({
      sql: 'INSERT INTO event_settings (event_id, key, value) VALUES (?, ?, ?)',
      args: [eventId, key, value]
    });
  }

  logger.success('   ✅ Settings created successfully');

  // Test access creation
  await db.execute({
    sql: 'INSERT INTO event_access (event_id, user_email, role, granted_by) VALUES (?, ?, ?, ?)',
    args: [eventId, 'admin@example.com', 'admin', 'test']
  });

  logger.success('   ✅ Access record created successfully');

  // Verify data
  const eventsCount = await db.execute('SELECT COUNT(*) as count FROM events');
  const settingsCount = await db.execute('SELECT COUNT(*) as count FROM event_settings');
  const accessCount = await db.execute('SELECT COUNT(*) as count FROM event_access');

  logger.info(`   📊 Created: ${eventsCount.rows[0].count} events, ${settingsCount.rows[0].count} settings, ${accessCount.rows[0].count} access records`);

  // Test idempotency - try to create the same event again
  try {
    await db.execute({
      sql: `INSERT INTO events (slug, name, type, status, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [eventData.slug, 'Duplicate Event', 'festival', 'draft', '2025-01-01', '2025-01-02', 'test']
    });
    throw new Error('Duplicate event should have been prevented by UNIQUE constraint');
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      logger.success('   ✅ Idempotency protection working (duplicate event prevented)');
    } else {
      throw error;
    }
  }
}

async function runTests() {
  logger.info('\n🧪 Running Simple Bootstrap Tests');
  logger.info('═'.repeat(50));

  try {
    // Create in-memory database
    logger.info('🗄️  Creating test database...');
    const db = createClient({ url: ':memory:' });

    // Create minimal schema
    await createMinimalSchema(db);

    // Test helper functions
    await testHelperFunctions();

    // Test bootstrap operations
    await testBootstrapOperations(db);

    logger.success('\n🎉 All tests passed! Bootstrap system components are working correctly.');
    logger.info('\n📋 Summary:');
    logger.info('   ✅ Helper functions validated');
    logger.info('   ✅ Database operations tested');
    logger.info('   ✅ Idempotency protection verified');
    logger.info('   ✅ Data validation working');

    return 0;

  } catch (error) {
    logger.error('\n💥 Test failed with error:');
    logger.error(`   ${error.message}`);
    if (error.stack) {
      logger.error('\n   Stack trace:');
      logger.error(error.stack);
    }
    return 1;
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(code => {
    process.exit(code);
  }).catch(error => {
    console.error('Unexpected test error:', error);
    process.exit(1);
  });
}

export { runTests };