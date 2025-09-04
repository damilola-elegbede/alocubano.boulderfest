/**
 * Test Isolation Helpers
 * 
 * Provides utilities for isolating tests and managing test data.
 */

// Generate unique test email addresses
export const generateTestEmail = (prefix = 'test', suffix = null) => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const fullPrefix = suffix ? `${prefix}-${suffix}` : prefix;
  return `${fullPrefix}-${randomId}-${timestamp}@e2etest.example.com`;
};

// Generate unique test identifiers
export const generateTestId = (prefix = 'test') => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${randomId}-${timestamp}`;
};

// Create isolated test data
export const createTestData = (type = 'user') => {
  const baseData = {
    id: generateTestId(type),
    timestamp: Date.now()
  };

  switch (type) {
    case 'user':
      return {
        ...baseData,
        firstName: 'Test',
        lastName: 'User',
        email: generateTestEmail('user'),
        phone: '+1234567890'
      };
      
    case 'admin':
      return {
        ...baseData,
        username: 'admin',
        password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password',
        email: generateTestEmail('admin')
      };
      
    case 'ticket':
      return {
        ...baseData,
        type: 'weekend-pass',
        quantity: 1,
        price: 85.00,
        purchaseId: generateTestId('purchase')
      };
      
    default:
      return baseData;
  }
};

// Clean up test data (placeholder for future implementation)
export const cleanupTestData = async (testData) => {
  console.log(`🧹 Cleaning up test data: ${testData.id}`);
  // Add cleanup logic here when needed
};

// Generate payment test data
export const generatePaymentData = (type = 'card') => {
  const testId = generateTestId('payment');
  
  switch (type) {
    case 'card':
      return {
        id: testId,
        type: 'card',
        // Test card numbers from Stripe documentation
        number: '4242424242424242',
        exp_month: 12,
        exp_year: new Date().getFullYear() + 1,
        cvc: '123',
        amount: 8500, // $85.00 in cents
        currency: 'usd'
      };
      
    default:
      return {
        id: testId,
        type,
        amount: 8500,
        currency: 'usd'
      };
  }
};

// Generate registration test data  
export const generateRegistrationData = (ticketType = 'weekend-pass') => {
  const testId = generateTestId('registration');
  const email = generateTestEmail('registration');
  
  return {
    id: testId,
    ticketType,
    firstName: 'Test',
    lastName: 'Attendee', 
    email,
    phone: '+1234567890',
    emergencyContact: {
      name: 'Emergency Contact',
      phone: '+1987654321',
      relationship: 'Friend'
    },
    dietaryRestrictions: '',
    accessibilityNeeds: '',
    workshopPreferences: ['Salsa Basics', 'Bachata Fundamentals'],
    timestamp: Date.now()
  };
};

// Cleanup test isolation (placeholder)
export const cleanupTestIsolation = async () => {
  console.log('🧹 Cleaning up test isolation');
  // Add any cleanup logic here
  return { cleaned: 0 };
};

// Get test namespace for isolation
export const getTestNamespace = (testName = 'default') => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `test_${testName}_${randomId}_${timestamp}`;
};

// Wait for a specified amount of time (useful for test stability)
export const waitForStability = (ms = 1000) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Wait for a specified amount of time (alias for backward compatibility)
export const waitMs = (ms = 1000) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
// Generate test ticket ID 
export const generateTestTicketId = (prefix = 'ticket') => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${randomId}-${timestamp}`;
};

// Initialize test isolation system
export const initializeTestIsolation = async () => {
  console.log('🚀 Initializing test isolation system...');
  
  // Set up test environment isolation
  const sessionId = generateTestId('session');
  process.env.E2E_SESSION_ID = sessionId;
  
  console.log(`   🆔 Test session ID: ${sessionId}`);
  console.log('   ✅ Test isolation system initialized');
  
  return {
    initialized: true,
    sessionId,
    timestamp: Date.now()
  };
};

// Generate test user - alias for createTestData('user')
export const generateTestUser = (testTitle = 'user') => {
  return createTestData('user');
};

// Transaction wrapper for test operations
export const withTestTransaction = async (testTitle, callback) => {
  // Support both old and new signatures
  if (typeof testTitle === 'function') {
    // Old signature: withTestTransaction(callback)
    callback = testTitle;
    testTitle = 'default';
  }
  
  const namespace = getTestNamespace(testTitle);
  console.log(`🔄 Starting test transaction for '${testTitle}' with namespace: ${namespace}`);
  
  try {
    const result = await callback(namespace);
    console.log(`✅ Transaction for '${testTitle}' completed successfully`);
    return result;
  } catch (error) {
    console.log(`❌ Transaction for '${testTitle}' failed: ${error.message}`);
    throw error;
  } finally {
    console.log(`🏁 Transaction for '${testTitle}' finalized`);
  }
};

export default {
  generateTestEmail,
  generateTestId,
  createTestData,
  cleanupTestData,
  generatePaymentData,
  generateRegistrationData,
  cleanupTestIsolation,
  getTestNamespace,
  waitForStability,
  waitMs,
  generateTestTicketId,
  initializeTestIsolation,
  generateTestUser,
  withTestTransaction
};
