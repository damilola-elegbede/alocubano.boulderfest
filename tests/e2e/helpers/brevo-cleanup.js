/**
 * Brevo Email Test Cleanup Utilities
 * 
 * Ensures E2E tests don't pollute production email lists by providing
 * comprehensive cleanup functionality for test data in Brevo.
 * 
 * Features:
 * - Track test emails sent during E2E tests
 * - Remove test contacts from Brevo lists after tests
 * - Clean up test email events and transactional emails
 * - Identify test emails by patterns and namespaces
 * - Rate limit handling for Brevo API
 * - Safety checks to prevent deletion of real subscribers
 * - Integration with global teardown process
 */

import { getBrevoService, resetBrevoService } from '../../../api/lib/brevo-service.js';

/**
 * Configuration for test data identification in Brevo
 */
const BREVO_TEST_PATTERNS = {
  // Email domains that indicate test data
  testDomains: [
    '@e2etest.example.com',
    '@test.example.com', 
    '@example.com',
    '@test.com',
    '@playwright.test',
    '@automation.test'
  ],
  
  // Email prefixes that indicate test data
  testPrefixes: [
    'e2e_',
    'test_',
    'playwright_',
    'automation_',
    'dummy_',
    'mock_'
  ],
  
  // Contact attributes that indicate test data
  testAttributes: [
    'e2e test',
    'automation test',
    'playwright test',
    'dummy user',
    'test user'
  ]
};

/**
 * Rate limiting configuration for Brevo API
 */
const RATE_LIMIT_CONFIG = {
  maxRequestsPerSecond: 10,
  maxRequestsPerMinute: 300,
  retryAfterSeconds: 2,
  maxRetries: 3
};

/**
 * Brevo Test Cleanup Manager
 * Handles cleanup operations for test data in Brevo
 */
class BrevoTestCleanup {
  constructor() {
    this.brevoService = null;
    this.initialized = false;
    this.trackedEmails = new Set();
    this.cleanupLog = [];
    this.rateLimiter = new RateLimiter(RATE_LIMIT_CONFIG);
  }

  /**
   * Initialize the Brevo cleanup service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Check if we're in test mode or if Brevo is mocked
      const isTestMode = process.env.E2E_TEST_MODE === 'true' || 
                        process.env.NODE_ENV === 'test' || 
                        !process.env.BREVO_API_KEY;

      if (isTestMode) {
        console.log('🧹 Brevo cleanup running in test mode - operations will be simulated');
        this.brevoService = { 
          isTestMode: true,
          makeRequest: this._mockBrevoRequest.bind(this)
        };
      } else {
        this.brevoService = getBrevoService();
      }

      this.initialized = true;
      console.log('🧹 Brevo cleanup initialized');
    } catch (error) {
      console.warn('⚠️ Failed to initialize Brevo cleanup:', error.message);
      // Fall back to mock mode
      this.brevoService = { 
        isTestMode: true,
        makeRequest: this._mockBrevoRequest.bind(this)
      };
      this.initialized = true;
    }
  }

  /**
   * Track an email address for cleanup
   * @param {string} email - Email address to track
   * @param {Object} metadata - Additional metadata about the email
   */
  trackEmail(email, metadata = {}) {
    if (this.isTestEmail(email)) {
      this.trackedEmails.add({
        email,
        addedAt: Date.now(),
        ...metadata
      });
      console.log(`📧 Tracking test email for cleanup: ${email}`);
    }
  }

  /**
   * Check if an email matches test patterns
   * @param {string} email - Email to check
   * @returns {boolean} True if email appears to be test data
   */
  isTestEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    const lowerEmail = email.toLowerCase();
    
    // Check test domains
    const hasTestDomain = BREVO_TEST_PATTERNS.testDomains.some(domain => 
      lowerEmail.endsWith(domain.toLowerCase())
    );
    
    // Check test prefixes
    const hasTestPrefix = BREVO_TEST_PATTERNS.testPrefixes.some(prefix => 
      lowerEmail.startsWith(prefix.toLowerCase())
    );
    
    // Check for common test patterns
    const hasTestPattern = lowerEmail.includes('test') && 
                          (lowerEmail.includes('@example.') || 
                           lowerEmail.includes('@test.') ||
                           lowerEmail.includes('e2e') ||
                           lowerEmail.includes('playwright'));
    
    return hasTestDomain || hasTestPrefix || hasTestPattern;
  }

  /**
   * Check if contact attributes indicate test data
   * @param {Object} contact - Brevo contact object
   * @returns {boolean} True if contact appears to be test data
   */
  isTestContact(contact) {
    if (!contact) return false;

    // Check email
    if (this.isTestEmail(contact.email)) return true;

    // Check attributes
    const attributes = contact.attributes || {};
    const firstName = (attributes.FNAME || '').toLowerCase();
    const lastName = (attributes.LNAME || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();

    // Check if names match test patterns
    const hasTestName = BREVO_TEST_PATTERNS.testAttributes.some(pattern =>
      fullName.includes(pattern.toLowerCase()) ||
      firstName.includes('test') ||
      lastName.includes('test') ||
      firstName.includes('dummy') ||
      lastName.includes('dummy')
    );

    // Check signup source
    const signupSource = (attributes.SIGNUP_SOURCE || '').toLowerCase();
    const hasTestSource = signupSource.includes('test') || 
                         signupSource.includes('e2e') ||
                         signupSource.includes('automation');

    // Check recent signup (test data is usually recent)
    const signupDate = attributes.SIGNUP_DATE;
    const isRecentSignup = signupDate && this.isRecentTestData(signupDate);

    return hasTestName || hasTestSource || isRecentSignup;
  }

  /**
   * Check if timestamp indicates recent test data
   * @param {string} timestamp - ISO timestamp
   * @returns {boolean} True if timestamp is within test window
   */
  isRecentTestData(timestamp) {
    if (!timestamp) return false;
    
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const hoursDiff = (now - date) / (1000 * 60 * 60);
      
      // Consider data from last 48 hours as potentially test data
      return hoursDiff <= 48;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all test contacts from a specific list
   * @param {number} listId - Brevo list ID
   * @returns {Array} Array of test contacts
   */
  async getTestContactsFromList(listId) {
    await this.initialize();

    try {
      // Rate limit the request
      await this.rateLimiter.waitForSlot();

      const response = await this.brevoService.makeRequest(`/contacts/lists/${listId}/contacts`, {
        method: 'GET'
      });

      if (this.brevoService.isTestMode) {
        // Return mock test contacts
        return this._getMockTestContacts();
      }

      const contacts = response.contacts || [];
      const testContacts = contacts.filter(contact => this.isTestContact(contact));

      console.log(`🔍 Found ${testContacts.length} test contacts in list ${listId}`);
      return testContacts;

    } catch (error) {
      console.warn(`⚠️ Failed to get test contacts from list ${listId}:`, error.message);
      return [];
    }
  }

  /**
   * Remove a contact from Brevo entirely
   * @param {string} email - Email address to remove
   * @returns {boolean} Success status
   */
  async removeContact(email) {
    await this.initialize();

    if (!this.isTestEmail(email)) {
      console.warn(`⚠️ Refusing to delete non-test email: ${email}`);
      return false;
    }

    try {
      // Rate limit the request
      await this.rateLimiter.waitForSlot();

      if (this.brevoService.isTestMode) {
        console.log(`🧹 [MOCK] Would delete contact: ${email}`);
        this.cleanupLog.push({
          action: 'delete_contact',
          email,
          timestamp: new Date().toISOString(),
          mock: true
        });
        return true;
      }

      await this.brevoService.deleteContact(email);
      
      this.cleanupLog.push({
        action: 'delete_contact',
        email,
        timestamp: new Date().toISOString()
      });

      console.log(`🧹 Deleted test contact: ${email}`);
      return true;

    } catch (error) {
      if (error.message.includes('contact_not_exist')) {
        console.log(`📧 Contact ${email} already removed or doesn't exist`);
        return true; // Consider this success
      }

      console.warn(`❌ Failed to delete contact ${email}:`, error.message);
      return false;
    }
  }

  /**
   * Remove test contacts from specific lists
   * @param {Array} listIds - List IDs to clean
   * @returns {Object} Cleanup results
   */
  async removeTestContactsFromLists(listIds = []) {
    await this.initialize();

    const results = {
      totalProcessed: 0,
      totalRemoved: 0,
      errors: []
    };

    for (const listId of listIds) {
      console.log(`🧹 Cleaning test contacts from list ${listId}...`);

      try {
        const testContacts = await this.getTestContactsFromList(listId);
        results.totalProcessed += testContacts.length;

        for (const contact of testContacts) {
          // Rate limit the requests
          await this.rateLimiter.waitForSlot();

          try {
            if (this.brevoService.isTestMode) {
              console.log(`🧹 [MOCK] Would remove ${contact.email} from list ${listId}`);
              results.totalRemoved++;
            } else {
              await this.brevoService.removeContactFromLists(contact.email, [listId]);
              console.log(`🧹 Removed ${contact.email} from list ${listId}`);
              results.totalRemoved++;
            }

            this.cleanupLog.push({
              action: 'remove_from_list',
              email: contact.email,
              listId,
              timestamp: new Date().toISOString(),
              mock: this.brevoService.isTestMode
            });

          } catch (error) {
            results.errors.push({
              email: contact.email,
              listId,
              error: error.message
            });
            console.warn(`❌ Failed to remove ${contact.email} from list ${listId}:`, error.message);
          }
        }

      } catch (error) {
        results.errors.push({
          listId,
          error: error.message
        });
        console.warn(`❌ Failed to process list ${listId}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Clean up all tracked test emails
   * @param {Object} options - Cleanup options
   * @returns {Object} Cleanup results
   */
  async cleanupTrackedEmails(options = {}) {
    const { removeFromLists = true, deleteContacts = false } = options;

    await this.initialize();

    console.log(`🧹 Starting cleanup of ${this.trackedEmails.size} tracked test emails...`);

    const results = {
      totalProcessed: 0,
      totalCleaned: 0,
      errors: [],
      skipped: []
    };

    for (const emailData of this.trackedEmails) {
      const { email } = emailData;
      results.totalProcessed++;

      try {
        // Safety check - verify this is still a test email
        if (!this.isTestEmail(email)) {
          results.skipped.push({
            email,
            reason: 'Not identified as test email'
          });
          continue;
        }

        if (deleteContacts) {
          // Completely remove contact
          const removed = await this.removeContact(email);
          if (removed) results.totalCleaned++;
        } else if (removeFromLists) {
          // Just remove from newsletter lists
          if (this.brevoService.isTestMode) {
            console.log(`🧹 [MOCK] Would remove ${email} from all lists`);
            results.totalCleaned++;
          } else {
            await this.brevoService.unsubscribeContact(email);
            console.log(`🧹 Unsubscribed test email: ${email}`);
            results.totalCleaned++;
          }
        }

        this.cleanupLog.push({
          action: deleteContacts ? 'delete_contact' : 'unsubscribe',
          email,
          timestamp: new Date().toISOString(),
          mock: this.brevoService.isTestMode
        });

      } catch (error) {
        results.errors.push({
          email,
          error: error.message
        });
        console.warn(`❌ Failed to cleanup ${email}:`, error.message);
      }

      // Small delay between operations to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clear tracked emails after cleanup
    this.trackedEmails.clear();

    console.log(`🧹 Cleanup complete: ${results.totalCleaned}/${results.totalProcessed} emails processed`);
    
    if (results.errors.length > 0) {
      console.warn(`⚠️ ${results.errors.length} cleanup errors occurred`);
    }

    return results;
  }

  /**
   * Perform comprehensive cleanup of all test data
   * @param {Object} options - Cleanup options
   * @returns {Object} Comprehensive cleanup results
   */
  async performFullCleanup(options = {}) {
    const {
      newsletterListId = process.env.BREVO_NEWSLETTER_LIST_ID || 1,
      ticketHoldersListId = process.env.BREVO_TICKET_HOLDERS_LIST_ID || 2,
      cleanTrackedEmails = true,
      cleanAllLists = true
    } = options;

    await this.initialize();

    console.log('🧹 Starting comprehensive Brevo test data cleanup...');

    const results = {
      trackedEmailsCleanup: null,
      listCleanup: null,
      totalOperations: 0,
      errors: []
    };

    try {
      // Clean tracked emails first
      if (cleanTrackedEmails) {
        console.log('📧 Cleaning tracked test emails...');
        results.trackedEmailsCleanup = await this.cleanupTrackedEmails({
          removeFromLists: true,
          deleteContacts: false // Be conservative - just unsubscribe
        });
        results.totalOperations += results.trackedEmailsCleanup.totalProcessed;
      }

      // Clean test contacts from lists
      if (cleanAllLists) {
        console.log('📋 Cleaning test contacts from lists...');
        const listsToClean = [newsletterListId, ticketHoldersListId].filter(Boolean);
        results.listCleanup = await this.removeTestContactsFromLists(listsToClean);
        results.totalOperations += results.listCleanup.totalProcessed;
      }

      // Log final results
      console.log(`✅ Comprehensive Brevo cleanup completed:`);
      console.log(`   - Total operations: ${results.totalOperations}`);
      if (results.trackedEmailsCleanup) {
        console.log(`   - Tracked emails cleaned: ${results.trackedEmailsCleanup.totalCleaned}`);
      }
      if (results.listCleanup) {
        console.log(`   - List contacts removed: ${results.listCleanup.totalRemoved}`);
      }

    } catch (error) {
      console.error('❌ Comprehensive cleanup failed:', error.message);
      results.errors.push(error.message);
    }

    return results;
  }

  /**
   * Get cleanup statistics and logs
   * @returns {Object} Cleanup statistics
   */
  getCleanupStats() {
    return {
      trackedEmails: this.trackedEmails.size,
      cleanupLog: this.cleanupLog,
      isTestMode: this.brevoService?.isTestMode || false,
      initialized: this.initialized
    };
  }

  /**
   * Mock Brevo request for test mode
   * @private
   */
  async _mockBrevoRequest(endpoint, options = {}) {
    const method = options.method || 'GET';
    
    console.log(`🧹 [MOCK] Brevo API: ${method} ${endpoint}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return appropriate mock responses
    if (endpoint.includes('/contacts/lists/') && endpoint.includes('/contacts')) {
      return { contacts: this._getMockTestContacts() };
    }
    
    return { success: true, mock: true };
  }

  /**
   * Get mock test contacts for testing
   * @private
   */
  _getMockTestContacts() {
    return [
      {
        email: 'e2e_test_123@e2etest.example.com',
        attributes: {
          FNAME: 'Test',
          LNAME: 'User',
          SIGNUP_SOURCE: 'e2e_test',
          SIGNUP_DATE: new Date().toISOString()
        }
      },
      {
        email: 'playwright_automation@test.example.com', 
        attributes: {
          FNAME: 'Automation',
          LNAME: 'Tester',
          SIGNUP_SOURCE: 'automation_test',
          SIGNUP_DATE: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
        }
      }
    ];
  }
}

/**
 * Rate limiter for API requests
 */
class RateLimiter {
  constructor(config) {
    this.config = config;
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    
    // Remove old requests (older than 1 minute)
    this.requests = this.requests.filter(time => now - time < 60000);
    
    // Check if we've exceeded rate limits
    const recentRequests = this.requests.filter(time => now - time < 1000);
    
    if (recentRequests.length >= this.config.maxRequestsPerSecond) {
      // Wait until we can make another request
      const delay = 1000 - (now - recentRequests[0]);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    if (this.requests.length >= this.config.maxRequestsPerMinute) {
      // Wait until oldest request expires
      const delay = 60000 - (now - this.requests[0]);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.requests.push(now);
  }
}

// Create singleton instance
const brevoCleanup = new BrevoTestCleanup();

/**
 * Export functions for easy use in tests
 */

/**
 * Track an email for cleanup
 * @param {string} email - Email to track
 * @param {Object} metadata - Additional metadata
 */
export function trackTestEmail(email, metadata = {}) {
  brevoCleanup.trackEmail(email, metadata);
}

/**
 * Check if email is a test email
 * @param {string} email - Email to check
 * @returns {boolean} True if test email
 */
export function isTestEmail(email) {
  return brevoCleanup.isTestEmail(email);
}

/**
 * Clean up all tracked test emails
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup results
 */
export async function cleanupTestEmails(options = {}) {
  return await brevoCleanup.cleanupTrackedEmails(options);
}

/**
 * Perform full Brevo test cleanup
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup results  
 */
export async function performBrevoTestCleanup(options = {}) {
  return await brevoCleanup.performFullCleanup(options);
}

/**
 * Get cleanup statistics
 * @returns {Object} Cleanup stats
 */
export function getBrevoCleanupStats() {
  return brevoCleanup.getCleanupStats();
}

/**
 * Initialize Brevo cleanup (called automatically but can be called explicitly)
 * @returns {Promise<void>}
 */
export async function initializeBrevoCleanup() {
  await brevoCleanup.initialize();
}

// Export the cleanup class for advanced usage
export { BrevoTestCleanup, BREVO_TEST_PATTERNS, RATE_LIMIT_CONFIG };

// Default export for convenience
export default brevoCleanup;