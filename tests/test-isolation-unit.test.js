/**
 * Unit tests for the test isolation system
 * Tests the core functionality without requiring browser automation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestIsolation,
  cleanupTestIsolation,
  generateTestEmail,
  generateTestUser,
  generateTestTicketId,
  getTestNamespace,
  generateRegistrationData,
  generatePaymentData,
  getSessionInfo
} from './e2e/helpers/test-isolation.js';

describe('Test Isolation System', () => {
  beforeAll(async () => {
    await initializeTestIsolation();
  });

  afterAll(async () => {
    await cleanupTestIsolation();
  });

  it('should generate unique test emails', () => {
    const email1 = generateTestEmail('test1', 'newsletter');
    const email2 = generateTestEmail('test2', 'newsletter');
    const email3 = generateTestEmail('test1', 'registration'); // same test, different purpose
    
    expect(email1).toMatch(/@e2etest\.example\.com$/);
    expect(email2).toMatch(/@e2etest\.example\.com$/);
    expect(email3).toMatch(/@e2etest\.example\.com$/);
    
    // All emails should be unique
    expect(email1).not.toBe(email2);
    expect(email1).not.toBe(email3);
    expect(email2).not.toBe(email3);
    
    // Should contain test identifiers
    expect(email1).toContain('test1');
    expect(email1).toContain('newsletter');
    expect(email2).toContain('test2');
    expect(email3).toContain('registration');
  });

  it('should generate consistent test users', () => {
    const user1 = generateTestUser('consistent-test');
    const user2 = generateTestUser('consistent-test'); // Same test title
    const user3 = generateTestUser('different-test-title');
    
    // Same test title should generate same namespace
    expect(user1.namespace).toBe(user2.namespace);
    expect(user1.firstName).toBe(user2.firstName);
    
    // Different test title should generate different namespace
    expect(user1.namespace).not.toBe(user3.namespace);
    expect(user1.firstName).not.toBe(user3.firstName);
    
    // Should have required fields
    expect(user1.email).toMatch(/@e2etest\.example\.com$/);
    expect(user1.firstName).toBeDefined();
    expect(user1.lastName).toBeDefined();
    expect(user1.phone).toBeDefined();
    expect(user1.emergencyContact).toBeDefined();
    expect(user1.emergencyPhone).toBeDefined();
  });

  it('should generate unique ticket IDs', () => {
    const ticket1 = generateTestTicketId('ticket-test', 'TKT');
    const ticket2 = generateTestTicketId('ticket-test', 'TKT');
    const ticket3 = generateTestTicketId('ticket-test', 'REG');
    
    // All should be unique
    expect(ticket1).not.toBe(ticket2);
    expect(ticket1).not.toBe(ticket3);
    
    // Should start with prefix
    expect(ticket1).toMatch(/^TKT_/);
    expect(ticket2).toMatch(/^TKT_/);
    expect(ticket3).toMatch(/^REG_/);
    
    // Should contain test namespace
    expect(ticket1).toContain('ticket_test');
  });

  it('should generate consistent test namespaces', () => {
    const namespace1 = getTestNamespace('namespace-test');
    const namespace2 = getTestNamespace('namespace-test'); // Same test
    const namespace3 = getTestNamespace('different-namespace-test');
    
    // Same test should get same namespace
    expect(namespace1).toBe(namespace2);
    
    // Different test should get different namespace
    expect(namespace1).not.toBe(namespace3);
    
    // Should contain test identifier
    expect(namespace1).toContain('namespace_test');
    expect(namespace3).toContain('different_namespace_test');
  });

  it('should generate complete registration data', () => {
    const registration = generateRegistrationData('registration-test', {
      user: { firstName: 'CustomName' }
    });
    
    expect(registration.ticketId).toMatch(/^REG_/);
    expect(registration.user).toBeDefined();
    expect(registration.user.email).toBeDefined();
    expect(registration.user.email).toMatch(/@e2etest\.example\.com$/);
    expect(registration.user.firstName).toBe('CustomName'); // Override applied
    expect(registration.user.lastName).toBeDefined();
    expect(registration.registrationToken).toMatch(/^token_/);
    
    // Should contain namespace
    expect(registration.registrationToken).toContain('registration_test');
  });

  it('should generate payment data', () => {
    const payment = generatePaymentData('payment-test', {
      amount: 7500,
      metadata: { eventId: 'test-event' }
    });
    
    expect(payment.amount).toBe(7500);
    expect(payment.currency).toBe('usd');
    expect(payment.customer_email).toMatch(/@e2etest\.example\.com$/);
    expect(payment.metadata).toBeDefined();
    expect(payment.metadata.test_title).toBe('payment-test');
    expect(payment.metadata.test_namespace).toBeDefined();
    expect(payment.metadata.eventId).toBe('test-event'); // Custom metadata preserved
    expect(payment.metadata.timestamp).toBeDefined();
  });

  it('should provide session information', () => {
    const sessionInfo = getSessionInfo();
    
    expect(sessionInfo.sessionId).toBeDefined();
    expect(sessionInfo.testRunId).toBeDefined();
    expect(Array.isArray(sessionInfo.activeTests)).toBe(true);
    expect(Array.isArray(sessionInfo.createdResources)).toBe(true);
    expect(typeof sessionInfo.cleanupTasks).toBe('number');
  });

  it('should handle special characters in test titles', () => {
    const testTitle = 'Test with Special Characters! @#$%^&*()';
    const namespace = getTestNamespace(testTitle);
    const email = generateTestEmail(testTitle);
    
    // Should sanitize special characters
    expect(namespace).toMatch(/^e2e_\d+_[a-f0-9]+_test_with_special_characters/);
    expect(email).toContain('test_with_special_characters');
    
    // Should not contain original special characters
    expect(namespace).not.toContain('!');
    expect(namespace).not.toContain('@');
    expect(namespace).not.toContain('#');
  });

  it('should generate different data for parallel test simulation', () => {
    // Simulate multiple tests running in parallel
    const tests = [
      'parallel-test-1',
      'parallel-test-2', 
      'parallel-test-3',
      'parallel-test-4',
      'parallel-test-5'
    ];
    
    const results = tests.map(testTitle => ({
      testTitle,
      namespace: getTestNamespace(testTitle),
      email: generateTestEmail(testTitle),
      ticketId: generateTestTicketId(testTitle),
      user: generateTestUser(testTitle)
    }));
    
    // All namespaces should be unique
    const namespaces = results.map(r => r.namespace);
    const uniqueNamespaces = new Set(namespaces);
    expect(uniqueNamespaces.size).toBe(namespaces.length);
    
    // All emails should be unique
    const emails = results.map(r => r.email);
    const uniqueEmails = new Set(emails);
    expect(uniqueEmails.size).toBe(emails.length);
    
    // All ticket IDs should be unique
    const ticketIds = results.map(r => r.ticketId);
    const uniqueTicketIds = new Set(ticketIds);
    expect(uniqueTicketIds.size).toBe(ticketIds.length);
    
    // Users should have different data
    const userEmails = results.map(r => r.user.email);
    const uniqueUserEmails = new Set(userEmails);
    expect(uniqueUserEmails.size).toBe(userEmails.length);
  });
});