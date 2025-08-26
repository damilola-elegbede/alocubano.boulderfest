/**
 * Test data fixtures for E2E tests
 */

export const testUsers = {
  validUser: {
    name: 'John Doe',
    email: 'john.doe@e2e-test.com',
    phone: '555-123-4567',
    dietaryRestrictions: 'Vegetarian',
    emergencyContact: 'Jane Doe - 555-987-6543'
  },
  
  invalidUser: {
    name: '',
    email: 'invalid-email',
    phone: '123',
    dietaryRestrictions: 'x'.repeat(1000),
    emergencyContact: ''
  },
  
  specialCharUser: {
    name: "O'Brien-Smith",
    email: 'test+alias@e2e-test.com',
    phone: '(555) 123-4567',
    dietaryRestrictions: 'Gluten-free & Vegan',
    emergencyContact: 'Emergency: 911'
  }
};

export const testTickets = {
  fullPass: {
    type: 'full-pass',
    quantity: 1,
    expectedPrice: 150
  },
  
  dayPass: {
    type: 'day-pass',
    quantity: 2,
    expectedPrice: 120 // 60 * 2
  },
  
  socialPass: {
    type: 'social-pass',
    quantity: 3,
    expectedPrice: 90 // 30 * 3
  }
};

export const testPayment = {
  validCard: {
    number: '4242424242424242',
    expiry: '12/25',
    cvc: '123',
    zip: '80301'
  },
  
  declinedCard: {
    number: '4000000000000002',
    expiry: '12/25',
    cvc: '123',
    zip: '80301'
  },
  
  insufficientFunds: {
    number: '4000000000009995',
    expiry: '12/25',
    cvc: '123',
    zip: '80301'
  }
};

export const testDonations = {
  small: {
    amount: 10,
    message: 'Great festival!'
  },
  
  medium: {
    amount: 50,
    message: 'Supporting Cuban culture in Boulder'
  },
  
  large: {
    amount: 500,
    message: 'Proud sponsor of A Lo Cubano Boulder Fest'
  }
};

export const testEmails = {
  newsletter: {
    validEmails: [
      'test@example.com',
      'user+tag@domain.co.uk',
      'firstname.lastname@company.org'
    ],
    invalidEmails: [
      'notanemail',
      '@nodomain.com',
      'missing@.com',
      'spaces in@email.com'
    ]
  }
};

export const testContent = {
  artists: [
    {
      name: 'Orquesta Aragón',
      bio: 'Legendary Cuban charanga orchestra',
      performance: 'Friday Night Gala'
    },
    {
      name: 'Los Van Van',
      bio: 'The Rolling Stones of Salsa',
      performance: 'Saturday Main Stage'
    }
  ],
  
  schedule: {
    friday: [
      { time: '6:00 PM', event: 'Doors Open' },
      { time: '7:00 PM', event: 'Welcome Reception' },
      { time: '8:00 PM', event: 'Opening Performance' }
    ],
    saturday: [
      { time: '10:00 AM', event: 'Dance Workshops Begin' },
      { time: '2:00 PM', event: 'Lunch & Social' },
      { time: '8:00 PM', event: 'Main Concert' }
    ],
    sunday: [
      { time: '11:00 AM', event: 'Brunch' },
      { time: '1:00 PM', event: 'Final Workshops' },
      { time: '5:00 PM', event: 'Closing Ceremony' }
    ]
  }
};

export const testURLs = {
  pages: {
    home: '/',
    tickets: '/tickets',
    donations: '/donations',
    about: '/about',
    artists: '/artists',
    schedule: '/schedule',
    gallery: '/gallery',
    contact: '/contact'
  },
  
  api: {
    health: '/api/health/check',
    subscribe: '/api/email/subscribe',
    checkout: '/api/payments/create-checkout-session',
    gallery: '/api/gallery',
    featuredPhotos: '/api/featured-photos'
  },
  
  admin: {
    login: '/admin/login',
    dashboard: '/admin/dashboard',
    registrations: '/admin/registrations'
  }
};

export const testViewports = {
  mobile: {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  
  tablet: {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true
  },
  
  desktop: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false
  },
  
  laptop: {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false
  }
};

export const testTimeouts = {
  short: 1000,
  medium: 5000,
  long: 10000,
  navigation: 15000,
  api: 30000
};

/**
 * Generate unique test data for each test run
 */
export function generateUniqueTestData(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 7);
  
  return {
    user: {
      name: `Test User ${timestamp}`,
      email: `${prefix}_${timestamp}_${random}@e2e-test.com`,
      phone: `555-${String(timestamp).slice(-7)}`,
      dietaryRestrictions: `Test dietary ${random}`,
      emergencyContact: `Emergency ${timestamp}`
    },
    orderId: `order_${timestamp}_${random}`,
    ticketId: `ticket_${timestamp}_${random}`,
    sessionId: `session_${timestamp}_${random}`,
    transactionId: `txn_${timestamp}_${random}`
  };
}

/**
 * Get test data for specific environment
 */
export function getEnvironmentData(env = process.env.NODE_ENV) {
  const environments = {
    development: {
      baseURL: 'http://localhost:3000',
      apiTimeout: 5000,
      adminPassword: 'test-password'
    },
    test: {
      baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
      apiTimeout: 10000,
      adminPassword: process.env.TEST_ADMIN_PASSWORD || 'test-password'
    },
    staging: {
      baseURL: process.env.STAGING_URL || 'https://staging.alocubanoboulderfest.com',
      apiTimeout: 15000,
      adminPassword: process.env.STAGING_ADMIN_PASSWORD
    }
  };
  
  return environments[env] || environments.test;
}

export default {
  users: testUsers,
  tickets: testTickets,
  payment: testPayment,
  donations: testDonations,
  emails: testEmails,
  content: testContent,
  urls: testURLs,
  viewports: testViewports,
  timeouts: testTimeouts,
  generateUniqueTestData,
  getEnvironmentData
};