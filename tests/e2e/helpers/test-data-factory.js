/**
 * Deterministic Test Data Factory
 * Generates predictable, isolated test data for E2E tests
 * Uses fixed seed for reproducibility across test runs
 */

import { faker } from '@faker-js/faker';
import crypto from 'crypto';

// Fixed seed for deterministic data generation
const FIXED_SEED = 12345;

/**
 * TestDataFactory - Main factory for test data generation
 */
export class TestDataFactory {
  constructor(options = {}) {
    // Initialize Faker with fixed seed for reproducibility
    this.faker = faker;
    this.faker.seed(options.seed || FIXED_SEED);
    
    // Generate unique test run ID for data isolation
    this.testRunId = options.testRunId || this.generateTestRunId();
    
    // Sequential counters for predictable ID generation
    this.counters = {
      customer: 0,
      ticket: 0,
      registration: 0,
      transaction: 0,
      email: 0
    };
    
    // Scenario templates
    this.scenarios = {
      'purchase-flow': this.purchaseFlowScenario.bind(this),
      'registration-flow': this.registrationFlowScenario.bind(this),
      'newsletter-flow': this.newsletterFlowScenario.bind(this),
      'admin-flow': this.adminFlowScenario.bind(this),
      'gallery-flow': this.galleryFlowScenario.bind(this)
    };
  }

  /**
   * Generate unique test run ID for data isolation
   */
  generateTestRunId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 7);
    return `E2E${timestamp}_${random}`;
  }

  /**
   * Generate sequential ID with prefix
   */
  generateId(type) {
    this.counters[type] = (this.counters[type] || 0) + 1;
    return `${this.testRunId}_${type}_${this.counters[type]}`;
  }

  /**
   * Generate deterministic customer data
   */
  generateCustomer(overrides = {}) {
    const id = this.generateId('customer');
    const baseEmail = `customer_${this.counters.customer}@e2e-test.com`;
    
    return {
      id,
      name: this.faker.person.fullName(),
      email: `${this.testRunId}_${baseEmail}`,
      phone: this.faker.phone.number('555-###-####'),
      dietaryRestrictions: this.faker.helpers.arrayElement([
        'None',
        'Vegetarian',
        'Vegan',
        'Gluten-free',
        'Dairy-free',
        'Nut allergy'
      ]),
      emergencyContact: `${this.faker.person.firstName()} ${this.faker.person.lastName()} - ${this.faker.phone.number('555-###-####')}`,
      createdAt: new Date().toISOString(),
      testRunId: this.testRunId,
      ...overrides
    };
  }

  /**
   * Generate deterministic ticket data
   */
  generateTicket(type = 'full-pass', overrides = {}) {
    const id = this.generateId('ticket');
    
    const ticketTypes = {
      'full-pass': { price: 150, days: 3, name: 'Full Festival Pass' },
      'day-pass': { price: 60, days: 1, name: 'Single Day Pass' },
      'social-pass': { price: 30, days: 1, name: 'Social Dancing Pass' },
      'vip-pass': { price: 300, days: 3, name: 'VIP All Access Pass' },
      'student-pass': { price: 75, days: 3, name: 'Student Full Pass' }
    };
    
    const ticketInfo = ticketTypes[type] || ticketTypes['full-pass'];
    
    return {
      id,
      ticketId: `TKT_${this.testRunId}_${this.counters.ticket}`,
      type,
      price: ticketInfo.price,
      name: ticketInfo.name,
      days: ticketInfo.days,
      status: 'available',
      qrCode: this.generateQRCode(id),
      validFrom: '2026-05-15T00:00:00Z',
      validTo: '2026-05-17T23:59:59Z',
      testRunId: this.testRunId,
      ...overrides
    };
  }

  /**
   * Generate deterministic registration data
   */
  generateRegistration(customer = null, ticket = null, overrides = {}) {
    const id = this.generateId('registration');
    customer = customer || this.generateCustomer();
    ticket = ticket || this.generateTicket();
    
    return {
      id,
      registrationId: `REG_${this.testRunId}_${this.counters.registration}`,
      customerId: customer.id,
      ticketId: ticket.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      ticketType: ticket.type,
      ticketPrice: ticket.price,
      status: 'pending',
      paymentStatus: 'pending',
      dietaryRestrictions: customer.dietaryRestrictions,
      emergencyContact: customer.emergencyContact,
      checkInStatus: false,
      createdAt: new Date().toISOString(),
      testRunId: this.testRunId,
      ...overrides
    };
  }

  /**
   * Generate deterministic transaction data
   */
  generateTransaction(registration = null, overrides = {}) {
    const id = this.generateId('transaction');
    registration = registration || this.generateRegistration();
    
    return {
      id,
      transactionId: `TXN_${this.testRunId}_${this.counters.transaction}`,
      registrationId: registration.id,
      stripeSessionId: `cs_test_${this.testRunId}_${this.counters.transaction}`,
      stripePaymentIntentId: `pi_test_${this.testRunId}_${this.counters.transaction}`,
      amount: registration.ticketPrice * 100, // In cents
      currency: 'usd',
      status: 'pending',
      paymentMethod: 'card',
      last4: '4242',
      brand: 'visa',
      createdAt: new Date().toISOString(),
      testRunId: this.testRunId,
      ...overrides
    };
  }

  /**
   * Generate QR code data
   */
  generateQRCode(ticketId) {
    const data = {
      ticketId,
      testRunId: this.testRunId,
      timestamp: Date.now()
    };
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * Generate email subscriber data
   */
  generateEmailSubscriber(overrides = {}) {
    const id = this.generateId('email');
    
    return {
      id,
      email: `subscriber_${this.counters.email}_${this.testRunId}@e2e-test.com`,
      status: 'active',
      subscribedAt: new Date().toISOString(),
      unsubscribeToken: crypto.randomBytes(32).toString('hex'),
      source: 'e2e-test',
      testRunId: this.testRunId,
      ...overrides
    };
  }

  /**
   * Purchase flow scenario - complete ticket purchase journey
   */
  purchaseFlowScenario(options = {}) {
    const customer = this.generateCustomer(options.customer);
    const ticket = this.generateTicket(options.ticketType || 'full-pass', options.ticket);
    const registration = this.generateRegistration(customer, ticket, {
      status: 'confirmed',
      paymentStatus: 'paid',
      ...options.registration
    });
    const transaction = this.generateTransaction(registration, {
      status: 'completed',
      ...options.transaction
    });
    
    return {
      customer,
      ticket,
      registration,
      transaction,
      testRunId: this.testRunId
    };
  }

  /**
   * Registration flow scenario - registration without payment
   */
  registrationFlowScenario(options = {}) {
    const customer = this.generateCustomer(options.customer);
    const ticket = this.generateTicket(options.ticketType || 'day-pass', options.ticket);
    const registration = this.generateRegistration(customer, ticket, {
      status: 'pending',
      paymentStatus: 'pending',
      ...options.registration
    });
    
    return {
      customer,
      ticket,
      registration,
      testRunId: this.testRunId
    };
  }

  /**
   * Newsletter flow scenario - email subscription journey
   */
  newsletterFlowScenario(options = {}) {
    const subscribers = [];
    const count = options.count || 3;
    
    for (let i = 0; i < count; i++) {
      subscribers.push(this.generateEmailSubscriber({
        status: i === 0 ? 'unsubscribed' : 'active',
        ...options.subscriber
      }));
    }
    
    return {
      subscribers,
      testRunId: this.testRunId
    };
  }

  /**
   * Admin flow scenario - admin authentication and management
   */
  adminFlowScenario(options = {}) {
    return {
      adminUser: {
        username: 'admin_e2e_test',
        password: 'TestPassword123!',
        hashedPassword: '$2b$10$YourHashedPasswordHere', // This would be properly hashed
        role: 'admin',
        testRunId: this.testRunId,
        ...options.admin
      },
      testRunId: this.testRunId
    };
  }

  /**
   * Gallery flow scenario - media content testing
   */
  galleryFlowScenario(options = {}) {
    const items = [];
    const count = options.count || 5;
    
    for (let i = 0; i < count; i++) {
      items.push({
        id: `gallery_${this.testRunId}_${i}`,
        name: `Test Image ${i + 1}`,
        mimeType: this.faker.helpers.arrayElement(['image/jpeg', 'image/png', 'video/mp4']),
        size: this.faker.number.int({ min: 100000, max: 5000000 }),
        url: `https://test-cdn.example.com/${this.testRunId}/item_${i}.jpg`,
        thumbnailUrl: `https://test-cdn.example.com/${this.testRunId}/thumb_${i}.jpg`,
        year: this.faker.helpers.arrayElement(['2024', '2023', '2022']),
        featured: i < 2,
        testRunId: this.testRunId
      });
    }
    
    return {
      items,
      testRunId: this.testRunId
    };
  }

  /**
   * Generate scenario data by name
   */
  generateScenario(scenarioName, options = {}) {
    const scenarioFunction = this.scenarios[scenarioName];
    if (!scenarioFunction) {
      throw new Error(`Unknown scenario: ${scenarioName}`);
    }
    return scenarioFunction(options);
  }

  /**
   * Reset counters for new test run
   */
  reset() {
    this.testRunId = this.generateTestRunId();
    this.counters = {
      customer: 0,
      ticket: 0,
      registration: 0,
      transaction: 0,
      email: 0
    };
  }

  /**
   * Get current test run ID
   */
  getTestRunId() {
    return this.testRunId;
  }

  /**
   * Generate bulk data for load testing
   */
  generateBulk(type, count, options = {}) {
    const items = [];
    const generators = {
      customer: this.generateCustomer.bind(this),
      ticket: this.generateTicket.bind(this),
      registration: this.generateRegistration.bind(this),
      transaction: this.generateTransaction.bind(this),
      emailSubscriber: this.generateEmailSubscriber.bind(this)
    };
    
    const generator = generators[type];
    if (!generator) {
      throw new Error(`Unknown bulk type: ${type}`);
    }
    
    for (let i = 0; i < count; i++) {
      items.push(generator(options));
    }
    
    return items;
  }
}

// Default factory instance
export const testDataFactory = new TestDataFactory();

// Helper functions for common operations
export function createTestCustomer(overrides = {}) {
  return testDataFactory.generateCustomer(overrides);
}

export function createTestTicket(type = 'full-pass', overrides = {}) {
  return testDataFactory.generateTicket(type, overrides);
}

export function createTestRegistration(customer = null, ticket = null, overrides = {}) {
  return testDataFactory.generateRegistration(customer, ticket, overrides);
}

export function createTestScenario(scenarioName, options = {}) {
  return testDataFactory.generateScenario(scenarioName, options);
}

export function getTestRunId() {
  return testDataFactory.getTestRunId();
}

export default TestDataFactory;