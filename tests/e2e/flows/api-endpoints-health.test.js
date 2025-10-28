/**
 * E2E Test: API Endpoints Health Check
 *
 * Comprehensive test that validates all 28 API endpoints from the admin API endpoints page.
 * Tests connectivity, authentication, validation, and error handling.
 *
 * This test mirrors the manual testing performed via the admin API endpoints UI,
 * ensuring all endpoints respond correctly and report any issues.
 */

import { test, expect } from '@playwright/test';

// Base URL will be set from environment
const getBaseUrl = () => {
  return process.env.BASE_URL || 'http://localhost:3000';
};

// All 28 endpoints from the admin API endpoints page
const API_ENDPOINTS = [
  // Admin Endpoints (8)
  { method: 'GET', path: '/api/admin/dashboard', category: 'Admin', requiresAuth: true, expectedStatus: [200, 401] },
  { method: 'POST', path: '/api/admin/login', category: 'Admin', requiresAuth: false, expectedStatus: [200, 400], body: {} },
  { method: 'GET', path: '/api/admin/registrations', category: 'Admin', requiresAuth: true, expectedStatus: [200, 401] },
  { method: 'GET', path: '/api/admin/transactions', category: 'Admin', requiresAuth: true, expectedStatus: [200, 401] },
  { method: 'GET', path: '/api/admin/analytics', category: 'Admin', requiresAuth: true, expectedStatus: [200, 401] },
  { method: 'GET', path: '/api/admin/events', category: 'Admin', requiresAuth: false, expectedStatus: [200] },
  { method: 'GET', path: '/api/admin/generate-report', category: 'Admin', requiresAuth: true, expectedStatus: [200, 401] },
  { method: 'GET', path: '/api/admin/csrf-token', category: 'Admin', requiresAuth: true, expectedStatus: [200, 401] },

  // Sheets Endpoints (2)
  { method: 'POST', path: '/api/sheets/sync', category: 'Sheets', requiresAuth: true, expectedStatus: [200, 401], body: {} },
  { method: 'GET', path: '/api/sheets/scheduled-sync', category: 'Sheets', requiresAuth: true, expectedStatus: [200, 401] },

  // Tickets Endpoints (2)
  { method: 'POST', path: '/api/tickets/validate', category: 'Tickets', requiresAuth: false, expectedStatus: [200, 400], body: {} },
  { method: 'GET', path: '/api/tickets/123', category: 'Tickets', requiresAuth: false, expectedStatus: [200, 400, 404] },

  // Registration Endpoints (4)
  { method: 'POST', path: '/api/tickets/register', category: 'Registration', requiresAuth: false, expectedStatus: [200, 400], body: {} },
  { method: 'GET', path: '/api/registration/test-token', category: 'Registration', requiresAuth: false, expectedStatus: [200, 404] },
  { method: 'POST', path: '/api/registration/batch', category: 'Registration', requiresAuth: false, expectedStatus: [200, 400], body: {} },
  { method: 'GET', path: '/api/registration/health', category: 'Registration', requiresAuth: false, expectedStatus: [200] },

  // Gallery Endpoints (3)
  { method: 'GET', path: '/api/gallery', category: 'Gallery', requiresAuth: false, expectedStatus: [200] },
  { method: 'GET', path: '/api/gallery/years', category: 'Gallery', requiresAuth: false, expectedStatus: [200] },
  { method: 'GET', path: '/api/featured-photos', category: 'Gallery', requiresAuth: false, expectedStatus: [200] },

  // Email Endpoints (3)
  { method: 'POST', path: '/api/email/subscribe', category: 'Email', requiresAuth: false, expectedStatus: [200, 400], body: {} },
  { method: 'GET', path: '/api/email/unsubscribe', category: 'Email', requiresAuth: false, expectedStatus: [200, 400] },
  { method: 'POST', path: '/api/email/brevo-webhook', category: 'Email', requiresAuth: false, expectedStatus: [200, 401, 400], body: {} },

  // Payments Endpoints (3)
  { method: 'POST', path: '/api/payments/create-checkout-session', category: 'Payments', requiresAuth: false, expectedStatus: [200, 400], body: {} },
  { method: 'POST', path: '/api/payments/stripe-webhook', category: 'Payments', requiresAuth: false, expectedStatus: [200, 400], body: {} },
  { method: 'GET', path: '/api/payments/checkout-success', category: 'Payments', requiresAuth: false, expectedStatus: [200, 400] },

  // Health Endpoints (3)
  { method: 'GET', path: '/api/test-db', category: 'Health', requiresAuth: false, expectedStatus: [200] },
  { method: 'GET', path: '/api/health/check', category: 'Health', requiresAuth: false, expectedStatus: [200] },
  { method: 'GET', path: '/api/health/database', category: 'Health', requiresAuth: false, expectedStatus: [200] }
];

test.describe('API Endpoints Health Check', () => {
  let baseUrl;
  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
  };

  test.beforeAll(() => {
    baseUrl = getBaseUrl();
    console.log(`\n🚀 Testing ${API_ENDPOINTS.length} API endpoints at: ${baseUrl}\n`);
  });

  test.afterAll(() => {
    // Generate summary report
    const successRate = Math.round((testResults.passed / testResults.total) * 100);

    console.log('\n' + '='.repeat(60));
    console.log('📊 API ENDPOINTS HEALTH CHECK SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Endpoints Tested: ${testResults.total}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${successRate}%`);

    if (testResults.errors.length > 0) {
      console.log('\n❌ Failed Endpoints:');
      testResults.errors.forEach(error => {
        console.log(`  • ${error}`);
      });
    }

    console.log('='.repeat(60) + '\n');
  });

  // Group tests by category for better organization
  const categories = [...new Set(API_ENDPOINTS.map(e => e.category))];

  categories.forEach(category => {
    test.describe(`${category} Endpoints`, () => {
      const categoryEndpoints = API_ENDPOINTS.filter(e => e.category === category);

      categoryEndpoints.forEach(endpoint => {
        test(`${endpoint.method} ${endpoint.path} should respond correctly`, async ({ request }) => {
          testResults.total++;
          const startTime = Date.now();

          try {
            let response;
            const options = {
              headers: {
                'Content-Type': 'application/json'
              }
            };

            // Make request based on method
            if (endpoint.method === 'GET') {
              response = await request.get(`${baseUrl}${endpoint.path}`, options);
            } else if (endpoint.method === 'POST') {
              options.data = endpoint.body || {};
              response = await request.post(`${baseUrl}${endpoint.path}`, options);
            } else if (endpoint.method === 'PUT') {
              options.data = endpoint.body || {};
              response = await request.put(`${baseUrl}${endpoint.path}`, options);
            } else if (endpoint.method === 'DELETE') {
              response = await request.delete(`${baseUrl}${endpoint.path}`, options);
            }

            const status = response.status();
            const responseTime = Date.now() - startTime;

            // Check if status is in expected range
            const isExpectedStatus = endpoint.expectedStatus.includes(status);

            // Log result
            const statusIcon = isExpectedStatus ? '✅' : '❌';
            const authNote = status === 401 && endpoint.requiresAuth ? ' (Auth required - Expected)' : '';
            console.log(`  ${statusIcon} ${endpoint.method} ${endpoint.path} → ${status}${authNote} (${responseTime}ms)`);

            // Special handling for different status codes
            if (status === 500) {
              // 500 errors are always failures
              const responseBody = await response.text();
              const errorMsg = `${endpoint.method} ${endpoint.path} returned 500 SERVER ERROR: ${responseBody.substring(0, 100)}`;
              testResults.errors.push(errorMsg);
              testResults.failed++;

              expect(status, `${endpoint.method} ${endpoint.path} should not return 500 error`).not.toBe(500);
            } else if (!isExpectedStatus) {
              // Unexpected status code
              const responseBody = await response.text();
              const errorMsg = `${endpoint.method} ${endpoint.path} returned unexpected status ${status}. Expected: ${endpoint.expectedStatus.join(', ')}`;
              testResults.errors.push(errorMsg);
              testResults.failed++;

              expect(isExpectedStatus, errorMsg).toBeTruthy();
            } else {
              // Success!
              testResults.passed++;

              // Verify response has content for successful responses
              if (status === 200) {
                const contentType = response.headers()['content-type'];
                if (contentType && contentType.includes('application/json')) {
                  const jsonData = await response.json();
                  expect(jsonData).toBeDefined();
                }
              }
            }

          } catch (error) {
            testResults.failed++;
            const errorMsg = `${endpoint.method} ${endpoint.path} threw error: ${error.message}`;
            testResults.errors.push(errorMsg);
            console.log(`  ❌ ${errorMsg}`);
            throw error;
          }
        });
      });
    });
  });

  // Additional validation tests
  test.describe('Response Validation', () => {
    test('Health check endpoint should return valid JSON structure', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/health/check`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data.status).toBe('healthy');
    });

    test('Database health endpoint should return connection info', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/health/database`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('response_time');
      expect(data.status).toBe('healthy');
    });

    test('Gallery endpoint should return photos array', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/gallery`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('categories');
      expect(data).toHaveProperty('totalCount');
      expect(typeof data.totalCount).toBe('number');
    });

    test('Gallery years endpoint should return years array', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/gallery/years`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('years');
      expect(data).toHaveProperty('statistics');
      expect(Array.isArray(data.years)).toBeTruthy();
    });

    test('Featured photos endpoint should return photos array', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/featured-photos`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('photos');
      expect(Array.isArray(data.photos)).toBeTruthy();
    });
  });

  // Critical endpoint tests - these should never fail
  test.describe('Critical Endpoints (Must Always Work)', () => {
    test('Health check endpoint must be available', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/health/check`);
      expect(response.status()).toBe(200);
    });

    test('Database health endpoint must be available', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/health/database`);
      expect(response.status()).toBe(200);
    });

    test('Registration health endpoint must be available', async ({ request }) => {
      const response = await request.get(`${baseUrl}/api/registration/health`);
      expect(response.status()).toBe(200);
    });
  });
});
