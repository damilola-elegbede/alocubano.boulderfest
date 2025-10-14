/**
 * Test Mode Data Fixtures
 * Provides consistent test data for test mode validation
 */

/**
 * Sample test tickets for various scenarios
 */
export const testTicketFixtures = {
  general: {
    ticketType: 'general',
    name: 'General Admission',
    price: 50,
    eventId: 1,
    isTestItem: true,
    metadata: {
      testMode: true,
      fixtureType: 'general_admission'
    }
  },

  vip: {
    ticketType: 'vip',
    name: 'VIP Access',
    price: 100,
    eventId: 1,
    isTestItem: true,
    metadata: {
      testMode: true,
      fixtureType: 'vip_access'
    }
  },

  workshop: {
    ticketType: 'workshop',
    name: 'Salsa Workshop',
    price: 75,
    eventId: 1,
    isTestItem: true,
    metadata: {
      testMode: true,
      fixtureType: 'workshop'
    }
  },

  earlyBird: {
    ticketType: 'early_bird',
    name: 'Early Bird Special',
    price: 40,
    eventId: 1,
    isTestItem: true,
    metadata: {
      testMode: true,
      fixtureType: 'early_bird'
    }
  },

  group: {
    ticketType: 'group',
    name: 'Group Discount (4+)',
    price: 45,
    eventId: 1,
    isTestItem: true,
    metadata: {
      testMode: true,
      fixtureType: 'group_discount'
    }
  }
};

/**
 * Sample test donations
 */
export const testDonationFixtures = {
  small: {
    amount: 25,
    name: 'TEST - Festival Support',
    isTestItem: true,
    metadata: {
      testMode: true,
      donationType: 'small'
    }
  },

  medium: {
    amount: 50,
    name: 'TEST - Festival Support',
    isTestItem: true,
    metadata: {
      testMode: true,
      donationType: 'medium'
    }
  },

  large: {
    amount: 100,
    name: 'TEST - Festival Support',
    isTestItem: true,
    metadata: {
      testMode: true,
      donationType: 'large'
    }
  },

  custom: {
    amount: 75,
    name: 'TEST - Custom Donation',
    isTestItem: true,
    metadata: {
      testMode: true,
      donationType: 'custom'
    }
  }
};

/**
 * Sample test transactions
 */
export const testTransactionFixtures = {
  singleTicket: {
    transactionId: 'TEST-TRANS-SINGLE',
    type: 'purchase',
    status: 'completed',
    amountCents: 5000,
    currency: 'USD',
    customerEmail: 'single@test.com',
    customerName: 'Single Test User',
    isTest: true,
    items: [
      {
        itemType: 'ticket',
        itemName: 'General Admission',
        quantity: 1,
        unitPriceCents: 5000,
        totalPriceCents: 5000,
        isTest: true
      }
    ]
  },

  multipleTickets: {
    transactionId: 'TEST-TRANS-MULTIPLE',
    type: 'purchase',
    status: 'completed',
    amountCents: 15000,
    currency: 'USD',
    customerEmail: 'multiple@test.com',
    customerName: 'Multiple Test User',
    isTest: true,
    items: [
      {
        itemType: 'ticket',
        itemName: 'General Admission',
        quantity: 2,
        unitPriceCents: 5000,
        totalPriceCents: 10000,
        isTest: true
      },
      {
        itemType: 'ticket',
        itemName: 'VIP Access',
        quantity: 1,
        unitPriceCents: 10000,
        totalPriceCents: 10000,
        isTest: true
      }
    ]
  },

  withDonation: {
    transactionId: 'TEST-TRANS-DONATION',
    type: 'purchase',
    status: 'completed',
    amountCents: 7500,
    currency: 'USD',
    customerEmail: 'donation@test.com',
    customerName: 'Donation Test User',
    isTest: true,
    items: [
      {
        itemType: 'ticket',
        itemName: 'General Admission',
        quantity: 1,
        unitPriceCents: 5000,
        totalPriceCents: 5000,
        isTest: true
      },
      {
        itemType: 'donation',
        itemName: 'Festival Support',
        quantity: 1,
        unitPriceCents: 2500,
        totalPriceCents: 2500,
        isTest: true
      }
    ]
  },

  pending: {
    transactionId: 'TEST-TRANS-PENDING',
    type: 'purchase',
    status: 'pending',
    amountCents: 5000,
    currency: 'USD',
    customerEmail: 'pending@test.com',
    customerName: 'Pending Test User',
    isTest: true,
    items: [
      {
        itemType: 'ticket',
        itemName: 'General Admission',
        quantity: 1,
        unitPriceCents: 5000,
        totalPriceCents: 5000,
        isTest: true
      }
    ]
  },

  failed: {
    transactionId: 'TEST-TRANS-FAILED',
    type: 'purchase',
    status: 'failed',
    amountCents: 5000,
    currency: 'USD',
    customerEmail: 'failed@test.com',
    customerName: 'Failed Test User',
    isTest: true,
    items: [
      {
        itemType: 'ticket',
        itemName: 'General Admission',
        quantity: 1,
        unitPriceCents: 5000,
        totalPriceCents: 5000,
        isTest: true
      }
    ]
  }
};

/**
 * Sample test customers
 */
export const testCustomerFixtures = {
  basic: {
    email: 'basic@test.com',
    firstName: 'Basic',
    lastName: 'Test',
    phone: '+1234567890',
    attributes: {
      source: 'test_suite',
      customer_type: 'test'
    }
  },

  premium: {
    email: 'premium@test.com',
    firstName: 'Premium',
    lastName: 'Test',
    phone: '+1234567891',
    attributes: {
      source: 'test_suite',
      customer_type: 'test',
      tier: 'premium'
    }
  },

  international: {
    email: 'international@test.com',
    firstName: 'International',
    lastName: 'Test',
    phone: '+44123456789',
    attributes: {
      source: 'test_suite',
      customer_type: 'test',
      country: 'UK'
    }
  }
};

/**
 * Sample test QR tokens and validation scenarios
 */
export const testQRFixtures = {
  valid: {
    token: 'TEST-QR-VALID-12345',
    payload: {
      ticketId: 'TEST-TICKET-12345',
      eventId: 1,
      isTest: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
    }
  },

  expired: {
    token: 'TEST-QR-EXPIRED-12345',
    payload: {
      ticketId: 'TEST-TICKET-EXPIRED-12345',
      eventId: 1,
      isTest: true,
      iat: Math.floor(Date.now() / 1000) - 172800, // 2 days ago
      exp: Math.floor(Date.now() / 1000) - 86400   // 1 day ago (expired)
    }
  },

  invalidFormat: {
    token: 'INVALID-FORMAT-12345',
    payload: null
  },

  wrongEvent: {
    token: 'TEST-QR-WRONG-EVENT-12345',
    payload: {
      ticketId: 'TEST-TICKET-WRONG-EVENT-12345',
      eventId: 999, // Non-existent event
      isTest: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400
    }
  }
};

/**
 * Sample test cleanup scenarios
 */
export const testCleanupFixtures = {
  scheduled: {
    cleanupId: 'CLEANUP-SCHEDULED-001',
    operationType: 'scheduled_cleanup',
    initiatedBy: 'system',
    cleanupCriteria: {
      test_mode: true,
      created_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      status: ['completed', 'failed', 'cancelled']
    },
    expectedRecords: 50,
    priority: 'scheduled'
  },

  manual: {
    cleanupId: 'CLEANUP-MANUAL-001',
    operationType: 'manual_cleanup',
    initiatedBy: 'admin@test.com',
    cleanupCriteria: {
      test_mode: true,
      transaction_ids: ['TEST-TRANS-1', 'TEST-TRANS-2', 'TEST-TRANS-3']
    },
    expectedRecords: 3,
    priority: 'initial'
  },

  emergency: {
    cleanupId: 'CLEANUP-EMERGENCY-001',
    operationType: 'emergency_cleanup',
    initiatedBy: 'system',
    cleanupCriteria: {
      test_mode: true,
      created_before: new Date().toISOString(),
      reason: 'test_environment_reset'
    },
    expectedRecords: 1000,
    priority: 'initial'
  }
};

/**
 * Sample test email scenarios
 */
export const testEmailFixtures = {
  newsletter: {
    email: 'newsletter@test.com',
    firstName: 'Newsletter',
    lastName: 'Test',
    listIds: [1],
    attributes: {
      source: 'test_suite',
      subscription_type: 'newsletter'
    },
    testMode: true
  },

  ticketConfirmation: {
    to: 'confirmation@test.com',
    templateId: 1,
    params: {
      ticketId: 'TEST-TICKET-12345',
      customerName: 'Test Customer',
      eventName: 'A Lo Cubano Boulder Fest 2026',
      eventDate: '2026-05-15',
      qrCode: 'TEST-QR-12345'
    },
    testMode: true
  },

  registration: {
    to: 'registration@test.com',
    templateId: 2,
    params: {
      firstName: 'Registration',
      lastName: 'Test',
      ticketId: 'TEST-TICKET-REG-12345',
      registrationLink: 'https://test.example.com/register/token123'
    },
    testMode: true
  }
};

/**
 * Test mode configuration scenarios
 */
export const testModeConfigFixtures = {
  urlParameter: {
    url: 'https://test.example.com?test_mode=true',
    expected: true
  },

  localStorage: {
    storageItems: {
      cart_test_mode: 'true'
    },
    expected: true
  },

  adminSession: {
    storageItems: {
      admin_test_session: 'true'
    },
    expected: true
  },

  mixed: {
    url: 'https://test.example.com?test_mode=false',
    storageItems: {
      cart_test_mode: 'true'
    },
    expected: true // URL parameter takes precedence
  }
};

/**
 * Performance test fixtures
 */
export const performanceTestFixtures = {
  bulkTickets: {
    count: 100,
    template: {
      ticketType: 'general',
      name: 'Bulk Test Ticket',
      price: 50,
      eventId: 1,
      isTestItem: true
    }
  },

  bulkTransactions: {
    count: 50,
    template: {
      type: 'purchase',
      status: 'completed',
      amountCents: 5000,
      currency: 'USD',
      isTest: true
    }
  },

  complexQueries: [
    {
      name: 'test_data_aggregation',
      query: `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as ticket_count,
          SUM(price_cents) as total_value,
          AVG(price_cents) as avg_value
        FROM tickets
        WHERE is_test = 1
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `
    },
    {
      name: 'test_transaction_summary',
      query: `
        SELECT
          t.status,
          COUNT(*) as count,
          SUM(t.amount_cents) as total_amount,
          COUNT(tk.id) as ticket_count
        FROM transactions t
        LEFT JOIN tickets tk ON tk.transaction_id = t.id AND tk.is_test = 1
        WHERE t.is_test = 1
        GROUP BY t.status
      `
    }
  ]
};

/**
 * Utility function to create a complete test scenario
 */
export function createTestScenario(scenarioName) {
  const scenarios = {
    simple_purchase: {
      transaction: testTransactionFixtures.singleTicket,
      customer: testCustomerFixtures.basic,
      tickets: [testTicketFixtures.general],
      donations: []
    },

    complex_purchase: {
      transaction: testTransactionFixtures.multipleTickets,
      customer: testCustomerFixtures.premium,
      tickets: [testTicketFixtures.general, testTicketFixtures.vip],
      donations: [testDonationFixtures.medium]
    },

    international_purchase: {
      transaction: {
        ...testTransactionFixtures.singleTicket,
        customerEmail: testCustomerFixtures.international.email,
        customerName: `${testCustomerFixtures.international.firstName} ${testCustomerFixtures.international.lastName}`
      },
      customer: testCustomerFixtures.international,
      tickets: [testTicketFixtures.general],
      donations: []
    },

    failed_purchase: {
      transaction: testTransactionFixtures.failed,
      customer: testCustomerFixtures.basic,
      tickets: [],
      donations: []
    }
  };

  return scenarios[scenarioName] || null;
}

/**
 * Generate test data with realistic variations
 */
export function generateTestData(type, count = 1, variations = {}) {
  const data = [];

  for (let i = 0; i < count; i++) {
    let baseData;

    switch (type) {
      case 'ticket':
        baseData = { ...testTicketFixtures.general };
        break;
      case 'transaction':
        baseData = { ...testTransactionFixtures.singleTicket };
        break;
      case 'customer':
        baseData = { ...testCustomerFixtures.basic };
        break;
      default:
        throw new Error(`Unknown test data type: ${type}`);
    }

    // Apply variations
    const item = {
      ...baseData,
      ...variations,
      id: `${type.toUpperCase()}-${Date.now()}-${i}`,
      createdAt: new Date(Date.now() - Math.random() * 86400000).toISOString() // Random time within last 24 hours
    };

    data.push(item);
  }

  return count === 1 ? data[0] : data;
}

/**
 * Validate test data structure
 */
export function validateTestData(data, type) {
  const requiredFields = {
    ticket: ['ticketType', 'name', 'price', 'isTestItem'],
    transaction: ['transactionId', 'type', 'status', 'amountCents', 'isTest'],
    customer: ['email', 'firstName', 'lastName'],
    donation: ['amount', 'name', 'isTestItem']
  };

  const required = requiredFields[type];
  if (!required) {
    throw new Error(`Unknown validation type: ${type}`);
  }

  const missing = required.filter(field => !(field in data));
  if (missing.length > 0) {
    throw new Error(`Missing required fields for ${type}: ${missing.join(', ')}`);
  }

  return true;
}