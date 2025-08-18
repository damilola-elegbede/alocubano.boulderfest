/**
 * Smoke Tests - Quick Validation
 * Fast tests that verify basic system functionality.
 * Target: < 100 lines
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

test('website loads without errors', async () => {
  const response = await testRequest('GET', '/');
  expect(response.status).toBe(200);
});

test('all critical API endpoints respond', async () => {
  const endpoints = [
    '/api/health/check',
    '/api/health/database', 
    '/api/gallery',
    '/api/featured-photos'
  ];

  for (const endpoint of endpoints) {
    const response = await testRequest('GET', endpoint);
    expect(response.status).toBeLessThan(400);
  }
});

test('payment API initializes correctly', async () => {
  const response = await testRequest('GET', '/api/health/stripe');
  expect(response.status).toBe(200);
  expect(response.data.stripe).toBe('connected');
});

test('email API is configured', async () => {
  const response = await testRequest('GET', '/api/health/brevo');
  expect(response.status).toBe(200);
  expect(response.data.brevo).toBe('connected');
});

test('database has required tables', async () => {
  const response = await testRequest('GET', '/api/health/database');
  expect(response.status).toBe(200);
  expect(response.data.tables).toContain('registrations');
  expect(response.data.tables).toContain('newsletter_subscribers');
});

test('admin endpoints require authentication', async () => {
  const response = await testRequest('GET', '/api/admin/dashboard');
  expect(response.status).toBe(401);
  expect(response.data.error).toContain('unauthorized');
});

test('invalid endpoints return 404', async () => {
  const response = await testRequest('GET', '/api/nonexistent/endpoint');
  expect(response.status).toBe(404);
});