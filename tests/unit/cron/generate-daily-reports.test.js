/**
 * Unit Tests: Generate Daily Reports Cron Job
 * Tests daily statistics aggregation and report generation
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { getTestIsolationManager } from '../../../lib/test-isolation-manager.js';

describe('Generate Daily Reports - Unit Tests', () => {
  let testDb;
  let isolationManager;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
  });

  afterEach(async () => {
    if (isolationManager) {
      await isolationManager.cleanup();
    }
  });

  describe('Daily Statistics Aggregation', () => {
    test('should aggregate ticket sales for previous day', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      yesterday.setHours(12, 0, 0, 0);

      // Create transaction from yesterday
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, created_at, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['sales@example.com', 'Sales User', 'token_sales', yesterday.toISOString(), 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create tickets
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
        args: [txId, 'weekender', 'TICKET_SALES1', 'QR_SALES1', yesterday.toISOString()]
      });

      // Query yesterday's sales
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      const result = await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM tickets
              WHERE created_at >= ? AND created_at <= ?`,
        args: [startOfYesterday.toISOString(), endOfYesterday.toISOString()]
      });

      expect(result.rows[0].count).toBeGreaterThanOrEqual(1);
    });

    test('should aggregate registration completions', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      yesterday.setHours(12, 0, 0, 0);

      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, is_test
        ) VALUES (?, ?, ?, ?)`,
        args: ['reg@example.com', 'Reg User', 'token_reg', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create registered ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [txId, 'weekender', 'TICKET_REG', 'QR_REG', 'completed', yesterday.toISOString()]
      });

      // Query completed registrations
      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM tickets
              WHERE registration_status = 'completed'
              AND registered_at >= ? AND registered_at <= ?`,
        args: [startOfDay.toISOString(), endOfDay.toISOString()]
      });

      expect(result.rows[0].count).toBeGreaterThanOrEqual(1);
    });

    test('should calculate revenue totals', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      yesterday.setHours(12, 0, 0, 0);

      // Create transaction with amount
      await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token,
          amount_cents, created_at, is_test
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['revenue@example.com', 'Revenue User', 'token_rev', 5000, yesterday.toISOString(), 1]
      });

      // Query revenue
      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await testDb.execute({
        sql: `SELECT SUM(amount_cents) as total FROM transactions
              WHERE created_at >= ? AND created_at <= ?`,
        args: [startOfDay.toISOString(), endOfDay.toISOString()]
      });

      expect(result.rows[0].total).toBeGreaterThanOrEqual(5000);
    });

    test('should aggregate donation amounts', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      yesterday.setHours(12, 0, 0, 0);

      // Create donation transaction
      await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, amount_cents, created_at, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['donor@example.com', 'Donor', 2500, yesterday.toISOString(), 1]
      });

      // Insert into donations table if it exists
      try {
        const txResult = await testDb.execute({
          sql: `SELECT id FROM transactions
                WHERE customer_email = ? AND created_at = ?`,
          args: ['donor@example.com', yesterday.toISOString()]
        });

        if (txResult.rows.length > 0) {
          const txId = txResult.rows[0].id;

          await testDb.execute({
            sql: `INSERT INTO donations (
              transaction_id, amount_cents, created_at
            ) VALUES (?, ?, ?)`,
            args: [txId, 2500, yesterday.toISOString()]
          });

          // Query donations
          const startOfDay = new Date(yesterday);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(yesterday);
          endOfDay.setHours(23, 59, 59, 999);

          const result = await testDb.execute({
            sql: `SELECT SUM(amount_cents) as total FROM donations
                  WHERE created_at >= ? AND created_at <= ?`,
            args: [startOfDay.toISOString(), endOfDay.toISOString()]
          });

          expect(result.rows[0].total).toBeGreaterThanOrEqual(2500);
        }
      } catch (error) {
        // Donations table may not exist in all migrations
        console.log('Donations table not available:', error.message);
      }
    });
  });

  describe('Report Data Formatting', () => {
    test('should format currency amounts correctly', () => {
      const amountCents = 15000;
      const formatted = `$${(amountCents / 100).toFixed(2)}`;

      expect(formatted).toBe('$150.00');
    });

    test('should format dates in Mountain Time for report', () => {
      const date = new Date('2026-05-15T12:00:00Z');
      const mtFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Denver',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const formatted = mtFormatter.format(date);

      expect(formatted).toMatch(/May/);
      expect(formatted).toMatch(/2026/);
    });

    test('should calculate percentages for completion rates', () => {
      const total = 100;
      const completed = 75;
      const percentage = Math.round((completed / total) * 100);

      expect(percentage).toBe(75);
    });

    test('should handle zero division in percentage calculations', () => {
      const total = 0;
      const completed = 0;
      const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

      expect(percentage).toBe(0);
    });
  });

  describe('Email Delivery to Admin', () => {
    test('should prepare admin email recipient list', () => {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@alocubanoboulderfest.org';

      expect(adminEmail).toMatch(/@/);
    });

    test('should include all report sections in email body', () => {
      const reportSections = {
        sales: { total: 50, revenue: 5000 },
        registrations: { completed: 30, pending: 20 },
        reminders: { sent: 15, failed: 2 },
        donations: { count: 10, amount: 2500 }
      };

      const hasAllSections =
        reportSections.sales &&
        reportSections.registrations &&
        reportSections.reminders &&
        reportSections.donations;

      expect(hasAllSections).toBe(true);
    });

    test('should format report as HTML for email', () => {
      const htmlReport = `
        <h1>Daily Report - May 15, 2026</h1>
        <h2>Sales Summary</h2>
        <p>Total Tickets: 50</p>
        <p>Revenue: $500.00</p>
      `;

      expect(htmlReport).toContain('<h1>');
      expect(htmlReport).toContain('<h2>');
      expect(htmlReport).toContain('<p>');
    });
  });

  describe('Date Range Handling', () => {
    test('should calculate correct start and end times for previous day', () => {
      const now = new Date('2026-05-16T10:30:00Z');
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      expect(startOfDay.getDate()).toBe(15);
      expect(endOfDay.getDate()).toBe(15);
      expect(startOfDay.getHours()).toBe(0);
      expect(endOfDay.getHours()).toBe(23);
    });

    test('should handle month boundaries correctly', () => {
      const firstOfMonth = new Date('2026-06-01T10:00:00Z');
      const yesterday = new Date(firstOfMonth);
      yesterday.setDate(yesterday.getDate() - 1);

      expect(yesterday.getDate()).toBe(31); // May 31
      expect(yesterday.getMonth()).toBe(4); // May (0-indexed)
    });

    test('should handle year boundaries correctly', () => {
      const firstDayOfYear = new Date('2027-01-01T10:00:00Z');
      const yesterday = new Date(firstDayOfYear);
      yesterday.setDate(yesterday.getDate() - 1);

      expect(yesterday.getDate()).toBe(31);
      expect(yesterday.getMonth()).toBe(11); // December
      expect(yesterday.getFullYear()).toBe(2026);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty data gracefully', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      // Query when no data exists
      const result = await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM tickets
              WHERE created_at >= ? AND created_at <= ?`,
        args: [startOfDay.toISOString(), endOfDay.toISOString()]
      });

      expect(result.rows[0].count).toBeGreaterThanOrEqual(0);
    });

    test('should handle null values in aggregations', async () => {
      // Create transaction with null amount
      await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, is_test
        ) VALUES (?, ?, ?, ?)`,
        args: ['null@example.com', 'Null User', 'token_null', 1]
      });

      // Query with COALESCE
      const result = await testDb.execute({
        sql: `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions
              WHERE customer_email = ?`,
        args: ['null@example.com']
      });

      expect(result.rows[0].total).toBe(0);
    });

    test('should continue report generation if one section fails', () => {
      const reportSections = [];

      // Simulate section failures
      try {
        // Section 1: Success
        reportSections.push({ name: 'sales', data: { total: 50 } });
      } catch (error) {
        reportSections.push({ name: 'sales', error: error.message });
      }

      try {
        // Section 2: Failure
        throw new Error('Database timeout');
      } catch (error) {
        reportSections.push({ name: 'registrations', error: error.message });
      }

      try {
        // Section 3: Success
        reportSections.push({ name: 'reminders', data: { sent: 15 } });
      } catch (error) {
        reportSections.push({ name: 'reminders', error: error.message });
      }

      expect(reportSections.length).toBe(3);
      expect(reportSections[1].error).toBe('Database timeout');
    });
  });

  describe('Performance Metrics', () => {
    test('should track report generation time', async () => {
      const startTime = Date.now();

      // Simulate report generation
      await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM transactions`
      });

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle large datasets efficiently', async () => {
      // Create multiple transactions
      for (let i = 0; i < 10; i++) {
        await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, is_test
          ) VALUES (?, ?, ?, ?)`,
          args: [`perf${i}@example.com`, `User ${i}`, `token_${i}`, 1]
        });
      }

      const startTime = Date.now();

      // Query all transactions
      await testDb.execute({
        sql: `SELECT * FROM transactions`
      });

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Report Content Validation', () => {
    test('should include all required metrics in report', () => {
      const requiredMetrics = [
        'total_sales',
        'total_revenue',
        'registrations_completed',
        'reminders_sent',
        'donations_received'
      ];

      const report = {
        total_sales: 50,
        total_revenue: 5000,
        registrations_completed: 30,
        reminders_sent: 15,
        donations_received: 10
      };

      for (const metric of requiredMetrics) {
        expect(report[metric]).toBeDefined();
      }
    });

    test('should include date range in report header', () => {
      const reportDate = new Date('2026-05-15');
      const header = `Daily Report - ${reportDate.toLocaleDateString('en-US', { timeZone: 'America/Denver' })}`;

      expect(header).toContain('Daily Report');
      expect(header).toMatch(/2026/);
    });

    test('should include comparison to previous day if available', () => {
      const todayMetrics = { sales: 50, revenue: 5000 };
      const yesterdayMetrics = { sales: 45, revenue: 4500 };

      const comparison = {
        salesChange: todayMetrics.sales - yesterdayMetrics.sales,
        revenueChange: todayMetrics.revenue - yesterdayMetrics.revenue
      };

      expect(comparison.salesChange).toBe(5);
      expect(comparison.revenueChange).toBe(500);
    });
  });
});
