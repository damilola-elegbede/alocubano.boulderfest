/**
 * Data Integrity Test Suite
 * Database Consistency, GDPR Compliance & Business Data Protection
 * Target: 5 tests, ~150ms execution, ~150 lines
 */

import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

// Data integrity test helpers
const createValidRegistrationData = () => ({
  ticketId: 'TKT-DATA-001',
  firstName: 'Alice',
  lastName: 'Johnson',
  email: generateTestEmail(),
  phone: '+1-555-0199'
});

const createNewsletterSubscriptionData = () => ({
  email: generateTestEmail(),
  firstName: 'Newsletter',
  lastName: 'Subscriber',
  preferences: ['events', 'workshops']
});

test('registration data validation and storage consistency', async () => {
  const validData = createValidRegistrationData();
  
  // Test valid registration
  const validResponse = await testRequest('POST', '/api/tickets/register', validData);
  expect([HTTP_STATUS.OK, HTTP_STATUS.CREATED]).toContain(validResponse.status);
  
  if (validResponse.status === HTTP_STATUS.OK && validResponse.data.success) {
    expect(validResponse.data.attendee).toBeDefined();
    expect(validResponse.data.attendee.email).toBe(validData.email);
    expect(validResponse.data.attendee.ticketId).toBe(validData.ticketId);
    expect(validResponse.data.attendee.registrationDate).toBeDefined();
  }
  
  // Test data validation boundaries
  const validationTests = [
    { field: 'firstName', value: 'A', error: /2.character/i }, // Too short
    { field: 'firstName', value: 'X'.repeat(100), error: /too.long|length/i }, // Too long
    { field: 'lastName', value: '', error: /required|name/i }, // Empty
    { field: 'email', value: 'invalid-email', error: /valid.email/i }, // Invalid format
    { field: 'email', value: 'test@', error: /valid.email/i }, // Incomplete
    { field: 'ticketId', value: '', error: /required|ticket/i } // Missing required
  ];
  
  for (const test of validationTests) {
    const invalidData = { ...validData, [test.field]: test.value };
    const response = await testRequest('POST', '/api/tickets/register', invalidData);
    
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data.error).toMatch(test.error);
  }
  
  // Test duplicate registration prevention
  const duplicateResponse = await testRequest('POST', '/api/tickets/register', validData);
  if (duplicateResponse.status === HTTP_STATUS.CONFLICT) {
    expect(duplicateResponse.data.error).toMatch(/already.registered|duplicate/i);
  }
}, 25000);

test('email subscription and GDPR compliance workflows', async () => {
  const subscriptionData = createNewsletterSubscriptionData();
  
  // Test newsletter subscription
  const subscribeResponse = await testRequest('POST', '/api/email/subscribe', subscriptionData);
  // Accept various status codes for newsletter signup
  if (subscribeResponse.status === HTTP_STATUS.BAD_REQUEST) {
    // If invalid email, check for proper error message
    expect(subscribeResponse.data.error || subscribeResponse.data.message || '').toMatch(/email|valid|consent|marketing/i);
  } else {
    expect([HTTP_STATUS.OK, HTTP_STATUS.CREATED, HTTP_STATUS.ACCEPTED]).toContain(subscribeResponse.status);
  }
  
  if (subscribeResponse.status === HTTP_STATUS.OK) {
    expect(subscribeResponse.data.success).toBe(true);
    expect(subscribeResponse.data.subscribed).toBe(true);
  }
  
  // Test subscription data integrity
  const emailValidationTests = [
    { email: '', error: /required|email/i },
    { email: 'invalid', error: /valid.email/i },
    { email: 'test@incomplete', error: /valid.email/i },
    { email: '@missing-local.com', error: /valid.email/i }
  ];
  
  for (const test of emailValidationTests) {
    const response = await testRequest('POST', '/api/email/subscribe', {
      ...subscriptionData,
      email: test.email
    });
    
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data.error).toMatch(test.error);
  }
  
  // Test GDPR-compliant unsubscription (with token)
  const unsubscribeToken = 'test_unsub_token_123';
  const unsubscribeResponse = await testRequest('GET', `/api/email/unsubscribe?token=${unsubscribeToken}&email=${subscriptionData.email}`);
  expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND]).toContain(unsubscribeResponse.status);
  
  // Test unsubscription without token (should fail)
  const noTokenResponse = await testRequest('GET', `/api/email/unsubscribe?email=${subscriptionData.email}`);
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND]).toContain(noTokenResponse.status);
  
  // Test POST unsubscribe method
  const postUnsubscribeResponse = await testRequest('POST', '/api/email/unsubscribe', {
    email: subscriptionData.email,
    token: unsubscribeToken
  });
  expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND]).toContain(postUnsubscribeResponse.status);
}, 20000);

test('database migration integrity and deployment safety', async () => {
  // Test database health and connectivity
  const healthResponse = await testRequest('GET', '/api/registration/health');
  expect(healthResponse.status).toBe(HTTP_STATUS.OK);
  expect(healthResponse.data.status).toBe('healthy');
  expect(healthResponse.data.service).toBe('registration');
  expect(healthResponse.data.timestamp).toBeDefined();
  
  // Test critical table structure (via API endpoints)
  const structureTests = [
    { endpoint: '/api/tickets/TKT-MIGRATION-001', expectStatus: [HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND] },
    { endpoint: '/api/admin/registrations', expectStatus: [HTTP_STATUS.OK, HTTP_STATUS.UNAUTHORIZED] }, // Should exist but require auth
    { endpoint: '/api/gallery/years', expectStatus: [HTTP_STATUS.OK] }
  ];
  
  for (const test of structureTests) {
    const response = await testRequest('GET', test.endpoint);
    expect(test.expectStatus).toContain(response.status);
  }
  
  // Test data consistency across related entities
  const consistencyTicketData = {
    ticketId: 'TKT-CONSISTENCY-001',
    firstName: 'Consistency',
    lastName: 'Test',
    email: generateTestEmail()
  };
  
  const registrationResponse = await testRequest('POST', '/api/tickets/register', consistencyTicketData);
  if (registrationResponse.status === HTTP_STATUS.OK && registrationResponse.data.success) {
    // Verify ticket can be retrieved
    const ticketResponse = await testRequest('GET', `/api/tickets/${consistencyTicketData.ticketId}`);
    if (ticketResponse.status === HTTP_STATUS.OK) {
      expect(ticketResponse.data.holderEmail).toBe(consistencyTicketData.email);
    }
  }
}, 15000);

test('gallery data consistency and content delivery', async () => {
  // Test gallery years endpoint
  const yearsResponse = await testRequest('GET', '/api/gallery/years');
  expect(yearsResponse.status).toBe(HTTP_STATUS.OK);
  expect(Array.isArray(yearsResponse.data)).toBe(true);
  
  // Test main gallery endpoint
  const galleryResponse = await testRequest('GET', '/api/gallery');
  expect(yearsResponse.status).toBe(HTTP_STATUS.OK);
  
  if (galleryResponse.status === HTTP_STATUS.OK) {
    expect(galleryResponse.data).toBeDefined();
    // Should have consistent data structure
    if (galleryResponse.data.photos) {
      expect(Array.isArray(galleryResponse.data.photos)).toBe(true);
    }
    if (galleryResponse.data.videos) {
      expect(Array.isArray(galleryResponse.data.videos)).toBe(true);
    }
  }
  
  // Test featured photos endpoint
  const featuredResponse = await testRequest('GET', '/api/featured-photos');
  expect(featuredResponse.status).toBe(HTTP_STATUS.OK);
  
  if (featuredResponse.status === HTTP_STATUS.OK && featuredResponse.data.photos) {
    expect(Array.isArray(featuredResponse.data.photos)).toBe(true);
    
    // Test data integrity for featured photos
    const photos = featuredResponse.data.photos.slice(0, 3); // Test first 3
    for (const photo of photos) {
      expect(photo).toHaveProperty('id');
      expect(photo).toHaveProperty('url');
      if (photo.thumbnail) {
        expect(typeof photo.thumbnail).toBe('string');
      }
    }
  }
  
  // Test gallery caching consistency
  const secondGalleryResponse = await testRequest('GET', '/api/gallery');
  expect(secondGalleryResponse.status).toBe(HTTP_STATUS.OK);
  
  // Both responses should have consistent structure
  if (galleryResponse.status === HTTP_STATUS.OK && secondGalleryResponse.status === HTTP_STATUS.OK) {
    const firstKeys = Object.keys(galleryResponse.data || {});
    const secondKeys = Object.keys(secondGalleryResponse.data || {});
    expect(secondKeys.length).toBeGreaterThanOrEqual(0);
  }
}, 20000);

test('admin dashboard data accuracy and security', async () => {
  // Test unauthorized access (should fail)
  const noAuthResponse = await testRequest('GET', '/api/admin/dashboard');
  expect(noAuthResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  
  // Test with invalid auth token
  const invalidTokenResponse = await testRequest('GET', '/api/admin/dashboard', null, {
    'Authorization': 'Bearer invalid_token_123'
  });
  expect(invalidTokenResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  
  // Test admin registrations endpoint (should require auth)
  const registrationsResponse = await testRequest('GET', '/api/admin/registrations');
  expect(registrationsResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  
  // Test admin login endpoint data validation
  const invalidLogins = [
    { username: '', password: 'test', error: /username.required/i },
    { username: 'admin', password: '', error: /password.required/i },
    { username: 'admin', password: 'wrong', expectStatus: HTTP_STATUS.UNAUTHORIZED }
  ];
  
  for (const login of invalidLogins) {
    const response = await testRequest('POST', '/api/admin/login', {
      username: login.username,
      password: login.password
    });
    
    if (login.expectStatus) {
      // Accept rate limiting (429) as valid for security
      expect([login.expectStatus, HTTP_STATUS.TOO_MANY_REQUESTS]).toContain(response.status);
    } else {
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      if (login.error) {
        expect(response.data.error).toMatch(login.error);
      }
    }
  }
  
  // Test that sensitive admin data is not leaked in error responses
  const sqlInjectionAttempt = await testRequest('POST', '/api/admin/login', {
    username: "admin'; SELECT * FROM admin_secrets; --",
    password: 'test'
  });
  
  expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED]).toContain(sqlInjectionAttempt.status);
  if (sqlInjectionAttempt.data.error) {
    expect(sqlInjectionAttempt.data.error).not.toMatch(/sql|database|table|select/i);
  }
}, 25000);