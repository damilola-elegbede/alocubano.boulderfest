/**
 * Example E2E Test Using Seeded Test Data
 * 
 * This file demonstrates how to use the deterministic test data seeding system
 * in your E2E tests. It shows various patterns and best practices.
 * 
 * Note: This is an example file and won't run as part of the test suite.
 * Copy patterns from here to your actual test files.
 */

import { test, expect } from '@playwright/test';
import { 
  getTestAdmin, 
  getTestTicket, 
  getTestSubscriber,
  getTestQRCode,
  getTestEmails,
  getTestValues,
  validateTestDataAvailable,
  logAvailableTestData
} from '../helpers/test-data-helper.js';

// Validate test data is available before running tests
test.beforeEach(async () => {
  // This will throw an error if test data is not properly seeded
  validateTestDataAvailable();
  
  // Uncomment to debug available test data
  // logAvailableTestData();
});

/**
 * Example 1: Admin Authentication Test
 */
test('admin login with seeded credentials', async ({ page }) => {
  // Get deterministic admin credentials
  const admin = getTestAdmin();
  
  await page.goto('/admin');
  
  // Use seeded credentials
  await page.fill('#email', admin.email);
  await page.fill('#password', admin.password);
  await page.click('#login-button');
  
  // Verify successful login
  await expect(page.locator('.admin-dashboard')).toBeVisible();
  await expect(page.locator('.admin-email')).toHaveText(admin.email);
});

/**
 * Example 2: Ticket Validation Test
 */
test('validate ticket QR code', async ({ page }) => {
  // Get a specific test ticket
  const weekendTicket = getTestTicket('weekend');
  
  // Navigate to admin check-in page (assumes admin is logged in)
  await page.goto('/admin/checkin');
  
  // Scan QR code
  await page.fill('#qr-code-input', weekendTicket.validation_code);
  await page.click('#validate-button');
  
  // Verify ticket details are displayed
  await expect(page.locator('.ticket-valid')).toBeVisible();
  await expect(page.locator('.attendee-name')).toHaveText(
    `${weekendTicket.attendee_first_name} ${weekendTicket.attendee_last_name}`
  );
  await expect(page.locator('.ticket-type')).toHaveText(weekendTicket.ticket_type);
  await expect(page.locator('.ticket-email')).toHaveText(weekendTicket.attendee_email);
});

/**
 * Example 3: Newsletter Subscription Test
 */
test('newsletter unsubscribe flow', async ({ page }) => {
  // Get an active subscriber
  const subscriber = getTestSubscriber('active');
  
  // Navigate to unsubscribe page
  await page.goto(`/unsubscribe?email=${encodeURIComponent(subscriber.email)}`);
  
  // Verify subscriber details are shown
  await expect(page.locator('.subscriber-email')).toHaveText(subscriber.email);
  await expect(page.locator('.subscriber-name')).toHaveText(
    `${subscriber.first_name} ${subscriber.last_name}`
  );
  
  // Confirm unsubscribe
  await page.click('#unsubscribe-confirm');
  
  // Verify success message
  await expect(page.locator('.unsubscribe-success')).toBeVisible();
  await expect(page.locator('.success-message')).toContainText(subscriber.email);
});

/**
 * Example 4: Multiple Tickets Test
 */
test('check multiple ticket types', async ({ page }) => {
  // Get different ticket types
  const weekendTicket = getTestTicket('weekend');
  const saturdayTicket = getTestTicket('saturday');
  
  const testValues = getTestValues();
  
  await page.goto('/admin/tickets');
  
  // Search for weekend tickets
  await page.fill('#search-filter', weekendTicket.attendee_email);
  await page.click('#search-button');
  
  // Verify weekend ticket appears in results
  await expect(page.locator('.ticket-list')).toContainText(weekendTicket.ticket_id);
  await expect(page.locator('.ticket-list')).toContainText('$75.00'); // Weekend price
  
  // Clear search and search for Saturday tickets
  await page.fill('#search-filter', saturdayTicket.attendee_email);
  await page.click('#search-button');
  
  // Verify Saturday ticket appears
  await expect(page.locator('.ticket-list')).toContainText(saturdayTicket.ticket_id);
  await expect(page.locator('.ticket-list')).toContainText('$50.00'); // Saturday price
});

/**
 * Example 5: Using Test Constants
 */
test('contact form with test email addresses', async ({ page }) => {
  const emails = getTestEmails();
  const values = getTestValues();
  
  await page.goto('/contact');
  
  // Use deterministic test data
  await page.fill('#name', 'Test User');
  await page.fill('#email', emails.ticketBuyer);
  await page.fill('#subject', `Question about ${values.eventId}`);
  await page.fill('#message', 'This is a test message with deterministic data');
  
  await page.click('#submit-button');
  
  // Verify success
  await expect(page.locator('.contact-success')).toBeVisible();
  await expect(page.locator('.success-email')).toHaveText(emails.ticketBuyer);
});

/**
 * Example 6: Error Handling
 */
test('handle missing test data gracefully', async ({ page }) => {
  try {
    // This might fail if test data is not available
    const ticket = getTestTicket('nonexistent-type');
    
    // This line should not be reached
    expect(ticket).toBeDefined();
  } catch (error) {
    // Expected behavior - test data helper should throw descriptive error
    expect(error.message).toContain('Ticket type');
    expect(error.message).toContain('not found');
    
    // Test continues - we can handle the error appropriately
    console.log('Handled expected error:', error.message);
  }
});

/**
 * Example 7: Custom Test Data Scenarios
 */
test('custom scenario with additional data', async ({ page }) => {
  // Get base test data
  const admin = getTestAdmin();
  const ticket = getTestTicket('weekend');
  
  // For scenarios requiring custom data, you can:
  // 1. Use the existing seeded data as base
  // 2. Add custom data in the test (clean up after)
  // 3. Or extend the seeder for new scenarios
  
  await page.goto('/admin');
  
  // Login with seeded admin
  await page.fill('#email', admin.email);
  await page.fill('#password', admin.password);
  await page.click('#login-button');
  
  // Use seeded ticket data for testing
  await page.goto(`/admin/ticket/${ticket.ticket_id}`);
  
  // Verify ticket details match seeded data
  await expect(page.locator('.ticket-id')).toHaveText(ticket.ticket_id);
  await expect(page.locator('.attendee-email')).toHaveText(ticket.attendee_email);
});

/**
 * Example 8: Performance Testing with Seeded Data
 */
test('page load performance with deterministic data', async ({ page }) => {
  // Using deterministic data ensures consistent performance testing
  const emails = getTestEmails();
  
  // Measure page load time
  const startTime = Date.now();
  
  await page.goto(`/tickets/lookup?email=${encodeURIComponent(emails.ticketBuyer)}`);
  
  const endTime = Date.now();
  const loadTime = endTime - startTime;
  
  // With seeded data, we know exactly what should be displayed
  await expect(page.locator('.ticket-found')).toBeVisible();
  
  // Performance assertion with deterministic data
  expect(loadTime).toBeLessThan(2000); // Should load within 2 seconds
  
  console.log(`Page loaded in ${loadTime}ms with seeded data`);
});

/**
 * Example 9: Testing Different User Scenarios
 */
test('different subscriber status scenarios', async ({ page }) => {
  // Test active subscriber
  const activeSubscriber = getTestSubscriber('active');
  await page.goto(`/profile?email=${encodeURIComponent(activeSubscriber.email)}`);
  await expect(page.locator('.subscription-status')).toHaveText('Active');
  
  // Test unsubscribed user
  const unsubscribedUser = getTestSubscriber('unsubscribed');  
  await page.goto(`/profile?email=${encodeURIComponent(unsubscribedUser.email)}`);
  await expect(page.locator('.subscription-status')).toHaveText('Unsubscribed');
  
  // Note: 'bounced' status is only available in 'full' profile
  // You can check for its existence or handle the error gracefully
});

/**
 * Example 10: Debugging and Troubleshooting
 */
test('debug test data availability', async ({ page }) => {
  // Log all available test data for debugging
  console.log('=== Debug: Available Test Data ===');
  logAvailableTestData();
  
  // Validate specific data is available
  try {
    const admin = getTestAdmin();
    console.log('Admin data available:', admin);
    
    const tickets = [];
    for (const type of ['weekend', 'saturday', 'sunday']) {
      try {
        const ticket = getTestTicket(type);
        tickets.push({ type, id: ticket.ticket_id });
      } catch (error) {
        console.log(`${type} ticket not available:`, error.message);
      }
    }
    console.log('Available tickets:', tickets);
    
  } catch (error) {
    console.error('Test data issue:', error.message);
    throw error; // Re-throw to fail the test
  }
  
  // If we get here, test data is working correctly
  await page.goto('/');
  await expect(page).toHaveTitle(/A Lo Cubano Boulder Fest/);
});

// Note: This example file is for demonstration only
// Copy these patterns to your actual test files in the flows/ directory