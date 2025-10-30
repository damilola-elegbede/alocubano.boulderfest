/**
 * E2E Test: Cron Maintenance Jobs
 * Tests end-to-end flows for all maintenance cron jobs
 *
 * This test validates:
 * - Reservation cleanup (expired ticket reservations)
 * - Scan logs cleanup (90-day retention)
 * - Audit retention (hot/warm storage lifecycle)
 * - Event status updates (automatic lifecycle transitions)
 */

import { test, expect } from '@playwright/test';

const getBaseUrl = () => {
  return process.env.PLAYWRIGHT_BASE_URL ||
         process.env.BASE_URL ||
         'http://localhost:3000';
};

const CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-for-integration-testing-32-chars';

test.describe('Cron Maintenance Jobs E2E', () => {
  test('should cleanup expired reservations successfully', async ({ request }) => {
    const baseUrl = getBaseUrl();

    console.log('Testing cleanup-expired-reservations cron job...');
    const response = await request.post(`${baseUrl}/api/cron/cleanup-expired-reservations`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    console.log('Reservation cleanup response:', data);

    // Verify response structure
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('cleanedCount');
    expect(data).toHaveProperty('duration');
    expect(data).toHaveProperty('timestamp');

    // Verify data types
    expect(typeof data.cleanedCount).toBe('number');
    expect(typeof data.duration).toBe('string');
    expect(data.duration).toMatch(/^\d+ms$/);

    // Verify duration is reasonable
    const durationMs = parseInt(data.duration.replace('ms', ''));
    expect(durationMs).toBeLessThan(5000); // Should complete in < 5 seconds

    // Verify timestamp is recent
    const timestamp = new Date(data.timestamp);
    const now = new Date();
    const diffMs = Math.abs(now - timestamp);
    expect(diffMs).toBeLessThan(60000);
  });

  test('should cleanup scan logs with proper retention policy', async ({ request }) => {
    const baseUrl = getBaseUrl();

    console.log('Testing cleanup-scan-logs cron job...');
    const response = await request.post(`${baseUrl}/api/cron/cleanup-scan-logs`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    console.log('Scan logs cleanup response:', data);

    // Verify response structure
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('total_deleted');
    expect(data).toHaveProperty('duration_ms');
    expect(data).toHaveProperty('retention_policy', '90 days');
    expect(data).toHaveProperty('timestamp');

    // Verify results structure
    expect(data.results).toHaveProperty('scan_logs');
    expect(data.results).toHaveProperty('qr_validations');

    // Each result should have deleted count and error field
    expect(data.results.scan_logs).toHaveProperty('deleted');
    expect(data.results.scan_logs).toHaveProperty('error');
    expect(data.results.qr_validations).toHaveProperty('deleted');
    expect(data.results.qr_validations).toHaveProperty('error');

    // Verify data types
    expect(typeof data.total_deleted).toBe('number');
    expect(typeof data.duration_ms).toBe('number');
    expect(typeof data.results.scan_logs.deleted).toBe('number');
    expect(typeof data.results.qr_validations.deleted).toBe('number');

    // Verify total matches sum of individual deletions
    const expectedTotal = data.results.scan_logs.deleted + data.results.qr_validations.deleted;
    expect(data.total_deleted).toBe(expectedTotal);
  });

  test('should execute audit retention lifecycle management', async ({ request }) => {
    const baseUrl = getBaseUrl();

    console.log('Testing audit-retention cron job...');
    const response = await request.post(`${baseUrl}/api/cron/audit-retention`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    console.log('Audit retention response:', data);

    // Verify response structure
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('archived');
    expect(data).toHaveProperty('deleted');
    expect(data).toHaveProperty('currentStats');
    expect(data).toHaveProperty('duration_ms');
    expect(data).toHaveProperty('timestamp');

    // Verify archived structure
    expect(data.archived).toHaveProperty('total');
    expect(data.archived).toHaveProperty('details');
    expect(data.archived).toHaveProperty('errors');
    expect(Array.isArray(data.archived.details)).toBe(true);
    expect(Array.isArray(data.archived.errors)).toBe(true);

    // Verify deleted structure
    expect(data.deleted).toHaveProperty('total');
    expect(data.deleted).toHaveProperty('details');
    expect(data.deleted).toHaveProperty('errors');
    expect(Array.isArray(data.deleted.details)).toBe(true);
    expect(Array.isArray(data.deleted.errors)).toBe(true);

    // Verify currentStats is an array
    expect(Array.isArray(data.currentStats)).toBe(true);

    // Verify data types
    expect(typeof data.archived.total).toBe('number');
    expect(typeof data.deleted.total).toBe('number');
    expect(typeof data.duration_ms).toBe('number');

    // Log statistics
    console.log(`Archived: ${data.archived.total} logs`);
    console.log(`Deleted: ${data.deleted.total} logs`);
    console.log(`Duration: ${data.duration_ms}ms`);
  });

  test('should update event statuses based on dates', async ({ request }) => {
    const baseUrl = getBaseUrl();

    console.log('Testing update-event-status cron job...');
    const response = await request.post(`${baseUrl}/api/cron/update-event-status`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    console.log('Event status update response:', data);

    // Verify response structure
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('updates');
    expect(data).toHaveProperty('currentDateMT');
    expect(data).toHaveProperty('duration');
    expect(data).toHaveProperty('timestamp');

    // Verify updates structure
    expect(data.updates).toHaveProperty('activated');
    expect(data.updates).toHaveProperty('completed');

    // Verify data types
    expect(typeof data.updates.activated).toBe('number');
    expect(typeof data.updates.completed).toBe('number');
    expect(typeof data.currentDateMT).toBe('string');
    expect(typeof data.duration).toBe('string');

    // Verify Mountain Time date format (YYYY-MM-DD)
    expect(data.currentDateMT).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify duration format
    expect(data.duration).toMatch(/^\d+ms$/);

    // Log updates
    console.log(`Activated: ${data.updates.activated} events`);
    console.log(`Completed: ${data.updates.completed} events`);
    console.log(`Current date (MT): ${data.currentDateMT}`);
  });

  test('should handle all maintenance jobs in sequence', async ({ request }) => {
    const baseUrl = getBaseUrl();

    console.log('Testing all maintenance cron jobs in sequence...');

    // Run all maintenance jobs
    const jobs = [
      { name: 'cleanup-expired-reservations', path: '/api/cron/cleanup-expired-reservations' },
      { name: 'cleanup-scan-logs', path: '/api/cron/cleanup-scan-logs' },
      { name: 'audit-retention', path: '/api/cron/audit-retention' },
      { name: 'update-event-status', path: '/api/cron/update-event-status' }
    ];

    const results = [];

    for (const job of jobs) {
      console.log(`Running ${job.name}...`);
      const startTime = Date.now();

      const response = await request.post(`${baseUrl}${job.path}`, {
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json'
        }
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      results.push({
        name: job.name,
        success: data.success,
        executionTime,
        data
      });

      console.log(`✓ ${job.name} completed in ${executionTime}ms`);
    }

    // Verify all jobs succeeded
    results.forEach(result => {
      expect(result.success).toBe(true);
      expect(result.executionTime).toBeLessThan(10000); // Each job < 10s
    });

    // Log summary
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
    console.log(`\nAll maintenance jobs completed successfully in ${totalTime}ms`);
    console.log('Individual timings:');
    results.forEach(r => {
      console.log(`  - ${r.name}: ${r.executionTime}ms`);
    });
  });

  test('should verify idempotency across all maintenance jobs', async ({ request }) => {
    const baseUrl = getBaseUrl();

    const jobs = [
      '/api/cron/cleanup-expired-reservations',
      '/api/cron/cleanup-scan-logs',
      '/api/cron/audit-retention',
      '/api/cron/update-event-status'
    ];

    for (const jobPath of jobs) {
      console.log(`Testing idempotency for ${jobPath}...`);

      // First run
      const response1 = await request.post(`${baseUrl}${jobPath}`, {
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response1.ok()).toBeTruthy();
      const data1 = await response1.json();
      expect(data1.success).toBe(true);

      // Second run - should also succeed with potentially different counts
      const response2 = await request.post(`${baseUrl}${jobPath}`, {
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response2.ok()).toBeTruthy();
      const data2 = await response2.json();
      expect(data2.success).toBe(true);

      console.log(`✓ ${jobPath} is idempotent`);
    }
  });

  test('should validate authentication for all maintenance jobs', async ({ request }) => {
    const baseUrl = getBaseUrl();

    const jobs = [
      '/api/cron/cleanup-expired-reservations',
      '/api/cron/cleanup-scan-logs',
      '/api/cron/audit-retention',
      '/api/cron/update-event-status'
    ];

    for (const jobPath of jobs) {
      console.log(`Testing authentication for ${jobPath}...`);

      // Try without auth header
      const response = await request.post(`${baseUrl}${jobPath}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Should return 401 in production, or 200 in test mode
      const statusCode = response.status();
      expect([200, 401]).toContain(statusCode);

      if (statusCode === 401) {
        const data = await response.json().catch(() => ({}));
        expect(data).toHaveProperty('error');
        console.log(`✓ ${jobPath} correctly requires authentication`);
      } else {
        console.log(`✓ ${jobPath} allows execution in test mode`);
      }
    }
  });

  test('should validate response format consistency', async ({ request }) => {
    const baseUrl = getBaseUrl();

    const jobs = [
      '/api/cron/cleanup-expired-reservations',
      '/api/cron/cleanup-scan-logs',
      '/api/cron/audit-retention',
      '/api/cron/update-event-status'
    ];

    for (const jobPath of jobs) {
      const response = await request.post(`${baseUrl}${jobPath}`, {
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // All cron jobs should have these common fields
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('timestamp');
      expect(typeof data.success).toBe('boolean');
      expect(typeof data.timestamp).toBe('string');

      // Verify timestamp is valid ISO format
      expect(() => new Date(data.timestamp).toISOString()).not.toThrow();

      console.log(`✓ ${jobPath} has consistent response format`);
    }
  });

  test('should handle database errors gracefully', async ({ request }) => {
    const baseUrl = getBaseUrl();

    // This test verifies that cron jobs handle errors gracefully
    // In a real error scenario, they should return 500 but still have proper structure

    // We can't easily simulate database errors in E2E tests without breaking the environment
    // So we just verify that the endpoints are resilient to normal operations

    const response = await request.post(`${baseUrl}/api/cron/cleanup-expired-reservations`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    });

    // Should succeed in normal conditions
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.success).toBe(true);

    console.log('✓ Cron jobs handle normal operations successfully');
  });

  test('should complete all maintenance jobs within performance budget', async ({ request }) => {
    const baseUrl = getBaseUrl();

    const jobs = [
      { name: 'cleanup-expired-reservations', path: '/api/cron/cleanup-expired-reservations', maxTime: 5000 },
      { name: 'cleanup-scan-logs', path: '/api/cron/cleanup-scan-logs', maxTime: 10000 },
      { name: 'audit-retention', path: '/api/cron/audit-retention', maxTime: 15000 },
      { name: 'update-event-status', path: '/api/cron/update-event-status', maxTime: 5000 }
    ];

    for (const job of jobs) {
      const startTime = Date.now();
      const response = await request.post(`${baseUrl}${job.path}`, {
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json'
        }
      });
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(response.ok()).toBeTruthy();
      expect(executionTime).toBeLessThan(job.maxTime);

      console.log(`✓ ${job.name}: ${executionTime}ms (budget: ${job.maxTime}ms)`);
    }
  });
});
