/**
 * Test Data Seeding System
 * Provides deterministic, comprehensive test data for E2E tests
 * 
 * Features:
 * - Idempotent operations (safe to run multiple times)
 * - Deterministic IDs and timestamps for consistent testing
 * - Multiple seed profiles (minimal, standard, full)
 * - Fast execution for CI/CD pipelines
 * - Validation of seeded data
 * - Support for all test scenarios
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getDatabaseClient } from '../api/lib/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Data Configuration
 */
const SEED_CONFIG = {
  // Seed profiles
  PROFILES: {
    MINIMAL: 'minimal',     // Just admin user
    STANDARD: 'standard',   // Common test scenarios
    FULL: 'full'           // All possible test data
  },
  
  // Deterministic base timestamp (2026-01-01T00:00:00Z)
  BASE_TIMESTAMP: '2026-01-01 00:00:00',
  
  // Test identifiers for consistency
  TEST_PREFIX: 'E2E_TEST_',
  
  // Admin test credentials
  ADMIN_EMAIL: 'admin@e2etest.com',
  TEST_ADMIN_PASSWORD: 'test-password', // Plain text for testing
  
  // Performance settings
  BATCH_SIZE: 50,
  VALIDATION_TIMEOUT: 5000,
};

/**
 * Test Data Seeder
 */
class TestDataSeeder {
  constructor() {
    this.client = null;
    this.profile = SEED_CONFIG.PROFILES.STANDARD;
    this.seededData = {};
  }

  /**
   * Initialize database client
   */
  async initializeClient() {
    if (this.client) return this.client;
    
    try {
      this.client = await getDatabaseClient();
      return this.client;
    } catch (error) {
      console.error('❌ Failed to initialize database client:', error.message);
      throw error;
    }
  }

  /**
   * Generate deterministic timestamp offset from base
   */
  getDeterministicTimestamp(offsetMinutes = 0) {
    const baseDate = new Date('2026-01-01T00:00:00Z');
    baseDate.setMinutes(baseDate.getMinutes() + offsetMinutes);
    return baseDate.toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * Generate deterministic test ID
   */
  generateTestId(type, index) {
    const hash = crypto.createHash('md5')
      .update(`${SEED_CONFIG.TEST_PREFIX}${type}_${index}`)
      .digest('hex')
      .substring(0, 8);
    return `${SEED_CONFIG.TEST_PREFIX}${type}_${hash}`;
  }

  /**
   * Clear existing seed data (idempotent)
   */
  async clearExistingSeedData() {
    console.log('🧹 Clearing existing seed data...');
    
    const client = await this.initializeClient();
    
    try {
      // Clear data with test prefix
      const clearQueries = [
        `DELETE FROM tickets WHERE ticket_id LIKE '${SEED_CONFIG.TEST_PREFIX}%'`,
        `DELETE FROM transactions WHERE transaction_id LIKE '${SEED_CONFIG.TEST_PREFIX}%'`,
        `DELETE FROM email_subscribers WHERE email LIKE '%@e2etest.com'`,
        `DELETE FROM registrations WHERE email LIKE '%@e2etest.com'`,
        `DELETE FROM admin_sessions WHERE email LIKE '%@e2etest.com'`,
      ];

      for (const query of clearQueries) {
        try {
          await client.execute(query);
        } catch (error) {
          // Table might not exist - that's okay
          console.warn(`  ⚠️  Clear query warning (table may not exist): ${error.message}`);
        }
      }

      console.log('  ✅ Existing seed data cleared');
    } catch (error) {
      console.warn('⚠️  Warning during seed data clearing:', error.message);
    }
  }

  /**
   * Seed admin user for authentication tests
   */
  async seedAdminUser() {
    console.log('👨‍💼 Seeding admin user...');
    
    const client = await this.initializeClient();
    
    try {
      // Check if admin_sessions table exists
      try {
        await client.execute('SELECT 1 FROM admin_sessions LIMIT 1');
      } catch (error) {
        console.warn('  ⚠️  admin_sessions table not found, skipping admin user seeding');
        return { skipped: true, reason: 'table_not_found' };
      }

      // Create admin session for testing
      const adminSessionData = {
        id: 1,
        session_token: this.generateTestId('ADMIN_SESSION', 1),
        email: SEED_CONFIG.ADMIN_EMAIL,
        created_at: this.getDeterministicTimestamp(0),
        expires_at: this.getDeterministicTimestamp(24 * 60), // 24 hours
        last_activity: this.getDeterministicTimestamp(0)
      };

      await client.execute(`
        INSERT OR REPLACE INTO admin_sessions (
          id, session_token, email, created_at, expires_at, last_activity
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        adminSessionData.id,
        adminSessionData.session_token,
        adminSessionData.email,
        adminSessionData.created_at,
        adminSessionData.expires_at,
        adminSessionData.last_activity
      ]);

      this.seededData.adminUser = adminSessionData;
      console.log('  ✅ Admin user seeded:', SEED_CONFIG.ADMIN_EMAIL);
      return { seeded: true, data: adminSessionData };
    } catch (error) {
      console.error('❌ Admin user seeding failed:', error.message);
      throw error;
    }
  }

  /**
   * Seed sample transactions and tickets
   */
  async seedTicketsAndTransactions() {
    console.log('🎫 Seeding tickets and transactions...');
    
    const client = await this.initializeClient();
    
    try {
      // Check if required tables exist
      try {
        await client.execute('SELECT 1 FROM transactions LIMIT 1');
        await client.execute('SELECT 1 FROM tickets LIMIT 1');
      } catch (error) {
        console.warn('  ⚠️  Required tables not found, skipping tickets/transactions seeding');
        return { skipped: true, reason: 'tables_not_found' };
      }

      const transactionsData = [];
      const ticketsData = [];
      
      // Transaction 1: Weekend package (2 tickets)
      const transaction1 = {
        id: 1,
        transaction_id: this.generateTestId('TRANSACTION', 1),
        type: 'tickets',
        status: 'completed',
        amount_cents: 15000, // $150.00
        currency: 'USD',
        stripe_session_id: this.generateTestId('STRIPE_SESSION', 1),
        stripe_payment_intent_id: this.generateTestId('STRIPE_PI', 1),
        stripe_charge_id: this.generateTestId('STRIPE_CHARGE', 1),
        payment_method_type: 'card',
        customer_email: 'ticket-buyer@e2etest.com',
        customer_name: 'Test Buyer',
        billing_address: JSON.stringify({
          line1: '123 Test Street',
          city: 'Boulder',
          state: 'CO',
          postal_code: '80301',
          country: 'US'
        }),
        order_data: JSON.stringify({
          items: [
            { type: 'weekend', quantity: 2, price_cents: 7500 }
          ]
        }),
        session_metadata: JSON.stringify({ test: true }),
        event_id: 'alocubano-boulderfest-2026',
        source: 'website',
        created_at: this.getDeterministicTimestamp(30),
        updated_at: this.getDeterministicTimestamp(30),
        completed_at: this.getDeterministicTimestamp(31)
      };
      transactionsData.push(transaction1);

      // Associated tickets for transaction 1
      for (let i = 1; i <= 2; i++) {
        const ticket = {
          id: i,
          ticket_id: this.generateTestId('TICKET', i),
          transaction_id: transaction1.id,
          ticket_type: 'weekend',
          event_id: 'alocubano-boulderfest-2026',
          event_date: '2026-05-15',
          price_cents: 7500,
          attendee_first_name: `Attendee${i}`,
          attendee_last_name: 'Test',
          attendee_email: 'ticket-buyer@e2etest.com',
          attendee_phone: '+1-555-0100',
          status: 'valid',
          validation_code: this.generateTestId('QR', i),
          checked_in_at: null,
          checked_in_by: null,
          check_in_location: null,
          ticket_metadata: JSON.stringify({ test: true, batch: 1 }),
          created_at: this.getDeterministicTimestamp(31),
          updated_at: this.getDeterministicTimestamp(31)
        };
        ticketsData.push(ticket);
      }

      // Transaction 2: Single Saturday ticket
      const transaction2 = {
        id: 2,
        transaction_id: this.generateTestId('TRANSACTION', 2),
        type: 'tickets',
        status: 'completed',
        amount_cents: 5000, // $50.00
        currency: 'USD',
        stripe_session_id: this.generateTestId('STRIPE_SESSION', 2),
        stripe_payment_intent_id: this.generateTestId('STRIPE_PI', 2),
        stripe_charge_id: this.generateTestId('STRIPE_CHARGE', 2),
        payment_method_type: 'card',
        customer_email: 'saturday-buyer@e2etest.com',
        customer_name: 'Saturday Buyer',
        billing_address: JSON.stringify({
          line1: '456 Saturday Ave',
          city: 'Boulder',
          state: 'CO',
          postal_code: '80302',
          country: 'US'
        }),
        order_data: JSON.stringify({
          items: [
            { type: 'saturday', quantity: 1, price_cents: 5000 }
          ]
        }),
        session_metadata: JSON.stringify({ test: true }),
        event_id: 'alocubano-boulderfest-2026',
        source: 'website',
        created_at: this.getDeterministicTimestamp(60),
        updated_at: this.getDeterministicTimestamp(60),
        completed_at: this.getDeterministicTimestamp(61)
      };
      transactionsData.push(transaction2);

      // Associated ticket for transaction 2
      const saturdayTicket = {
        id: 3,
        ticket_id: this.generateTestId('TICKET', 3),
        transaction_id: transaction2.id,
        ticket_type: 'saturday',
        event_id: 'alocubano-boulderfest-2026',
        event_date: '2026-05-15',
        price_cents: 5000,
        attendee_first_name: 'Saturday',
        attendee_last_name: 'Attendee',
        attendee_email: 'saturday-buyer@e2etest.com',
        attendee_phone: '+1-555-0200',
        status: 'valid',
        validation_code: this.generateTestId('QR', 3),
        checked_in_at: null,
        checked_in_by: null,
        check_in_location: null,
        ticket_metadata: JSON.stringify({ test: true, batch: 2 }),
        created_at: this.getDeterministicTimestamp(61),
        updated_at: this.getDeterministicTimestamp(61)
      };
      ticketsData.push(saturdayTicket);

      if (this.profile === SEED_CONFIG.PROFILES.FULL) {
        // Transaction 3: Sunday ticket (for full profile)
        const transaction3 = {
          id: 3,
          transaction_id: this.generateTestId('TRANSACTION', 3),
          type: 'tickets',
          status: 'completed',
          amount_cents: 5000, // $50.00
          currency: 'USD',
          stripe_session_id: this.generateTestId('STRIPE_SESSION', 3),
          stripe_payment_intent_id: this.generateTestId('STRIPE_PI', 3),
          stripe_charge_id: this.generateTestId('STRIPE_CHARGE', 3),
          payment_method_type: 'card',
          customer_email: 'sunday-buyer@e2etest.com',
          customer_name: 'Sunday Buyer',
          billing_address: JSON.stringify({
            line1: '789 Sunday Blvd',
            city: 'Boulder',
            state: 'CO',
            postal_code: '80303',
            country: 'US'
          }),
          order_data: JSON.stringify({
            items: [
              { type: 'sunday', quantity: 1, price_cents: 5000 }
            ]
          }),
          session_metadata: JSON.stringify({ test: true }),
          event_id: 'alocubano-boulderfest-2026',
          source: 'website',
          created_at: this.getDeterministicTimestamp(90),
          updated_at: this.getDeterministicTimestamp(90),
          completed_at: this.getDeterministicTimestamp(91)
        };
        transactionsData.push(transaction3);

        const sundayTicket = {
          id: 4,
          ticket_id: this.generateTestId('TICKET', 4),
          transaction_id: transaction3.id,
          ticket_type: 'sunday',
          event_id: 'alocubano-boulderfest-2026',
          event_date: '2026-05-16',
          price_cents: 5000,
          attendee_first_name: 'Sunday',
          attendee_last_name: 'Attendee',
          attendee_email: 'sunday-buyer@e2etest.com',
          attendee_phone: '+1-555-0300',
          status: 'valid',
          validation_code: this.generateTestId('QR', 4),
          checked_in_at: this.getDeterministicTimestamp(120), // Already checked in
          checked_in_by: SEED_CONFIG.ADMIN_EMAIL,
          check_in_location: 'Main Entrance',
          ticket_metadata: JSON.stringify({ test: true, batch: 3, checked_in: true }),
          created_at: this.getDeterministicTimestamp(91),
          updated_at: this.getDeterministicTimestamp(120)
        };
        ticketsData.push(sundayTicket);
      }

      // Insert transactions
      for (const transaction of transactionsData) {
        await client.execute(`
          INSERT OR REPLACE INTO transactions (
            id, transaction_id, type, status, amount_cents, currency,
            stripe_session_id, stripe_payment_intent_id, stripe_charge_id,
            payment_method_type, customer_email, customer_name, billing_address,
            order_data, session_metadata, event_id, source,
            created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          transaction.id, transaction.transaction_id, transaction.type, transaction.status,
          transaction.amount_cents, transaction.currency, transaction.stripe_session_id,
          transaction.stripe_payment_intent_id, transaction.stripe_charge_id,
          transaction.payment_method_type, transaction.customer_email, transaction.customer_name,
          transaction.billing_address, transaction.order_data, transaction.session_metadata,
          transaction.event_id, transaction.source, transaction.created_at,
          transaction.updated_at, transaction.completed_at
        ]);
      }

      // Insert tickets
      for (const ticket of ticketsData) {
        await client.execute(`
          INSERT OR REPLACE INTO tickets (
            id, ticket_id, transaction_id, ticket_type, event_id, event_date,
            price_cents, attendee_first_name, attendee_last_name, attendee_email,
            attendee_phone, status, validation_code, checked_in_at, checked_in_by,
            check_in_location, ticket_metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          ticket.id, ticket.ticket_id, ticket.transaction_id, ticket.ticket_type,
          ticket.event_id, ticket.event_date, ticket.price_cents, ticket.attendee_first_name,
          ticket.attendee_last_name, ticket.attendee_email, ticket.attendee_phone,
          ticket.status, ticket.validation_code, ticket.checked_in_at, ticket.checked_in_by,
          ticket.check_in_location, ticket.ticket_metadata, ticket.created_at, ticket.updated_at
        ]);
      }

      this.seededData.transactions = transactionsData;
      this.seededData.tickets = ticketsData;
      
      console.log(`  ✅ Seeded ${transactionsData.length} transactions and ${ticketsData.length} tickets`);
      return { seeded: true, transactions: transactionsData.length, tickets: ticketsData.length };
    } catch (error) {
      console.error('❌ Tickets and transactions seeding failed:', error.message);
      throw error;
    }
  }

  /**
   * Seed newsletter subscribers
   */
  async seedNewsletterSubscribers() {
    console.log('📧 Seeding newsletter subscribers...');
    
    const client = await this.initializeClient();
    
    try {
      // Check if email_subscribers table exists
      try {
        await client.execute('SELECT 1 FROM email_subscribers LIMIT 1');
      } catch (error) {
        console.warn('  ⚠️  email_subscribers table not found, skipping newsletter seeding');
        return { skipped: true, reason: 'table_not_found' };
      }

      const subscribersData = [
        {
          id: 1,
          email: 'active-subscriber@e2etest.com',
          first_name: 'Active',
          last_name: 'Subscriber',
          status: 'active',
          subscribed_at: this.getDeterministicTimestamp(10),
          unsubscribed_at: null,
          bounce_count: 0,
          last_bounce_at: null,
          source: 'test-seed',
          preferences: JSON.stringify({ newsletter: true, events: true }),
          tags: 'test,active'
        },
        {
          id: 2,
          email: 'unsubscribed@e2etest.com',
          first_name: 'Unsubscribed',
          last_name: 'User',
          status: 'unsubscribed',
          subscribed_at: this.getDeterministicTimestamp(5),
          unsubscribed_at: this.getDeterministicTimestamp(15),
          bounce_count: 0,
          last_bounce_at: null,
          source: 'test-seed',
          preferences: JSON.stringify({ newsletter: false, events: false }),
          tags: 'test,unsubscribed'
        }
      ];

      if (this.profile === SEED_CONFIG.PROFILES.FULL) {
        subscribersData.push({
          id: 3,
          email: 'bounced-subscriber@e2etest.com',
          first_name: 'Bounced',
          last_name: 'Email',
          status: 'bounced',
          subscribed_at: this.getDeterministicTimestamp(8),
          unsubscribed_at: null,
          bounce_count: 3,
          last_bounce_at: this.getDeterministicTimestamp(20),
          source: 'test-seed',
          preferences: JSON.stringify({ newsletter: true, events: true }),
          tags: 'test,bounced'
        });
      }

      for (const subscriber of subscribersData) {
        await client.execute(`
          INSERT OR REPLACE INTO email_subscribers (
            id, email, first_name, last_name, status, subscribed_at,
            unsubscribed_at, bounce_count, last_bounce_at, source, preferences, tags
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          subscriber.id, subscriber.email, subscriber.first_name, subscriber.last_name,
          subscriber.status, subscriber.subscribed_at, subscriber.unsubscribed_at,
          subscriber.bounce_count, subscriber.last_bounce_at, subscriber.source,
          subscriber.preferences, subscriber.tags
        ]);
      }

      this.seededData.subscribers = subscribersData;
      console.log(`  ✅ Seeded ${subscribersData.length} newsletter subscribers`);
      return { seeded: true, count: subscribersData.length };
    } catch (error) {
      console.error('❌ Newsletter subscribers seeding failed:', error.message);
      throw error;
    }
  }

  /**
   * Seed registration data
   */
  async seedRegistrations() {
    console.log('📝 Seeding registration data...');
    
    const client = await this.initializeClient();
    
    try {
      // Check if registrations table exists
      try {
        await client.execute('SELECT 1 FROM registrations LIMIT 1');
      } catch (error) {
        console.warn('  ⚠️  registrations table not found, skipping registrations seeding');
        return { skipped: true, reason: 'table_not_found' };
      }

      // Only seed if we have tickets
      if (!this.seededData.tickets || this.seededData.tickets.length === 0) {
        console.warn('  ⚠️  No tickets found, skipping registrations seeding');
        return { skipped: true, reason: 'no_tickets' };
      }

      const registrationsData = [];
      
      // Create registrations for first two tickets (weekend package)
      for (let i = 0; i < Math.min(2, this.seededData.tickets.length); i++) {
        const ticket = this.seededData.tickets[i];
        const registration = {
          id: i + 1,
          ticket_id: ticket.ticket_id,
          email: ticket.attendee_email,
          first_name: ticket.attendee_first_name,
          last_name: ticket.attendee_last_name,
          ticket_type: ticket.ticket_type,
          dietary_restrictions: i === 0 ? 'Vegetarian' : null,
          accessibility_needs: i === 1 ? 'Wheelchair accessible seating' : null,
          emergency_contact_name: `Emergency Contact ${i + 1}`,
          emergency_contact_phone: `+1-555-0${i + 1}00`,
          registration_date: this.getDeterministicTimestamp(35 + i),
          is_primary_purchaser: i === 0 ? 1 : 0,
          transaction_id: ticket.transaction_id,
          status: 'registered',
          checked_in_at: null,
          notes: `Test registration ${i + 1}`
        };
        registrationsData.push(registration);
      }

      for (const registration of registrationsData) {
        await client.execute(`
          INSERT OR REPLACE INTO registrations (
            id, ticket_id, email, first_name, last_name, ticket_type,
            dietary_restrictions, accessibility_needs, emergency_contact_name,
            emergency_contact_phone, registration_date, is_primary_purchaser,
            transaction_id, status, checked_in_at, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          registration.id, registration.ticket_id, registration.email,
          registration.first_name, registration.last_name, registration.ticket_type,
          registration.dietary_restrictions, registration.accessibility_needs,
          registration.emergency_contact_name, registration.emergency_contact_phone,
          registration.registration_date, registration.is_primary_purchaser,
          registration.transaction_id, registration.status, registration.checked_in_at,
          registration.notes
        ]);
      }

      this.seededData.registrations = registrationsData;
      console.log(`  ✅ Seeded ${registrationsData.length} registrations`);
      return { seeded: true, count: registrationsData.length };
    } catch (error) {
      console.error('❌ Registrations seeding failed:', error.message);
      throw error;
    }
  }

  /**
   * Seed gallery test data references
   */
  async seedGalleryData() {
    console.log('🖼️  Seeding gallery test data...');
    
    // Gallery data is usually external (Google Drive)
    // We'll create mock references for testing
    
    const galleryTestData = {
      years: ['2024', '2025'],
      photos: [
        {
          id: this.generateTestId('PHOTO', 1),
          name: 'test-photo-1.jpg',
          webViewLink: `https://drive.google.com/file/d/${this.generateTestId('PHOTO', 1)}/view`,
          thumbnailLink: `https://lh3.googleusercontent.com/d/${this.generateTestId('PHOTO', 1)}=s220`,
          year: '2025',
          mimeType: 'image/jpeg'
        },
        {
          id: this.generateTestId('PHOTO', 2),
          name: 'test-photo-2.jpg',
          webViewLink: `https://drive.google.com/file/d/${this.generateTestId('PHOTO', 2)}/view`,
          thumbnailLink: `https://lh3.googleusercontent.com/d/${this.generateTestId('PHOTO', 2)}=s220`,
          year: '2025',
          mimeType: 'image/jpeg'
        }
      ]
    };

    this.seededData.gallery = galleryTestData;
    console.log(`  ✅ Gallery test data references prepared (${galleryTestData.photos.length} photos)`);
    return { seeded: true, photos: galleryTestData.photos.length };
  }

  /**
   * Validate seeded data
   */
  async validateSeededData() {
    console.log('✅ Validating seeded data...');
    
    const client = await this.initializeClient();
    const validation = {
      admin: { exists: false, count: 0 },
      transactions: { exists: false, count: 0 },
      tickets: { exists: false, count: 0 },
      subscribers: { exists: false, count: 0 },
      registrations: { exists: false, count: 0 }
    };

    try {
      // Validate admin sessions
      try {
        const adminResult = await client.execute(
          `SELECT COUNT(*) as count FROM admin_sessions WHERE email LIKE '%@e2etest.com'`
        );
        validation.admin.exists = true;
        validation.admin.count = adminResult.rows[0]?.count || 0;
      } catch (error) {
        // Table doesn't exist
      }

      // Validate transactions
      try {
        const transactionResult = await client.execute(
          `SELECT COUNT(*) as count FROM transactions WHERE transaction_id LIKE '${SEED_CONFIG.TEST_PREFIX}%'`
        );
        validation.transactions.exists = true;
        validation.transactions.count = transactionResult.rows[0]?.count || 0;
      } catch (error) {
        // Table doesn't exist
      }

      // Validate tickets
      try {
        const ticketResult = await client.execute(
          `SELECT COUNT(*) as count FROM tickets WHERE ticket_id LIKE '${SEED_CONFIG.TEST_PREFIX}%'`
        );
        validation.tickets.exists = true;
        validation.tickets.count = ticketResult.rows[0]?.count || 0;
      } catch (error) {
        // Table doesn't exist
      }

      // Validate subscribers
      try {
        const subscriberResult = await client.execute(
          `SELECT COUNT(*) as count FROM email_subscribers WHERE email LIKE '%@e2etest.com'`
        );
        validation.subscribers.exists = true;
        validation.subscribers.count = subscriberResult.rows[0]?.count || 0;
      } catch (error) {
        // Table doesn't exist
      }

      // Validate registrations
      try {
        const registrationResult = await client.execute(
          `SELECT COUNT(*) as count FROM registrations WHERE email LIKE '%@e2etest.com'`
        );
        validation.registrations.exists = true;
        validation.registrations.count = registrationResult.rows[0]?.count || 0;
      } catch (error) {
        // Table doesn't exist
      }

      console.log('  📊 Validation results:');
      for (const [type, result] of Object.entries(validation)) {
        if (result.exists) {
          console.log(`    ${type}: ${result.count} records`);
        } else {
          console.log(`    ${type}: table not found`);
        }
      }

      return validation;
    } catch (error) {
      console.error('❌ Data validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Main seeding method
   */
  async seedData(profile = SEED_CONFIG.PROFILES.STANDARD) {
    const startTime = Date.now();
    this.profile = profile;
    
    console.log(`\n🌱 Test Data Seeding Starting (Profile: ${profile})\n`);
    
    try {
      // Initialize client
      await this.initializeClient();
      
      // Clear existing seed data (idempotent)
      await this.clearExistingSeedData();
      
      const results = {};
      
      // Seed based on profile
      if (profile === SEED_CONFIG.PROFILES.MINIMAL) {
        // Just admin user
        results.admin = await this.seedAdminUser();
      } else if (profile === SEED_CONFIG.PROFILES.STANDARD) {
        // Common test scenarios
        results.admin = await this.seedAdminUser();
        results.tickets = await this.seedTicketsAndTransactions();
        results.subscribers = await this.seedNewsletterSubscribers();
        results.registrations = await this.seedRegistrations();
        results.gallery = await this.seedGalleryData();
      } else if (profile === SEED_CONFIG.PROFILES.FULL) {
        // All possible test data
        results.admin = await this.seedAdminUser();
        results.tickets = await this.seedTicketsAndTransactions();
        results.subscribers = await this.seedNewsletterSubscribers();
        results.registrations = await this.seedRegistrations();
        results.gallery = await this.seedGalleryData();
      }
      
      // Validate seeded data
      const validation = await this.validateSeededData();
      
      const duration = Date.now() - startTime;
      
      console.log(`\n✅ Test Data Seeding Complete (${duration}ms)`);
      console.log(`   Profile: ${profile}`);
      console.log(`   Duration: ${duration}ms\n`);
      
      return {
        success: true,
        profile,
        duration,
        results,
        validation,
        seededData: this.seededData
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`\n❌ Test Data Seeding Failed (${duration}ms):`);
      console.error(`   ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Get seeded data for tests
   */
  getSeededData() {
    return {
      ...this.seededData,
      config: {
        adminEmail: SEED_CONFIG.ADMIN_EMAIL,
        testPassword: SEED_CONFIG.TEST_ADMIN_PASSWORD,
        testPrefix: SEED_CONFIG.TEST_PREFIX
      }
    };
  }
}

/**
 * Convenience functions for different profiles
 */
export const seedMinimalData = () => new TestDataSeeder().seedData(SEED_CONFIG.PROFILES.MINIMAL);
export const seedStandardData = () => new TestDataSeeder().seedData(SEED_CONFIG.PROFILES.STANDARD);
export const seedFullData = () => new TestDataSeeder().seedData(SEED_CONFIG.PROFILES.FULL);

/**
 * Main seeding function with profile selection
 */
export async function seedTestData(profile = SEED_CONFIG.PROFILES.STANDARD) {
  const seeder = new TestDataSeeder();
  return seeder.seedData(profile);
}

/**
 * Get test data constants for use in tests
 */
export function getTestDataConstants() {
  return {
    ADMIN_EMAIL: SEED_CONFIG.ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD: SEED_CONFIG.TEST_ADMIN_PASSWORD,
    TEST_PREFIX: SEED_CONFIG.TEST_PREFIX,
    PROFILES: SEED_CONFIG.PROFILES
  };
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Test Data Seeding System - A Lo Cubano Boulder Fest

Usage: node scripts/seed-test-data.js [profile]

Profiles:
  minimal    Just admin user for authentication tests
  standard   Common test scenarios (default)
  full       All possible test data

Examples:
  node scripts/seed-test-data.js
  node scripts/seed-test-data.js minimal
  node scripts/seed-test-data.js full

The seeded data is idempotent and deterministic - safe to run multiple times.
    `);
    return;
  }
  
  const profile = args[0] || SEED_CONFIG.PROFILES.STANDARD;
  
  // Validate profile
  if (!Object.values(SEED_CONFIG.PROFILES).includes(profile)) {
    console.error(`❌ Invalid profile: ${profile}`);
    console.error(`Valid profiles: ${Object.values(SEED_CONFIG.PROFILES).join(', ')}`);
    process.exit(1);
  }
  
  try {
    const result = await seedTestData(profile);
    console.log('📊 Seeding Summary:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run CLI if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

// Export configuration and seeder class for testing
export { SEED_CONFIG, TestDataSeeder };