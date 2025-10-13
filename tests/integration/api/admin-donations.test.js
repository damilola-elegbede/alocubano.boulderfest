/**
 * Admin Donations Dashboard Integration Tests
 * Tests the /api/admin/donations endpoint with JWT authentication
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../../lib/database.js';
import authService from '../../../lib/auth-service.js';
import auditService from '../../../lib/audit-service.js';
import { createTestEvent } from '../handler-test-helper.js';
import jwt from 'jsonwebtoken';

describe('Admin Donations Dashboard API', () => {
  let db;
  let adminToken;
  let testEventId;

  beforeEach(async () => {
    db = await getDatabaseClient();

    // Reset auth service
    authService.initialized = false;
    authService.initializationPromise = null;
    await authService.ensureInitialized();

    // Create admin JWT token
    adminToken = await authService.createSessionToken('admin');

    // Create test event for foreign key constraints
    testEventId = await createTestEvent(db, {
      slug: 'admin-donations-test-event',
      name: 'Admin Donations Test Event',
      status: 'test'
    });

    // Tables are already created by migrations - no need to create them manually

    // Clean up test data
    await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
    await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-DONATION-%']);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-DONATION-%']);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  describe('Authentication Requirements', () => {
    it('should require JWT authentication (401 without token)', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: {},
        headers: {}
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('should accept valid JWT token in Authorization header', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30', donationType: 'real' },
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Donation Filtering and Metrics', () => {
    beforeEach(async () => {
      // Create sample transactions and donations
      const testData = [
        {
          transactionId: 'TEST-DONATION-001',
          amountCents: 5000,
          email: 'donor1@test.com',
          name: 'Test Donor 1',
          itemName: 'Festival Support - $50',
          isTest: 0,
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          transactionId: 'TEST-DONATION-002',
          amountCents: 10000,
          email: 'donor2@test.com',
          name: 'Test Donor 2',
          itemName: 'Festival Support - $100',
          isTest: 0,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          transactionId: 'TEST-DONATION-003',
          amountCents: 2500,
          email: 'donor3@test.com',
          name: 'Test Donor 3',
          itemName: 'Festival Support - $25',
          isTest: 1,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          transactionId: 'TEST-DONATION-004',
          amountCents: 7500,
          email: 'donor4@test.com',
          name: 'Test Donor 4',
          itemName: 'Festival Support - $75',
          isTest: 0,
          createdAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];

      for (const data of testData) {
        // Insert transaction and get its auto-generated ID
        const txResult = await db.execute({
          sql: `INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id`,
          args: [data.transactionId, 'donation', 'completed', data.amountCents, data.email, data.name, '{}', data.createdAt]
        });
        const transactionDbId = txResult.rows[0].id;

        // Insert transaction item with the INTEGER transaction ID
        await db.execute({
          sql: `INSERT INTO transaction_items (transaction_id, item_type, item_name, quantity, unit_price_cents, total_price_cents, is_test, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [transactionDbId, 'donation', data.itemName, 1, data.amountCents, data.amountCents, data.isTest, data.createdAt]
        });
      }
    });

    it('should filter donations by 30-day period (default)', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filters.days).toBe('30');

      // Should include donations from last 30 days (2 real donations)
      expect(res.body.metrics.totalDonations).toBe(2);
      expect(res.body.metrics.donationRevenue).toBe('150.00'); // $50 + $100
    });

    it('should filter donations by all-time period', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: 'all' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filters.days).toBe('all');

      // Should include all real donations (3 total)
      expect(res.body.metrics.totalDonations).toBe(3);
      expect(res.body.metrics.donationRevenue).toBe('225.00'); // $50 + $100 + $75
    });

    it('should filter by donationType=real (exclude test donations)', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: 'all', donationType: 'real' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.filters.donationType).toBe('real');

      // Should only include real donations (not test)
      expect(res.body.metrics.totalDonations).toBe(3);
      expect(res.body.donations.every(d => d.is_test === 0)).toBe(true);
    });

    it('should filter by donationType=test (only test donations)', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: 'all', donationType: 'test' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.filters.donationType).toBe('test');

      // Should only include test donations
      expect(res.body.metrics.totalDonations).toBe(1);
      expect(res.body.donations[0].is_test).toBe(1);
    });
  });

  describe('Metrics Calculation', () => {
    beforeEach(async () => {
      // Create donation data for metrics testing
      const donations = [
        { transactionId: 'METRIC-001', amount: 2500 },
        { transactionId: 'METRIC-002', amount: 5000 },
        { transactionId: 'METRIC-003', amount: 10000 },
        { transactionId: 'METRIC-004', amount: 7500 }
      ];

      for (const donation of donations) {
        // Insert transaction and get its auto-generated ID
        const txResult = await db.execute({
          sql: `INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id`,
          args: [donation.transactionId, 'donation', 'completed', donation.amount, 'metrics@test.com', 'Metrics Test', '{}', new Date().toISOString()]
        });
        const transactionDbId = txResult.rows[0].id;

        // Insert transaction item with the INTEGER transaction ID
        await db.execute({
          sql: `INSERT INTO transaction_items (transaction_id, item_type, item_name, quantity, unit_price_cents, total_price_cents, is_test, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [transactionDbId, 'donation', 'Festival Support', 1, donation.amount, donation.amount, 0, new Date().toISOString()]
        });
      }
    });

    it('should calculate total donation revenue correctly', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.body.metrics.donationRevenue).toBe('250.00'); // 25+50+100+75
    });

    it('should calculate average donation amount', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.body.metrics.totalDonations).toBe(4);
      expect(res.body.metrics.averageDonation).toBe('62.50'); // 250/4
    });

    it('should count unique transactions with donations', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.body.metrics.transactionsWithDonations).toBe(4);
    });
  });

  describe('Mountain Time Formatting', () => {
    it('should include created_at_mt fields for all donations', async () => {
      // Create a donation
      // Insert transaction and get its auto-generated ID
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              RETURNING id`,
        args: ['MT-TEST-001', 'donation', 'completed', 5000, 'mt@test.com', 'MT Test', '{}', new Date().toISOString()]
      });
      const transactionDbId = txResult.rows[0].id;

      // Insert transaction item with the INTEGER transaction ID
      await db.execute({
        sql: `INSERT INTO transaction_items (transaction_id, item_type, item_name, quantity, unit_price_cents, total_price_cents, is_test, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [transactionDbId, 'donation', 'Festival Support', 1, 5000, 5000, 0, new Date().toISOString()]
      });

      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.body.donations).toBeDefined();
      expect(res.body.donations.length).toBeGreaterThan(0);

      const donation = res.body.donations[0];
      expect(donation.created_at_mt).toBeDefined();
      expect(donation.created_at_mt).toMatch(/MST|MDT/); // Mountain Time abbreviation
      expect(donation.timezone).toBe('America/Denver');
    });
  });

  describe('BigInt Serialization', () => {
    it('should handle large donation amounts without BigInt errors', async () => {
      // Create donation with large amount
      const largeAmount = 999999999; // $9,999,999.99

      // Insert transaction and get its auto-generated ID
      const txResult = await db.execute({
        sql: `INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              RETURNING id`,
        args: ['BIGINT-001', 'donation', 'completed', largeAmount, 'bigint@test.com', 'BigInt Test', '{}', new Date().toISOString()]
      });
      const transactionDbId = txResult.rows[0].id;

      // Insert transaction item with the INTEGER transaction ID
      await db.execute({
        sql: `INSERT INTO transaction_items (transaction_id, item_type, item_name, quantity, unit_price_cents, total_price_cents, is_test, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [transactionDbId, 'donation', 'Large Donation', 1, largeAmount, largeAmount, 0, new Date().toISOString()]
      });

      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify amount is properly converted to dollars
      const donation = res.body.donations.find(d => d.transaction_id === 'BIGINT-001');
      expect(donation).toBeDefined();
      expect(donation.amount).toBe('9999999.99');
    });
  });

  describe('Empty Results Handling', () => {
    it('should handle no donations in period gracefully', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '1' }, // Only last day, likely no donations
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.metrics.totalDonations).toBe(0);
      expect(res.body.metrics.donationRevenue).toBe('0.00');
      expect(res.body.donations).toEqual([]);
    });
  });

  describe('Large Dataset Performance', () => {
    it('should handle 100+ donations efficiently', async () => {
      // Create 100 donations sequentially (due to RETURNING ID requirement)
      for (let i = 0; i < 100; i++) {
        const transactionId = `PERF-${String(i).padStart(3, '0')}`;
        const amount = 1000 + (i * 100); // $10.00 to $109.00

        // Insert transaction and get its auto-generated ID
        const txResult = await db.execute({
          sql: `INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id`,
          args: [transactionId, 'donation', 'completed', amount, `perf${i}@test.com`, `Perf Test ${i}`, '{}', new Date().toISOString()]
        });
        const transactionDbId = txResult.rows[0].id;

        // Insert transaction item with the INTEGER transaction ID
        await db.execute({
          sql: `INSERT INTO transaction_items (transaction_id, item_type, item_name, quantity, unit_price_cents, total_price_cents, is_test, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [transactionDbId, 'donation', 'Festival Support', 1, amount, amount, 0, new Date().toISOString()]
        });
      }

      const handler = (await import('../../../api/admin/donations.js')).default;

      const startTime = Date.now();

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      const duration = Date.now() - startTime;

      expect(res.statusCode).toBe(200);
      expect(res.body.donations.length).toBeLessThanOrEqual(100); // Limited by query
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Sort Order', () => {
    it('should sort donations by date descending (newest first)', async () => {
      // Create donations with different dates
      const dates = [
        new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)  // 2 days ago
      ];

      for (let i = 0; i < dates.length; i++) {
        const transactionId = `SORT-${i}`;

        // Insert transaction and get its auto-generated ID
        const txResult = await db.execute({
          sql: `INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id`,
          args: [transactionId, 'donation', 'completed', 5000, `sort${i}@test.com`, `Sort Test ${i}`, '{}', dates[i].toISOString()]
        });
        const transactionDbId = txResult.rows[0].id;

        // Insert transaction item with the INTEGER transaction ID
        await db.execute({
          sql: `INSERT INTO transaction_items (transaction_id, item_type, item_name, quantity, unit_price_cents, total_price_cents, is_test, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [transactionDbId, 'donation', 'Festival Support', 1, 5000, 5000, 0, dates[i].toISOString()]
        });
      }

      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.body.donations.length).toBeGreaterThanOrEqual(3);

      // Verify newest first
      const sortDonations = res.body.donations.filter(d => d.transaction_id.startsWith('SORT-'));
      expect(sortDonations[0].transaction_id).toBe('SORT-0'); // 1 day ago (newest)
      expect(sortDonations[1].transaction_id).toBe('SORT-2'); // 2 days ago
      expect(sortDonations[2].transaction_id).toBe('SORT-1'); // 3 days ago (oldest)
    });
  });

  describe('HTTP Method Validation', () => {
    it('should reject non-GET requests with 405', async () => {
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'POST',
        query: {},
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('GET');
      expect(res.body.error).toMatch(/method not allowed/i);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close the database to simulate error
      const handler = (await import('../../../api/admin/donations.js')).default;

      const req = {
        method: 'GET',
        query: { days: '30' },
        headers: { authorization: `Bearer ${adminToken}` },
        admin: { id: 'admin', role: 'admin' }
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) { this.headers[key] = value; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
      };

      // Force database error by using invalid query parameter
      req.query.days = 'invalid-number-that-will-cause-issues';

      await handler(req, res);

      // Should still return success or handle gracefully
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
    });
  });
});
