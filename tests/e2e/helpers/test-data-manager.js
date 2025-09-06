/**
 * Test Data Manager - Advanced test data lifecycle management
 * 
 * Provides comprehensive test data management for complex E2E scenarios
 * including concurrent user testing, data cleanup, and state tracking.
 */

import { generateTestEmail, generateTestId, generateTestUser } from './test-isolation.js';

/**
 * Test Data Manager - Manages test data lifecycle and cleanup
 */
export class TestDataManager {
  constructor(options = {}) {
    this.testId = options.testId || generateTestId('manager');
    this.createdAt = Date.now(); // Initialize createdAt timestamp
    this.createdData = new Map(); // Track all created data
    this.cleanupTasks = new Set(); // Track cleanup functions
    this.options = {
      autoCleanup: true,
      trackResources: true,
      ...options
    };
    
    console.log(`🗃️  Test Data Manager initialized: ${this.testId}`);
  }

  /**
   * Generate and track test user data
   * @param {string} userType - Type of user (attendee, admin, etc.)
   * @param {Object} overrides - Override default values
   * @returns {Object} Generated user data
   */
  generateUser(userType = 'attendee', overrides = {}) {
    const user = {
      ...generateTestUser(this.testId),
      type: userType,
      createdAt: Date.now(),
      managerId: this.testId,
      ...overrides
    };

    // Track the user
    this.trackResource('user', user.id, user);
    
    console.log(`👤 Generated ${userType} user: ${user.email}`);
    return user;
  }

  /**
   * Generate multiple users for concurrent testing
   * @param {number} count - Number of users to generate
   * @param {string} userType - Type of users
   * @param {Object} baseOverrides - Base overrides for all users
   * @returns {Array} Array of generated users
   */
  generateMultipleUsers(count, userType = 'attendee', baseOverrides = {}) {
    const users = [];
    
    for (let i = 0; i < count; i++) {
      const user = this.generateUser(userType, {
        ...baseOverrides,
        sequenceNumber: i + 1,
        batchId: `${this.testId}_batch_${Date.now()}`
      });
      users.push(user);
    }
    
    console.log(`👥 Generated ${count} ${userType} users`);
    return users;
  }

  /**
   * Generate test registration data
   * @param {Object} user - User to register
   * @param {Object} ticketInfo - Ticket information
   * @returns {Object} Registration data
   */
  generateRegistration(user, ticketInfo = {}) {
    const registration = {
      id: generateTestId('registration'),
      userId: user.id,
      ticketId: generateTestId('ticket'),
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        emergencyContact: user.emergencyContact?.name || 'Test Emergency Contact',
        emergencyPhone: user.emergencyContact?.phone || '+1987654321',
        dietaryRestrictions: '',
        accessibilityNeeds: '',
        workshopPreferences: ['Salsa Basics']
      },
      ticket: {
        type: 'weekend-pass',
        price: 85.00,
        quantity: 1,
        ...ticketInfo
      },
      createdAt: Date.now(),
      managerId: this.testId
    };

    this.trackResource('registration', registration.id, registration);
    
    console.log(`📝 Generated registration for ${user.email}: ${registration.id}`);
    return registration;
  }

  /**
   * Generate test payment data
   * @param {Object} registration - Registration to pay for
   * @param {Object} paymentOverrides - Payment overrides
   * @returns {Object} Payment data
   */
  generatePayment(registration, paymentOverrides = {}) {
    const payment = {
      id: generateTestId('payment'),
      registrationId: registration.id,
      amount: (registration.ticket.price * registration.ticket.quantity * 100), // Convert to cents
      currency: 'usd',
      status: 'pending',
      method: 'card',
      testData: {
        card: {
          number: '4242424242424242',
          exp_month: 12,
          exp_year: new Date().getFullYear() + 1,
          cvc: '123'
        }
      },
      createdAt: Date.now(),
      managerId: this.testId,
      ...paymentOverrides
    };

    this.trackResource('payment', payment.id, payment);
    
    console.log(`💳 Generated payment for registration ${registration.id}: $${payment.amount / 100}`);
    return payment;
  }

  /**
   * Create complete test scenario data
   * @param {string} scenarioType - Type of scenario
   * @param {Object} options - Scenario options
   * @returns {Object} Complete scenario data
   */
  createScenario(scenarioType, options = {}) {
    console.log(`🎬 Creating scenario: ${scenarioType}`);
    
    switch (scenarioType) {
      case 'single-ticket-purchase':
        return this.createSingleTicketScenario(options);
      
      case 'multiple-tickets':
        return this.createMultipleTicketScenario(options);
      
      case 'concurrent-users':
        return this.createConcurrentUsersScenario(options);
      
      case 'newsletter-signup':
        return this.createNewsletterScenario(options);
      
      default:
        throw new Error(`Unknown scenario type: ${scenarioType}`);
    }
  }

  /**
   * Create single ticket purchase scenario
   */
  createSingleTicketScenario(options = {}) {
    const user = this.generateUser('attendee', options.userOverrides);
    const registration = this.generateRegistration(user, options.ticketOverrides);
    const payment = this.generatePayment(registration, options.paymentOverrides);

    const scenario = {
      type: 'single-ticket-purchase',
      user,
      registration,
      payment,
      managerId: this.testId
    };

    this.trackResource('scenario', scenario.type, scenario);
    return scenario;
  }

  /**
   * Create multiple tickets scenario
   */
  createMultipleTicketScenario(options = {}) {
    const { ticketCount = 3 } = options;
    const buyer = this.generateUser('buyer', options.buyerOverrides);
    const registrations = [];

    // Create registrations for each ticket
    for (let i = 0; i < ticketCount; i++) {
      const attendeeUser = this.generateUser('attendee', {
        ...options.attendeeOverrides,
        sequenceNumber: i + 1,
        buyer: buyer.email
      });
      
      const registration = this.generateRegistration(attendeeUser, {
        ...options.ticketOverrides,
        ticketNumber: i + 1
      });
      
      registrations.push(registration);
    }

    // Single payment for all tickets - calculate total including quantity
    const totalAmount = registrations.reduce((sum, reg) => sum + (reg.ticket.price * reg.ticket.quantity), 0);
    const payment = this.generatePayment(registrations[0], {
      amount: totalAmount * 100, // Convert to cents
      registrationIds: registrations.map(r => r.id),
      ...options.paymentOverrides
    });

    const scenario = {
      type: 'multiple-tickets',
      buyer,
      registrations,
      payment,
      ticketCount,
      managerId: this.testId
    };

    this.trackResource('scenario', `${scenario.type}_${Date.now()}`, scenario);
    return scenario;
  }

  /**
   * Create concurrent users scenario
   */
  createConcurrentUsersScenario(options = {}) {
    const { userCount = 5, actionsPerUser = 3 } = options;
    const users = this.generateMultipleUsers(userCount, 'concurrent_test', options.userOverrides);
    
    const scenario = {
      type: 'concurrent-users',
      users,
      userCount,
      actionsPerUser,
      startTime: null,
      endTime: null,
      results: {},
      managerId: this.testId
    };

    this.trackResource('scenario', `${scenario.type}_${Date.now()}`, scenario);
    return scenario;
  }

  /**
   * Create newsletter scenario
   */
  createNewsletterScenario(options = {}) {
    const { subscriberCount = 1 } = options;
    const subscribers = [];

    for (let i = 0; i < subscriberCount; i++) {
      const subscriber = {
        email: generateTestEmail(this.testId, `newsletter_${i + 1}`),
        consent: true,
        source: 'e2e-test',
        subscriptionDate: Date.now(),
        managerId: this.testId
      };
      
      subscribers.push(subscriber);
      this.trackResource('subscriber', subscriber.email, subscriber);
    }

    const scenario = {
      type: 'newsletter-signup',
      subscribers,
      subscriberCount,
      managerId: this.testId
    };

    this.trackResource('scenario', `${scenario.type}_${Date.now()}`, scenario);
    return scenario;
  }

  /**
   * Track a resource for cleanup
   * @param {string} type - Resource type
   * @param {string} id - Resource ID
   * @param {Object} data - Resource data
   */
  trackResource(type, id, data) {
    if (!this.options.trackResources) return;

    const key = `${type}:${id}`;
    this.createdData.set(key, {
      type,
      id,
      data,
      createdAt: Date.now()
    });

    console.log(`📊 Tracked ${type}: ${id}`);
  }

  /**
   * Add cleanup task
   * @param {Function} cleanupFn - Cleanup function
   * @param {string} description - Description of cleanup
   */
  addCleanupTask(cleanupFn, description = 'Generic cleanup') {
    this.cleanupTasks.add({
      fn: cleanupFn,
      description,
      addedAt: Date.now()
    });
    
    console.log(`🧹 Added cleanup task: ${description}`);
  }

  /**
   * Get all tracked resources of a specific type
   * @param {string} type - Resource type
   * @returns {Array} Resources of the specified type
   */
  getResourcesByType(type) {
    const resources = [];
    for (const [key, resource] of this.createdData.entries()) {
      if (resource.type === type) {
        resources.push(resource);
      }
    }
    return resources;
  }

  /**
   * Get resource by ID
   * @param {string} type - Resource type
   * @param {string} id - Resource ID
   * @returns {Object|null} Resource data or null
   */
  getResource(type, id) {
    const key = `${type}:${id}`;
    const resource = this.createdData.get(key);
    return resource ? resource.data : null;
  }

  /**
   * Get manager statistics
   * @returns {Object} Statistics about managed resources
   */
  getStats() {
    const stats = {
      totalResources: this.createdData.size,
      cleanupTasks: this.cleanupTasks.size,
      resourceTypes: {},
      managerId: this.testId,
      uptime: Date.now() - this.createdAt
    };

    // Count resources by type
    for (const [, resource] of this.createdData.entries()) {
      stats.resourceTypes[resource.type] = (stats.resourceTypes[resource.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Execute all cleanup tasks
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanup() {
    if (!this.options.autoCleanup) {
      console.log('⚠️  Auto-cleanup disabled, skipping cleanup');
      return { cleaned: 0, errors: 0 };
    }

    console.log(`🧹 Starting cleanup for manager ${this.testId}`);
    
    let cleaned = 0;
    let errors = 0;

    // Execute cleanup tasks
    for (const task of this.cleanupTasks) {
      try {
        console.log(`🧹 Executing cleanup: ${task.description}`);
        await task.fn();
        cleaned++;
      } catch (error) {
        console.error(`❌ Cleanup task failed: ${task.description}`, error);
        errors++;
      }
    }

    // Clear tracked data
    const resourceCount = this.createdData.size;
    this.createdData.clear();
    this.cleanupTasks.clear();

    const result = {
      cleaned,
      errors,
      resourcesCleared: resourceCount,
      managerId: this.testId
    };

    console.log(`✅ Cleanup completed for manager ${this.testId}:`, result);
    return result;
  }

  /**
   * Export data for debugging or analysis
   * @returns {Object} All managed data
   */
  exportData() {
    const exportData = {
      managerId: this.testId,
      stats: this.getStats(),
      resources: {},
      cleanupTasks: Array.from(this.cleanupTasks).map(task => ({
        description: task.description,
        addedAt: task.addedAt
      }))
    };

    // Group resources by type
    for (const [key, resource] of this.createdData.entries()) {
      if (!exportData.resources[resource.type]) {
        exportData.resources[resource.type] = [];
      }
      exportData.resources[resource.type].push(resource);
    }

    return exportData;
  }
}

/**
 * Create a new test data manager instance
 * @param {Object} options - Manager options
 * @returns {TestDataManager} New manager instance
 */
export function createTestDataManager(options = {}) {
  return new TestDataManager(options);
}

export default TestDataManager;