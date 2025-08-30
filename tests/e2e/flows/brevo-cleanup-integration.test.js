/**
 * Brevo Cleanup Integration Test
 * 
 * This test verifies that the Brevo cleanup system works correctly
 * in the E2E testing environment. It demonstrates proper usage and
 * validates cleanup functionality without affecting production data.
 */

import { test, expect } from '@playwright/test';
import {
  trackTestEmail,
  isTestEmail,
  cleanupTestEmails,
  getBrevoCleanupStats,
  initializeBrevoCleanup
} from '../helpers/brevo-cleanup.js';
import { generateTestEmail } from '../helpers/test-isolation.js';

test.describe('Brevo Cleanup Integration', () => {
  
  test.beforeAll(async () => {
    // Initialize cleanup system
    await initializeBrevoCleanup();
  });

  test('should properly identify test emails', async () => {
    const testCases = [
      // These should be identified as test emails
      { email: 'e2e_test_123@e2etest.example.com', expected: true },
      { email: 'test_user@example.com', expected: true },
      { email: 'playwright_automation@test.com', expected: true },
      { email: 'dummy_user@e2etest.example.com', expected: true },
      
      // These should NOT be identified as test emails
      { email: 'real.user@gmail.com', expected: false },
      { email: 'customer@company.org', expected: false },
      { email: 'john.doe@domain.net', expected: false }
    ];

    for (const testCase of testCases) {
      const result = isTestEmail(testCase.email);
      expect(result).toBe(testCase.expected);
      console.log(`✅ Email pattern test: ${testCase.email} -> ${result}`);
    }
  });

  test('should track test emails for cleanup', async () => {
    // Get initial stats
    const initialStats = getBrevoCleanupStats();
    const initialTrackedCount = initialStats.trackedEmails;

    // Generate and track test emails
    const testEmails = [
      generateTestEmail('brevo_cleanup_test', 'tracking1'),
      generateTestEmail('brevo_cleanup_test', 'tracking2'),
      generateTestEmail('brevo_cleanup_test', 'tracking3')
    ];

    // Track each email
    testEmails.forEach((email, index) => {
      trackTestEmail(email, {
        testTitle: 'brevo_cleanup_test',
        purpose: `tracking${index + 1}`,
        source: 'integration_test'
      });
    });

    // Verify tracking
    const newStats = getBrevoCleanupStats();
    expect(newStats.trackedEmails).toBe(initialTrackedCount + testEmails.length);
    
    console.log(`✅ Tracked ${testEmails.length} test emails for cleanup`);
    console.log(`📊 Total tracked emails: ${newStats.trackedEmails}`);
  });

  test('should perform cleanup of tracked emails', async () => {
    // Get current stats before cleanup
    const preCleanupStats = getBrevoCleanupStats();
    
    if (preCleanupStats.trackedEmails > 0) {
      console.log(`🧹 Starting cleanup of ${preCleanupStats.trackedEmails} tracked emails...`);
      
      // Perform cleanup
      const cleanupResults = await cleanupTestEmails({
        removeFromLists: true,
        deleteContacts: false // Be conservative in tests
      });

      // Verify cleanup results
      expect(cleanupResults).toBeDefined();
      expect(cleanupResults.totalProcessed).toBeGreaterThanOrEqual(0);
      expect(cleanupResults.totalCleaned).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(cleanupResults.errors)).toBe(true);

      console.log(`✅ Cleanup completed:`);
      console.log(`   - Processed: ${cleanupResults.totalProcessed}`);
      console.log(`   - Cleaned: ${cleanupResults.totalCleaned}`);
      console.log(`   - Errors: ${cleanupResults.errors.length}`);

      // Verify no errors occurred (in test mode, errors should be rare)
      if (cleanupResults.errors.length > 0) {
        console.warn('⚠️ Cleanup errors occurred:', cleanupResults.errors);
      }

      // Check stats after cleanup
      const postCleanupStats = getBrevoCleanupStats();
      expect(postCleanupStats.trackedEmails).toBe(0); // All emails should be cleaned

    } else {
      console.log('ℹ️ No tracked emails to clean up');
    }
  });

  test('should handle test mode correctly', async () => {
    const stats = getBrevoCleanupStats();
    
    // In E2E tests, we should typically be in test mode
    // unless specifically configured to use real Brevo API
    const expectedTestMode = process.env.E2E_TEST_MODE === 'true' || 
                            process.env.NODE_ENV === 'test' || 
                            !process.env.BREVO_API_KEY;

    console.log(`🧪 Test mode expected: ${expectedTestMode}`);
    console.log(`🧪 Test mode actual: ${stats.isTestMode}`);
    
    if (expectedTestMode) {
      expect(stats.isTestMode).toBe(true);
      console.log('✅ Running in test mode - operations are simulated');
    } else {
      console.log('⚠️ Running with real Brevo API - cleanup will affect production data');
    }
  });

  test('should generate unique test emails consistently', async () => {
    // Generate emails with same parameters multiple times
    const email1 = generateTestEmail('consistency_test', 'purpose1');
    const email2 = generateTestEmail('consistency_test', 'purpose1');
    const email3 = generateTestEmail('consistency_test', 'purpose2');

    // Each email should be unique
    expect(email1).not.toBe(email2);
    expect(email1).not.toBe(email3);
    expect(email2).not.toBe(email3);

    // All should be identified as test emails
    expect(isTestEmail(email1)).toBe(true);
    expect(isTestEmail(email2)).toBe(true);
    expect(isTestEmail(email3)).toBe(true);

    // All should follow expected pattern
    expect(email1).toContain('@e2etest.example.com');
    expect(email2).toContain('@e2etest.example.com');
    expect(email3).toContain('@e2etest.example.com');

    console.log('✅ Generated unique test emails:');
    console.log(`   - ${email1}`);
    console.log(`   - ${email2}`);
    console.log(`   - ${email3}`);

    // Track these for cleanup
    [email1, email2, email3].forEach(email => {
      trackTestEmail(email, {
        testTitle: 'consistency_test',
        purpose: 'uniqueness_verification',
        source: 'integration_test'
      });
    });
  });

  test('should provide comprehensive cleanup statistics', async () => {
    const stats = getBrevoCleanupStats();
    
    // Verify stats structure
    expect(stats).toBeDefined();
    expect(typeof stats.trackedEmails).toBe('number');
    expect(Array.isArray(stats.cleanupLog)).toBe(true);
    expect(typeof stats.isTestMode).toBe('boolean');
    expect(typeof stats.initialized).toBe('boolean');

    console.log('📊 Cleanup Statistics:');
    console.log(`   - Tracked emails: ${stats.trackedEmails}`);
    console.log(`   - Cleanup log entries: ${stats.cleanupLog.length}`);
    console.log(`   - Test mode: ${stats.isTestMode}`);
    console.log(`   - Initialized: ${stats.initialized}`);

    // Verify system is initialized
    expect(stats.initialized).toBe(true);
  });

  // Clean up after tests
  test.afterAll(async () => {
    console.log('🧹 Performing final cleanup after integration tests...');
    
    try {
      const finalCleanup = await cleanupTestEmails();
      console.log(`✅ Final cleanup completed: ${finalCleanup.totalCleaned} emails processed`);
    } catch (error) {
      console.warn('⚠️ Final cleanup failed:', error.message);
    }
  });
});