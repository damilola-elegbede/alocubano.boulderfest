/**
 * Test Fixtures - Pre-configured Test Data
 * 
 * Provides ready-to-use test data fixtures for common E2E test scenarios.
 * All fixtures automatically use the test isolation system to ensure
 * unique data per test run.
 */

import {
  generateTestEmail,
  generateTestUser,
  generateTestTicketId,
  generateRegistrationData,
  generatePaymentData,
  getTestNamespace
} from './test-isolation.js';

/**
 * Newsletter subscription fixtures
 */
export const NewsletterFixtures = {
  /**
   * Valid newsletter subscription data
   */
  validSubscription(testTitle) {
    return {
      email: generateTestEmail(testTitle, 'newsletter'),
      consent: true,
      source: 'e2e-test'
    };
  },

  /**
   * Invalid newsletter subscription data
   */
  invalidSubscription(testTitle) {
    return {
      email: 'invalid-email',
      consent: false
    };
  },

  /**
   * Newsletter subscription with custom domain
   */
  customDomainSubscription(testTitle, domain = 'testdomain.com') {
    const namespace = getTestNamespace(testTitle);
    return {
      email: `${namespace}@${domain}`,
      consent: true,
      source: 'e2e-test-custom'
    };
  }
};

/**
 * User registration fixtures
 */
export const RegistrationFixtures = {
  /**
   * Complete valid registration data
   */
  validRegistration(testTitle, overrides = {}) {
    const baseData = generateRegistrationData(testTitle);
    return {
      ...baseData,
      user: {
        ...baseData.user,
        firstName: 'Maria',
        lastName: 'Rodriguez',
        phone: '+1-555-0123',
        dietaryRestrictions: 'Vegetarian',
        emergencyContact: 'Carlos Rodriguez',
        emergencyPhone: '+1-555-0124',
        ...overrides.user
      },
      ...overrides
    };
  },

  /**
   * Minimal registration data (required fields only)
   */
  minimalRegistration(testTitle) {
    const user = generateTestUser(testTitle);
    return {
      ticketId: generateTestTicketId(testTitle, 'MIN'),
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        emergencyContact: user.emergencyContact,
        emergencyPhone: user.emergencyPhone
      }
    };
  },

  /**
   * Registration with special dietary needs
   */
  dietaryNeedsRegistration(testTitle, dietaryRestrictions = 'Gluten-free, Dairy-free') {
    const registration = this.validRegistration(testTitle);
    registration.user.dietaryRestrictions = dietaryRestrictions;
    return registration;
  },

  /**
   * International user registration
   */
  internationalRegistration(testTitle) {
    const registration = this.validRegistration(testTitle);
    return {
      ...registration,
      user: {
        ...registration.user,
        firstName: 'José',
        lastName: 'García',
        phone: '+34-600-123-456',
        emergencyContact: 'Carmen García',
        emergencyPhone: '+34-600-123-457'
      }
    };
  }
};

/**
 * Ticket and payment fixtures
 */
export const TicketFixtures = {
  /**
   * Single ticket purchase
   */
  singleTicket(testTitle, ticketType = 'full-pass') {
    return {
      ticketId: generateTestTicketId(testTitle, 'SINGLE'),
      type: ticketType,
      quantity: 1,
      price: ticketType === 'full-pass' ? 75 : 35,
      buyer: generateTestUser(testTitle),
      paymentData: generatePaymentData(testTitle, {
        amount: (ticketType === 'full-pass' ? 75 : 35) * 100 // Convert to cents
      })
    };
  },

  /**
   * Multiple ticket purchase
   */
  multipleTickets(testTitle, quantity = 3) {
    const tickets = [];
    const buyer = generateTestUser(testTitle);
    
    for (let i = 0; i < quantity; i++) {
      tickets.push({
        ticketId: generateTestTicketId(testTitle, `MULTI${i + 1}`),
        type: 'full-pass',
        buyer,
        registrationRequired: i === 0 // First ticket needs registration
      });
    }

    return {
      tickets,
      totalQuantity: quantity,
      totalPrice: quantity * 75,
      buyer,
      paymentData: generatePaymentData(testTitle, {
        amount: quantity * 75 * 100 // Convert to cents
      })
    };
  },

  /**
   * Day pass ticket
   */
  dayPass(testTitle, day = 'saturday') {
    return {
      ticketId: generateTestTicketId(testTitle, 'DAY'),
      type: 'day-pass',
      day: day,
      quantity: 1,
      price: 35,
      buyer: generateTestUser(testTitle),
      paymentData: generatePaymentData(testTitle, {
        amount: 35 * 100
      })
    };
  }
};

/**
 * Admin and authentication fixtures
 */
export const AdminFixtures = {
  /**
   * Valid admin credentials
   */
  validAdmin() {
    return {
      password: process.env.TEST_ADMIN_PASSWORD || 'test-password',
      expectedRedirect: '/admin/dashboard'
    };
  },

  /**
   * Invalid admin credentials
   */
  invalidAdmin() {
    return {
      password: 'wrong-password',
      expectedError: 'Invalid password'
    };
  },

  /**
   * Admin session data
   */
  adminSession(testTitle) {
    const namespace = getTestNamespace(testTitle);
    return {
      sessionId: `admin_${namespace}`,
      isAuthenticated: true,
      loginTime: Date.now()
    };
  }
};

/**
 * Gallery and media fixtures
 */
export const GalleryFixtures = {
  /**
   * Sample gallery images
   */
  sampleImages(count = 5) {
    const images = [];
    for (let i = 1; i <= count; i++) {
      images.push({
        id: `test-image-${i}`,
        name: `Test Image ${i}.jpg`,
        webViewLink: `https://drive.google.com/file/d/test-image-${i}/view`,
        thumbnailLink: `https://drive.google.com/thumbnail?id=test-image-${i}`,
        mimeType: 'image/jpeg',
        size: '1024000',
        createdTime: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString()
      });
    }
    return images;
  },

  /**
   * Gallery navigation data
   */
  galleryNavigation() {
    return {
      currentPage: 1,
      itemsPerPage: 20,
      totalItems: 150,
      hasNextPage: true,
      hasPreviousPage: false
    };
  }
};

/**
 * Mobile-specific fixtures
 */
export const MobileFixtures = {
  /**
   * Mobile registration data optimized for touch interfaces
   */
  mobileRegistration(testTitle) {
    const registration = RegistrationFixtures.validRegistration(testTitle);
    return {
      ...registration,
      deviceType: 'mobile',
      touchOptimized: true,
      user: {
        ...registration.user,
        phone: registration.user.phone.replace(/[^\d+]/g, '') // Remove formatting for mobile input
      }
    };
  },

  /**
   * Mobile viewport settings
   */
  mobileViewport() {
    return {
      width: 375,
      height: 667,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    };
  },

  /**
   * Tablet viewport settings
   */
  tabletViewport() {
    return {
      width: 768,
      height: 1024,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    };
  }
};

/**
 * API testing fixtures
 */
export const APIFixtures = {
  /**
   * Standard API headers for testing
   */
  headers(contentType = 'application/json') {
    return {
      'Content-Type': contentType,
      'User-Agent': 'E2E-Test-Suite'
    };
  },

  /**
   * API request with authentication
   */
  authenticatedRequest(testTitle, data = {}) {
    return {
      headers: this.headers(),
      body: JSON.stringify({
        ...data,
        testNamespace: getTestNamespace(testTitle),
        timestamp: Date.now()
      })
    };
  },

  /**
   * API error scenarios
   */
  errorScenarios() {
    return {
      invalidJSON: '{"invalid": json}',
      missingField: { email: 'test@example.com' }, // Missing required fields
      invalidEmail: { email: 'invalid-email', consent: true },
      serverError: { simulateError: 'INTERNAL_ERROR' }
    };
  }
};

/**
 * Performance testing fixtures
 */
export const PerformanceFixtures = {
  /**
   * Load test data - multiple concurrent operations
   */
  loadTestData(testTitle, count = 10) {
    const operations = [];
    for (let i = 0; i < count; i++) {
      operations.push({
        id: i,
        email: generateTestEmail(testTitle, `load${i}`),
        user: generateTestUser(testTitle, { firstName: `LoadTest${i}` }),
        timestamp: Date.now() + i * 100 // Stagger requests
      });
    }
    return operations;
  },

  /**
   * Performance thresholds
   */
  performanceThresholds() {
    return {
      apiResponse: 500, // 500ms max API response
      pageLoad: 3000,   // 3s max page load
      imageLoad: 2000,  // 2s max image load
      formSubmit: 1000  // 1s max form submission
    };
  }
};

/**
 * Database testing fixtures
 */
export const DatabaseFixtures = {
  /**
   * Sample database records for testing
   */
  sampleRecords(testTitle, count = 5) {
    const records = [];
    const namespace = getTestNamespace(testTitle);
    
    for (let i = 1; i <= count; i++) {
      records.push({
        id: `${namespace}_record_${i}`,
        email: generateTestEmail(testTitle, `db${i}`),
        created_at: new Date(Date.now() - i * 60000).toISOString(), // 1 minute apart
        status: i % 2 === 0 ? 'active' : 'pending'
      });
    }
    return records;
  }
};

/**
 * Utility function to get all fixtures for a test
 * @param {string} testTitle - Title of the test
 * @returns {Object} All fixtures configured for the test
 */
export function getAllFixtures(testTitle) {
  return {
    newsletter: {
      valid: NewsletterFixtures.validSubscription(testTitle),
      invalid: NewsletterFixtures.invalidSubscription(testTitle)
    },
    registration: {
      valid: RegistrationFixtures.validRegistration(testTitle),
      minimal: RegistrationFixtures.minimalRegistration(testTitle),
      international: RegistrationFixtures.internationalRegistration(testTitle)
    },
    tickets: {
      single: TicketFixtures.singleTicket(testTitle),
      multiple: TicketFixtures.multipleTickets(testTitle),
      dayPass: TicketFixtures.dayPass(testTitle)
    },
    admin: AdminFixtures.validAdmin(),
    gallery: {
      images: GalleryFixtures.sampleImages(),
      navigation: GalleryFixtures.galleryNavigation()
    },
    mobile: {
      registration: MobileFixtures.mobileRegistration(testTitle),
      viewport: MobileFixtures.mobileViewport()
    },
    api: {
      headers: APIFixtures.headers(),
      errors: APIFixtures.errorScenarios()
    },
    performance: {
      loadTest: PerformanceFixtures.loadTestData(testTitle),
      thresholds: PerformanceFixtures.performanceThresholds()
    }
  };
}